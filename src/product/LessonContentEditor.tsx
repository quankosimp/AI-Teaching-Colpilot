import { useState, type FormEvent } from "react";

type LessonMaterial = { id: string; title: string; currentVersion: number };
export type LessonContent = {
  title: string; description: string; teacherNotes: string | null; duration: number | null;
  materialId: string | null; materialVersion: number | null; materialStartPage: number;
};

/** Shared add/edit form. Content and private notes remain distinct all the way to the room. */
export function LessonContentEditor({ materials, initial, busy, onSave }: {
  materials: LessonMaterial[]; initial?: Partial<LessonContent>; busy: boolean;
  onSave: (content: LessonContent) => Promise<void>;
}) {
  const [draft, setDraft] = useState<LessonContent>({
    title: "", description: "", teacherNotes: "", duration: null,
    materialId: null, materialVersion: null, materialStartPage: 0, ...initial,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const patch = (value: Partial<LessonContent>) => setDraft(d => ({ ...d, ...value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setSaving(true);
    try { await onSave(draft); }
    catch (e) { setError(e instanceof Error ? e.message : "Chưa lưu được nội dung. Bản đang soạn vẫn còn."); }
    finally { setSaving(false); }
  };
  return <form className="form-stack lesson-editor" onSubmit={submit}>
    <label>Tên nội dung<input value={draft.title} required maxLength={200} onChange={e => patch({title:e.target.value})} /></label>
    <label>Đề bài / nội dung học sinh xem<textarea rows={5} value={draft.description} onChange={e => patch({description:e.target.value})} placeholder="Dán đề, đoạn đọc hoặc hướng dẫn cho học sinh. Có thể dùng kèm tài liệu bên dưới." /></label>
    <label>
      Tài liệu dùng khi dạy (tùy chọn)
      <select value={draft.materialId || ""} onChange={event => {
        const material = materials.find(item => item.id === event.target.value);
        patch({
          materialId: material?.id ?? null,
          materialVersion: material?.currentVersion ?? null,
          materialStartPage: 0,
        });
      }}>
        <option value="">Không dùng tệp</option>
        {materials.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
      <small className="muted">Mở tệp bằng nút Tài liệu trong phòng dạy.</small>
    </label>
    <label>Ghi chú riêng của gia sư<textarea rows={3} value={draft.teacherNotes || ""} onChange={e => patch({teacherNotes:e.target.value})} placeholder="Đáp án, cách giảng, điều cần lưu ý. Học sinh không thấy phần này." /></label>
    <label>Thời lượng dự kiến (phút, tùy chọn)<input type="number" min={1} value={draft.duration ?? ""} onChange={e => patch({duration:e.target.value ? Number(e.target.value) : null})} placeholder="Để trống nếu chưa ước lượng" /></label>
    {error && <p role="alert">{error}</p>}
    <button className="button primary" disabled={busy || saving}>{saving ? "Đang lưu…" : "Lưu nội dung"}</button>
  </form>;
}
