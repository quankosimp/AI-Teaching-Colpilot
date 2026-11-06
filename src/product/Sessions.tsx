import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, ClipboardCheck, PenLine, Plus, Video } from "lucide-react";
import { api } from "./onlineApi";
import "./classes.css";

/*
 * Buổi học: một chỗ cho mọi việc theo buổi. Mỗi thẻ chỉ hiện buổi cần đúng việc đó,
 * mỗi buổi chỉ có một nút chính là việc cần làm tiếp.
 */
type Pupil = { id: string; name: string; initials: string; color: string };
type SessionItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  status: string;
  groupId?: string | null;
  groupName?: string | null;
  Activity_sessionId_items: unknown[];
  RoomMember_sessionId_items: { studentId: string }[];
};
type Stat = { sessionId: string; submissions: number; pending: number; attendanceConfirmed: boolean };
type Tab = "upcoming" | "grading" | "summary" | "done";
export type SessionView = "teach" | "grading" | "summary";

const HUES: Record<string, number> = { violet: 262, sky: 200, emerald: 160, amber: 38, rose: 345, indigo: 235, teal: 175, blue: 215, green: 145, orange: 25, pink: 330 };
const hueOf = (key: string) => HUES[key] ?? [...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WD_LONG = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const key = (s: { date: string; time: string }) => `${s.date} ${s.time}`;
function dayShort(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : `${WD[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}
function groupLabel(date: string, today: string) {
  if (date === today) return "Hôm nay";
  const d = new Date(`${date}T00:00:00`), t = new Date(`${today}T00:00:00`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 1) return "Ngày mai";
  if (diff === -1) return "Hôm qua";
  if (diff > 1 && diff < 7) return WD_LONG[d.getDay()];
  if (diff >= 7 && diff < 14) return "Tuần sau";
  if (diff < 0 && diff > -7) return "Tuần này";
  return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function SessionsPage({ sessions, students, onOpen, onEdit, onCreate }: {
  sessions: SessionItem[];
  students: Pupil[];
  onOpen: (id: string, view: SessionView) => void;
  onEdit: (id: string) => void;
  onCreate: () => void;
}) {
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [tab, setTab] = useState<Tab>("upcoming");
  const [group, setGroup] = useState("all");
  useEffect(() => {
    let active = true;
    void api<{ stats: Stat[] }>("/session-stats")
      .then((r) => active && setStats(Object.fromEntries(r.stats.map((s) => [s.sessionId, s]))))
      .catch(() => undefined);
    return () => { active = false; };
  }, [sessions]);
  const today = todayISO();
  const groups = useMemo(() => {
    const m = new Map<string, string>();
    sessions.forEach((s) => s.groupId && m.set(s.groupId, s.groupName || "Lớp"));
    return [...m.entries()];
  }, [sessions]);
  const scoped = group === "all" ? sessions : group === "none" ? sessions.filter((s) => !s.groupId) : sessions.filter((s) => s.groupId === group);
  const done = (s: SessionItem) => s.status === "ended" || s.status === "reviewed";
  const lists: Record<Tab, SessionItem[]> = {
    upcoming: scoped.filter((s) => !done(s)).sort((a, b) => key(a).localeCompare(key(b))),
    grading: scoped.filter((s) => done(s) && (stats[s.id]?.pending ?? 0) > 0).sort((a, b) => key(b).localeCompare(key(a))),
    summary: scoped.filter((s) => s.status === "ended").sort((a, b) => key(b).localeCompare(key(a))),
    done: scoped.filter((s) => s.status === "reviewed").sort((a, b) => key(b).localeCompare(key(a))),
  };
  const tabs: { id: Tab; label: string; warn?: boolean }[] = [
    { id: "upcoming", label: "Sắp tới" },
    { id: "grading", label: "Cần chấm", warn: true },
    { id: "summary", label: "Cần tổng kết", warn: true },
    { id: "done", label: "Đã xong" },
  ];
  const list = lists[tab];
  const rows: ({ head: string } | { s: SessionItem })[] = [];
  let last = "";
  for (const s of list) {
    const h = groupLabel(s.date, today);
    if (h !== last) { rows.push({ head: h }); last = h; }
    rows.push({ s });
  }
  const people = (s: SessionItem) => s.RoomMember_sessionId_items.map((m) => students.find((p) => p.id === m.studentId)).filter((p): p is Pupil => !!p);
  const action = (s: SessionItem) => {
    if (tab === "grading") return <button type="button" className="cls-btn cls-btn--pri cls-btn--sm" onClick={() => onOpen(s.id, "grading")}><ClipboardCheck size={15} />Chấm bài</button>;
    if (tab === "summary") return <button type="button" className="cls-btn cls-btn--pri cls-btn--sm" onClick={() => onOpen(s.id, "summary")}>Tổng kết</button>;
    if (tab === "done") return <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => onOpen(s.id, "summary")}>Xem lại</button>;
    if (s.status === "live") return <button type="button" className="cls-btn cls-btn--pri cls-btn--sm" onClick={() => onOpen(s.id, "teach")}><Video size={15} />Vào lớp</button>;
    if (s.date <= today && s.Activity_sessionId_items.length) return <button type="button" className="cls-btn cls-btn--pri cls-btn--sm" onClick={() => onOpen(s.id, "teach")}><Video size={15} />Mở lớp</button>;
    return <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => onEdit(s.id)}><PenLine size={15} />Soạn tiếp</button>;
  };
  const status = (s: SessionItem) => {
    const st = stats[s.id];
    const acts = s.Activity_sessionId_items.length;
    if (tab === "grading") return <span className="cls-st is-warn cls-one">{st?.pending} bài chưa chấm</span>;
    if (tab === "summary") return <span className="cls-st is-warn cls-one">{st && !st.attendanceConfirmed ? "Chưa tổng kết, chưa điểm danh" : "Chưa tổng kết"}</span>;
    if (tab === "done") return <span className="cls-st is-ok cls-one">Đã tổng kết</span>;
    if (s.status === "live") return <span className="cls-st is-ok cls-one">Đang học</span>;
    if (!acts) return <span className="cls-st is-warn cls-one">Chưa có lộ trình</span>;
    return <span className="cls-st is-ok cls-one">Đã soạn {acts} hoạt động</span>;
  };
  const empty: Record<Tab, string> = {
    upcoming: "Chưa có buổi nào sắp tới. Tạo buổi mới, hoặc vào một lớp và bấm “Lên buổi tiếp theo”.",
    grading: "Không còn bài nào chờ chấm.",
    summary: "Không còn buổi nào chờ tổng kết.",
    done: "Chưa có buổi nào tổng kết xong.",
  };
  return <div className="cls">
    <div className="cls-ph">
      <div className="cls-min"><h1>Buổi học</h1><p className="cls-muted">Soạn, dạy, chấm và tổng kết từng buổi ở một chỗ</p></div>
      <span className="cls-grow" />
      {groups.length > 0 && <label className="cls-filter"><span className="cls-k">Lớp</span>
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="all">Tất cả</option>
          {groups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          <option value="none">Buổi lẻ</option>
        </select></label>}
      <button type="button" className="cls-btn cls-btn--pri" onClick={onCreate}><Plus size={16} />Tạo buổi học</button>
    </div>
    <div className="cls-tabs" role="tablist" aria-label="Lọc buổi học">
      {tabs.map((t) => {
        const n = lists[t.id].length;
        return <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "is-on" : ""} onClick={() => setTab(t.id)}>
          {t.label}<span className={`cls-c${t.warn && n ? " is-warn" : ""}`}>{n}</span>
        </button>;
      })}
    </div>
    {list.length === 0 ? <div className="cls-empty"><span className="cls-ico cls-ico--acc"><CalendarDays size={20} /></span><p className="cls-muted">{empty[tab]}</p></div> :
      <section className="cls-card cls-stable">
        <div className="cls-sth"><span>Thời gian</span><span>Buổi</span><span>Học sinh</span><span>Tình trạng</span><span /></div>
        {rows.map((r, i) => "head" in r ? <div key={`h${i}`} className="cls-sgh">{r.head}</div> : (() => {
          const s = r.s, ps = people(s);
          return <div key={s.id} className="cls-str">
            <div className={`cls-when${s.date === today ? " is-today" : ""}`}><b className="cls-one">{s.time}</b><span className="cls-muted cls-one">{dayShort(s.date)} · {s.duration} phút</span></div>
            <button type="button" className="cls-stitle" onClick={() => (tab === "upcoming" ? onEdit(s.id) : onOpen(s.id, tab === "grading" ? "grading" : "summary"))}><b className="cls-one">{s.title}</b><span className="cls-muted cls-one">{s.groupName || "Buổi lẻ, không thuộc lớp"}</span></button>
            <div className="cls-row"><span className="cls-stack">{ps.slice(0, 4).map((p) => <span key={p.id} className="cls-av" style={{ width: 24, height: 24, fontSize: 9, ["--h" as string]: hueOf(p.color || p.initials) }}>{p.initials}</span>)}</span><span className="cls-muted cls-one">{ps.map((p) => p.name.split(/\s+/).slice(-1)[0]).join(", ") || "Chưa có học sinh"}</span></div>
            <div className="cls-min">{status(s)}</div>
            <div className="cls-act">{action(s)}</div>
          </div>;
        })())}
      </section>}
    {tab === "upcoming" && lists.summary.length > 0 && <div className="cls-note">
      <span className="cls-ico cls-ico--warn"><AlertCircle size={16} /></span>
      <div className="cls-min"><b className="cls-one">{lists.summary.length} buổi chưa tổng kết</b><span className="cls-muted cls-one">Tổng kết xong thì phần Cần dạy lại của buổi sau mới đầy đủ.</span></div>
      <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => setTab("summary")}>Xem</button>
    </div>}
  </div>;
}
