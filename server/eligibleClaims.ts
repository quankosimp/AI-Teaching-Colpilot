import { db } from "./context.js";

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
>(claims: T[], teacherId: string) {
  const ids = [...new Set(claims.flatMap((claim) => claim.evidenceIds))];
  const evidence = await db.evidence.findMany({
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
    },
  });
  const annotationIds = evidence
    .filter((item) => item.sourceType === "annotation" && item.sourceId)
    .map((item) => item.sourceId!);
  const annotations = await db.annotation.findMany({
    where: { id: { in: annotationIds } },
    select: { id: true, sessionId: true, studentId: true },
  });
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
          Boolean(item) &&
          (item!.sourceType !== "annotation" ||
            annotations.some(
              (annotation) =>
                annotation.id === item!.sourceId &&
                annotation.sessionId === claim.sessionId &&
                annotation.studentId === claim.studentId,
            )),
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
