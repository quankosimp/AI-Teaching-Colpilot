import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "./onlineApi";
import { Modal } from "./ui";
import {
  lessonError, lessonHeading, lessonOrder, lessonToday, materialRef,
  type LessonMaterial, type LessonPupil, type LessonSession,
} from "./lessonPlanning";

export type ScheduleGroup = { id: string; name: string; students: { id: string }[] };
export type ScheduleStart = { group?: ScheduleGroup; material?: LessonMaterial };

function timingFor(groupId: string, sessions: LessonSession[]) {
  const last = sessions.filter(session => session.groupId === groupId).sort(lessonOrder).at(-1);
  const today = lessonToday();
  if (!last) return { date: today, time: "19:00", duration: 60 };
  const date = new Date(last.date + "T00:00:00Z");
  do date.setUTCDate(date.getUTCDate() + 7);
  while (date.toISOString().slice(0, 10) < today);
  return { date: date.toISOString().slice(0, 10), time: last.time, duration: last.duration };
}

export function LessonSchedule({ start, editing, students, sessions, onClose, onOpenClasses, onSaved }: {
  start: ScheduleStart;
  editing?: LessonSession;
  students: LessonPupil[];
  sessions: LessonSession[];
  onClose: () => void;
  onOpenClasses: () => void;
  onSaved: (session: LessonSession, notice: string) => void;
}) {
  const [groupId, setGroupId] = useState(start.group?.id ?? "");
  const [groups, setGroups] = useState<ScheduleGroup[]>(() => start.group ? [start.group] : []);
  const [loading, setLoading] = useState(!editing);
  const [groupError, setGroupError] = useState("");
  const [timing, setTiming] = useState(() => editing
    ? { date: editing.date, time: editing.time, duration: editing.duration }
    : timingFor(start.group?.id || "", sessions));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const receipt = useRef({ payload: "", key: "" });
  const group = groups.find(item => item.id === groupId);

  useEffect(() => {
    if (editing) return;
    let active = true;
    void api<{ groups: ScheduleGroup[] }>("/groups")
      .then(result => { if (active) setGroups(result.groups); })
      .catch(() => { if (active) setGroupError("Chưa tải được danh sách lớp."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [editing?.id]);

  function selectGroup(id: string) {
    const chosen = groups.find(item => item.id === id);
    setGroupId(id);
    if (chosen) setTiming(timingFor(chosen.id, sessions));
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || (!editing && !group?.students.length)) return;
    setError("");
    setBusy(true);
    try {
      if (editing) {
        const { session } = await api<{ session: Partial<LessonSession> }>("/sessions/" + editing.id, {
          method: "PATCH",
          headers: { "If-Match-Version": String(editing.version) },
          body: JSON.stringify(timing),
        });
        onSaved({ ...editing, ...session }, "Đã cập nhật lịch.");
        return;
      }
      if (!group) return;
      const input = {
        ...timing,
        title: group.name,
        status: "scheduled",
        ...(start.material && { initialMaterial: materialRef(start.material) }),
      };
      const path = "/groups/" + group.id + "/sessions";
      const body = JSON.stringify(input);
      if (receipt.current.payload !== path + body)
        receipt.current = { payload: path + body, key: crypto.randomUUID() };
      const { session } = await api<{ session: LessonSession }>(path, {
        method: "POST", headers: { "Idempotency-Key": receipt.current.key }, body,
      });
      onSaved(session, start.material ? "Đã đặt lịch và thêm " + start.material.title + "." : "Đã đặt lịch.");
    } catch (error) {
      setError(lessonError(error));
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={editing ? "Chỉnh lịch" : "Đặt lịch"} onClose={() => !busy && onClose()}>
    <form className="form-stack lesson-dialog-form" onSubmit={submit}>
      {editing ? <p className="lesson-dialog-context">{lessonHeading(editing, students)}</p> : (
        <>
          <label>Lớp học
            <select aria-label="Lớp học" value={groupId} required onChange={event => selectGroup(event.target.value)}>
              <option value="">Chọn lớp</option>
              {groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {loading && <p role="status" className="muted lesson-dialog-context">Đang tải danh sách lớp…</p>}
          {groupError && <p role="alert">{groupError}</p>}
          {group && <p className="muted lesson-dialog-context">{group.students.length
            ? "Cả lớp tham gia · " + group.students.length + " học sinh"
            : "Lớp này chưa có học sinh đang học."}</p>}
          {!loading && !groupError && (!groups.length || (group && !group.students.length)) && (
            <div>
              {!groups.length && <p className="muted lesson-dialog-context">Tạo lớp và thêm học sinh để đặt buổi học đầu tiên.</p>}
              <button className="text-button" type="button" onClick={onOpenClasses}>Mở mục Lớp</button>
            </div>
          )}
        </>
      )}
      <div className="lesson-timing-fields">
        <label>Ngày<input type="date" required value={timing.date} onChange={event => setTiming({ ...timing, date: event.target.value })} /></label>
        <label>Giờ bắt đầu<input type="time" required value={timing.time} onChange={event => setTiming({ ...timing, time: event.target.value })} /></label>
        <label>Thời lượng (phút)<input type="number" required min={group ? 15 : 1} max={editing ? undefined : 300}
          value={timing.duration || ""} onChange={event => setTiming({ ...timing, duration: Number(event.target.value) })} /></label>
      </div>
      {start.material && <div className="lesson-dialog-file"><strong>Tài liệu đính kèm</strong><span>{start.material.title}</span></div>}
      {error && <p role="alert" className="lesson-error">{error}</p>}
      <div className="lesson-dialog-actions">
        <button type="button" className="button ghost" disabled={busy} onClick={onClose}>Hủy</button>
        <button className="button primary" disabled={busy || (!editing && !group?.students.length)}>
          {busy ? "Đang lưu…" : editing ? "Lưu lịch" : "Đặt lịch"}
        </button>
      </div>
    </form>
  </Modal>;
}
