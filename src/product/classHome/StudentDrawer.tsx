import { useEffect, useState } from "react";
import { Check, Copy, RefreshCw, Trash2, X } from "lucide-react";
import { api } from "../onlineApi";
import { Av, copyText, dayLabel, errText } from "./ui";
import type { ClassStudentRow } from "./types";
import { AiConsentControl, type AiConsentState } from "./AiConsent";

/** Hồ sơ một em ở khung bên phải: không rời trang lớp. */
export function StudentDrawer({ student, groupName, onClose, onRemove, onChanged }: {
  student: ClassStudentRow; groupName: string; onClose: () => void; onRemove: () => void; onChanged: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [consent, setConsent] = useState<AiConsentState>(student.aiConsent);
  useEffect(() => setConsent(student.aiConsent), [student.aiConsent]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const copy = async (rotate: boolean) => {
    if (rotate && !confirm(`Đổi link của ${student.name}? Link cũ sẽ không vào được nữa.`)) return;
    try {
      const r = rotate
        ? await api<{ url: string }>(`/students/${student.id}/link/rotate`, { method: "POST", body: "{}" })
        : await api<{ url: string }>(`/students/${student.id}/link`);
      setMsg((await copyText(r.url)) ? (rotate ? "Đã đổi và chép link mới" : "Đã chép link") : r.url);
    } catch (e) { setMsg(errText(e)); }
  };
  const absent = student.total - student.attended;
  const resolve = async (id: string) => {
    try { await api(`/claims/${id}/resolve`, { method: "POST", body: "{}" }); onChanged(); }
    catch (e) { setMsg(errText(e)); }
  };
  return <>
    <div className="cls-drawer-scrim" onMouseDown={onClose} />
    <aside className="cls-drawer cls" role="dialog" aria-label={`Hồ sơ ${student.name}`}>
      <div className="cls-drawer__h"><Av p={student} size={44} /><div className="cls-min" style={{ flex: 1 }}><b className="cls-one">{student.name}</b><span className="cls-muted cls-one">{groupName} · đi học {student.attended}/{student.total} buổi</span></div><button type="button" className="cls-ib" aria-label="Đóng" onClick={onClose}><X size={18} /></button></div>
      <div className="cls-drawer__b">
        <div className="cls-sect"><h4>Điều cần nhớ <span className="cls-count">{student.notes.length}</span></h4>
          {student.notes.length === 0 && <p className="cls-muted">Chưa có điều cần nhớ. Nhận định bạn duyệt sau buổi sẽ hiện ở đây.</p>}
          {student.notes.map((n) => <div key={n.id} className="cls-mcard"><span className={`cls-tagnote${n.kind ? ` is-${n.kind}` : ""}`}>{n.kind === "review" ? "Ôn lại" : n.kind === "good" ? "Làm tốt" : "Ghi nhận"}</span><div className="cls-min" style={{ flex: 1 }}><b>{n.text}</b><span className="cls-muted cls-one">Buổi {dayLabel(n.date)}</span>
            <div style={{ marginTop: 8 }}><button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => void resolve(n.id)}><Check size={14} />Đã ổn</button></div></div></div>)}
        </div>
        <div className="cls-sect"><h4>Đi học</h4>
          <div className="cls-kv2"><span>Có mặt</span><span>{student.attended}/{student.total} buổi</span><span>Vắng</span><span>{absent} buổi</span>
            <span>Link riêng</span><span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" className="cls-btn cls-btn--txt cls-btn--sm" style={{ paddingLeft: 0 }} onClick={() => void copy(false)}><Copy size={14} />Chép link</button>
              <button type="button" className="cls-btn cls-btn--txt cls-btn--sm" onClick={() => void copy(true)}><RefreshCw size={14} />Đổi link</button>
            </span></div>
          {msg && <p className="cls-muted" role="status" style={{ marginTop: 8, overflowWrap: "anywhere" }}>{msg}</p>}
        </div>
        <div className="cls-sect"><h4>Trợ lý AI</h4>
          <AiConsentControl studentId={student.id} name={student.name} state={consent} onChanged={(st) => { setConsent(st); onChanged(); }} />
        </div>
        <div className="cls-sect"><button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={onRemove}><Trash2 size={14} />Bỏ khỏi lớp</button></div>
      </div>
    </aside>
  </>;
}
