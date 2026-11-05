import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  Lightbulb,
  ListChecks,
  ShieldCheck,
  Target,
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
  goal?: string;
  gaps?: string[];
  strengths?: string[];
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
  teacherName,
}: {
  teacherName?: string;
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

  // Buổi nổi bật trên đầu trang: đang diễn ra, rồi buổi sắp tới gần nhất.
  const nextSession = useMemo(() => {
    const live = unfinished.find((s) => s.status === "live");
    if (live) return live;
    return schedule.find((s) => s.date >= todayKey) || schedule[0] || null;
  }, [unfinished, schedule, todayKey]);
  const laterSessions = useMemo(
    () => schedule.filter((s) => s.id !== nextSession?.id).slice(0, 3),
    [schedule, nextSession],
  );
  const todayCount = sessionsByDate.get(todayKey)?.length || 0;
  const whenLabel = (s: Session) => {
    if (s.status === "live") return "Đang diễn ra";
    if (s.date === todayKey) return "Hôm nay";
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (s.date === toDateKey(tomorrow)) return "Ngày mai";
    return fullDateLabel(s.date);
  };
  const firstName = teacherName?.trim().split(/\s+/).slice(-1)[0];
  const [showMonth, setShowMonth] = useState(false);
  const activeStudents = students.filter((s) => s.status === "active");
  const weekDays = useMemo(() => {
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = toDateKey(d);
      return {
        key,
        label: key === todayKey ? "Hôm nay" : WEEKDAYS[i],
        day: String(d.getDate()).padStart(2, "0"),
        isToday: key === todayKey,
        sessions: sessionsByDate.get(key) || [],
      };
    });
  }, [sessionsByDate, todayKey]);
  // Trên điện thoại, dải tuần cuộn ngang: đưa ngày hôm nay vào tầm nhìn.
  const weekRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = weekRef.current;
    const today = box?.querySelector<HTMLElement>(".lv-day.is-today");
    if (box && today && box.scrollWidth > box.clientWidth) box.scrollLeft = today.offsetLeft - 8;
  }, [weekDays]);
  const weekCount = weekDays.reduce((n, d) => n + d.sessions.length, 0);
  const nextStudents = nextSession
    ? (nextSession.RoomMember_sessionId_items
        .map((m) => students.find((st) => st.id === m.studentId))
        .filter(Boolean) as Student[])
    : [];
  const gapCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const st of students) {
      if (st.status !== "active") continue;
      for (const g of st.gaps || []) {
        const k = g.trim();
        if (k) map.set(k, (map.get(k) || 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [students]);
  const gapMax = gapCounts[0]?.[1] || 1;
  const winStudent = activeStudents.find((st) => st.strengths?.length);
  const nextFor = (studentId: string) =>
    schedule.find((x) =>
      x.RoomMember_sessionId_items.some((m) => m.studentId === studentId),
    );
  const shortNames = (x: Session) =>
    x.RoomMember_sessionId_items
      .map((m) => students.find((st) => st.id === m.studentId)?.name.trim().split(/\s+/).slice(-1)[0])
      .filter(Boolean)
      .join(", ") || "Chưa có HS";
  const weekTone = (status: string) =>
    status === "live"
      ? "mint"
      : status === "scheduled"
        ? "sky"
        : status === "ended"
          ? "peach"
          : status === "reviewed"
            ? "mint"
            : "violet";
  const weekState = (status: string) =>
    status === "live"
      ? "● Đang dạy"
      : status === "ended"
        ? "! Chưa tổng kết"
        : status === "reviewed"
          ? "✓ Đã tổng kết"
          : status === "scheduled"
            ? "Đã lên lịch"
            : "Bản nháp";
  const todos = [
    ...pending.map((x) => ({
      key: `p-${x.id}`,
      tone: "violet",
      icon: Sparkles,
      title: `Tổng kết buổi “${x.title}”`,
      note: `${getStudentNames(x)} · ${dateLabel(x.date)}`,
      action: "Duyệt",
      run: () => onSession(x.id, "summary"),
    })),
    ...unplanned.map((x) => ({
      key: `u-${x.id}`,
      tone: "sky",
      icon: CalendarDays,
      title: `Soạn lộ trình “${x.title}”`,
      note: `${dateLabel(x.date)} · chưa có hoạt động`,
      action: "Soạn",
      run: () => onPlan(x.id),
    })),
    ...(materialsCount === 0
      ? [
          {
            key: "materials",
            tone: "sun",
            icon: BookOpen,
            title: "Tải học liệu đầu tiên",
            note: "Để Copilot gợi ý đúng bài cho từng em",
            action: "Mở",
            run: onMaterials,
          },
        ]
      : []),
    ...activeStudents
      .filter((st) => !st.goal?.trim())
      .map((st) => ({
        key: `g-${st.id}`,
        tone: "mint",
        icon: Target,
        title: `Thêm mục tiêu cho ${st.name.split(/\s+/).slice(-1)[0]}`,
        note: `${st.subject || "Hồ sơ"} · còn thiếu mục tiêu`,
        action: "Mở",
        run: onStudents,
      })),
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
          <h1>
            {firstName ? `Chào ${firstName}` : "Chào bạn"}{" "}
            <span aria-hidden="true">👋</span>
          </h1>
          <p>
            {todayCount || pending.length ? (
              <>
                Hôm nay có <b>{todayCount} buổi</b>
                {pending.length ? (
                  <>
                    {" "}và <b>{pending.length} buổi</b> đang chờ tổng kết
                  </>
                ) : null}
                .
              </>
            ) : (
              "Chuẩn bị, đánh giá và theo dõi học sinh trong một luồng làm việc."
            )}
          </p>
        </div>
        <button className="button primary" onClick={() => onPlan()}>
          <Plus size={17} />
          Soạn buổi học
        </button>
      </div>
      <div className="lv-tq">
        <div className="lv-col">
      {nextSession ? (
        <section className="lv-next" aria-label="Buổi tiếp theo">
          <span className="lv-blob lv-blob--1" aria-hidden="true" />
          <span className="lv-blob lv-blob--2" aria-hidden="true" />
          <div className="lv-next__main">
            <span className="lv-next__eyebrow">
              <span
                className={`lv-dot${nextSession.status === "live" ? " is-live" : ""}`}
                aria-hidden="true"
              />
              Buổi tiếp theo · {whenLabel(nextSession)}
            </span>
            <h2>
              {nextSession.time} · {nextSession.title}
            </h2>
            <p className="lv-next__meta">
              {getStudentNames(nextSession)} · {nextSession.duration} phút
            </p>
            <div className="lv-next__prep">
              <span
                className={`lv-prep-icon${nextSession.Activity_sessionId_items.length ? " is-ready" : ""}`}
                aria-hidden="true"
              >
                {nextSession.Activity_sessionId_items.length ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <Clock3 size={20} />
                )}
              </span>
              <span>
                <b>
                  {nextSession.Activity_sessionId_items.length
                    ? `Đã chuẩn bị ${nextSession.Activity_sessionId_items.length} hoạt động`
                    : "Chưa có hoạt động nào"}
                </b>
                <small>
                  {nextSession.Activity_sessionId_items.length
                    ? "Lộ trình sẵn sàng cho buổi dạy"
                    : "Thêm lộ trình để Copilot gợi ý trong buổi"}
                </small>
              </span>
              <Status tone={statusTone(nextSession.status)}>
                {statusLabel(nextSession.status)}
              </Status>
            </div>
            <div className="lv-next__actions">
              <button
                className="button primary"
                onClick={() => onSession(nextSession.id, "teach")}
              >
                <Video size={17} />
                Vào phòng dạy
              </button>
              <button
                className="button ghost"
                onClick={() => onPlan(nextSession.id)}
              >
                Xem lộ trình
              </button>
            </div>
          </div>
          <div className="lv-next__side lv-watch">
            <h3>
              <Eye size={17} aria-hidden="true" />
              Cần chú ý trong buổi này
            </h3>
            {nextStudents.length ? (
              nextStudents.map((st) => (
                <div className="lv-watch__row" key={st.id}>
                  <span
                    className={`avatar avatar-sm avatar-${st.color || "violet"}`}
                  >
                    {st.initials || initials(st.name)}
                  </span>
                  <div>
                    <b>{st.name}</b>{" "}
                    {st.gaps?.length ? (
                      <>
                        cần củng cố <mark>{st.gaps[0]}</mark>
                      </>
                    ) : (
                      <span className="lv-muted">chưa có ghi chú cần chú ý</span>
                    )}
                  </div>
                  {(st.gaps?.length || 0) > 1 && (
                    <span className="lv-count">+{(st.gaps?.length || 0) - 1}</span>
                  )}
                </div>
              ))
            ) : (
              <p className="lv-next__empty-text">
                Buổi này chưa có học sinh. Mời học sinh để Copilot nhắc riêng từng em.
              </p>
            )}
            <p className="lv-watch__src">
              <ShieldCheck size={14} aria-hidden="true" />
              Lấy từ hồ sơ học sinh bạn đã duyệt
            </p>
          </div>
        </section>
      ) : null}
          <section className="card lv-week">
            <div className="lv-card-h">
              <span className="lv-ib lv-t-sky"><CalendarDays size={18} /></span>
              <h2>Tuần này</h2>
              <span className="lv-meta">{weekCount} buổi</span>
              <button
                className="text-button lv-card-h__r"
                aria-expanded={showMonth}
                aria-controls="lv-month"
                onClick={() => setShowMonth((v) => !v)}
              >
                {showMonth ? "Ẩn lịch tháng" : "Mở lịch tháng"} <ChevronRight size={14} />
              </button>
            </div>
            <div className="lv-week__days" ref={weekRef}>
              {weekDays.map((d) => (
                <div className={`lv-day${d.isToday ? " is-today" : ""}`} key={d.key}>
                  <div className="lv-day__n">
                    {d.label}
                    <b>{d.day}</b>
                  </div>
                  {d.sessions.length ? (
                    d.sessions.map((x) => (
                      <button
                        key={x.id}
                        className={`lv-ses lv-t-${weekTone(x.status)}${x.status === "ended" ? " is-warn" : ""}`}
                        onClick={() => setDetailSessionId(x.id)}
                      >
                        <b>{x.time}</b>
                        <span className="lv-ses__t">{x.title}</span>
                        <span className="lv-ses__s">{shortNames(x)}</span>
                        <span className="lv-ses__st">{weekState(x.status)}</span>
                      </button>
                    ))
                  ) : (
                    <span className="lv-day__none">Trống</span>
                  )}
                </div>
              ))}
            </div>
          </section>
          <div className="lv-two">
            <section className="card">
              <div className="lv-card-h">
                <span className="lv-ib lv-t-pink"><Target size={18} /></span>
                <h2>Điểm các em cần củng cố</h2>
              </div>
              {gapCounts.length ? (
                <>
                  {gapCounts.map(([gap, n], i) => (
                    <div className="lv-er" key={gap}>
                      <span title={gap}>{gap}</span>
                      <div className="lv-bar">
                        <i
                          className={`lv-bar--${i % 4}`}
                          style={{ width: `${Math.max(12, (n / gapMax) * 100)}%` }}
                        />
                      </div>
                      <span className="lv-er__c">{n}</span>
                    </div>
                  ))}
                  <div className="lv-idea">
                    <Lightbulb size={17} aria-hidden="true" />
                    <div>
                      Dành vài phút đầu buổi tới cho <b>{gapCounts[0][0]}</b>.
                    </div>
                  </div>
                </>
              ) : (
                <div className="lv-empty">
                  <p>Khi bạn ghi điểm cần củng cố vào hồ sơ, chúng sẽ được gom ở đây.</p>
                  <button className="button ghost small" onClick={onStudents}>
                    Mở hồ sơ học sinh
                  </button>
                </div>
              )}
            </section>
            <section className="card">
              <div className="lv-card-h">
                <span className="lv-ib lv-t-violet"><Users size={18} /></span>
                <h2>Học sinh</h2>
                <span className="lv-meta">{activeStudents.length} em</span>
                <button className="text-button lv-card-h__r" onClick={onStudents}>
                  Tất cả <ChevronRight size={14} />
                </button>
              </div>
              {winStudent && (
                <div className="lv-win">
                  <span aria-hidden="true">🎉</span>
                  <div>
                    <b>{winStudent.name}</b> đã vững{" "}
                    <b>{winStudent.strengths?.[0]}</b>
                  </div>
                </div>
              )}
              {activeStudents.length ? (
                activeStudents.slice(0, 5).map((st) => {
                  const nx = nextFor(st.id);
                  return (
                    <button className="lv-sr" key={st.id} onClick={onStudents}>
                      <span
                        className={`avatar avatar-md avatar-${st.color || "violet"}`}
                      >
                        {st.initials || initials(st.name)}
                      </span>
                      <span className="lv-sr__copy">
                        <strong>{st.name}</strong>
                        <small>
                          {[st.subject, st.grade].filter(Boolean).join(" · ")}
                          {nx ? ` · buổi tới: ${dateLabel(nx.date)}` : ""}
                        </small>
                      </span>
                      <span className={`lv-pill${st.gaps?.length ? " is-warn" : ""}`}>
                        {st.gaps?.length ? `${st.gaps.length} điểm cần củng cố` : "Ổn định"}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="lv-empty">
                  <p>Chưa có học sinh nào.</p>
                  <button className="button ghost small" onClick={onStudents}>
                    Thêm học sinh
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
        <aside className="lv-side">
          <section className="card lv-todo">
            <div className="lv-card-h">
              <span className="lv-ib lv-t-mint"><ListChecks size={18} /></span>
              <h2>Việc cần làm</h2>
              {todos.length > 0 && <span className="lv-badge">{todos.length}</span>}
              <span className="lv-meta lv-card-h__r">gấp trước</span>
            </div>
            {todos.length ? (
              todos.slice(0, 8).map((t) => (
                <div className="lv-td" key={t.key}>
                  <span className={`lv-ib lv-t-${t.tone}`}>
                    <t.icon size={17} />
                  </span>
                  <div>
                    <div className="lv-td__t">{t.title}</div>
                    <div className="lv-td__d">{t.note}</div>
                  </div>
                  <button className="button ghost small" onClick={t.run}>
                    {t.action}
                  </button>
                </div>
              ))
            ) : (
              <div className="lv-empty">
                <p>Không còn việc nào. Nghỉ ngơi chút nhé ☕</p>
              </div>
            )}
            <p className="lv-foot">Xong hết là hồ sơ các em luôn mới nhất trước buổi sau ✨</p>
          </section>
          <section className="hint-card lv-tip">
            <div className="eyebrow">
              <Lightbulb size={16} />
              MẸO NHỎ
            </div>
            <h3>Duyệt ngay sau buổi học</h3>
            <p>Nhận định được duyệt sớm thì gợi ý cho buổi sau sẽ trúng hơn.</p>
            {pending[0] && (
              <button className="button" onClick={() => onSession(pending[0].id, "summary")}>
                Tổng kết buổi gần nhất <ArrowRight size={15} />
              </button>
            )}
          </section>
        </aside>
      </div>
      {showMonth && (
        <section className="card schedule-calendar-card" id="lv-month">
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
      )}
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
