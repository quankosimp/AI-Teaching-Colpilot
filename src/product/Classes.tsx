import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle, CalendarDays, Check, ChevronLeft, Clock, Copy, Link2, MoreHorizontal,
  Plus, RefreshCw, Sparkles, Trash2, UserPlus, X,
} from "lucide-react";
import { api, ApiError } from "./onlineApi";
import type { ScheduleGroup } from "./LessonSchedule";
import "./classes.css";

/* ---------- kiểu dữ liệu ---------- */
type Pupil = { id: string; name: string; initials: string; color: string; status?: string };
type NextSession = { id: string; title: string; date: string; time: string; duration: number; status: string; activities: number };
type GroupSummary = {
  id: string; name: string; subject: string; grade: string; createdAt: string;
  students: Pupil[]; taught: number; attendance: { present: number; slots: number };
  next: NextSession | null; unconfirmed: number;
};
type GroupDetail = Omit<GroupSummary, "students"> & {
  students: (Pupil & { recent: string[]; attended: number; total: number; gaps: string[]; strengths: string[] })[];
  gaps: { text: string; names: string[]; count: number }[];
  sessions: {
    id: string; title: string; date: string; time: string; duration: number; status: string;
    invited: number; present: number; absentNames: string[]; attendanceConfirmed: boolean;
  }[];
};
export type AttendanceRow = {
  studentId: string; name: string; initials: string; color: string;
  joinedAt: string | null; leftAt: string | null; minutes: number;
  late: boolean; lateMinutes: number; short: boolean; autoPresent: boolean; present: boolean; excused: boolean;
};
type Attendance = {
  sessionId: string; title: string; groupName: string | null; date: string; time: string;
  status: string; confirmedAt: string | null; rows: AttendanceRow[];
};

/* ---------- tiện ích ---------- */
const HUES: Record<string, number> = { violet: 262, sky: 200, emerald: 160, amber: 38, rose: 345, indigo: 235, teal: 175, blue: 215, green: 145, orange: 25, pink: 330 };
const hueOf = (key: string) => HUES[key] ?? [...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Không thể hoàn thành yêu cầu.");
const WD = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${WD[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "");
const pct = (a: { present: number; slots: number }) => (a.slots ? Math.round((a.present / a.slots) * 100) : null);
const shortCode = (name: string) => name.replace(/[·\-–]/g, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "L";

function Av({ p, size = 28 }: { p: { initials: string; color: string; name?: string }; size?: number }) {
  return <span className="cls-av" style={{ width: size, height: size, fontSize: size < 26 ? 9 : 11, ["--h" as string]: hueOf(p.color || p.initials) }} title={p.name}>{p.initials}</span>;
}
function Stack({ people, max = 5 }: { people: Pupil[]; max?: number }) {
  return <span className="cls-stack">{people.slice(0, max).map((p) => <Av key={p.id} p={p} size={24} />)}{people.length > max && <span className="cls-av cls-av--more">+{people.length - max}</span>}</span>;
}
function Dots({ marks }: { marks: string[] }) {
  const label: Record<string, string> = { o: "Có mặt", l: "Muộn", e: "Vắng có phép", a: "Vắng không phép" };
  return <span className="cls-dots">{marks.map((m, i) => <i key={i} className={`m-${m}`} title={label[m]} />)}</span>;
}
function Modal({ title, sub, onClose, children, footer, wide }: { title: string; sub?: string; onClose: () => void; children: ReactNode; footer: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="cls-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`cls-modal${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="cls-modal__h"><div className="cls-min"><h2>{title}</h2>{sub && <p className="cls-muted cls-one">{sub}</p>}</div><button type="button" className="cls-ib" aria-label="Đóng" onClick={onClose}><X size={18} /></button></div>
      <div className="cls-modal__b">{children}</div>
      <div className="cls-modal__f">{footer}</div>
    </div>
  </div>;
}
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/* ---------- Tạo lớp ---------- */
export function CreateClass({ students, onClose, onCreated }: { students: Pupil[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("Toán");
  const [grade, setGrade] = useState("Lớp 9");
  const [picked, setPicked] = useState<string[]>([]);
  const [fresh, setFresh] = useState<string[]>([]);
  const [typing, setTyping] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const active = students.filter((s) => s.status !== "archived");
  const q = typing.trim().toLocaleLowerCase("vi-VN");
  const matches = q ? active.filter((s) => !picked.includes(s.id) && s.name.toLocaleLowerCase("vi-VN").includes(q)).slice(0, 5) : active.filter((s) => !picked.includes(s.id)).slice(0, 5);
  const addNew = () => {
    const n = typing.trim();
    if (!n) return;
    const same = active.find((s) => s.name.toLocaleLowerCase("vi-VN") === n.toLocaleLowerCase("vi-VN") && !picked.includes(s.id));
    if (same) setPicked((p) => [...p, same.id]);
    else if (!fresh.includes(n)) setFresh((f) => [...f, n]);
    setTyping("");
  };
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const r = await api<{ group: { id: string } }>("/groups", { method: "POST", body: JSON.stringify({ name: name.trim(), subject: subject.trim(), grade: grade.trim(), studentIds: picked, newStudents: fresh }) });
      onCreated(r.group.id);
    } catch (e) { setError(errText(e)); setBusy(false); }
  };
  const total = picked.length + fresh.length;
  return <Modal title="Tạo lớp" onClose={onClose} footer={<>
    <span className="cls-muted cls-one cls-grow">{total ? `${total} học sinh` : "Thêm học sinh sau cũng được"}</span>
    <button type="button" className="cls-btn cls-btn--sec" onClick={onClose}>Huỷ</button>
    <button type="button" className="cls-btn cls-btn--pri" disabled={busy || !name.trim() || !subject.trim() || !grade.trim()} onClick={() => void submit()}>{busy ? "Đang tạo…" : "Tạo lớp"}</button>
  </>}>
    <label className="cls-field">Tên lớp<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Tiếng Anh 9 · Nhóm chiều" autoFocus /></label>
    <div className="cls-g2">
      <label className="cls-field">Môn<input value={subject} onChange={(e) => setSubject(e.target.value)} list="cls-subjects" /></label>
      <label className="cls-field">Khối<input value={grade} onChange={(e) => setGrade(e.target.value)} list="cls-grades" /></label>
    </div>
    <datalist id="cls-subjects">{["Toán", "Tiếng Anh", "Ngữ văn", "Vật lý", "Hoá học", "IELTS"].map((s) => <option key={s} value={s} />)}</datalist>
    <datalist id="cls-grades">{Array.from({ length: 12 }, (_, i) => `Lớp ${i + 1}`).map((s) => <option key={s} value={s} />)}</datalist>
    <div className="cls-field">
      <span>Học sinh</span>
      <div className="cls-chips" onClick={() => input.current?.focus()}>
        {picked.map((id) => { const s = active.find((x) => x.id === id); return s && <span key={id} className="cls-chip"><Av p={s} size={22} />{s.name}<button type="button" aria-label={`Bỏ ${s.name}`} onClick={() => setPicked((p) => p.filter((x) => x !== id))}><X size={13} /></button></span>; })}
        {fresh.map((n) => <span key={n} className="cls-chip is-new"><span className="cls-plus"><Plus size={12} /></span>{n}<button type="button" aria-label={`Bỏ ${n}`} onClick={() => setFresh((f) => f.filter((x) => x !== n))}><X size={13} /></button></span>)}
        <input ref={input} value={typing} onChange={(e) => setTyping(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNew(); } }} placeholder={total ? "" : "Gõ tên rồi Enter, hoặc chọn em có sẵn"} aria-label="Thêm học sinh" />
      </div>
      {(q || matches.length > 0) && <div className="cls-sug">
        {q && <button type="button" className="cls-sug__row is-hl" onClick={addNew}><span className="cls-plus"><Plus size={13} /></span><span className="cls-one">Thêm học sinh mới <b>“{typing.trim()}”</b></span><span className="cls-k">Enter</span></button>}
        {matches.map((s) => <button type="button" key={s.id} className="cls-sug__row" onClick={() => { setPicked((p) => [...p, s.id]); setTyping(""); }}><Av p={s} size={22} /><b className="cls-one">{s.name}</b><span className="cls-k">đã có</span></button>)}
      </div>}
    </div>
    <p className="cls-info"><Link2 size={16} /><span className="cls-one">Mỗi em có một link riêng, dùng mãi cho mọi buổi của lớp</span></p>
    {error && <p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p>}
  </Modal>;
}

/* ---------- Điểm danh ---------- */
export function AttendanceDialog({ sessionId, mode, onClose, onSaved, onEnd }: {
  sessionId: string;
  mode: "end" | "edit";
  onClose: () => void;
  onSaved?: () => void;
  /** Chỉ dùng khi kết thúc buổi: kết thúc buổi rồi mới lưu điểm danh (rows = null nghĩa là để sau). */
  onEnd?: (rows: AttendanceRow[] | null) => Promise<void>;
}) {
  const [data, setData] = useState<Attendance | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void api<Attendance>(`/sessions/${sessionId}/attendance`).then((d) => { setData(d); setRows(d.rows); }).catch((e) => setError(errText(e)));
  }, [sessionId]);
  const present = rows.filter((r) => r.present).length;
  const flagged = useMemo(() => rows.filter((r) => r.present && (r.short || r.late)).length, [rows]);
  const set = (id: string, patch: Partial<AttendanceRow>) => setRows((rs) => rs.map((r) => (r.studentId === id ? { ...r, ...patch } : r)));
  const save = async () => {
    setBusy(true); setError("");
    try {
      if (onEnd) await onEnd(rows);
      else {
        await api(`/sessions/${sessionId}/attendance`, { method: "PUT", body: JSON.stringify({ rows: rows.map((r) => ({ studentId: r.studentId, present: r.present, excused: r.excused })) }) });
        onSaved?.();
      }
    } catch (e) { setError(errText(e)); setBusy(false); }
  };
  const later = async () => {
    if (!onEnd) return onClose();
    setBusy(true);
    try { await onEnd(null); } catch (e) { setError(errText(e)); setBusy(false); }
  };
  const sub = data ? [data.groupName && !data.title.includes(data.groupName) ? data.groupName : "", data.title, `${dayLabel(data.date)} · ${data.time}`].filter(Boolean).join(" · ") : "";
  return <Modal wide title={mode === "end" ? "Kết thúc buổi học" : "Điểm danh"} sub={sub} onClose={onClose} footer={<>
    <span className="cls-muted cls-one cls-grow">{mode === "end" ? "Để sau thì lưu là Chưa xác nhận" : data?.confirmedAt ? "Đã xác nhận, sửa rồi lưu lại được" : "Chưa xác nhận"}</span>
    <button type="button" className="cls-btn cls-btn--sec" disabled={busy} onClick={() => void later()}>{mode === "end" ? "Để sau" : "Huỷ"}</button>
    <button type="button" className="cls-btn cls-btn--pri" disabled={busy || !data} onClick={() => void save()}>{busy ? "Đang lưu…" : mode === "end" ? "Xác nhận và kết thúc" : "Lưu điểm danh"}</button>
  </>}>
    {!data && !error && <p className="cls-muted" role="status">Đang tải điểm danh…</p>}
    {data && <>
      <div className="cls-attsum">
        <span className="cls-ico cls-ico--acc"><Sparkles size={16} /></span>
        <div className="cls-min"><b className="cls-one">Đã điền sẵn theo giờ vào lớp</b><span className="cls-muted cls-one">{flagged ? "Xem lại dòng màu vàng, sai thì bấm để đổi" : "Sai chỗ nào thì bấm vào dòng để đổi"}</span></div>
        <span className="cls-cnt">Có mặt <b>{present}</b> · Vắng <b>{rows.length - present}</b></span>
      </div>
      <div className="cls-alist">
        {rows.map((r) => {
          const flag = r.present && (r.short || r.late);
          return <div key={r.studentId} className={`cls-arow${r.present ? (flag ? " is-flag" : "") : " is-off"}`}>
            <button type="button" className="cls-arow__main" aria-pressed={r.present} onClick={() => set(r.studentId, { present: !r.present })}>
              <span className={`cls-cbx${r.present ? " is-on" : ""}`}>{r.present && <Check size={12} strokeWidth={3} />}</span>
              <Av p={r} />
              <span className="cls-min"><b className="cls-one">{r.name}</b><span className="cls-muted cls-one">{r.joinedAt ? `Vào ${hhmm(r.joinedAt)} · ${r.short ? "chỉ " : ""}ở ${r.minutes} phút` : "Không vào lớp"}{!r.autoPresent && r.present ? " · gia sư đánh dấu có mặt" : ""}</span></span>
            </button>
            <span className="cls-rtags">
              {r.present && !flag && <span className="cls-tg is-ok">Có mặt</span>}
              {r.present && r.late && !r.short && <span className="cls-tg is-warn">Muộn {r.lateMinutes} phút</span>}
              {r.present && r.short && <span className="cls-tg is-warn"><AlertCircle size={12} />Xem lại</span>}
              {!r.present && <span className="cls-seg" role="group" aria-label={`Lý do vắng của ${r.name}`}>
                <button type="button" className={r.excused ? "is-on" : ""} aria-pressed={r.excused} onClick={() => set(r.studentId, { excused: true })}>Có phép</button>
                <button type="button" className={!r.excused ? "is-on" : ""} aria-pressed={!r.excused} onClick={() => set(r.studentId, { excused: false })}>Không phép</button>
              </span>}
            </span>
          </div>;
        })}
      </div>
    </>}
    {error && <p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p>}
  </Modal>;
}
