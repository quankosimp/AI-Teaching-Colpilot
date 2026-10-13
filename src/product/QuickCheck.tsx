import { useState } from "react";
import { ClipboardCheck, Plus, Send } from "lucide-react";
import type { Evidence, Session } from "./model";
import { uid } from "./model";
import { useStore, commitData } from "./store";
import { appendEvent } from "./adapters";
import { canStudentAct } from "./permissions";
import { Banner, Empty, Modal, SectionHead, Status } from "./ui";
export function QuickCheckPanel({
  session,
  teacher = false,
  studentId = "",
  token,
}: {
  session: Session;
  teacher?: boolean;
  studentId?: string;
  token?: string;
}) {
  const { data, setData, toast } = useStore();
  const activityId = session.currentActivityId || session.activities[0]?.id;
  const check = [...data.checks]
    .reverse()
    .find((c) => c.sessionId === session.id && c.activityId === activityId);
  const [create, setCreate] = useState(false);
  const [question, setQuestion] = useState(
    "Cho x² − 4x + 3 = 0. Tính tổng bình phương hai nghiệm và giải thích cách làm.",
  );
  const [answer, setAnswer] = useState("");
  const responses = data.responses.filter(
    (r) => r.checkId === check?.id && (teacher || r.studentId === studentId),
  );
  const mine = responses.find((r) => r.studentId === studentId);
  const assign = () => {
    if (!question.trim() || !activityId) return;
    const entry = {
      id: uid("check"),
      sessionId: session.id,
      activityId,
      question: question.trim(),
      status: "open" as const,
      createdAt: new Date().toISOString(),
    };
    setData((prev) =>
      appendEvent(
        {
          ...prev,
          checks: [
            ...prev.checks.map((c) =>
              c.sessionId === session.id
                ? { ...c, status: "closed" as const }
                : c,
            ),
            entry,
          ],
          sessions: prev.sessions.map((s) =>
            s.id === session.id ? { ...s, sharedView: "check" } : s,
          ),
        },
        {
          sessionId: session.id,
          activityId,
          kind: "check",
          label: "Giao câu kiểm tra độc lập",
          sourceId: entry.id,
          shared: true,
        },
      ),
    );
    setCreate(false);
    toast("Đã giao câu hỏi cho học sinh.");
  };
  const submit = async () => {
    if (!check || !answer.trim()) return;
    const saved = await commitData((prev) => {
      if (
        !canStudentAct(prev, session.id, studentId, "check", token) ||
        prev.checks.find((c) => c.id === check.id)?.status !== "open" ||
        prev.responses.some(
          (r) => r.checkId === check.id && r.studentId === studentId,
        )
      )
        return prev;
      return appendEvent(
        {
          ...prev,
          responses: [
            ...prev.responses,
            {
              id: uid("response"),
              checkId: check.id,
              studentId,
              answer: answer.trim(),
              support: "Độc lập",
              createdAt: new Date().toISOString(),
            },
          ],
        },
        {
          sessionId: session.id,
          activityId,
          kind: "check",
          label: `${data.students.find((s) => s.id === studentId)?.name} đã trả lời`,
          sourceId: check.id,
          shared: true,
        },
      );
    });
    if (!saved) {
      toast(
        "Câu trả lời chưa được lưu. Kiểm tra quyền tham gia và thử lại.",
        "error",
      );
      return;
    }
    setAnswer("");
    toast("Đã gửi câu trả lời cho giáo viên.");
  };
  return (
    <div className="check-panel">
      <SectionHead
        title="Kiểm tra độc lập"
        meta="Một câu ngắn để quan sát cách học sinh tự làm."
        action={
          teacher ? (
            <button
              className="button ghost small"
              onClick={() => setCreate(true)}
            >
              <Plus size={16} />
              Giao câu mới
            </button>
          ) : undefined
        }
      />
      {check ? (
        <>
          <Status tone={check.status === "open" ? "green" : "neutral"}>
            {check.status === "open" ? "Đang nhận bài" : "Đã đóng"}
          </Status>
          <div className="check-question">{check.question}</div>
          {teacher ? (
            <>
              <button
                className="text-button"
                onClick={() =>
                  setData((prev) => ({
                    ...prev,
                    checks: prev.checks.map((c) =>
                      c.id === check.id
                        ? {
                            ...c,
                            status: c.status === "open" ? "closed" : "open",
                          }
                        : c,
                    ),
                  }))
                }
              >
                {check.status === "open"
                  ? "Dừng nhận câu trả lời"
                  : "Mở lại câu hỏi"}
              </button>
              {responses.length ? (
                responses.map((r) => (
                  <ResponseReview
                    key={r.id}
                    responseId={r.id}
                    session={session}
                  />
                ))
              ) : (
                <Banner>
                  Chưa có câu trả lời. Học sinh làm bài tại tab Kiểm tra.
                </Banner>
              )}
            </>
          ) : mine ? (
            <div className="submitted-answer">
              <h3>Câu trả lời của bạn</h3>
              <p>{mine.answer}</p>
              <Status tone="green">Đã gửi</Status>
              {mine.feedback && <Banner>Giáo viên: {mine.feedback}</Banner>}
            </div>
          ) : (
            <>
              <label>
                Câu trả lời của bạn
                <textarea
                  rows={5}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={check.status === "closed" || !session.tools?.check}
                  placeholder="Trình bày cách làm và điều kiện áp dụng…"
                />
              </label>
              <button
                className="button primary"
                onClick={submit}
                disabled={
                  !answer.trim() ||
                  check.status === "closed" ||
                  !session.tools?.check
                }
              >
                <Send size={16} />
                Gửi câu trả lời
              </button>
            </>
          )}
        </>
      ) : (
        <Empty
          icon={<ClipboardCheck size={24} />}
          title="Chưa có câu kiểm tra"
          description={
            teacher
              ? "Giao một câu mới để quan sát cách học sinh tự làm."
              : "Giáo viên sẽ giao câu hỏi tại đây."
          }
        />
      )}{" "}
      {create && (
        <Modal
          title="Giao câu kiểm tra độc lập"
          onClose={() => setCreate(false)}
        >
          <label>
            Câu hỏi
            <textarea
              rows={5}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button className="button ghost" onClick={() => setCreate(false)}>
              Hủy
            </button>
            <button
              className="button primary"
              disabled={!question.trim()}
              onClick={assign}
            >
              Giao câu hỏi
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function ResponseReview({
  responseId,
  session,
}: {
  responseId: string;
  session: Session;
}) {
  const { data, setData, toast } = useStore();
  const response = data.responses.find((r) => r.id === responseId)!;
  const check = data.checks.find((c) => c.id === response.checkId)!;
  const [feedback, setFeedback] = useState(response.feedback || "");
  const [support, setSupport] = useState<Evidence["support"]>(response.support);
  return (
    <div className="response-review">
      <h3>{data.students.find((s) => s.id === response.studentId)?.name}</h3>
      <p>{response.answer}</p>
      <label>
        Mức hỗ trợ
        <select
          value={support}
          onChange={(e) => setSupport(e.target.value as Evidence["support"])}
        >
          {["Độc lập", "Có gợi ý", "Được hướng dẫn", "Chưa rõ"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Phản hồi
        <textarea
          rows={2}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </label>
      <button
        className="button ghost small"
        disabled={!feedback.trim()}
        onClick={() => {
          setData((prev) => {
            const ev = prev.evidence.find((e) => e.sourceId === responseId);
            const entry: Evidence = {
              id: ev?.id || uid("ev"),
              studentId: response.studentId,
              sessionId: session.id,
              activityId: check.activityId,
              kind: "Kiểm tra độc lập",
              title: "Kết quả câu kiểm tra",
              detail: feedback.trim(),
              support,
              sourceId: responseId,
              createdAt: ev?.createdAt || new Date().toISOString(),
            };
            return {
              ...prev,
              responses: prev.responses.map((r) =>
                r.id === responseId
                  ? { ...r, feedback: feedback.trim(), support }
                  : r,
              ),
              evidence: [
                ...prev.evidence.filter((e) => e.id !== entry.id),
                entry,
              ],
            };
          });
          toast("Đã gửi phản hồi và lưu minh chứng.");
        }}
      >
        Lưu phản hồi & minh chứng
      </button>
    </div>
  );
}
