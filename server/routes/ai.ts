import { Router } from "express";
import { z } from "zod";
import { filterEligibleApprovedClaims } from "../eligibleClaims.js";
import {
  asyncRoute,
  db,
  fail,
  requireTeacher,
  type AppConfig,
} from "../context.js";
import { lockSession, SessionConflict } from "../sessionLock.js";
import { createOnce, lookupReplay } from "../idempotency.js";
import { appendOutboxEvent, triggerOutboxPublish } from "../realtime.js";
import { resolveCurrentSourceVersion } from "./review.js";
import {
  getAIAdapter,
  getCircuitStatus,
  sanitizeContext,
  isAIEnabled,
} from "../ai/index.js";
import {
  AIRequestInput,
  AIStatusUpdate,
  AIClaimsDraftInput,
  AIClaimsDraftResponse,
  AIPlanSources,
} from "../../contracts/ai.js";

const safeId = z.string().uuid();

// In-flight request coordinator to serialize duplicate concurrent calls with identical Idempotency-Key
const inFlightRequests = new Map<string, Promise<void>>();

function createInFlightBarrier(lockKey: string): { release: () => void } {
  let releaseBarrier!: () => void;
  const promise = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  inFlightRequests.set(lockKey, promise);
  return {
    release: () => {
      if (inFlightRequests.get(lockKey) === promise) inFlightRequests.delete(lockKey);
      releaseBarrier();
    },
  };
}

async function readDraftReceipt(id: string) {
  if (!safeId.safeParse(id).success) {
    throw new SessionConflict("VERSION_CONFLICT", "Biên nhận AI cũ cần được xem lại trong phần tổng kết");
  }
  const item = await db.aIRequest.findUniqueOrThrow({ where: { id } });
  if (item.kind !== "claim_draft") throw new Error("Invalid AI draft receipt");
  return AIClaimsDraftResponse.parse(JSON.parse(item.responseText));
}

const planSources = AIPlanSources;
async function readPlanReceipt(id: string) {
  const item = await db.aIRequest.findUniqueOrThrow({ where: { id } });
  const sources = planSources.safeParse(item.sourceClaimRefs);
  if (item.kind !== "plan_suggestion" || !sources.success) {
    throw new SessionConflict("VERSION_CONFLICT", "Gợi ý kế hoạch cũ thiếu nguồn xác thực; hãy tạo yêu cầu mới");
  }
  return { suggestion: { id: item.id, text: item.responseText, status: item.status, provider: item.provider, model: item.model, sources: sources.data } };
}

const formatSuggestion = (item: any) => ({
  id: item.id,
  sessionId: item.sessionId,
  studentId: item.studentId,
  activityId: item.activityId,
  kind: item.kind,
  prompt: item.prompt,
  responseText: item.responseText,
  editedText: item.editedText,
  evidenceId: item.evidenceId,
  provider: item.provider,
  model: item.model,
  modelVersion: item.modelVersion,
  status: item.status,
  actorId: item.actorId,
  createdAt: item.createdAt.toISOString(),
});

export function aiRouter(config: AppConfig) {
  const r = Router();
  r.use(requireTeacher(config));

  // 1. In-Session Pedagogical Teaching Assistance (POST /sessions/:id/ai/suggestions - AI 001, AI 006, AI 007)
  r.post(
    "/sessions/:id/ai/suggestions",
    asyncRoute(async (req, res) => {
      if (!isAIEnabled()) {
        return fail(res, 503, "AI_UNAVAILABLE", "AI chưa được bật");
      }
      const adapter = getAIAdapter();
      if (!adapter || ((config.mode === "production" || config.mode === "staging") && adapter.getCircuitStatus().provider === "mock")) {
        return fail(res, 503, "AI_UNAVAILABLE", "Dịch vụ AI không khả dụng trong môi trường hiện tại");
      }

      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID buổi học không hợp lệ");

      const parsed = AIRequestInput.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Dữ liệu yêu cầu gợi ý không hợp lệ");

      const session = await db.session.findUnique({
        where: { id: req.params.id },
      });
      if (!session)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy buổi học");
      if (session.teacherId !== res.locals.actor.id)
        return fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập buổi học");
      if (!["draft", "scheduled", "live"].includes(session.status))
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Chỉ có thể yêu cầu gợi ý trong buổi học đang diễn ra hoặc chuẩn bị",
        );

      const member = await db.roomMember.findUnique({
        where: {
          sessionId_studentId: {
            sessionId: session.id,
            studentId: parsed.data.studentId,
          },
        },
        include: { studentIdRef: true },
      });
      if (!member)
        return fail(res, 403, "PERMISSION_DENIED", "Học sinh không thuộc buổi học");
      if (!member.consent)
        return fail(
          res,
          403,
          "PERMISSION_DENIED",
          "Học sinh chưa có sự đồng ý (consent) để sử dụng hỗ trợ AI",
        );

      const activity = await db.activity.findFirst({
        where: {
          id: parsed.data.activityId,
          sessionId: session.id,
        },
      });
      if (!activity)
        return fail(res, 400, "VALIDATION_ERROR", "Hoạt động không thuộc buổi học này");

      const routeKey = `/sessions/${session.id}/ai/suggestions`;

      // Preflight replay check: avoid calling provider if key already processed
      const prior = await lookupReplay(req, res, routeKey);
      if (prior === null) return;
      if (prior) {
        const existing = await db.aIRequest.findUniqueOrThrow({
          where: { id: prior.resourceId },
        });
        return res.status(200).json({
          suggestion: formatSuggestion(existing),
        });
      }

      const idempotencyKey = req.get("Idempotency-Key") || "";
      const lockKey = `${res.locals.actor.id}:${routeKey}:${idempotencyKey}`;

      if (idempotencyKey) {
        while (inFlightRequests.has(lockKey)) {
          const inFlight = inFlightRequests.get(lockKey);
          if (inFlight) {
            // Concurrent request in flight: await settlement and return cached replay
            await inFlight.catch(() => {});
            const postReplay = await lookupReplay(req, res, routeKey);
            if (postReplay === null) return;
            if (postReplay) {
              const existing = await db.aIRequest.findUniqueOrThrow({
                where: { id: postReplay.resourceId },
              });
              return res.status(200).json({
                suggestion: formatSuggestion(existing),
              });
            }
          }
        }
      }
      // Check adapter circuit breaker
      const circuit = getCircuitStatus();
      if (circuit.circuitOpen) {
        return fail(
          res,
          503,
          "AI_UNAVAILABLE",
          "Dịch vụ AI tạm gián đoạn do lỗi liên tiếp; vui lòng thử lại sau giây lát hoặc soạn thủ công",
        );
      }

      const barrier = idempotencyKey ? createInFlightBarrier(lockKey) : null;
      try {
        const replay = await lookupReplay(req, res, routeKey);
        if (replay === null) return;
        if (replay) {
          const item = await db.aIRequest.findUniqueOrThrow({ where: { id: replay.resourceId } });
          return res.status(200).json({ suggestion: formatSuggestion(item) });
        }
        // Query ALL student personal names in workspace for context anonymization (target + all peers)
        const allStudents = await db.student.findMany({
          where: { teacherId: res.locals.actor.id },
          select: { name: true },
        });
        const studentNames = allStudents.map((s) => s.name.trim()).filter((n) => n.length > 1);

        // Minimized prior approved claims using reused G1 eligibility and consent rules
        const rawClaims = await db.claim.findMany({
          where: {
            studentId: parsed.data.studentId,
            status: "approved",
            sessionIdRef: {
              teacherId: res.locals.actor.id,
              RoomMember_sessionId_items: {
                some: { studentId: parsed.data.studentId, consent: true },
              },
            },
          },
          orderBy: { reviewedAt: "desc" },
          select: {
            id: true,
            revision: true,
            text: true,
            evidenceIds: true,
            sessionId: true,
            studentId: true,
            status: true,
          },
        });
        const eligiblePrior = (await filterEligibleApprovedClaims(rawClaims, res.locals.actor.id)).slice(0, 3);

        // Sanitize every field at provider boundary
        const cleanPrompt = sanitizeContext(parsed.data.prompt, studentNames);
        const cleanActivityTitle = sanitizeContext(activity.title, studentNames);
        const cleanActivityDesc = sanitizeContext(activity.description || "", studentNames);
        const cleanSubject = sanitizeContext(member.studentIdRef.subject || "", studentNames);
        const cleanGrade = sanitizeContext(member.studentIdRef.grade || "", studentNames);
        const cleanGoal = sanitizeContext(member.studentIdRef.goal || "", studentNames);
        const cleanPriorClaims = eligiblePrior.map((c) => sanitizeContext(c.text, studentNames));

        // Dispatch to AI adapter OUTSIDE transaction lock (never hold lock while awaiting model)
        let aiResult;
        try {
          aiResult = await adapter.generateTeachingSuggestion({
            mode: parsed.data.kind,
            prompt: cleanPrompt,
            student: {
              id: member.studentId,
              subject: cleanSubject,
              grade: cleanGrade,
              goal: cleanGoal,
            },
            activity: {
              id: activity.id,
              title: cleanActivityTitle,
              description: cleanActivityDesc,
              type: activity.type,
            },
            priorApprovedClaims: cleanPriorClaims,
            studentNames,
          });
        } catch (err: unknown) {
          const errorMsg =
            err instanceof Error ? err.message : "Dịch vụ AI không khả dụng";
          return fail(
            res,
            503,
            "AI_UNAVAILABLE",
            errorMsg.startsWith("AI_")
              ? errorMsg
              : "Dịch vụ AI tạm không khả dụng; giáo viên có thể tiếp tục ghi chú thủ công",
          );
        }

        // Revalidate and persist UNDER SESSION LOCK
        const result = await createOnce(req, res, routeKey, async (tx) => {
          for (const id of [...new Set([session.id, ...eligiblePrior.map(claim => claim.sessionId)])].sort()) await lockSession(tx, id);

          const currentSession = await tx.session.findUniqueOrThrow({
            where: { id: session.id },
          });
          if (!["draft", "scheduled", "live"].includes(currentSession.status))
            throw new SessionConflict("SESSION_STATE_INVALID", "Trạng thái buổi học đã thay đổi");

          const currentMember = await tx.roomMember.findUnique({
            where: {
              sessionId_studentId: {
                sessionId: session.id,
                studentId: parsed.data.studentId,
              },
            },
          });
          if (!currentMember || !currentMember.consent)
            throw new SessionConflict("PERMISSION_DENIED", "Học sinh không còn quyền hoặc thiếu consent");

          if (eligiblePrior.length) {
            const currentClaims = await tx.claim.findMany({ where: { id: { in: eligiblePrior.map(claim => claim.id) } } });
            const stillEligible = await filterEligibleApprovedClaims(currentClaims, res.locals.actor.id, tx);
            if (eligiblePrior.some(claim => !stillEligible.some(current => current.id === claim.id && current.revision === claim.revision))) {
              throw new SessionConflict("VERSION_CONFLICT", "Lịch sử dùng làm ngữ cảnh đã thay đổi trong khi chờ AI");
            }
            const consent = await tx.roomMember.findMany({ where: { sessionId: { in: eligiblePrior.map(claim => claim.sessionId) }, studentId: parsed.data.studentId, consent: true } });
            if (eligiblePrior.some(claim => !consent.some(member => member.sessionId === claim.sessionId))) {
              throw new SessionConflict("PERMISSION_DENIED", "Lịch sử học sinh không còn được đồng ý sử dụng");
            }
          }

          // Persist actual pedagogical kind and full sanitized instruction snapshot for audit
          const created = await tx.aIRequest.create({
            data: {
              sessionId: session.id,
              studentId: parsed.data.studentId,
              activityId: activity.id,
              kind: parsed.data.kind,
              prompt: aiResult.promptUsed,
              promptVersion: aiResult.promptVersion,
              responseText: aiResult.text,
              contextSummary: aiResult.contextSummary,
              provider: aiResult.provider,
              model: aiResult.model,
              modelVersion: aiResult.modelVersion,
              status: "ready",
              actorId: res.locals.actor.id,
            },
          });

          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "ai.suggestion_requested",
              targetType: "ai_request",
              targetId: created.id,
              sessionId: session.id,
              requestId: res.locals.requestId,
              metadata: {
                mode: parsed.data.kind,
                activityId: activity.id,
                studentId: parsed.data.studentId,
                provider: aiResult.provider,
                model: aiResult.model,
              },
            },
          });

          return created.id;
        });

        if (!result) return;
        const item = await db.aIRequest.findUniqueOrThrow({
          where: { id: result.resourceId },
        });

        return res.status(201).json({
          suggestion: formatSuggestion(item),
        });
      } finally {
        barrier?.release();
      }
    }),
  );

  // 2. Suggestion Lifecycle Transition & Optional Evidence Creation (PATCH /ai-requests/:id - AI 002, AI 003)
  r.patch(
    "/ai-requests/:id",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID gợi ý không hợp lệ");

      const parsed = AIStatusUpdate.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Dữ liệu cập nhật gợi ý không hợp lệ");

      const item = await db.aIRequest.findFirst({
        where: {
          id: req.params.id,
          sessionIdRef: { teacherId: res.locals.actor.id },
        },
      });
      if (!item)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy gợi ý AI");
      if (item.kind === "claim_draft")
        return fail(res, 400, "VALIDATION_ERROR", "Nhận định dự thảo cần được xử lý trong phần duyệt nhận định");

      const editedText = parsed.data.editedText?.trim() || null;
      const saveAsEvidence = parsed.data.saveAsEvidence === true && parsed.data.status === "used";

      const updated = await db.$transaction(async (tx) => {
        await lockSession(tx, item.sessionId);

        const freshItem = await tx.aIRequest.findUniqueOrThrow({
          where: { id: item.id },
        });
        if (freshItem.status !== "ready") {
          if (freshItem.status === parsed.data.status && freshItem.editedText === editedText && Boolean(freshItem.evidenceId) === saveAsEvidence) {
            const existingEvidence = freshItem.evidenceId ? await tx.evidence.findUnique({ where: { id: freshItem.evidenceId } }) : null;
            return { next: freshItem, createdEvidence: existingEvidence, sessionId: freshItem.sessionId };
          }
          throw new SessionConflict("VERSION_CONFLICT", "Gợi ý đã được xử lý bởi thao tác khác");
        }

        const currentSession = await tx.session.findUniqueOrThrow({
          where: { id: freshItem.sessionId },
        });

        let evidenceId: string | null = null;
        let createdEvidence: unknown = null;

        // AI 003: Save used suggestion as Evidence of kind GoiYGiangDay with isObservation: false
        if (saveAsEvidence) {
          // If session was reviewed, adding new evidence requires reopening to ended
          if (currentSession.status === "reviewed") {
            const reopened = await tx.session.update({
              where: { id: currentSession.id },
              data: { status: "ended", version: { increment: 1 } },
            });
            await appendOutboxEvent(tx, {
              sessionId: currentSession.id,
              type: "review.reopened",
              label: "Mở lại duyệt do thêm minh chứng gợi ý giảng dạy từ AI",
              actorId: res.locals.actor.id,
              visibility: { scope: "teacher" },
              resourceId: currentSession.id,
              version: reopened.version,
            });
            await tx.auditLog.create({
              data: {
                workspaceId: res.locals.actor.workspaceId,
                actorId: res.locals.actor.id,
                actorRole: "teacher",
                action: "review.reopened",
                targetType: "session",
                targetId: currentSession.id,
                sessionId: currentSession.id,
                requestId: res.locals.requestId,
                metadata: {
                  previousStatus: "reviewed",
                  nextStatus: "ended",
                  reasonCode: "evidence_created_from_ai",
                },
              },
            });
          }

          const detail = editedText || freshItem.responseText;
          const ev = await tx.evidence.create({
            data: {
              sessionId: freshItem.sessionId,
              studentId: freshItem.studentId,
              activityId: freshItem.activityId,
              kind: "GoiYGiangDay",
              title: `Gợi ý giảng dạy (${freshItem.promptVersion || "AI"})`,
              detail: detail.slice(0, 4000),
              support: "ChuaRo",
              sourceType: "ai_suggestion",
              sourceId: freshItem.id,
              sourceVersion: 1,
              isObservation: false, // CRITICAL: AI teaching aid is not a student competence observation
              isAuto: false,
              status: "active",
              version: 1,
              createdBy: res.locals.actor.id,
            },
          });
          evidenceId = ev.id;
          createdEvidence = ev;

          await appendOutboxEvent(tx, {
            sessionId: freshItem.sessionId,
            type: "evidence.created",
            label: "Gợi ý giảng dạy đã lưu làm minh chứng",
            actorId: res.locals.actor.id,
            visibility: { scope: "teacher" },
            resourceId: ev.id,
          });

          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "evidence.created_from_ai",
              targetType: "evidence",
              targetId: ev.id,
              sessionId: freshItem.sessionId,
              requestId: res.locals.requestId,
              metadata: {
                aiRequestId: freshItem.id,
                kind: "GoiYGiangDay",
                isObservation: false,
                model: freshItem.model,
                modelVersion: freshItem.modelVersion,
              },
            },
          });
        }

        const next = await tx.aIRequest.update({
          where: { id: freshItem.id },
          data: {
            status: parsed.data.status,
            editedText,
            evidenceId,
          },
        });

        await tx.auditLog.create({
          data: {
            workspaceId: res.locals.actor.workspaceId,
            actorId: res.locals.actor.id,
            actorRole: "teacher",
            action: "ai.status_updated",
            targetType: "ai_request",
            targetId: freshItem.id,
            sessionId: freshItem.sessionId,
            requestId: res.locals.requestId,
            metadata: {
              previousStatus: "ready",
              nextStatus: parsed.data.status,
              edited: Boolean(editedText),
              saveAsEvidence,
              evidenceId,
            },
          },
        });

        return { next, createdEvidence, sessionId: freshItem.sessionId };
      });

      triggerOutboxPublish(updated.sessionId);

      return res.json({
        id: updated.next.id,
        status: updated.next.status,
        editedText: updated.next.editedText,
        evidenceId: updated.next.evidenceId,
        evidence: updated.createdEvidence,
      });
    }),
  );

  // 3. Post-Session Sourced Pending Claims Generation (POST /sessions/:id/ai/claims-draft - AI 004)
  r.post(
    "/sessions/:id/ai/claims-draft",
    asyncRoute(async (req, res) => {
      if (!isAIEnabled()) {
        return fail(res, 503, "AI_UNAVAILABLE", "AI chưa được bật");
      }
      const adapter = getAIAdapter();
      if (!adapter || ((config.mode === "production" || config.mode === "staging") && adapter.getCircuitStatus().provider === "mock")) {
        return fail(res, 503, "AI_UNAVAILABLE", "Dịch vụ AI không khả dụng trong môi trường hiện tại");
      }

      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID buổi học không hợp lệ");

      const session = await db.session.findUnique({
        where: { id: req.params.id },
      });
      if (!session)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy buổi học");
      if (session.teacherId !== res.locals.actor.id)
        return fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập buổi học");
      if (!["ended", "reviewed"].includes(session.status))
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Chỉ có thể dự thảo nhận định sau khi buổi học đã kết thúc",
        );

      const parsed = AIClaimsDraftInput.safeParse(req.body ?? {});
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Dữ liệu yêu cầu dự thảo không hợp lệ");

      const targetStudentId = parsed.data.studentId ?? session.primaryStudentId;

      const member = await db.roomMember.findUnique({
        where: {
          sessionId_studentId: {
            sessionId: session.id,
            studentId: targetStudentId,
          },
        },
        include: { studentIdRef: true },
      });
      if (!member)
        return fail(res, 403, "PERMISSION_DENIED", "Học sinh không thuộc buổi học");
      if (!member.consent)
        return fail(res, 403, "PERMISSION_DENIED", "Học sinh chưa có sự đồng ý (consent) để sử dụng AI");

      const routeKey = `/sessions/${session.id}/ai/claims-draft`;

      // Preflight replay check
      const prior = await lookupReplay(req, res, routeKey);
      if (prior === null) return;
      if (prior) {
        return res.status(200).json(await readDraftReceipt(prior.resourceId));
      }

      // Check circuit
      const circuit = getCircuitStatus();
      if (circuit.circuitOpen) {
        return fail(
          res,
          503,
          "AI_UNAVAILABLE",
          "Dịch vụ AI tạm gián đoạn; vui lòng tạo nhận định thủ công từ minh chứng",
        );
      }

      // Gather active observation evidences for the student (excluding teaching aids and AI suggestions)
      const rawObservations = await db.evidence.findMany({
        where: {
          sessionId: session.id,
          studentId: targetStudentId,
          status: "active",
          isObservation: true,
          kind: { not: "GoiYGiangDay" },
          sourceType: { not: "ai_suggestion" },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
      });

      // Filter out stale observations using current G2 source version resolution
      const nonStaleObservations: typeof rawObservations = [];
      for (const obs of rawObservations) {
        const curVer = await resolveCurrentSourceVersion(
          obs.sourceType,
          obs.sourceId,
          session.id,
          db,
          targetStudentId,
        );
        const expected = obs.sourceVersion ?? (obs.sourceType === "note" ? 1 : 0);
        if (expected < 1 || curVer !== expected) {
          // Stale observation, ignore
          continue;
        }
        nonStaleObservations.push(obs);
      }

      // 0-observation guard (SRS AI 004: if no source observations, do NOT fabricate competence claims)
      if (nonStaleObservations.length === 0) {
        return res.status(200).json({
          claims: [],
          summary: "Chưa có minh chứng quan sát thực tế để tạo nhận định năng lực",
        });
      }

      // Snapshot pre-SDK observation versions for race detection
      const preSnapshotObsMap = new Map(
        nonStaleObservations.map((o) => [
          o.id,
          {
            id: o.id,
            version: o.version,
            sourceVersion: o.sourceVersion,
            sourceType: o.sourceType,
            sourceId: o.sourceId,
            currentSourceVersion: o.sourceVersion ?? 1,
          },
        ]),
      );

      const idempotencyKey = req.get("Idempotency-Key") || "";
      const lockKey = `${res.locals.actor.id}:${routeKey}:${idempotencyKey}`;

      if (idempotencyKey) {
        while (inFlightRequests.has(lockKey)) {
          const inFlight = inFlightRequests.get(lockKey);
          if (inFlight) {
            await inFlight.catch(() => {});
            const postReplay = await lookupReplay(req, res, routeKey);
            if (postReplay === null) return;
            if (postReplay) {
              return res.status(200).json(await readDraftReceipt(postReplay.resourceId));
            }
          }
        }
      }
      const barrier = idempotencyKey ? createInFlightBarrier(lockKey) : null;
      try {
        const replay = await lookupReplay(req, res, routeKey);
        if (replay === null) return;
        if (replay) return res.status(200).json(await readDraftReceipt(replay.resourceId));
        // Query all student names in workspace for comprehensive context minimization
        const allStudents = await db.student.findMany({
          where: { teacherId: res.locals.actor.id },
          select: { name: true },
        });
        const studentNames = allStudents.map((s) => s.name.trim()).filter((n) => n.length > 1);

        const cleanSubject = sanitizeContext(member.studentIdRef.subject || "", studentNames);
        const cleanGrade = sanitizeContext(member.studentIdRef.grade || "", studentNames);
        const cleanGoal = sanitizeContext(member.studentIdRef.goal || "", studentNames);
        const cleanExtraPrompt = sanitizeContext(parsed.data.prompt || "", studentNames);

        // Dispatch to AI adapter OUTSIDE transaction lock
        let aiDrafts;
        try {
          aiDrafts = await adapter.generateClaimDrafts({
            student: {
              id: member.studentId,
              subject: cleanSubject,
              grade: cleanGrade,
              goal: cleanGoal,
            },
            observations: nonStaleObservations.map((o) => ({
              id: o.id,
              studentId: o.studentId,
              title: sanitizeContext(o.title, studentNames),
              detail: sanitizeContext(o.detail, studentNames),
              support: o.support,
              kind: o.kind,
              sourceType: o.sourceType,
              sourceVersion: o.sourceVersion,
            })),
            extraPrompt: cleanExtraPrompt,
            studentNames,
          });
        } catch (err: unknown) {
          const errorMsg =
            err instanceof Error ? err.message : "Dịch vụ AI không khả dụng";
          return fail(
            res,
            503,
            "AI_UNAVAILABLE",
            errorMsg.startsWith("AI_")
              ? errorMsg
              : "Dịch vụ AI tạm không khả dụng; giáo viên có thể tạo nhận định thủ công",
          );
        }

        // Revalidate and persist UNDER SESSION LOCK
        const result = await createOnce(req, res, routeKey, async (tx) => {
          await lockSession(tx, session.id);

          const current = await tx.session.findUniqueOrThrow({
            where: { id: session.id },
          });
          if (!["ended", "reviewed"].includes(current.status))
            throw new SessionConflict(
              "SESSION_STATE_INVALID",
              "Trạng thái buổi học đã thay đổi trong khi chờ AI",
            );

          // Recheck member consent under session lock
          const currentMember = await tx.roomMember.findUnique({
            where: {
              sessionId_studentId: {
                sessionId: session.id,
                studentId: targetStudentId,
              },
            },
          });
          if (!currentMember || !currentMember.consent) {
            throw new SessionConflict(
              "PERMISSION_DENIED",
              "Học sinh đã thu hồi sự đồng ý sử dụng AI",
            );
          }

          // Query live observation evidence in DB under lock to verify intactness
          const liveObs = await tx.evidence.findMany({
            where: {
              sessionId: session.id,
              studentId: targetStudentId,
              status: "active",
              isObservation: true,
              kind: { not: "GoiYGiangDay" },
              sourceType: { not: "ai_suggestion" },
            },
          });
          const liveObsMap = new Map(liveObs.map((o) => [o.id, o]));

          // Compare referenced observations against pre-SDK snapshot for any edit/delete/regrade race
          for (const candidate of aiDrafts.claims) {
            for (const refId of candidate.evidenceIds) {
              const snapshot = preSnapshotObsMap.get(refId);
              const live = liveObsMap.get(refId);
              if (!snapshot || !live) {
                // If referenced evidence was deleted or missing from snapshot
                continue;
              }
              const curLiveSourceVer = await resolveCurrentSourceVersion(
                live.sourceType,
                live.sourceId,
                session.id,
                tx,
                targetStudentId,
              );
              if (
                live.version !== snapshot.version ||
                live.sourceVersion !== snapshot.sourceVersion ||
                curLiveSourceVer !== snapshot.currentSourceVersion ||
                live.sourceId !== snapshot.sourceId || live.sourceType !== snapshot.sourceType
              ) {
                throw new SessionConflict(
                  "VERSION_CONFLICT",
                  "Minh chứng quan sát đã bị thay đổi trong quá trình xử lý AI",
                );
              }
            }
          }

          // Strictly filter candidate claims: REJECT whole candidate if ANY ref is invalid/duplicate/stale/peer
          const validCandidates: typeof aiDrafts.claims = [];
          for (const candidate of aiDrafts.claims) {
            if (!candidate.text || candidate.text.trim().length < 5) continue;
            if (!candidate.evidenceIds || candidate.evidenceIds.length === 0) continue;

            // Check for duplicate evidence IDs in candidate
            const uniqueIds = new Set(candidate.evidenceIds);
            if (uniqueIds.size !== candidate.evidenceIds.length) {
              // Discard whole candidate if duplicate references exist
              continue;
            }

            // Check if ALL ids belong to live valid observations belonging to the student
            const allValid = candidate.evidenceIds.every((id) => preSnapshotObsMap.has(id) && liveObsMap.has(id));
            if (!allValid) {
              // Discard whole candidate with ANY hallucinated/peer/unknown ref
              continue;
            }

            validCandidates.push(candidate);
          }

          const createdClaims: AIClaimsDraftResponse["claims"] = [];

          // Reopen reviewed session ONLY if at least one valid claim will actually persist
          if (current.status === "reviewed" && validCandidates.length > 0) {
            const reopened = await tx.session.update({
              where: { id: session.id },
              data: { status: "ended", version: { increment: 1 } },
            });
            await appendOutboxEvent(tx, {
              sessionId: session.id,
              type: "review.reopened",
              label: "Mở lại duyệt do tạo nhận định dự thảo từ AI",
              actorId: res.locals.actor.id,
              visibility: { scope: "teacher" },
              resourceId: session.id,
              version: reopened.version,
            });
            await tx.auditLog.create({
              data: {
                workspaceId: res.locals.actor.workspaceId,
                actorId: res.locals.actor.id,
                actorRole: "teacher",
                action: "review.reopened",
                targetType: "session",
                targetId: session.id,
                sessionId: session.id,
                requestId: res.locals.requestId,
                metadata: {
                  previousStatus: "reviewed",
                  nextStatus: "ended",
                  reasonCode: "ai_claims_drafted",
                },
              },
            });
          }

          for (const candidate of validCandidates) {
            const created = await tx.claim.create({
              data: {
                sessionId: session.id,
                studentId: targetStudentId,
                text: candidate.text,
                evidenceIds: candidate.evidenceIds,
                status: "pending", // Sourced pending claims only
                revision: 1,
              },
            });
            createdClaims.push({ id: created.id, studentId: created.studentId, text: created.text, evidenceIds: created.evidenceIds, status: "pending", revision: created.revision });

            await tx.auditLog.create({
              data: {
                workspaceId: res.locals.actor.workspaceId,
                actorId: res.locals.actor.id,
                actorRole: "teacher",
                action: "claim.draft_created",
                targetType: "claim",
                targetId: created.id,
                sessionId: session.id,
                requestId: res.locals.requestId,
                metadata: {
                  source: "ai_draft",
                  provider: aiDrafts.provider,
                  model: aiDrafts.model,
                  evidenceCount: candidate.evidenceIds.length,
                },
              },
            });
          }

          // Record AIRequest audit
          const request = await tx.aIRequest.create({
            data: {
              sessionId: session.id,
              studentId: targetStudentId,
              kind: "claim_draft",
              prompt: aiDrafts.promptUsed,
              promptVersion: aiDrafts.promptVersion,
              responseText: JSON.stringify({ claims: createdClaims, summary: aiDrafts.summary }),
              contextSummary: aiDrafts.contextSummary,
              provider: aiDrafts.provider,
              model: aiDrafts.model,
              modelVersion: aiDrafts.modelVersion,
              status: "ready",
              actorId: res.locals.actor.id,
            },
          });

          return request.id;
        });

        if (!result) return;
        triggerOutboxPublish(session.id);
        return res.status(201).json(await readDraftReceipt(result.resourceId));
      } finally {
        barrier?.release();
      }
    }),
  );

  // 4. Backward-Compatible Lesson Plan Suggestions (POST /sessions/:id/ai/plan-suggestions)
  r.post(
    "/sessions/:id/ai/plan-suggestions",
    asyncRoute(async (req, res) => {
      if (!isAIEnabled()) {
        return fail(res, 503, "AI_UNAVAILABLE", "AI chưa được bật");
      }
      const adapter = getAIAdapter();
      if (!adapter || ((config.mode === "production" || config.mode === "staging") && adapter.getCircuitStatus().provider === "mock")) {
        return fail(res, 503, "AI_UNAVAILABLE", "Dịch vụ AI không khả dụng trong môi trường hiện tại");
      }

      const parsed = z
        .strictObject({ studentId: z.string().uuid() })
        .safeParse(req.body);
      if (!parsed.success || !safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "Yêu cầu không hợp lệ");

      const session = await db.session.findUnique({
        where: { id: req.params.id },
      });
      if (!session)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy buổi học");
      if (session.teacherId !== res.locals.actor.id)
        return fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
      if (!["draft", "scheduled"].includes(session.status))
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Không thể đề xuất cho buổi này",
        );

      const member = await db.roomMember.findUnique({
        where: {
          sessionId_studentId: {
            sessionId: session.id,
            studentId: parsed.data.studentId,
          },
        },
        include: { studentIdRef: true },
      });
      if (!member)
        return fail(
          res,
          403,
          "PERMISSION_DENIED",
          "Học sinh không thuộc buổi học",
        );
      if (!member.consent)
        return fail(
          res,
          403,
          "PERMISSION_DENIED",
          "Học sinh chưa có sự đồng ý (consent) để sử dụng hỗ trợ AI",
        );

      const routeKey = `/sessions/${session.id}/ai/plan-suggestions`;

      // Preflight replay check
      const prior = await lookupReplay(req, res, routeKey);
      if (prior === null) return;
      if (prior) return res.status(200).json(await readPlanReceipt(prior.resourceId));

      // Query past approved claims for student with historical consent
      const claims = await db.claim.findMany({
        where: {
          studentId: parsed.data.studentId,
          status: "approved",
          sessionIdRef: {
            teacherId: res.locals.actor.id,
            RoomMember_sessionId_items: {
              some: { studentId: parsed.data.studentId, consent: true },
            },
          },
        },
        orderBy: { reviewedAt: "desc" },
        select: {
          id: true,
          revision: true,
          text: true,
          evidenceIds: true,
          sessionId: true,
          studentId: true,
          status: true,
        },
      });

      const eligible = (
        await filterEligibleApprovedClaims(claims, res.locals.actor.id)
      ).slice(0, 4);

      if (!eligible.length)
        return fail(
          res,
          409,
          "VALIDATION_ERROR",
          "Chưa có lịch sử đã duyệt và đồng ý sử dụng cho AI",
        );

      // Snapshot eligible claims to detect races while awaiting model
      const preSnapshotClaims = eligible.map((c) => ({
        id: c.id,
        sessionId: c.sessionId,
        revision: c.revision,
        evidenceIds: c.evidenceIds,
      }));

      const idempotencyKey = req.get("Idempotency-Key") || "";
      const lockKey = `${res.locals.actor.id}:${routeKey}:${idempotencyKey}`;

      if (idempotencyKey) {
        while (inFlightRequests.has(lockKey)) {
          const inFlight = inFlightRequests.get(lockKey);
          if (inFlight) {
            await inFlight.catch(() => {});
            const postReplay = await lookupReplay(req, res, routeKey);
            if (postReplay === null) return;
            if (postReplay) return res.status(200).json(await readPlanReceipt(postReplay.resourceId));
          }
        }
      }
      const barrier = idempotencyKey ? createInFlightBarrier(lockKey) : null;
      try {
        const replay = await lookupReplay(req, res, routeKey);
        if (replay === null) return;
        if (replay) return res.status(200).json(await readPlanReceipt(replay.resourceId));
        // Query student personal names for context minimization
        const allStudents = await db.student.findMany({
          where: { teacherId: res.locals.actor.id },
          select: { name: true },
        });
        const studentNames = allStudents.map((s) => s.name.trim()).filter((n) => n.length > 1);

        const cleanSubject = sanitizeContext(member.studentIdRef.subject || "", studentNames);
        const cleanGrade = sanitizeContext(member.studentIdRef.grade || "", studentNames);
        const cleanGoal = sanitizeContext(member.studentIdRef.goal || "", studentNames);
        const cleanClaims = eligible.map((c) => sanitizeContext(c.text, studentNames));

        // Dispatch to AI adapter outside lock
        let aiResult;
        try {
          aiResult = await adapter.generatePlanSuggestion({
            studentId: member.studentId,
            subject: cleanSubject,
            grade: cleanGrade,
            goal: cleanGoal,
            eligibleClaims: cleanClaims,
            studentNames,
          });
        } catch (err: unknown) {
          const errorMsg =
            err instanceof Error ? err.message : "Dịch vụ AI không khả dụng";
          return fail(
            res,
            503,
            "AI_UNAVAILABLE",
            errorMsg.startsWith("AI_")
              ? errorMsg
              : "Dịch vụ AI tạm không khả dụng; có thể chuẩn bị giáo án thủ công",
          );
        }

        // Revalidate and persist UNDER SESSION LOCK
        const result = await createOnce(req, res, routeKey, async (tx) => {
          for (const id of [...new Set([session.id, ...preSnapshotClaims.map(claim => claim.sessionId)])].sort()) await lockSession(tx, id);

          const currentSession = await tx.session.findUniqueOrThrow({
            where: { id: session.id },
          });
          if (!["draft", "scheduled"].includes(currentSession.status)) {
            throw new SessionConflict(
              "SESSION_STATE_INVALID",
              "Trạng thái buổi học đã thay đổi trong khi chờ AI",
            );
          }

          const currentMember = await tx.roomMember.findUnique({
            where: {
              sessionId_studentId: {
                sessionId: session.id,
                studentId: parsed.data.studentId,
              },
            },
          });
          if (!currentMember || !currentMember.consent) {
            throw new SessionConflict(
              "PERMISSION_DENIED",
              "Học sinh đã thu hồi sự đồng ý sử dụng AI",
            );
          }

          const historyConsent = await tx.roomMember.findMany({ where: {
            sessionId: { in: preSnapshotClaims.map(claim => claim.sessionId) }, studentId: parsed.data.studentId, consent: true,
          }, select: { sessionId: true } });
          if (preSnapshotClaims.some(claim => !historyConsent.some(member => member.sessionId === claim.sessionId))) {
            throw new SessionConflict("PERMISSION_DENIED", "Lịch sử học sinh không còn được đồng ý sử dụng");
          }
          // Recheck that eligible claims have not been revised or unapproved
          const liveClaims = await tx.claim.findMany({
            where: {
              id: { in: preSnapshotClaims.map((c) => c.id) },
              status: "approved",
            },
          });
          const eligibleLive = await filterEligibleApprovedClaims(liveClaims, res.locals.actor.id, tx);
          const liveClaimMap = new Map(eligibleLive.map(claim => [claim.id, claim]));

          for (const snap of preSnapshotClaims) {
            const live = liveClaimMap.get(snap.id);
            if (!live || live.revision !== snap.revision || live.studentId !== parsed.data.studentId || live.sessionId !== snap.sessionId || JSON.stringify(live.evidenceIds) !== JSON.stringify(snap.evidenceIds)) {
              throw new SessionConflict(
                "VERSION_CONFLICT",
                "Nhận định năng lực dùng làm căn cứ đã bị thay đổi trong khi chờ AI",
              );
            }
          }

          const observations = await tx.evidence.findMany({
            where: { id: { in: eligible.flatMap(claim => claim.evidenceIds) }, status: "active", isObservation: true,
              kind: { not: "GoiYGiangDay" }, sourceType: { not: "ai_suggestion" }, sessionIdRef: { teacherId: res.locals.actor.id } },
            select: { id: true, sessionId: true, studentId: true },
          });
          const sources = eligible.map(claim => ({ claimId: claim.id, revision: claim.revision,
            evidenceIds: claim.evidenceIds.filter(id => observations.some(item => item.id === id && item.sessionId === claim.sessionId && item.studentId === claim.studentId)),
          }));
          if (!planSources.safeParse(sources).success) throw new SessionConflict("VERSION_CONFLICT", "Nguồn kế hoạch đã thay đổi; hãy đối chiếu lại");
          const request = await tx.aIRequest.create({
            data: {
              sessionId: session.id,
              studentId: parsed.data.studentId,
              kind: "plan_suggestion",
              sourceClaimRefs: sources,
              prompt: aiResult.promptUsed,
              promptVersion: aiResult.promptVersion,
              responseText: aiResult.text.slice(0, 4000),
              contextSummary: aiResult.contextSummary,
              provider: aiResult.provider,
              model: aiResult.model,
              modelVersion: aiResult.modelVersion,
              status: "ready",
              actorId: res.locals.actor.id,
            },
          });

          return request.id;
        });

        if (!result) return;
        return res.status(result.replay ? 200 : 201).json(await readPlanReceipt(result.resourceId));
      } finally {
        barrier?.release();
      }
    }),
  );

  // 5. Query In-Session AI Suggestions (GET /sessions/:id/ai/suggestions)
  r.get(
    "/sessions/:id/ai/suggestions",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID buổi học không hợp lệ");

      const session = await db.session.findUnique({
        where: { id: req.params.id },
      });
      if (!session)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy buổi học");
      if (session.teacherId !== res.locals.actor.id)
        return fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");

      const items = await db.aIRequest.findMany({
        where: {
          sessionId: session.id,
          kind: { in: ["explain", "leading_question", "example", "difficulty", "suggestion"] },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return res.json({ suggestions: items.map(formatSuggestion) });
    }),
  );

  // 6. Circuit & Provider Health Status Probe (GET /ai/circuit-status - AI 007)
  r.get(
    "/ai/circuit-status",
    asyncRoute(async (_req, res) => {
      const status = getCircuitStatus();
      return res.json(status);
    }),
  );

  return r;
}
