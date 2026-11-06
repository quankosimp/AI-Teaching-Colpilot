import { useState } from "react";
import { ShieldCheck, ShieldOff, Sparkles } from "lucide-react";
import { api } from "../onlineApi";
import { errText } from "./ui";

export type AiConsentState = "granted" | "revoked" | "unset";

const STATE_TEXT: Record<AiConsentState, { title: string; body: string }> = {
  granted: {
    title: "Đã ghi nhận đồng ý",
    body: "AI được đọc những gì em làm trong giờ (không kèm tên) để soạn nháp ghi nhớ. Bạn vẫn duyệt từng dòng.",
  },
  revoked: {
    title: "Đã thu hồi",
    body: "AI không đọc dữ liệu của em. Bạn vẫn tự ghi nhớ như bình thường.",
  },
  unset: {
    title: "Chưa ghi nhận",
    body: "AI chỉ dùng ở buổi em tự bấm đồng ý khi vào lớp. Ghi nhận một lần ở đây thì dùng cho mọi buổi.",
  },
};

/**
 * Ghi nhận đồng ý dùng AI thay mặt em hoặc phụ huynh.
 * Luôn có một bước xác nhận: gia sư khẳng định đã hỏi, không phải bấm cho xong.
 */
export function AiConsentControl({ studentId, name, state, onChanged, compact = false }: {
  studentId: string;
  name: string;
  state: AiConsentState;
  onChanged: (state: AiConsentState) => void;
  compact?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const save = async (granted: boolean) => {
    setBusy(true); setMsg("");
    try {
      const r = await api<{ state: AiConsentState }>(`/students/${studentId}/ai-consent`, { method: "PUT", body: JSON.stringify({ granted }) });
      setAsking(false);
      onChanged(r.state);
    } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };
  const revoke = () => {
    if (!confirm(`Thu hồi đồng ý dùng AI của ${name}? Từ giờ AI không đọc dữ liệu của em nữa.`)) return;
    void save(false);
  };

  const confirmBox = <div className="cls-consent__ask" role="group" aria-label="Xác nhận đồng ý dùng AI">
    <p><b>{name} hoặc phụ huynh đã đồng ý?</b> AI chỉ đọc bài làm, câu trả lời và trang nháp trong giờ, không kèm tên em. Mọi nhận định vẫn chờ bạn duyệt.</p>
    <div className="cls-consent__acts">
      <button type="button" className="cls-btn cls-btn--pri cls-btn--sm" disabled={busy} onClick={() => void save(true)}>{busy ? "Đang lưu…" : "Đã đồng ý, ghi nhận"}</button>
      <button type="button" className="cls-btn cls-btn--txt cls-btn--sm" disabled={busy} onClick={() => setAsking(false)}>Huỷ</button>
    </div>
  </div>;

  if (compact) {
    return <div className="cls-consent is-compact">
      {asking ? confirmBox : <p className="cls-muted">
        {state === "revoked" ? "Bạn đã thu hồi đồng ý dùng AI của em." : "Em chưa đồng ý dùng AI nên máy không soạn nháp."}{" "}
        <button type="button" className="cls-btn cls-btn--txt cls-btn--sm cls-inline" onClick={() => setAsking(true)}>Ghi nhận đồng ý</button>
      </p>}
      {msg && <p className="cls-muted" role="alert">{msg}</p>}
    </div>;
  }

  const t = STATE_TEXT[state];
  const Icon = state === "granted" ? ShieldCheck : state === "revoked" ? ShieldOff : Sparkles;
  return <div className={`cls-consent is-${state}`}>
    <div className="cls-consent__row">
      <span className="cls-consent__ico"><Icon size={16} /></span>
      <div className="cls-min" style={{ flex: 1 }}><b>{t.title}</b><span className="cls-muted">{t.body}</span></div>
    </div>
    {asking ? confirmBox : <div className="cls-consent__acts">
      {state === "granted"
        ? <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" disabled={busy} onClick={revoke}>Thu hồi</button>
        : <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => setAsking(true)}>{state === "revoked" ? "Ghi nhận lại" : "Ghi nhận đồng ý"}</button>}
    </div>}
    {msg && <p className="cls-muted" role="alert">{msg}</p>}
  </div>;
}
