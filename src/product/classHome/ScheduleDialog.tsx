import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { nextOccurrences, vnNowTime, vnToday } from "../../../contracts/classes";
import { api } from "../onlineApi";
import { Modal, dayLabel, errText, weekdayNames } from "./ui";
import type { ClassSchedule } from "./types";

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // T2 … CN

/** Lịch lặp không bắt buộc: chỉ chọn thứ và giờ bắt đầu, không hỏi thời lượng. */
export function ScheduleDialog({ groupId, groupName, schedule, onClose, onSaved }: {
  groupId: string; groupName: string; schedule: ClassSchedule | null;
  onClose: () => void; onSaved: (s: ClassSchedule | null) => void;
}) {
  const [days, setDays] = useState<number[]>(schedule?.days ?? []);
  const [time, setTime] = useState(schedule?.time ?? "19:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = nextOccurrences(days, time, vnToday(), 3, vnNowTime());
  const toggle = (d: number) => setDays((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d]));
  const save = async () => {
    setBusy(true); setError("");
    try {
      const r = await api<{ schedule: ClassSchedule }>(`/groups/${groupId}/schedule`, { method: "PUT", body: JSON.stringify({ days, time }) });
      onSaved(r.schedule);
    } catch (e) { setError(errText(e)); setBusy(false); }
  };
  const clear = async () => {
    setBusy(true); setError("");
    try { await api(`/groups/${groupId}/schedule`, { method: "DELETE" }); onSaved(null); }
    catch (e) { setError(errText(e)); setBusy(false); }
  };
  return <Modal title="Lịch học của lớp" sub={`${groupName} · không bắt buộc`} onClose={onClose} footer={<>
    {schedule && <button type="button" className="cls-btn cls-btn--txt" disabled={busy} onClick={() => void clear()}>Xoá lịch</button>}
    <span className="cls-grow" />
    <button type="button" className="cls-btn cls-btn--sec" onClick={onClose}>Huỷ</button>
    <button type="button" className="cls-btn cls-btn--pri" disabled={busy || !days.length || !time} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu lịch"}</button>
  </>}>
    <div className="cls-field"><span>Học vào các thứ</span>
      <div className="cls-days">{ORDER.map((d) => <button key={d} type="button" className={days.includes(d) ? "is-on" : ""} aria-pressed={days.includes(d)} onClick={() => toggle(d)}>{weekdayNames[d]}</button>)}</div>
    </div>
    <label className="cls-field" style={{ maxWidth: 200 }}>Giờ bắt đầu<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
    <div className="cls-preview">
      <span className="cls-one">{preview.length ? <>Các buổi tới: <b>{preview.map(dayLabel).join(", ")}</b></> : "Chọn ít nhất một thứ để xem các buổi tới"}</span>
      <span className="cls-one">Không có lịch vẫn mở lớp được bất cứ lúc nào</span>
    </div>
    {error && <p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p>}
  </Modal>;
}
