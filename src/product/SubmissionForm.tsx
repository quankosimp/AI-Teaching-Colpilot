import { useRef, useState, type FormEvent } from "react";
import { MAX_UPLOAD_BYTES } from "../../contracts/api";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Pending = {
  key: string;
  payload: {
    title: string;
    answer: string;
    activityId?: string;
    uploadId?: string;
  };
};
export function SubmissionForm({
  sessionId,
  activityId,
  enabled,
  request,
  onSubmitted,
}: {
  sessionId: string;
  activityId: string | null;
  enabled: boolean;
  request: Request;
  onSubmitted: () => Promise<unknown>;
}) {
  const [answer, setAnswer] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inputVersion, setInputVersion] = useState(0);
  const pending = useRef<Pending | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!pending.current) {
        if (!answer.trim() && !file)
          throw new Error("Hãy nhập bài làm hoặc chọn tệp.");
        let uploadId: string | undefined;
        if (file) {
          if (
            !["application/pdf", "image/jpeg", "image/png"].includes(
              file.type,
            ) ||
            file.size < 1 ||
            file.size > MAX_UPLOAD_BYTES
          )
            throw new Error(
              "Chọn PDF, JPG hoặc PNG có kích thước tối đa 10 MiB.",
            );
          const bytes = await file.arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          const sha256 = Array.from(new Uint8Array(digest), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join("");
          const intent = await request<{ uploadId: string; uploadUrl: string }>(
            `/sessions/${sessionId}/submissions/upload-intent`,
            {
              method: "POST",
              body: JSON.stringify({
                fileName: file.name,
                mimeType: file.type,
                sizeBytes: file.size,
                sha256,
              }),
            },
          );
          const upload = await fetch(intent.uploadUrl, {
            method: "PUT",
            body: file,
          });
          if (!upload.ok) throw new Error("Không tải được tệp. Hãy thử lại.");
          uploadId = intent.uploadId;
        }
        pending.current = {
          key: crypto.randomUUID(),
          payload: {
            title: file?.name || "Bài làm",
            answer,
            ...(activityId ? { activityId } : {}),
            ...(uploadId ? { uploadId } : {}),
          },
        };
      }
      await request(`/sessions/${sessionId}/submissions`, {
        method: "POST",
        headers: { "Idempotency-Key": pending.current.key },
        body: JSON.stringify(pending.current.payload),
      });
      pending.current = null;
      setAnswer("");
      setFile(null);
      setInputVersion((n) => n + 1);
      await onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể nộp bài");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="submission-form-card" onSubmit={submit}>
      <label>
        Bài làm
        <textarea
          value={answer}
          placeholder="Nhập lời giải, các bước làm hoặc câu trả lời của bạn…"
          disabled={busy || !!pending.current}
          onChange={(e) => setAnswer(e.target.value)}
        />
      </label>
      <label className="upload-field">
        Ảnh hoặc PDF
        <input
          key={inputVersion}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          disabled={busy || !!pending.current}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {pending.current && (
        <p>Bài đang chờ xác nhận. Gửi lại sẽ dùng cùng mã yêu cầu.</p>
      )}
      <button className="button primary small" disabled={!enabled || busy}>
        {busy ? "Đang nộp…" : "Nộp bài"}
      </button>
    </form>
  );
}
