import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  Plus,
  Search,
  UserPlus,
  Video,
} from "lucide-react";
import { CIco, Stack, shortDate, weekdayNames } from "./ui";
import { useOpenClass } from "./useOpenClass";
import type { ClassSummary } from "./types";
import "../classes.css";
import "./classes-v2.css";

const hhmm = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

/** Dòng trạng thái của thẻ lớp: đang học, lịch tới, hoặc chưa đặt lịch. */
export function stateLine(g: ClassSummary): { live: boolean; text: string } {
  if (g.live)
    return {
      live: true,
      text: `Đang học · từ ${hhmm(g.live.startedAt)} · ${g.live.joined}/${g.live.total} em`,
    };
  if (g.nextAt) {
    const when =
      g.schedule && !g.nextAt.sessionId
        ? g.schedule.days.map((d) => weekdayNames[d]).join(", ")
        : weekdayNames[new Date(`${g.nextAt.date}T00:00:00Z`).getUTCDay()];
    return {
      live: false,
      text: `Lịch ${when} · ${g.nextAt.time} · tới ${shortDate(g.nextAt.date)}`,
    };
  }
  return { live: false, text: "Chưa đặt lịch" };
}

export function todoLine(g: ClassSummary) {
  return [
    g.pending.unconfirmed
      ? `${g.pending.unconfirmed} buổi chờ xác nhận`
      : "",
    g.pending.submissions
      ? `${g.pending.submissions} bài chưa nhận xét`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ClassList({
  groups,
  error,
  onOpenClass,
  onEnterRoom,
  onCreate,
}: {
  groups: ClassSummary[] | null;
  error: string;
  onOpenClass: (id: string) => void;
  /** groupId đi kèm để thoát phòng là về đúng lớp. */
  onEnterRoom: (sessionId: string, groupId: string) => void;
  onCreate: () => void;
}) {
  const lastGroup = useRef("");
  const opener = useOpenClass((sessionId) =>
    onEnterRoom(sessionId, lastGroup.current)
  );
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const subjects = useMemo(() => {
    if (!groups) return [];
    return Array.from(
      new Set(groups.map((g) => g.subject.trim()).filter(Boolean))
    );
  }, [groups]);

  const sorted = useMemo(() => {
    if (!groups) return null;
    const q = searchQuery.trim().toLocaleLowerCase("vi-VN");
    return [...groups]
      .filter((g) => {
        if (subjectFilter !== "all" && g.subject !== subjectFilter) return false;
        if (!q) return true;
        return [g.name, g.subject, g.grade, ...g.students.map((s) => s.name)]
          .join(" ")
          .toLocaleLowerCase("vi-VN")
          .includes(q);
      })
      .sort((a, b) => Number(!!b.live) - Number(!!a.live));
  }, [groups, subjectFilter, searchQuery]);

  return (
    <div className="cls">
      <div className="cls-ph">
        <div className="cls-min">
          <h1>Lớp của bạn</h1>
          <p className="cls-muted cls-one">
            Mỗi lớp là một phòng học cố định (1–5 học sinh). Bấm Mở lớp để vào dạy trực tiếp hoặc mở chi tiết để soạn giáo án AI.
          </p>
        </div>
        <span className="cls-grow" />
        <button
          type="button"
          className="cls-btn cls-btn--pri"
          onClick={onCreate}
        >
          <Plus size={16} />
          Tạo lớp
        </button>
      </div>

      {groups && groups.length > 1 && (
        <div
          className="filter-card"
          style={{ marginBottom: 18, padding: "12px 16px" }}
        >
          <label className="search-box">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Tìm lớp học"
              placeholder="Tìm theo tên lớp, môn học hoặc tên học sinh…"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Lọc môn học"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
          >
            <option value="all">Mọi môn học ({groups.length})</option>
            {subjects.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
          <span className="result-count">{sorted?.length ?? 0} lớp học</span>
        </div>
      )}

      {(error || opener.error) && (
        <p className="cls-alert" role="alert">
          <AlertCircle size={16} />
          {error || opener.error}
        </p>
      )}
      {!sorted && !error && (
        <p className="cls-muted" role="status">
          Đang tải danh sách lớp…
        </p>
      )}
      {sorted && sorted.length === 0 && (
        <div className="cls-empty">
          <span className="cls-ico cls-ico--acc">
            <UserPlus size={20} />
          </span>
          <b>Chưa có lớp nào phù hợp</b>
          <p className="cls-muted">
            Tạo lớp để mỗi em có link riêng, mở lớp một chạm và tự động lưu nhật ký từng buổi.
          </p>
          <button
            type="button"
            className="cls-btn cls-btn--pri"
            onClick={onCreate}
          >
            <Plus size={16} />
            Tạo lớp mới
          </button>
        </div>
      )}
      {sorted && sorted.length > 0 && (
        <div className="cls-grid2">
          {sorted.map((g) => {
            const st = stateLine(g);
            const todo = todoLine(g);
            return (
              <section
                key={g.id}
                className={`cls-card cls-room${st.live ? " is-live" : ""}`}
              >
                <button
                  type="button"
                  className="cls-room__top"
                  onClick={() => onOpenClass(g.id)}
                >
                  <CIco name={g.name} />
                  <span className="cls-min">
                    <b className="cls-one cls-room__name">{g.name}</b>
                    <span className="cls-muted cls-one">
                      {g.subject} · {g.grade}
                      {g.students.length === 1
                        ? " · dạy kèm 1–1"
                        : ` · nhóm ${g.students.length} học sinh`}
                    </span>
                  </span>
                </button>
                <div className="cls-row">
                  <Stack people={g.students} />
                  <span className="cls-muted cls-one">
                    {g.students.map((s) => s.name.split(" ").slice(-2).join(" ")).join(", ") || `${g.students.length} em`}
                  </span>
                </div>
                <div className={`cls-state${st.live ? " is-live" : ""}`}>
                  {st.live ? (
                    <span className="cls-livedot" />
                  ) : (
                    <CalendarDays size={15} />
                  )}
                  <span className="cls-one">{st.text}</span>
                </div>
                <div className={`cls-todo${todo ? "" : " is-none"}`}>
                  <span className="cls-one">
                    {todo || "Đã duyệt xong mọi nhận định"}
                  </span>
                </div>
                <div className="cls-room__ft">
                  {g.live ? (
                    <button
                      type="button"
                      className="cls-btn cls-btn--go"
                      onClick={() => onEnterRoom(g.live!.sessionId, g.id)}
                    >
                      <Video size={16} />
                      Vào lại
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="cls-btn cls-btn--pri"
                      disabled={!g.students.length || opener.busy === g.id}
                      title={
                        g.students.length ? undefined : "Thêm học sinh trước"
                      }
                      onClick={() => {
                        lastGroup.current = g.id;
                        void opener.open(g.id);
                      }}
                    >
                      <Video size={16} />
                      {opener.busy === g.id ? "Đang mở…" : "Mở lớp"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="cls-btn cls-btn--sec cls-btn--sm"
                    onClick={() => onOpenClass(g.id)}
                  >
                    <BookOpen size={14} />
                    Chi tiết & Giáo án
                  </button>
                </div>
              </section>
            );
          })}
          <button type="button" className="cls-newroom" onClick={onCreate}>
            <span className="cls-ico cls-ico--acc">
              <Plus size={18} />
            </span>
            Tạo lớp mới
            <span className="cls-muted" style={{ fontWeight: 400 }}>
              Dạy kèm 1–1 hoặc nhóm nhỏ tối đa 5 học sinh
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
