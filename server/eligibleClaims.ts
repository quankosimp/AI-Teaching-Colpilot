import { db } from "./context.js";
import type { Prisma } from "@prisma/client";
import { resolveCurrentSourceVersion } from "./sourceVersion.js";

type ClaimForEligibility = {
  id: string;
  status: string;
  sessionId: string;
  studentId: string;
  evidenceIds: string[];
};

/** Approved history may use only intact, owner-scoped observations. */
export async function filterEligibleApprovedClaims<
  T extends ClaimForEligibility,
>(claims: T[], teacherId: string, client: Prisma.TransactionClient = db) {
  const ids = [...new Set(claims.flatMap((claim) => claim.evidenceIds))];
  const evidence = await client.evidence.findMany({
    where: {
      id: {
        in: ids.filter((id) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
          ),
        ),
      },
      sessionIdRef: { teacherId },
      status: "active",
    },
    select: {
      id: true,
      studentId: true,
      sessionId: true,
      isObservation: true,
      kind: true,
      sourceType: true,
      sourceId: true,
      sourceVersion: true,
      submissionId: true,
    },
  });
  const validSources = new Set<string>();
  for (const item of evidence) {
    const expectedVersion = item.sourceVersion ?? (item.sourceType === "note" ? 1 : 0);
    if (expectedVersion > 0 && await resolveCurrentSourceVersion(item.sourceType, item.sourceId ?? item.submissionId, item.sessionId, client, item.studentId) === expectedVersion) {
      validSources.add(item.id);
    }
  }
  return claims.filter((claim) => {
    if (
      claim.status !== "approved" ||
      !claim.evidenceIds.length ||
      new Set(claim.evidenceIds).size !== claim.evidenceIds.length
    )
      return false;
    const selected = claim.evidenceIds.map((id) =>
      evidence.find(
        (item) =>
          item.id === id &&
          item.studentId === claim.studentId &&
          item.sessionId === claim.sessionId,
      ),
    );
    return (
      selected.every(
        (item) =>
          Boolean(item) && validSources.has(item!.id),
      ) &&
      selected.some(
        (item) =>
          item?.isObservation &&
          item.kind !== "GoiYGiangDay" &&
          item.sourceType !== "ai_suggestion",
      )
    );
  });
}
