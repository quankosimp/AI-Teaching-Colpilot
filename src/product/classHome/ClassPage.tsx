import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarDays, Check, ChevronLeft, Copy, Link2, Plus, Video } from "lucide-react";
import { api } from "../onlineApi";
import { AttendanceDialog } from "../Classes";
import { Av, CIco, Stack, copyText, dayLabel, errText, shortDate, weekdayNames } from "./ui";
import { InviteLinks } from "./InviteLinks";
import { ScheduleDialog } from "./ScheduleDialog";
import { StudentDrawer } from "./StudentDrawer";
import { ClassMaterials } from "./ClassMaterials";
import { useOpenClass } from "./useOpenClass";
import type { ClassDetail, ClassSessionRow, Pupil } from "./types";
import "../classes.css";
import "./classes-v2.css";

type Tab = "students" | "log" | "materials";
const minutes = (a: string | null, b: string | null) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000)) : 0);
const lastName = (n: string) => n.trim().split(/\s+/).slice(-1)[0];

export function ClassPage({ id, students, onBack, onEnterRoom, onOpenRoomView, onOpenAfter, onPrepare, onChanged }: {
  id: string;
  students: Pupil[];
  onBack: () => void;
  onEnterRoom: (sessionId: string) => void;
  onOpenRoomView: (sessionId: string, view: "grading" | "summary") => void;
  onOpenAfter: (sessionId: string) => void;
  onPrepare: (sessionId: string) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [g, setG] = useState<ClassDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("students");
  const [drawer, setDrawer] = useState("");
  const [invite, setInvite] = useState(false);
  const [sched, setSched] = useState(false);
  const [attFor, setAttFor] = useState("");
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState("");
  const [preparing, setPreparing] = useState(false);
  const opener = useOpenClass(onEnterRoom);
  const load = useCallback(async () => {
    try { setG((await api<{ group: ClassDetail }>(`/groups/${id}`)).group); setError(""); }
    catch (e) { setError(errText(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (error && !g) return <div className="cls"><button type="button" className="cls-btn cls-btn--sec" onClick={onBack}><ChevronLeft size={16} />Danh sách lớp</button><p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p></div>;
  if (!g) return <div className="cls"><p className="cls-muted" role="status">Đang tải lớp…</p></div>;
  const open = drawer ? g.students.find((s) => s.id === drawer) : undefined;
  const past = g.sessions.filter((s) => s.status !== "draft" && s.status !== "scheduled");
  const waiting = past.filter((s) => (s.status === "ended" || s.status === "reviewed") && (!s.attendanceConfirmed || s.pendingSubmissions > 0 || s.status === "ended")).length;
  const copyLink = async (sid: string) => {
    try { const r = await api<{ url: string }>(`/students/${sid}/link`); if (await copyText(r.url)) { setCopied(sid); setTimeout(() => setCopied(""), 2000); } else setError(r.url); }
    catch (e) { setError(errText(e)); }
  };
  const remove = async (sid: string) => {
    const name = g.students.find((s) => s.id === sid)?.name ?? "em này";
    if (!confirm(`Bỏ ${name} khỏi lớp? Hồ sơ và các buổi cũ của em vẫn giữ.`)) return;
    try { setG((await api<{ group: ClassDetail }>(`/groups/${g.id}/members/${sid}`, { method: "DELETE" })).group); setDrawer(""); await onChanged(); }
    catch (e) { setError(errText(e)); }
  };
  const prepare = async () => {
    setPreparing(true); setError("");
    try { const r = await api<{ sessionId: string }>(`/groups/${g.id}/prepare`, { method: "POST", body: "{}" }); onPrepare(r.sessionId); }
    catch (e) { setError(errText(e)); setPreparing(false); }
  };
  const row = (s: ClassSessionRow) => {
    const done = s.status === "ended" || s.status === "reviewed";
    const action = s.status === "live"
      ? <button type="button" className="cls-btn cls-btn--go cls-btn--sm" onClick={() => onEnterRoom(s.id)}><Video size={14} />Vào lại</button>
      : !done ? null
      : s.status === "ended" ? <button type="button" className="cls-btn cls-btn--warnb cls-btn--sm" onClick={() => onOpenAfter(s.id)}>Xác nhận ghi nhớ</button>
      : s.pendingSubmissions > 0 ? <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => onOpenRoomView(s.id, "grading")}>Nhận xét {s.pendingSubmissions} bài</button>
      : <button type="button" className="cls-st is-ok cls-linkish" onClick={() => onOpenAfter(s.id)}>Xong · xem lại</button>;
    return <div key={s.id} className="cls-lrow">
      <div className="when cls-min"><b className="cls-one">{dayLabel(s.date)}</b><span className="cls-muted cls-one">{s.time}{s.startedAt && s.endedAt ? ` · ${minutes(s.startedAt, s.endedAt)} phút` : s.status === "live" ? " · đang học" : ""}</span></div>
      <div className="what cls-min"><b className="cls-one">{s.title}</b><div className="cls-chips2">{s.used.map((u) => <span key={u} className="cls-chip2">{u}</span>)}</div></div>
      <span className="cls-muted cls-one">{done ? (s.absentNames.length > 2 ? `${s.present}/${s.invited} · ${s.absentNames.length} em vắng` : s.absentNames.length ? `${s.present}/${s.invited} · ${s.absentNames.map(lastName).join(", ")} vắng` : `${s.present}/${s.invited} có mặt`) : `${s.invited} em`}</span>
      <div className="act">{action}</div>
    </div>;
  };
  return <div className="cls">
    <div className="cls-chead">
      <button type="button" className="cls-ib" aria-label="Về danh sách lớp" onClick={onBack}><ChevronLeft size={18} /></button>
      <CIco name={g.name} size="lg" />
      <div className="cls-min"><h1 className="cls-one">{g.name}</h1><div className="cls-row"><Stack people={g.students} /><span className="cls-muted cls-one">{g.subject} · {g.grade} · {g.students.length} em</span></div></div>
      <span className="cls-grow" />
      <button type="button" className="cls-btn cls-btn--sec" disabled={!g.students.length} onClick={() => setInvite(true)}><Link2 size={16} />Link mời</button>
      {g.live
        ? <button type="button" className="cls-btn cls-btn--go cls-btn--lg" onClick={() => onEnterRoom(g.live!.sessionId)}><Video size={17} />Vào lại</button>
        : <button type="button" className="cls-btn cls-btn--pri cls-btn--lg" disabled={!g.students.length || !!opener.busy} title={g.students.length ? undefined : "Thêm học sinh trước"} onClick={() => void opener.open(g.id)}><Video size={17} />{opener.busy ? "Đang mở…" : "Mở lớp"}</button>}
    </div>
    {(opener.error || error) && <p className="cls-alert" role="alert" style={{ overflowWrap: "anywhere" }}><AlertCircle size={16} />{opener.error || error}</p>}
    <div className="cls-sched"><CalendarDays size={16} />
      <span className="cls-one">{g.schedule ? <>Lịch: <b>{g.schedule.days.map((d) => weekdayNames[d]).join(", ")} hằng tuần, {g.schedule.time}</b>{g.nextAt ? ` · buổi tới ${dayLabel(g.nextAt.date)}` : ""}</> : "Chưa đặt lịch · mở lớp lúc nào cũng được"}</span>
      <span className="cls-grow" /><button type="button" className="cls-btn cls-btn--txt cls-btn--sm" onClick={() => setSched(true)}>{g.schedule ? "Sửa lịch" : "Đặt lịch"}</button>
    </div>
    <div className="cls-tabs2" role="tablist">
      <button type="button" role="tab" aria-selected={tab === "students"} className={tab === "students" ? "is-on" : ""} onClick={() => setTab("students")}>Các em <span className="cls-c">{g.students.length}</span></button>
      <button type="button" role="tab" aria-selected={tab === "log"} className={tab === "log" ? "is-on" : ""} onClick={() => setTab("log")}>Nhật ký buổi <span className={`cls-c${waiting ? " is-warn" : ""}`}>{waiting ? `${waiting} còn việc` : past.length}</span></button>
      <button type="button" role="tab" aria-selected={tab === "materials"} className={tab === "materials" ? "is-on" : ""} onClick={() => setTab("materials")}>Tài liệu</button>
    </div>
    {tab === "students" && <section className="cls-card cls-etbl">
      {g.students.length === 0 && <p className="cls-pad cls-muted">Lớp chưa có học sinh.</p>}
      {g.students.length > 0 && <div className="cls-tbl">
        <div className="cls-th"><span>Học sinh</span><span>Đi học</span><span>Cần nhớ</span><span /></div>
        {g.students.map((s) => <div key={s.id} className={`cls-tr${drawer === s.id ? " is-sel" : ""}`}>
          <div className="cls-nm"><Av p={s} /><div className="cls-min"><button type="button" className="cls-namebtn cls-one" title={`Mở hồ sơ ${s.name}`} onClick={() => setDrawer(s.id)}>{s.name}</button></div></div>
          <div className="cls-min"><b style={{ font: "600 13px Inter, sans-serif" }}>{s.total ? `${s.attended}/${s.total}` : "—"}</b><span className="cls-muted cls-one" style={{ display: "block" }}>{s.total ? "buổi đã học" : "chưa có buổi"}</span></div>
          <div className="cls-min">{s.notes.length ? s.notes.slice(0, 2).map((n) => <div key={n.id} className="cls-mitem"><span className={`cls-tagnote${n.kind ? ` is-${n.kind}` : ""}`}>{n.kind === "review" ? "Ôn lại" : n.kind === "good" ? "Làm tốt" : "Ghi nhận"}</span><span className="cls-one">{n.text}</span><span className="from">{shortDate(n.date)}</span></div>) : <span className="cls-muted">Chưa có điều cần nhớ</span>}</div>
          <div className="cls-lk"><button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => void copyLink(s.id)}>{copied === s.id ? <Check size={14} /> : <Copy size={14} />}<span className="cls-lbl">{copied === s.id ? "Đã chép" : "Chép link"}</span></button></div>
        </div>)}
      </div>}
      <button type="button" className="cls-addrow" onClick={() => setAdding(true)}><Plus size={15} />Thêm học sinh</button>
    </section>}
    {tab === "log" && <section className="cls-card cls-log">
      {g.nextAt && !g.live && <div className="cls-lrow is-next">
        <div className="when cls-min"><b className="cls-one">{dayLabel(g.nextAt.date)}</b><span className="cls-muted cls-one">{g.nextAt.time} · sắp tới</span></div>
        <div className="what cls-min"><b className="cls-one">Buổi tới</b><span className="cls-muted cls-one">Bấm Mở lớp khi tới giờ, sớm hơn cũng được</span></div>
        <span className="cls-muted cls-one">{g.students.length} em</span><div className="act" />
      </div>}
      {past.length === 0 && !g.nextAt && <p className="cls-pad cls-muted">Chưa có buổi nào. Mỗi lần bấm Mở lớp là một dòng mới ở đây.</p>}
      {past.map(row)}
    </section>}
    {tab === "materials" && <ClassMaterials groupId={g.id} groupName={g.name} preparing={preparing} onPrepare={() => void prepare()} />}
    {open && <StudentDrawer student={open} groupName={g.name} onClose={() => setDrawer("")} onRemove={() => void remove(open.id)} onChanged={() => void load()} />}
    {invite && <InviteLinks title={g.name} students={g.students} onClose={() => setInvite(false)} />}
    {sched && <ScheduleDialog groupId={g.id} groupName={g.name} schedule={g.schedule} onClose={() => setSched(false)} onSaved={() => { setSched(false); void load(); }} />}
    {attFor && <AttendanceDialog sessionId={attFor} mode="edit" onClose={() => setAttFor("")} onSaved={() => { setAttFor(""); void load(); }} />}
    {adding && <AddStudents groupId={g.id} existing={g.students.map((s) => s.id)} students={students} onClose={() => setAdding(false)} onDone={async () => { setAdding(false); await load(); await onChanged(); }} />}
  </div>;
}

/** Thêm em có sẵn hoặc gõ tên em mới (mỗi dòng một tên). */
function AddStudents({ groupId, existing, students, onClose, onDone }: { groupId: string; existing: string[]; students: Pupil[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [names, setNames] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = students.filter((s) => s.status !== "archived" && !existing.includes(s.id));
  const fresh = names.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
  const submit = async () => {
    setBusy(true); setError("");
    try { await api(`/groups/${groupId}/members`, { method: "POST", body: JSON.stringify({ studentIds: picked, newStudents: fresh }) }); await onDone(); }
    catch (e) { setError(errText(e)); setBusy(false); }
  };
  return <div className="cls-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="cls-modal" role="dialog" aria-modal="true" aria-label="Thêm học sinh">
      <div className="cls-modal__h"><div className="cls-min"><h2>Thêm học sinh</h2></div></div>
      <div className="cls-modal__b">
        {options.length > 0 && <div className="cls-field"><span>Em đã có</span><div className="cls-pick">{options.map((s) => {
          const on = picked.includes(s.id);
          return <button type="button" key={s.id} className={`cls-prow${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}><span className="cls-cbx">{on && <Check size={12} strokeWidth={3} />}</span><Av p={s} /><b className="cls-one">{s.name}</b></button>;
        })}</div></div>}
        <label className="cls-field">Học sinh mới<textarea rows={3} value={names} onChange={(e) => setNames(e.target.value)} placeholder="Mỗi dòng một tên" /></label>
        {error && <p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p>}
      </div>
      <div className="cls-modal__f"><button type="button" className="cls-btn cls-btn--sec" onClick={onClose}>Huỷ</button><button type="button" className="cls-btn cls-btn--pri" disabled={busy || (!picked.length && !fresh.length)} onClick={() => void submit()}>{busy ? "Đang thêm…" : "Thêm"}</button></div>
    </div>
  </div>;
}
