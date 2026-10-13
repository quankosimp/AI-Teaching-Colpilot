import { useState } from "react";
import type { Evidence } from "./model";
import { formatTime } from "./model";
import { useStore } from "./store";
import { appendEvent } from "./adapters";
import { BoardPreview } from "./Board";
import { MaterialContent } from "./DocumentStage";
import { Banner, Modal, Status } from "./ui";
export function SourceViewer({
  evidenceId,
  onClose,
}: {
  evidenceId: string;
  onClose: () => void;
}) {
  const { data, setData, toast } = useStore();
  const item = data.evidence.find((e) => e.id === evidenceId);
  const [detail, setDetail] = useState(item?.detail || "");
  const [support, setSupport] = useState<Evidence["support"]>(
    item?.support || "Chưa rõ",
  );
  if (!item)
    return (
      <Modal title="Nguồn không còn tồn tại" onClose={onClose}>
        <Banner error>
          Minh chứng này đã bị xóa hoặc không còn truy cập được.
        </Banner>
      </Modal>
    );
  const submission = data.submissions.find((s) => s.id === item.submissionId);
  const attempt = data.attempts.find((a) => a.id === item.sourceId);
  const response = data.responses.find((r) => r.id === item.sourceId);
  const annotation = data.annotations.find((a) => a.id === item.sourceId);
  const material = data.materials.find((m) => m.id === annotation?.materialId);
  const student = data.students.find((s) => s.id === item.studentId);
  const session = data.sessions.find((s) => s.id === item.sessionId);
  return (
    <Modal title={item.title} onClose={onClose} wide>
      <div className="source-meta">
        <Status tone="violet">{item.kind}</Status>
        <strong>{student?.name}</strong>
        <span>{session?.title}</span>
        <small>
          {formatTime(item.createdAt)} ·{" "}
          {item.activityId
            ? session?.activities.find((a) => a.id === item.activityId)?.title
            : "Toàn buổi"}
        </small>
      </div>
      {submission && (
        <div className="source-original">
          <h3>{submission.title} · bài gốc</h3>
          <p>{submission.answer}</p>
          {submission.fileData &&
            (submission.fileData.startsWith("data:image/") ? (
              <img src={submission.fileData} alt={submission.title} />
            ) : (
              <iframe
                className="pdf-frame"
                title={submission.title}
                src={submission.fileData}
              />
            ))}
        </div>
      )}
      {attempt && (
        <>
          <h3>Lần thử đã lưu · {formatTime(attempt.createdAt)}</h3>
          <BoardPreview strokes={attempt.strokes} text={attempt.text} />
        </>
      )}
      {response && (
        <div className="source-original">
          <h3>
            {data.checks.find((c) => c.id === response.checkId)?.question}
          </h3>
          <p>{response.answer}</p>
          <Status>{response.support}</Status>
        </div>
      )}
      {annotation && material && (
        <>
          <MaterialContent material={material} page={annotation.page} />
          <Banner>
            Chú thích: {annotation.text} · trang {annotation.page + 1}
          </Banner>
        </>
      )}
      {!submission && !attempt && !response && !annotation && (
        <Banner>
          Ghi chú trực tiếp của gia sư · không suy ra kết luận tự động.
        </Banner>
      )}
      <label>
        Ghi nhận của gia sư
        <textarea
          rows={3}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
      </label>
      <label>
        Mức hỗ trợ
        <select
          value={support}
          onChange={(e) => setSupport(e.target.value as Evidence["support"])}
        >
          {["Độc lập", "Có gợi ý", "Được hướng dẫn", "Chưa rõ"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <div className="modal-actions">
        <button className="button ghost" onClick={onClose}>
          Đóng
        </button>
        <button
          className="button primary"
          disabled={!detail.trim()}
          onClick={() => {
            setData((prev) =>
              appendEvent(
                {
                  ...prev,
                  evidence: prev.evidence.map((e) =>
                    e.id === item.id
                      ? {
                          ...e,
                          detail: detail.trim(),
                          support,
                          updatedAt: new Date().toISOString(),
                        }
                      : e,
                  ),
                },
                {
                  sessionId: item.sessionId,
                  activityId: item.activityId,
                  kind: "member",
                  label: "Gia sư sửa ghi nhận/mức hỗ trợ",
                  sourceId: item.id,
                  shared: false,
                },
              ),
            );
            toast("Đã cập nhật minh chứng, giữ nguyên bài gốc.");
            onClose();
          }}
        >
          Lưu điều chỉnh
        </button>
      </div>
    </Modal>
  );
}
