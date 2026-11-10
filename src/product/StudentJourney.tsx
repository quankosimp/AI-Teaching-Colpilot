import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  History,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Status } from "./ui";
import { api, ApiError } from "./onlineApi";
import {
  lessonHeading,
  lessonToday,
  lessonWhen,
  type LessonClaim,
  type LessonSession,
} from "./lessonPlanning";

/** Minimal student shape the learning-path tab needs (compatible with OnlineApp's Student). */
export type JourneyStudent = {
  id: string;
  name: string;
  grade: string;
  subject: string;
  goal: string;
  strengths: string[];
  gaps: string[];
  status: "active" | "archived";
};

/** Sessions this student actually attended/was a member of, newest first. */
function studentSessions(sessions: LessonSession[], studentId: string) {
  return sessions
    .filter((s) =>
      s.RoomMember_sessionId_items.some((m) => m.studentId === studentId),
    )
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}

const DONE_STATUSES = ["ended", "reviewed"];

export function StudentJourney({
  student,
  sessions,
  students,
  studentHistory,
  onOpenSession,
  onOpenNext,
  onSessionUpsert,
}: {
  student: JourneyStudent;
  sessions: LessonSession[];
  students: { id: string; name: string }[];
  studentHistory: LessonClaim[];
  onOpenSession: (id: string) => void;
  onOpenNext: () => void;
  onSessionUpsert: (session: LessonSession) => void;
}) {
  const mine = useMemo(
    () => studentSessions(sessions, student.id),
    [sessions, student.id],
  );
  const doneCount = mine.filter((s) => DONE_STATUSES.includes(s.status)).length;
  const today = lessonToday();
  // A live session, shown separately (does not block composing the next session).
  const live = mine.find((s) => s.status === "live");
  // The earliest upcoming draft/scheduled session AI can draft content into.
  const composeTarget = useMemo(
    () =>
      mine
        .filter(
          (s) =>
            (s.status === "draft" || s.status === "scheduled") && s.date >= today,
        )
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0] ??
      null,
    [mine, today],
  );
  // Most recent finished session — the base for creating a follow-up.
  const latestDone = mine.find((s) => DONE_STATUSES.includes(s.status));

  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [composing, setComposing] = useState(false);
  const [aiDraft, setAiDraft] = useState<{ sessionId: string; text: string } | null>(null);
  const [error, setError] = useState("");

  async function generateSummary(session: LessonSession) {
    setBusyId(session.id);
    setError("");
    try {
      const { result } = await api<{
        result: { id: string; sessionId: string; summary: string };
      }>(`/sessions/${session.id}/ai/summary`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      onSessionUpsert({ ...session, summary: result.summary });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.failure.message
          : "Không thể tạo tổng kết. Vui lòng thử lại.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function createNextSession() {
    if (!latestDone) return;
    setCreating(true);
    setError("");
    try {
      const { session } = await api<{ session: LessonSession }>(
        `/sessions/${latestDone.id}/next-session`,
        { method: "POST", body: JSON.stringify({}) },
      );
      // Keep the teacher on the path; the new draft becomes the AI-compose target.
      onSessionUpsert(session);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.failure.message
          : "Không thể tạo buổi tiếp theo. Vui lòng thử lại.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function composeNext(target: LessonSession) {
    setComposing(true);
    setError("");
    try {
      const { suggestion } = await api<{ suggestion: { id: string; text: string } }>(
        `/sessions/${target.id}/ai/plan-suggestions`,
        { method: "POST", body: JSON.stringify({ studentId: student.id }) },
      );
      setAiDraft({ sessionId: target.id, text: suggestion.text });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.failure.message
          : "Không thể soạn nội dung bằng AI. Vui lòng thử lại.",
      );
    } finally {
      setComposing(false);
    }
  }

  return (
    <div className="student-journey">
      {/* Progress ribbon — real, derivable numbers only */}
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Tiến độ tích luỹ</h2>
            <p>Lộ trình học của {student.name} qua từng buổi.</p>
          </div>
          <History size={20} />
        </div>
        <div className="profile-metrics journey-metrics">
          <div className="metric-card">
            <span>Buổi đã học</span>
            <strong>{doneCount}</strong>
          </div>
          <div className="metric-card">
            <span>Tổng số buổi</span>
            <strong>{mine.length}</strong>
          </div>
          <div className="metric-card">
            <span>Nhận định đã duyệt</span>
            <strong>{studentHistory.length}</strong>
          </div>
          <div className="metric-card">
            <span>Điểm mạnh ghi nhận</span>
            <strong>{student.strengths.length}</strong>
          </div>
        </div>
      </section>

      {/* Next session — reuse existing backend flows */}
      <section className="card journey-next">
        <div className="section-head">
          <div>
            <h2>Soạn buổi dạy tiếp theo</h2>
            <p>
              Tạo buổi kế tiếp rồi để AI soạn nội dung dựa trên lộ trình và nhận
              định đã duyệt của học sinh.
            </p>
          </div>
          <Sparkles size={20} />
        </div>
        {live && (
          <div className="journey-next-row journey-next-live">
            <div>
              <strong>Buổi đang học: {lessonHeading(live, students)}</strong>
              <p className="muted">{lessonWhen(live)}</p>
            </div>
            <button type="button" className="button" onClick={onOpenNext}>
              Mở buổi <ArrowRight size={14} />
            </button>
          </div>
        )}
        {composeTarget ? (
          <>
            <div className="journey-next-row">
              <div>
                <strong>Buổi tiếp theo: {composeTarget.title}</strong>
                <p className="muted">{lessonWhen(composeTarget)}</p>
              </div>
              <div className="journey-next-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => onOpenSession(composeTarget.id)}
                >
                  Mở buổi
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={composing}
                  onClick={() => composeNext(composeTarget)}
                >
                  {composing ? (
                    "Đang soạn…"
                  ) : (
                    <>
                      <Sparkles size={14} /> Soạn nội dung bằng AI
                    </>
                  )}
                </button>
              </div>
            </div>
            {aiDraft?.sessionId === composeTarget.id && (
              <div className="journey-ai-draft">
                <div className="journey-ai-draft-head">
                  <Sparkles size={15} /> Nội dung AI đề xuất cho buổi tới
                </div>
                <p>{aiDraft.text}</p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onOpenSession(composeTarget.id)}
                >
                  <ArrowRight size={14} /> Mở buổi để thêm vào giáo án
                </button>
              </div>
            )}
          </>
        ) : latestDone ? (
          <div className="journey-next-row">
            <div>
              <strong>Chưa có buổi sắp tới</strong>
              <p className="muted">
                Tạo buổi tiếp theo nối tiếp từ “{latestDone.title}”.
              </p>
            </div>
            <button
              type="button"
              className="button primary"
              disabled={creating}
              onClick={createNextSession}
            >
              {creating ? "Đang tạo…" : "Tạo buổi tiếp theo"}
              {!creating && <ArrowRight size={14} />}
            </button>
          </div>
        ) : (
          <p className="muted">
            Chưa có buổi đã kết thúc để làm cơ sở cho buổi tiếp theo.
          </p>
        )}
      </section>

      {error && (
        <div className="journey-error" role="alert">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Timeline with per-session AI summaries */}
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Lịch sử buổi học</h2>
            <p>Tổng kết từng buổi do AI tạo từ nhận định đã duyệt.</p>
          </div>
          <span className="muted">{doneCount} buổi đã diễn ra</span>
        </div>
        {mine.length ? (
          <ol className="journey-timeline">
            {mine.map((s, index) => {
              const n = mine.length - index;
              const done = DONE_STATUSES.includes(s.status);
              return (
                <li className="journey-item" key={s.id}>
                  <span
                    className={`journey-node${done ? " is-done" : ""}`}
                    aria-hidden
                  >
                    {n}
                  </span>
                  <div className="journey-card">
                    <div className="journey-card-head">
                      <span className="muted">
                        {s.date} · {s.time}
                      </span>
                      <Status
                        tone={
                          s.status === "reviewed"
                            ? "green"
                            : s.status === "live"
                              ? "amber"
                              : "neutral"
                        }
                      >
                        {s.status === "reviewed"
                          ? "Đã duyệt nhận định"
                          : s.status === "live"
                            ? "Đang diễn ra"
                            : done
                              ? "Đã kết thúc"
                              : "Sắp diễn ra"}
                      </Status>
                    </div>
                    <h3>{s.title}</h3>
                    {s.goal && <p className="journey-goal">{s.goal}</p>}
                    {s.summary ? (
                      <p className="journey-summary">{s.summary}</p>
                    ) : (
                      <p className="journey-summary is-empty">
                        Chưa có tổng kết cho buổi này.
                      </p>
                    )}
                    <div className="journey-card-foot">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => onOpenSession(s.id)}
                      >
                        <FileText size={14} /> Xem lại buổi học
                      </button>
                      {done && (
                        <button
                          type="button"
                          className="text-button"
                          disabled={busyId === s.id}
                          onClick={() => generateSummary(s)}
                        >
                          {busyId === s.id ? (
                            <>
                              <Clock size={14} /> Đang tổng kết…
                            </>
                          ) : s.summary ? (
                            <>
                              <RefreshCw size={14} /> Tạo lại tổng kết
                            </>
                          ) : (
                            <>
                              <Sparkles size={14} /> Tổng kết bằng AI
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="restored-empty">
            <CheckCircle2 size={28} />
            <p>Học sinh chưa có buổi học nào.</p>
          </div>
        )}
      </section>
    </div>
  );
}
