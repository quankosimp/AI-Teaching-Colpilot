import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { Status } from "./ui";
import { statusLabel } from "./statusLabels";

type Student = { id: string; name: string; status: string; grade: string };
type Session = {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  status: string;
  Activity_sessionId_items: unknown[];
  RoomMember_sessionId_items: { studentId: string }[];
};
export type RecentEvidence = {
  id: string;
  title: string;
  detail: string;
  studentId: string;
  createdAt: string;
};
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
export function OnlineOverview({
  students,
  materialsCount,
  sessions,
  evidence,
  evidenceError,
  onPlan,
  onMaterials,
  onStudents,
  onSession,
  onEvidence,
}: {
  students: Student[];
  materialsCount: number;
  sessions: Session[];
  evidence: RecentEvidence[];
  evidenceError?: string;
  onPlan: () => void;
  onMaterials: () => void;
  onStudents: () => void;
  onSession: (id: string, view?: "teach" | "grading" | "summary") => void;
  onEvidence: (id: string) => void;
}) {
  const unfinished = sessions.filter(
    (session) => !["ended", "reviewed"].includes(session.status),
  );
  const pending = sessions.filter((session) => session.status === "ended");
  const unplanned = sessions.filter(
    (session) =>
      session.status === "draft" && !session.Activity_sessionId_items.length,
  );
  const schedule = [...unfinished]
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .slice(0, 5);
  const metrics = [
    {
      icon: Users,
      tone: "violet",
      title: "Học sinh đang theo dõi",
      value: students.filter((student) => student.status === "active").length,
      note: "Hồ sơ có thể dùng cho buổi tiếp theo",
      click: onStudents,
    },
    {
      icon: CalendarDays,
      tone: "blue",
      title: "Buổi chưa hoàn tất",
      value: unfinished.length,
      note: "Bản nháp, đã lên lịch và đang diễn ra",
      click: onPlan,
    },
    {
      icon: BookOpen,
      tone: "amber",
      title: "Học liệu của bạn",
      value: materialsCount,
      note: "Học liệu riêng tư đã lưu trên máy chủ",
      click: onMaterials,
    },
    {
      icon: CheckCircle2,
      tone: "green",
      title: "Buổi cần tổng kết",
      value: pending.length,
      note: "Hoàn tất duyệt trước khi dùng cho hồ sơ",
      click: () =>
        pending[0] ? onSession(pending[0].id, "summary") : onPlan(),
    },
  ];
  return (
    <div className="restored-dashboard">
      <div className="restored-page-title">
        <div>
          <div className="eyebrow">
            {new Date().toLocaleDateString("vi-VN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
          <h1>Không gian dạy học của bạn</h1>
          <p>
            Chuẩn bị, đánh giá và theo dõi học sinh trong một luồng làm việc.
          </p>
        </div>
        <button className="button primary" onClick={onPlan}>
          <Plus size={17} />
          Soạn buổi học
        </button>
      </div>
      <div className="metric-grid">
        {metrics.map((metric) => (
          <button
            key={metric.title}
            className="metric-card"
            onClick={metric.click}
          >
            <span className={`metric-icon tone-${metric.tone}`}>
              <metric.icon size={21} />
            </span>
            <span>{metric.title}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </button>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <div className="section-head">
            <div>
              <h2>Lịch dạy cần theo dõi</h2>
              <p>Mở nhanh giáo án hoặc tiếp tục buổi học.</p>
            </div>
            <button className="text-button" onClick={onPlan}>
              Xem kế hoạch <ArrowRight size={14} />
            </button>
          </div>
          {schedule.length ? (
            <div className="agenda-list">
              {schedule.map((session) => (
                <div className="agenda-item" key={session.id}>
                  <div className="date-tile">
                    <strong>{session.date.slice(8)}</strong>
                    <span>THÁNG {Number(session.date.slice(5, 7))}</span>
                  </div>
                  <div className="agenda-content">
                    <div className="agenda-title">
                      <strong>{session.title}</strong>
                      <Status
                        tone={session.status === "live" ? "green" : "blue"}
                      >
                        {statusLabel(session.status)}
                      </Status>
                    </div>
                    <p>
                      {session.RoomMember_sessionId_items.map(
                        (member) =>
                          students.find(
                            (student) => student.id === member.studentId,
                          )?.name || "Học sinh",
                      ).join(", ")}{" "}
                      · {session.time} · {session.duration} phút
                    </p>
                    <small>
                      {session.Activity_sessionId_items.length} hoạt động đã
                      chuẩn bị
                    </small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Mở ${session.title}`}
                    onClick={() => onSession(session.id)}
                  >
                    <ArrowRight size={17} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="restored-empty">
              <CalendarDays size={30} />
              <h3>Chưa có lịch dạy</h3>
              <p>Tạo một buổi học và chuẩn bị hoạt động cho học sinh.</p>
              <button className="button" onClick={onPlan}>
                Soạn buổi học đầu tiên
              </button>
            </div>
          )}
        </section>
        <div className="dashboard-side">
          <section className="card">
            <h2>Việc cần xử lý</h2>
            <div className="task-list">
              <button
                onClick={() =>
                  pending[0] ? onSession(pending[0].id, "summary") : onPlan()
                }
              >
                <CheckCircle2 size={20} />
                <span>
                  <strong>
                    {pending.length
                      ? `${pending.length} buổi cần tổng kết`
                      : "Chưa có buổi chờ tổng kết"}
                  </strong>
                  <small>Kiểm tra minh chứng và duyệt nhận định</small>
                </span>
                <ArrowRight size={15} />
              </button>
              <button onClick={onPlan}>
                <CalendarDays size={20} />
                <span>
                  <strong>
                    {unplanned.length
                      ? `${unplanned.length} bản nháp cần chuẩn bị`
                      : "Chuẩn bị buổi học tiếp theo"}
                  </strong>
                  <small>Sắp xếp mục tiêu và hoạt động trước khi dạy</small>
                </span>
                <ArrowRight size={15} />
              </button>
            </div>
          </section>
          <section className="hint-card">
            <div className="eyebrow">
              <Sparkles size={16} />
              GỢI Ý CHO BUỔI TIẾP THEO
            </div>
            <h3>Dạy tiếp từ điều đã biết</h3>
            <p>
              Dùng lại minh chứng đã duyệt để chọn học liệu phù hợp cho từng em.
            </p>
            <button className="button" onClick={onMaterials}>
              Xem học liệu <ArrowRight size={15} />
            </button>
          </section>
        </div>
      </div>
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Minh chứng gần đây</h2>
            <p>Các quan sát được gắn với đúng học sinh và buổi học.</p>
          </div>
          <button className="text-button" onClick={onStudents}>
            Xem hồ sơ <ArrowRight size={14} />
          </button>
        </div>
        {evidenceError ? (
          <p role="alert">{evidenceError}</p>
        ) : evidence.length ? (
          evidence.map((item) => (
            <button
              className="restored-evidence-row"
              key={item.id}
              onClick={() => onEvidence(item.id)}
            >
              <span className="metric-icon tone-violet">
                <FileText size={18} />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>
                  {students.find((student) => student.id === item.studentId)
                    ?.name || "Học sinh"}{" "}
                  · {item.detail}
                </small>
              </span>
              <time>
                {new Date(item.createdAt).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </button>
          ))
        ) : (
          <p className="muted">
            Những quan sát bạn lưu trong buổi dạy sẽ xuất hiện tại đây.
          </p>
        )}
      </section>
    </div>
  );
}

export function OnlineSessionPicker({
  sessions,
  students,
  selected,
  purpose,
  onSelect,
  onOpen,
  onPlan,
}: {
  sessions: Session[];
  students: Student[];
  selected: string;
  purpose: "live" | "grading" | "summary";
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onPlan: () => void;
}) {
  const labels = {
    live: "Phòng dạy",
    grading: "Chấm bài",
    summary: "Tổng kết & duyệt",
  };
  return (
    <>
      <div className="restored-page-title">
        <div>
          <h1>{labels[purpose]}</h1>
          <p>
            Chọn buổi học để{" "}
            {purpose === "live"
              ? "mở không gian giảng dạy"
              : purpose === "grading"
                ? "xem và chấm bài học sinh"
                : "đối chiếu minh chứng, duyệt nhận định"}
            .
          </p>
        </div>
        <button className="button" onClick={onPlan}>
          <Plus size={17} />
          Soạn buổi học
        </button>
      </div>
      <div className="restored-session-picker">
        {sessions.length ? (
          sessions.map((session) => (
            <article
              className={`card restored-session-card${selected === session.id ? " is-selected" : ""}`}
              key={session.id}
            >
              <div className="section-head">
                <span className="metric-icon tone-violet">
                  <CalendarDays size={21} />
                </span>
                <Status
                  tone={
                    session.status === "live"
                      ? "green"
                      : ["ended", "reviewed"].includes(session.status)
                        ? "neutral"
                        : "blue"
                  }
                >
                  {statusLabel(session.status)}
                </Status>
              </div>
              <h2>{session.title}</h2>
              <p>
                {session.RoomMember_sessionId_items.map(
                  (member) =>
                    students.find((student) => student.id === member.studentId)
                      ?.name || "Học sinh",
                ).join(", ")}
              </p>
              <p>
                <Clock3 size={14} /> {dateLabel(session.date)} · {session.time}{" "}
                · {session.duration} phút
              </p>
              <button
                className="button primary"
                onClick={() => {
                  onSelect(session.id);
                  onOpen(session.id);
                }}
              >
                Mở {labels[purpose].toLowerCase()} <ArrowRight size={15} />
              </button>
            </article>
          ))
        ) : (
          <section className="card restored-empty">
            <CalendarDays size={32} />
            <h2>Chưa có buổi học</h2>
            <p>Tạo giáo án trước khi bắt đầu giảng dạy.</p>
            <button className="button primary" onClick={onPlan}>
              Soạn buổi học
            </button>
          </section>
        )}
      </div>
    </>
  );
}
