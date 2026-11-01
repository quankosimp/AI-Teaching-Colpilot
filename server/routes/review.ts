import { publicSubmission } from "../submissionProjection.js";
import { lockSession, SessionConflict } from "../sessionLock.js";
import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  ApprovalContext,
  ClaimDraftInput,
  ClaimReviewCommand,
  CompleteReviewCommand,
  EvidenceUpdateInput,
  ObservationInput,
  RelabelInput,
} from "../../contracts/api.js";
import {
  EvidenceForApproval,
  EvidenceKind,
  EvidenceStatus,
  ReviewCompletionContext,
  SupportLevel,
  nextSessionStatus,
} from "../../contracts/domain.js";
import {
  asyncRoute,
  audit,
  db,
  fail,
  requireTeacher,
  type AppConfig,
  type TeacherActor,
} from "../context.js";
import { filterEligibleApprovedClaims } from "../eligibleClaims.js";
import { createOnce } from "../idempotency.js";
import { appendOutboxEvent, triggerOutboxPublish } from "../realtime.js";

const safeId = z.uuid();
const versionHeader = (req: Request) => {
  const raw = req.get("If-Match-Version");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : -1;
};

async function ownedSession(id: string, actor: TeacherActor, res: Response) {
  const item = await db.session.findUnique({ where: { id } });
  if (item && item.teacherId !== actor.id) {
    await audit(actor, "security.denied", "session", id, res.locals.requestId);
    fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập buổi học");
    return null;
  }
  if (!item) {
    fail(res, 404, "NOT_FOUND", "Không tìm thấy buổi học");
    return null;
  }
  return item;
}

async function resolveCurrentSourceVersion(
  sourceType: string,
  sourceId: string | null,
  sessionId: string,
  client: Prisma.TransactionClient = db,
  studentId?: string,
): Promise<number> {
  if (!sourceId || !safeId.safeParse(sourceId).success) return 1;
  if (sourceType === "submission") {
    const sub = await client.submission.findFirst({
      where: { id: sourceId, sessionId, ...(studentId ? { studentId } : {}) },
      select: { version: true },
    });
    return sub?.version ?? 0;
  }
  if (sourceType === "board_attempt") {
    const att = await client.boardAttempt.findFirst({
      where: { id: sourceId, sessionId, ...(studentId ? { studentId } : {}) },
      select: { id: true },
    });
    return att ? 1 : 0;
  }
  if (sourceType === "check_response") {
    const resp = await client.checkResponse.findFirst({
      where: { id: sourceId, sessionId, ...(studentId ? { studentId } : {}) },
      select: { id: true },
    });
    return resp ? 1 : 0;
  }
  if (sourceType === "annotation") {
    const ann = await client.annotation.findFirst({
      where: { id: sourceId, sessionId, ...(studentId ? { studentId } : {}) },
      select: { id: true },
    });
    return ann ? 1 : 0;
  }
  if (sourceType === "ai_suggestion") {
    const ai = await client.aIRequest.findFirst({
      where: { id: sourceId, sessionId, ...(studentId ? { studentId } : {}) },
      select: { id: true },
    });
    return ai ? 1 : 0;
  }
  return 1;
}

export function reviewRouter(config: AppConfig) {
  const r = Router();
  r.use(requireTeacher(config));

  const handleEvidenceList = async (
    req: Request,
    res: Response,
    fixedSessionId?: string,
  ) => {
    const sessionId =
      fixedSessionId ??
      (typeof req.query.sessionId === "string"
        ? req.query.sessionId
        : undefined);
    if (sessionId) {
      if (!safeId.safeParse(sessionId).success)
        return fail(res, 400, "VALIDATION_ERROR", "sessionId không hợp lệ");
      const session = await ownedSession(sessionId, res.locals.actor, res);
      if (!session) return;
    }
    const studentId =
      typeof req.query.studentId === "string" ? req.query.studentId : undefined;
    if (studentId && !safeId.safeParse(studentId).success)
      return fail(res, 400, "VALIDATION_ERROR", "studentId không hợp lệ");
    const activityId =
      typeof req.query.activityId === "string"
        ? req.query.activityId
        : undefined;
    if (activityId && !safeId.safeParse(activityId).success)
      return fail(res, 400, "VALIDATION_ERROR", "activityId không hợp lệ");
    const kind =
      typeof req.query.kind === "string"
        ? EvidenceKind.safeParse(req.query.kind).data
        : undefined;
    const support =
      typeof req.query.support === "string"
        ? SupportLevel.safeParse(req.query.support).data
        : undefined;
    const status =
      typeof req.query.status === "string"
        ? EvidenceStatus.safeParse(req.query.status).data
        : undefined;
    const fromDate =
      typeof req.query.from === "string" &&
      !Number.isNaN(Date.parse(req.query.from))
        ? new Date(req.query.from)
        : undefined;
    const toDate =
      typeof req.query.to === "string" &&
      !Number.isNaN(Date.parse(req.query.to))
        ? new Date(req.query.to)
        : undefined;
    const limit = Math.min(
      100,
      Math.max(1, Number(req.query.limit ?? 50) || 50),
    );
    const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);

    const where: Prisma.EvidenceWhereInput = {
      sessionIdRef: { teacherId: res.locals.actor.id },
      ...(sessionId ? { sessionId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(activityId ? { activityId } : {}),
      ...(kind ? { kind } : {}),
      ...(support ? { support } : {}),
      ...(status ? { status } : { status: { not: "deleted" } }),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      db.evidence.findMany({
        where,
        include: {
          EvidenceRevision_evidenceId_items: { orderBy: { version: "desc" } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        skip: offset,
      }),
      db.evidence.count({ where }),
    ]);

    return res.json({
      evidence: items,
      total,
      limit,
      offset,
      nextOffset: offset + items.length < total ? offset + items.length : null,
    });
  };

  // 1. Evidence List (Session-scoped and Workspace-scoped with filters + pagination)
  r.get(
    "/sessions/:id/evidence",
    asyncRoute(async (req, res) => handleEvidenceList(req, res, req.params.id)),
  );
  r.get(
    "/evidence",
    asyncRoute(async (req, res) => handleEvidenceList(req, res)),
  );

  // 2. Create Observation / Evidence (POST /sessions/:id/evidence)
  r.post(
    "/sessions/:id/evidence",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID buổi học không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      const parsed = ObservationInput.safeParse(req.body);
      if (
        !parsed.success ||
        !safeId.safeParse(parsed.data.studentId).success ||
        (parsed.data.activityId &&
          !safeId.safeParse(parsed.data.activityId).success)
      )
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Dữ liệu minh chứng không hợp lệ",
        );

      const member = await db.roomMember.findUnique({
        where: {
          sessionId_studentId: {
            sessionId: session.id,
            studentId: parsed.data.studentId,
          },
        },
      });
      if (!member)
        return fail(
          res,
          403,
          "PERMISSION_DENIED",
          "Học sinh không thuộc buổi học này",
        );

      if (parsed.data.activityId) {
        const act = await db.activity.findFirst({
          where: { id: parsed.data.activityId, sessionId: session.id },
        });
        if (!act)
          return fail(
            res,
            400,
            "VALIDATION_ERROR",
            "Hoạt động không thuộc buổi học",
          );
      }

      const sourceType =
        parsed.data.source?.type ??
        (parsed.data.kind === "GoiYGiangDay" ? "ai_suggestion" : "note");
      const sourceId = parsed.data.source?.id ?? null;
      const sourceVersion = parsed.data.source?.version ?? 1;
      if (sourceId && sourceType !== "note") {
        const currentVer = await resolveCurrentSourceVersion(
          sourceType,
          sourceId,
          session.id,
        );
        if (currentVer < 1)
          return fail(
            res,
            403,
            "PERMISSION_DENIED",
            "Nguồn minh chứng không thuộc buổi học",
          );
      }
      const isObservation =
        parsed.data.kind !== "GoiYGiangDay" && sourceType !== "ai_suggestion";

      const result = await createOnce(
        req,
        res,
        `/sessions/${session.id}/evidence`,
        async (tx) => {
          await lockSession(tx, session.id);
          if (
            sourceType !== "note" &&
            (await resolveCurrentSourceVersion(
              sourceType,
              sourceId,
              session.id,
              tx,
              parsed.data.studentId,
            )) !== sourceVersion
          )
            throw new SessionConflict(
              "VERSION_CONFLICT",
              "Nguồn minh chứng không còn hợp lệ",
            );
          const ev = await tx.evidence.create({
            data: {
              sessionId: session.id,
              studentId: parsed.data.studentId,
              activityId: parsed.data.activityId ?? session.currentActivityId,
              kind: parsed.data.kind,
              title: parsed.data.title,
              detail: parsed.data.detail,
              support: parsed.data.support,
              sourceType,
              sourceId,
              submissionId: sourceType === "submission" ? sourceId : null,
              sourceVersion,
              isObservation,
              status: "active",
              version: 1,
              createdBy: res.locals.actor.id,
            },
          });
          await appendOutboxEvent(tx, {
            sessionId: session.id,
            type: "evidence.created",
            label: "Ghi nhận minh chứng mới",
            actorId: res.locals.actor.id,
            visibility: { scope: "teacher" },
            activityId: ev.activityId,
            sourceId: ev.sourceId,
            resourceId: ev.id,
            version: 1,
          });
          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "evidence.created",
              targetType: "evidence",
              targetId: ev.id,
              sessionId: session.id,
              requestId: res.locals.requestId,
              metadata: { nextStatus: "active", revision: 1 },
            },
          });
          return ev.id;
        },
      );
      if (!result) return;
      triggerOutboxPublish(session.id);
      return res.status(201).json({
        evidence: await db.evidence.findUniqueOrThrow({
          where: { id: result.resourceId },
        }),
      });
    }),
  );

  // 3. Update / Correct / Delete Evidence (PATCH /evidence/:id) - preserves raw sources, appends EvidenceRevision, invalidates dependent Claims, reopens reviewed -> ended
  r.patch(
    "/evidence/:id",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const parsed = EvidenceUpdateInput.safeParse(req.body);
      const expected = versionHeader(req);
      if (!parsed.success || !expected || expected < 1)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Dữ liệu cập nhật hoặc If-Match-Version không hợp lệ",
        );
      const evidence = await db.evidence.findUnique({
        where: { id: req.params.id },
        include: { sessionIdRef: true },
      });
      if (!evidence)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy minh chứng");
      if (evidence.sessionIdRef.teacherId !== res.locals.actor.id) {
        await audit(
          res.locals.actor,
          "security.denied",
          "evidence",
          evidence.id,
          res.locals.requestId,
        );
        return fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
      }
      if (evidence.version !== expected)
        return fail(
          res,
          409,
          "VERSION_CONFLICT",
          "Minh chứng đã thay đổi phiên bản",
        );

      const nextStatus =
        parsed.data.status === "deleted"
          ? "deleted"
          : parsed.data.status === "corrected"
            ? "active"
            : (parsed.data.status ?? evidence.status);
      if (
        (parsed.data.detail === undefined ||
          parsed.data.detail === evidence.detail) &&
        (parsed.data.support === undefined ||
          parsed.data.support === evidence.support) &&
        nextStatus === evidence.status
      )
        return res.json({ evidence });
      const reasonCode =
        nextStatus === "deleted" ? "source_deleted" : "source_corrected";

      const result = await db.$transaction(async (tx) => {
        await lockSession(tx, evidence.sessionId);
        const changed = await tx.evidence.updateMany({
          where: { id: evidence.id, version: expected },
          data: {
            ...(parsed.data.detail !== undefined
              ? { detail: parsed.data.detail }
              : {}),
            ...(parsed.data.support !== undefined
              ? { support: parsed.data.support }
              : {}),
            status: nextStatus,
            version: { increment: 1 },
          },
        });
        if (!changed.count) return null;

        await tx.evidenceRevision.create({
          data: {
            evidenceId: evidence.id,
            version: evidence.version,
            detail: evidence.detail,
            support: evidence.support,
            studentId: evidence.studentId,
            sessionId: evidence.sessionId,
            activityId: evidence.activityId,
            sourceType: evidence.sourceType,
            sourceId: evidence.sourceId,
            sourceVersion: evidence.sourceVersion,
            status: evidence.status,
            changedBy: res.locals.actor.id,
            reason: parsed.data.reason ?? reasonCode,
          },
        });

        const dependentClaims = await tx.claim.findMany({
          where: {
            sessionIdRef: { teacherId: res.locals.actor.id },
            evidenceIds: { has: evidence.id },
            status: "approved",
          },
        });
        const reopenedSessionIds = new Set<string>();
        for (const cl of dependentClaims) {
          await tx.claimRevision.create({
            data: {
              claimId: cl.id,
              revision: cl.revision,
              text: cl.text,
              evidenceIds: cl.evidenceIds,
              status: "pending",
              actorId: res.locals.actor.id,
              reason: reasonCode,
            },
          });
          await tx.claim.update({
            where: { id: cl.id },
            data: {
              status: "pending",
              staleReason: reasonCode,
              revision: { increment: 1 },
            },
          });
          reopenedSessionIds.add(cl.sessionId);
        }
        if (evidence.sessionIdRef.status === "reviewed") {
          reopenedSessionIds.add(evidence.sessionId);
        }
        for (const sid of reopenedSessionIds) {
          const s = await tx.session.findUnique({ where: { id: sid } });
          if (s && s.status === "reviewed") {
            const next = nextSessionStatus(s.status, "review_reopened");
            if (next === "ended") {
              const updatedSession = await tx.session.update({
                where: { id: s.id },
                data: { status: "ended", version: { increment: 1 } },
              });
              await appendOutboxEvent(tx, {
                sessionId: s.id,
                type: "review.reopened",
                label: "Mở lại duyệt buổi học do minh chứng thay đổi",
                actorId: res.locals.actor.id,
                visibility: { scope: "teacher" },
                resourceId: s.id,
                version: updatedSession.version,
              });
              await tx.auditLog.create({
                data: {
                  workspaceId: res.locals.actor.workspaceId,
                  actorId: res.locals.actor.id,
                  actorRole: "teacher",
                  action: "session.review_reopened",
                  targetType: "session",
                  targetId: s.id,
                  sessionId: s.id,
                  requestId: res.locals.requestId,
                  metadata: {
                    previousStatus: "reviewed",
                    nextStatus: "ended",
                    reasonCode,
                  },
                },
              });
            }
          }
        }
        await tx.auditLog.create({
          data: {
            workspaceId: res.locals.actor.workspaceId,
            actorId: res.locals.actor.id,
            actorRole: "teacher",
            action:
              nextStatus === "deleted"
                ? "evidence.deleted"
                : "evidence.corrected",
            targetType: "evidence",
            targetId: evidence.id,
            sessionId: evidence.sessionId,
            requestId: res.locals.requestId,
            metadata: {
              previousStatus: evidence.status,
              nextStatus,
              reasonCode,
              revision: expected + 1,
            },
          },
        });
        return tx.evidence.findUniqueOrThrow({
          where: { id: evidence.id },
          include: {
            EvidenceRevision_evidenceId_items: { orderBy: { version: "desc" } },
          },
        });
      });

      if (!result)
        return fail(
          res,
          409,
          "VERSION_CONFLICT",
          "Minh chứng đã thay đổi phiên bản",
        );
      triggerOutboxPublish(evidence.sessionId);
      return res.json({ evidence: result });
    }),
  );

  // 4. Relabel Submission (PATCH /submissions/:id/relabel) - cascades to Evidence, invalidates Claims without transferring them to another student, reopens reviewed -> ended
  r.patch(
    "/submissions/:id/relabel",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID bài nộp không hợp lệ");
      const parsed = RelabelInput.safeParse(req.body);
      if (
        !parsed.success ||
        !safeId.safeParse(parsed.data.studentId).success ||
        !safeId.safeParse(parsed.data.sessionId).success ||
        (parsed.data.activityId !== null &&
          !safeId.safeParse(parsed.data.activityId).success)
      )
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Thông tin gán lại bài nộp không hợp lệ",
        );
      const expected = versionHeader(req);
      if (expected === -1)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "If-Match-Version không hợp lệ",
        );

      const submission = await db.submission.findUnique({
        where: { id: req.params.id },
        include: { sessionIdRef: true },
      });
      if (!submission)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy bài nộp");
      if (submission.sessionIdRef.teacherId !== res.locals.actor.id) {
        await audit(
          res.locals.actor,
          "security.denied",
          "submission",
          submission.id,
          res.locals.requestId,
        );
        return fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
      }
      if (expected !== null && submission.version !== expected)
        return fail(
          res,
          409,
          "VERSION_CONFLICT",
          "Bài nộp đã thay đổi phiên bản",
        );

      const [targetSession, targetStudent, targetMember, targetActivity] =
        await Promise.all([
          db.session.findUnique({ where: { id: parsed.data.sessionId } }),
          db.student.findUnique({ where: { id: parsed.data.studentId } }),
          db.roomMember.findUnique({
            where: {
              sessionId_studentId: {
                sessionId: parsed.data.sessionId,
                studentId: parsed.data.studentId,
              },
            },
          }),
          parsed.data.activityId
            ? db.activity.findFirst({
                where: {
                  id: parsed.data.activityId,
                  sessionId: parsed.data.sessionId,
                },
              })
            : Promise.resolve({ id: null }),
        ]);

      if (
        !targetSession ||
        targetSession.teacherId !== res.locals.actor.id ||
        !targetStudent ||
        targetStudent.teacherId !== res.locals.actor.id ||
        !targetMember
      ) {
        await audit(
          res.locals.actor,
          "security.denied",
          "submission",
          submission.id,
          res.locals.requestId,
        );
        return fail(
          res,
          403,
          "PERMISSION_DENIED",
          "Học sinh hoặc buổi học đích không thuộc quyền quản lý",
        );
      }
      if (parsed.data.activityId && !targetActivity)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Hoạt động đích không thuộc buổi học đích",
        );

      const { updatedSubmission, invalidatedClaimIds } = await db.$transaction(
        async (tx) => {
          for (const sessionId of [
            ...new Set([submission.sessionId, parsed.data.sessionId]),
          ].sort())
            await lockSession(tx, sessionId);
          const freshSubmission = await tx.submission.findUniqueOrThrow({
            where: { id: submission.id },
          });
          if (
            freshSubmission.version !== submission.version ||
            freshSubmission.sessionId !== submission.sessionId
          )
            throw new SessionConflict(
              "VERSION_CONFLICT",
              "Bài nộp đã thay đổi",
            );
          const updated = await tx.submission.update({
            where: { id: submission.id },
            data: {
              studentId: parsed.data.studentId,
              sessionId: parsed.data.sessionId,
              activityId: parsed.data.activityId,
              version: { increment: 1 },
            },
          });

          const linkedEvidence = await tx.evidence.findMany({
            where: {
              OR: [
                { submissionId: submission.id },
                { sourceType: "submission", sourceId: submission.id },
              ],
            },
          });

          const evIds = linkedEvidence.map((e) => e.id);
          for (const ev of linkedEvidence) {
            await tx.evidenceRevision.create({
              data: {
                evidenceId: ev.id,
                version: ev.version,
                detail: ev.detail,
                support: ev.support,
                studentId: ev.studentId,
                sessionId: ev.sessionId,
                activityId: ev.activityId,
                sourceType: ev.sourceType,
                sourceId: ev.sourceId,
                sourceVersion: ev.sourceVersion,
                status: ev.status,
                changedBy: res.locals.actor.id,
                reason: "submission_relabelled",
              },
            });
            await tx.evidence.update({
              where: { id: ev.id },
              data: {
                studentId: parsed.data.studentId,
                sessionId: parsed.data.sessionId,
                activityId: parsed.data.activityId,
                sourceVersion: updated.version,
                version: { increment: 1 },
              },
            });
          }

          const affectedClaims = evIds.length
            ? await tx.claim.findMany({
                where: {
                  sessionIdRef: { teacherId: res.locals.actor.id },
                  evidenceIds: { hasSome: evIds },
                },
              })
            : [];

          const reopenedSessions = new Set<string>([
            submission.sessionId,
            parsed.data.sessionId,
          ]);
          const invalidated: string[] = [];
          for (const cl of affectedClaims) {
            invalidated.push(cl.id);
            reopenedSessions.add(cl.sessionId);
            await tx.claimRevision.create({
              data: {
                claimId: cl.id,
                revision: cl.revision,
                text: cl.text,
                evidenceIds: cl.evidenceIds,
                status: "pending",
                actorId: res.locals.actor.id,
                reason: "submission_relabelled",
              },
            });
            await tx.claim.update({
              where: { id: cl.id },
              data: {
                status: "pending",
                staleReason: "submission_relabelled",
                revision: { increment: 1 },
              },
            });
          }

          for (const sid of reopenedSessions) {
            const s = await tx.session.findUnique({ where: { id: sid } });
            if (s && s.status === "reviewed") {
              const next = nextSessionStatus(s.status, "review_reopened");
              if (next === "ended") {
                const re = await tx.session.update({
                  where: { id: s.id },
                  data: { status: "ended", version: { increment: 1 } },
                });
                await appendOutboxEvent(tx, {
                  sessionId: s.id,
                  type: "review.reopened",
                  label: "Mở lại duyệt buổi học do gán lại bài nộp",
                  actorId: res.locals.actor.id,
                  visibility: { scope: "teacher" },
                  resourceId: s.id,
                  version: re.version,
                });
              }
            }
          }

          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "submission.relabelled",
              targetType: "submission",
              targetId: submission.id,
              sessionId: parsed.data.sessionId,
              requestId: res.locals.requestId,
              metadata: {
                reasonCode: "submission_relabelled",
                revision: updated.version,
              },
            },
          });

          return {
            updatedSubmission: updated,
            invalidatedClaimIds: invalidated,
          };
        },
      );

      triggerOutboxPublish(submission.sessionId);
      triggerOutboxPublish(parsed.data.sessionId);
      return res.json({
        submission: publicSubmission(updatedSubmission),
        invalidatedClaimIds,
      });
    }),
  );

  // 5. Claims List for Session (GET /sessions/:id/claims)
  r.get(
    "/sessions/:id/claims",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID buổi học không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      const studentId =
        typeof req.query.studentId === "string"
          ? req.query.studentId
          : undefined;
      if (studentId && !safeId.safeParse(studentId).success)
        return fail(res, 400, "VALIDATION_ERROR", "studentId không hợp lệ");
      const claims = await db.claim.findMany({
        where: {
          sessionId: session.id,
          ...(studentId ? { studentId } : {}),
        },
        include: {
          ClaimRevision_claimId_items: { orderBy: { revision: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ claims });
    }),
  );

  // 6. Draft / Create Pending Claims (POST /sessions/:id/claims/draft) - supports manual teacher claim creation AND observation-based draft generation; 0-observation guard
  r.post(
    "/sessions/:id/claims/draft",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID buổi học không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      const parsed = ClaimDraftInput.safeParse(req.body ?? {});
      if (
        !parsed.success ||
        (parsed.data.studentId &&
          !safeId.safeParse(parsed.data.studentId).success) ||
        (parsed.data.evidenceIds &&
          parsed.data.evidenceIds.some((id) => !safeId.safeParse(id).success))
      )
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Dữ liệu dự thảo nhận định không hợp lệ",
        );

      const targetStudentId = parsed.data.studentId ?? session.primaryStudentId;

      if (parsed.data.text && parsed.data.evidenceIds) {
        const uniqueIds = [...new Set(parsed.data.evidenceIds)];
        const evidenceRows = await db.evidence.findMany({
          where: {
            id: { in: uniqueIds },
            sessionId: session.id,
            studentId: targetStudentId,
            status: "active",
            sessionIdRef: { teacherId: res.locals.actor.id },
          },
        });
        const hasObservation = evidenceRows.some(
          (e) =>
            e.isObservation &&
            e.kind !== "GoiYGiangDay" &&
            e.sourceType !== "ai_suggestion",
        );
        if (evidenceRows.length !== uniqueIds.length || !hasObservation)
          return fail(
            res,
            400,
            "VALIDATION_ERROR",
            "Nhận định bắt buộc gắn ít nhất 1 minh chứng quan sát hợp lệ của đúng học sinh trong buổi học",
          );
        const result = await createOnce(
          req,
          res,
          `/sessions/${session.id}/claims/draft`,
          async (tx) => {
            const current = await lockSession(tx, session.id);
            const currentEvidence = await tx.evidence.findMany({
              where: {
                id: { in: uniqueIds },
                sessionId: session.id,
                studentId: targetStudentId,
                status: "active",
              },
            });
            if (
              currentEvidence.length !== uniqueIds.length ||
              !currentEvidence.some(
                (e) =>
                  e.isObservation &&
                  e.kind !== "GoiYGiangDay" &&
                  e.sourceType !== "ai_suggestion",
              )
            )
              throw new SessionConflict(
                "VALIDATION_ERROR",
                "Minh chứng không còn hợp lệ",
              );
            for (const item of currentEvidence) {
              if (
                item.sourceType !== "note" &&
                (await resolveCurrentSourceVersion(
                  item.sourceType,
                  item.sourceId ?? item.submissionId,
                  item.sessionId,
                  tx,
                  item.studentId,
                )) !== item.sourceVersion
              )
                throw new SessionConflict(
                  "VERSION_CONFLICT",
                  "Nguồn minh chứng đã thay đổi",
                );
            }
            if (current.status === "reviewed") {
              const reopened = await tx.session.update({
                where: { id: session.id },
                data: { status: "ended", version: { increment: 1 } },
              });
              await appendOutboxEvent(tx, {
                sessionId: session.id,
                type: "review.reopened",
                label: "Mở lại duyệt do thêm nhận định",
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
                    reasonCode: "claim_created",
                  },
                },
              });
            }
            const created = await tx.claim.create({
              data: {
                sessionId: session.id,
                studentId: targetStudentId,
                text: parsed.data.text!,
                evidenceIds: uniqueIds,
                status: "pending",
                revision: 1,
              },
            });
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
                metadata: { nextStatus: "pending", revision: 1 },
              },
            });
            return created.id;
          },
        );
        if (!result) return;
        const claim = await db.claim.findUniqueOrThrow({
          where: { id: result.resourceId },
        });
        return res.status(201).json({ claim, claims: [claim] });
      }

      // Auto-draft from observation evidence (0-observation guard: never fabricate claims without observations)
      const observations = await db.evidence.findMany({
        where: {
          sessionId: session.id,
          ...(parsed.data.studentId
            ? { studentId: parsed.data.studentId }
            : {}),
          status: "active",
          isObservation: true,
          kind: { not: "GoiYGiangDay" },
          sourceType: { not: "ai_suggestion" },
        },
        orderBy: { createdAt: "asc" },
      });

      if (observations.length === 0) {
        return res.status(200).json({
          claims: [],
          message:
            "Chưa có minh chứng quan sát thực tế để tạo nhận định năng lực",
        });
      }

      const result = await createOnce(
        req,
        res,
        `/sessions/${session.id}/claims/draft`,
        async (tx) => {
          const current = await lockSession(tx, session.id);
          const liveObservations = await tx.evidence.findMany({
            where: {
              id: { in: observations.map((e) => e.id) },
              sessionId: session.id,
              status: "active",
              isObservation: true,
              kind: { not: "GoiYGiangDay" },
              sourceType: { not: "ai_suggestion" },
            },
          });
          if (liveObservations.length !== observations.length)
            throw new SessionConflict(
              "VERSION_CONFLICT",
              "Minh chứng đã thay đổi",
            );
          for (const item of liveObservations) {
            if (
              item.sourceType !== "note" &&
              (await resolveCurrentSourceVersion(
                item.sourceType,
                item.sourceId ?? item.submissionId,
                item.sessionId,
                tx,
                item.studentId,
              )) !== item.sourceVersion
            )
              throw new SessionConflict(
                "VERSION_CONFLICT",
                "Nguồn minh chứng đã thay đổi",
              );
          }
          if (current.status === "reviewed") {
            const reopened = await tx.session.update({
              where: { id: session.id },
              data: { status: "ended", version: { increment: 1 } },
            });
            await appendOutboxEvent(tx, {
              sessionId: session.id,
              type: "review.reopened",
              label: "Mở lại duyệt do thêm nhận định",
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
                  reasonCode: "claim_created",
                },
              },
            });
          }
          const byStudent = new Map<string, typeof observations>();
          for (const ob of observations) {
            const list = byStudent.get(ob.studentId) ?? [];
            list.push(ob);
            byStudent.set(ob.studentId, list);
          }
          let firstClaimId = "";
          for (const [stuId, items] of byStudent.entries()) {
            const evIds = items.map((i) => i.id);
            const independentCount = items.filter(
              (i) => i.support === "DocLap",
            ).length;
            const summaryText =
              parsed.data.text ??
              (independentCount > 0
                ? `Học sinh thực hiện được ${independentCount}/${items.length} nhiệm vụ độc lập (${items.map((i) => i.title).join(", ")}).`
                : `Học sinh hoàn thành ${items.length} minh chứng với sự hỗ trợ của giáo viên (${items.map((i) => i.title).join(", ")}).`);
            const created = await tx.claim.create({
              data: {
                sessionId: session.id,
                studentId: stuId,
                text: summaryText,
                evidenceIds: evIds,
                status: "pending",
                revision: 1,
              },
            });
            if (!firstClaimId) firstClaimId = created.id;
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
                metadata: { nextStatus: "pending", revision: 1 },
              },
            });
          }
          return firstClaimId;
        },
      );
      if (!result) return;
      const claims = await db.claim.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "desc" },
      });
      const primaryClaim =
        claims.find((c) => c.id === result.resourceId) ?? claims[0];
      return res.status(201).json({ claim: primaryClaim, claims });
    }),
  );

  // 7. Human Review Claim (PATCH /claims/:id/review) - validates ApprovalContext, appends ClaimRevision, reopens reviewed -> ended on edit
  r.patch(
    "/claims/:id/review",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID nhận định không hợp lệ");
      const parsed = ClaimReviewCommand.safeParse(req.body);
      if (!parsed.success)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Lệnh duyệt nhận định không hợp lệ",
        );
      const claim = await db.claim.findUnique({
        where: { id: req.params.id },
        include: { sessionIdRef: true },
      });
      if (!claim)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy nhận định");
      if (claim.sessionIdRef.teacherId !== res.locals.actor.id) {
        await audit(
          res.locals.actor,
          "security.denied",
          "claim",
          claim.id,
          res.locals.requestId,
        );
        return fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
      }
      const headerVer = versionHeader(req);
      if (headerVer === -1)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "If-Match-Version không hợp lệ",
        );
      if (
        claim.revision !== parsed.data.revision ||
        (headerVer !== null && claim.revision !== headerVer)
      )
        return fail(
          res,
          409,
          "VERSION_CONFLICT",
          "Nhận định đã thay đổi phiên bản",
        );

      const cmd = parsed.data;
      const updatedClaim = await db.$transaction(async (tx) => {
        const currentSession = await lockSession(tx, claim.sessionId);
        const currentClaim = await tx.claim.findUniqueOrThrow({
          where: { id: claim.id },
        });
        if (currentClaim.revision !== cmd.revision) return null;
        if (cmd.action === "approve" || cmd.action === "edit") {
          if (cmd.evidenceIds.some((id) => !safeId.safeParse(id).success))
            throw new SessionConflict(
              "VALIDATION_ERROR",
              "ID minh chứng không hợp lệ",
            );
          const evidenceRows = await tx.evidence.findMany({
            where: { id: { in: cmd.evidenceIds } },
            include: { sessionIdRef: { select: { teacherId: true } } },
          });
          const evidenceForApproval: EvidenceForApproval[] = [];
          for (const row of evidenceRows) {
            const sourceTypeParsed = z
              .enum([
                "note",
                "submission",
                "board_attempt",
                "check_response",
                "annotation",
                "ai_suggestion",
              ])
              .safeParse(row.sourceType);
            if (!sourceTypeParsed.success) continue;
            const sourceId = row.sourceId ?? row.submissionId ?? row.id;
            const currentSourceVersion =
              sourceTypeParsed.data === "note"
                ? row.sourceVersion
                : await resolveCurrentSourceVersion(
                    sourceTypeParsed.data,
                    sourceId,
                    row.sessionId,
                    tx,
                    row.studentId,
                  );
            const itemParsed = EvidenceForApproval.safeParse({
              id: row.id,
              teacherId: row.sessionIdRef.teacherId,
              studentId: row.studentId,
              sessionId: row.sessionId,
              kind: row.kind,
              status: row.status,
              isObservation: row.isObservation,
              version: row.version,
              currentEvidenceVersion: row.version,
              source: {
                type: sourceTypeParsed.data,
                id: sourceId,
                version: row.sourceVersion,
              },
              currentSourceVersion,
            });
            if (itemParsed.success) {
              evidenceForApproval.push(itemParsed.data);
            }
          }
          const approvalCheck = ApprovalContext.safeParse({
            teacherId: res.locals.actor.id,
            studentId: claim.studentId,
            sessionId: claim.sessionId,
            evidenceIds: cmd.evidenceIds,
            evidence: evidenceForApproval,
          });
          if (!approvalCheck.success)
            throw new SessionConflict(
              "VALIDATION_ERROR",
              "Minh chứng không còn hợp lệ",
            );
        }

        const nextStatus =
          cmd.action === "approve"
            ? "approved"
            : cmd.action === "reject"
              ? "rejected"
              : "pending";
        const nextText = cmd.action === "edit" ? cmd.text : claim.text;
        const nextEvidenceIds =
          cmd.action === "approve" || cmd.action === "edit"
            ? cmd.evidenceIds
            : claim.evidenceIds;
        const reason =
          cmd.action === "reject"
            ? (cmd.reason ?? "manual")
            : cmd.action === "edit"
              ? "claim_edited"
              : "manual";

        const changed = await tx.claim.updateMany({
          where: { id: claim.id, revision: cmd.revision },
          data: {
            text: nextText,
            evidenceIds: nextEvidenceIds,
            status: nextStatus,
            staleReason: cmd.action === "edit" ? "claim_edited" : null,
            reviewedBy: res.locals.actor.id,
            reviewedAt: new Date(),
            revision: { increment: 1 },
          },
        });
        if (!changed.count) return null;

        await tx.claimRevision.create({
          data: {
            claimId: claim.id,
            revision: claim.revision,
            text: claim.text,
            evidenceIds: claim.evidenceIds,
            status: claim.status,
            actorId: res.locals.actor.id,
            reason,
          },
        });

        if (cmd.action === "edit" && currentSession.status === "reviewed") {
          const reopened = nextSessionStatus(
            currentSession.status,
            "review_reopened",
          );
          if (reopened === "ended") {
            const updatedSession = await tx.session.update({
              where: { id: claim.sessionId },
              data: { status: "ended", version: { increment: 1 } },
            });
            await appendOutboxEvent(tx, {
              sessionId: claim.sessionId,
              type: "review.reopened",
              label: "Mở lại duyệt buổi học do chỉnh sửa nhận định",
              actorId: res.locals.actor.id,
              visibility: { scope: "teacher" },
              resourceId: claim.sessionId,
              version: updatedSession.version,
            });
          }
        }

        await appendOutboxEvent(tx, {
          sessionId: claim.sessionId,
          type: "claim.reviewed",
          label: "Cập nhật duyệt nhận định năng lực",
          actorId: res.locals.actor.id,
          visibility: { scope: "teacher" },
          resourceId: claim.id,
          version: cmd.revision + 1,
        });

        await tx.auditLog.create({
          data: {
            workspaceId: res.locals.actor.workspaceId,
            actorId: res.locals.actor.id,
            actorRole: "teacher",
            action: `claim.${cmd.action}`,
            targetType: "claim",
            targetId: claim.id,
            sessionId: claim.sessionId,
            requestId: res.locals.requestId,
            metadata: {
              previousStatus: claim.status,
              nextStatus,
              reasonCode: cmd.action === "edit" ? "claim_edited" : "manual",
              revision: cmd.revision + 1,
            },
          },
        });

        return tx.claim.findUniqueOrThrow({
          where: { id: claim.id },
          include: {
            ClaimRevision_claimId_items: { orderBy: { revision: "desc" } },
          },
        });
      });

      if (!updatedClaim)
        return fail(
          res,
          409,
          "VERSION_CONFLICT",
          "Nhận định đã thay đổi phiên bản",
        );
      triggerOutboxPublish(claim.sessionId);
      return res.json({ claim: updatedClaim });
    }),
  );

  // 8. Complete Session Review (POST /sessions/:id/complete-review) - validates ReviewCompletionContext (ended -> reviewed, allows 0 claims with reviewNote)
  r.post(
    "/sessions/:id/complete-review",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID buổi học không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      const parsed = CompleteReviewCommand.safeParse(req.body ?? {});
      if (!parsed.success)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Dữ liệu hoàn tất duyệt không hợp lệ",
        );
      const updated = await db.$transaction(async (tx) => {
        const current = await lockSession(tx, session.id);
        if (current.status !== "ended")
          throw new SessionConflict(
            "SESSION_STATE_INVALID",
            "Chỉ có thể duyệt buổi học đã kết thúc",
          );
        const [totalClaims, pendingClaims] = await Promise.all([
          tx.claim.count({ where: { sessionId: session.id } }),
          tx.claim.count({
            where: { sessionId: session.id, status: "pending" },
          }),
        ]);
        const effectiveNote =
          parsed.data.reviewNote ?? current.reviewNote ?? undefined;
        if (
          !ReviewCompletionContext.safeParse({
            status: current.status,
            totalClaims,
            pendingClaims,
            ...(effectiveNote ? { reviewNote: effectiveNote } : {}),
          }).success
        )
          throw new SessionConflict(
            "VALIDATION_ERROR",
            pendingClaims
              ? "Cần duyệt hoặc từ chối hết nhận định đang chờ"
              : "Cần ghi chú khi không có nhận định",
          );
        const next = nextSessionStatus(current.status, "complete_review");
        if (next !== "reviewed") throw new Error("INVALID_STATE");
        const row = await tx.session.update({
          where: { id: session.id },
          data: {
            status: "reviewed",
            reviewedAt: new Date(),
            reviewNote: effectiveNote ?? null,
            version: { increment: 1 },
          },
          include: {
            Activity_sessionId_items: { orderBy: { order: "asc" } },
            RoomMember_sessionId_items: true,
          },
        });
        await tx.auditLog.create({
          data: {
            workspaceId: res.locals.actor.workspaceId,
            actorId: res.locals.actor.id,
            actorRole: "teacher",
            action: "session.review_completed",
            targetType: "session",
            targetId: session.id,
            sessionId: session.id,
            requestId: res.locals.requestId,
            metadata: {
              previousStatus: "ended",
              nextStatus: "reviewed",
            },
          },
        });
        return row;
      });
      return res.json({ session: updated });
    }),
  );

  // 9. Create Next Session from Approved Claims (POST /sessions/:id/next-session)
  r.post(
    "/sessions/:id/next-session",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID buổi học không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      if (session.status !== "reviewed" && session.status !== "ended")
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Cần kết thúc buổi học trước khi tạo buổi học kế tiếp",
        );

      const result = await createOnce(
        req,
        res,
        `/sessions/${session.id}/next-session`,
        async (tx) => {
          const members = await tx.roomMember.findMany({
            where: { sessionId: session.id },
            include: { studentIdRef: true },
          });
          const activeStudentIds = members
            .filter((m) => m.studentIdRef.status === "active")
            .map((m) => m.studentId);
          const studentIds = activeStudentIds.length
            ? activeStudentIds
            : [session.primaryStudentId];

          const rawClaims = await tx.claim.findMany({
            where: { sessionId: session.id, status: "approved" },
            orderBy: { updatedAt: "desc" },
          });
          const eligibleClaims = await filterEligibleApprovedClaims(
            rawClaims,
            res.locals.actor.id,
          );

          const nextDate = new Date(Date.now() + 7 * 86400_000)
            .toISOString()
            .slice(0, 10);
          const created = await tx.session.create({
            data: {
              teacherId: res.locals.actor.id,
              primaryStudentId: studentIds[0],
              groupId: session.groupId,
              groupName: session.groupName,
              title:
                typeof req.body?.title === "string" && req.body.title.trim()
                  ? req.body.title.trim()
                  : `${session.title} (Buổi tiếp theo)`,
              goal:
                eligibleClaims.length > 0
                  ? `Tiếp nối từ ${eligibleClaims.length} nhận định đã duyệt của buổi trước`
                  : session.goal,
              sharedGoal: session.sharedGoal,
              date: nextDate,
              time: session.time,
              duration: session.duration,
              status: "draft",
              tools: session.tools as Prisma.InputJsonValue,
              completedActivityIds: [],
              dismissedSuggestionIds: [],
              RoomMember_sessionId_items: {
                create: studentIds.map((studentId) => ({ studentId })),
              },
              ...(eligibleClaims.length > 0
                ? {
                    Activity_sessionId_items: {
                      create: eligibleClaims.map((cl, idx) => ({
                        order: idx,
                        title: `Hoạt động củng cố ${idx + 1}`,
                        description:
                          "Hoạt động luyện tập tiếp nối dựa trên kết quả buổi trước.",
                        teacherNotes: cl.text,
                        duration: 20,
                        type: "LuyenTap" as const,
                        sourceEvidenceIds: cl.evidenceIds,
                        sourceClaimRefs: [
                          { claimId: cl.id, revision: cl.revision },
                        ] as Prisma.InputJsonValue,
                      })),
                    },
                  }
                : {}),
            },
          });
          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "session.next_created",
              targetType: "session",
              targetId: created.id,
              sessionId: created.id,
              requestId: res.locals.requestId,
              metadata: { previousStatus: session.status, nextStatus: "draft" },
            },
          });
          return created.id;
        },
      );
      if (!result) return;
      return res.status(201).json({
        session: await db.session.findUniqueOrThrow({
          where: { id: result.resourceId },
          include: {
            Activity_sessionId_items: { orderBy: { order: "asc" } },
            RoomMember_sessionId_items: true,
          },
        }),
      });
    }),
  );

  return r;
}
