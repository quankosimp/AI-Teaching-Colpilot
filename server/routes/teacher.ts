import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  ActivityInput,
  AnnotationInput,
  SessionCreate,
  StudentInput,
} from "../../contracts/api.js";
import {
  asyncRoute,
  audit,
  db,
  fail,
  requireTeacher,
  type AppConfig,
  type TeacherActor,
} from "../context.js";
import { createOnce } from "../idempotency.js";
import { ClaimRef } from "../../contracts/domain.js";
import type { Request, Response } from "express";

async function ownedStudent(id: string, actor: TeacherActor, res: Response) {
  const item = await db.student.findUnique({ where: { id } });
  if (item && item.teacherId !== actor.id) {
    await audit(actor, "security.denied", "student", id, res.locals.requestId);
    fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
    return null;
  }
  if (!item) {
    fail(res, 404, "NOT_FOUND", "Không tìm thấy học sinh");
    return null;
  }
  return item;
}
async function ownedSession(id: string, actor: TeacherActor, res: Response) {
  const item = await db.session.findUnique({ where: { id } });
  if (item && item.teacherId !== actor.id) {
    await audit(actor, "security.denied", "session", id, res.locals.requestId);
    fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
    return null;
  }
  if (!item) {
    fail(res, 404, "NOT_FOUND", "Không tìm thấy buổi học");
    return null;
  }
  return item;
}
const version = (req: Request) => {
  const value = Number(req.get("If-Match-Version"));
  return Number.isInteger(value) && value > 0 ? value : null;
};
const safeId = z.uuid();
type SessionDetails = Prisma.SessionGetPayload<{
  include: { Activity_sessionId_items: true; RoomMember_sessionId_items: true };
}>;
async function markStale(sessions: SessionDetails[], teacherId: string) {
  const activities = sessions.flatMap(
    (session) => session.Activity_sessionId_items,
  );
  const claimIds = activities.flatMap((activity) => {
    const result = z.array(ClaimRef).safeParse(activity.sourceClaimRefs);
    return result.success
      ? result.data
          .map((ref) => ref.claimId)
          .filter((id) => safeId.safeParse(id).success)
      : [];
  });
  const evidenceIds = activities.flatMap((activity) =>
    activity.sourceEvidenceIds.filter((id) => safeId.safeParse(id).success),
  );
  const [claims, evidence] = await Promise.all([
    db.claim.findMany({
      where: { id: { in: claimIds }, sessionIdRef: { teacherId } },
      select: { id: true, status: true, revision: true },
    }),
    db.evidence.findMany({
      where: { id: { in: evidenceIds }, sessionIdRef: { teacherId } },
      select: { id: true, status: true },
    }),
  ]);
  return sessions.map((session) => ({
    ...session,
    Activity_sessionId_items: session.Activity_sessionId_items.map(
      (activity) => {
        const refs = z.array(ClaimRef).safeParse(activity.sourceClaimRefs);
        return {
          ...activity,
          isSourceStale:
            !refs.success ||
            activity.sourceEvidenceIds.some(
              (id) =>
                !evidence.some(
                  (item) => item.id === id && item.status === "active",
                ),
            ) ||
            refs.data.some(
              (ref) =>
                !claims.some(
                  (claim) =>
                    claim.id === ref.claimId &&
                    claim.status === "approved" &&
                    claim.revision === ref.revision,
                ),
            ),
        };
      },
    ),
  }));
}
const studentCreate = StudentInput.extend({
  initials: z.string().min(1).max(6),
  color: z.string().max(40),
});
export function teacherRouter(config: AppConfig) {
  const r = Router();
  r.use(requireTeacher(config));
  r.get(
    "/students",
    asyncRoute(async (_req, res) =>
      res.json({
        students: await db.student.findMany({
          where: { teacherId: res.locals.actor.id },
          orderBy: { createdAt: "asc" },
        }),
      }),
    ),
  );
  r.post(
    "/students",
    asyncRoute(async (req, res) => {
      const parsed = studentCreate.safeParse(req.body);
      if (!parsed.success)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Dữ liệu học sinh không hợp lệ",
        );
      const result = await createOnce(req, res, "/students", async (tx) => {
        const student = await tx.student.create({
          data: {
            ...parsed.data,
            teacherId: res.locals.actor.id,
            archivedAt: parsed.data.status === "archived" ? new Date() : null,
          },
        });
        await tx.auditLog.create({
          data: {
            workspaceId: res.locals.actor.workspaceId,
            actorId: res.locals.actor.id,
            actorRole: "teacher",
            action: "student.created",
            targetType: "student",
            targetId: student.id,
            requestId: res.locals.requestId,
            metadata: {},
          },
        });
        return student.id;
      });
      if (!result) return;
      return res.status(201).json({
        student: await db.student.findUniqueOrThrow({
          where: { id: result.resourceId },
        }),
      });
    }),
  );
  r.patch(
    "/students/:id",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const old = await ownedStudent(req.params.id, res.locals.actor, res);
      if (!old) return;
      const parsed = studentCreate.partial().strict().safeParse(req.body);
      const expected = version(req);
      if (!parsed.success || !expected)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Dữ liệu hoặc phiên bản không hợp lệ",
        );
      const changed = await db.$transaction(async (tx) => {
        const result = await tx.student.updateMany({
          where: {
            id: old.id,
            teacherId: res.locals.actor.id,
            version: expected,
          },
          data: {
            ...parsed.data,
            ...(parsed.data.status
              ? {
                  archivedAt:
                    parsed.data.status === "archived" ? new Date() : null,
                }
              : {}),
            version: { increment: 1 },
          },
        });
        if (result.count)
          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "student.updated",
              targetType: "student",
              targetId: old.id,
              requestId: res.locals.requestId,
              metadata: {},
            },
          });
        return result;
      });
      if (!changed.count)
        return fail(res, 409, "VERSION_CONFLICT", "Hồ sơ đã thay đổi");
      return res.json({
        student: await db.student.findUniqueOrThrow({ where: { id: old.id } }),
      });
    }),
  );
  r.get(
    "/students/:id/history",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const student = await ownedStudent(req.params.id, res.locals.actor, res);
      if (!student) return;
      return res.json({
        claims: await db.claim.findMany({
          where: {
            studentId: student.id,
            sessionIdRef: { teacherId: res.locals.actor.id },
            status: "approved",
          },
          select: {
            id: true,
            sessionId: true,
            studentId: true,
            text: true,
            evidenceIds: true,
            revision: true,
            reviewedAt: true,
          },
          orderBy: { updatedAt: "desc" },
        }),
      });
    }),
  );
  r.get(
    "/evidence/:id",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const evidence = await db.evidence.findUnique({
        where: { id: req.params.id },
        include: { sessionIdRef: { select: { teacherId: true } } },
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
      const sourceId = evidence.sourceId ?? evidence.submissionId;
      let source: unknown = null;
      if (sourceId && safeId.safeParse(sourceId).success) {
        if (evidence.sourceType === "submission")
          source = await db.submission.findFirst({
            where: {
              id: sourceId,
              sessionId: evidence.sessionId,
              studentId: evidence.studentId,
            },
            select: {
              id: true,
              title: true,
              answer: true,
              fileName: true,
              version: true,
            },
          });
        if (evidence.sourceType === "board_attempt")
          source = await db.boardAttempt.findFirst({
            where: {
              id: sourceId,
              sessionId: evidence.sessionId,
              studentId: evidence.studentId,
            },
          });
        if (evidence.sourceType === "check_response")
          source = await db.checkResponse.findFirst({
            where: {
              id: sourceId,
              sessionId: evidence.sessionId,
              studentId: evidence.studentId,
            },
          });
        if (evidence.sourceType === "annotation")
          source = await db.annotation.findFirst({
            where: { id: sourceId, sessionId: evidence.sessionId },
          });
      }
      const { sessionIdRef: _owner, ...item } = evidence;
      return res.json({ evidence: item, source });
    }),
  );
  r.get(
    "/sessions",
    asyncRoute(async (_req, res) => {
      const sessions = await db.session.findMany({
        where: { teacherId: res.locals.actor.id },
        include: {
          Activity_sessionId_items: { orderBy: { order: "asc" } },
          RoomMember_sessionId_items: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return res.json({
        sessions: await markStale(sessions, res.locals.actor.id),
      });
    }),
  );
  r.get(
    "/sessions/:id",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      const full = await db.session.findUniqueOrThrow({
        where: { id: session.id },
        include: {
          Activity_sessionId_items: { orderBy: { order: "asc" } },
          RoomMember_sessionId_items: true,
        },
      });
      return res.json({
        session: (await markStale([full], res.locals.actor.id))[0],
      });
    }),
  );
  r.post(
    "/sessions",
    asyncRoute(async (req, res) => {
      const parsed = SessionCreate.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Kế hoạch không hợp lệ");
      const { studentIds, ...data } = parsed.data;
      if (!studentIds.every((id) => safeId.safeParse(id).success))
        return fail(res, 400, "VALIDATION_ERROR", "ID học sinh không hợp lệ");
      const count = await db.student.count({
        where: {
          id: { in: studentIds },
          teacherId: res.locals.actor.id,
          status: "active",
        },
      });
      if (count !== studentIds.length)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Học sinh không hợp lệ hoặc đã lưu trữ",
        );
      const result = await createOnce(req, res, "/sessions", async (tx) => {
        const session = await tx.session.create({
          data: {
            ...data,
            teacherId: res.locals.actor.id,
            primaryStudentId: studentIds[0],
            completedActivityIds: [],
            dismissedSuggestionIds: [],
            RoomMember_sessionId_items: {
              create: studentIds.map((studentId) => ({ studentId })),
            },
          },
        });
        await tx.auditLog.create({
          data: {
            workspaceId: res.locals.actor.workspaceId,
            actorId: res.locals.actor.id,
            actorRole: "teacher",
            action: "session.created",
            targetType: "session",
            targetId: session.id,
            requestId: res.locals.requestId,
            metadata: {},
          },
        });
        return session.id;
      });
      if (!result) return;
      return res.status(201).json({
        session: await db.session.findUniqueOrThrow({
          where: { id: result.resourceId },
        }),
      });
    }),
  );
  r.patch(
    "/sessions/:id",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      if (!["draft", "scheduled"].includes(session.status))
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Không thể sửa buổi này",
        );
      const patch = SessionCreate.omit({ studentIds: true })
        .partial()
        .extend({ status: z.enum(["draft", "scheduled"]).optional() })
        .strict()
        .safeParse(req.body);
      const expected = version(req);
      if (!patch.success || !expected)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Dữ liệu hoặc phiên bản không hợp lệ",
        );
      const changed = await db.$transaction(async (tx) => {
        const result = await tx.session.updateMany({
          where: {
            id: session.id,
            teacherId: res.locals.actor.id,
            version: expected,
            status: { in: ["draft", "scheduled"] },
          },
          data: { ...patch.data, version: { increment: 1 } },
        });
        if (result.count)
          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "session.updated",
              targetType: "session",
              targetId: session.id,
              sessionId: session.id,
              requestId: res.locals.requestId,
              metadata: {},
            },
          });
        return result;
      });
      if (!changed.count)
        return fail(res, 409, "VERSION_CONFLICT", "Buổi học đã thay đổi");
      return res.json({
        session: await db.session.findUniqueOrThrow({
          where: { id: session.id },
        }),
      });
    }),
  );
  r.delete(
    "/sessions/:id/members/:studentId",
    asyncRoute(async (req, res) => {
      if (
        !safeId.safeParse(req.params.id).success ||
        !safeId.safeParse(req.params.studentId).success
      )
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      if (session.status !== "draft")
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Chỉ sửa thành viên của bản nháp",
        );
      const expected = version(req);
      if (!expected)
        return fail(res, 400, "VALIDATION_ERROR", "Cần phiên bản buổi học");
      const members = await db.roomMember.findMany({
        where: { sessionId: session.id },
      });
      if (!members.some((m) => m.studentId === req.params.studentId))
        return fail(res, 404, "NOT_FOUND", "Thành viên không tồn tại");
      const remaining = members.filter(
        (m) => m.studentId !== req.params.studentId,
      );
      if (!remaining.length)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Buổi học cần ít nhất một học sinh",
        );
      const updated = await db.$transaction(async (tx) => {
        const changed = await tx.session.updateMany({
          where: {
            id: session.id,
            teacherId: res.locals.actor.id,
            version: expected,
            status: "draft",
          },
          data: {
            primaryStudentId:
              session.primaryStudentId === req.params.studentId
                ? remaining[0].studentId
                : session.primaryStudentId,
            version: { increment: 1 },
          },
        });
        if (!changed.count) return false;
        await tx.roomMember.deleteMany({
          where: { sessionId: session.id, studentId: req.params.studentId },
        });
        await tx.auditLog.create({
          data: {
            workspaceId: res.locals.actor.workspaceId,
            actorId: res.locals.actor.id,
            actorRole: "teacher",
            action: "session.member_removed",
            targetType: "session",
            targetId: session.id,
            sessionId: session.id,
            requestId: res.locals.requestId,
            metadata: {},
          },
        });
        return true;
      });
      if (!updated)
        return fail(res, 409, "VERSION_CONFLICT", "Buổi học đã thay đổi");
      return res.status(204).end();
    }),
  );
  r.get(
    "/sessions/:id/annotations",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      const annotations = await db.annotation.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "asc" },
      });
      return res.json({ annotations });
    }),
  );
  r.post(
    "/sessions/:id/annotations",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      const parsed = AnnotationInput.safeParse(req.body);
      if (
        !parsed.success ||
        ![
          parsed.data.activityId,
          parsed.data.materialId,
          ...(parsed.data.studentId ? [parsed.data.studentId] : []),
        ].every((id) => safeId.safeParse(id).success)
      )
        return fail(res, 400, "VALIDATION_ERROR", "Chú thích không hợp lệ");
      const input = parsed.data;
      const activity = await db.activity.findFirst({
        where: {
          id: input.activityId,
          sessionId: session.id,
          materialId: input.materialId,
          materialVersion: input.materialVersion,
        },
      });
      const material = await db.materialVersion.findFirst({
        where: {
          materialId: input.materialId,
          version: input.materialVersion,
          uploadStatus: "ready",
          materialIdRef: { teacherId: res.locals.actor.id },
        },
      });
      const member =
        input.studentId &&
        (await db.roomMember.findUnique({
          where: {
            sessionId_studentId: {
              sessionId: session.id,
              studentId: input.studentId,
            },
          },
        }));
      if (!activity || !material || (input.studentId && !member))
        return fail(
          res,
          403,
          "PERMISSION_DENIED",
          "Nguồn hoặc học sinh không thuộc buổi học",
        );
      const result = await createOnce(
        req,
        res,
        `/sessions/${session.id}/annotations`,
        async (tx) => {
          const annotation = await tx.annotation.create({
            data: {
              sessionId: session.id,
              activityId: input.activityId,
              materialId: input.materialId,
              materialVersion: input.materialVersion,
              page: input.page,
              x: input.x,
              y: input.y,
              text: input.text,
              authorId: res.locals.actor.id,
            },
          });
          if (input.studentId)
            await tx.evidence.create({
              data: {
                sessionId: session.id,
                activityId: input.activityId,
                studentId: input.studentId,
                kind: "ChuThichDe",
                title: "Chú thích đề",
                detail: input.text,
                support: "ChuaRo",
                sourceType: "annotation",
                sourceId: annotation.id,
                sourceVersion: 1,
                isObservation: true,
                createdBy: res.locals.actor.id,
              },
            });
          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "annotation.created",
              targetType: "annotation",
              targetId: annotation.id,
              requestId: res.locals.requestId,
              metadata: {},
            },
          });
          return annotation.id;
        },
      );
      if (!result) return;
      return res.status(201).json({
        annotation: await db.annotation.findUniqueOrThrow({
          where: { id: result.resourceId },
        }),
      });
    }),
  );
  r.put(
    "/sessions/:id/activities",
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      if (!["draft", "scheduled"].includes(session.status))
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Không thể sửa buổi này",
        );
      const parsed = z.array(ActivityInput).max(50).safeParse(req.body);
      const expected = version(req);
      if (!parsed.success || !expected)
        return fail(res, 400, "VALIDATION_ERROR", "Hoạt động không hợp lệ");
      const materialIds = parsed.data.flatMap((a) =>
        a.materialId ? [a.materialId] : [],
      );
      const sourceIds = parsed.data.flatMap((a) => a.sourceEvidenceIds);
      const claimRefs = parsed.data.flatMap((a) => a.sourceClaimRefs);
      if (
        [...materialIds, ...sourceIds, ...claimRefs.map((r) => r.claimId)].some(
          (id) => !safeId.safeParse(id).success,
        )
      )
        return fail(res, 400, "VALIDATION_ERROR", "Nguồn không hợp lệ");
      const [materials, sources, claims, members] = await Promise.all([
        db.material.findMany({
          where: { id: { in: materialIds }, teacherId: res.locals.actor.id },
          include: {
            MaterialVersion_materialId_items: {
              where: { uploadStatus: "ready" },
            },
          },
        }),
        db.evidence.findMany({
          where: {
            id: { in: sourceIds },
            status: "active",
            sessionIdRef: { teacherId: res.locals.actor.id },
          },
        }),
        db.claim.findMany({
          where: {
            id: { in: claimRefs.map((r) => r.claimId) },
            status: "approved",
            sessionIdRef: { teacherId: res.locals.actor.id },
          },
        }),
        db.roomMember.findMany({
          where: { sessionId: session.id },
          select: { studentId: true },
        }),
      ]);
      if (
        parsed.data.some((item) =>
          item.materialId
            ? !materials.some(
                (m) =>
                  m.id === item.materialId &&
                  m.MaterialVersion_materialId_items.some(
                    (v) => v.version === item.materialVersion,
                  ),
              )
            : item.materialVersion != null,
        ) ||
        sourceIds.some(
          (id) =>
            !sources.some(
              (source) =>
                source.id === id &&
                members.some(
                  (member) => member.studentId === source.studentId,
                ) &&
                claims.some(
                  (claim) =>
                    claim.studentId === source.studentId &&
                    claim.evidenceIds.includes(id) &&
                    claimRefs.some(
                      (ref) =>
                        ref.claimId === claim.id &&
                        ref.revision === claim.revision,
                    ),
                ),
            ),
        ) ||
        claimRefs.some(
          (ref) =>
            !claims.some(
              (c) =>
                c.id === ref.claimId &&
                c.revision === ref.revision &&
                members.some((m) => m.studentId === c.studentId),
            ),
        )
      )
        return fail(res, 403, "PERMISSION_DENIED", "Nguồn không khả dụng");
      try {
        const result = await db.$transaction(async (tx) => {
          const changed = await tx.session.updateMany({
            where: {
              id: session.id,
              teacherId: res.locals.actor.id,
              version: expected,
              status: { in: ["draft", "scheduled"] },
            },
            data: { version: { increment: 1 } },
          });
          if (!changed.count) return null;
          const existing = await tx.activity.findMany({
            where: { sessionId: session.id },
            select: { id: true },
          });
          const incoming = parsed.data.flatMap((a) => (a.id ? [a.id] : []));
          if (
            incoming.some((id) => !existing.some((a) => a.id === id)) ||
            new Set(incoming).size !== incoming.length
          )
            throw new Error("INVALID_ACTIVITY");
          await tx.activity.deleteMany({
            where: { sessionId: session.id, id: { notIn: incoming } },
          });
          for (const [order, item] of parsed.data.entries()) {
            const { id, ...rest } = item;
            const data = {
              ...rest,
              order,
              sourceClaimRefs: rest.sourceClaimRefs as Prisma.InputJsonValue,
            };
            if (id) await tx.activity.update({ where: { id }, data });
            else
              await tx.activity.create({
                data: { ...data, sessionId: session.id },
              });
          }
          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "session.activities_updated",
              targetType: "session",
              targetId: session.id,
              sessionId: session.id,
              requestId: res.locals.requestId,
              metadata: {},
            },
          });
          return tx.session.findUniqueOrThrow({
            where: { id: session.id },
            include: {
              Activity_sessionId_items: { orderBy: { order: "asc" } },
            },
          });
        });
        if (!result)
          return fail(res, 409, "VERSION_CONFLICT", "Buổi học đã thay đổi");
        return res.json({
          session: result,
          durationExceeded:
            parsed.data.reduce((sum, item) => sum + item.duration, 0) >
            result.duration,
        });
      } catch {
        return fail(
          res,
          409,
          "VALIDATION_ERROR",
          "Hoạt động không thể cập nhật",
        );
      }
    }),
  );
  return r;
}
