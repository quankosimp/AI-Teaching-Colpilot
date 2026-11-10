import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  GraduationCap,
  LibraryBig,
  Users,
  Video,
  ClipboardCheck,
  AlertTriangle,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { api } from "../onlineApi";
import { CIco, dayLabel, errText } from "./ui";
import type { ClassSummary } from "./types";
import "../classes.css";
import "./classes-v2.css";

type DashboardProps = {
  classCount: number;
  activeStudentCount: number;
  materialCount: number;
  onGoToClasses: () => void;
  onGoToStudents: () => void;
  onGoToMaterials: () => void;
  onOpenClass: (id: string) => void;
  onEnterRoom: (sessionId: string, groupId: string) => void;
  onOpenStudent?: (studentId: string) => void;
  onOpenAfter?: (sessionId: string, groupId: string) => void;
  onReload?: () => Promise<void> | void;
};

export function DashboardHome({
  classCount,
  activeStudentCount,
  materialCount,
  onGoToClasses,
  onGoToStudents,
  onGoToMaterials,
  onOpenClass,
  onEnterRoom,
  onOpenStudent,
}: DashboardProps) {
  const [groups, setGroups] = useState<ClassSummary[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setGroups((await api<{ groups: ClassSummary[] }>("/groups")).groups);
      setError("");
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const liveClasses = groups?.filter((g) => g.live) ?? [];
  const pendingTotal =
    groups?.reduce(
      (s, g) => s + g.pending.unconfirmed + g.pending.submissions,
      0
    ) ?? 0;
  const pendingGroups =
    groups?.filter(
      (g) => g.pending.unconfirmed > 0 || g.pending.submissions > 0
    ) ?? [];
  const upcoming =
    groups
      ?.filter((g) => !g.live && g.nextAt)
      .sort((a, b) => (a.nextAt!.date < b.nextAt!.date ? -1 : 1))
      .slice(0, 4) ?? [];

  return (
    <div className="cls">
      <div className="cls-ph" style={{ flexWrap: "wrap", gap: 12 }}>
        <div className="cls-min">
          <h1>Tổng quan dạy học</h1>
          <p className="cls-muted cls-one">
            Theo dõi lớp đang dạy, buổi chờ duyệt nhận định, lịch sắp tới và lỗ hổng kiến thức cần củng cố (SRS M01–M06).
          </p>
        </div>
      </div>

      {error && (
        <p className="cls-alert" role="alert">
          <AlertCircle size={16} />
          {error}
        </p>
      )}

      {/* 4 Thẻ chỉ số tổng hợp */}
      <div
        className="dash-stats"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
      >
        <button type="button" className="dash-stat" onClick={onGoToClasses}>
          <span className="dash-stat__ico">
            <GraduationCap size={22} />
          </span>
          <span className="dash-stat__num">{groups?.length ?? classCount}</span>
          <span className="dash-stat__lbl">Lớp đang vận hành</span>
          <ChevronRight size={15} className="dash-stat__arr" />
        </button>

        <button type="button" className="dash-stat" onClick={onGoToStudents}>
          <span className="dash-stat__ico">
            <Users size={22} />
          </span>
          <span className="dash-stat__num">{activeStudentCount}</span>
          <span className="dash-stat__lbl">Học sinh đang theo dõi</span>
          <ChevronRight size={15} className="dash-stat__arr" />
        </button>

        <button type="button" className="dash-stat" onClick={onGoToMaterials}>
          <span className="dash-stat__ico">
            <LibraryBig size={22} />
          </span>
          <span className="dash-stat__num">{materialCount}</span>
          <span className="dash-stat__lbl">Học liệu chuẩn GDPT 2018</span>
          <ChevronRight size={15} className="dash-stat__arr" />
        </button>

        <button
          type="button"
          className="dash-stat"
          onClick={() => {
            if (pendingGroups[0]) onOpenClass(pendingGroups[0].id);
            else onGoToClasses();
          }}
        >
          <span className="dash-stat__ico">
            <Sparkles size={22} />
          </span>
          <span className="dash-stat__num">{pendingTotal}</span>
          <span className="dash-stat__lbl">Mục chờ duyệt sau buổi</span>
          <ChevronRight size={15} className="dash-stat__arr" />
        </button>
      </div>

      <div className="dash-cols">
        {/* Cột trái */}
        <div className="dash-col">
          {/* Đang live */}
          {liveClasses.length > 0 && (
            <section className="cls-card dash-section">
              <h2 className="dash-section__h">
                <span className="cls-livedot" style={{ marginTop: 2 }} />
                Phòng học đang diễn ra trực tiếp
              </h2>
              {liveClasses.map((g) => (
                <div key={g.id} className="dash-row">
                  <CIco name={g.name} size="sm" />
                  <div className="cls-min">
                    <b className="cls-one">{g.name}</b>
                    <span className="cls-muted cls-one">
                      {g.subject} · {g.grade} · {g.live!.joined}/{g.live!.total}{" "}
                      em đang trong phòng
                    </span>
                  </div>
                  <button
                    type="button"
                    className="cls-btn cls-btn--go cls-btn--sm"
                    onClick={() => onEnterRoom(g.live!.sessionId, g.id)}
                  >
                    <Video size={14} />
                    Vào lại phòng
                  </button>
                </div>
              ))}
            </section>
          )}

          {/* Việc cần làm (Duyệt nhận định & Chấm bài nộp sau buổi) */}
          <section className="cls-card dash-section">
            <h2 className="dash-section__h">
              <ClipboardCheck size={16} />
              Duyệt nhận định & Bài nộp sau buổi
              {pendingTotal > 0 && <em className="dash-badge">{pendingTotal}</em>}
            </h2>
            {!groups && (
              <p className="cls-muted" style={{ padding: "4px 0" }}>
                Đang tải…
              </p>
            )}
            {groups && pendingGroups.length === 0 && (
              <p className="cls-muted" style={{ padding: "4px 0", fontSize: 13 }}>
                Không có việc nào đang chờ. Bạn đã cập nhật hết rồi!
              </p>
            )}
            {pendingGroups.map((g) => (
              <div key={g.id} className="dash-row">
                <CIco name={g.name} size="sm" />
                <div className="cls-min">
                  <b className="cls-one">{g.name}</b>
                  <span className="cls-muted cls-one">
                    {[
                      g.pending.unconfirmed
                        ? `${g.pending.unconfirmed} buổi chờ duyệt nhận định`
                        : "",
                      g.pending.submissions
                        ? `${g.pending.submissions} bài nộp tay chờ chấm`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <button
                  type="button"
                  className="cls-btn cls-btn--sec cls-btn--sm"
                  onClick={() => onOpenClass(g.id)}
                >
                  Mở lớp & Duyệt
                </button>
              </div>
            ))}
          </section>

          {/* Lịch sắp tới */}
          <section className="cls-card dash-section">
            <h2 className="dash-section__h">
              <BookOpen size={16} />
              Lịch dạy định kỳ sắp tới
            </h2>
            {!groups && (
              <p className="cls-muted" style={{ padding: "4px 0" }}>
                Đang tải…
              </p>
            )}
            {groups && upcoming.length === 0 && (
              <p className="cls-muted" style={{ padding: "4px 0", fontSize: 13 }}>
                Tất cả các lớp có lịch hôm nay đang trong giờ học trực tiếp.
              </p>
            )}
            {upcoming.map((g) => (
              <div key={g.id} className="dash-row">
                <CIco name={g.name} size="sm" />
                <div className="cls-min">
                  <b className="cls-one">{g.name}</b>
                  <span className="cls-muted cls-one">
                    {dayLabel(g.nextAt!.date)} · {g.nextAt!.time} ·{" "}
                    {g.students.length} học sinh
                  </span>
                </div>
                <button
                  type="button"
                  className="cls-btn cls-btn--sec cls-btn--sm"
                  onClick={() => onOpenClass(g.id)}
                >
                  Chi tiết lớp
                </button>
              </div>
            ))}
            {groups && groups.length > 0 && (
              <button
                type="button"
                className="cls-btn cls-btn--txt cls-btn--sm"
                style={{ marginTop: 8 }}
                onClick={onGoToClasses}
              >
                Xem tất cả {groups.length} lớp học <ChevronRight size={13} />
              </button>
            )}
          </section>
        </div>

        {/* Cột phải */}
        <div className="dash-col">
          {/* Học sinh cần chú ý */}
          <NeedsAttentionSection
            onGoToStudents={onGoToStudents}
            onOpenStudent={onOpenStudent}
          />
        </div>
      </div>
    </div>
  );
}

function NeedsAttentionSection({
  onGoToStudents,
  onOpenStudent,
}: {
  onGoToStudents: () => void;
  onOpenStudent?: (studentId: string) => void;
}) {
  const [items, setItems] = useState<
    {
      id: string;
      name: string;
      grade: string;
      subject: string;
      initials: string;
      color: string;
      gaps: string[];
      strengths: string[];
    }[]
  >([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void api<{
      students: {
        id: string;
        name: string;
        grade: string;
        subject: string;
        status: string;
        initials: string;
        color: string;
        gaps: string[];
        strengths: string[];
      }[];
    }>("/students")
      .then((r) => {
        setItems(
          r.students
            .filter((s) => s.status === "active" && s.gaps.length > 0)
            .slice(0, 6)
        );
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  return (
    <section className="cls-card dash-section">
      <h2 className="dash-section__h">
        <AlertTriangle size={15} />
        Học sinh có lỗ hổng cần củng cố (SRS M02)
        {items.length > 0 && (
          <em className="dash-badge dash-badge--warn">{items.length}</em>
        )}
      </h2>
      {!loaded && (
        <p className="cls-muted" style={{ padding: "4px 0" }}>
          Đang tải…
        </p>
      )}
      {loaded && items.length === 0 && (
        <p className="cls-muted" style={{ padding: "4px 0", fontSize: 13 }}>
          Tất cả học sinh đều ổn, không có lỗ hổng ghi nhận.
        </p>
      )}
      {items.map((s) => (
        <div
          key={s.id}
          className="dash-row"
          style={{ alignItems: "flex-start", padding: "10px 0" }}
        >
          <span
            className="cls-av"
            style={{
              width: 32,
              height: 32,
              fontSize: 11,
              marginTop: 2,
              ["--h" as string]: s.color,
            }}
          >
            {s.initials}
          </span>
          <div className="cls-min" style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <b className="cls-one">{s.name}</b>
              <span
                className="cls-muted"
                style={{ fontSize: 11.5, fontWeight: 600 }}
              >
                · {s.subject} ({s.grade})
              </span>
            </div>
            <span
              className="cls-muted"
              style={{
                display: "block",
                fontSize: 12.5,
                lineHeight: 1.45,
                marginTop: 3,
              }}
            >
              ⚠️ {s.gaps[0]}
            </span>
          </div>
          {onOpenStudent && (
            <button
              type="button"
              className="cls-btn cls-btn--sec cls-btn--sm"
              onClick={() => onOpenStudent(s.id)}
            >
              Hồ sơ
            </button>
          )}
        </div>
      ))}
      {loaded && items.length > 0 && (
        <button
          type="button"
          className="cls-btn cls-btn--txt cls-btn--sm"
          style={{ marginTop: 8 }}
          onClick={onGoToStudents}
        >
          Quản lý toàn bộ hồ sơ học sinh <ChevronRight size={13} />
        </button>
      )}
    </section>
  );
}
