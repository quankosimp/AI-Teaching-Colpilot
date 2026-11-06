import { useRef, useState } from "react";
import { AlertCircle, CalendarDays, Link2, Plus, UserPlus, Video } from "lucide-react";
import { CIco, Stack, shortDate, weekdayNames } from "./ui";
import { InviteLinks } from "./InviteLinks";
import { useOpenClass } from "./useOpenClass";
import type { ClassSummary } from "./types";
import "../classes.css";
import "./classes-v2.css";

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "");

/** Dòng trạng thái của thẻ lớp: đang học, lịch tới, hoặc chưa đặt lịch. */
export function stateLine(g: ClassSummary): { live: boolean; text: string } {
  if (g.live) return { live: true, text: `Đang học · từ ${hhmm(g.live.startedAt)} · ${g.live.joined}/${g.live.total} em` };
  if (g.nextAt) {
    const when = g.schedule && !g.nextAt.sessionId ? g.schedule.days.map((d) => weekdayNames[d]).join(", ") : weekdayNames[new Date(`${g.nextAt.date}T00:00:00Z`).getUTCDay()];
    return { live: false, text: `Lịch ${when} · ${g.nextAt.time} · tới ${shortDate(g.nextAt.date)}` };
  }
  return { live: false, text: "Chưa đặt lịch" };
}
export function todoLine(g: ClassSummary) {
  return [
    g.pending.unconfirmed ? `${g.pending.unconfirmed} buổi chờ xác nhận` : "",
    g.pending.submissions ? `${g.pending.submissions} bài chưa nhận xét` : "",
  ].filter(Boolean).join(" · ");
}

export function ClassList({ groups, error, onOpenClass, onEnterRoom, onCreate }: {
  groups: ClassSummary[] | null;
  error: string;
  onOpenClass: (id: string) => void;
  /** groupId đi kèm để thoát phòng là về đúng lớp. */
  onEnterRoom: (sessionId: string, groupId: string) => void;
  onCreate: () => void;
}) {
  const lastGroup = useRef("");
  const opener = useOpenClass((sessionId) => onEnterRoom(sessionId, lastGroup.current));
  const [invite, setInvite] = useState<ClassSummary | null>(null);
  const sorted = groups ? [...groups].sort((a, b) => Number(!!b.live) - Number(!!a.live)) : null;
  return <div className="cls">
    <div className="cls-ph">
      <div className="cls-min"><h1>Lớp của bạn</h1><p className="cls-muted cls-one">Mỗi lớp là một phòng học cố định. Bấm Mở lớp là vào dạy ngay.</p></div>
      <span className="cls-grow" />
      <button type="button" className="cls-btn cls-btn--pri" onClick={onCreate}><Plus size={16} />Tạo lớp</button>
    </div>
    {(error || opener.error) && <p className="cls-alert" role="alert"><AlertCircle size={16} />{error || opener.error}</p>}
    {!sorted && !error && <p className="cls-muted" role="status">Đang tải danh sách lớp…</p>}
    {sorted && sorted.length === 0 && <div className="cls-empty">
      <span className="cls-ico cls-ico--acc"><UserPlus size={20} /></span>
      <b>Chưa có lớp nào</b>
      <p className="cls-muted">Tạo lớp để mỗi em có link riêng, mở lớp một chạm và app tự ghi lại từng buổi.</p>
      <button type="button" className="cls-btn cls-btn--pri" onClick={onCreate}><Plus size={16} />Tạo lớp đầu tiên</button>
    </div>}
    {sorted && sorted.length > 0 && <div className="cls-grid2">
      {sorted.map((g) => {
        const st = stateLine(g);
        const todo = todoLine(g);
        return <section key={g.id} className={`cls-card cls-room${st.live ? " is-live" : ""}`}>
          <button type="button" className="cls-room__top" onClick={() => onOpenClass(g.id)}>
            <CIco name={g.name} />
            <span className="cls-min"><b className="cls-one cls-room__name">{g.name}</b><span className="cls-muted cls-one">{g.subject} · {g.grade}{g.students.length === 1 ? " · dạy kèm 1–1" : ""}</span></span>
          </button>
          <div className="cls-row"><Stack people={g.students} /><span className="cls-muted cls-one">{g.students.length} em</span></div>
          <div className={`cls-state${st.live ? " is-live" : ""}`}>{st.live ? <span className="cls-livedot" /> : <CalendarDays size={15} />}<span className="cls-one">{st.text}</span></div>
          <div className={`cls-todo${todo ? "" : " is-none"}`}><span className="cls-one">{todo || "Không có việc còn dở"}</span></div>
          <div className="cls-room__ft">
            {g.live
              ? <button type="button" className="cls-btn cls-btn--go" onClick={() => onEnterRoom(g.live!.sessionId, g.id)}><Video size={16} />Vào lại</button>
              : <button type="button" className="cls-btn cls-btn--pri" disabled={!g.students.length || opener.busy === g.id} title={g.students.length ? undefined : "Thêm học sinh trước"} onClick={() => { lastGroup.current = g.id; void opener.open(g.id); }}><Video size={16} />{opener.busy === g.id ? "Đang mở…" : "Mở lớp"}</button>}
            <span className="cls-grow" />
            <button type="button" className="cls-btn cls-btn--txt cls-btn--sm" disabled={!g.students.length} onClick={() => setInvite(g)}><Link2 size={14} />Link mời</button>
          </div>
        </section>;
      })}
      <button type="button" className="cls-newroom" onClick={onCreate}><span className="cls-ico cls-ico--acc"><Plus size={18} /></span>Tạo lớp mới<span className="cls-muted" style={{ fontWeight: 400 }}>Dạy kèm 1–1 cũng là một lớp</span></button>
    </div>}
    {invite && <InviteLinks title={invite.name} students={invite.students} onClose={() => setInvite(null)} />}
  </div>;
}
