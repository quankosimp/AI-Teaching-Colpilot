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
import { createOnce } from "../idempotency.js";
import { appendOutboxEvent } from "../realtime.js";
import {
  getAIAdapter,
  getCircuitStatus,
  sanitizeContext,
} from "../ai/index.js";
import {
  AIRequestInput,
  AIStatusUpdate,
  AIClaimsDraftInput,
} from "../../contracts/ai.js";

const safeId = z.string().uuid();

export function aiRouter(config: AppConfig) {
  const r = Router();
  r.use(requireTeacher(config));

  // 1. In-Session Pedagogical Teaching Assistance (POST /sessions/:id/ai/suggestions - AI 001, AI 006, AI 007)
  r.post(
    "/sessions/:id/ai/suggestions",
    asyncRoute(async (req, res) => {
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

      // Consent check (AI 006: consent-filtered context)
      if (!member.consent) {
        return fail(
          res,
          403,
          "PERMISSION_DENIED",
          "Học sinh chưa có sự đồng ý (consent) để sử dụng hỗ trợ AI",
        );
      }

      const activity = await db.activity.findFirst({
        where: {
          id: parsed.data.activityId,
          sessionId: session.id,
        },
      });
      if (!activity)
        return fail(res, 400, "VALIDATION_ERROR", "Hoạt động không thuộc buổi học này");

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

      // Query student personal names for context anonymization
      const studentNames = (
        await db.student.findMany({
          where: { teacherId: res.locals.actor.id },
          select: { name: true },
        })
      ).map((s) => s.name);

      // Minimized prior approved claims for this targeted student
      const priorApproved = await db.claim.findMany({
        where: {
          studentId: parsed.data.studentId,
          status: "approved",
          sessionIdRef: { teacherId: res.locals.actor.id },
        },
        take: 3,
        orderBy: { reviewedAt: "desc" },
        select: { text: true },
      });

      const adapter = getAIAdapter();

      // Dispatch to AI adapter OUTSIDE transaction lock (never call model holding lock)
      let aiResult;
      try {
        aiResult = await adapter.generateTeachingSuggestion({
          mode: parsed.data.kind,
          prompt: sanitizeContext(parsed.data.prompt, studentNames),
          student: {
            id: member.studentId,
            subject: member.studentIdRef.subject,
            grade: member.studentIdRef.grade,
          },
          activity: {
            id: activity.id,
            title: activity.title,
            description: activity.description,
            type: activity.type,
          },
          priorApprovedClaims: priorApproved.map((c) => c.text),
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
            : "Gemini tạm không khả dụng; giáo viên có thể tiếp tục ghi chú thủ công",
        );
      }

      // Revalidate and persist UNDER SESSION LOCK
      const routeKey = `/sessions/${session.id}/ai/suggestions`;
      const result = await createOnce(req, res, routeKey, async (tx) => {
        await lockSession(tx, session.id);

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

        const created = await tx.aIRequest.create({
          data: {
            sessionId: session.id,
            studentId: parsed.data.studentId,
            activityId: activity.id,
            kind: "suggestion",
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
              kind: parsed.data.kind,
              provider: aiResult.provider,
              model: aiResult.model,
            },
          },
        });

        return created.id;
      });

      if (!result) return;
      const suggestion = await db.aIRequest.findUniqueOrThrow({
        where: { id: result.resourceId },
      });
      return res.status(201).json({ suggestion });
    }),
  );

  // 2. Lifecycle Status Transitions & Optional Evidence Creation (PATCH /ai-requests/:id - AI 002 & AI 003)
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
      if (item.status !== "ready")
        return fail(res, 409, "VERSION_CONFLICT", "Gợi ý đã được xử lý");

      const editedText = parsed.data.editedText?.trim() || null;
      const saveAsEvidence = parsed.data.saveAsEvidence === true && parsed.data.status === "used";

      const updated = await db.$transaction(async (tx) => {
        await lockSession(tx, item.sessionId);

        const freshItem = await tx.aIRequest.findUniqueOrThrow({
          where: { id: item.id },
        });
        if (freshItem.status !== "ready")
          throw new SessionConflict("VERSION_CONFLICT", "Gợi ý đã được xử lý bởi thao tác khác");

        let evidenceId: string | null = null;
        let createdEvidence: unknown = null;

        // AI 003: Save used suggestion as Evidence of kind GoiYGiangDay with isObservation: false
        if (saveAsEvidence) {
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

        return { next, createdEvidence };
      });

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

      // Gather active observation evidences for the student (excluding teaching aids and AI suggestions)
      const observations = await db.evidence.findMany({
        where: {
          sessionId: session.id,
          studentId: targetStudentId,
          status: "active",
          isObservation: true,
          kind: { not: "GoiYGiangDay" },
          sourceType: { not: "ai_suggestion" },
        },
        orderBy: { createdAt: "asc" },
      });

      // 0-observation guard (SRS AI 004: if no source observations, do NOT fabricate competence claims)
      if (observations.length === 0) {
        return res.status(200).json({
          claims: [],
          summary: "Chưa có minh chứng quan sát thực tế để tạo nhận định năng lực",
        });
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

      const adapter = getAIAdapter();

      // Dispatch to AI adapter OUTSIDE transaction lock
      let aiDrafts;
      try {
        aiDrafts = await adapter.generateClaimDrafts({
          student: {
            id: member.studentId,
            subject: member.studentIdRef.subject,
            grade: member.studentIdRef.grade,
          },
          observations: observations.map((o) => ({
            id: o.id,
            studentId: o.studentId,
            title: o.title,
            detail: o.detail,
            support: o.support,
            kind: o.kind,
            sourceType: o.sourceType,
            sourceVersion: o.sourceVersion,
          })),
          extraPrompt: parsed.data.prompt,
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
            : "Gemini tạm không khả dụng; giáo viên có thể tạo nhận định thủ công",
        );
      }

      // Revalidate and persist UNDER SESSION LOCK
      const routeKey = `/sessions/${session.id}/ai/claims-draft`;
      const result = await createOnce(req, res, routeKey, async (tx) => {
        const current = await lockSession(tx, session.id);
        if (!["ended", "reviewed"].includes(current.status))
          throw new SessionConflict("SESSION_STATE_INVALID", "Trạng thái buổi học không hợp lệ");

        // Fresh observation evidence revalidation under lock
        const liveObs = await tx.evidence.findMany({
          where: {
            id: { in: observations.map((o) => o.id) },
            sessionId: session.id,
            studentId: targetStudentId,
            status: "active",
            isObservation: true,
            kind: { not: "GoiYGiangDay" },
            sourceType: { not: "ai_suggestion" },
          },
        });
        const liveObsMap = new Map(liveObs.map((o) => [o.id, o]));

        // Reopen reviewed session if new claims are being drafted
        if (current.status === "reviewed" && aiDrafts.claims.length > 0) {
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

        const createdClaimIds: string[] = [];
        for (const candidate of aiDrafts.claims) {
          // Strictly validate that returned evidenceIds exist and belong to the student
          const validIds = candidate.evidenceIds.filter((id) => liveObsMap.has(id));
          if (validIds.length === 0) continue;

          const created = await tx.claim.create({
            data: {
              sessionId: session.id,
              studentId: targetStudentId,
              text: candidate.text,
              evidenceIds: validIds,
              status: "pending", // Sourced pending claims only
              revision: 1,
            },
          });
          createdClaimIds.push(created.id);

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
                evidenceCount: validIds.length,
              },
            },
          });
        }

        // Record AIRequest audit
        await tx.aIRequest.create({
          data: {
            sessionId: session.id,
            studentId: targetStudentId,
            kind: "claim_draft",
            prompt: aiDrafts.promptUsed,
            promptVersion: aiDrafts.promptVersion,
            responseText: JSON.stringify(aiDrafts.claims),
            contextSummary: aiDrafts.contextSummary,
            provider: aiDrafts.provider,
            model: aiDrafts.model,
            modelVersion: aiDrafts.modelVersion,
            status: "ready",
            actorId: res.locals.actor.id,
          },
        });

        return createdClaimIds.join(",");
      });

      if (!result) return;
      const ids = result.resourceId ? result.resourceId.split(",").filter(Boolean) : [];
      const claims = ids.length
        ? await db.claim.findMany({ where: { id: { in: ids } } })
        : [];

      return res.status(201).json({
        claims,
        summary: aiDrafts.summary,
      });
    }),
  );

  // 4. Backward-Compatible Plan Suggestions (POST /sessions/:id/ai/plan-suggestions)
  r.post(
    "/sessions/:id/ai/plan-suggestions",
    asyncRoute(async (req, res) => {
      if (process.env.ENABLE_AI !== "true")
        return fail(res, 503, "AI_UNAVAILABLE", "AI chưa được bật");

      const parsed = z
        .strictObject({ studentId: z.uuid() })
        .safeParse(req.body);
      if (!parsed.success || !z.uuid().safeParse(req.params.id).success)
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

      const observations = await db.evidence.findMany({
        where: {
          id: { in: eligible.flatMap((claim) => claim.evidenceIds) },
          status: "active",
          isObservation: true,
          kind: { not: "GoiYGiangDay" },
          sourceType: { not: "ai_suggestion" },
          sessionIdRef: { teacherId: res.locals.actor.id },
        },
        select: { id: true, sessionId: true, studentId: true },
      });

      const studentNames = (
        await db.student.findMany({
          where: { teacherId: res.locals.actor.id },
          select: { name: true },
        })
      ).map((student) => student.name);

      const adapter = getAIAdapter();
      let aiResult;
      try {
        aiResult = await adapter.generatePlanSuggestion({
          studentId: member.studentId,
          subject: member.studentIdRef.subject,
          grade: member.studentIdRef.grade,
          eligibleClaims: eligible.map((c) => sanitizeContext(c.text, studentNames)),
        });
      } catch {
        return fail(
          res,
          503,
          "AI_UNAVAILABLE",
          "Gemini tạm không khả dụng; vẫn có thể soạn thủ công",
        );
      }

      const request = await db.aIRequest.create({
        data: {
          sessionId: session.id,
          studentId: parsed.data.studentId,
          kind: "plan_suggestion",
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

      return res.status(201).json({
        suggestion: {
          id: request.id,
          text: request.responseText,
          status: request.status,
          sources: eligible.map((c) => ({
            claimId: c.id,
            revision: c.revision,
            evidenceIds: c.evidenceIds.filter((id) =>
              observations.some(
                (item) =>
                  item.id === id &&
                  item.sessionId === c.sessionId &&
                  item.studentId === c.studentId,
              ),
            ),
          })),
        },
      });
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
          kind: "suggestion",
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return res.json({ suggestions: items });
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
