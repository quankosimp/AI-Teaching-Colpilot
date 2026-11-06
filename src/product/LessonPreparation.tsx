import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft, ArrowDown, ArrowUp, CalendarDays, CheckCircle2, ChevronDown, ClipboardPenLine,
  Ellipsis, FileText, LockKeyhole, Pencil, Plus, Video,
} from "lucide-react";
import { api, ApiError } from "./onlineApi";
import { Modal, Status, initials } from "./ui";
import { LessonContentEditor } from "./LessonContentEditor";
import { LessonMaterialDialog } from "./LessonMaterialDialog";
import { MaterialViewer } from "./MaterialViewer";
import { AISuggestionReview } from "./presentation";
import { statusLabel } from "./statusLabels";
import {
  editableLesson, lessonError, lessonHeading, lessonPupils, lessonWhen,
  type LessonActivity, type LessonClaim, type LessonMaterial, type LessonPupil, type LessonSession,
} from "./lessonPlanning";
import "./lesson-preparation.css";

type Mark = { id: string; activityId: string; materialId: string; materialVersion: number; page: number; x: number; y: number; text: string };
type Suggestion = {
  id: string;
  text: string;
  sources: { claimId: string; revision: number; evidenceIds: string[] }[];
};
type Dialog = { kind: "view" | "edit" | "remove"; id: string } | { kind: "attach" | "paste" | "notes" | "intro" | "title" };
const blankActivity = {
  id: "", type: "LuyenTap" as const, description: "", teacherNotes: null, duration: null,
  materialId: null, materialVersion: null, materialStartPage: 0, sourceEvidenceIds: [], sourceClaimRefs: [],
};

export function LessonPreparation({ session, students, materials, history, preferredStudentId, notice, onBack,
  onSchedule, onOpenRoom, onOpenStudent, onSource, onAttach, onUpload, onUpdated }: {
  session: LessonSession;
  students: LessonPupil[];
  materials: LessonMaterial[];
  history: LessonClaim[];
  preferredStudentId: string;
  notice: string;
  onBack: () => void;
  onSchedule: () => void;
  onOpenRoom: () => void;
  onOpenStudent: (id: string) => void;
  onSource: (id: string) => void;
  onAttach: (session: LessonSession, material: LessonMaterial) => Promise<void>;
  onUpload: () => void;
  onUpdated: (session: LessonSession, notice?: string) => void;
}) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [expandedItem, setExpandedItem] = useState("");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [marksError, setMarksError] = useState("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [editingSuggestion, setEditingSuggestion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editable = editableLesson(session);
  const activities = session.Activity_sessionId_items;
  const pupils = lessonPupils(session, students);
  const title = lessonHeading(session, students);
  const member = session.RoomMember_sessionId_items.find(item => item.studentId === preferredStudentId)
    ?? session.RoomMember_sessionId_items[0];
  const sources = history.filter(claim => claim.studentId === member?.studentId);
  const selected = dialog && "id" in dialog ? activities.find(item => item.id === dialog.id) : undefined;
  const file = selected ? materials.find(item => item.id === selected.materialId) : undefined;
  const minutes = activities.reduce((sum, item) => sum + (item.duration ?? 0), 0);
  const close = () => { if (!busy) setDialog(null); };

  useEffect(() => {
    if (dialog?.kind !== "view" || !file) return;
    let active = true;
    setMarks([]);
    setMarksError("");
    void api<{ annotations: Mark[] }>("/sessions/" + session.id + "/annotations")
      .then(result => { if (active) setMarks(result.annotations); })
      .catch(() => { if (active) setMarksError("Chưa tải được chú thích."); });
    return () => { active = false; };
  }, [session.id, dialog?.kind, selected?.id, file?.id]);

  async function refreshOnConflict(error: unknown) {
    if (error instanceof ApiError && error.failure.code === "VERSION_CONFLICT") {
      const { session: latest } = await api<{ session: LessonSession }>("/sessions/" + session.id);
      onUpdated(latest);
    }
  }

  async function saveActivities(items: LessonActivity[], message?: string) {
    const payload = items.map(({
      id, title, description, teacherNotes, duration, type, materialId, materialVersion,
      materialStartPage, sourceEvidenceIds, sourceClaimRefs,
    }) => ({
      ...(id ? { id } : {}),
      title, description, teacherNotes, duration, type, materialId, materialVersion,
      materialStartPage, sourceEvidenceIds, sourceClaimRefs,
    }));
    try {
      const { session: updated } = await api<{ session: Partial<LessonSession> }>("/sessions/" + session.id + "/activities", {
        method: "PUT",
        headers: { "If-Match-Version": String(session.version) },
        body: JSON.stringify(payload),
      });
      onUpdated({ ...session, ...updated }, message);
    } catch (error) {
      await refreshOnConflict(error).catch(() => {});
      throw error;
    }
  }

  async function patchLesson(fields: Partial<Pick<LessonSession, "goal" | "sharedGoal" | "title" | "status">>, notice: string) {
    try {
      const { session: updated } = await api<{ session: Partial<LessonSession> }>("/sessions/" + session.id, {
        method: "PATCH",
        headers: { "If-Match-Version": String(session.version) },
        body: JSON.stringify(fields),
      });
      onUpdated({ ...session, ...updated }, notice);
    } catch (error) {
      await refreshOnConflict(error).catch(() => {});
      throw error;
    }
  }

  function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    void action().catch(error => setError(lessonError(error))).finally(() => setBusy(false));
  }

  function move(index: number, offset: -1 | 1) {
    const reordered = [...activities];
    [reordered[index], reordered[index + offset]] = [reordered[index + offset], reordered[index]];
    run(() => saveActivities(reordered));
  }

  return <div className="lesson-prep">
    <button type="button" className="text-button lesson-back" onClick={onBack}><ArrowLeft size={16} /> Buổi học</button>
    <header className="lesson-heading">
      <div>
        <div className="lesson-title">
          <h1>{title}</h1>
          <Status tone={session.status === "scheduled" || session.status === "live" ? "green" : "neutral"}>
            {session.status === "scheduled" ? "Đã đặt lịch" : session.status === "draft" ? "Chưa xác nhận lịch" : statusLabel(session.status)}
          </Status>
        </div>
        <p className="lesson-when"><CalendarDays size={16} /> {lessonWhen(session)}</p>
        {session.title !== title && <p className="lesson-topic">{session.title}</p>}
      </div>
      <div className="lesson-actions">
        {editable && <button type="button" className="button secondary" onClick={onSchedule}><Pencil size={15} /> Chỉnh lịch</button>}
        <button type="button" className="button primary" onClick={onOpenRoom}><Video size={16} />
          {session.status === "live" ? "Vào phòng dạy" : editable ? "Mở phòng dạy" : "Xem tổng kết"}
        </button>
      </div>
    </header>
    {notice && <p className="lesson-notice" role="status"><CheckCircle2 size={17} /> {notice}</p>}
    {error && <p className="lesson-error" role="alert">{error}</p>}
    {session.status === "draft" && <div className="lesson-draft">
      <p>Buổi này được lưu dưới dạng nháp. Xác nhận để đánh dấu đã đặt lịch.</p>
      <button type="button" className="button secondary small" disabled={busy}
        onClick={() => run(() => patchLesson({ status: "scheduled" }, "Đã xác nhận lịch."))}>Xác nhận lịch</button>
    </div>}
    <div className="lesson-layout">
      <section className="card lesson-content" aria-label="Nội dung buổi học">
        <div className="lesson-panel-heading">
          <h2>Nội dung buổi học</h2>
          <p>Đề bài và tài liệu sẽ hiện trong phòng dạy.</p>
        </div>
        {activities.length ? <ul className="lesson-items">
          {activities.map((activity, index) => {
            const material = materials.find(item => item.id === activity.materialId);
            return <li key={activity.id}>
              <div className="lesson-item">
                <span className="lesson-item-icon" aria-hidden="true">{activity.materialId ? <FileText size={18} /> : <ClipboardPenLine size={18} />}</span>
                <div className="lesson-item-copy">
                  <strong>{activity.title}</strong>
                  <small className="lesson-item-summary">{activity.materialId
                    ? material ? [material.kind === "PDF" ? "PDF" : "Tài liệu", material.subject].filter(Boolean).join(" · ") : "Tài liệu đã gắn"
                    : activity.description || (activity.teacherNotes ? "Ghi chú cho gia sư" : "Nội dung học sinh xem")}
                    {activity.duration != null && " · " + activity.duration + " phút"}</small>
                  {activity.isSourceStale && <small role="status">Nguồn đã thay đổi. Cần kiểm tra lại.</small>}
                </div>
                <div className="lesson-item-actions">
                  <button type="button" className="button ghost small" aria-label={"Xem " + activity.title} onClick={() => setDialog({ kind: "view", id: activity.id })}>Xem</button>
                  {(editable || activity.sourceEvidenceIds.length > 0) && <button type="button" className="button ghost small"
                    aria-label={"Tùy chọn " + activity.title} aria-expanded={expandedItem === activity.id}
                    onClick={() => setExpandedItem(expandedItem === activity.id ? "" : activity.id)}><Ellipsis size={17} /></button>}
                </div>
              </div>
              {expandedItem === activity.id && <div className="lesson-item-extra">
                <div className="lesson-item-extra-body">
                  {editable && <div className="lesson-actions">
                    <button type="button" className="button ghost small" onClick={() => setDialog({ kind: "edit", id: activity.id })}><Pencil size={14} /> Chỉnh nội dung</button>
                    {activities.length > 1 && <>
                      <button type="button" className="button ghost small" disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /> Đưa lên</button>
                      <button type="button" className="button ghost small" disabled={busy || index === activities.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /> Đưa xuống</button>
                    </>}
                    <button type="button" className="button ghost small" onClick={() => setDialog({ kind: "remove", id: activity.id })}>Gỡ khỏi buổi</button>
                  </div>}
                  {activity.sourceEvidenceIds.map(id => <button type="button" key={id} className="text-button" onClick={() => onSource(id)}>Xem nguồn đã duyệt</button>)}
                  {editable && sources.filter(claim => claim.observationEvidenceIds.length).map(claim => (
                    <button type="button" key={claim.id} className="text-button" disabled={busy} onClick={() => run(() => saveActivities(activities.map(item => item.id === activity.id ? {
                      ...item,
                      sourceEvidenceIds: [...new Set([...item.sourceEvidenceIds, ...claim.observationEvidenceIds])],
                      sourceClaimRefs: [...item.sourceClaimRefs.filter(ref => ref.claimId !== claim.id), { claimId: claim.id, revision: claim.revision }],
                    } : item), "Đã gắn nguồn đã duyệt."))}>Gắn nguồn · {claim.text}</button>
                  ))}
                </div>
              </div>}
            </li>;
          })}
        </ul> : <p className="lesson-empty">Chưa có nội dung đính kèm. Bạn có thể thêm tài liệu, dán đề hoặc dùng bảng trong phòng dạy.</p>}
        {editable && <div className="lesson-actions lesson-add">
          <button type="button" className="button secondary" onClick={() => setDialog({ kind: "attach" })}><Plus size={16} /> Thêm tài liệu</button>
          <button type="button" className="button ghost" onClick={() => setDialog({ kind: "paste" })}><ClipboardPenLine size={16} /> Dán đề bài</button>
        </div>}
        {minutes > session.duration && <p role="status" className="lesson-time-warning">Thời gian dự kiến của nội dung vượt thời lượng buổi.</p>}
        {(editable || session.goal) && <div className="lesson-private">
          <button type="button" className="text-button" onClick={() => setDialog({ kind: "notes" })}><LockKeyhole size={15} />
            {session.goal ? "Ghi chú riêng của gia sư" : "Thêm ghi chú riêng"}
          </button>
        </div>}
      </section>
      <aside className="card lesson-people">
        <div className="lesson-panel-heading"><h2>Học sinh</h2><p>{pupils.length} em tham gia</p></div>
        <ul>{pupils.map(pupil => <li key={pupil.id}>
          <span className={"avatar avatar-sm avatar-" + pupil.color} aria-hidden="true">{pupil.initials || initials(pupil.name)}</span>
          <button type="button" className="text-button" onClick={() => onOpenStudent(pupil.id)}>{pupil.name}</button>
          {!session.groupId && session.status === "draft" && pupils.length > 1 && <button type="button" className="text-button lesson-remove-pupil"
            aria-label={"Bỏ " + pupil.name + " khỏi bản nháp"} disabled={busy}
            onClick={() => run(async () => {
              await api("/sessions/" + session.id + "/members/" + pupil.id, {
                method: "DELETE", headers: { "If-Match-Version": String(session.version) },
              });
              const { session: updated } = await api<{ session: LessonSession }>("/sessions/" + session.id);
              onUpdated(updated, "Đã cập nhật danh sách học sinh.");
            })}>Bỏ</button>}
        </li>)}</ul>
      </aside>
    </div>
    {editable && <details className="lesson-more">
      <summary><ChevronDown size={15} /> Tùy chọn chuẩn bị khác</summary>
      <div className="lesson-more-body">
        <div className="lesson-actions">
          <button type="button" className="button ghost small" onClick={() => setDialog({ kind: "title" })}>Chủ đề buổi học</button>
          <button type="button" className="button ghost small" onClick={() => setDialog({ kind: "intro" })}>Lời mở đầu cho học sinh</button>
        </div>
        <button type="button" className="button secondary small" disabled={busy || !member || member.consent === false}
          onClick={() => run(async () => {
            const result = await api<{ suggestion: Suggestion }>("/sessions/" + session.id + "/ai/plan-suggestions", {
              method: "POST", body: JSON.stringify({ studentId: member?.studentId }),
            });
            setSuggestion(result.suggestion);
            setEditingSuggestion(false);
          })}>Đề xuất hoạt động từ lịch sử đã duyệt</button>
        {member?.consent === false && <p className="muted">Gợi ý từ hồ sơ cần sự đồng ý của học sinh.</p>}
        {suggestion && <AISuggestionReview text={suggestion.text} busy={busy} onEdit={() => setEditingSuggestion(true)}
          onDismiss={() => run(async () => {
            await api("/ai-requests/" + suggestion.id, { method: "PATCH", body: JSON.stringify({ status: "ignored" }) });
            setSuggestion(null);
          })}
          onAccept={() => run(async () => {
            await saveActivities([...activities, {
              ...blankActivity, title: "Củng cố từ lịch sử đã duyệt", type: "KiemTra", teacherNotes: suggestion.text,
              sourceEvidenceIds: [...new Set(suggestion.sources.flatMap(source => source.evidenceIds))],
              sourceClaimRefs: suggestion.sources.map(({ claimId, revision }) => ({ claimId, revision })),
            }], "Đã thêm gợi ý vào buổi.");
            setSuggestion(null);
            await api("/ai-requests/" + suggestion.id, { method: "PATCH", body: JSON.stringify({ status: "used" }) });
          })} />}
        {suggestion && editingSuggestion && <label className="lesson-edit-suggestion">Sửa gợi ý riêng cho gia sư
          <textarea value={suggestion.text} onChange={event => setSuggestion({ ...suggestion, text: event.target.value })} />
        </label>}
      </div>
    </details>}
    {dialog?.kind === "attach" && editable && <LessonMaterialDialog session={session} materials={materials}
      sessions={[]} students={students} onAttach={onAttach} onUpload={onUpload} onClose={close} />}
    {dialog?.kind === "paste" && editable && <LessonTextDialog title="Dán đề bài" label="Nội dung học sinh xem"
      placeholder="Dán đề hoặc gõ hướng dẫn cho học sinh." action="Thêm đề bài" required onClose={close}
      onSave={text => saveActivities([...activities, { ...blankActivity, title: "Đề bài", description: text }], "Đã thêm đề bài.")} />}
    {dialog?.kind === "notes" && <LessonTextDialog title="Ghi chú riêng của gia sư" label="Đáp án hoặc lời nhắc"
      initial={session.goal} readOnly={!editable} action="Lưu ghi chú" onClose={close}
      onSave={goal => patchLesson({ goal }, "Đã lưu ghi chú riêng.")} />}
    {dialog?.kind === "intro" && editable && <LessonTextDialog title="Lời mở đầu cho học sinh" label="Hiện ở đầu phòng dạy"
      initial={session.sharedGoal} action="Lưu lời mở đầu" onClose={close}
      onSave={sharedGoal => patchLesson({ sharedGoal }, "Đã lưu lời mở đầu.")} />}
    {dialog?.kind === "title" && editable && <LessonTextDialog title="Chủ đề buổi học" label="Chủ đề (tùy chọn)"
      initial={session.title === title ? "" : session.title} action="Lưu chủ đề" singleLine onClose={close}
      onSave={topic => patchLesson({ title: topic || title }, "Đã lưu chủ đề.")} />}
    {dialog?.kind === "edit" && selected && editable && <Modal title="Chỉnh nội dung" onClose={close}>
      <LessonContentEditor materials={materials} initial={selected} busy={busy} onSave={async content => {
        setBusy(true);
        try {
          await saveActivities(activities.map(item => item.id === selected.id ? { ...item, ...content } : item), "Đã cập nhật nội dung.");
          setDialog(null);
        } finally {
          setBusy(false);
        }
      }} />
    </Modal>}
    {dialog?.kind === "remove" && selected && editable && <Modal title="Gỡ khỏi buổi" onClose={close}>
      <p>{selected.title}</p>
      {error && <p className="lesson-error" role="alert">{error}</p>}
      <div className="lesson-dialog-actions">
        <button type="button" className="button ghost" disabled={busy} onClick={close}>Hủy</button>
        <button type="button" className="button primary" disabled={busy} onClick={() => run(async () => {
          await saveActivities(activities.filter(item => item.id !== selected.id), "Đã gỡ nội dung khỏi buổi.");
          setDialog(null);
        })}>Gỡ nội dung</button>
      </div>
    </Modal>}
    {dialog?.kind === "view" && selected && <Modal title={selected.title} wide={!!selected.materialId} onClose={close}>
      {selected.description && <p className="lesson-preview-text">{selected.description}</p>}
      {selected.materialId && selected.materialVersion && <MaterialViewer materialId={selected.materialId}
        version={selected.materialVersion} title={file?.title ?? selected.title} kind={file?.kind ?? "auto"}
        annotations={marks} sessionId={session.id} activityId={selected.id}
        students={pupils} onSaved={editable ? saved => setMarks(items => [...items, saved]) : undefined} />}
      {marksError && <p className="muted">{marksError}</p>}
      {selected.teacherNotes && <details className="lesson-preview-notes">
        <summary>Ghi chú riêng của gia sư</summary><p className="lesson-preview-text">{selected.teacherNotes}</p>
      </details>}
      {!selected.description && !selected.materialId && !selected.teacherNotes && <p className="muted">Mục này chỉ có tên.</p>}
    </Modal>}
  </div>;
}

function LessonTextDialog({ title, label, action, initial = "", placeholder, required, singleLine, readOnly, onClose, onSave }: {
  title: string;
  label: string;
  action: string;
  initial?: string;
  placeholder?: string;
  required?: boolean;
  singleLine?: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || readOnly || (required && !value.trim())) return;
    setBusy(true);
    setError("");
    try { await onSave(value.trim()); onClose(); }
    catch (error) { setError(lessonError(error)); }
    finally { setBusy(false); }
  }
  return <Modal title={title} onClose={() => !busy && onClose()}>
    <form className="form-stack lesson-dialog-form" onSubmit={submit}>
      <label>{label}
        {singleLine ? <input value={value} maxLength={160} required={required} readOnly={readOnly} onChange={event => setValue(event.target.value)} />
          : <textarea value={value} rows={5} required={required} readOnly={readOnly} placeholder={placeholder} onChange={event => setValue(event.target.value)} />}
      </label>
      {error && <p className="lesson-error" role="alert">{error}</p>}
      {!readOnly && <div className="lesson-dialog-actions">
        <button type="button" className="button ghost" disabled={busy} onClick={onClose}>Hủy</button>
        <button className="button primary" disabled={busy || (required && !value.trim())}>{busy ? "Đang lưu…" : action}</button>
      </div>}
    </form>
  </Modal>;
}
