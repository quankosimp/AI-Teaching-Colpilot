import { Router } from "express";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { SignJWT } from "jose";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { AuthMockInput } from "../../contracts/api.js";
import {
  asyncRoute,
  db,
  fail,
  requireTeacher,
  type AppConfig,
} from "../context.js";
import type { Response } from "express";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
const cookieOptions = (config: AppConfig) => ({
  httpOnly: true,
  secure: config.mode === "production" || config.mode === "staging",
  sameSite: "strict" as const,
  path: "/api/v1/auth",
  maxAge: 7 * 86400_000,
});
const clearCookieOptions = (config: AppConfig) => {
  const { maxAge: _maxAge, ...options } = cookieOptions(config);
  return options;
};
async function access(config: AppConfig, teacherId: string, sessionId: string) {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("teaching-copilot")
    .setAudience("teacher")
    .setSubject(teacherId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(config.jwtSecret);
}
async function issue(config: AppConfig, res: Response, teacherId: string) {
  const token = random();
  const session = await db.teacherAuthSession.create({
    data: {
      teacherId,
      refreshTokenHash: digest(token),
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    },
  });
  res.cookie("copilot_refresh", token, cookieOptions(config));
  return res.json({ accessToken: await access(config, teacherId, session.id) });
}
export function authRouter(config: AppConfig) {
  const r = Router();
  r.post(
    "/mock",
    asyncRoute(async (req, res) => {
      if (config.mode !== "local_mock" && config.mode !== "test")
        return fail(res, 404, "NOT_FOUND", "Không khả dụng");
      const parsed = AuthMockInput.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Tài khoản không hợp lệ");
      const identity = await db.teacherOAuthIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: "mock",
            providerSubject: parsed.data.account,
          },
        },
        include: { teacherIdRef: true },
      });
      if (!identity || identity.teacherIdRef.status !== "active")
        return fail(res, 401, "UNAUTHORIZED", "Tài khoản demo chưa được tạo");
      return issue(config, res, identity.teacherId);
    }),
  );
  r.post(
    "/refresh",
    asyncRoute(async (req, res) => {
      const raw = req.cookies?.copilot_refresh;
      if (typeof raw !== "string")
        return fail(res, 401, "UNAUTHORIZED", "Cần đăng nhập");
      const old = await db.teacherAuthSession.findUnique({
        where: { refreshTokenHash: digest(raw) },
        include: { teacherIdRef: true },
      });
      if (
        !old ||
        old.revokedAt ||
        old.expiresAt <= new Date() ||
        old.teacherIdRef.status !== "active"
      )
        return fail(res, 401, "UNAUTHORIZED", "Phiên đã hết hạn");
      const nextToken = random();
      const next = await db.$transaction(async (tx) => {
        const changed = await tx.teacherAuthSession.updateMany({
          where: { id: old.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (changed.count !== 1) return null;
        return tx.teacherAuthSession.create({
          data: {
            teacherId: old.teacherId,
            refreshTokenHash: digest(nextToken),
            expiresAt: new Date(Date.now() + 7 * 86400_000),
          },
        });
      });
      if (!next) return fail(res, 401, "UNAUTHORIZED", "Phiên đã thu hồi");
      res.cookie("copilot_refresh", nextToken, cookieOptions(config));
      return res.json({
        accessToken: await access(config, old.teacherId, next.id),
      });
    }),
  );
  r.post(
    "/logout",
    requireTeacher(config),
    asyncRoute(async (req, res) => {
      const raw = req.cookies?.copilot_refresh;
      const cookieSession =
        typeof raw === "string"
          ? await db.teacherAuthSession.findUnique({
              where: { refreshTokenHash: digest(raw) },
              select: { teacherId: true },
            })
          : null;
      const match =
        typeof raw === "string" &&
        cookieSession?.teacherId === res.locals.actor.id
          ? [{ refreshTokenHash: digest(raw) }]
          : [];
      await db.teacherAuthSession.updateMany({
        where: {
          teacherId: res.locals.actor.id,
          revokedAt: null,
          OR: [{ id: res.locals.actor.sessionId }, ...match],
        },
        data: { revokedAt: new Date() },
      });
      if (!cookieSession || cookieSession.teacherId === res.locals.actor.id)
        res.clearCookie("copilot_refresh", clearCookieOptions(config));
      return res.status(204).end();
    }),
  );
  r.get(
    "/me",
    requireTeacher(config),
    asyncRoute(async (_req, res) => {
      const teacher = await db.teacher.findUniqueOrThrow({
        where: { id: res.locals.actor.id },
        select: { id: true, name: true, email: true, workspaceId: true },
      });
      return res.json({
        teacher,
        featureFlags: {
          ai:
            process.env.ENABLE_AI === "true" &&
            !!process.env.GEMINI_API_KEY &&
            !!process.env.GEMINI_MODEL,
          recording: false,
        },
      });
    }),
  );
  const google = () =>
    config.googleClientId &&
    config.googleClientSecret &&
    config.googleRedirectUri
      ? new OAuth2Client(
          config.googleClientId,
          config.googleClientSecret,
          config.googleRedirectUri,
        )
      : null;
  r.get(
    "/google/start",
    asyncRoute(async (_req, res) => {
      const client = google();
      if (!client)
        return fail(res, 503, "AUTH_UNAVAILABLE", "Google chưa được cấu hình");
      const state = random(),
        verifier = random();
      res.cookie("oauth_state", `${state}.${verifier}`, {
        ...cookieOptions(config),
        sameSite: "lax",
        signed: true,
        maxAge: 600_000,
      });
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      return res.json({
        url: client.generateAuthUrl({
          scope: ["openid", "email", "profile"],
          state,
          code_challenge: challenge,
          code_challenge_method: "S256" as never,
        }),
      });
    }),
  );
  r.post(
    "/google/callback",
    asyncRoute(async (req, res) => {
      const client = google();
      if (!client || !config.googleClientId)
        return fail(res, 503, "AUTH_UNAVAILABLE", "Google chưa được cấu hình");
      const body = z
        .strictObject({ code: z.string().min(1), state: z.string().min(1) })
        .safeParse(req.body);
      const stored = req.signedCookies?.oauth_state;
      if (!body.success || typeof stored !== "string")
        return fail(res, 400, "VALIDATION_ERROR", "OAuth state không hợp lệ");
      const [state, verifier] = stored.split(".");
      const a = Buffer.from(state || ""),
        b = Buffer.from(body.data.state);
      if (!verifier || a.length !== b.length || !timingSafeEqual(a, b))
        return fail(res, 400, "VALIDATION_ERROR", "OAuth state không hợp lệ");
      res.clearCookie("oauth_state", {
        ...clearCookieOptions(config),
        sameSite: "lax",
      });
      const { tokens } = await client.getToken({
        code: body.data.code,
        codeVerifier: verifier,
      });
      if (!tokens.id_token)
        return fail(
          res,
          401,
          "UNAUTHORIZED",
          "Google không trả identity token",
        );
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.googleClientId,
      });
      const p = ticket.getPayload();
      if (
        !p?.sub ||
        !p.email ||
        !p.email_verified ||
        !["accounts.google.com", "https://accounts.google.com"].includes(
          p.iss || "",
        )
      )
        return fail(res, 401, "UNAUTHORIZED", "Google identity không hợp lệ");
      const identity = await db.teacherOAuthIdentity.upsert({
        where: {
          provider_providerSubject: {
            provider: "google",
            providerSubject: p.sub,
          },
        },
        update: {},
        create: {
          provider: "google",
          providerSubject: p.sub,
          teacherIdRef: {
            create: {
              email: p.email,
              name: p.name || p.email,
              workspaceId: crypto.randomUUID(),
            },
          },
        },
      });
      return issue(config, res, identity.teacherId);
    }),
  );
  return r;
}
