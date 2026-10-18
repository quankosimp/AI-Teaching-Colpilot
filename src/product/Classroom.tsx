import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Film,
  Hand,
  Link,
  Maximize,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  Moon,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import type { Session } from "./model";
import { boardKey, defaultTools, sessionStudentIds, uid } from "./model";
import { useStore } from "./store";
import { appendEvent, mockRecording, useCall } from "./adapters";
import { inviteValid, SessionSetup } from "./SessionSetup";
import { canStudentAct } from "./permissions";
import {
  Avatar,
  Banner,
  Empty,
  Modal,
  SectionHead,
  SessionSelect,
  Status,
} from "./ui";
import { Whiteboard, boardText } from "./Board";
import { DocumentStage } from "./DocumentStage";
import { QuickCheckPanel } from "./QuickCheck";
import {
  CapturePanel,
  ChatPanel,
  CopilotPanel,
  SubmissionPanel,
} from "./RoomPanels";
import { SourceViewer } from "./SourceViewer";

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (
      (localStorage.getItem("ai-teaching-copilot-theme") as
        | "light"
        | "dark") || "light"
    );
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (theme === "dark") {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
    localStorage.setItem("ai-teaching-copilot-theme", theme);
  }, [theme]);
  const toggle = () => setTheme((t) => (t === "light" ? "dark" : "light"));
  return { theme, toggle };
}

export const ROOM_REACTIONS = [
  { emoji: "👍", label: "Đã hiểu", tone: "green" },
  { emoji: "✋", label: "Cần giảng lại", tone: "amber" },
  { emoji: "⏳", label: "Cần thêm giờ", tone: "blue" },
  { emoji: "💡", label: "Có cách khác", tone: "violet" },
] as const;

function useClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
function CallPreview({
  name,
  camera,
  mic,
}: {
  name: string;
  camera: boolean;
  mic: boolean;
}) {
  return (
    <div className="call-preview">
      <span className="preview-avatar">
        {name
          .split(" ")
          .slice(-2)
          .map((p) => p[0])
          .join("")}
      </span>
      <strong>{name}</strong>
      <small>{camera ? "Camera mô phỏng đang bật" : "Camera đang tắt"}</small>
      <div className="preview-mic">
        {mic ? <Mic size={16} /> : <MicOff size={16} />}{" "}
        {mic ? "Mic đang bật" : "Mic đang tắt"}
      </div>
    </div>
  );
}
function Lobby({
  session,
  name,
  teacher,
  onEnter,
  call,
}: {
  session: Session;
  name: string;
  teacher: boolean;
  onEnter: () => void;
  call: ReturnType<typeof useCall>;
}) {
  const [consent, setConsent] = useState(false);
  return (
    <main className="lobby-page">
      <div className="lobby-brand">
        <span className="brand-mark">
          <Sparkles size={21} />
        </span>
        <strong>AI Teaching Copilot</strong>
        <Status tone="violet">Phòng học demo</Status>
      </div>
      <div className="lobby-grid">
        <section>
          <CallPreview name={name} camera={call.camera} mic={call.mic} />
          <div className="preview-controls">
            <button
              className="button ghost"
              onClick={() => call.setMic(!call.mic)}
            >
              {call.mic ? <Mic size={18} /> : <MicOff size={18} />}{" "}
              {call.mic ? "Tắt mic" : "Bật mic"}
            </button>
            <button
              className="button ghost"
              onClick={() => call.setCamera(!call.camera)}
            >
              {call.camera ? <Video size={18} /> : <VideoOff size={18} />}{" "}
              {call.camera ? "Tắt camera" : "Bật camera"}
            </button>
          </div>
          <Banner>
            Mic, camera và cuộc gọi được mô phỏng trong bản UI này.
          </Banner>
        </section>
        <section className="lobby-info">
          <div className="eyebrow">
            {teacher ? "KHÔNG GIAN GIÁO VIÊN" : "LIÊN KẾT DÀNH RIÊNG CHO BẠN"}
          </div>
          <h1>{session.title}</h1>
          <p>{session.goal}</p>
          <div className="lobby-meta">
            <span>
              <Users size={18} /> {sessionStudentIds(session).length} học sinh
            </span>
            <span>
              <BookOpen size={18} /> {session.activities.length} hoạt động
            </span>
            <span>
              <Film size={18} /> Có thể ghi hình video và nội dung chung
            </span>
          </div>
          {!teacher && (
            <>
              <label>
                Xác nhận người tham gia
                <input value={name} readOnly />
              </label>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                Tôi đã xem thông báo: giáo viên có thể ghi hình cuộc gọi và nội
                dung được chia sẻ trong buổi.
              </label>
            </>
          )}
          <button
            className="button primary lobby-enter"
            disabled={(!teacher && !consent) || call.state === "connecting"}
            onClick={onEnter}
          >
            {call.state === "connecting"
              ? "Đang kết nối…"
              : teacher
                ? "Mở phòng dạy"
                : "Xin vào phòng học"}
          </button>
          <p className="muted">
            {teacher
              ? "Bạn điều khiển nội dung và quyền tham gia."
              : "Nháp cá nhân và bài nộp của bạn được lưu riêng."}
          </p>
        </section>
      </div>
    </main>
  );
}
function VideoStrip({
  session,
  studentId,
  call,
}: {
  session: Session;
  studentId?: string;
  call: ReturnType<typeof useCall>;
}) {
  const { data } = useStore();
  const members = data.members.filter(
    (m) => m.sessionId === session.id && m.state === "joined",
  );
  return (
    <div className="video-strip">
      <div className="video-tile teacher-tile">
        <span className="avatar avatar-violet">HN</span>
        <div>
          <strong>Hoàng Nam</strong>
          <small>Giáo viên · video mô phỏng</small>
        </div>
        {!studentId && !call.mic ? <MicOff size={15} /> : <Mic size={15} />}
      </div>
      {members.map((m) => {
        const s = data.students.find((s) => s.id === m.studentId);
        if (!s) return null;
        return (
          <div className="video-tile" key={m.id}>
            <Avatar student={s} />
            <div>
              <strong>{s.name}</strong>
              <small>
                {m.studentId === studentId
                  ? call.camera
                    ? "Camera mô phỏng"
                    : "Camera tắt"
                  : "Video mô phỏng"}
              </small>
            </div>
            {m.handRaised ? (
              <Hand className="raised-hand" size={18} />
            ) : (
              <VideoOff size={16} />
            )}
          </div>
        );
      })}
      {!members.length && (
        <div className="video-empty">Học sinh đang chuẩn bị vào phòng</div>
      )}
    </div>
  );
}
function SharedStage({
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
  const { data } = useStore();
  const activity =
    session.activities.find((a) => a.id === session.currentActivityId) ||
    session.activities[0];
  const owner = session.sharedBoardOwnerId || "common";
  const board = data.boards.find(
    (b) => b.id === boardKey(session.id, activity?.id || "", owner),
  );
  const visible = owner === "common" || board?.shared;
  const member = data.members.find(
    (m) => m.sessionId === session.id && m.studentId === studentId,
  );
  if (!activity)
    return (
      <Empty
        icon={<BookOpen size={25} />}
        title="Chưa có hoạt động"
        description="Giáo viên cần thêm hoạt động vào kế hoạch."
      />
    );
  if (session.sharedView === "check")
    return (
      <QuickCheckPanel
        key={activity.id}
        session={session}
        teacher={teacher}
        studentId={studentId}
        token={token}
      />
    );
  if (session.sharedView === "board")
    return visible ? (
      <Whiteboard
        key={`${activity.id}:${owner}`}
        sessionId={session.id}
        activityId={activity.id}
        ownerId={owner}
        evidenceStudentId={teacher ? studentId : undefined}
        actorId={teacher ? "teacher" : studentId}
        teacher={teacher}
        token={token}
        canWrite={
          teacher ||
          ((owner === "common" || owner === studentId) &&
            !!member?.canWrite &&
            !!session.tools?.board)
        }
      />
    ) : (
      <Banner>
        Nháp này chưa được chia sẻ. Giáo viên có thể mở bảng chung hoặc một nháp
        đã chia sẻ.
      </Banner>
    );
  return (
    <DocumentStage key={activity.id} session={session} teacher={teacher} />
  );
}

export function TeacherRoom() {
  const { data, setData, selectedSessionId, setSelectedSessionId, go, toast } =
    useStore();
  const session =
    data.sessions.find(
      (s) =>
        s.id === selectedSessionId && !["ended", "reviewed"].includes(s.status),
    ) || data.sessions.find((s) => !["ended", "reviewed"].includes(s.status));
  if (!session)
    return (
      <main className="room-unavailable">
        <Empty
          icon={<Video size={26} />}
          title="Chưa có phòng dạy đang mở"
          description="Tạo kế hoạch buổi học để bắt đầu."
          action={
            <button className="button primary" onClick={() => go("plan")}>
              Soạn buổi học
            </button>
          }
        />
      </main>
    );
  return (
    <TeacherSession
      key={session.id}
      session={session}
      select={setSelectedSessionId}
    />
  );
}
function TeacherSession({
  session,
  select,
}: {
  session: Session;
  select: (id: string) => void;
}) {
  const { data, setData, go, toast } = useStore();
  const call = useCall(session.id);
  const [entered, setEntered] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const [panel, setPanel] = useState<
    "copilot" | "evidence" | "submissions" | "chat"
  >("copilot");
  const [studentId, setStudentId] = useState(sessionStudentIds(session)[0]);
  const [invite, setInvite] = useState(false);
  const [finish, setFinish] = useState(false);
  const [record, setRecord] = useState(false);
  const [source, setSource] = useState("");
  const [draft, setDraft] = useState("");
  const [left, setLeft] = useState(false);
  useEffect(() => {
    if (entered) window.scrollTo({ top: 0, behavior: "auto" });
  }, [entered]);
  const now = useClock();
  const recording = data.recordings.find(
    (r) => r.sessionId === session.id && r.status === "recording",
  );
  const members = data.members.filter(
    (m) =>
      m.sessionId === session.id &&
      sessionStudentIds(session).includes(m.studentId),
  );
  const sessionReactions = (data.reactions || []).filter(
    (r) => r.sessionId === session.id,
  );
  const handRaisers = members.filter((m) => m.handRaised);
  const newSubmissions = data.submissions.filter(
    (s) => s.sessionId === session.id && s.status === "new",
  );
  const current =
    session.activities.find((a) => a.id === session.currentActivityId) ||
    session.activities[0];
  const elapsed = Math.max(
    0,
    Math.floor((now - new Date(session.startedAt || now).getTime()) / 1000),
  );
  const submissions = data.submissions.filter(
    (s) => s.sessionId === session.id && s.studentId === studentId,
  );
  const changeView = (view: NonNullable<Session["sharedView"]>) =>
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === session.id ? { ...s, sharedView: view } : s,
      ),
    }));
  const enter = async () => {
    if (!session.activities.length) {
      toast("Thêm hoạt động trước khi mở phòng.", "error");
      return;
    }
    await call.connect();
    setData((prev) =>
      appendEvent(
        {
          ...prev,
          sessions: prev.sessions.map((s) =>
            s.id === session.id
              ? {
                  ...s,
                  status: "live",
                  startedAt: s.startedAt || new Date().toISOString(),
                  currentActivityId: s.currentActivityId || s.activities[0]?.id,
                }
              : s,
          ),
        },
        {
          sessionId: session.id,
          activityId: current?.id,
          kind: "activity",
          label: "Giáo viên mở phòng học",
          materialId: current?.materialId,
          shared: true,
        },
      ),
    );
    setEntered(true);
  };
  if (!entered)
    return (
      <>
        <div className="lobby-navigation">
          <button className="back-link" onClick={() => go("dashboard")}>
            <ArrowLeft size={17} />
            Về không gian quản lý
          </button>
          <SessionSelect
            value={session.id}
            onChange={select}
            statuses={["draft", "scheduled", "live"]}
          />
        </div>
        <Lobby
          session={session}
          name="Hoàng Nam"
          teacher
          call={call}
          onEnter={enter}
        />
      </>
    );
  return (
    <div className="classroom teacher-room">
      <header className="room-header">
        <button
          className="icon-button"
          aria-label="Về không gian quản lý"
          onClick={() => go("dashboard")}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="room-heading">
          <small>{session.groupName || "Phòng học 1–1"} · Giáo viên</small>
          <h1>{session.title}</h1>
        </div>
        <div className="room-header-actions">
          <button
            className="icon-button"
            aria-label={
              theme === "dark"
                ? "Chuyển sang giao diện Sáng"
                : "Chuyển sang giao diện Tối"
            }
            title={
              theme === "dark"
                ? "Giao diện Sáng"
                : "Giao diện Tối (Bảo vệ mắt)"
            }
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Status tone="violet">Demo</Status>
          <span className="room-timer">
            {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
            {String(elapsed % 60).padStart(2, "0")}
          </span>
          <button
            className="button ghost small"
            onClick={() => setInvite(true)}
          >
            <Link size={16} />
            Mời học sinh
          </button>
          <button
            className="icon-button"
            aria-label="Toàn màn hình"
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              else
                document.documentElement
                  .requestFullscreen?.()
                  .catch(() =>
                    toast("Không mở được chế độ toàn màn hình.", "info"),
                  );
            }}
          >
            <Maximize size={17} />
          </button>
        </div>
      </header>
      {handRaisers.length > 0 && (
        <div className="room-heads-up">
          <span>
            ✋ <strong>Học sinh giơ tay:</strong>{" "}
            {handRaisers
              .map(
                (m) =>
                  data.students.find((s) => s.id === m.studentId)?.name,
              )
              .filter(Boolean)
              .join(", ")}
          </span>
          <button
            onClick={() => {
              const first = handRaisers[0];
              if (first) {
                setStudentId(first.studentId);
                setData((prev) => ({
                  ...prev,
                  members: prev.members.map((m) =>
                    m.id === first.id ? { ...m, handRaised: false } : m,
                  ),
                }));
              }
            }}
          >
            Tiếp nhận ngay
          </button>
        </div>
      )}
      {newSubmissions.length > 0 && (
        <div className="room-heads-up">
          <span>
            📝 Có <strong>{newSubmissions.length}</strong> bài nộp mới trong buổi!
          </span>
          <button
            onClick={() => {
              setPanel("submissions");
              setRightCollapsed(false);
            }}
          >
            Mở bài nộp
          </button>
        </div>
      )}
      {recording && (
        <div className="recording-indicator">
          <span /> Đang ghi hình mô phỏng · Chỉ video và nội dung chung
          <button
            onClick={() => {
              setData((prev) => ({
                ...prev,
                recordings: prev.recordings.map((r) =>
                  r.id === recording.id ? mockRecording.stop(r) : r,
                ),
              }));
              toast("Đã dừng ghi. Bản ghi đang được xử lý.");
            }}
          >
            Dừng ghi
          </button>
        </div>
      )}
      {call.state === "disconnected" && (
        <Banner error>
          Kết nối cuộc gọi bị gián đoạn. Các công cụ ghi nhận vẫn sử dụng được.
          <button className="button ghost small" onClick={() => call.connect()}>
            Kết nối lại
          </button>
        </Banner>
      )}
      <div
        className={
          "classroom-layout" +
          (leftCollapsed ? " left-collapsed" : "") +
          (rightCollapsed ? " right-collapsed" : "")
        }
      >
        {leftCollapsed ? (
          <aside className="room-left collapsed-panel">
            <button
              className="panel-collapse-btn"
              onClick={() => setLeftCollapsed(false)}
              title="Mở rộng lộ trình & danh sách học sinh"
              aria-label="Mở rộng lộ trình"
            >
              <ChevronRight size={16} />
            </button>
            <span className="collapsed-panel-label">
              Lộ trình ({session.activities.length})
            </span>
          </aside>
        ) : (
          <aside className="room-left">
            <div className="panel-head-row">
              <SectionHead
                title="Lộ trình"
                meta={`${session.activities.length} hoạt động · ${session.duration} phút`}
              />
              <button
                className="panel-collapse-btn"
                onClick={() => setLeftCollapsed(true)}
                title="Thu gọn lộ trình để mở rộng bảng viết"
                aria-label="Thu gọn lộ trình"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
            {session.activities.map((a, i) => (
            <button
              className={
                "room-activity " + (current?.id === a.id ? "active" : "")
              }
              key={a.id}
              onClick={() =>
                setData((prev) =>
                  appendEvent(
                    {
                      ...prev,
                      reactions: (prev.reactions || []).filter(
                        (r) => r.sessionId !== session.id,
                      ),
                      sessions: prev.sessions.map((s) =>
                        s.id === session.id
                          ? {
                              ...s,
                              currentActivityId: a.id,
                              materialPage: 0,
                              sharedBoardOwnerId: "common",
                            }
                          : s,
                      ),
                    },
                    {
                      sessionId: session.id,
                      activityId: a.id,
                      materialId: a.materialId,
                      kind: "activity",
                      label: `Chuyển sang ${a.title}`,
                      shared: true,
                    },
                  ),
                )
              }
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <strong>{a.title}</strong>
                <small>
                  {a.type} · {a.duration} phút
                </small>
              </div>
            </button>
          ))}
          <SectionHead title="Học sinh" meta="Bài và ghi chú được lưu riêng." />
          {members.map((m) => {
            const s = data.students.find((s) => s.id === m.studentId);
            if (!s) return null;
            return (
              <div
                className={
                  "room-member " + (studentId === m.studentId ? "selected" : "")
                }
                key={m.id}
              >
                <button
                  className="member-name"
                  onClick={() => setStudentId(m.studentId)}
                >
                  <Avatar student={s} size="sm" />
                  <span>
                    <strong>{s.name}</strong>
                    <small>
                      {
                        {
                          invited: "Chưa vào",
                          waiting: "Đang chờ",
                          joined: "Trong phòng",
                          disconnected: "Mất kết nối",
                          left: "Đã rời",
                        }[m.state]
                      }
                    </small>
                  </span>
                  {m.handRaised && <Hand size={17} />}
                </button>
                {m.state === "waiting" ? (
                  <button
                    className="button primary small"
                    onClick={() =>
                      setData((prev) => ({
                        ...prev,
                        members: prev.members.map((p) =>
                          p.id === m.id ? { ...p, state: "joined" } : p,
                        ),
                      }))
                    }
                  >
                    Cho vào
                  </button>
                ) : (
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={m.canWrite}
                      onChange={(e) => {
                        const canWrite = e.target.checked;
                        setData((prev) => ({
                          ...prev,
                          members: prev.members.map((p) =>
                            p.id === m.id ? { ...p, canWrite } : p,
                          ),
                        }));
                      }}
                    />
                    Cho phép viết
                  </label>
                )}
                {m.handRaised && (
                  <button
                    className="text-button"
                    onClick={() =>
                      setData((prev) => ({
                        ...prev,
                        members: prev.members.map((p) =>
                          p.id === m.id ? { ...p, handRaised: false } : p,
                        ),
                      }))
                    }
                  >
                    Đã tiếp nhận giơ tay
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() => setDraft(m.studentId)}
                >
                  Xem nháp riêng
                </button>
              </div>
            );
          })}
          <details className="demo-controls">
            <summary>Tình huống kết nối demo</summary>
            <button
              className="button ghost small"
              onClick={() => call.disconnect()}
            >
              Mô phỏng mất kết nối
            </button>
          </details>
        </aside>
      )}
      <main className="room-main">
          <VideoStrip session={session} call={call} />
          <div className="room-stage">
            <div className="stage-top">
              <div>
                <small>ĐANG CHIA SẺ VỚI HỌC SINH</small>
                <h2>{current?.title}</h2>
              </div>
              <div className="row-actions">
                {sessionReactions.length > 0 && (
                  <div
                    className="teacher-reaction-hud"
                    title="Phản hồi thời gian thực từ học sinh"
                  >
                    {ROOM_REACTIONS.map((r) => {
                      const count = sessionReactions.filter(
                        (x) => x.label === r.label,
                      ).length;
                      if (!count) return null;
                      return (
                        <span key={r.label} className="reaction-hud-badge">
                          {r.emoji} {count}
                        </span>
                      );
                    })}
                    <button
                      className="text-button"
                      style={{ fontSize: 11, minHeight: "auto", padding: 0 }}
                      onClick={() =>
                        setData((prev) => ({
                          ...prev,
                          reactions: (prev.reactions || []).filter(
                            (x) => x.sessionId !== session.id,
                          ),
                        }))
                      }
                      title="Làm mới phản hồi"
                    >
                      Xóa
                    </button>
                  </div>
                )}
                <Status tone="green">
                  <Monitor size={13} />
                  Nội dung chung
                </Status>
              </div>
            </div>
            <div
              className="room-tabs"
              role="tablist"
              aria-label="Nội dung chia sẻ"
            >
              {(
                [
                  { id: "document", label: "Đề bài", icon: BookOpen },
                  { id: "board", label: "Bảng chung", icon: Pencil },
                  { id: "check", label: "Kiểm tra", icon: ClipboardCheck },
                ] as const
              ).map((t) => (
                <button
                  role="tab"
                  aria-selected={(session.sharedView || "document") === t.id}
                  key={t.id}
                  className={
                    (session.sharedView || "document") === t.id ? "active" : ""
                  }
                  onClick={() => changeView(t.id)}
                >
                  <t.icon size={16} />
                  {t.label}
                </button>
              ))}
            </div>
            {session.sharedView === "board" && (
              <label className="shared-board-picker">
                Bảng đang trình bày
                <select
                  aria-label="Bảng đang trình bày"
                  value={session.sharedBoardOwnerId || "common"}
                  onChange={(e) => {
                    const owner = e.target.value;
                    setData((prev) => ({
                      ...prev,
                      sessions: prev.sessions.map((s) =>
                        s.id === session.id
                          ? { ...s, sharedBoardOwnerId: owner }
                          : s,
                      ),
                    }));
                  }}
                >
                  <option value="common">Bảng chung của cả lớp</option>
                  {data.boards
                    .filter(
                      (b) =>
                        b.sessionId === session.id &&
                        b.activityId === current?.id &&
                        b.shared &&
                        b.ownerId !== "common",
                    )
                    .map((b) => (
                      <option key={b.id} value={b.ownerId}>
                        Nháp đã chia sẻ ·{" "}
                        {data.students.find((s) => s.id === b.ownerId)?.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <SharedStage session={session} teacher studentId={studentId} />
            {current && (
              <div className="activity-completion">
                <span>
                  {session.completedActivityIds?.length || 0}/
                  {session.activities.length} hoạt động hoàn tất
                </span>
                <button
                  className="button ghost small"
                  onClick={() =>
                    setData((prev) => ({
                      ...prev,
                      sessions: prev.sessions.map((s) =>
                        s.id === session.id
                          ? {
                              ...s,
                              completedActivityIds:
                                s.completedActivityIds?.includes(current.id)
                                  ? s.completedActivityIds.filter(
                                      (id) => id !== current.id,
                                    )
                                  : [
                                      ...(s.completedActivityIds || []),
                                      current.id,
                                    ],
                            }
                          : s,
                      ),
                    }))
                  }
                >
                  {session.completedActivityIds?.includes(current.id)
                    ? "Đánh dấu chưa xong"
                    : "Đánh dấu hoạt động đã xong"}
                </button>
              </div>
            )}
          </div>
        </main>
        {rightCollapsed ? (
          <aside className="room-right collapsed-panel">
            <button
              className="panel-collapse-btn"
              onClick={() => setRightCollapsed(false)}
              title="Mở rộng bảng điều khiển sư phạm"
              aria-label="Mở rộng bảng điều khiển"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="collapsed-panel-label">Copilot & Ghi nhận</span>
          </aside>
        ) : (
          <aside className="room-right">
            <div className="panel-head-row">
              <div className="private-panel-label" style={{ marginBottom: 0 }}>
                <ShieldCheck size={15} />
                Chỉ giáo viên thấy
              </div>
              <button
                className="panel-collapse-btn"
                onClick={() => setRightCollapsed(true)}
                title="Thu gọn bảng điều khiển sư phạm để mở rộng bảng viết"
                aria-label="Thu gọn bảng điều khiển"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              aria-label="Học sinh đang quan sát"
            >
              {sessionStudentIds(session).map((id) => (
                <option key={id} value={id}>
                  {data.students.find((s) => s.id === id)?.name}
                </option>
              ))}
            </select>
            <div className="room-tabs panel-navigation">
              {(
                [
                  { id: "copilot", label: "Copilot" },
                  { id: "evidence", label: "Ghi nhận" },
                  { id: "submissions", label: "Bài nộp" },
                  { id: "chat", label: "Chat" },
                ] as const
              ).map((t) => (
                <button
                  className={panel === t.id ? "active" : ""}
                  key={t.id}
                  onClick={() => setPanel(t.id)}
                >
                  {t.label}
                  {t.id === "submissions" && <span>{submissions.length}</span>}
                </button>
              ))}
            </div>
            {panel === "copilot" && (
              <CopilotPanel
                key={`${studentId}:${current?.id}`}
                session={session}
                studentId={studentId}
              />
            )}{" "}
            {panel === "evidence" && (
              <CapturePanel
                key={studentId}
                session={session}
                studentId={studentId}
              />
            )}{" "}
            {panel === "chat" && (
              <ChatPanel session={session} actorId="teacher" teacher />
            )}{" "}
            {panel === "submissions" && (
              <div>
                <SectionHead
                  title="Bài của học sinh"
                  meta="Chọn bài để xem gốc và nhận xét."
                />
                {submissions.length ? (
                  submissions.map((s) => (
                    <div className="room-submission" key={s.id}>
                      <strong>{s.title}</strong>
                      <p>{s.answer || s.fileName}</p>
                      <Status tone={s.status === "reviewed" ? "green" : "amber"}>
                        {s.status === "reviewed" ? "Đã duyệt" : "Cần xem"}
                      </Status>
                      <button
                        className="text-button"
                        onClick={() => {
                          const ev = data.evidence.find(
                            (e) => e.submissionId === s.id,
                          );
                          if (ev) setSource(ev.id);
                          else setLeft(true);
                        }}
                      >
                        Xem & chấm bài
                      </button>
                    </div>
                  ))
                ) : (
                  <Empty
                    icon={<ClipboardCheck size={23} />}
                    title="Chưa có bài nộp"
                    description="Học sinh gửi từ công cụ Bài làm trong phòng."
                  />
                )}
                <button
                  className="button ghost full"
                  onClick={() => setLeft(true)}
                >
                  Mở hộp chấm bài
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
      <footer className="room-controls">
        <div className="row-actions">
          <button
            className={"button ghost " + (!call.mic ? "muted-control" : "")}
            onClick={() => call.setMic(!call.mic)}
          >
            {call.mic ? <Mic size={18} /> : <MicOff size={18} />}{" "}
            {call.mic ? "Mic bật" : "Mic tắt"}
          </button>
          <button
            className="button ghost"
            onClick={() => call.setCamera(!call.camera)}
          >
            {call.camera ? <Video size={18} /> : <VideoOff size={18} />}Camera
          </button>
          <button className="button ghost" onClick={() => setPanel("chat")}>
            <MessageSquare size={18} />
            Chat
          </button>
        </div>
        <div className="row-actions">
          <button
            className="button ghost"
            onClick={() => setRecord(true)}
            disabled={!!recording}
          >
            <Film size={18} />
            Ghi hình
          </button>
          <button
            className="button danger-button"
            onClick={() => setFinish(true)}
          >
            Kết thúc buổi
          </button>
        </div>
      </footer>
      {invite && (
        <Modal
          title="Thành viên & liên kết tham gia"
          onClose={() => setInvite(false)}
          wide
        >
          <SessionSetup session={session} />
        </Modal>
      )}
      {draft && current && (
        <Modal
          title={"Nháp của " + data.students.find((s) => s.id === draft)?.name}
          onClose={() => setDraft("")}
          wide
        >
          <Whiteboard
            key={`${draft}:${current.id}`}
            sessionId={session.id}
            activityId={current.id}
            ownerId={draft}
            actorId="teacher"
            teacher
          />
          {data.attempts
            .filter(
              (a) =>
                a.sessionId === session.id &&
                a.studentId === draft &&
                a.activityId === current.id,
            )
            .map((a) => (
              <button
                className="evidence-link"
                key={a.id}
                onClick={() => {
                  const ev = data.evidence.find((e) => e.sourceId === a.id);
                  if (ev) setSource(ev.id);
                }}
              >
                Lần thử · {new Date(a.createdAt).toLocaleTimeString("vi-VN")}
              </button>
            ))}
        </Modal>
      )}
      {source && (
        <SourceViewer evidenceId={source} onClose={() => setSource("")} />
      )}{" "}
      {record && (
        <Modal
          title="Bắt đầu ghi hình mô phỏng?"
          onClose={() => setRecord(false)}
        >
          <p>
            Bản ghi gồm video và vùng nội dung chung. Ghi chú, Copilot và nháp
            chưa chia sẻ của học sinh nằm ngoài bản ghi.
          </p>
          <Banner>
            Bản UI này lưu sự kiện để phát lại mô phỏng; chưa ghi âm hoặc tạo
            tệp video.
          </Banner>
          <div className="modal-actions">
            <button className="button ghost" onClick={() => setRecord(false)}>
              Hủy
            </button>
            <button
              className="button primary"
              onClick={() => {
                const entry = mockRecording.start(session.id);
                setData((prev) => {
                  const board = prev.boards.find(
                    (b) =>
                      b.id ===
                      boardKey(
                        session.id,
                        current?.id || "",
                        session.sharedBoardOwnerId || "common",
                      ),
                  );
                  return appendEvent(
                    { ...prev, recordings: [...prev.recordings, entry] },
                    {
                      sessionId: session.id,
                      activityId: current?.id,
                      materialId: current?.materialId,
                      kind: "recording",
                      label: "Bắt đầu ghi hình",
                      board: board?.shared
                        ? { strokes: board.strokes, text: boardText(board) }
                        : undefined,
                      shared: true,
                    },
                  );
                });
                setRecord(false);
              }}
            >
              Bắt đầu ghi
            </button>
          </div>
        </Modal>
      )}
      {finish && (
        <Modal title="Kết thúc buổi học?" onClose={() => setFinish(false)}>
          <p>
            Học sinh sẽ rời phòng, các bài làm đã lưu được giữ lại. Bản ghi đang
            chạy sẽ được dừng và xử lý.
          </p>
          <div className="modal-actions">
            <button className="button ghost" onClick={() => setFinish(false)}>
              Tiếp tục dạy
            </button>
            <button
              className="button danger-button"
              onClick={() => {
                setData((prev) => ({
                  ...prev,
                  sessions: prev.sessions.map((s) =>
                    s.id === session.id
                      ? {
                          ...s,
                          status: "ended",
                          endedAt: new Date().toISOString(),
                        }
                      : s,
                  ),
                  members: prev.members.map((m) =>
                    m.sessionId === session.id ? { ...m, state: "left" } : m,
                  ),
                  checks: prev.checks.map((c) =>
                    c.sessionId === session.id ? { ...c, status: "closed" } : c,
                  ),
                  recordings: prev.recordings.map((r) =>
                    r.sessionId === session.id && r.status === "recording"
                      ? mockRecording.stop(r)
                      : r,
                  ),
                }));
                go("summary");
                toast("Buổi học đã kết thúc. Hãy duyệt tổng kết.");
              }}
            >
              Kết thúc buổi
            </button>
          </div>
        </Modal>
      )}
      {left && (
        <Modal title="Mở hộp chấm bài?" onClose={() => setLeft(false)}>
          <p>
            Buổi học tiếp tục trong nền; quay lại Phòng dạy để tiếp tục điều
            khiển.
          </p>
          <div className="modal-actions">
            <button className="button ghost" onClick={() => setLeft(false)}>
              Ở lại phòng
            </button>
            <button className="button primary" onClick={() => go("grading")}>
              Mở chấm bài
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function GuestPortal() {
  const { data } = useStore();
  useClock();
  const token = new URLSearchParams(location.search).get("invite") || "";
  const invite = data.invites.find((i) => i.token === token);
  const session = data.sessions.find((s) => s.id === invite?.sessionId);
  const student = data.students.find((s) => s.id === invite?.studentId);
  if (
    !invite ||
    !session ||
    !student ||
    !sessionStudentIds(session).includes(student.id) ||
    !inviteValid(invite)
  )
    return (
      <main className="room-unavailable">
        <div className="auth-brand">
          <span className="brand-mark">
            <Sparkles size={22} />
          </span>
          <strong>AI Teaching Copilot</strong>
        </div>
        <Empty
          icon={<ShieldCheck size={28} />}
          title={
            !invite
              ? "Liên kết không hợp lệ"
              : invite.revoked
                ? "Quyền tham gia đã được thu hồi"
                : "Liên kết đã hết hạn"
          }
          description="Liên hệ giáo viên để nhận liên kết mới. Nội dung buổi học hiện không thể truy cập."
        />
      </main>
    );
  if (["ended", "reviewed"].includes(session.status))
    return <GuestFinished session={session} studentId={student.id} />;
  return (
    <StudentSession
      key={`${session.id}:${student.id}`}
      session={session}
      studentId={student.id}
      token={token}
    />
  );
}
function GuestFinished({
  session,
  studentId,
}: {
  session: Session;
  studentId: string;
}) {
  const { data } = useStore();
  const submissions = data.submissions.filter(
    (s) => s.sessionId === session.id && s.studentId === studentId,
  );
  return (
    <main className="guest-finished">
      <Status tone="green">Buổi học đã kết thúc</Status>
      <h1>Cảm ơn bạn đã tham gia!</h1>
      <p>{session.title}</p>
      <section className="card">
        <h2>Bài đã gửi của bạn</h2>
        {submissions.length ? (
          submissions.map((s) => (
            <div className="submission-receipt" key={s.id}>
              <strong>{s.title}</strong>
              <p>
                {s.finalFeedback ||
                  "Giáo viên sẽ xem và phản hồi sau buổi học."}
              </p>
            </div>
          ))
        ) : (
          <p className="muted">Bạn chưa gửi bài trong buổi này.</p>
        )}
      </section>
      <p className="muted">
        Phòng học đã đóng; giáo viên sẽ gửi liên kết mới cho buổi tiếp theo.
      </p>
    </main>
  );
}
function StudentSession({
  session,
  studentId,
  token,
}: {
  session: Session;
  studentId: string;
  token: string;
}) {
  const { data, setData } = useStore();
  const { theme, toggle: toggleTheme } = useTheme();
  const student = data.students.find((s) => s.id === studentId)!;
  const member = data.members.find(
    (m) => m.sessionId === session.id && m.studentId === studentId,
  );
  const call = useCall(session.id);
  const [entered, setEntered] = useState(false);
  const [tab, setTab] = useState<
    "follow" | "draft" | "check" | "submit" | "chat"
  >("follow");
  const [leave, setLeave] = useState(false);
  useEffect(() => {
    if (entered && member?.state === "joined")
      window.scrollTo({ top: 0, behavior: "auto" });
  }, [entered, member?.state]);
  const activity =
    session.activities.find((a) => a.id === session.currentActivityId) ||
    session.activities[0];
  const recording = data.recordings.some(
    (r) => r.sessionId === session.id && r.status === "recording",
  );
  const enter = async () => {
    await call.connect();
    setData((prev) => {
      const valid = prev.invites.find((i) => i.token === token);
      if (!inviteValid(valid)) return prev;
      const existing = prev.members.find(
        (m) => m.sessionId === session.id && m.studentId === studentId,
      );
      const state =
        existing?.state === "joined" || existing?.state === "disconnected"
          ? ("joined" as const)
          : ("waiting" as const);
      return {
        ...prev,
        members: existing
          ? prev.members.map((m) =>
              m.id === existing.id ? { ...m, state, consent: true } : m,
            )
          : [
              ...prev.members,
              {
                id: `${session.id}:${studentId}`,
                sessionId: session.id,
                studentId,
                state,
                canWrite: true,
                handRaised: false,
                consent: true,
              },
            ],
      };
    });
    setEntered(true);
  };
  if (!entered)
    return (
      <Lobby
        session={session}
        name={student.name}
        teacher={false}
        call={call}
        onEnter={enter}
      />
    );
  if (member?.state === "left")
    return (
      <main className="room-unavailable">
        <Empty
          icon={<Users size={25} />}
          title="Bạn đã rời phòng"
          description="Bạn có thể xin vào lại khi buổi học còn mở."
          action={
            <button
              className="button primary"
              onClick={() => setEntered(false)}
            >
              Xin vào lại
            </button>
          }
        />
      </main>
    );
  if (member?.state === "waiting" || !member)
    return (
      <main className="waiting-room">
        <CallPreview name={student.name} camera={call.camera} mic={call.mic} />
        <Status tone="amber">Đang chờ giáo viên cho vào</Status>
        <h1>{session.title}</h1>
        <p>Giữ trang này mở. Bạn sẽ vào phòng ngay khi giáo viên xác nhận.</p>
        <button
          className="button ghost"
          onClick={() => {
            setData((prev) => ({
              ...prev,
              members: prev.members.map((m) =>
                m.sessionId === session.id && m.studentId === studentId
                  ? { ...m, state: "left" }
                  : m,
              ),
            }));
            setEntered(false);
          }}
        >
          Hủy yêu cầu
        </button>
      </main>
    );
  const connected = call.state === "connected" && member.state === "joined";
  return (
    <div className="classroom student-room">
      <header className="room-header">
        <span className="brand-mark">
          <GraduationIcon />
        </span>
        <div className="room-heading">
          <small>{student.name} · Không gian học sinh</small>
          <h1>{session.title}</h1>
        </div>
        <div className="room-header-actions">
          <button
            className="icon-button"
            aria-label={
              theme === "dark"
                ? "Chuyển sang giao diện Sáng"
                : "Chuyển sang giao diện Tối"
            }
            title={
              theme === "dark"
                ? "Giao diện Sáng"
                : "Giao diện Tối (Bảo vệ mắt)"
            }
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Status tone="violet">Demo</Status>
          {recording && (
            <Status tone="amber">
              <Film size={13} />
              Đang ghi hình
            </Status>
          )}
        </div>
      </header>
      {!connected && (
        <Banner error>
          Kết nối bị gián đoạn. Bài đã lưu được giữ lại.
          <button
            className="button ghost small"
            disabled={call.state === "connecting"}
            onClick={async () => {
              await call.connect();
              setData((prev) => ({
                ...prev,
                members: prev.members.map((m) =>
                  m.sessionId === session.id &&
                  m.studentId === studentId &&
                  m.state === "disconnected"
                    ? { ...m, state: "joined" }
                    : m,
                ),
              }));
            }}
          >
            {call.state === "connecting" ? "Đang kết nối…" : "Kết nối lại"}
          </button>
        </Banner>
      )}
      <main className="student-room-body">
        <VideoStrip session={session} studentId={studentId} call={call} />
        <div className="student-activity">
          <span className="eyebrow">HOẠT ĐỘNG HIỆN TẠI</span>
          <h2>{activity?.title}</h2>
          <p>{activity?.description}</p>
        </div>
        <div
          className="student-reaction-bar"
          role="toolbar"
          aria-label="Phản hồi nhanh"
        >
          <small>Phản hồi nhanh:</small>
          {ROOM_REACTIONS.map((r) => {
            const active = (data.reactions || []).some(
              (x) =>
                x.sessionId === session.id &&
                x.studentId === studentId &&
                x.label === r.label,
            );
            return (
              <button
                key={r.label}
                type="button"
                className={"reaction-pill " + (active ? "active" : "")}
                disabled={!connected}
                onClick={() => {
                  setData((prev) => {
                    const existing = (prev.reactions || []).filter(
                      (x) =>
                        !(
                          x.sessionId === session.id &&
                          x.studentId === studentId
                        ),
                    );
                    const next = active
                      ? existing
                      : [
                          ...existing,
                          {
                            id: uid("react"),
                            sessionId: session.id,
                            studentId,
                            emoji: r.emoji,
                            label: r.label,
                            createdAt: new Date().toISOString(),
                          },
                        ];
                    return { ...prev, reactions: next };
                  });
                }}
              >
                <span>{r.emoji}</span>
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>
        <div
          className="room-tabs student-tabs"
          role="tablist"
          aria-label="Công cụ học sinh"
        >
          {(
            [
              { id: "follow", label: "Theo giáo viên", icon: Monitor },
              { id: "draft", label: "Nháp của tôi", icon: Pencil },
              { id: "check", label: "Kiểm tra", icon: ClipboardCheck },
              { id: "submit", label: "Bài làm", icon: BookOpen },
              { id: "chat", label: "Chat", icon: MessageSquare },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>
        <section
          className={
            "student-stage " + (!connected ? "connection-blocked" : "")
          }
        >
          <fieldset disabled={!connected} className="room-fieldset">
            {tab === "follow" && (
              <SharedStage
                session={session}
                studentId={studentId}
                token={token}
              />
            )}{" "}
            {tab === "draft" &&
              activity &&
              (session.tools?.board ? (
                <Whiteboard
                  key={activity.id}
                  sessionId={session.id}
                  activityId={activity.id}
                  ownerId={studentId}
                  actorId={studentId}
                  token={token}
                  canWrite={!!member.canWrite && connected}
                />
              ) : (
                <Banner>Giáo viên đang tắt công cụ bảng nháp.</Banner>
              ))}
            {tab === "check" && (
              <QuickCheckPanel
                key={activity?.id}
                session={session}
                studentId={studentId}
                token={token}
              />
            )}{" "}
            {tab === "submit" && (
              <SubmissionPanel
                session={session}
                studentId={studentId}
                token={token}
              />
            )}{" "}
            {tab === "chat" && (
              <ChatPanel session={session} actorId={studentId} token={token} />
            )}
          </fieldset>
        </section>
        <details className="demo-controls">
          <summary>Tình huống kết nối demo</summary>
          <button
            className="button ghost small"
            onClick={() => {
              call.disconnect();
              setData((prev) => ({
                ...prev,
                members: prev.members.map((m) =>
                  m.sessionId === session.id && m.studentId === studentId
                    ? { ...m, state: "disconnected" }
                    : m,
                ),
              }));
            }}
          >
            Mô phỏng mất kết nối
          </button>
        </details>
      </main>
      <footer className="room-controls">
        <div className="row-actions">
          <button
            className="button ghost"
            onClick={() => call.setMic(!call.mic)}
          >
            {call.mic ? <Mic size={18} /> : <MicOff size={18} />}Mic
          </button>
          <button
            className="button ghost"
            onClick={() => call.setCamera(!call.camera)}
          >
            {call.camera ? <Video size={18} /> : <VideoOff size={18} />}Camera
          </button>
          <button
            className={"button ghost " + (member.handRaised ? "selected" : "")}
            disabled={!connected}
            onClick={() =>
              setData((prev) => {
                if (
                  !canStudentAct(prev, session.id, studentId, undefined, token)
                )
                  return prev;
                return {
                  ...prev,
                  members: prev.members.map((m) =>
                    m.id === member.id
                      ? { ...m, handRaised: !m.handRaised }
                      : m,
                  ),
                };
              })
            }
          >
            <Hand size={18} />
            {member.handRaised ? "Hạ tay" : "Giơ tay"}
          </button>
        </div>
        <button className="button danger-button" onClick={() => setLeave(true)}>
          Rời phòng
        </button>
      </footer>
      {leave && (
        <Modal title="Rời phòng học?" onClose={() => setLeave(false)}>
          <p>Nháp và bài đã gửi của bạn được giữ lại.</p>
          <div className="modal-actions">
            <button className="button ghost" onClick={() => setLeave(false)}>
              Ở lại
            </button>
            <button
              className="button danger-button"
              onClick={() => {
                setData((prev) => ({
                  ...prev,
                  members: prev.members.map((m) =>
                    m.id === member.id ? { ...m, state: "left" } : m,
                  ),
                }));
                call.disconnect();
                setLeave(false);
              }}
            >
              Rời phòng
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function GraduationIcon() {
  return <BookOpen size={20} />;
}
