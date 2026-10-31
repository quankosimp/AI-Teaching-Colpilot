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
  workspaceId: string;
  sessionId: string;
};
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
) {
  return res
    .status(status)
    .json({ error: { code, message, requestId: res.locals.requestId } });
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
export function requireTeacher(config: AppConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const header = req.get("authorization") || "";
      if (!header.startsWith("Bearer "))
        return fail(res, 401, "UNAUTHORIZED", "Cần đăng nhập");
      const { payload } = await jwtVerify(header.slice(7), config.jwtSecret, {
        issuer: "teaching-copilot",
        audience: "teacher",
      });
      if (typeof payload.sub !== "string" || typeof payload.sid !== "string")
        throw new Error("Invalid claims");
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
        throw new Error("Invalid session");
      res.locals.actor = {
        id: session.teacherId,
        workspaceId: session.teacherIdRef.workspaceId,
        sessionId: session.id,
      } satisfies TeacherActor;
      next();
    } catch {
      return fail(res, 401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ");
    }
  };
}
export const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
export async function audit(
  actor: TeacherActor,
  action: string,
  targetType: string,
  targetId: string,
  requestIdValue: string,
) {
  await db.auditLog.create({
    data: {
      workspaceId: actor.workspaceId,
      actorId: actor.id,
      actorRole: "teacher",
      action,
      targetType,
      targetId,
      requestId: requestIdValue,
      metadata: {},
    },
  });
}
