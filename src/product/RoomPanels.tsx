import { useRef, useState } from "react";
import {
  Check,
  FileText,
  MessageSquare,
  Send,
  Sparkles,
  Upload,
} from "lucide-react";
import type { Evidence, Session, Submission } from "./model";
import { formatTime, uid } from "./model";
import { useStore, commitData } from "./store";
import { appendEvent, mockSuggestion } from "./adapters";
import { canStudentAct } from "./permissions";
import { Banner, Empty, fileToData, Modal, SectionHead, Status } from "./ui";
import { SourceViewer } from "./SourceViewer";

export function ChatPanel({
  session,
  actorId,
  teacher = false,
  token,
}: {
  session: Session;
  actorId: string;
  teacher?: boolean;
  token?: string;
}) {
  const { data, setData } = useStore();
  const [text, setText] = useState("");
  const messages = data.messages.filter((m) => m.sessionId === session.id);
  const enabled = teacher || !!session.tools?.chat;
  return (
    <div className="chat-panel">
      <SectionHead
        title="Chat trong buổi"
        meta="Tin nhắn hiển thị cho mọi người trong phòng."
      />
      <div className="chat-messages" aria-live="polite">
        {messages.length ? (
          messages.map((m) => (
            <div
              className={
                "chat-message " + (m.authorId === actorId ? "mine" : "")
              }
              key={m.id}
            >
              <small>
                {m.authorId === "teacher"
                  ? "Giáo viên"
                  : data.students.find((s) => s.id === m.authorId)?.name}{" "}
                · {formatTime(m.createdAt)}
              </small>
              <p>{m.text}</p>
            </div>
          ))
        ) : (
          <Empty
            icon={<MessageSquare size={20} />}
            title="Chưa có tin nhắn"
            description="Đặt câu hỏi hoặc chia sẻ ngắn tại đây."
          />
        )}
      </div>
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          const value = text.trim();
          setData((prev) => {
            if (
              !teacher &&
              !canStudentAct(prev, session.id, actorId, "chat", token)
            )
              return prev;
            return {
              ...prev,
              messages: [
                ...prev.messages,
                {
                  id: uid("msg"),
                  sessionId: session.id,
                  authorId: actorId,
                  text: value,
                  createdAt: new Date().toISOString(),
                },
              ],
            };
          });
          setText("");
        }}
      >
        <input
          aria-label="Tin nhắn trong buổi"
          placeholder={enabled ? "Nhập tin nhắn…" : "Chat đang tắt"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!enabled}
        />
        <button
          className="icon-button"
          aria-label="Gửi tin nhắn"
          disabled={!text.trim() || !enabled}
        >
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}
export function SubmissionPanel({
  session,
  studentId,
  token,
}: {
  session: Session;
  studentId: string;
  token: string;
}) {
  const { data, setData, toast } = useStore();
  const [title, setTitle] = useState("");
  const [answer, setAnswer] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState("");
  const [fail, setFail] = useState(false);
  const [activityId, setActivityId] = useState(
    session.currentActivityId || session.activities[0]?.id || "",
  );
  const student = data.students.find((s) => s.id === studentId)!;
  const submissions = data.submissions.filter(
    (s) => s.sessionId === session.id && s.studentId === studentId,
  );
  const validate = () => {
    if (!title.trim() || (!answer.trim() && !file)) {
      setError("Nhập tên bài và lời giải hoặc chọn tệp.");
      setStatus("error");
      return;
    }
    if (
      file &&
      (!["image/jpeg", "image/png", "application/pdf"].includes(file.type) ||
        file.size > 1_000_000)
    ) {
      setError("Chọn ảnh JPG/PNG hoặc PDF tối đa 1 MB cho bản demo.");
      setStatus("error");
      return;
    }
    setError("");
    setStatus("idle");
    setConfirm(true);
  };
  const submit = async () => {
    setStatus("uploading");
    setError("");
    try {
      await new Promise((r) => setTimeout(r, 400));
      if (fail) {
        setFail(false);
        throw new Error(
          "Kết nối tải bài bị gián đoạn. Bài chưa được gửi; hãy thử lại.",
        );
      }
      const fileData = file ? await fileToData(file) : undefined;
      const entry: Submission = {
        id: uid("sub"),
        sessionId: session.id,
        studentId,
        activityId: activityId || undefined,
        title: title.trim(),
        answer: answer.trim(),
        fileData,
        fileName: file?.name,
        status: "new",
        createdAt: new Date().toISOString(),
      };
      const saved = await commitData((prev) => {
        if (!canStudentAct(prev, session.id, studentId, "upload", token))
          return prev;
        return appendEvent(
          { ...prev, submissions: [entry, ...prev.submissions] },
          {
            sessionId: session.id,
            activityId: entry.activityId,
            kind: "submission",
            label: `${student.name} gửi ${entry.title}`,
            sourceId: entry.id,
            shared: true,
          },
        );
      });
      if (!saved)
        throw new Error(
          "Bài chưa được lưu. Kiểm tra quyền tham gia và bộ nhớ trình duyệt rồi thử lại.",
        );
      setConfirm(false);
      setTitle("");
      setAnswer("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setStatus("idle");
      toast("Đã gửi bài cho giáo viên.");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  };
  return (
    <div className="submission-panel">
      <SectionHead
        title="Gửi bài làm"
        meta="Kiểm tra người gửi và buổi học trước khi lưu."
      />
      {session.tools?.upload ? (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            validate();
          }}
        >
          <label>
            Tên bài
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Bài 2 · Tìm tham số"
              required
            />
          </label>
          <label>
            Gắn vào
            <select
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
            >
              <option value="">Toàn buổi</option>
              {session.activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lời giải
            <textarea
              rows={4}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Trình bày cách làm…"
            />
          </label>
          <label className="upload-field">
            <Upload size={20} />
            Chọn ảnh bài làm / PDF
            <input
              ref={fileInput}
              aria-label="Ảnh hoặc PDF bài làm"
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <small>{file?.name || "Tối đa 1 MB trên bản demo"}</small>
          </label>
          {error && !confirm && <Banner error>{error}</Banner>}
          <button className="button primary" disabled={status === "uploading"}>
            Kiểm tra và gửi
          </button>
          <details className="demo-controls">
            <summary>Tình huống demo</summary>
            <label>
              <input
                type="checkbox"
                checked={fail}
                onChange={(e) => setFail(e.target.checked)}
              />
              Mô phỏng tải lỗi một lần
            </label>
          </details>
        </form>
      ) : (
        <Banner>Giáo viên đang tắt công cụ gửi bài.</Banner>
      )}
      <div className="student-submissions">
        <h3>Bài đã gửi · {submissions.length}</h3>
        {submissions.length ? (
          submissions.map((s) => (
            <div className="submission-receipt" key={s.id}>
              <strong>{s.title}</strong>
              <small>
                {formatTime(s.createdAt)} ·{" "}
                {s.status === "reviewed"
                  ? "Đã có nhận xét"
                  : "Giáo viên chưa duyệt"}
              </small>
              {s.answer && <p>{s.answer}</p>}
              {s.finalFeedback && <Banner>{s.finalFeedback}</Banner>}
            </div>
          ))
        ) : (
          <p className="muted">Chưa gửi bài trong buổi này.</p>
        )}
      </div>
      {confirm && (
        <Modal
          title="Xác nhận bài gửi"
          onClose={() => status !== "uploading" && setConfirm(false)}
        >
          <div className="confirm-meta">
            <strong>{student.name}</strong>
            <p>{session.title}</p>
            <p>
              {session.activities.find((a) => a.id === activityId)?.title ||
                "Toàn buổi"}{" "}
              · {title}
            </p>
            <small>{file?.name || "Bài làm bằng văn bản"}</small>
          </div>
          {error && <Banner error>{error}</Banner>}
          <div className="modal-actions">
            <button
              className="button ghost"
              disabled={status === "uploading"}
              onClick={() => setConfirm(false)}
            >
              Quay lại
            </button>
            <button
              className="button primary"
              disabled={status === "uploading"}
              onClick={submit}
            >
              {status === "uploading"
                ? "Đang gửi…"
                : status === "error"
                  ? "Thử gửi lại"
                  : "Xác nhận gửi"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export function CopilotPanel({
  session,
  studentId,
}: {
  session: Session;
  studentId: string;
}) {
  const { data, setData, toast } = useStore();
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [reply, setReply] = useState("");
  const [context, setContext] = useState("");
  const [requestId, setRequestId] = useState("");
  const [last, setLast] = useState("");
  const [fail, setFail] = useState(false);
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(false);
  const activityId =
    session.currentActivityId || session.activities[0]?.id || "";
  const student = data.students.find((s) => s.id === studentId);
  const sources = data.claims.filter(
    (c) => c.studentId === studentId && c.status === "approved",
  );
  const evidence = data.evidence.filter(
    (e) =>
      e.studentId === studentId &&
      e.sessionId === session.id &&
      e.kind !== "Gợi ý giảng dạy",
  );
  const insufficient =
    evidence.length < 2 || evidence.every((e) => e.support !== "Độc lập");
  const ask = async (text: string) => {
    if (!text.trim()) return;
    setLast(text);
    setStatus("loading");
    setReply("");
    setEditing(false);
    try {
      const result = await mockSuggestion(
        data,
        studentId,
        activityId,
        text,
        fail,
      );
      setFail(false);
      const id = uid("ai");
      setReply(result.text);
      setContext(result.context);
      setRequestId(id);
      setStatus("ready");
      setData((prev) => ({
        ...prev,
        aiRequests: [
          ...prev.aiRequests,
          {
            id,
            sessionId: session.id,
            activityId,
            studentId,
            prompt: text,
            text: result.text,
            status: "ready",
            createdAt: new Date().toISOString(),
          },
        ],
      }));
    } catch (e) {
      setReply((e as Error).message);
      setStatus("error");
      setFail(false);
    }
  };
  const decide = (decision: "used" | "ignored" | "reported") => {
    setData((prev) => ({
      ...prev,
      aiRequests: prev.aiRequests.map((r) =>
        r.id === requestId ? { ...r, status: decision, text: reply } : r,
      ),
    }));
    toast(
      decision === "used"
        ? "Đã đánh dấu gợi ý được sử dụng. Chưa tạo kết luận học sinh."
        : decision === "ignored"
          ? "Đã bỏ qua gợi ý."
          : "Đã ghi phản hồi không phù hợp.",
    );
    setStatus("idle");
    setReply("");
  };
  return (
    <div className="copilot-workflow">
      <SectionHead
        title="Copilot"
        meta={`Riêng tư · ${student?.name || "Học sinh"} · gợi ý mô phỏng`}
      />
      <div className="ai-context">
        <strong>Bối cảnh đang dùng</strong>
        <p>{session.activities.find((a) => a.id === activityId)?.title}</p>
        <small>
          {sources.length} nhận định đã duyệt · {evidence.length} minh chứng
          buổi này
        </small>
      </div>
      {insufficient && (
        <Banner>
          Chưa đủ minh chứng độc lập. Hãy giao một câu kiểm tra trước khi kết
          luận về mức độ hiểu.
        </Banner>
      )}
      <div className="prompt-grid">
        {[
          "Câu hỏi dẫn dắt",
          "Giải thích khác",
          "Bài tương tự",
          "Điều chỉnh độ khó",
          "Kiểm tra độc lập",
        ].map((p) => (
          <button
            key={p}
            disabled={status === "loading"}
            onClick={() => ask(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          ask(prompt);
          setPrompt("");
        }}
      >
        <input
          aria-label="Yêu cầu Copilot"
          placeholder="Nêu tình huống đang gặp…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button
          className="icon-button"
          aria-label="Gửi yêu cầu Copilot"
          disabled={!prompt.trim() || status === "loading"}
        >
          <Send size={17} />
        </button>
      </form>
      <div className="ai-output" aria-live="polite">
        {status === "loading" ? (
          <div className="ai-loading">
            <Sparkles size={20} />
            <p>Đang xem bối cảnh hoạt động…</p>
            <small>Bạn vẫn có thể ghi chú và tiếp tục dạy.</small>
          </div>
        ) : status === "error" ? (
          <>
            <Banner error>{reply}</Banner>
            <button className="button ghost small" onClick={() => ask(last)}>
              Thử lại
            </button>
          </>
        ) : status === "ready" ? (
          <>
            <Status tone="violet">Gợi ý mẫu · gia sư quyết định</Status>
            {editing ? (
              <textarea
                aria-label="Sửa gợi ý AI"
                rows={6}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
            ) : (
              <p>{reply}</p>
            )}
            <small>Dựa trên: {context}</small>
            <div className="row-actions">
              <button
                className="button primary small"
                disabled={!reply.trim()}
                onClick={() => decide("used")}
              >
                Dùng
              </button>
              <button
                className="button ghost small"
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Xong" : "Sửa"}
              </button>
              <button
                className="button ghost small"
                onClick={() => decide("ignored")}
              >
                Bỏ qua
              </button>
              <button
                className="text-button"
                onClick={() => decide("reported")}
              >
                Không phù hợp
              </button>
            </div>
          </>
        ) : (
          <p className="muted">
            Chọn thao tác hoặc đặt câu hỏi theo hoạt động hiện tại.
          </p>
        )}
      </div>
      <details className="demo-controls">
        <summary>Tình huống demo</summary>
        <label>
          <input
            type="checkbox"
            checked={fail}
            onChange={(e) => setFail(e.target.checked)}
          />
          Mô phỏng AI lỗi lần tới
        </label>
      </details>
      <button className="text-button" onClick={() => setHistory(!history)}>
        Lịch sử gợi ý (
        {
          data.aiRequests.filter(
            (r) => r.sessionId === session.id && r.studentId === studentId,
          ).length
        }
        )
      </button>
      {history &&
        data.aiRequests
          .filter(
            (r) => r.sessionId === session.id && r.studentId === studentId,
          )
          .map((r) => (
            <div className="ai-history" key={r.id}>
              <strong>{r.prompt}</strong>
              <p>{r.text}</p>
              <Status>
                {
                  {
                    ready: "Đã xem",
                    used: "Đã dùng",
                    ignored: "Bỏ qua",
                    reported: "Không phù hợp",
                  }[r.status]
                }
              </Status>
            </div>
          ))}
    </div>
  );
}
export function CapturePanel({
  session,
  studentId,
}: {
  session: Session;
  studentId: string;
}) {
  const { data, setData, toast } = useStore();
  const [note, setNote] = useState("");
  const [support, setSupport] = useState<Evidence["support"]>("Chưa rõ");
  const [whole, setWhole] = useState(false);
  const [source, setSource] = useState("");
  const evidence = data.evidence
    .filter((e) => e.sessionId === session.id && e.studentId === studentId)
    .slice()
    .reverse();
  return (
    <div>
      <SectionHead
        title="Minh chứng & ghi chú"
        meta="Riêng tư · gắn vào đúng học sinh"
      />
      <label>
        Quan sát trong giờ
        <textarea
          aria-label="Ghi chú riêng của giáo viên"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Học sinh đã thử gì, vướng ở đâu?"
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
      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={whole}
          onChange={(e) => setWhole(e.target.checked)}
        />
        Gắn vào toàn buổi
      </label>
      <button
        className="button primary"
        disabled={!note.trim()}
        onClick={async () => {
          const saved = await commitData((prev) => ({
            ...prev,
            evidence: [
              ...prev.evidence,
              {
                id: uid("ev"),
                sessionId: session.id,
                studentId,
                activityId: whole
                  ? undefined
                  : session.currentActivityId || session.activities[0]?.id,
                kind: "Ghi chú",
                title: "Quan sát trong giờ",
                detail: note.trim(),
                support,
                createdAt: new Date().toISOString(),
              },
            ],
          }));
          if (saved) {
            setNote("");
            toast("Đã lưu ghi chú riêng.");
          }
        }}
      >
        <Check size={16} />
        Lưu minh chứng
      </button>
      <div className="room-evidence-list">
        {evidence.length ? (
          evidence.map((e) => (
            <button
              className="evidence-link"
              key={e.id}
              onClick={() => setSource(e.id)}
            >
              <FileText size={17} />
              <span>
                <strong>{e.title}</strong>
                <small>
                  {e.support || e.kind} · {formatTime(e.createdAt)}
                </small>
              </span>
            </button>
          ))
        ) : (
          <p className="muted">Chưa có minh chứng cho học sinh này.</p>
        )}
      </div>
      {source && (
        <SourceViewer evidenceId={source} onClose={() => setSource("")} />
      )}
    </div>
  );
}
