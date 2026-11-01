import { Router, type Request, type Response } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  AdmitCommand,
  CheckInput,
  CheckResponseInput,
  CheckResponseReviewInput,
  ClassroomStatePatch,
  CreateInviteResponse,
  GradeInput,
  InviteCommand,
  InvitePreviewInput,
  InvitePreviewResponse,
  InviteSummary,
  JoinRequest,
  MAX_UPLOAD_BYTES,
  MemberUpdate,
  MessageInput,
  QuickCheckStatusUpdate,
  ReactionInput,
  StudentAuthResponse,
  StudentBoardCommand,
  StudentRefreshInput,
  SubmissionInput,
  UploadIntent,
} from "../../contracts/api.js";
import {
  Stroke,
  StudentToolWriteContext,
  Tools,
  nextSessionStatus,
} from "../../contracts/domain.js";
import {
  StudentSubmission,
  validateStudentRoomProjection,
} from "../../contracts/ui.js";
import {
  asyncRoute,
  audit,
  db,
  fail,
  requireClassroomActor,
  requireStudent,
  requireTeacher,
  type AppConfig,
  type StudentActor,
  type TeacherActor,
} from "../context.js";
import { createOnce, lookupReplay } from "../idempotency.js";
import {
  appendOutboxEvent,
  disconnectStudentSockets,
  triggerOutboxPublish,
} from "../realtime.js";
import { signature, storage } from "./materials.js";

const safeId = z.uuid();
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");

const versionHeader = (req: Request) => {
  const raw = req.get("If-Match-Version");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : -1;
};

async function signStudentAccess(
  config: AppConfig,
  input: {
    studentId: string;
    grantId: string;
    teacherId: string;
    sessionId: string;
    memberId: string;
  },
) {
  return new SignJWT({
    sid: input.grantId,
    tid: input.teacherId,
    ses: input.sessionId,
    mid: input.memberId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("teaching-copilot")
    .setAudience("student")
    .setSubject(input.studentId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(config.jwtSecret);
}

export function toInviteSummary(invite: {
  id: string;
  studentId: string;
  maskedHint: string;
  expiresAt: Date;
  revokedAt: Date | null;
}): InviteSummary {
  const now = new Date();
  const state = invite.revokedAt
    ? "revoked"
    : invite.expiresAt <= now
      ? "expired"
      : "active";
  return InviteSummary.parse({
    id: invite.id,
    studentId: invite.studentId,
    maskedHint: invite.maskedHint.slice(-4).padStart(4, "0"),
    expiresAt: invite.expiresAt.toISOString(),
    state,
  });
}

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

async function checkStudentToolAccess(
  actor: StudentActor,
  sessionId: string,
  toolKey: keyof z.infer<typeof Tools> | "reaction",
  res: Response,
) {
  if (actor.sessionId !== sessionId) {
    await audit(
      actor,
      "security.denied",
      "session",
      sessionId,
      res.locals.requestId,
      actor.sessionId,
    );
    fail(res, 403, "PERMISSION_DENIED", "Không thuộc buổi học này");
    return null;
  }
  const [session, member, grant] = await Promise.all([
    db.session.findUnique({ where: { id: sessionId } }),
    db.roomMember.findUnique({ where: { id: actor.memberId } }),
    db.studentRoomSession.findUnique({ where: { id: actor.grantId } }),
  ]);
  if (!session || session.teacherId !== actor.teacherId) {
    fail(res, 404, "NOT_FOUND", "Không tìm thấy buổi học");
    return null;
  }
  if (!grant || grant.revokedAt || grant.expiresAt <= new Date()) {
    fail(res, 401, "INVITE_INVALID", "Phiên tham gia đã bị thu hồi");
    return null;
  }
  if (session.status !== "live") {
    fail(
      res,
      409,
      "SESSION_NOT_LIVE",
      "Buổi học chưa bắt đầu hoặc đã kết thúc",
    );
    return null;
  }
  if (!member || member.state !== "joined") {
    fail(
      res,
      403,
      "PERMISSION_DENIED",
      "Cần giáo viên duyệt vào phòng trước khi thao tác",
    );
    return null;
  }
  const sessionTools = Tools.safeParse(session.tools).success
    ? Tools.parse(session.tools)
    : { board: true, upload: true, check: true, chat: true };
  const overrides =
    Tools.partial().safeParse(member.toolOverrides ?? {}).data ?? {};
  const toolEnabled =
    toolKey === "reaction" ? true : Boolean(sessionTools[toolKey]);
  const memberToolEnabled =
    toolKey === "reaction"
      ? true
      : overrides[toolKey] !== undefined
        ? Boolean(overrides[toolKey])
        : true;
  const ctx = StudentToolWriteContext.safeParse({
    status: session.status,
    memberState: member.state,
    memberBelongsToSession:
      member.sessionId === session.id && member.studentId === actor.studentId,
    roomSessionValid: !grant.revokedAt && grant.expiresAt > new Date(),
    canWrite: member.canWrite,
    toolEnabled,
    memberToolEnabled,
  });
  if (!ctx.success) {
    await audit(
      actor,
      "security.denied",
      "tool",
      toolKey,
      res.locals.requestId,
      session.id,
    );
    fail(
      res,
      403,
      "PERMISSION_DENIED",
      "Công cụ học tập hiện đang khóa hoặc không có quyền ghi",
    );
    return null;
  }
  return { session, member, grant, sessionTools };
}

async function resolveBoardTarget(
  session: { id: string; currentActivityId: string | null },
  boardKey: string,
  queryActivityId: string | undefined,
  actor: TeacherActor | StudentActor,
) {
  const parts = boardKey.split(":");
  let activityId: string | null = null;
  let ownerId: string;
  if (parts.length === 3 && parts[0] === session.id) {
    activityId = parts[1];
    ownerId = parts[2];
  } else if (parts.length === 2) {
    activityId = parts[0];
    ownerId = parts[1];
  } else {
    ownerId =
      boardKey === "own" && actor.role === "student"
        ? actor.studentId
        : boardKey;
    activityId = queryActivityId || session.currentActivityId;
  }
  if (!activityId) {
    const first = await db.activity.findFirst({
      where: { sessionId: session.id },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    activityId = first?.id ?? null;
  }
  if (!activityId || !safeId.safeParse(activityId).success) return null;
  const activity = await db.activity.findFirst({
    where: { id: activityId, sessionId: session.id },
    select: { id: true },
  });
  if (!activity) return null;
  if (ownerId !== "common" && !safeId.safeParse(ownerId).success) return null;
  return {
    boardId: `${session.id}:${activity.id}:${ownerId}`,
    activityId: activity.id,
    ownerId,
  };
}

const chatBuckets = new Map<string, number[]>();
function allowChatRate(actorKey: string) {
  const now = Date.now();
  const recent = (chatBuckets.get(actorKey) ?? []).filter(
    (t) => now - t < 10_000,
  );
  if (recent.length >= 20) return false;
  recent.push(now);
  chatBuckets.set(actorKey, recent);
  return true;
}

export function classroomRouter(config: AppConfig) {
  const r = Router();

  // 1. Invite list (Teacher) - returns summaries only, never plaintext token
  r.get(
    "/sessions/:id/invites",
    requireTeacher(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID buổi học không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      const rows = await db.invite.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ invites: rows.map(toInviteSummary) });
    }),
  );

  // 2. Create or Rotate Invite (Teacher) - preserves joined RoomMember & StudentRoomSession grants
  r.post(
    "/sessions/:id/invites",
    requireTeacher(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID buổi học không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      if (session.status === "ended" || session.status === "reviewed")
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Không thể tạo mã mời cho buổi học đã kết thúc",
        );
      const parsed = InviteCommand.safeParse(req.body);
      if (!parsed.success || !safeId.safeParse(parsed.data.studentId).success)
        return fail(res, 400, "VALIDATION_ERROR", "Dữ liệu mời không hợp lệ");
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
          404,
          "NOT_FOUND",
          "Học sinh không thuộc danh sách buổi học",
        );
      const expiresAt = parsed.data.expiresAt
        ? new Date(parsed.data.expiresAt)
        : new Date(Date.now() + 4 * 3600_000);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Thời hạn mã mời phải ở tương lai",
        );
      const rawToken = randomToken();
      const tokenHash = digest(rawToken);
      const maskedHint = rawToken.slice(-4);
      const invite = await db.$transaction(async (tx) => {
        await tx.invite.updateMany({
          where: {
            sessionId: session.id,
            studentId: parsed.data.studentId,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        if (member.state === "left") {
          await tx.roomMember.update({
            where: { id: member.id },
            data: { state: "invited", leftAt: null },
          });
        }
        const created = await tx.invite.create({
          data: {
            sessionId: session.id,
            studentId: parsed.data.studentId,
            tokenHash,
            maskedHint,
            expiresAt,
            createdBy: res.locals.actor.id,
          },
        });
        await tx.auditLog.create({
          data: {
            workspaceId: res.locals.actor.workspaceId,
            actorId: res.locals.actor.id,
            actorRole: "teacher",
            action: "invite.created",
            targetType: "invite",
            targetId: created.id,
            sessionId: session.id,
            requestId: res.locals.requestId,
            metadata: {},
          },
        });
        return created;
      });
      const summary = toInviteSummary(invite);
      const inviteUrl = `${config.origin}/?invite=${encodeURIComponent(rawToken)}`;
      return res.status(201).json(
        CreateInviteResponse.parse({
          rawToken,
          inviteUrl,
          expiresAt: invite.expiresAt.toISOString(),
          invite: summary,
        }),
      );
    }),
  );

  // 3. Explicit Revoke Invite (Teacher) - revokes invite, StudentRoomSession grants, sets member left, disconnects sockets
  r.post(
    "/sessions/:id/invites/:invId/revoke",
    requireTeacher(config),
    asyncRoute(async (req, res) => {
      if (
        !safeId.safeParse(req.params.id).success ||
        !safeId.safeParse(req.params.invId).success
      )
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      const invite = await db.invite.findFirst({
        where: {
          sessionId: session.id,
          OR: [{ id: req.params.invId }, { studentId: req.params.invId }],
        },
        orderBy: { createdAt: "desc" },
      });
      if (!invite)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy mã mời");
      const now = new Date();
      const updated = await db.$transaction(async (tx) => {
        await tx.invite.updateMany({
          where: {
            sessionId: session.id,
            studentId: invite.studentId,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
        await tx.studentRoomSession.updateMany({
          where: {
            sessionId: session.id,
            studentId: invite.studentId,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
        await tx.roomMember.updateMany({
          where: {
            sessionId: session.id,
            studentId: invite.studentId,
          },
          data: {
            state: "left",
            leftAt: now,
            handRaised: false,
          },
        });
        if (session.sharedBoardOwnerId === invite.studentId) {
          await tx.session.update({
            where: { id: session.id },
            data: {
              sharedBoardOwnerId: "common",
              version: { increment: 1 },
            },
          });
        }
        await appendOutboxEvent(tx, {
          sessionId: session.id,
          type: "member.updated",
          label: "Thu hồi quyền tham gia của học sinh",
          actorId: res.locals.actor.id,
          visibility: { scope: "public" },
          resourceId: invite.studentId,
        });
        await tx.auditLog.create({
          data: {
            workspaceId: res.locals.actor.workspaceId,
            actorId: res.locals.actor.id,
            actorRole: "teacher",
            action: "invite.revoked",
            targetType: "invite",
            targetId: invite.id,
            sessionId: session.id,
            requestId: res.locals.requestId,
            metadata: {
              nextStatus: "revoked",
              reasonCode: "permission_changed",
            },
          },
        });
        return tx.invite.findUniqueOrThrow({ where: { id: invite.id } });
      });
      disconnectStudentSockets(session.id, invite.studentId);
      triggerOutboxPublish(session.id);
      return res.json({ invite: toInviteSummary(updated) });
    }),
  );

  // 4. Invite Preview (Public) - minimal consent info, zero leakage on invalid/expired/revoked
  r.post(
    "/room/invite-preview",
    asyncRoute(async (req, res) => {
      const parsed = InvitePreviewInput.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Mã mời không hợp lệ");
      const invite = await db.invite.findUnique({
        where: { tokenHash: digest(parsed.data.token) },
        include: {
          sessionIdRef: { select: { id: true, title: true, status: true } },
          studentIdRef: { select: { name: true, status: true } },
        },
      });
      if (
        !invite ||
        invite.revokedAt ||
        invite.expiresAt <= new Date() ||
        invite.studentIdRef.status !== "active"
      )
        return fail(
          res,
          401,
          "INVITE_INVALID",
          "Liên kết mời không hợp lệ, đã hết hạn hoặc bị thu hồi",
        );
      if (
        invite.sessionIdRef.status === "ended" ||
        invite.sessionIdRef.status === "reviewed"
      )
        return fail(
          res,
          401,
          "INVITE_INVALID",
          "Buổi học đã kết thúc, liên kết không còn hiệu lực",
        );
      return res.json(
        InvitePreviewResponse.parse({
          inviteState: "active",
          sessionId: invite.sessionIdRef.id,
          sessionTitle: invite.sessionIdRef.title,
          sessionStatus: invite.sessionIdRef.status,
          studentDefaultName: invite.studentIdRef.name,
        }),
      );
    }),
  );

  // 5. Student Join Request with Explicit Consent -> waiting (or keep joined) + StudentRoomSession grant
  r.post(
    "/room/join-request",
    asyncRoute(async (req, res) => {
      const parsed = JoinRequest.safeParse(req.body);
      if (!parsed.success)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Cần nhập tên hiển thị và đồng ý tham gia lớp học",
        );
      const invite = await db.invite.findUnique({
        where: { tokenHash: digest(parsed.data.token) },
        include: {
          sessionIdRef: true,
          studentIdRef: true,
        },
      });
      if (
        !invite ||
        invite.revokedAt ||
        invite.expiresAt <= new Date() ||
        invite.studentIdRef.status !== "active"
      )
        return fail(
          res,
          401,
          "INVITE_INVALID",
          "Liên kết mời không hợp lệ, đã hết hạn hoặc bị thu hồi",
        );
      if (
        invite.sessionIdRef.status === "ended" ||
        invite.sessionIdRef.status === "reviewed"
      )
        return fail(
          res,
          409,
          "SESSION_NOT_LIVE",
          "Buổi học đã kết thúc, không thể tham gia",
        );
      const member = await db.roomMember.findUnique({
        where: {
          sessionId_studentId: {
            sessionId: invite.sessionId,
            studentId: invite.studentId,
          },
        },
      });
      if (!member)
        return fail(res, 401, "INVITE_INVALID", "Không tìm thấy thành viên");
      const nextState: "waiting" | "joined" =
        member.state === "joined" ? "joined" : "waiting";
      const refreshToken = randomToken();
      const refreshTokenHash = digest(refreshToken);
      const displayName = parsed.data.name.trim();
      const teacher = await db.teacher.findUniqueOrThrow({
        where: { id: invite.sessionIdRef.teacherId },
        select: { workspaceId: true },
      });

      const { grant, updatedMember } = await db.$transaction(async (tx) => {
        const updatedMemberRow = await tx.roomMember.update({
          where: { id: member.id },
          data: {
            displayName,
            consent: true,
            consentAt: member.consentAt ?? new Date(),
            state: nextState,
            leftAt: null,
          },
        });
        const createdGrant = await tx.studentRoomSession.create({
          data: {
            sessionId: invite.sessionId,
            studentId: invite.studentId,
            teacherId: invite.sessionIdRef.teacherId,
            memberId: member.id,
            inviteId: invite.id,
            displayName,
            refreshTokenHash,
            expiresAt: new Date(Date.now() + 12 * 3600_000),
          },
        });
        await appendOutboxEvent(tx, {
          sessionId: invite.sessionId,
          type: "member.join_requested",
          label: `${displayName} yêu cầu vào phòng`,
          actorId: `student:${invite.studentId}`,
          visibility: { scope: "teacher" },
          resourceId: member.id,
        });
        await tx.auditLog.create({
          data: {
            workspaceId: teacher.workspaceId,
            actorId: `student:${invite.studentId}`,
            actorRole: "student",
            action: "member.join_requested",
            targetType: "room_member",
            targetId: member.id,
            sessionId: invite.sessionId,
            requestId: res.locals.requestId,
            metadata: {
              previousStatus: member.state,
              nextStatus: nextState,
            },
          },
        });
        return { grant: createdGrant, updatedMember: updatedMemberRow };
      });
      triggerOutboxPublish(invite.sessionId);
      const accessToken = await signStudentAccess(config, {
        studentId: invite.studentId,
        grantId: grant.id,
        teacherId: invite.sessionIdRef.teacherId,
        sessionId: invite.sessionId,
        memberId: member.id,
      });
      return res.json(
        StudentAuthResponse.parse({
          accessToken,
          studentRoomToken: accessToken,
          refreshToken,
          sessionId: invite.sessionId,
          studentId: invite.studentId,
          memberId: member.id,
          displayName: updatedMember.displayName || displayName,
          memberState: nextState,
        }),
      );
    }),
  );

  // 6. Student Token Refresh - independent of rotated invite, invalidated by explicit revoke
  r.post(
    "/room/refresh",
    asyncRoute(async (req, res) => {
      const parsed = StudentRefreshInput.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Refresh token không hợp lệ");
      const grant = await db.studentRoomSession.findUnique({
        where: { refreshTokenHash: digest(parsed.data.refreshToken) },
        include: {
          memberIdRef: true,
          sessionIdRef: { select: { status: true } },
          teacherIdRef: { select: { status: true } },
        },
      });
      if (
        !grant ||
        grant.revokedAt ||
        grant.expiresAt <= new Date() ||
        grant.teacherIdRef.status !== "active" ||
        !grant.memberIdRef.consent ||
        grant.memberIdRef.state === "invited" ||
        (grant.memberIdRef.state === "left" &&
          grant.sessionIdRef.status !== "ended" &&
          grant.sessionIdRef.status !== "reviewed")
      )
        return fail(
          res,
          401,
          "INVITE_INVALID",
          "Phiên tham gia phòng học đã hết hạn hoặc bị thu hồi",
        );
      const nextRefreshToken = randomToken();
      const updated = await db.studentRoomSession.updateMany({
        where: {
          id: grant.id,
          refreshTokenHash: digest(parsed.data.refreshToken),
          revokedAt: null,
        },
        data: {
          refreshTokenHash: digest(nextRefreshToken),
          expiresAt: new Date(Date.now() + 12 * 3600_000),
        },
      });
      if (updated.count !== 1)
        return fail(res, 401, "INVITE_INVALID", "Refresh token đã được sử dụng");
      const accessToken = await signStudentAccess(config, {
        studentId: grant.studentId,
        grantId: grant.id,
        teacherId: grant.teacherId,
        sessionId: grant.sessionId,
        memberId: grant.memberId,
      });
      const effectiveState: "waiting" | "joined" =
        grant.memberIdRef.state === "waiting" ? "waiting" : "joined";
      return res.json(
        StudentAuthResponse.parse({
          accessToken,
          studentRoomToken: accessToken,
          refreshToken: nextRefreshToken,
          sessionId: grant.sessionId,
          studentId: grant.studentId,
          memberId: grant.memberId,
          displayName: grant.memberIdRef.displayName || grant.displayName,
          memberState: effectiveState,
        }),
      );
    }),
  );

  // 7. Teacher Admit / Reject Student
  r.post(
    "/sessions/:id/members/:mId/admit",
    requireTeacher(config),
    asyncRoute(async (req, res) => {
      if (
        !safeId.safeParse(req.params.id).success ||
        !safeId.safeParse(req.params.mId).success
      )
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      if (session.status === "ended" || session.status === "reviewed")
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Buổi học đã kết thúc",
        );
      const parsed = AdmitCommand.safeParse(req.body ?? {});
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Lệnh duyệt không hợp lệ");
      const approved = parsed.data.approved !== false;
      const member = await db.roomMember.findFirst({
        where: {
          sessionId: session.id,
          OR: [{ id: req.params.mId }, { studentId: req.params.mId }],
        },
      });
      if (!member)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy học sinh trong phòng");
      if (!approved) {
        const now = new Date();
        const rejected = await db.$transaction(async (tx) => {
          await tx.studentRoomSession.updateMany({
            where: {
              sessionId: session.id,
              studentId: member.studentId,
              revokedAt: null,
            },
            data: { revokedAt: now },
          });
          const row = await tx.roomMember.update({
            where: { id: member.id },
            data: { state: "left", leftAt: now, handRaised: false },
          });
          await appendOutboxEvent(tx, {
            sessionId: session.id,
            type: "member.updated",
            label: "Từ chối học sinh vào phòng",
            actorId: res.locals.actor.id,
            visibility: { scope: "teacher" },
            resourceId: member.id,
          });
          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "member.rejected",
              targetType: "room_member",
              targetId: member.id,
              sessionId: session.id,
              requestId: res.locals.requestId,
              metadata: {
                previousStatus: member.state,
                nextStatus: "left",
                reasonCode: "permission_changed",
              },
            },
          });
          return row;
        });
        disconnectStudentSockets(session.id, member.studentId);
        triggerOutboxPublish(session.id);
        return res.json({ member: rejected });
      }
      if (!member.consent || member.state === "invited")
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Học sinh chưa xác nhận tham gia phòng chờ",
        );
      const admitted = await db.$transaction(async (tx) => {
        const row = await tx.roomMember.update({
          where: { id: member.id },
          data: {
            state: "joined",
            joinedAt: member.joinedAt ?? new Date(),
            leftAt: null,
          },
        });
        await appendOutboxEvent(tx, {
          sessionId: session.id,
          type: "member.admitted",
          label: "Duyệt học sinh vào lớp",
          actorId: res.locals.actor.id,
          visibility: { scope: "public" },
          resourceId: member.id,
        });
        await appendOutboxEvent(tx, {
          sessionId: session.id,
          type: "member.admitted",
          label: "Bạn đã được duyệt vào lớp",
          actorId: res.locals.actor.id,
          visibility: { scope: "student", studentId: member.studentId },
          resourceId: member.id,
        });
        await tx.auditLog.create({
          data: {
            workspaceId: res.locals.actor.workspaceId,
            actorId: res.locals.actor.id,
            actorRole: "teacher",
            action: "member.admitted",
            targetType: "room_member",
            targetId: member.id,
            sessionId: session.id,
            requestId: res.locals.requestId,
            metadata: {
              previousStatus: member.state,
              nextStatus: "joined",
            },
          },
        });
        return row;
      });
      triggerOutboxPublish(session.id);
      return res.json({ member: admitted });
    }),
  );

  // 8. Member Update (Teacher: canWrite/toolOverrides/handRaised/leave; Student: own handRaised/leave)
  r.patch(
    "/sessions/:id/members/:mId",
    requireClassroomActor(config),
    asyncRoute(async (req, res) => {
      if (
        !safeId.safeParse(req.params.id).success ||
        !safeId.safeParse(req.params.mId).success
      )
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const parsed = MemberUpdate.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Dữ liệu thành viên không hợp lệ");
      const member = await db.roomMember.findFirst({
        where: {
          sessionId: req.params.id,
          OR: [{ id: req.params.mId }, { studentId: req.params.mId }],
        },
        include: { sessionIdRef: true },
      });
      if (!member)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy thành viên");
      const actor = res.locals.actor as TeacherActor | StudentActor;
      if (actor.role === "teacher") {
        if (member.sessionIdRef.teacherId !== actor.id) {
          await audit(
            actor,
            "security.denied",
            "room_member",
            member.id,
            res.locals.requestId,
          );
          return fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
        }
        const existingOverrides =
          Tools.partial().safeParse(member.toolOverrides ?? {}).data ?? {};
        const nextOverrides = parsed.data.toolOverrides
          ? { ...existingOverrides, ...parsed.data.toolOverrides }
          : undefined;
        const now = new Date();
        const updated = await db.$transaction(async (tx) => {
          if (parsed.data.leave) {
            await tx.studentRoomSession.updateMany({
              where: {
                sessionId: member.sessionId,
                studentId: member.studentId,
                revokedAt: null,
              },
              data: { revokedAt: now },
            });
            if (member.sessionIdRef.sharedBoardOwnerId === member.studentId) {
              await tx.session.update({
                where: { id: member.sessionId },
                data: {
                  sharedBoardOwnerId: "common",
                  version: { increment: 1 },
                },
              });
            }
          }
          const row = await tx.roomMember.update({
            where: { id: member.id },
            data: {
              ...(parsed.data.canWrite !== undefined
                ? { canWrite: parsed.data.canWrite }
                : {}),
              ...(nextOverrides !== undefined
                ? { toolOverrides: nextOverrides as Prisma.InputJsonValue }
                : {}),
              ...(parsed.data.handRaised !== undefined
                ? { handRaised: parsed.data.handRaised }
                : {}),
              ...(parsed.data.leave
                ? { state: "left", leftAt: now, handRaised: false }
                : {}),
            },
          });
          await appendOutboxEvent(tx, {
            sessionId: member.sessionId,
            type: "member.updated",
            label: "Cập nhật quyền thành viên",
            actorId: actor.id,
            visibility: { scope: "public" },
            resourceId: member.id,
          });
          await tx.auditLog.create({
            data: {
              workspaceId: actor.workspaceId,
              actorId: actor.id,
              actorRole: "teacher",
              action: "member.updated",
              targetType: "room_member",
              targetId: member.id,
              sessionId: member.sessionId,
              requestId: res.locals.requestId,
              metadata: { reasonCode: "permission_changed" },
            },
          });
          return row;
        });
        if (parsed.data.leave) {
          disconnectStudentSockets(member.sessionId, member.studentId);
        }
        triggerOutboxPublish(member.sessionId);
        return res.json({ member: updated });
      }

      // Student actor
      if (
        actor.sessionId !== member.sessionId ||
        actor.studentId !== member.studentId
      ) {
        await audit(
          actor,
          "security.denied",
          "room_member",
          member.id,
          res.locals.requestId,
          actor.sessionId,
        );
        return fail(
          res,
          403,
          "PERMISSION_DENIED",
          "Không thể sửa thành viên khác",
        );
      }
      if (
        parsed.data.canWrite !== undefined ||
        parsed.data.toolOverrides !== undefined
      ) {
        await audit(
          actor,
          "security.denied",
          "room_member",
          member.id,
          res.locals.requestId,
          actor.sessionId,
        );
        return fail(
          res,
          403,
          "PERMISSION_DENIED",
          "Học sinh không được tự cấp quyền ghi",
        );
      }
      if (!parsed.data.leave && member.sessionIdRef.status !== "live")
        return fail(
          res,
          409,
          "SESSION_NOT_LIVE",
          "Buổi học không ở trạng thái trực tuyến",
        );
      if (!parsed.data.leave && member.state !== "joined")
        return fail(
          res,
          403,
          "PERMISSION_DENIED",
          "Cần được duyệt vào lớp trước khi giơ tay",
        );
      const now = new Date();
      const updated = await db.$transaction(async (tx) => {
        if (parsed.data.leave) {
          await tx.studentRoomSession.updateMany({
            where: { id: actor.grantId, revokedAt: null },
            data: { revokedAt: now },
          });
          if (member.sessionIdRef.sharedBoardOwnerId === member.studentId) {
            await tx.session.update({
              where: { id: member.sessionId },
              data: {
                sharedBoardOwnerId: "common",
                version: { increment: 1 },
              },
            });
          }
        }
        const row = await tx.roomMember.update({
          where: { id: member.id },
          data: {
            ...(parsed.data.handRaised !== undefined
              ? { handRaised: parsed.data.handRaised }
              : {}),
            ...(parsed.data.leave
              ? { state: "left", leftAt: now, handRaised: false }
              : {}),
          },
        });
        await appendOutboxEvent(tx, {
          sessionId: member.sessionId,
          type: "member.updated",
          label: parsed.data.leave ? "Học sinh rời phòng" : "Học sinh giơ tay",
          actorId: actor.id,
          visibility: { scope: "public" },
          resourceId: member.id,
        });
        return row;
      });
      if (parsed.data.leave) {
        disconnectStudentSockets(member.sessionId, member.studentId);
      }
      triggerOutboxPublish(member.sessionId);
      return res.json({ member: updated });
    }),
  );

  // 9. Start Session (draft | scheduled -> live, never ended | reviewed -> live)
  r.post(
    "/sessions/:id/start",
    requireTeacher(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      const prior = await lookupReplay(
        req,
        res,
        `/sessions/${session.id}/start`,
      );
      if (prior === null) return;
      if (prior) {
        return res.json({
          session: await db.session.findUniqueOrThrow({
            where: { id: prior.resourceId },
            include: {
              Activity_sessionId_items: { orderBy: { order: "asc" } },
              RoomMember_sessionId_items: true,
            },
          }),
        });
      }
      if (session.status === "ended" || session.status === "reviewed")
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Không thể mở lại buổi học đã kết thúc",
        );
      const expected = versionHeader(req);
      if (expected === -1)
        return fail(res, 400, "VALIDATION_ERROR", "If-Match-Version không hợp lệ");
      if (expected !== null && session.version !== expected)
        return fail(res, 409, "VERSION_CONFLICT", "Phiên bản buổi học đã thay đổi");

      const result = await createOnce(
        req,
        res,
        `/sessions/${session.id}/start`,
        async (tx) => {
          const current = await tx.session.findUniqueOrThrow({
            where: { id: session.id },
            include: {
              Activity_sessionId_items: { orderBy: { order: "asc" } },
            },
          });
          if (current.status === "live") return current.id;
          const next = nextSessionStatus(current.status, "start");
          if (!next) throw new Error("INVALID_STATE");
          const activeActId =
            current.currentActivityId ??
            current.Activity_sessionId_items[0]?.id ??
            null;
          const updated = await tx.session.update({
            where: { id: current.id },
            data: {
              status: "live",
              startedAt: current.startedAt ?? new Date(),
              currentActivityId: activeActId,
              version: { increment: 1 },
            },
          });
          if (activeActId) {
            await tx.board.upsert({
              where: { id: `${current.id}:${activeActId}:common` },
              update: {},
              create: {
                id: `${current.id}:${activeActId}:common`,
                sessionId: current.id,
                activityId: activeActId,
                ownerId: "common",
                shared: true,
                strokes: [],
                text: "",
                notes: [],
              },
            });
          }
          await appendOutboxEvent(tx, {
            sessionId: current.id,
            type: "session.started",
            label: "Bắt đầu buổi học trực tuyến",
            actorId: res.locals.actor.id,
            visibility: { scope: "public" },
            activityId: activeActId,
            resourceId: current.id,
            version: updated.version,
          });
          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "session.started",
              targetType: "session",
              targetId: current.id,
              sessionId: current.id,
              requestId: res.locals.requestId,
              metadata: {
                previousStatus: current.status,
                nextStatus: "live",
              },
            },
          });
          return current.id;
        },
      );
      if (!result) return;
      triggerOutboxPublish(session.id);
      return res.json({
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

  // 10. End Session (live -> ended, closes open checks, sets members left, clears reactions)
  r.post(
    "/sessions/:id/end",
    requireTeacher(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      const prior = await lookupReplay(req, res, `/sessions/${session.id}/end`);
      if (prior === null) return;
      if (prior) {
        return res.json({
          session: await db.session.findUniqueOrThrow({
            where: { id: prior.resourceId },
            include: {
              Activity_sessionId_items: { orderBy: { order: "asc" } },
              RoomMember_sessionId_items: true,
            },
          }),
        });
      }
      if (session.status !== "live" && session.status !== "ended")
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Chỉ có thể kết thúc buổi học đang diễn ra",
        );
      const expected = versionHeader(req);
      if (expected === -1)
        return fail(res, 400, "VALIDATION_ERROR", "If-Match-Version không hợp lệ");
      if (expected !== null && session.version !== expected)
        return fail(res, 409, "VERSION_CONFLICT", "Phiên bản buổi học đã thay đổi");

      const result = await createOnce(
        req,
        res,
        `/sessions/${session.id}/end`,
        async (tx) => {
          const current = await tx.session.findUniqueOrThrow({
            where: { id: session.id },
          });
          if (current.status === "ended") return current.id;
          const next = nextSessionStatus(current.status, "end");
          if (!next) throw new Error("INVALID_STATE");
          const now = new Date();
          const updated = await tx.session.update({
            where: { id: current.id },
            data: {
              status: "ended",
              endedAt: current.endedAt ?? now,
              sharedView: "document",
              sharedBoardOwnerId: "common",
              version: { increment: 1 },
            },
          });
          await tx.quickCheck.updateMany({
            where: { sessionId: current.id, status: "open" },
            data: { status: "closed", closedAt: now },
          });
          await tx.roomMember.updateMany({
            where: { sessionId: current.id },
            data: { state: "left", leftAt: now, handRaised: false },
          });
          await tx.roomReaction.deleteMany({
            where: { sessionId: current.id },
          });
          await appendOutboxEvent(tx, {
            sessionId: current.id,
            type: "session.ended",
            label: "Kết thúc buổi học",
            actorId: res.locals.actor.id,
            visibility: { scope: "public" },
            resourceId: current.id,
            version: updated.version,
          });
          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "session.ended",
              targetType: "session",
              targetId: current.id,
              sessionId: current.id,
              requestId: res.locals.requestId,
              metadata: {
                previousStatus: current.status,
                nextStatus: "ended",
              },
            },
          });
          return current.id;
        },
      );
      if (!result) return;
      triggerOutboxPublish(session.id);
      return res.json({
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

  // 11. Dedicated Classroom State Patch (currentActivityId, completedActivityIds, sharedView, sharedBoardOwnerId, materialPage, tools)
  r.patch(
    "/sessions/:id/classroom",
    requireTeacher(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      if (!["draft", "scheduled", "live"].includes(session.status))
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Buổi học đã kết thúc",
        );
      const parsed = ClassroomStatePatch.safeParse(req.body);
      const expected = versionHeader(req);
      if (!parsed.success || !expected || expected < 1)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Dữ liệu điều khiển phòng học hoặc phiên bản không hợp lệ",
        );
      if (
        parsed.data.currentActivityId !== undefined ||
        parsed.data.completedActivityIds !== undefined
      ) {
        const acts = await db.activity.findMany({
          where: { sessionId: session.id },
          select: { id: true },
        });
        const validIds = new Set(acts.map((a) => a.id));
        if (
          (parsed.data.currentActivityId &&
            !validIds.has(parsed.data.currentActivityId)) ||
          (parsed.data.completedActivityIds &&
            parsed.data.completedActivityIds.some((id) => !validIds.has(id)))
        )
          return fail(
            res,
            400,
            "VALIDATION_ERROR",
            "Hoạt động không thuộc buổi học",
          );
      }
      let nextSharedOwner = parsed.data.sharedBoardOwnerId;
      if (nextSharedOwner && nextSharedOwner !== "common") {
        const activeActId =
          parsed.data.currentActivityId !== undefined
            ? parsed.data.currentActivityId
            : session.currentActivityId;
        const member = await db.roomMember.findUnique({
          where: {
            sessionId_studentId: {
              sessionId: session.id,
              studentId: nextSharedOwner,
            },
          },
        });
        const board = activeActId
          ? await db.board.findUnique({
              where: {
                id: `${session.id}:${activeActId}:${nextSharedOwner}`,
              },
            })
          : null;
        if (!member || member.state !== "joined" || !board?.shared) {
          nextSharedOwner = "common";
        }
      }
      const existingTools = Tools.safeParse(session.tools).success
        ? Tools.parse(session.tools)
        : { board: true, upload: true, check: true, chat: true };
      const mergedTools = parsed.data.tools
        ? { ...existingTools, ...parsed.data.tools }
        : undefined;
      const { tools: _tools, sharedBoardOwnerId: _sbo, ...rest } = parsed.data;
      const changed = await db.$transaction(async (tx) => {
        const result = await tx.session.updateMany({
          where: {
            id: session.id,
            teacherId: res.locals.actor.id,
            version: expected,
            status: { in: ["draft", "scheduled", "live"] },
          },
          data: {
            ...rest,
            ...(nextSharedOwner !== undefined
              ? { sharedBoardOwnerId: nextSharedOwner }
              : {}),
            ...(mergedTools ? { tools: mergedTools } : {}),
            version: { increment: 1 },
          },
        });
        if (!result.count) return false;
        await appendOutboxEvent(tx, {
          sessionId: session.id,
          type: "activity.changed",
          label: "Cập nhật điều khiển phòng học",
          actorId: res.locals.actor.id,
          visibility: { scope: "public" },
          activityId:
            parsed.data.currentActivityId !== undefined
              ? parsed.data.currentActivityId
              : session.currentActivityId,
          page: parsed.data.materialPage ?? session.materialPage,
          resourceId: session.id,
          version: expected + 1,
        });
        await tx.auditLog.create({
          data: {
            workspaceId: res.locals.actor.workspaceId,
            actorId: res.locals.actor.id,
            actorRole: "teacher",
            action: "session.classroom_updated",
            targetType: "session",
            targetId: session.id,
            sessionId: session.id,
            requestId: res.locals.requestId,
            metadata: {},
          },
        });
        return true;
      });
      if (!changed)
        return fail(res, 409, "VERSION_CONFLICT", "Buổi học đã thay đổi");
      triggerOutboxPublish(session.id);
      return res.json({
        session: await db.session.findUniqueOrThrow({
          where: { id: session.id },
          include: {
            Activity_sessionId_items: { orderBy: { order: "asc" } },
            RoomMember_sessionId_items: true,
          },
        }),
      });
    }),
  );

  // 12. Room State (Teacher full view OR Student strict projection / waiting status)
  r.get(
    "/room/state",
    requireClassroomActor(config),
    asyncRoute(async (req, res) => {
      const actor = res.locals.actor as TeacherActor | StudentActor;
      if (actor.role === "teacher") {
        const sessionId =
          typeof req.query.sessionId === "string" ? req.query.sessionId : "";
        if (!safeId.safeParse(sessionId).success)
          return fail(res, 400, "VALIDATION_ERROR", "Cần sessionId hợp lệ");
        const owned = await ownedSession(sessionId, actor, res);
        if (!owned) return;
        const [
          session,
          invites,
          boards,
          attempts,
          checks,
          submissions,
          annotations,
          messages,
          reactions,
          evidence,
          claims,
        ] = await Promise.all([
          db.session.findUniqueOrThrow({
            where: { id: sessionId },
            include: {
              Activity_sessionId_items: { orderBy: { order: "asc" } },
              RoomMember_sessionId_items: {
                include: {
                  studentIdRef: {
                    select: {
                      id: true,
                      name: true,
                      initials: true,
                      color: true,
                      grade: true,
                      subject: true,
                    },
                  },
                },
              },
            },
          }),
          db.invite.findMany({
            where: { sessionId },
            orderBy: { createdAt: "desc" },
          }),
          db.board.findMany({
            where: { sessionId },
            orderBy: { updatedAt: "desc" },
          }),
          db.boardAttempt.findMany({
            where: { sessionId },
            orderBy: { createdAt: "desc" },
          }),
          db.quickCheck.findMany({
            where: { sessionId },
            include: { CheckResponse_checkId_items: true },
            orderBy: { openedAt: "desc" },
          }),
          db.submission.findMany({
            where: { sessionId },
            orderBy: { createdAt: "desc" },
          }),
          db.annotation.findMany({
            where: { sessionId },
            orderBy: { createdAt: "asc" },
          }),
          db.roomMessage.findMany({
            where: { sessionId },
            orderBy: { createdAt: "asc" },
          }),
          db.roomReaction.findMany({
            where: { sessionId },
            orderBy: { createdAt: "desc" },
          }),
          db.evidence.findMany({
            where: { sessionId, status: { not: "deleted" } },
            orderBy: { createdAt: "desc" },
          }),
          db.claim.findMany({
            where: { sessionId },
            orderBy: { createdAt: "desc" },
          }),
        ]);
        return res.json({
          role: "teacher",
          session,
          invites: invites.map(toInviteSummary),
          boards,
          attempts,
          checks,
          submissions,
          annotations,
          messages,
          reactions,
          evidence,
          claims,
          lastEventSeq: Math.max(0, session.nextEventSeq - 1),
          media: {
            videoConfigured: !!(
              process.env.ZOOM_SDK_KEY && process.env.ZOOM_SDK_SECRET
            ),
            realtimeReady: true,
          },
        });
      }

      // Student actor projection
      const [session, member] = await Promise.all([
        db.session.findUnique({
          where: { id: actor.sessionId },
          include: {
            Activity_sessionId_items: { orderBy: { order: "asc" } },
            RoomMember_sessionId_items: {
              include: {
                studentIdRef: {
                  select: {
                    id: true,
                    name: true,
                    initials: true,
                    color: true,
                  },
                },
              },
            },
          },
        }),
        db.roomMember.findUnique({ where: { id: actor.memberId } }),
      ]);
      if (!session || !member)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy phòng học");

      // Waiting room isolation: waiting students see ONLY their own waiting status
      if (member.state === "waiting") {
        if (session.status === "ended" || session.status === "reviewed")
          return fail(res, 409, "SESSION_NOT_LIVE", "Buổi học đã kết thúc");
        return res.json({
          waiting: true,
          memberState: "waiting",
          sessionId: session.id,
          studentId: actor.studentId,
          memberId: member.id,
          displayName: member.displayName || actor.displayName,
          sessionStatus: session.status,
        });
      }

      // Explicitly left/unadmitted students cannot read class state; post-end admitted students may read their bounded receipt
      const canReadPostEnd =
        (session.status === "ended" || session.status === "reviewed") &&
        member.joinedAt !== null;
      if (member.state !== "joined" && !canReadPostEnd) {
        return fail(
          res,
          403,
          "PERMISSION_DENIED",
          "Quyền truy cập phòng học không còn hiệu lực",
        );
      }

      const activeActId =
        session.currentActivityId ??
        session.Activity_sessionId_items[0]?.id ??
        null;
      const currentAct =
        session.Activity_sessionId_items.find((a) => a.id === activeActId) ??
        null;
      const { publicClient, bucket } = storage();

      let currentMaterial: {
        id: string;
        title: string;
        version: number;
        readUrl: string;
        page: number;
      } | null = null;
      if (currentAct?.materialId && currentAct.materialVersion) {
        const mat = await db.material.findUnique({
          where: { id: currentAct.materialId },
          include: {
            MaterialVersion_materialId_items: {
              where: {
                version: currentAct.materialVersion,
                uploadStatus: "ready",
              },
              take: 1,
            },
          },
        });
        const ver = mat?.MaterialVersion_materialId_items[0];
        if (mat && ver?.storageKey) {
          currentMaterial = {
            id: mat.id,
            title: mat.title,
            version: ver.version,
            readUrl: await publicClient.presignedGetObject(
              bucket,
              ver.storageKey,
              300,
            ),
            page: session.materialPage,
          };
        }
      }

      const [
        commonBoardRow,
        selectedSharedRow,
        ownBoardRow,
        ownAttempts,
        ownSubmissionsRows,
        activeCheck,
        roomMessages,
      ] = await Promise.all([
        activeActId
          ? db.board.findUnique({
              where: { id: `${session.id}:${activeActId}:common` },
            })
          : null,
        activeActId && session.sharedBoardOwnerId !== "common"
          ? db.board.findUnique({
              where: {
                id: `${session.id}:${activeActId}:${session.sharedBoardOwnerId}`,
              },
            })
          : null,
        activeActId
          ? db.board.findUnique({
              where: { id: `${session.id}:${activeActId}:${actor.studentId}` },
            })
          : null,
        db.boardAttempt.findMany({
          where: { sessionId: session.id, studentId: actor.studentId },
          orderBy: { createdAt: "desc" },
        }),
        db.submission.findMany({
          where: { sessionId: session.id, studentId: actor.studentId },
          orderBy: { createdAt: "desc" },
        }),
        db.quickCheck.findFirst({
          where: { sessionId: session.id, status: "open" },
          orderBy: { openedAt: "desc" },
        }),
        db.roomMessage.findMany({
          where: { sessionId: session.id },
          orderBy: { createdAt: "asc" },
          take: 100,
        }),
      ]);

      const ownCheckResponse = activeCheck
        ? await db.checkResponse.findUnique({
            where: {
              checkId_studentId: {
                checkId: activeCheck.id,
                studentId: actor.studentId,
              },
            },
            select: { id: true, answer: true },
          })
        : null;

      const formatBoard = (
        row: {
          id: string;
          ownerId: string;
          shared: boolean;
          revision: number;
          strokes: Prisma.JsonValue;
          text: string;
        } | null,
      ) => {
        if (!row) return null;
        const parsedStrokes = z.array(Stroke).safeParse(row.strokes);
        return {
          id: row.id,
          ownerId: row.ownerId,
          shared: row.shared,
          revision: row.revision,
          strokes: parsedStrokes.success ? parsedStrokes.data : [],
          text: row.text,
        };
      };

      const commonBoard = formatBoard(commonBoardRow);
      const validSharedStudentBoard =
        selectedSharedRow && selectedSharedRow.shared
          ? formatBoard(selectedSharedRow)
          : null;
      const effectiveSharedOwnerId = validSharedStudentBoard
        ? session.sharedBoardOwnerId
        : "common";
      const sharedBoard = validSharedStudentBoard ?? commonBoard;
      const ownBoard = formatBoard(ownBoardRow);

      const ownSubmissions = await Promise.all(
        ownSubmissionsRows.map(async (sub) => {
          const readUrl = sub.storageKey
            ? await publicClient.presignedGetObject(bucket, sub.storageKey, 300)
            : null;
          return StudentSubmission.parse({
            id: sub.id,
            activityId: sub.activityId,
            title: sub.title,
            answer: sub.answer,
            status: sub.status,
            fileName: sub.fileName ?? null,
            readUrl,
            support: sub.support ?? null,
            finalFeedback: sub.finalFeedback ?? null,
            score: sub.score ?? null,
            createdAt: sub.createdAt.toISOString(),
          });
        }),
      );

      const sessionTools = Tools.safeParse(session.tools).success
        ? Tools.parse(session.tools)
        : { board: true, upload: true, check: true, chat: true };

      const rawView = {
        session: {
          id: session.id,
          title: session.title,
          sharedGoal: session.sharedGoal,
          status: session.status,
          currentActivityId: activeActId,
          sharedView: session.sharedView,
          sharedBoardOwnerId: effectiveSharedOwnerId,
          materialPage: session.materialPage,
          tools: sessionTools,
        },
        activities: session.Activity_sessionId_items.map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          duration: a.duration,
          order: a.order,
          type: a.type,
        })),
        currentMaterial,
        commonBoard,
        sharedBoard,
        ownBoard,
        ownAttempts: ownAttempts.map((att) => ({
          id: att.id,
          activityId: att.activityId,
          strokes: z.array(Stroke).safeParse(att.strokes).data ?? [],
          text: att.text,
          createdAt: att.createdAt.toISOString(),
        })),
        ownSubmissions,
        activeQuickCheck: activeCheck
          ? {
              id: activeCheck.id,
              activityId: activeCheck.activityId,
              question: activeCheck.question,
            }
          : null,
        ownCheckResponse: ownCheckResponse
          ? { id: ownCheckResponse.id, answer: ownCheckResponse.answer }
          : null,
        roomMessages: roomMessages.map((m) => ({
          id: m.id,
          authorId: m.authorId,
          text: m.text,
          createdAt: m.createdAt.toISOString(),
        })),
        members: session.RoomMember_sessionId_items.filter(
          (m) => m.state === "joined" || m.studentId === actor.studentId,
        ).map((m) => ({
          id: m.studentId,
          displayName: m.displayName || m.studentIdRef.name,
          initials: m.studentIdRef.initials,
          color: m.studentIdRef.color,
          handRaised: m.handRaised,
        })),
        lastEventSeq: Math.max(0, session.nextEventSeq - 1),
      };

      const validated = validateStudentRoomProjection(rawView, actor.studentId);
      if (!validated.success)
        return fail(
          res,
          500,
          "INTERNAL_ERROR",
          "Không thể dựng khung nhìn học sinh an toàn",
        );
      return res.json(validated.data);
    }),
  );

  // 13. Video Token (Zoom Video SDK adapter - returns 503 MEDIA_UNAVAILABLE when unconfigured)
  r.post(
    "/sessions/:id/video-token",
    requireClassroomActor(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const session = await db.session.findUnique({
        where: { id: req.params.id },
      });
      if (!session)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy buổi học");
      const actor = res.locals.actor as TeacherActor | StudentActor;
      if (actor.role === "teacher") {
        if (session.teacherId !== actor.id)
          return fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
      } else {
        if (actor.sessionId !== session.id)
          return fail(res, 403, "PERMISSION_DENIED", "Không thuộc buổi học này");
        const member = await db.roomMember.findUnique({
          where: { id: actor.memberId },
        });
        if (!member || member.state !== "joined" || session.status !== "live")
          return fail(
            res,
            403,
            "PERMISSION_DENIED",
            "Chỉ học sinh đã được duyệt trong buổi học trực tuyến mới nhận được video token",
          );
      }
      if (!process.env.ZOOM_SDK_KEY || !process.env.ZOOM_SDK_SECRET)
        return fail(
          res,
          503,
          "MEDIA_UNAVAILABLE",
          "Zoom Video SDK chưa được cấu hình trên môi trường này",
        );
      const token = await new SignJWT({
        app_key: process.env.ZOOM_SDK_KEY,
        tpc: session.id,
        role_type: actor.role === "teacher" ? 1 : 0,
        user_identity: actor.id,
        version: 1,
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuedAt()
        .setExpirationTime("2h")
        .sign(new TextEncoder().encode(process.env.ZOOM_SDK_SECRET));
      return res.json({ token, topic: session.id });
    }),
  );

  // 14. Board Operations (PUT /sessions/:id/boards/:boardKey) - enforces author policy & privacy
  r.put(
    "/sessions/:id/boards/:boardKey",
    requireClassroomActor(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const parsed = StudentBoardCommand.safeParse(req.body);
      if (!parsed.success)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Thao tác bảng nháp không hợp lệ",
        );
      const actor = res.locals.actor as TeacherActor | StudentActor;
      let session: {
        id: string;
        teacherId: string;
        status: string;
        currentActivityId: string | null;
        sharedBoardOwnerId: string;
      } | null = null;
      if (actor.role === "teacher") {
        const s = await ownedSession(req.params.id, actor, res);
        if (!s) return;
        if (s.status !== "live")
          return fail(
            res,
            409,
            "SESSION_NOT_LIVE",
            "Buổi học không ở trạng thái trực tuyến",
          );
        session = s;
      } else {
        const access = await checkStudentToolAccess(
          actor,
          req.params.id,
          "board",
          res,
        );
        if (!access) return;
        session = access.session;
      }

      const target = await resolveBoardTarget(
        session,
        req.params.boardKey,
        typeof req.query.activityId === "string"
          ? req.query.activityId
          : undefined,
        actor,
      );
      if (!target)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Không xác định được bảng nháp hoặc hoạt động",
        );

      const authorKey =
        actor.role === "student" ? actor.studentId : actor.id;
      if (
        actor.role === "student" &&
        target.ownerId !== "common" &&
        target.ownerId !== actor.studentId
      ) {
        await audit(
          actor,
          "security.denied",
          "board",
          target.boardId,
          res.locals.requestId,
          session.id,
        );
        return fail(
          res,
          403,
          "PERMISSION_DENIED",
          "Không được phép chỉnh sửa bảng cá nhân của học sinh khác",
        );
      }

      const existing = await db.board.findUnique({
        where: { id: target.boardId },
      });
      const currentStrokes = z
        .array(Stroke)
        .safeParse(existing?.strokes ?? []).data ?? [];
      const currentNotes =
        z
          .array(z.object({ authorId: z.string(), text: z.string() }))
          .safeParse(existing?.notes ?? []).data ?? [];
      let nextStrokes = [...currentStrokes];
      let nextNotes = [...currentNotes];
      let nextText = existing?.text ?? "";
      let nextShared =
        existing?.shared ?? (target.ownerId === "common" ? true : false);

      const cmd = parsed.data;
      if (cmd.operation === "addStroke") {
        if (
          actor.role === "student" &&
          cmd.stroke.authorId !== actor.studentId &&
          cmd.stroke.authorId !== actor.id
        ) {
          await audit(
            actor,
            "security.denied",
            "board",
            target.boardId,
            res.locals.requestId,
            session.id,
          );
          return fail(
            res,
            403,
            "PERMISSION_DENIED",
            "Không thể giả mạo tác giả nét vẽ",
          );
        }
        const normalizedStroke = Stroke.parse({
          ...cmd.stroke,
          authorId: authorKey,
        });
        nextStrokes = [...currentStrokes.slice(-499), normalizedStroke];
      } else if (cmd.operation === "undoOwnStroke") {
        if (cmd.strokeId) {
          const idx = currentStrokes.findIndex((s) => s.id === cmd.strokeId);
          if (idx === -1)
            return fail(res, 404, "NOT_FOUND", "Không tìm thấy nét vẽ");
          if (
            actor.role === "student" &&
            currentStrokes[idx].authorId !== authorKey
          ) {
            await audit(
              actor,
              "security.denied",
              "board",
              target.boardId,
              res.locals.requestId,
              session.id,
            );
            return fail(
              res,
              403,
              "PERMISSION_DENIED",
              "Không thể xóa nét vẽ của người khác trên bảng chung",
            );
          }
          nextStrokes = currentStrokes.filter((_, i) => i !== idx);
        } else {
          let lastOwnIdx = -1;
          for (let i = currentStrokes.length - 1; i >= 0; i -= 1) {
            if (currentStrokes[i].authorId === authorKey) {
              lastOwnIdx = i;
              break;
            }
          }
          if (lastOwnIdx !== -1) {
            nextStrokes = currentStrokes.filter((_, i) => i !== lastOwnIdx);
          }
        }
      } else if (cmd.operation === "clearOwnStrokes") {
        if (actor.role === "teacher" && target.ownerId === "common") {
          nextStrokes = [];
        } else {
          nextStrokes = currentStrokes.filter((s) => s.authorId !== authorKey);
        }
      } else if (cmd.operation === "setNote") {
        const filtered = currentNotes.filter((n) => n.authorId !== authorKey);
        nextNotes = cmd.text.trim()
          ? [...filtered, { authorId: authorKey, text: cmd.text }]
          : filtered;
        if (target.ownerId !== "common" || actor.role === "teacher") {
          nextText = cmd.text;
        } else {
          nextText = nextNotes.map((n) => n.text).join("\n");
        }
      } else if (cmd.operation === "setShared") {
        if (target.ownerId === "common")
          return fail(
            res,
            403,
            "PERMISSION_DENIED",
            "Bảng chung luôn ở chế độ chia sẻ",
          );
        nextShared = cmd.shared;
      }

      const board = await db.$transaction(async (tx) => {
        const saved = await tx.board.upsert({
          where: { id: target.boardId },
          update: {
            shared: nextShared,
            strokes: nextStrokes as Prisma.InputJsonValue,
            notes: nextNotes as Prisma.InputJsonValue,
            text: nextText,
            revision: { increment: 1 },
          },
          create: {
            id: target.boardId,
            sessionId: session.id,
            activityId: target.activityId,
            ownerId: target.ownerId,
            shared: nextShared,
            strokes: nextStrokes as Prisma.InputJsonValue,
            notes: nextNotes as Prisma.InputJsonValue,
            text: nextText,
            revision: 1,
          },
        });
        if (
          target.ownerId !== "common" &&
          !nextShared &&
          session.sharedBoardOwnerId === target.ownerId
        ) {
          await tx.session.update({
            where: { id: session.id },
            data: {
              sharedBoardOwnerId: "common",
              version: { increment: 1 },
            },
          });
        }
        const isPublicBoard =
          target.ownerId === "common" ||
          nextShared ||
          Boolean(existing?.shared);
        if (isPublicBoard) {
          await appendOutboxEvent(tx, {
            sessionId: session.id,
            type: "board.updated",
            label: "Cập nhật bảng nháp",
            actorId: actor.id,
            visibility: { scope: "public" },
            activityId: target.activityId,
            resourceId: saved.id,
            version: saved.revision,
          });
        } else {
          await appendOutboxEvent(tx, {
            sessionId: session.id,
            type: "board.updated",
            label: "Cập nhật bảng nháp cá nhân",
            actorId: actor.id,
            visibility: { scope: "student", studentId: target.ownerId },
            activityId: target.activityId,
            resourceId: saved.id,
            version: saved.revision,
          });
          await appendOutboxEvent(tx, {
            sessionId: session.id,
            type: "board.updated",
            label: "Học sinh cập nhật bảng nháp cá nhân",
            actorId: actor.id,
            visibility: { scope: "teacher" },
            activityId: target.activityId,
            resourceId: saved.id,
            version: saved.revision,
          });
        }
        return saved;
      });
      triggerOutboxPublish(session.id);
      return res.json({ board });
    }),
  );

  // 15. Immutable BoardAttempt Capture + Evidence (POST /sessions/:id/boards/:boardKey/attempts)
  r.post(
    "/sessions/:id/boards/:boardKey/attempts",
    requireClassroomActor(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const actor = res.locals.actor as TeacherActor | StudentActor;
      let session: {
        id: string;
        teacherId: string;
        primaryStudentId: string;
        status: string;
        currentActivityId: string | null;
      } | null = null;
      if (actor.role === "teacher") {
        const s = await ownedSession(req.params.id, actor, res);
        if (!s) return;
        if (s.status === "reviewed")
          return fail(
            res,
            409,
            "SESSION_STATE_INVALID",
            "Buổi học đã hoàn tất duyệt",
          );
        session = s;
      } else {
        const access = await checkStudentToolAccess(
          actor,
          req.params.id,
          "board",
          res,
        );
        if (!access) return;
        session = access.session;
      }
      const target = await resolveBoardTarget(
        session,
        req.params.boardKey,
        typeof req.query.activityId === "string"
          ? req.query.activityId
          : undefined,
        actor,
      );
      if (!target)
        return fail(res, 400, "VALIDATION_ERROR", "Bảng nháp không hợp lệ");
      if (
        actor.role === "student" &&
        target.ownerId !== "common" &&
        target.ownerId !== actor.studentId
      )
        return fail(
          res,
          403,
          "PERMISSION_DENIED",
          "Không thể lưu bảng của học sinh khác",
        );
      const studentId =
        actor.role === "student"
          ? actor.studentId
          : typeof req.body?.studentId === "string" &&
              safeId.safeParse(req.body.studentId).success
            ? req.body.studentId
            : target.ownerId !== "common"
              ? target.ownerId
              : session.primaryStudentId;

      const result = await createOnce(
        req,
        res,
        `/sessions/${session.id}/boards/${req.params.boardKey}/attempts`,
        async (tx) => {
          const board = await tx.board.upsert({
            where: { id: target.boardId },
            update: {},
            create: {
              id: target.boardId,
              sessionId: session.id,
              activityId: target.activityId,
              ownerId: target.ownerId,
              shared: target.ownerId === "common",
              strokes: [],
              text: "",
              notes: [],
            },
          });
          const attempt = await tx.boardAttempt.create({
            data: {
              boardId: board.id,
              sessionId: session.id,
              activityId: target.activityId,
              studentId,
              strokes: board.strokes ?? [],
              text: board.text,
            },
          });
          const ev = await tx.evidence.create({
            data: {
              sessionId: session.id,
              studentId,
              activityId: target.activityId,
              kind: "TrangNhap",
              title:
                typeof req.body?.title === "string" && req.body.title.trim()
                  ? req.body.title.trim()
                  : "Ảnh chụp bảng nháp",
              detail:
                board.text.trim() ||
                `Lưu bảng nháp (${Array.isArray(board.strokes) ? board.strokes.length : 0} nét vẽ)`,
              support: "ChuaRo",
              sourceType: "board_attempt",
              sourceId: attempt.id,
              sourceVersion: 1,
              isObservation: true,
              createdBy: actor.id,
            },
          });
          await appendOutboxEvent(tx, {
            sessionId: session.id,
            type: "evidence.created",
            label: "Lưu minh chứng bảng nháp",
            actorId: actor.id,
            visibility: { scope: "teacher" },
            activityId: target.activityId,
            sourceId: attempt.id,
            resourceId: ev.id,
            version: 1,
          });
          await tx.auditLog.create({
            data: {
              workspaceId: actor.workspaceId,
              actorId: actor.id,
              actorRole: actor.role === "student" ? "student" : "teacher",
              action: "board_attempt.created",
              targetType: "board_attempt",
              targetId: attempt.id,
              sessionId: session.id,
              requestId: res.locals.requestId,
              metadata: {},
            },
          });
          return attempt.id;
        },
      );
      if (!result) return;
      triggerOutboxPublish(session.id);
      const attempt = await db.boardAttempt.findUniqueOrThrow({
        where: { id: result.resourceId },
      });
      const evidence = await db.evidence.findFirst({
        where: { sourceType: "board_attempt", sourceId: attempt.id },
      });
      return res.status(201).json({ attempt, evidence });
    }),
  );

  // 16. Open Quick Check (POST /sessions/:id/checks)
  r.post(
    "/sessions/:id/checks",
    requireTeacher(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const session = await ownedSession(req.params.id, res.locals.actor, res);
      if (!session) return;
      if (session.status !== "live")
        return fail(
          res,
          409,
          "SESSION_NOT_LIVE",
          "Chỉ mở câu hỏi kiểm tra nhanh khi buổi học đang diễn ra",
        );
      const parsed = CheckInput.safeParse(req.body);
      if (!parsed.success || !safeId.safeParse(parsed.data.activityId).success)
        return fail(res, 400, "VALIDATION_ERROR", "Câu hỏi không hợp lệ");
      const act = await db.activity.findFirst({
        where: { id: parsed.data.activityId, sessionId: session.id },
      });
      if (!act)
        return fail(res, 400, "VALIDATION_ERROR", "Hoạt động không thuộc buổi học");
      const result = await createOnce(
        req,
        res,
        `/sessions/${session.id}/checks`,
        async (tx) => {
          await tx.quickCheck.updateMany({
            where: { sessionId: session.id, status: "open" },
            data: { status: "closed", closedAt: new Date() },
          });
          const check = await tx.quickCheck.create({
            data: {
              sessionId: session.id,
              activityId: parsed.data.activityId,
              question: parsed.data.question,
              status: "open",
            },
          });
          await tx.session.update({
            where: { id: session.id },
            data: { sharedView: "check", version: { increment: 1 } },
          });
          await appendOutboxEvent(tx, {
            sessionId: session.id,
            type: "quick_check.opened",
            label: "Mở câu hỏi kiểm tra nhanh",
            actorId: res.locals.actor.id,
            visibility: { scope: "public" },
            activityId: parsed.data.activityId,
            resourceId: check.id,
          });
          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "quick_check.opened",
              targetType: "quick_check",
              targetId: check.id,
              sessionId: session.id,
              requestId: res.locals.requestId,
              metadata: {},
            },
          });
          return check.id;
        },
      );
      if (!result) return;
      triggerOutboxPublish(session.id);
      return res.status(201).json({
        check: await db.quickCheck.findUniqueOrThrow({
          where: { id: result.resourceId },
        }),
      });
    }),
  );

  // 17. Close / Reopen Quick Check (PATCH /checks/:checkId)
  r.patch(
    "/checks/:checkId",
    requireTeacher(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.checkId).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const parsed = QuickCheckStatusUpdate.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Trạng thái không hợp lệ");
      const check = await db.quickCheck.findUnique({
        where: { id: req.params.checkId },
        include: { sessionIdRef: true },
      });
      if (!check)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy câu hỏi");
      if (check.sessionIdRef.teacherId !== res.locals.actor.id)
        return fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
      if (
        parsed.data.status === "open" &&
        check.sessionIdRef.status !== "live"
      )
        return fail(res, 409, "SESSION_NOT_LIVE", "Buổi học đã kết thúc");
      const updated = await db.$transaction(async (tx) => {
        const row = await tx.quickCheck.update({
          where: { id: check.id },
          data: {
            status: parsed.data.status,
            closedAt: parsed.data.status === "closed" ? new Date() : null,
          },
        });
        await appendOutboxEvent(tx, {
          sessionId: check.sessionId,
          type:
            parsed.data.status === "closed"
              ? "quick_check.closed"
              : "quick_check.opened",
          label:
            parsed.data.status === "closed"
              ? "Đóng câu hỏi kiểm tra nhanh"
              : "Mở câu hỏi kiểm tra nhanh",
          actorId: res.locals.actor.id,
          visibility: { scope: "public" },
          activityId: check.activityId,
          resourceId: check.id,
        });
        return row;
      });
      triggerOutboxPublish(check.sessionId);
      return res.json({ check: updated });
    }),
  );

  // 18. Student QuickCheck Response (POST /checks/:checkId/responses) - unique (checkId, studentId), 409 on duplicate unless idempotent replay
  r.post(
    "/checks/:checkId/responses",
    requireStudent(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.checkId).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID câu hỏi không hợp lệ");
      const parsed = CheckResponseInput.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Câu trả lời không được để trống");
      const check = await db.quickCheck.findUnique({
        where: { id: req.params.checkId },
      });
      if (!check)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy câu hỏi");
      const actor = res.locals.actor as StudentActor;
      const access = await checkStudentToolAccess(
        actor,
        check.sessionId,
        "check",
        res,
      );
      if (!access) return;
      if (check.status !== "open")
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Câu hỏi kiểm tra nhanh đã đóng",
        );

      const routeKey = `/checks/${check.id}/responses`;
      const prior = await lookupReplay(req, res, routeKey);
      if (prior === null) return;
      if (prior) {
        return res.status(201).json({
          response: await db.checkResponse.findUniqueOrThrow({
            where: { id: prior.resourceId },
          }),
        });
      }
      const duplicate = await db.checkResponse.findUnique({
        where: {
          checkId_studentId: {
            checkId: check.id,
            studentId: actor.studentId,
          },
        },
      });
      if (duplicate)
        return fail(
          res,
          409,
          "VERSION_CONFLICT",
          "Bạn đã nộp câu trả lời cho câu hỏi kiểm tra nhanh này",
        );

      const result = await createOnce(req, res, routeKey, async (tx) => {
        const created = await tx.checkResponse.create({
          data: {
            checkId: check.id,
            sessionId: check.sessionId,
            studentId: actor.studentId,
            answer: parsed.data.answer,
            support: "ChuaRo",
          },
        });
        await appendOutboxEvent(tx, {
          sessionId: check.sessionId,
          type: "quick_check.responded",
          label: "Học sinh trả lời kiểm tra nhanh",
          actorId: actor.id,
          visibility: { scope: "teacher" },
          activityId: check.activityId,
          resourceId: created.id,
        });
        await appendOutboxEvent(tx, {
          sessionId: check.sessionId,
          type: "quick_check.responded",
          label: "Đã ghi nhận câu trả lời kiểm tra nhanh",
          actorId: actor.id,
          visibility: { scope: "student", studentId: actor.studentId },
          activityId: check.activityId,
          resourceId: created.id,
        });
        return created.id;
      });
      if (!result) return;
      triggerOutboxPublish(check.sessionId);
      return res.status(201).json({
        response: await db.checkResponse.findUniqueOrThrow({
          where: { id: result.resourceId },
        }),
      });
    }),
  );

  // 19. Teacher Review QuickCheck Response (POST /checks/:checkId/responses/:rId/review)
  r.post(
    "/checks/:checkId/responses/:rId/review",
    requireTeacher(config),
    asyncRoute(async (req, res) => {
      if (
        !safeId.safeParse(req.params.checkId).success ||
        !safeId.safeParse(req.params.rId).success
      )
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const parsed = CheckResponseReviewInput.safeParse(req.body);
      if (!parsed.success)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Cần chọn mức hỗ trợ và nhập nhận xét",
        );
      const responseRow = await db.checkResponse.findFirst({
        where: { id: req.params.rId, checkId: req.params.checkId },
        include: { checkIdRef: true, sessionIdRef: true },
      });
      if (!responseRow)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy câu trả lời");
      if (responseRow.sessionIdRef.teacherId !== res.locals.actor.id)
        return fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
      const { updatedResponse, evidence } = await db.$transaction(
        async (tx) => {
          const updated = await tx.checkResponse.update({
            where: { id: responseRow.id },
            data: {
              support: parsed.data.support,
              feedback: parsed.data.feedback,
            },
          });
          const existingEv = await tx.evidence.findFirst({
            where: {
              sourceType: "check_response",
              sourceId: responseRow.id,
              sessionId: responseRow.sessionId,
            },
          });
          const ev = existingEv
            ? await tx.evidence.update({
                where: { id: existingEv.id },
                data: {
                  detail: parsed.data.feedback,
                  support: parsed.data.support,
                  version: { increment: 1 },
                },
              })
            : await tx.evidence.create({
                data: {
                  sessionId: responseRow.sessionId,
                  studentId: responseRow.studentId,
                  activityId: responseRow.checkIdRef.activityId,
                  kind: "KiemTraDocLap",
                  title: `Kiểm tra nhanh: ${responseRow.checkIdRef.question.slice(0, 80)}`,
                  detail: `${responseRow.answer} — Nhận xét: ${parsed.data.feedback}`,
                  support: parsed.data.support,
                  sourceType: "check_response",
                  sourceId: responseRow.id,
                  sourceVersion: 1,
                  isObservation: true,
                  createdBy: res.locals.actor.id,
                },
              });
          await appendOutboxEvent(tx, {
            sessionId: responseRow.sessionId,
            type: "evidence.created",
            label: "Đánh giá câu trả lời kiểm tra nhanh",
            actorId: res.locals.actor.id,
            visibility: { scope: "teacher" },
            activityId: responseRow.checkIdRef.activityId,
            sourceId: responseRow.id,
            resourceId: ev.id,
            version: ev.version,
          });
          return { updatedResponse: updated, evidence: ev };
        },
      );
      triggerOutboxPublish(responseRow.sessionId);
      return res.json({ response: updatedResponse, evidence });
    }),
  );

  // 20. Student Submission Upload Intent (scoped to teacherId + sessionId + studentId + purpose="submission")
  r.post(
    "/sessions/:id/submissions/upload-intent",
    requireClassroomActor(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID buổi học không hợp lệ");
      const parsed = UploadIntent.safeParse(req.body);
      if (!parsed.success)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Tệp bài nộp không hợp lệ hoặc vượt quá 10 MiB",
        );
      const actor = res.locals.actor as TeacherActor | StudentActor;
      let teacherId: string;
      let studentId: string;
      if (actor.role === "student") {
        const access = await checkStudentToolAccess(
          actor,
          req.params.id,
          "upload",
          res,
        );
        if (!access) return;
        teacherId = actor.teacherId;
        studentId = actor.studentId;
      } else {
        const session = await ownedSession(req.params.id, actor, res);
        if (!session) return;
        if (session.status !== "live")
          return fail(res, 409, "SESSION_NOT_LIVE", "Buổi học chưa bắt đầu");
        teacherId = actor.id;
        studentId = session.primaryStudentId;
      }
      const { publicClient, bucket } = storage();
      const key = `${teacherId}/submissions/${req.params.id}/${studentId}/${randomUUID()}`;
      const intent = await db.uploadIntent.create({
        data: {
          ...parsed.data,
          purpose: "submission",
          teacherId,
          sessionId: req.params.id,
          studentId,
          storageKey: key,
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
      });
      return res.status(201).json({
        uploadId: intent.id,
        uploadUrl: await publicClient.presignedPutObject(bucket, key, 600),
        expiresAt: intent.expiresAt,
      });
    }),
  );

  // 21. Create Student Submission (POST /sessions/:id/submissions) - verifies student-scoped uploadIntent + MinIO verified copy
  r.post(
    "/sessions/:id/submissions",
    requireClassroomActor(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID buổi học không hợp lệ");
      const parsed = SubmissionInput.safeParse(req.body);
      if (
        !parsed.success ||
        (parsed.data.activityId &&
          !safeId.safeParse(parsed.data.activityId).success) ||
        (parsed.data.uploadId &&
          !safeId.safeParse(parsed.data.uploadId).success)
      )
        return fail(res, 400, "VALIDATION_ERROR", "Dữ liệu bài nộp không hợp lệ");
      if (!parsed.data.answer.trim() && !parsed.data.uploadId)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Bài nộp cần có nội dung trả lời hoặc tệp đính kèm",
        );

      const actor = res.locals.actor as TeacherActor | StudentActor;
      let session: {
        id: string;
        teacherId: string;
        primaryStudentId: string;
        currentActivityId: string | null;
      };
      let studentId: string;
      if (actor.role === "student") {
        const access = await checkStudentToolAccess(
          actor,
          req.params.id,
          "upload",
          res,
        );
        if (!access) return;
        session = access.session;
        studentId = actor.studentId;
      } else {
        const s = await ownedSession(req.params.id, actor, res);
        if (!s) return;
        if (s.status !== "live")
          return fail(res, 409, "SESSION_NOT_LIVE", "Buổi học không trực tuyến");
        session = s;
        studentId = s.primaryStudentId;
      }

      const routeKey = `/sessions/${session.id}/submissions`;
      const prior = await lookupReplay(req, res, routeKey);
      if (prior === null) return;
      if (prior) {
        return res.status(201).json({
          submission: await db.submission.findUniqueOrThrow({
            where: { id: prior.resourceId },
          }),
        });
      }

      let upload: {
        id: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        sha256: string;
        storageKey: string;
      } | null = null;
      let finalKey: string | null = null;
      let committed = false;
      const { client, bucket } = storage();

      try {
        if (parsed.data.uploadId) {
          const intent = await db.uploadIntent.findUnique({
            where: { id: parsed.data.uploadId },
          });
          if (
            !intent ||
            intent.purpose !== "submission" ||
            intent.teacherId !== session.teacherId ||
            intent.sessionId !== session.id ||
            intent.studentId !== studentId
          ) {
            await audit(
              actor,
              "security.denied",
              "upload_intent",
              parsed.data.uploadId,
              res.locals.requestId,
              session.id,
            );
            return fail(
              res,
              403,
              "PERMISSION_DENIED",
              "Upload không thuộc về học sinh hoặc buổi học này",
            );
          }
          if (intent.usedAt || intent.expiresAt <= new Date())
            return fail(
              res,
              409,
              "VERSION_CONFLICT",
              "Upload đã được sử dụng hoặc hết hạn",
            );
          const staged = await client
            .statObject(bucket, intent.storageKey)
            .catch(() => null);
          if (!staged)
            return fail(
              res,
              409,
              "VERSION_CONFLICT",
              "Tệp bài nộp chưa được tải lên",
            );
          if (
            staged.size !== intent.sizeBytes ||
            staged.size > MAX_UPLOAD_BYTES
          ) {
            await client.removeObject(bucket, intent.storageKey).catch(() => {});
            return fail(
              res,
              400,
              "UPLOAD_FAILED",
              "Kích thước tệp không khớp hoặc vượt 10 MiB",
            );
          }
          finalKey = `${session.teacherId}/submissions/verified/${randomUUID()}`;
          try {
            await client.copyObject(
              bucket,
              finalKey,
              `/${bucket}/${intent.storageKey}`,
            );
          } catch {
            return fail(
              res,
              409,
              "VERSION_CONFLICT",
              "Không thể xác nhận tệp bài nộp",
            );
          }
          await client.removeObject(bucket, intent.storageKey).catch(() => {});
          const stream = await client.getObject(bucket, finalKey);
          const hash = createHash("sha256");
          let bytes = 0;
          let prefix = Buffer.alloc(0);
          for await (const chunk of stream) {
            const part = Buffer.from(chunk);
            bytes += part.length;
            if (bytes > MAX_UPLOAD_BYTES) {
              stream.destroy();
              return fail(res, 400, "UPLOAD_FAILED", "Tệp vượt quá 10 MiB");
            }
            if (prefix.length < 8)
              prefix = Buffer.concat([prefix, part]).subarray(0, 8);
            hash.update(part);
          }
          if (
            bytes !== intent.sizeBytes ||
            hash.digest("hex") !== intent.sha256 ||
            !signature(intent.mimeType, prefix)
          )
            return fail(
              res,
              400,
              "UPLOAD_FAILED",
              "Nội dung tệp không khớp định dạng hoặc mã kiểm tra SHA-256",
            );
          upload = intent;
        }

        const result = await createOnce(req, res, routeKey, async (tx) => {
          if (upload) {
            const claimed = await tx.uploadIntent.updateMany({
              where: {
                id: upload.id,
                teacherId: session.teacherId,
                sessionId: session.id,
                studentId,
                usedAt: null,
                expiresAt: { gt: new Date() },
              },
              data: { usedAt: new Date() },
            });
            if (!claimed.count) throw new Error("Upload already used");
          }
          const created = await tx.submission.create({
            data: {
              sessionId: session.id,
              studentId,
              activityId:
                parsed.data.activityId ?? session.currentActivityId ?? null,
              title: parsed.data.title,
              answer: parsed.data.answer,
              fileName: upload?.fileName ?? null,
              storageKey: finalKey,
              mimeType: upload?.mimeType ?? null,
              sizeBytes: upload?.sizeBytes ?? null,
              status: "new",
            },
          });
          await appendOutboxEvent(tx, {
            sessionId: session.id,
            type: "submission.created",
            label: "Học sinh nộp bài làm",
            actorId: actor.id,
            visibility: { scope: "teacher" },
            activityId: created.activityId,
            resourceId: created.id,
            version: created.version,
          });
          await appendOutboxEvent(tx, {
            sessionId: session.id,
            type: "submission.created",
            label: "Đã nộp bài làm",
            actorId: actor.id,
            visibility: { scope: "student", studentId },
            activityId: created.activityId,
            resourceId: created.id,
            version: created.version,
          });
          await tx.auditLog.create({
            data: {
              workspaceId: actor.workspaceId,
              actorId: actor.id,
              actorRole: actor.role === "student" ? "student" : "teacher",
              action: "submission.created",
              targetType: "submission",
              targetId: created.id,
              sessionId: session.id,
              requestId: res.locals.requestId,
              metadata: {},
            },
          });
          return created.id;
        });
        if (!result) return;
        committed = !result.replay;
        triggerOutboxPublish(session.id);
        return res.status(201).json({
          submission: await db.submission.findUniqueOrThrow({
            where: { id: result.resourceId },
          }),
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Upload already used")
          return fail(res, 409, "VERSION_CONFLICT", "Upload đã được sử dụng");
        throw error;
      } finally {
        if (finalKey && !committed) {
          await client.removeObject(bucket, finalKey).catch(() => {});
        }
      }
    }),
  );

  // 22. Submission Signed Read URL (GET /submissions/:id/read-url) - isolated to owning teacher or owning student
  r.get(
    "/submissions/:id/read-url",
    requireClassroomActor(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const submission = await db.submission.findUnique({
        where: { id: req.params.id },
        include: { sessionIdRef: true },
      });
      if (!submission || !submission.storageKey)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy tệp bài nộp");
      const actor = res.locals.actor as TeacherActor | StudentActor;
      if (actor.role === "teacher") {
        if (submission.sessionIdRef.teacherId !== actor.id) {
          await audit(
            actor,
            "security.denied",
            "submission",
            submission.id,
            res.locals.requestId,
          );
          return fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
        }
      } else {
        if (
          submission.sessionId !== actor.sessionId ||
          submission.studentId !== actor.studentId
        ) {
          await audit(
            actor,
            "security.denied",
            "submission",
            submission.id,
            res.locals.requestId,
            actor.sessionId,
          );
          return fail(
            res,
            403,
            "PERMISSION_DENIED",
            "Không được xem tệp bài làm của học sinh khác",
          );
        }
      }
      const { publicClient, bucket } = storage();
      return res.json({
        readUrl: await publicClient.presignedGetObject(
          bucket,
          submission.storageKey,
          300,
        ),
        fileName: submission.fileName,
        mimeType: submission.mimeType,
        version: submission.version,
      });
    }),
  );

  // 23. Teacher Grade Submission (PATCH /submissions/:id/grade) - allowed during live & after ended, creates/updates versioned Evidence
  r.patch(
    "/submissions/:id/grade",
    requireTeacher(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const parsed = GradeInput.safeParse(req.body);
      if (!parsed.success)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Cần chọn mức hỗ trợ và nhập nhận xét chấm bài",
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
      const expected = versionHeader(req);
      if (expected === -1)
        return fail(res, 400, "VALIDATION_ERROR", "If-Match-Version không hợp lệ");
      if (expected !== null && submission.version !== expected)
        return fail(res, 409, "VERSION_CONFLICT", "Bài nộp đã thay đổi phiên bản");

      const { updatedSubmission, evidence } = await db.$transaction(
        async (tx) => {
          const updated = await tx.submission.update({
            where: { id: submission.id },
            data: {
              finalFeedback: parsed.data.feedback,
              support: parsed.data.support,
              score: parsed.data.score ?? submission.score,
              status: "reviewed",
              version: { increment: 1 },
            },
          });
          const existingEv = await tx.evidence.findFirst({
            where: {
              sourceType: "submission",
              sourceId: submission.id,
              sessionId: submission.sessionId,
            },
          });
          let ev;
          if (existingEv) {
            await tx.evidenceRevision.create({
              data: {
                evidenceId: existingEv.id,
                version: existingEv.version,
                detail: existingEv.detail,
                support: existingEv.support,
                studentId: existingEv.studentId,
                sessionId: existingEv.sessionId,
                activityId: existingEv.activityId,
                sourceType: existingEv.sourceType,
                sourceId: existingEv.sourceId,
                sourceVersion: existingEv.sourceVersion,
                status: existingEv.status,
                changedBy: res.locals.actor.id,
                reason: "Cập nhật chấm bài",
              },
            });
            ev = await tx.evidence.update({
              where: { id: existingEv.id },
              data: {
                detail: parsed.data.feedback,
                support: parsed.data.support,
                sourceVersion: updated.version,
                status: "active",
                version: { increment: 1 },
              },
            });
            const dependentClaims = await tx.claim.findMany({
              where: {
                sessionId: submission.sessionId,
                evidenceIds: { has: existingEv.id },
                status: "approved",
              },
            });
            for (const cl of dependentClaims) {
              await tx.claimRevision.create({
                data: {
                  claimId: cl.id,
                  revision: cl.revision,
                  text: cl.text,
                  evidenceIds: cl.evidenceIds,
                  status: "pending",
                  actorId: res.locals.actor.id,
                  reason: "source_corrected",
                },
              });
              await tx.claim.update({
                where: { id: cl.id },
                data: {
                  status: "pending",
                  staleReason: "source_corrected",
                  revision: { increment: 1 },
                },
              });
            }
            if (
              dependentClaims.length > 0 &&
              submission.sessionIdRef.status === "reviewed"
            ) {
              await tx.session.update({
                where: { id: submission.sessionId },
                data: { status: "ended", version: { increment: 1 } },
              });
            }
          } else {
            ev = await tx.evidence.create({
              data: {
                sessionId: submission.sessionId,
                studentId: submission.studentId,
                activityId: submission.activityId,
                kind: "BaiLam",
                title: `Bài nộp: ${submission.title}`,
                detail: parsed.data.feedback,
                support: parsed.data.support,
                sourceType: "submission",
                sourceId: submission.id,
                submissionId: submission.id,
                sourceVersion: updated.version,
                isObservation: true,
                createdBy: res.locals.actor.id,
              },
            });
          }
          await appendOutboxEvent(tx, {
            sessionId: submission.sessionId,
            type: "evidence.created",
            label: "Chấm bài và lưu minh chứng",
            actorId: res.locals.actor.id,
            visibility: { scope: "teacher" },
            activityId: submission.activityId,
            sourceId: submission.id,
            resourceId: ev.id,
            version: ev.version,
          });
          await appendOutboxEvent(tx, {
            sessionId: submission.sessionId,
            type: "submission.created",
            label: "Giáo viên đã trả kết quả chấm bài",
            actorId: res.locals.actor.id,
            visibility: { scope: "student", studentId: submission.studentId },
            activityId: submission.activityId,
            resourceId: updated.id,
            version: updated.version,
          });
          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "submission.graded",
              targetType: "submission",
              targetId: submission.id,
              sessionId: submission.sessionId,
              requestId: res.locals.requestId,
              metadata: { revision: updated.version },
            },
          });
          return { updatedSubmission: updated, evidence: ev };
        },
      );
      triggerOutboxPublish(submission.sessionId);
      return res.json({ submission: updatedSubmission, evidence });
    }),
  );

  // 24. Room Chat Message (POST /sessions/:id/messages)
  r.post(
    "/sessions/:id/messages",
    requireClassroomActor(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const parsed = MessageInput.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Tin nhắn không hợp lệ");
      const actor = res.locals.actor as TeacherActor | StudentActor;
      let authorId: string;
      if (actor.role === "student") {
        const access = await checkStudentToolAccess(
          actor,
          req.params.id,
          "chat",
          res,
        );
        if (!access) return;
        if (!allowChatRate(actor.id))
          return fail(
            res,
            403,
            "PERMISSION_DENIED",
            "Gửi tin nhắn quá nhanh, vui lòng thử lại sau giây lát",
          );
        authorId = actor.studentId;
      } else {
        const session = await ownedSession(req.params.id, actor, res);
        if (!session) return;
        if (session.status !== "live")
          return fail(
            res,
            409,
            "SESSION_NOT_LIVE",
            "Buổi học chưa bắt đầu hoặc đã kết thúc",
          );
        const tools = Tools.safeParse(session.tools).success
          ? Tools.parse(session.tools)
          : { board: true, upload: true, check: true, chat: true };
        if (!tools.chat)
          return fail(
            res,
            403,
            "PERMISSION_DENIED",
            "Trò chuyện lớp học đang tắt",
          );
        authorId = "teacher";
      }
      const message = await db.$transaction(async (tx) => {
        const created = await tx.roomMessage.create({
          data: {
            sessionId: req.params.id,
            authorId,
            text: parsed.data.text,
          },
        });
        await appendOutboxEvent(tx, {
          sessionId: req.params.id,
          type: "chat.message",
          label: "Tin nhắn phòng học",
          actorId: actor.id,
          visibility: { scope: "public" },
          resourceId: created.id,
        });
        return created;
      });
      triggerOutboxPublish(req.params.id);
      return res.status(201).json({ message });
    }),
  );

  // 25. Student Reaction (POST /sessions/:id/reactions)
  r.post(
    "/sessions/:id/reactions",
    requireStudent(config),
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const parsed = ReactionInput.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Biểu cảm không hợp lệ");
      const actor = res.locals.actor as StudentActor;
      const access = await checkStudentToolAccess(
        actor,
        req.params.id,
        "reaction",
        res,
      );
      if (!access) return;
      const reaction = await db.$transaction(async (tx) => {
        const saved = await tx.roomReaction.upsert({
          where: {
            sessionId_studentId: {
              sessionId: req.params.id,
              studentId: actor.studentId,
            },
          },
          update: {
            emoji: parsed.data.emoji,
            label: parsed.data.label,
            createdAt: new Date(),
          },
          create: {
            sessionId: req.params.id,
            studentId: actor.studentId,
            emoji: parsed.data.emoji,
            label: parsed.data.label,
          },
        });
        await appendOutboxEvent(tx, {
          sessionId: req.params.id,
          type: "reaction.updated",
          label: "Phản hồi nhanh của học sinh",
          actorId: actor.id,
          visibility: { scope: "public" },
          resourceId: saved.id,
        });
        return saved;
      });
      triggerOutboxPublish(req.params.id);
      return res.json({ reaction });
    }),
  );

  return r;
}
