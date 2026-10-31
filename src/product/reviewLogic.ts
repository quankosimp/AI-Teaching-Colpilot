import type { AppData, Evidence } from "./model";

export function updateEvidence(
  data: AppData,
  evidenceId: string,
  detail: string,
  support: Evidence["support"],
  updatedAt: string,
): AppData {
  const current = data.evidence.find((item) => item.id === evidenceId);
  const trimmed = detail.trim();
  if (
    !current ||
    (current.detail === trimmed &&
      (current.support || "Chưa rõ") === (support || "Chưa rõ"))
  )
    return data;

  const affected = data.claims.filter(
    (claim) =>
      claim.status === "approved" && claim.evidenceIds.includes(evidenceId),
  );
  return {
    ...data,
    evidence: data.evidence.map((item) =>
      item.id === evidenceId
        ? { ...item, detail: trimmed, support, updatedAt }
        : item,
    ),
    claims: data.claims.map((claim) =>
      affected.some((item) => item.id === claim.id)
        ? { ...claim, status: "pending" }
        : claim,
    ),
    sessions: data.sessions.map((session) =>
      session.status === "reviewed" &&
      affected.some((claim) => claim.sessionId === session.id)
        ? { ...session, status: "ended" }
        : session,
    ),
  };
}

export function completeReview(data: AppData, sessionId: string): AppData {
  const session = data.sessions.find((item) => item.id === sessionId);
  if (
    !session ||
    session.status !== "ended" ||
    data.claims.some(
      (claim) => claim.sessionId === sessionId && claim.status === "pending",
    )
  )
    return data;
  return {
    ...data,
    sessions: data.sessions.map((item) =>
      item.id === sessionId ? { ...item, status: "reviewed" } : item,
    ),
  };
}
