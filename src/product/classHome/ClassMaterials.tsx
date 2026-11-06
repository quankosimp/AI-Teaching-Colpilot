import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, ClipboardList, FileText, Image as ImageIcon, Pin, PinOff, Plus, Search } from "lucide-react";
import { api } from "../onlineApi";
import { Modal, errText } from "./ui";

type Item = { materialId: string; title: string; kind: string; subject: string; lastPage: number; lastUsedAt: string | null };
type Lib = { id: string; title: string; kind: string; subject: string; grade?: string; topic?: string };

const shortDay = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};
const pageText = (p: number) => (p > 0 ? `tiếp từ trang ${p + 1}` : "mở từ trang đầu");
const KindIco = ({ kind }: { kind: string }) => (kind === "PDF" ? <FileText size={16} /> : <ImageIcon size={16} />);

/**
 * Tab Tài liệu của một lớp. Không bắt buộc: chia sẻ màn hình vẫn dùng được như thường.
 * Ghim tài liệu thì bấm Mở lớp là tài liệu có sẵn, mở tiếp đúng trang buổi trước dừng.
 */
export function ClassMaterials({ groupId, groupName, onPrepare, preparing }: {
  groupId: string;
  groupName: string;
  onPrepare: () => void;
  preparing: boolean;
}) {
  const [data, setData] = useState<{ pinned: Item[]; used: Item[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [picking, setPicking] = useState(false);
  const load = useCallback(async () => {
    try { setData(await api<{ pinned: Item[]; used: Item[] }>(`/groups/${groupId}/materials`)); setError(""); }
    catch (e) { setError(errText(e)); }
  }, [groupId]);
  useEffect(() => { void load(); }, [load]);
  const pin = async (materialId: string, pinned: boolean) => {
    setBusy(materialId);
    try { await api(`/groups/${groupId}/materials/${materialId}`, { method: "PUT", body: JSON.stringify({ pinned }) }); await load(); }
    catch (e) { setError(errText(e)); } finally { setBusy(""); }
  };

  if (!data) return <section className="cls-card"><p className="cls-pad cls-muted" role="status">{error || "Đang tải tài liệu…"}</p></section>;
  const row = (it: Item, pinned: boolean) => <div key={it.materialId} className="cls-matrow">
    <span className={`cls-matico${pinned ? " is-pin" : ""}`}><KindIco kind={it.kind} /></span>
    <div className="cls-min" style={{ flex: 1 }}>
      <b className="cls-one" title={it.title}>{it.title}</b>
      <span className="cls-muted cls-one">{pinned
        ? `Mở sẵn ở buổi tới · ${pageText(it.lastPage)}`
        : `Lần cuối ${shortDay(it.lastUsedAt)}${it.lastPage > 0 ? ` · dừng ở trang ${it.lastPage + 1}` : ""}`}</span>
    </div>
    {pinned
      ? <button type="button" className="cls-btn cls-btn--txt cls-btn--sm" disabled={busy === it.materialId} onClick={() => void pin(it.materialId, false)}><PinOff size={14} />Bỏ ghim</button>
      : <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" disabled={busy === it.materialId} onClick={() => void pin(it.materialId, true)}><Pin size={14} />Ghim lại</button>}
  </div>;

  return <>
    {error && <p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p>}
    <section className="cls-card">
      <div className="cls-mathead">
        <div className="cls-min" style={{ flex: 1 }}>
          <b>Mở sẵn ở buổi tới</b>
          <span className="cls-muted">Bấm Mở lớp là tài liệu đã nằm trên màn chiếu, đúng trang lần trước dừng.</span>
        </div>
        <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => setPicking(true)}><Plus size={14} />Ghim tài liệu</button>
      </div>
      {data.pinned.length === 0
        ? <div className="cls-matempty"><Pin size={18} /><p><b>Chưa ghim tài liệu nào.</b> Không bắt buộc: bạn vẫn chia sẻ màn hình như bình thường. Ghim khi lớp đang theo một bộ tài liệu dài.</p></div>
        : data.pinned.map((it) => row(it, true))}
      <div className="cls-matfoot">
        <span className="cls-muted cls-one cls-grow">Muốn soạn trước thứ tự hoạt động hay câu hỏi?</span>
        <button type="button" className="cls-btn cls-btn--txt cls-btn--sm" disabled={preparing} onClick={onPrepare}><ClipboardList size={14} />{preparing ? "Đang mở…" : "Chuẩn bị buổi tới"}</button>
      </div>
    </section>
    {data.used.length > 0 && <section className="cls-card">
      <div className="cls-mathead"><div className="cls-min" style={{ flex: 1 }}><b>Đã dùng trước đây</b><span className="cls-muted">Không ghim nữa, nhưng máy vẫn nhớ trang đã dừng.</span></div></div>
      {data.used.map((it) => row(it, false))}
    </section>}
    {picking && <PinPicker groupName={groupName} taken={data.pinned.map((i) => i.materialId)}
      onClose={() => setPicking(false)}
      onPin={async (ids) => { for (const id of ids) await pin(id, true); setPicking(false); }} />}
  </>;
}

function PinPicker({ groupName, taken, onClose, onPin }: { groupName: string; taken: string[]; onClose: () => void; onPin: (ids: string[]) => Promise<void> }) {
  const [lib, setLib] = useState<Lib[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ materials: Lib[] }>("/materials").then((r) => setLib(r.materials)).catch((e) => setError(errText(e)));
  }, []);
  const term = q.trim().toLowerCase();
  const options = (lib ?? []).filter((m) => !taken.includes(m.id) && (!term || `${m.title} ${m.subject} ${m.topic ?? ""}`.toLowerCase().includes(term)));
  return <Modal title="Ghim tài liệu" sub={`Cho lớp ${groupName}`} onClose={onClose}
    footer={<><button type="button" className="cls-btn cls-btn--sec" onClick={onClose}>Huỷ</button>
      <button type="button" className="cls-btn cls-btn--pri" disabled={!picked.length || busy} onClick={() => { setBusy(true); void onPin(picked).finally(() => setBusy(false)); }}>{busy ? "Đang ghim…" : picked.length ? `Ghim ${picked.length} tài liệu` : "Ghim"}</button></>}>
    {error && <p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p>}
    {!lib && !error && <p className="cls-muted" role="status">Đang tải kho tài liệu…</p>}
    {lib && lib.length === 0 && <p className="cls-muted">Kho chưa có tài liệu. Tải PDF hoặc ảnh ở mục Tài liệu trên thanh bên trước nhé.</p>}
    {lib && lib.length > 0 && <>
      <label className="cls-msearch"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên hoặc môn" aria-label="Tìm tài liệu" /></label>
      <div className="cls-pick">
        {options.length === 0 && <p className="cls-pad cls-muted">Không có tài liệu nào khớp.</p>}
        {options.map((m) => {
          const on = picked.includes(m.id);
          return <button type="button" key={m.id} className={`cls-prow${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== m.id) : [...p, m.id]))}>
            <span className="cls-cbx">{on && <Check size={12} strokeWidth={3} />}</span>
            <span className="cls-matico"><KindIco kind={m.kind} /></span>
            <span className="cls-min" style={{ flex: 1 }}><b className="cls-one" style={{ display: "block" }}>{m.title}</b><span className="cls-muted cls-one" style={{ display: "block", fontSize: 12 }}>{[m.subject, m.grade].filter(Boolean).join(" · ")}</span></span>
          </button>;
        })}
      </div>
    </>}
  </Modal>;
}

/** Hộp "Dùng cho lớp" ở kho: bật/tắt ghim tài liệu này cho từng lớp. Lưu ngay khi bấm. */
export function MaterialClassesDialog({ material, onClose }: { material: { id: string; title: string }; onClose: () => void }) {
  type G = { id: string; name: string; subject: string; pinned: boolean; lastPage: number; used: boolean };
  const [groups, setGroups] = useState<G[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try { setGroups((await api<{ groups: G[] }>(`/materials/${material.id}/classes`)).groups); }
    catch (e) { setError(errText(e)); }
  }, [material.id]);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (g: G) => {
    setBusy(g.id); setError("");
    try { await api(`/groups/${g.id}/materials/${material.id}`, { method: "PUT", body: JSON.stringify({ pinned: !g.pinned }) }); await load(); }
    catch (e) { setError(errText(e)); } finally { setBusy(""); }
  };
  return <div className="cls"><Modal title="Dùng cho lớp" sub={material.title} onClose={onClose}
    footer={<button type="button" className="cls-btn cls-btn--pri" onClick={onClose}>Xong</button>}>
    <p className="cls-muted" style={{ margin: 0 }}>Lớp được ghim sẽ có tài liệu này mở sẵn khi bấm Mở lớp, tiếp đúng trang lần trước dừng.</p>
    {error && <p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p>}
    {!groups && !error && <p className="cls-muted" role="status">Đang tải lớp…</p>}
    {groups && groups.length === 0 && <p className="cls-muted">Bạn chưa có lớp nào. Tạo lớp ở mục Lớp trước nhé.</p>}
    {groups && groups.length > 0 && <div className="cls-pick">
      {groups.map((g) => <button type="button" key={g.id} className={`cls-prow${g.pinned ? " is-on" : ""}`} aria-pressed={g.pinned} disabled={busy === g.id} onClick={() => void toggle(g)}>
        <span className="cls-cbx">{g.pinned && <Check size={12} strokeWidth={3} />}</span>
        <span className="cls-min" style={{ flex: 1 }}><b className="cls-one" style={{ display: "block" }}>{g.name}</b>
          <span className="cls-muted cls-one" style={{ display: "block", fontSize: 12 }}>{g.pinned ? `Đang ghim · ${pageText(g.lastPage)}` : g.used ? `Đã dùng${g.lastPage > 0 ? ` · dừng ở trang ${g.lastPage + 1}` : ""}` : g.subject}</span></span>
      </button>)}
    </div>}
  </Modal></div>;
}
