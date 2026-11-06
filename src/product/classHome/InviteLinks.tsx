import { useState } from "react";
import { Copy } from "lucide-react";
import { api } from "../onlineApi";
import { Av, Modal, copyText, errText } from "./ui";
import type { Pupil } from "./types";

/** Mỗi em có link riêng, dùng mãi cho mọi buổi của lớp. */
export function InviteLinks({ title, students, onClose }: { title: string; students: Pupil[]; onClose: () => void }) {
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const copy = async (p: Pupil) => {
    setError("");
    try {
      const r = await api<{ url: string }>(`/students/${p.id}/link`);
      const ok = await copyText(r.url);
      setDone(ok ? p.id : "");
      if (!ok) setError(r.url); // trình duyệt chặn chép: hiện link để gia sư tự chép
    } catch (e) { setError(errText(e)); }
  };
  return <Modal title="Link mời" sub={title} onClose={onClose} footer={<button type="button" className="cls-btn cls-btn--sec" onClick={onClose}>Đóng</button>}>
    <p className="cls-muted">Gửi mỗi em link của em đó. Link không đổi giữa các buổi; khi bạn mở lớp, em bấm vào là vào lớp.</p>
    <div className="cls-pick">
      {students.map((p) => <div key={p.id} className="cls-prow" style={{ cursor: "default" }}>
        <Av p={p} /><b className="cls-one">{p.name}</b><span className="cls-grow" />
        <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => void copy(p)}><Copy size={14} />{done === p.id ? "Đã chép" : "Chép link"}</button>
      </div>)}
    </div>
    {error && <p className="cls-alert" role="alert" style={{ overflowWrap: "anywhere" }}>{error}</p>}
  </Modal>;
}
