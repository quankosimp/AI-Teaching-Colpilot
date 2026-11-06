import { useCallback, useState } from "react";
import { api } from "../onlineApi";
import { errText } from "./ui";

type OpenResult = { sessionId: string; action: "rejoin" | "start" | "created"; needsStart: boolean };

/** Bấm Mở lớp: hỏi server buổi nào, bắt đầu buổi nếu cần, rồi vào phòng. */
export function useOpenClass(onEnter: (sessionId: string) => void) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const open = useCallback(async (groupId: string) => {
    setBusy(groupId);
    setError("");
    try {
      const r = await api<OpenResult>(`/groups/${groupId}/open`, { method: "POST", body: "{}" });
      if (r.needsStart) await api(`/sessions/${r.sessionId}/start`, { method: "POST", body: "{}" });
      onEnter(r.sessionId);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
    }
  }, [onEnter]);
  return { open, busy, error, clearError: () => setError("") };
}
