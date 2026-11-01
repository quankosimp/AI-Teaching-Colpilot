import type { Prisma, SupportLevel } from "@prisma/client";
import { appendOutboxEvent } from "./realtime.js";

type Evidence = Prisma.EvidenceGetPayload<{}>;
export async function reviseSourceEvidence(
  tx: Prisma.TransactionClient,
  input: {
    rows: Evidence[];
    sessionId: string;
    sessionStatus: string;
    actorId: string;
    workspaceId: string;
    requestId: string;
    detail: string;
    support: SupportLevel;
    sourceVersion: number;
  },
) {
  const rows = input.rows.filter((row) => row.status !== "deleted");
  const autoRows = rows.filter((row) => row.isAuto);

  for (const row of autoRows) {
    await tx.evidenceRevision.create({
      data: {
        evidenceId: row.id,
        version: row.version,
        detail: row.detail,
        support: row.support,
        studentId: row.studentId,
        sessionId: row.sessionId,
        activityId: row.activityId,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        sourceVersion: row.sourceVersion,
        isAuto: true,
        status: row.status,
        changedBy: input.actorId,
        reason: "source_corrected",
      },
    });
    await tx.evidence.update({
      where: { id: row.id },
      data: {
        detail: input.detail,
        support: input.support,
        sourceVersion: input.sourceVersion,
        version: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        actorRole: "teacher",
        action: "evidence.corrected",
        targetType: "evidence",
        targetId: row.id,
        sessionId: input.sessionId,
        requestId: input.requestId,
        metadata: { reasonCode: "source_corrected", version: row.version + 1 },
      },
    });
  }

  // ALL dependent claims across both auto and manual source observations
  // must be invalidated when the source changes, while preserving manual observation detail/support.
  const claims = rows.length
    ? await tx.claim.findMany({
        where: {
          sessionId: input.sessionId,
          status: "approved",
          evidenceIds: { hasSome: rows.map((row) => row.id) },
        },
      })
    : [];
  for (const claim of claims) {
    await tx.claimRevision.create({
      data: {
        claimId: claim.id,
        revision: claim.revision,
        text: claim.text,
        evidenceIds: claim.evidenceIds,
        status: claim.status,
        actorId: input.actorId,
        reason: "source_corrected",
      },
    });
    await tx.claim.update({
      where: { id: claim.id },
      data: {
        status: "pending",
        staleReason: "source_corrected",
        revision: { increment: 1 },
      },
    });
  }
  if (claims.length && input.sessionStatus === "reviewed") {
    const existingSession = await tx.session.findUnique({
      where: { id: input.sessionId },
      select: { endedAt: true },
    });
    const session = await tx.session.update({
      where: { id: input.sessionId },
      data: {
        status: "ended",
        endedAt: existingSession?.endedAt ?? new Date(),
        version: { increment: 1 },
      },
    });
    await appendOutboxEvent(tx, {
      sessionId: input.sessionId,
      type: "review.reopened",
      label: "Mở lại duyệt sau khi sửa nguồn",
      actorId: input.actorId,
      visibility: { scope: "teacher" },
      resourceId: input.sessionId,
      version: session.version,
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        actorRole: "teacher",
        action: "review.reopened",
        targetType: "session",
        targetId: input.sessionId,
        sessionId: input.sessionId,
        requestId: input.requestId,
        metadata: { reasonCode: "source_corrected" },
      },
    });
  }
  return autoRows.length
    ? tx.evidence.findUniqueOrThrow({ where: { id: autoRows[0].id } })
    : null;
}
