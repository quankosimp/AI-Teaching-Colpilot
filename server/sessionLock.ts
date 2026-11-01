import type { Prisma } from "@prisma/client";

/** Serialize session mutations before reading the state that authorizes them. */
export async function lockSession(
  tx: Prisma.TransactionClient,
  sessionId: string,
) {
  await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${sessionId}::uuid FOR UPDATE`;
  return tx.session.findUniqueOrThrow({ where: { id: sessionId } });
}
export class SessionConflict extends Error {
  constructor(
    public code:
      | "SESSION_STATE_INVALID"
      | "VERSION_CONFLICT"
      | "VALIDATION_ERROR"
      | "PERMISSION_DENIED",
    message: string,
  ) {
    super(message);
  }
}
