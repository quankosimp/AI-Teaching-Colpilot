import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  List,
  Plus,
  Settings2,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { Modal, Status, initials } from "./ui";
import { statusLabel } from "./statusLabels";

type Student = {
  id: string;
  name: string;
  status: string;
  grade: string;
  subject?: string;
  color?: string;
  initials?: string;
};
type ActivityItem = {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  type?: string;
};
type Session = {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  goal?: string;
  sharedGoal?: string;
  status: string;
  Activity_sessionId_items: ActivityItem[];
  RoomMember_sessionId_items: { studentId: string }[];
};
export type RecentEvidence = {
  id: string;
  title: string;
  detail: string;
  studentId: string;
  createdAt: string;
};

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parseDateKey = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0);
};

const dateLabel = (date: string) =>
  parseDateKey(date).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });

const fullDateLabel = (date: string) =>
  parseDateKey(date).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const activityTypeLabel = (type?: string) => {
  if (type === "KhoiDong") return "Khởi động";
  if (type === "LyThuyet") return "Lý thuyết";
  if (type === "LuyenTap") return "Luyện tập";
  if (type === "KiemTra") return "Kiểm tra";
  return "Hoạt động";
};

const statusTone = (status: string): "green" | "blue" | "violet" | "neutral" => {
  if (status === "live") return "green";
  if (status === "scheduled") return "blue";
  if (status === "draft") return "violet";
  return "neutral";
};

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
  onPlan: (sessionId?: string) => void;
  onMaterials: () => void;
  onStudents: () => void;
  onSession: (id: string, view?: "teach" | "grading" | "summary") => void;
  onEvidence: (id: string) => void;
}) {
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const unfinished = useMemo(
    () =>
      sessions.filter(
        (session) => !["ended", "reviewed"].includes(session.status),
      ),
    [sessions],
  );
  const pending = useMemo(
    () => sessions.filter((session) => session.status === "ended"),
    [sessions],
  );
  const unplanned = useMemo(
    () =>
      sessions.filter(
        (session) =>
          session.status === "draft" && !session.Activity_sessionId_items.length,
      ),
    [sessions],
  );
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) =>
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
      ),
    [sessions],
  );
  const schedule = useMemo(
    () =>
      [...unfinished]
        .sort((a, b) =>
          `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
        )
        .slice(0, 6),
    [unfinished],
  );

  const [scheduleView, setScheduleView] = useState<"calendar" | "list">(
    "calendar",
  );
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const anchor = unfinished[0]?.date || sortedSessions[0]?.date || todayKey;
    return anchor;
  });
  const [viewMonth, setViewMonth] = useState<{ year: number; month: number }>(
    () => {
      const anchor = parseDateKey(
        unfinished[0]?.date || sortedSessions[0]?.date || todayKey,
      );
      return { year: anchor.getFullYear(), month: anchor.getMonth() };
    },
  );
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessions.length) return;
    const hasInCurrentMonth = sessions.some((s) => {
      const d = parseDateKey(s.date);
      return (
        d.getFullYear() === viewMonth.year && d.getMonth() === viewMonth.month
      );
    });
    if (!hasInCurrentMonth) {
      const target = unfinished[0] || sortedSessions[sortedSessions.length - 1];
      if (target) {
        const d = parseDateKey(target.date);
        setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
        setSelectedDate(target.date);
      }
    }
  }, [sessions.length]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sortedSessions) {
      const list = map.get(s.date) || [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [sortedSessions]);

  const calendarCells = useMemo(() => {
    const { year, month } = viewMonth;
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    return Array.from({ length: totalCells }, (_, i) => {
      const cellDate = new Date(year, month, 1 - startOffset + i);
      const key = toDateKey(cellDate);
      return {
        key,
        dayNumber: cellDate.getDate(),
        inMonth: cellDate.getMonth() === month,
        isToday: key === todayKey,
        sessions: sessionsByDate.get(key) || [],
      };
    });
  }, [viewMonth, sessionsByDate, todayKey]);

  const selectedDaySessions = useMemo(
    () => sessionsByDate.get(selectedDate) || [],
    [sessionsByDate, selectedDate],
  );

  const detailSession = useMemo(
    () => sessions.find((s) => s.id === detailSessionId) || null,
    [sessions, detailSessionId],
  );

  const shiftMonth = (delta: number) => {
    setViewMonth((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const jumpToToday = () => {
    const now = new Date();
    setViewMonth({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDate(todayKey);
  };

  const getStudentNames = (session: Session) =>
    session.RoomMember_sessionId_items.map(
      (member) =>
        students.find((student) => student.id === member.studentId)?.name ||
        "Học sinh",
    ).join(", ") || "Chưa chọn học sinh";

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
      click: () => onPlan(),
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
        <button className="button primary" onClick={() => onPlan()}>
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
        <section className="card schedule-calendar-card">
          <div className="section-head schedule-card-head">
            <div>
              <h2>Lịch dạy cần theo dõi</h2>
              <p>
                Nhấp vào từng buổi học trên lịch để xem chi tiết mục tiêu, lộ
                trình và vào lớp.
              </p>
            </div>
            <div className="schedule-head-actions">
              <div
                className="schedule-view-toggle"
                role="group"
                aria-label="Chế độ xem lịch dạy"
              >
                <button
                  type="button"
                  className={`schedule-toggle-btn${scheduleView === "calendar" ? " is-active" : ""}`}
                  aria-pressed={scheduleView === "calendar"}
                  onClick={() => setScheduleView("calendar")}
                >
                  <CalendarDays size={14} />
                  Lịch tháng
                </button>
                <button
                  type="button"
                  className={`schedule-toggle-btn${scheduleView === "list" ? " is-active" : ""}`}
                  aria-pressed={scheduleView === "list"}
                  onClick={() => setScheduleView("list")}
                >
                  <List size={14} />
                  Danh sách
                </button>
              </div>
              <button className="text-button" onClick={() => onPlan()}>
                Xem kế hoạch <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {scheduleView === "calendar" ? (
            <div className="teaching-calendar">
              <div className="teaching-calendar__toolbar">
                <div className="teaching-calendar__month-nav">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Tháng trước"
                    onClick={() => shiftMonth(-1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <strong className="teaching-calendar__month-label">
                    Tháng {viewMonth.month + 1}, {viewMonth.year}
                  </strong>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Tháng sau"
                    onClick={() => shiftMonth(1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    type="button"
                    className="button ghost small"
                    onClick={jumpToToday}
                  >
                    Hôm nay
                  </button>
                </div>
                <div className="teaching-calendar__legend">
                  <span className="legend-item">
                    <i className="legend-dot legend-dot--live" /> Đang diễn ra
                  </span>
                  <span className="legend-item">
                    <i className="legend-dot legend-dot--scheduled" /> Đã lên
                    lịch
                  </span>
                  <span className="legend-item">
                    <i className="legend-dot legend-dot--draft" /> Bản nháp
                  </span>
                  <span className="legend-item">
                    <i className="legend-dot legend-dot--done" /> Đã kết thúc
                  </span>
                </div>
              </div>

              <div
                className="teaching-calendar__grid"
                role="grid"
                aria-label={`Lịch dạy tháng ${viewMonth.month + 1} năm ${viewMonth.year}`}
              >
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="teaching-calendar__weekday"
                    role="columnheader"
                  >
                    {day}
                  </div>
                ))}
                {calendarCells.map((cell) => {
                  const isSelected = cell.key === selectedDate;
                  return (
                    <div
                      key={cell.key}
                      role="gridcell"
                      aria-selected={isSelected}
                      className={`teaching-calendar__cell${!cell.inMonth ? " is-outside" : ""}${cell.isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}${cell.sessions.length ? " has-sessions" : ""}`}
                      onClick={() => setSelectedDate(cell.key)}
                    >
                      <div className="teaching-calendar__cell-head">
                        <span className="teaching-calendar__day-num">
                          {cell.dayNumber}
                        </span>
                        {cell.sessions.length > 0 && (
                          <span className="teaching-calendar__count-badge">
                            {cell.sessions.length} buổi
                          </span>
                        )}
                      </div>
                      <div className="teaching-calendar__events">
                        {cell.sessions.slice(0, 3).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={`calendar-event-pill calendar-event-pill--${item.status}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDate(cell.key);
                              setDetailSessionId(item.id);
                            }}
                            title={`${item.time} · ${item.title} (${statusLabel(item.status)})`}
                          >
                            <span className="calendar-event-pill__time">
                              {item.time}
                            </span>
                            <span className="calendar-event-pill__title">
                              {item.title}
                            </span>
                          </button>
                        ))}
                        {cell.sessions.length > 3 && (
                          <button
                            type="button"
                            className="calendar-event-more"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDate(cell.key);
                              setDetailSessionId(cell.sessions[0].id);
                            }}
                          >
                            +{cell.sessions.length - 3} buổi khác
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="teaching-calendar__day-panel">
                <div className="teaching-calendar__day-head">
                  <div>
                    <span className="eyebrow">NGÀY ĐANG CHỌN</span>
                    <h3>{fullDateLabel(selectedDate)}</h3>
                  </div>
                  <span className="plan-duration-pill">
                    {selectedDaySessions.length} buổi học
                  </span>
                </div>
                {selectedDaySessions.length ? (
                  <div className="teaching-calendar__day-list">
                    {selectedDaySessions.map((session) => (
                      <div
                        key={session.id}
                        className="calendar-day-session-card"
                      >
                        <button
                          type="button"
                          className="calendar-day-session-main"
                          onClick={() => setDetailSessionId(session.id)}
                        >
                          <div className="date-tile">
                            <strong>{session.time}</strong>
                            <span>{session.duration} PHÚT</span>
                          </div>
                          <div className="agenda-content">
                            <div className="agenda-title">
                              <strong>{session.title}</strong>
                              <Status tone={statusTone(session.status)}>
                                {statusLabel(session.status)}
                              </Status>
                            </div>
                            <p>{getStudentNames(session)}</p>
                            <small>
                              {session.Activity_sessionId_items.length} hoạt
                              động đã chuẩn bị · Nhấn để xem chi tiết
                            </small>
                          </div>
                        </button>
                        <div className="calendar-day-session-actions">
                          <button
                            type="button"
                            className="button ghost small"
                            onClick={() => setDetailSessionId(session.id)}
                          >
                            Chi tiết
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Mở ${session.title}`}
                            onClick={() => onSession(session.id)}
                          >
                            <ArrowRight size={17} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="teaching-calendar__day-empty">
                    <p>
                      Không có buổi học nào trong ngày{" "}
                      <strong>{dateLabel(selectedDate)}</strong>. Nhấp vào các ô
                      có lịch trên tháng hoặc tạo buổi học mới.
                    </p>
                    <button
                      type="button"
                      className="button ghost small"
                      onClick={() => onPlan()}
                    >
                      <Plus size={14} /> Tạo buổi học mới
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : schedule.length ? (
            <div className="agenda-list">
              {schedule.map((session) => (
                <div className="agenda-item" key={session.id}>
                  <div className="date-tile">
                    <strong>{session.date.slice(8)}</strong>
                    <span>THÁNG {Number(session.date.slice(5, 7))}</span>
                  </div>
                  <div className="agenda-content">
                    <div className="agenda-title">
                      <button
                        type="button"
                        className="agenda-title-btn"
                        onClick={() => setDetailSessionId(session.id)}
                      >
                        <strong>{session.title}</strong>
                      </button>
                      <Status tone={statusTone(session.status)}>
                        {statusLabel(session.status)}
                      </Status>
                    </div>
                    <p>
                      {getStudentNames(session)} · {session.time} ·{" "}
                      {session.duration} phút
                    </p>
                    <small>
                      {session.Activity_sessionId_items.length} hoạt động đã
                      chuẩn bị
                    </small>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="button ghost small"
                      onClick={() => setDetailSessionId(session.id)}
                    >
                      Chi tiết
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Mở ${session.title}`}
                      onClick={() => onSession(session.id)}
                    >
                      <ArrowRight size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="restored-empty">
              <CalendarDays size={30} />
              <h3>Chưa có lịch dạy</h3>
              <p>Tạo một buổi học và chuẩn bị hoạt động cho học sinh.</p>
              <button className="button" onClick={() => onPlan()}>
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
              <button onClick={() => onPlan()}>
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

      {detailSession && (
        <Modal
          title="Chi tiết buổi học"
          wide
          onClose={() => setDetailSessionId(null)}
        >
          <div className="session-detail-modal">
            <header className="session-detail-modal__header">
              <div>
                <div className="plan-main-badges">
                  <Status tone={statusTone(detailSession.status)}>
                    {statusLabel(detailSession.status)}
                  </Status>
                  <span className="plan-duration-pill">
                    Thời lượng {detailSession.duration} phút
                  </span>
                </div>
                <h2>{detailSession.title}</h2>
                <p className="plan-meta-line">
                  <Clock3 size={14} /> {fullDateLabel(detailSession.date)} ·
                  Khung giờ {detailSession.time}
                </p>
              </div>
            </header>

            {(detailSession.sharedGoal || detailSession.goal) && (
              <div className="plan-goals-summary">
                {detailSession.sharedGoal && (
                  <p>
                    <strong>Mục tiêu lớp học:</strong>{" "}
                    {detailSession.sharedGoal}
                  </p>
                )}
                {detailSession.goal && (
                  <p>
                    <strong>Mục tiêu giáo viên:</strong> {detailSession.goal}
                  </p>
                )}
              </div>
            )}

            <div className="plan-members-section">
              <strong className="plan-section-label">
                Học sinh tham gia (
                {detailSession.RoomMember_sessionId_items.length})
              </strong>
              {detailSession.RoomMember_sessionId_items.length ? (
                <div className="plan-member-list">
                  {detailSession.RoomMember_sessionId_items.map((member) => {
                    const st = students.find((s) => s.id === member.studentId);
                    return (
                      <div key={member.studentId} className="plan-member-chip">
                        <span
                          className={`avatar avatar-sm avatar-${st?.color || "violet"}`}
                        >
                          {st?.initials || initials(st?.name || "HS")}
                        </span>
                        <span>
                          {st ? `${st.name} (${st.grade})` : member.studentId}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="muted">Chưa gán học sinh cho buổi học này.</p>
              )}
            </div>

            <div className="session-detail-modal__activities">
              <div className="plan-activities-header">
                <div>
                  <h3>
                    Lộ trình hoạt động (
                    {detailSession.Activity_sessionId_items.length})
                  </h3>
                  <small>
                    Tổng thời lượng chuẩn bị:{" "}
                    {detailSession.Activity_sessionId_items.reduce(
                      (sum, act) => sum + (act.duration || 0),
                      0,
                    )}{" "}
                    phút / {detailSession.duration} phút
                  </small>
                </div>
              </div>
              {detailSession.Activity_sessionId_items.length ? (
                <div className="session-detail-modal__activity-list">
                  {detailSession.Activity_sessionId_items.map((act, idx) => (
                    <div
                      key={act.id || idx}
                      className="session-detail-activity-item"
                    >
                      <span className="activity-step-badge">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div className="session-detail-activity-copy">
                        <div className="row-between">
                          <strong>
                            {act.title || `Hoạt động ${idx + 1}`}
                          </strong>
                          <span className="plan-duration-pill">
                            {activityTypeLabel(act.type)} · {act.duration || 0}{" "}
                            phút
                          </span>
                        </div>
                        {act.description && <p>{act.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  Chưa có hoạt động nào trong lộ trình buổi học này.
                </p>
              )}
            </div>

            <footer className="session-detail-modal__footer">
              <button
                type="button"
                className="button ghost"
                onClick={() => {
                  const id = detailSession.id;
                  setDetailSessionId(null);
                  onPlan(id);
                }}
              >
                <Settings2 size={15} />
                Chỉnh sửa giáo án
              </button>
              {["ended", "reviewed"].includes(detailSession.status) && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    const id = detailSession.id;
                    setDetailSessionId(null);
                    onSession(id, "summary");
                  }}
                >
                  <CheckCircle2 size={15} />
                  Xem tổng kết & duyệt
                </button>
              )}
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  const id = detailSession.id;
                  setDetailSessionId(null);
                  onSession(id, "teach");
                }}
              >
                <Video size={15} />
                Mở phòng dạy
              </button>
            </footer>
          </div>
        </Modal>
      )}
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
