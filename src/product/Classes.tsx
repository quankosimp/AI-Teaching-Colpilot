import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle, CalendarDays, Check, ChevronLeft, Clock, Copy, Link2, MoreHorizontal,
  Plus, RefreshCw, Sparkles, Trash2, UserPlus, X,
} from "lucide-react";
import { api, ApiError } from "./onlineApi";
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
  students: (Pupil & { recent: string[]; attended: number; total: number; gaps: string[] })[];
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
const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

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

/* ===================================================================== */
export function ClassesPage({ students, onOpenSession, onChanged }: {
  students: Pupil[];
  onOpenSession: (sessionId: string) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [openId, setOpenId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setGroups((await api<{ groups: GroupSummary[] }>("/groups")).groups); setError(""); }
    catch (e) { setError(errText(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (openId) return <ClassDetail id={openId} students={students} onBack={() => { setOpenId(""); void load(); }} onOpenSession={onOpenSession} onChanged={onChanged} />;
  return <div className="cls">
    <div className="cls-ph">
      <div className="cls-min"><h1>Lớp</h1><p className="cls-muted">Mỗi lớp là một nhóm học sinh cố định. Dạy kèm 1–1 là lớp có một em.</p></div>
      <span className="cls-grow" />
      <button type="button" className="cls-btn cls-btn--pri" onClick={() => setCreating(true)}><Plus size={16} />Tạo lớp</button>
    </div>
    {error && <p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p>}
    {!groups && !error && <p className="cls-muted" role="status">Đang tải danh sách lớp…</p>}
    {groups && groups.length === 0 && <div className="cls-empty">
      <span className="cls-ico cls-ico--acc"><UserPlus size={20} /></span>
      <b>Chưa có lớp nào</b>
      <p className="cls-muted">Tạo lớp để lên buổi nhanh, có link riêng cho từng em và tự điểm danh.</p>
      <button type="button" className="cls-btn cls-btn--pri" onClick={() => setCreating(true)}><Plus size={16} />Tạo lớp đầu tiên</button>
    </div>}
    {groups && groups.length > 0 && <div className="cls-grid">
      {groups.map((g) => {
        const rate = pct(g.attendance);
        return <section key={g.id} className="cls-card cls-cc">
          <button type="button" className="cls-cc__top" onClick={() => setOpenId(g.id)}>
            <span className="cls-cico" style={{ ["--h" as string]: hueOf(g.name) }}>{shortCode(g.name)}</span>
            <span className="cls-min"><b className="cls-one cls-cc__name">{g.name}</b><span className="cls-muted cls-one">{g.subject} · {g.grade}{g.students.length === 1 ? " · dạy kèm 1–1" : ""}</span></span>
          </button>
          <div className="cls-row"><Stack people={g.students} /><span className="cls-muted cls-one">{g.students.length} học sinh</span></div>
          {g.next
            ? <div className="cls-nx"><Clock size={15} /><span className="cls-one">{g.next.status === "live" ? "Đang học" : "Buổi tiếp theo"} <b>{dayLabel(g.next.date)} · {g.next.time}</b></span></div>
            : <div className="cls-nx is-warn"><AlertCircle size={15} /><span className="cls-one">Chưa có buổi tiếp theo</span></div>}
          <div className="cls-att">
            <span className="cls-k">Chuyên cần</span>
            <span className="cls-meter"><i style={{ width: `${rate ?? 0}%` }} /></span>
            <span className="cls-v">{rate === null ? "—" : `${rate}%`}</span>
            <span className="cls-muted">{g.attendance.slots ? `${g.attendance.present}/${g.attendance.slots} lượt` : "chưa có buổi"}</span>
          </div>
          <div className="cls-cc__ft">
            <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => setOpenId(g.id)}>Mở lớp</button>
            {g.unconfirmed > 0 && <span className="cls-st is-warn cls-one">{g.unconfirmed} buổi chưa xác nhận</span>}
          </div>
        </section>;
      })}
    </div>}
    {creating && <CreateClass students={students} onClose={() => setCreating(false)} onCreated={async (id) => { setCreating(false); await onChanged(); await load(); setOpenId(id); }} />}
  </div>;
}

/* ---------- Tạo lớp ---------- */
function CreateClass({ students, onClose, onCreated }: { students: Pupil[]; onClose: () => void; onCreated: (id: string) => void }) {
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

/* ---------- Trang một lớp ---------- */
function ClassDetail({ id, students, onBack, onOpenSession, onChanged }: { id: string; students: Pupil[]; onBack: () => void; onOpenSession: (id: string) => void; onChanged: () => Promise<void> | void }) {
  const [g, setG] = useState<GroupDetail | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [nextOpen, setNextOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [attFor, setAttFor] = useState("");
  const [menu, setMenu] = useState("");
  const load = useCallback(async () => {
    try { setG((await api<{ group: GroupDetail }>(`/groups/${id}`)).group); setError(""); }
    catch (e) { setError(errText(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu("");
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);
  const copyLink = async (sid: string, name: string) => {
    try {
      const r = await api<{ url: string }>(`/students/${sid}/link`);
      setToast((await copyText(r.url)) ? `Đã chép link của ${name}` : r.url);
    } catch (e) { setToast(errText(e)); }
  };
  const rotate = async (sid: string, name: string) => {
    if (!confirm(`Đổi link của ${name}? Link cũ sẽ không vào được nữa.`)) return;
    try { const r = await api<{ url: string }>(`/students/${sid}/link/rotate`, { method: "POST", body: "{}" }); setToast((await copyText(r.url)) ? `Đã đổi và chép link mới của ${name}` : r.url); }
    catch (e) { setToast(errText(e)); }
  };
  const remove = async (sid: string, name: string) => {
    if (!confirm(`Bỏ ${name} khỏi lớp? Hồ sơ và các buổi cũ của em vẫn giữ.`)) return;
    try { setG((await api<{ group: GroupDetail }>(`/groups/${id}/members/${sid}`, { method: "DELETE" })).group); }
    catch (e) { setToast(errText(e)); }
  };
  if (error) return <div className="cls"><button type="button" className="cls-btn cls-btn--sec" onClick={onBack}><ChevronLeft size={16} />Danh sách lớp</button><p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p></div>;
  if (!g) return <div className="cls"><p className="cls-muted" role="status">Đang tải lớp…</p></div>;
  const rate = pct(g.attendance);
  const upcoming = g.sessions.filter((s) => s.status !== "ended" && s.status !== "reviewed").slice(-1)[0];
  const last = g.sessions[0];
  return <div className="cls">
    <div className="cls-chead">
      <button type="button" className="cls-ib" aria-label="Về danh sách lớp" onClick={onBack}><ChevronLeft size={18} /></button>
      <span className="cls-cico is-lg" style={{ ["--h" as string]: hueOf(g.name) }}>{shortCode(g.name)}</span>
      <div className="cls-min"><h1 className="cls-one">{g.name}</h1><p className="cls-muted cls-one">{g.subject} · {g.grade} · {g.students.length} học sinh</p></div>
      <span className="cls-grow" />
      <button type="button" className="cls-btn cls-btn--sec" onClick={() => setAddOpen(true)}><UserPlus size={16} />Thêm học sinh</button>
      <button type="button" className="cls-btn cls-btn--pri" disabled={!g.students.length} onClick={() => setNextOpen(true)}><CalendarDays size={16} />Lên buổi tiếp theo</button>
    </div>
    <div className="cls-kpis">
      <section className="cls-card cls-kpi"><span className="cls-k">Đã dạy</span><b>{g.taught}<small>buổi</small></b><span className="cls-muted cls-one">{last && (last.status === "ended" || last.status === "reviewed") ? `Gần nhất ${dayLabel(last.date)}` : "Chưa có buổi nào xong"}</span></section>
      <section className="cls-card cls-kpi"><span className="cls-k">Chuyên cần</span><b>{rate === null ? "—" : `${rate}%`}</b><span className="cls-muted cls-one">{g.attendance.slots ? `${g.attendance.present}/${g.attendance.slots} lượt có mặt` : "Tính sau buổi đầu tiên"}</span></section>
      <section className={`cls-card cls-kpi${g.gaps.length ? " is-warn" : ""}`}><span className="cls-k">Cần dạy lại</span><b>{g.gaps.filter((x) => x.count > 1).length || g.gaps.length}<small>{g.gaps.some((x) => x.count > 1) ? "điểm chung" : "điểm"}</small></b><span className="cls-muted cls-one">Từ hồ sơ của từng em</span></section>
    </div>
    <div className="cls-cd">
      <div className="cls-col">
        <section className="cls-card">
          <div className="cls-sh"><h3>Học sinh</h3><span className="cls-count">{g.students.length} em</span></div>
          {g.students.length === 0 && <p className="cls-pad cls-muted">Lớp chưa có học sinh. Bấm “Thêm học sinh” ở góc trên.</p>}
          {g.students.length > 0 && <div className="cls-tbl">
            <div className="cls-th"><span>Học sinh</span><span>Các buổi gần nhất</span><span>Tình hình</span><span /></div>
            {g.students.map((s) => <div key={s.id} className="cls-tr">
              <div className="cls-nm"><Av p={s} /><div className="cls-min"><b className="cls-one">{s.name}</b><span className="cls-muted cls-one">{s.total ? `Đã học ${s.attended}/${s.total} buổi` : "Chưa có buổi nào"}</span></div></div>
              <div className="cls-dcell">{s.total ? <><Dots marks={s.recent} /><b>{s.attended}/{s.total}</b></> : <span className="cls-muted">—</span>}</div>
              <span className={`cls-st cls-one ${s.gaps.length ? "is-warn" : "is-ok"}`}>{s.gaps[0] || "Ổn định"}</span>
              <div className="cls-lk">
                <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => void copyLink(s.id, s.name)}><Copy size={14} /><span className="cls-lbl">Chép link</span></button>
                <span className="cls-menuwrap">
                  <button type="button" className="cls-ib" aria-label={`Thêm thao tác cho ${s.name}`} onClick={(e) => { e.stopPropagation(); setMenu(menu === s.id ? "" : s.id); }}><MoreHorizontal size={16} /></button>
                  {menu === s.id && <span className="cls-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => void rotate(s.id, s.name)}><RefreshCw size={15} />Đổi link</button>
                    <button type="button" role="menuitem" className="is-danger" onClick={() => void remove(s.id, s.name)}><Trash2 size={15} />Bỏ khỏi lớp</button>
                  </span>}
                </span>
              </div>
            </div>)}
            <div className="cls-legend"><span><Dots marks={["o"]} />Có mặt</span><span><Dots marks={["l"]} />Muộn</span><span><Dots marks={["e"]} />Vắng có phép</span><span><Dots marks={["a"]} />Vắng không phép</span></div>
          </div>}
        </section>
        <section className="cls-card">
          <div className="cls-sh"><h3>Buổi học</h3><span className="cls-count">{g.taught} đã dạy{upcoming ? " · có buổi sắp tới" : ""}</span></div>
          {g.sessions.length === 0 && <p className="cls-pad cls-muted">Chưa có buổi nào. Bấm “Lên buổi tiếp theo” để tạo.</p>}
          {g.sessions.slice(0, 8).map((s) => {
            const done = s.status === "ended" || s.status === "reviewed";
            return <div key={s.id} className="cls-srow">
              <div className="cls-min"><b className="cls-one">{dayLabel(s.date)}</b><span className="cls-muted cls-one">{s.time} · {s.status === "live" ? "đang học" : done ? "đã dạy" : "sắp tới"}</span></div>
              <div className="cls-min"><b className="cls-one">{s.title}</b><span className="cls-muted cls-one">{done ? (s.absentNames.length ? `${s.present}/${s.invited} · ${s.absentNames.join(", ")} vắng` : `${s.present}/${s.invited} có mặt`) : `${s.invited} em được mời`}</span></div>
              <div className="cls-act">
                {!done && <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => onOpenSession(s.id)}>{s.status === "live" ? "Vào lớp" : "Soạn tiếp"}</button>}
                {done && !s.attendanceConfirmed && <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => setAttFor(s.id)}>Xác nhận điểm danh</button>}
                {done && s.attendanceConfirmed && <button type="button" className="cls-st is-ok cls-linkish" onClick={() => setAttFor(s.id)}>Đã điểm danh</button>}
              </div>
            </div>;
          })}
        </section>
      </div>
      <div className="cls-col">
        {upcoming && <section className="cls-card cls-nxcard">
          <span className="cls-lbl2"><Clock size={15} />{dayLabel(upcoming.date)} · {upcoming.time} · {upcoming.duration} phút</span>
          <b className="cls-one">{upcoming.title}</b>
          <div className="cls-row"><button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => onOpenSession(upcoming.id)}>{upcoming.status === "live" ? "Vào lớp" : "Soạn tiếp"}</button></div>
        </section>}
        <section className="cls-card">
          <div className="cls-sh"><h3>Tình hình học tập</h3><span className="cls-count">cả lớp</span></div>
          {g.gaps.length === 0 && <p className="cls-pad cls-muted">Chưa có điểm cần dạy lại. Điểm yếu trong hồ sơ của từng em sẽ được gom ở đây.</p>}
          {g.gaps.map((x) => <div key={x.text} className="cls-gap">
            <div className="cls-gap__h"><b className="cls-one">{x.text}</b><span>{x.count}/{g.students.length} em</span></div>
            <span className="cls-meter is-warn"><i style={{ width: `${Math.round((x.count / Math.max(1, g.students.length)) * 100)}%` }} /></span>
            <span className="cls-muted cls-one">{x.names.join(", ")}</span>
          </div>)}
          <p className="cls-hint cls-one">Lấy từ mục “Cần cải thiện” trong hồ sơ học sinh</p>
        </section>
      </div>
    </div>
    {nextOpen && <NextSessionModal group={g} onClose={() => setNextOpen(false)} onCreated={async (sid) => { setNextOpen(false); await onChanged(); onOpenSession(sid); }} />}
    {addOpen && <AddMembers group={g} students={students} onClose={() => setAddOpen(false)} onDone={async (next) => { setAddOpen(false); setG(next); await onChanged(); }} />}
    {attFor && <AttendanceDialog sessionId={attFor} mode="edit" onClose={() => setAttFor("")} onSaved={() => { setAttFor(""); void load(); setToast("Đã lưu điểm danh"); }} />}
    {toast && <div className="cls-toast" role="status">{toast}</div>}
  </div>;
}

/* ---------- Thêm học sinh vào lớp ---------- */
function AddMembers({ group, students, onClose, onDone }: { group: GroupDetail; students: Pupil[]; onClose: () => void; onDone: (g: GroupDetail) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [names, setNames] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = students.filter((s) => s.status !== "archived" && !group.students.some((m) => m.id === s.id));
  const fresh = names.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
  const submit = async () => {
    setBusy(true); setError("");
    try { onDone((await api<{ group: GroupDetail }>(`/groups/${group.id}/members`, { method: "POST", body: JSON.stringify({ studentIds: picked, newStudents: fresh }) })).group); }
    catch (e) { setError(errText(e)); setBusy(false); }
  };
  return <Modal title="Thêm học sinh" sub={group.name} onClose={onClose} footer={<>
    <button type="button" className="cls-btn cls-btn--sec" onClick={onClose}>Huỷ</button>
    <button type="button" className="cls-btn cls-btn--pri" disabled={busy || (!picked.length && !fresh.length)} onClick={() => void submit()}>{busy ? "Đang thêm…" : `Thêm ${picked.length + fresh.length || ""} em`}</button>
  </>}>
    {options.length > 0 && <div className="cls-field"><span>Em đã có</span><div className="cls-pick">{options.map((s) => {
      const on = picked.includes(s.id);
      return <button type="button" key={s.id} className={`cls-prow${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => setPicked((p) => on ? p.filter((x) => x !== s.id) : [...p, s.id])}><span className="cls-cbx">{on && <Check size={12} strokeWidth={3} />}</span><Av p={s} /><b className="cls-one">{s.name}</b></button>;
    })}</div></div>}
    <label className="cls-field">Học sinh mới<textarea rows={3} value={names} onChange={(e) => setNames(e.target.value)} placeholder="Mỗi dòng một tên" /></label>
    {error && <p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p>}
  </Modal>;
}

/* ---------- Lên buổi tiếp theo ---------- */
function NextSessionModal({ group, onClose, onCreated }: { group: GroupDetail; onClose: () => void; onCreated: (id: string) => void }) {
  const last = group.sessions[0];
  const guessDate = () => {
    if (!last) return todayISO();
    const d = new Date(`${last.date}T00:00:00`);
    const today = new Date(`${todayISO()}T00:00:00`);
    while (d <= today) d.setDate(d.getDate() + 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [date, setDate] = useState(guessDate);
  const [time, setTime] = useState(last?.time || "19:30");
  const [duration, setDuration] = useState(last?.duration || 90);
  const [picked, setPicked] = useState(() => group.students.slice(0, 5).map((s) => s.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const r = await api<{ session: { id: string } }>(`/groups/${group.id}/sessions`, { method: "POST", body: JSON.stringify({ date, time, duration: Number(duration), studentIds: picked }) });
      onCreated(r.session.id);
    } catch (e) { setError(errText(e)); setBusy(false); }
  };
  return <Modal title="Lên buổi tiếp theo" onClose={onClose} footer={<>
    <span className="cls-muted cls-one cls-grow">Nội dung soạn sau cũng được</span>
    <button type="button" className="cls-btn cls-btn--sec" onClick={onClose}>Huỷ</button>
    <button type="button" className="cls-btn cls-btn--pri" disabled={busy || !picked.length || !date || !time} onClick={() => void submit()}>{busy ? "Đang tạo…" : "Tạo buổi"}</button>
  </>}>
    <div className="cls-fixed"><span className="cls-cico is-sm" style={{ ["--h" as string]: hueOf(group.name) }}>{shortCode(group.name)}</span><b className="cls-one">{group.name}</b><span className="cls-grow" /><span className="cls-muted">Buổi {group.sessions.length + 1}</span></div>
    <div>
      <div className="cls-g3">
        <label className="cls-field">Ngày<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="cls-field">Giờ<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        <label className="cls-field">Thời lượng<select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>{[45, 60, 75, 90, 120].map((m) => <option key={m} value={m}>{m} phút</option>)}</select></label>
      </div>
      {last && <p className="cls-hintline"><Sparkles size={14} /><span className="cls-one">Điền sẵn theo giờ quen của lớp</span></p>}
    </div>
    <div className="cls-field"><span>Học sinh{group.students.length > 5 ? " (tối đa 5 em một buổi)" : ""}</span><div className="cls-pick">{group.students.map((s) => {
      const on = picked.includes(s.id);
      return <button type="button" key={s.id} className={`cls-prow${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => setPicked((p) => on ? p.filter((x) => x !== s.id) : p.length < 5 ? [...p, s.id] : p)}><span className="cls-cbx">{on && <Check size={12} strokeWidth={3} />}</span><Av p={s} /><b className="cls-one">{s.name}</b>{!on && <span className="cls-muted cls-ml">nghỉ buổi này</span>}</button>;
    })}</div></div>
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
