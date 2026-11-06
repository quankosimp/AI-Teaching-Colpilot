import { useState, type FormEvent } from "react";
import { FileText, Upload } from "lucide-react";
import { Modal } from "./ui";
import {
  editableLesson, lessonError, lessonHeading, lessonOrder, lessonWhen,
  type LessonMaterial, type LessonPupil, type LessonSession,
} from "./lessonPlanning";

export function LessonMaterialDialog({ material, session, materials, sessions, students, onAttach, onSchedule, onUpload, onClose }: {
  material?: LessonMaterial;
  session?: LessonSession;
  materials: LessonMaterial[];
  sessions: LessonSession[];
  students: LessonPupil[];
  onAttach: (session: LessonSession, material: LessonMaterial) => Promise<void>;
  onSchedule?: (material: LessonMaterial) => void;
  onUpload?: () => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target = session ?? sessions.find(item => item.id === choice);
  const file = material ?? materials.find(item => item.id === choice);
  const hasFile = (target: LessonSession, file: LessonMaterial) => target.Activity_sessionId_items.some(
    activity => activity.materialId === file.id && activity.materialVersion === file.currentVersion,
  );
  const availableSessions = sessions.filter(editableLesson).sort(lessonOrder);
  const availableMaterials = session ? materials.filter(item => !hasFile(session, item)) : [];
  const duplicate = target && file && hasFile(target, file);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target || !file || duplicate || busy) return;
    setBusy(true);
    setError("");
    try {
      await onAttach(target, file);
      onClose();
    } catch (error) {
      setError(lessonError(error));
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={material ? "Thêm vào buổi" : "Thêm tài liệu"} onClose={() => !busy && onClose()}>
    <form className="form-stack lesson-dialog-form" onSubmit={submit}>
      {material ? <>
        <div className="lesson-dialog-file"><FileText size={18} /><strong>{material.title}</strong></div>
        {availableSessions.length ? <label>Buổi học
          <select aria-label="Buổi học" required value={choice} onChange={event => { setChoice(event.target.value); setError(""); }}>
            <option value="">Chọn buổi học</option>
            {availableSessions.map(item => <option key={item.id} value={item.id}>
              {lessonHeading(item, students)} · {lessonWhen(item)}{hasFile(item, material) ? " · Đã có tệp" : ""}
            </option>)}
          </select>
        </label> : <p className="muted">Chưa có buổi nào để thêm tài liệu.</p>}
        {onSchedule && <button className="text-button" type="button" disabled={busy} onClick={() => onSchedule(material)}>Đặt lịch buổi mới</button>}
      </> : <>
        {session && <p className="lesson-dialog-context">{lessonHeading(session, students)} · {lessonWhen(session)}</p>}
        {availableMaterials.length ? <label>Tài liệu từ kho
          <select aria-label="Tài liệu từ kho" required value={choice} onChange={event => { setChoice(event.target.value); setError(""); }}>
            <option value="">Chọn tài liệu</option>
            {availableMaterials.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label> : <p className="muted">{materials.length ? "Các tài liệu trong kho đã được thêm vào buổi." : "Kho học liệu chưa có tài liệu."}</p>}
        {onUpload && <button className="text-button" type="button" disabled={busy} onClick={() => { onClose(); onUpload(); }}>
          <Upload size={16} /> Tải tài liệu mới
        </button>}
      </>}
      {duplicate && <p className="muted">Tài liệu này đã có trong buổi đã chọn.</p>}
      {error && <p role="alert" className="lesson-error">{error}</p>}
      <div className="lesson-dialog-actions">
        <button type="button" className="button ghost" disabled={busy} onClick={onClose}>Hủy</button>
        <button className="button primary" disabled={busy || !target || !file || !!duplicate}>{busy ? "Đang thêm…" : "Thêm tài liệu"}</button>
      </div>
    </form>
  </Modal>;
}
