import { PrismaClient } from "@prisma/client";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { jwtVerify } from "jose";

export const db = new PrismaClient();
export type AppConfig = {
  mode: "local_mock" | "test" | "production" | "staging";
  origin: string;
  jwtSecret: Uint8Array;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
};
export function loadConfig(): AppConfig {
  const mode = process.env.APP_MODE;
  if (
    mode !== "local_mock" &&
    mode !== "test" &&
    mode !== "production" &&
    mode !== "staging"
  )
    throw new Error("APP_MODE must be set explicitly");
  if (
    (process.env.NODE_ENV === "production" ||
      process.env.NODE_ENV === "staging") &&
    (mode === "local_mock" || mode === "test")
  )
    throw new Error("Mock mode is forbidden in staging and production");
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters");
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new Error("APP_ORIGIN is required");
  const url = new URL(origin);
  if (
    (mode === "staging" || mode === "production") &&
    url.protocol !== "https:"
  )
    throw new Error("APP_ORIGIN must use HTTPS");
  return {
    mode,
    origin: url.origin,
    jwtSecret: new TextEncoder().encode(secret),
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
  };
}
export type TeacherActor = {
  id: string;
  role: "teacher";
  workspaceId: string;
  sessionId: string;
};
export type StudentActor = {
  id: string;
  role: "student";
  studentId: string;
  teacherId: string;
  workspaceId: string;
  sessionId: string;
  memberId: string;
  grantId: string;
  displayName: string;
};
export type ClassroomActor =
  | (TeacherActor & { role: "teacher" })
  | StudentActor;

export function requestId(_req: Request, res: Response, next: NextFunction) {
  res.locals.requestId = randomUUID();
  res.setHeader("X-Request-Id", res.locals.requestId);
  next();
}
export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
  latestVersion?: number,
) {
  return res.status(status).json({
    error: {
      code,
      message,
      requestId: res.locals.requestId,
      ...(details !== undefined ? { details } : {}),
      ...(latestVersion !== undefined ? { latestVersion } : {}),
    },
  });
}
export function originGuard(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
      req.get("origin") !== config.origin
    )
      return fail(res, 403, "PERMISSION_DENIED", "Origin không hợp lệ");
    next();
  };
}
export async function verifyTeacherToken(
  rawToken: string,
  config: AppConfig,
): Promise<(TeacherActor & { role: "teacher" }) | null> {
  try {
    const { payload } = await jwtVerify(rawToken, config.jwtSecret, {
      issuer: "teaching-copilot",
      audience: "teacher",
    });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string")
      return null;
    const session = await db.teacherAuthSession.findUnique({
      where: { id: payload.sid },
      include: { teacherIdRef: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.teacherId !== payload.sub ||
      session.teacherIdRef.status !== "active"
    )
      return null;
    return {
      id: session.teacherId,
      role: "teacher",
      workspaceId: session.teacherIdRef.workspaceId,
      sessionId: session.id,
    };
  } catch {
    return null;
  }
}
export async function verifyStudentToken(
  rawToken: string,
  config: AppConfig,
): Promise<StudentActor | null> {
  try {
    const { payload } = await jwtVerify(rawToken, config.jwtSecret, {
      issuer: "teaching-copilot",
      audience: "student",
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.tid !== "string" ||
      typeof payload.ses !== "string" ||
      typeof payload.mid !== "string"
    )
      return null;
    const grant = await db.studentRoomSession.findUnique({
      where: { id: payload.sid },
      include: {
        teacherIdRef: true,
        memberIdRef: true,
      },
    });
    if (
      !grant ||
      grant.revokedAt ||
      grant.expiresAt <= new Date() ||
      grant.studentId !== payload.sub ||
      grant.teacherId !== payload.tid ||
      grant.sessionId !== payload.ses ||
      grant.memberId !== payload.mid ||
      grant.teacherIdRef.status !== "active" ||
      grant.memberIdRef.sessionId !== grant.sessionId ||
      grant.memberIdRef.studentId !== grant.studentId
    )
      return null;
    return {
      id: `student:${grant.studentId}:${grant.sessionId}`,
      role: "student",
      studentId: grant.studentId,
      teacherId: grant.teacherId,
      workspaceId: grant.teacherIdRef.workspaceId,
      sessionId: grant.sessionId,
      memberId: grant.memberId,
      grantId: grant.id,
      displayName: grant.displayName,
    };
  } catch {
    return null;
  }
}
export function requireTeacher(config: AppConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.get("authorization") || "";
    if (!header.startsWith("Bearer "))
      return fail(res, 401, "UNAUTHORIZED", "Cần đăng nhập");
    const actor = await verifyTeacherToken(header.slice(7), config);
    if (!actor)
      return fail(res, 401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ");
    res.locals.actor = actor;
    next();
  };
}
export function requireStudent(config: AppConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.get("authorization") || "";
    if (!header.startsWith("Bearer "))
      return fail(res, 401, "UNAUTHORIZED", "Cần mã tham gia lớp học");
    const actor = await verifyStudentToken(header.slice(7), config);
    if (!actor)
      return fail(
        res,
        401,
        "INVITE_INVALID",
        "Quyền tham gia lớp học không hợp lệ hoặc đã thu hồi",
      );
    res.locals.actor = actor;
    next();
  };
}
export function requireClassroomActor(config: AppConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.get("authorization") || "";
    if (!header.startsWith("Bearer "))
      return fail(res, 401, "UNAUTHORIZED", "Cần xác thực phòng học");
    const raw = header.slice(7);
    const teacher = await verifyTeacherToken(raw, config);
    if (teacher) {
      res.locals.actor = teacher;
      return next();
    }
    const student = await verifyStudentToken(raw, config);
    if (student) {
      res.locals.actor = student;
      return next();
    }
    return fail(
      res,
      401,
      "UNAUTHORIZED",
      "Phiên truy cập phòng học không hợp lệ",
    );
  };
}
export const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
export async function audit(
  actor: { id: string; workspaceId: string; role?: "teacher" | "student" },
  action: string,
  targetType: string,
  targetId: string,
  requestIdValue: string,
  sessionId?: string,
  metadata: Record<string, unknown> = {},
) {
  await db.auditLog.create({
    data: {
      workspaceId: actor.workspaceId,
      actorId: actor.role === "student" ? actor.id : actor.id,
      actorRole: actor.role === "student" ? "student" : "teacher",
      action,
      targetType,
      targetId,
      ...(sessionId ? { sessionId } : {}),
      requestId: requestIdValue,
      metadata: metadata as never,
    },
  });
}
