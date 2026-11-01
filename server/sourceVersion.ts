import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./context.js";
const safeId = z.uuid();

export async function resolveCurrentSourceVersion(
  sourceType: string,
  sourceId: string | null,
  sessionId: string,
  client: Prisma.TransactionClient = db,
  studentId?: string,
): Promise<number> {
  if (sourceType === "note") return 1;
  if (!sourceId || !safeId.safeParse(sourceId).success) return 0;
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
      select: { version: true },
    });
    return resp?.version ?? 0;
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
  return 0;
}

