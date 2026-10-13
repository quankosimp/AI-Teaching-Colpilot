import { useState } from "react";
import { ChevronLeft, ChevronRight, MessageSquarePlus } from "lucide-react";
import type { Material, Session } from "./model";
import { uid } from "./model";
import { useStore } from "./store";
import { appendEvent } from "./adapters";
import { Banner, Empty, Modal } from "./ui";
export function DocumentStage({
  session,
  teacher = false,
}: {
  session: Session;
  teacher?: boolean;
}) {
  const { data, setData, toast } = useStore();
  const activity =
    session.activities.find((a) => a.id === session.currentActivityId) ||
    session.activities[0];
  const material = data.materials.find((m) => m.id === activity?.materialId);
  const [annotating, setAnnotating] = useState(false);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState("");
  const [opened, setOpened] = useState("");
  if (!material || !activity)
    return (
      <Empty
        icon={<MessageSquarePlus size={24} />}
        title="Chưa gắn đề bài"
        description={
          teacher
            ? "Gắn học liệu vào hoạt động trong phần Soạn buổi học."
            : "Giáo viên sẽ mở đề bài cho bạn tại đây."
        }
      />
    );
  const pages = material.pages?.length
    ? material.pages
    : [material.description];
  const page = Math.min(session.materialPage || 0, pages.length - 1);
  const annotations = data.annotations.filter(
    (a) =>
      a.sessionId === session.id &&
      a.activityId === activity.id &&
      a.materialId === material.id &&
      a.page === page,
  );
  const change = (next: number) =>
    setData((prev) =>
      appendEvent(
        {
          ...prev,
          sessions: prev.sessions.map((s) =>
            s.id === session.id ? { ...s, materialPage: next } : s,
          ),
        },
        {
          sessionId: session.id,
          activityId: activity.id,
          kind: "activity",
          label: `Mở ${material.title} · trang ${next + 1}`,
          materialId: material.id,
          page: next,
          shared: true,
        },
      ),
    );
  const save = () => {
    if (!pin || !text.trim()) return;
    const annotation = {
      id: uid("anno"),
      sessionId: session.id,
      activityId: activity.id,
      materialId: material.id,
      page,
      x: pin.x,
      y: pin.y,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    setData((prev) =>
      appendEvent(
        { ...prev, annotations: [...prev.annotations, annotation] },
        {
          sessionId: session.id,
          activityId: activity.id,
          kind: "annotation",
          label: annotation.text,
          materialId: material.id,
          page,
          sourceId: annotation.id,
          shared: true,
        },
      ),
    );
    setPin(null);
    setText("");
    setAnnotating(false);
    toast("Đã lưu chú thích, giữ nguyên đề gốc.");
  };
  return (
    <div className="document-stage">
      <div className="board-toolbar">
        <strong>{material.title}</strong>
        <div className="row-actions">
          <button
            className="icon-button"
            aria-label="Trang đề trước"
            disabled={!teacher || page === 0}
            onClick={() => change(page - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <span className="muted">
            {page + 1}/{pages.length}
          </span>
          <button
            className="icon-button"
            aria-label="Trang đề sau"
            disabled={!teacher || page === pages.length - 1}
            onClick={() => change(page + 1)}
          >
            <ChevronRight size={17} />
          </button>
          {teacher && (
            <button
              className={"button ghost small " + (annotating ? "selected" : "")}
              onClick={() => setAnnotating(!annotating)}
            >
              <MessageSquarePlus size={16} />
              {annotating ? "Hủy chọn vùng" : "Chú thích"}
            </button>
          )}
        </div>
      </div>
      {annotating && <Banner>Chọn vị trí trên đề để thêm chú thích.</Banner>}
      <div
        className={"document-sheet " + (annotating ? "pin-mode" : "")}
        onClick={(e) => {
          if (!annotating) return;
          const rect = e.currentTarget.getBoundingClientRect();
          setPin({
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100,
          });
        }}
      >
        <MaterialContent material={material} page={page} />
        {annotating && material.fileData && (
          <div className="annotation-overlay" />
        )}
        {annotations.map((a, i) => (
          <button
            key={a.id}
            className="annotation-pin"
            style={{ left: `${a.x}%`, top: `${a.y}%` }}
            aria-label={"Chú thích: " + a.text}
            onClick={(e) => {
              e.stopPropagation();
              setOpened(a.id);
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {annotations.length > 0 && (
        <div className="annotation-list">
          {annotations.map((a, i) => (
            <button key={a.id} onClick={() => setOpened(a.id)}>
              <span>{i + 1}</span>
              {a.text}
            </button>
          ))}
        </div>
      )}
      {pin && (
        <Modal title="Chú thích trên đề gốc" onClose={() => setPin(null)}>
          <label>
            Nội dung
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          </label>
          <div className="modal-actions">
            <button className="button ghost" onClick={() => setPin(null)}>
              Hủy
            </button>
            <button
              className="button primary"
              disabled={!text.trim()}
              onClick={save}
            >
              Lưu chú thích
            </button>
          </div>
        </Modal>
      )}
      {opened && (
        <Modal title="Chú thích của giáo viên" onClose={() => setOpened("")}>
          <p>{data.annotations.find((a) => a.id === opened)?.text}</p>
          <small>
            Trang {page + 1} · {activity.title} · bản gốc được giữ nguyên
          </small>
        </Modal>
      )}
    </div>
  );
}
export function MaterialContent({
  material,
  page = 0,
}: {
  material: Material;
  page?: number;
}) {
  if (material.fileData)
    return material.fileData.startsWith("data:image/") ? (
      <img
        className="material-image"
        src={material.fileData}
        alt={material.title}
      />
    ) : (
      <iframe
        className="pdf-frame"
        src={material.fileData}
        title={material.title}
      />
    );
  return (
    <pre className="lesson-content">
      {material.pages?.[page] || material.description}
    </pre>
  );
}
