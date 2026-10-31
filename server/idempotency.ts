import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { db, fail } from "./context.js";

type Result = { resourceId: string; replay: boolean } | null;
export async function lookupReplay(
  req: Request,
  res: Response,
  route: string,
): Promise<Result | undefined> {
  const key = req.get("Idempotency-Key");
  if (!key || key.length > 128) {
    fail(res, 400, "VALIDATION_ERROR", "Cần Idempotency-Key hợp lệ");
    return null;
  }
  const actorId = res.locals.actor.id as string;
  const record = await db.idempotencyRecord.findUnique({
    where: { actorId_route_key: { actorId, route, key } },
  });
  if (!record) return undefined;
  const requestHash = createHash("sha256")
    .update(JSON.stringify(req.body))
    .digest("hex");
  if (record.expiresAt <= new Date() || record.requestHash !== requestHash) {
    fail(
      res,
      409,
      "VERSION_CONFLICT",
      "Idempotency-Key không hợp lệ hoặc đã dùng cho yêu cầu khác",
    );
    return null;
  }
  const value = record.responseBody as { resourceId?: string };
  if (!value.resourceId) throw new Error("Invalid idempotency record");
  return { resourceId: value.resourceId, replay: true };
}
export async function createOnce(
  req: Request,
  res: Response,
  route: string,
  create: (tx: Prisma.TransactionClient) => Promise<string>,
): Promise<Result> {
  const key = req.get("Idempotency-Key");
  if (!key || key.length > 128) {
    fail(res, 400, "VALIDATION_ERROR", "Cần Idempotency-Key hợp lệ");
    return null;
  }
  const actorId = res.locals.actor.id as string;
  const requestHash = createHash("sha256")
    .update(JSON.stringify(req.body))
    .digest("hex");
  const where = { actorId_route_key: { actorId, route, key } };
  const read = async () => {
    const record = await db.idempotencyRecord.findUnique({ where });
    if (!record) return null;
    if (record.expiresAt <= new Date() || record.requestHash !== requestHash) {
      fail(
        res,
        409,
        "VERSION_CONFLICT",
        "Idempotency-Key không hợp lệ hoặc đã dùng cho yêu cầu khác",
      );
      return null;
    }
    const value = record.responseBody as { resourceId?: string };
    if (!value.resourceId) throw new Error("Invalid idempotency record");
    return { resourceId: value.resourceId, replay: true };
  };
  const existing = await db.idempotencyRecord.findUnique({ where });
  if (existing) return read();
  try {
    return await db.$transaction(async (tx) => {
      const resourceId = await create(tx);
      await tx.idempotencyRecord.create({
        data: {
          actorId,
          route,
          key,
          requestHash,
          statusCode: 201,
          responseBody: { resourceId },
          expiresAt: new Date(Date.now() + 24 * 3600_000),
        },
      });
      return { resourceId, replay: false };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const result = await read();
      if (result || res.headersSent) return result;
    }
    const replay = await lookupReplay(req, res, route);
    if (replay || res.headersSent) return replay || null;
    throw error;
  }
}
