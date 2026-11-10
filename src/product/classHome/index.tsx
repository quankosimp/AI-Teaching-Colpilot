import { useCallback, useEffect, useState } from "react";
import { api } from "../onlineApi";
import { CreateClass } from "../Classes";
import { ClassList } from "./ClassList";
import { ClassPage } from "./ClassPage";
import { errText } from "./ui";
import type { ClassSummary, Pupil } from "./types";

/** Màn đầu của app: danh sách lớp; bấm một lớp là mở trang lớp đó. */
export function ClassesHome({ students, initialOpenId = "", onEnterRoom, onOpenRoomView, onOpenAfter, onPrepare, onChanged, onOpenStudentProfile }: {
  students: Pupil[];
  initialOpenId?: string;
  onEnterRoom: (sessionId: string, groupId: string) => void;
  onOpenRoomView: (sessionId: string, view: "grading" | "summary", groupId: string) => void;
  onOpenAfter: (sessionId: string, groupId: string) => void;
  onPrepare: (sessionId: string, groupId: string) => void;
  onChanged: () => Promise<void> | void;
  onOpenStudentProfile?: (studentId: string, groupId: string, groupName: string) => void;
}) {
  const [groups, setGroups] = useState<ClassSummary[] | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(initialOpenId);
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    try { setGroups((await api<{ groups: ClassSummary[] }>("/groups")).groups); setError(""); }
    catch (e) { setError(errText(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (openId)
    return <ClassPage id={openId} students={students}
      onBack={() => { setOpenId(""); void load(); }}
      onEnterRoom={(sessionId) => onEnterRoom(sessionId, openId)}
      onOpenRoomView={(sessionId, view) => onOpenRoomView(sessionId, view, openId)}
      onOpenAfter={(sessionId) => onOpenAfter(sessionId, openId)}
      onPrepare={(sessionId) => onPrepare(sessionId, openId)}
      onChanged={onChanged}
      onOpenStudentProfile={onOpenStudentProfile} />;
  return <>
    <ClassList groups={groups} error={error} onOpenClass={setOpenId} onEnterRoom={onEnterRoom} onCreate={() => setCreating(true)} />
    {creating && <CreateClass students={students} onClose={() => setCreating(false)} onCreated={async (id) => { setCreating(false); await onChanged(); await load(); setOpenId(id); }} />}
  </>;
}
