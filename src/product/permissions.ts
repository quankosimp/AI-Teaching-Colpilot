import type { AppData, Session } from "./model";
import { sessionStudentIds } from "./model";
export function canStudentAct(
  data: AppData,
  sessionId: string,
  studentId: string,
  tool?: keyof NonNullable<Session["tools"]>,
  token?: string,
) {
  const s = data.sessions.find((s) => s.id === sessionId);
  const m = data.members.find(
    (m) => m.sessionId === sessionId && m.studentId === studentId,
  );
  const invite = data.invites.find(
    (i) =>
      i.token === token &&
      i.sessionId === sessionId &&
      i.studentId === studentId,
  );
  return (
    !!s &&
    s.status === "live" &&
    sessionStudentIds(s).includes(studentId) &&
    m?.state === "joined" &&
    !!invite &&
    !invite.revoked &&
    new Date(invite.expiresAt) > new Date() &&
    (!tool || !!s.tools?.[tool])
  );
}
