import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { io } from "socket.io-client";
import { api, getAccessToken } from "./onlineApi";
import { statusLabel } from "./statusLabels";
import { ReviewPanel } from "./ReviewPanel";
import { SubmissionForm } from "./SubmissionForm";
import { OnlineBoard, type BoardState } from "./OnlineBoard";
import { MaterialViewer } from "./MaterialViewer";
import { PageQuestions, type PageQuestion } from "./PageQuestions";
import { BoundedReconnectQueue } from "./reconnectQueue";
import { useClassVideo, type ClassVideo, type VideoSeat } from "./media/useClassVideo";
import type { VideoPlayer } from "@zoom/videosdk";
import {
  ArrowLeft,
  BookOpen,
  Camera,
  Check,
  ClipboardCheck,
  Copy,
  Eye,
  FileText,
  Hand,
  Clock,
  Layers,
  Link2,
  ListChecks,
  Lock,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  Moon,
  PenLine,
  Send,
  Shuffle,
  Sparkles,
  Square,
  Upload,
  UserPlus,
  Video,
  VideoOff,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import "./room.css";
import "./online-restoration.css";
import { AITeachingPanel } from "./AITeachingPanel";
import { AttendanceDialog } from "./Classes";
import { qrSvgPath } from "./qr";

type Grant = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  studentId: string;
  memberId: string;
  displayName: string;
};
type Tools = Record<"board" | "upload" | "check" | "chat", boolean>;
const toolNames = {
  board: "Bảng",
  upload: "Nộp bài",
  check: "Kiểm tra",
  chat: "Trò chuyện",
} as const;
type Member = {
  id: string;
  studentId: string;
  state: string;
  displayName: string;
  toolOverrides?: Partial<Tools>;
  studentIdRef?: { name: string };
  handRaised?: boolean;
  following?: boolean;
};
const memberName = (m: Member) => m.displayName || m.studentIdRef?.name || m.studentId;
const initialsOf = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const pick =
    words.length > 1
      ? words[words.length - 2][0] + words[words.length - 1][0]
      : words[0].slice(0, 2);
  return pick.toUpperCase();
};
const lastName = (name: string) => name.trim().split(/\s+/).slice(-2).join(" ");
const hueOf = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};
const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
};
type Room = {
  waiting?: boolean;
  capabilities?: {
    boardWrite: boolean;
    upload?: boolean;
    check?: boolean;
    chat?: boolean;
  };
  sessionStatus?: string;
  members?: {
    id: string;
    displayName: string;
    initials?: string;
    color?: string;
    handRaised?: boolean;
  }[];
  activities?: { id: string; title: string; description: string; duration: number | null }[];
  session?: {
    id: string;
    title: string;
    status: "draft" | "scheduled" | "live" | "ended" | "reviewed";
    startedAt?: string | null;
    version: number;
    sharedGoal: string;
    goal?: string;
    currentActivityId: string | null;
    completedActivityIds?: string[];
    sharedView?: "document" | "board" | "check";
    sharedBoardOwnerId?: string;
    materialPage?: number;
    tools?: Tools;
    Activity_sessionId_items?: {
      id: string;
      title: string;
      duration: number | null;
      materialId?: string | null;
      materialVersion?: number | null;
      description: string;
      teacherNotes?: string | null;
      materialStartPage?: number;
    }[];
    RoomMember_sessionId_items?: Member[];
  };
  boards?: BoardState[];
  sharedBoard?: BoardState | null;
  currentMaterial?: {
    id: string;
    title: string;
    version: number;
    readUrl: string;
    page: number;
  } | null;
  annotations?: {
    id: string;
    materialId?: string;
    materialVersion?: number;
    activityId?: string;
    page: number;
    x: number;
    y: number;
    text: string;
  }[];
  invites?: {
    id: string;
    studentId: string;
    state: string;
    expiresAt: string;
  }[];
  messages?: { id: string; authorId: string; text: string; createdAt?: string }[];
  roomMessages?: { id: string; authorId: string; text: string; createdAt?: string }[];
  commonBoard?: BoardState | null;
  ownBoard?: BoardState | null;
  evidence?: {
    id: string;
    studentId: string;
    title: string;
    detail: string;
    support: string;
    sourceType: string;
    sourceId: string | null;
    sourceVersion: number | null;
    version: number;
    status: string;
    isObservation: boolean;
  }[];
  claims?: {
    id: string;
    studentId: string;
    text: string;
    evidenceIds: string[];
    status: string;
    revision: number;
    staleReason: string | null;
  }[];
  lastEventSeq?: number;
  activeQuickCheck?: { id: string; question: string } | null;
  ownCheckResponse?: { answer: string } | null;
  ownSubmissions?: {
    id: string;
    title: string;
    answer: string;
    finalFeedback: string | null;
    support?: string | null;
  }[];
  checks?: {
    id: string;
    question: string;
    status: string;
    CheckResponse_checkId_items?: {
      id: string;
      studentId: string;
      answer: string;
      support: string | null;
      feedback: string | null;
    }[];
  }[];
  submissions?: {
    id: string;
    studentId: string;
    title: string;
    answer: string;
    finalFeedback: string | null;
    fileName?: string | null;
  }[];
};
const savedKey = "classroom-grant";
let invite = new URL(location.href).searchParams.get("invite") || "";
if (invite) {
  const url = new URL(location.href);
  url.searchParams.delete("invite");
  history.replaceState(null, "", url);
}
export const hasStudentRoom = () =>
  !!invite || !!sessionStorage.getItem(savedKey);
let restorePromise: Promise<Grant> | null = null;
async function studentRequest<T>(
  path: string,
  init: RequestInit = {},
  token = "",
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw Object.assign(
      new Error(data?.error?.message || "Không thể hoàn thành yêu cầu"),
      { status: response.status },
    );
  }
  return response.json();
}
function saveGrant(g: Grant) {
  sessionStorage.setItem(savedKey, g.refreshToken);
}
function restoreGrant() {
  const refreshToken = sessionStorage.getItem(savedKey);
  if (!refreshToken)
    return Promise.reject(new Error("Phiên phòng học không tồn tại"));
  if (!restorePromise)
    restorePromise = studentRequest<Grant>("/room/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    })
      .then((g) => {
        saveGrant(g);
        return g;
      })
      .finally(() => {
        restorePromise = null;
      });
  return restorePromise;
}
export function StudentEntry() {
  const [grant, setGrant] = useState<Grant | null>(null);
  const [preview, setPreview] = useState<{
    sessionTitle: string;
    studentDefaultName: string;
  } | null>(null);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (invite)
      studentRequest<typeof preview>("/room/invite-preview", {
        method: "POST",
        body: JSON.stringify({ token: invite }),
      })
        .then((p) => {
          if (active && p) {
            setPreview(p);
            setName(p.studentDefaultName);
          }
        })
        .catch((e) => active && setError(e.message));
    else
      restoreGrant()
        .then((g) => active && setGrant(g))
        .catch((e) => {
          sessionStorage.removeItem(savedKey);
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, []);
  if (grant)
    return (
      <div className="online-restored online-restored--student">
        <LiveRoom
          sessionId={grant.sessionId}
          grant={grant}
          onExit={() => {
            sessionStorage.removeItem(savedKey);
            location.href = "/";
          }}
        />
      </div>
    );
  return (
    <div className="online-restored online-restored--student">
      <div className="lr lr--hs lr--join">
        <header className="lr-top">
          <div className="lr-top__l">
            <span className="lr-cls" aria-hidden="true">
              <Sparkles size={17} />
            </span>
            <div className="lr-top__t">
              <h1>AI Teaching Copilot</h1>
              <p>Lớp học trực tuyến</p>
            </div>
          </div>
        </header>
        <div className="lr-prep">
          <main className="lr-card lr-waitcard">
            <div>
              <p className="lr-lbl">Tham gia lớp học</p>
              <h2>{preview?.sessionTitle || "Đang mở lời mời…"}</h2>
            </div>
            {!preview && !error && (
              <p role="status" aria-live="polite" className="lr-loading">
                <span className="lr-spin" aria-hidden="true" />
                Đang tải thông tin tham gia lớp học…
              </p>
            )}
            {error && (
              <div role="alert" className="lr-waitbox lr-waitbox--err">
                <div>
                  <b>{error}</b>
                  <p>Liên hệ thầy cô để được hỗ trợ hoặc nhận liên kết mời mới.</p>
                </div>
              </div>
            )}
            {error && (
              <a href="/" className="lr-btn lr-btn--ghost">
                Quay về trang chủ
              </a>
            )}
            {preview && (
              <form
                className="lr-join"
                onSubmit={(e) => {
                  e.preventDefault();
                  void studentRequest<Grant>("/room/join-request", {
                    method: "POST",
                    body: JSON.stringify({ token: invite, name, consent }),
                  })
                    .then((g) => {
                      invite = "";
                      saveGrant(g);
                      setGrant(g);
                    })
                    .catch((e) => setError(e.message));
                }}
              >
                <label className="lr-field">
                  Tên hiển thị
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nhập họ và tên của em…"
                    required
                  />
                </label>
                <label className="lr-check-line">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  Em đồng ý tham gia lớp học trực tuyến này
                </label>
                <ul className="lr-chk">
                  <li>
                    <span className="lr-chk__d" />
                    <div>
                      Dùng máy tính và tai nghe nếu có
                      <small>Trình duyệt sẽ hỏi quyền camera và micro, em bấm Cho phép.</small>
                    </div>
                  </li>
                  <li>
                    <span className="lr-chk__d" />
                    <div>
                      Để sẵn vở và bút
                      <small>Em có thể chụp bài làm và nộp ngay trong lớp.</small>
                    </div>
                  </li>
                </ul>
                <button className="lr-btn lr-btn--pri lr-btn--lg" disabled={!consent || !name.trim()}>
                  Gửi yêu cầu
                </button>
              </form>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
export function LiveRoom({
  sessionId,
  grant,
  teacherId,
  onExit,
  view = "teach",
  onViewChange,
  onThemeToggle,
  onEnded,
}: {
  sessionId: string;
  grant?: Grant;
  teacherId?: string;
  onExit: () => void;
  view?: "teach" | "grading" | "summary";
  onViewChange?: (view: "teach" | "grading" | "summary") => void;
  onThemeToggle?: () => void;
  /** Có thì Kết thúc buổi chuyển thẳng sang màn Sau buổi (điểm danh xác nhận ở đó). */
  onEnded?: () => void;
}) {
  const [selectedStudent, setSelectedStudent] = useState("");
  const [inspectBoard, setInspectBoard] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [note, setNote] = useState("");
  const [chat, setChat] = useState("");
  const [ttl, setTtl] = useState(24);
  const [question, setQuestion] = useState("");
  // Trang đang soạn câu hỏi bằng AI (giữ cố định khi gia sư lật trang trong lúc đợi).
  const [pqPage, setPqPage] = useState<number | null>(null);
  const pqCache = useRef(new Map<string, PageQuestion[]>());
  const [answer, setAnswer] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [connected, setConnected] = useState(false);
  const [panelTab, setPanelTab] = useState<"follow" | "chat" | "subs">("follow");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  // null = học sinh đang theo thầy cô; number = tự xem trang riêng
  const [localPage, setLocalPage] = useState<number | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [linkFor, setLinkFor] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const chatList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!submitOpen && !inviteOpen && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSubmitOpen(false);
      setInviteOpen(false);
      setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [submitOpen, inviteOpen, menuOpen]);
  const [unsentStroke, setUnsentStroke] = useState<{
    operation: "addStroke";
    stroke: import("./OnlineBoard").BoardStroke;
  } | null>(null);
  const queue = useRef(new BoundedReconnectQueue());
  const cursor = useRef(0);
  const currentGrant = useRef(grant);
  const [epoch, setEpoch] = useState(0);
  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      if (!currentGrant.current) return api<T>(path, init);
      try {
        return await studentRequest<T>(
          path,
          init,
          currentGrant.current.accessToken,
        );
      } catch (e) {
        throw e;
      }
    },
    [],
  );
  const load = useCallback(async () => {
    const r = await request<Room>(
      `/room/state${grant ? "" : `?sessionId=${encodeURIComponent(sessionId)}`}`,
    );
    cursor.current = Math.max(cursor.current, r.lastEventSeq || 0);
    setRoom(r);
    return r;
  }, [grant, request, sessionId]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      void load().catch((e) => {
        if (active) {
          if (grant && (e.status === 401 || e.status === 403)) {
            setRoom(null);
            sessionStorage.removeItem(savedKey);
          }
          setError(
            grant && (e.status === 401 || e.status === 403)
              ? "Yêu cầu tham gia có thể đã bị từ chối hoặc phiên không còn hiệu lực. Vui lòng liên hệ giáo viên để được hỗ trợ."
              : e.message,
          );
        }
      });
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load, epoch]);
  useEffect(() => {
    const token = currentGrant.current?.accessToken || getAccessToken();
    if (!token) return;
    const socket = io("/classroom", {
      auth: { token, sessionId, lastEventSeq: cursor.current },
    });
    socket.on("connect", () => {
      setConnected(true);
      void load()
        .then((r) =>
          queue.current.flush(r.session?.status || "draft", async (cmd) => {
            await request(cmd.path, {
              method: cmd.method,
              headers: { "Idempotency-Key": cmd.idempotencyKey },
              body: cmd.body,
            });
          }),
        )
        .catch((e) => setError(e.message));
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("classroom.event", (event: { seq: number }) => {
      cursor.current = Math.max(cursor.current, event.seq);
      void load().catch((e) => setError(e.message));
    });
    socket.on(
      "room.resync_required",
      () => void load().catch((e) => setError(e.message)),
    );
    return () => {
      socket.disconnect();
    };
  }, [sessionId, load, request, epoch]);
  useEffect(() => {
    if (!grant) return;
    const timer = setInterval(() => {
      void restoreGrant()
        .then((g) => {
          currentGrant.current = g;
          setEpoch((v) => v + 1);
        })
        .catch((e) => setError(e.message));
    }, 4 * 60_000);
    return () => clearInterval(timer);
  }, [grant]);
  const command = async (
    path: string,
    method: "POST" | "PUT" | "PATCH",
    payload: unknown,
    allowQueue = false,
  ) => {
    const key = crypto.randomUUID();
    try {
      await request(path, {
        method,
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(payload),
      });
      await load();
      return true;
    } catch (e) {
      if (allowQueue && !navigator.onLine) {
        const result = queue.current.enqueue({
          sessionId,
          path,
          method,
          idempotencyKey: key,
          idempotent: true,
          payload,
        });
        if (result.accepted) {
          setError(
            `Đã giữ ${result.queuedCount} thao tác để gửi lại khi kết nối.`,
          );
          return true;
        }
        setError(
          "Hàng đợi đã đầy hoặc thao tác quá lớn; nội dung vẫn còn trong ô nhập.",
        );
        return false;
      }
      setError(e instanceof Error ? e.message : "Không thể hoàn thành");
      return false;
    }
  };
  const s = room?.session;
  // Video lớp học: Zoom Video SDK lõi, mỗi người một ghế. Chỉ kết nối khi buổi đang diễn ra.
  const video = useClassVideo({
    sessionId,
    isLive: s?.status === "live" && !room?.waiting,
    role: grant ? "student" : "teacher",
    displayName: grant?.displayName || "Giáo viên",
    request,
  });
  const messageCount = (grant ? room?.roomMessages : room?.messages)?.length || 0;
  useEffect(() => {
    const el = chatList.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messageCount, panelTab]);
  const members = s?.RoomMember_sessionId_items || [];
  const patchQueue = useRef<Promise<unknown>>(Promise.resolve());
  const patchClassroom = (value: object) => {
    if (!s) return;
    patchQueue.current = patchQueue.current
      .catch(() => {})
      .then(async () => {
        const fresh = await load();
        const ver = fresh.session?.version ?? s.version;
        await request(`/sessions/${sessionId}/classroom`, {
          method: "PATCH",
          headers: { "If-Match-Version": String(ver) },
          body: JSON.stringify(value),
        });
        await load();
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  // Chưa chọn ai thì mở sẵn em đang trong lớp, không phải em vắng đứng đầu danh sách.
  const selected = selectedStudent || members.find((m) => m.state === "joined")?.studentId || members[0]?.studentId || "";
  const activity = s?.Activity_sessionId_items?.find(
    (a) => a.id === s.currentActivityId,
  );
  const material = grant
    ? room?.currentMaterial
    : activity?.materialId && activity.materialVersion
      ? {
          id: activity.materialId,
          version: activity.materialVersion,
          title: activity.title,
          readUrl: undefined,
          page: s?.materialPage || 0,
        }
      : null;
  const board = grant
    ? room?.ownBoard
    : room?.boards?.find(
        (b) =>
          b.ownerId ===
            (inspectBoard ? selected : s?.sharedBoardOwnerId || "common") &&
          (!s?.currentActivityId || b.id.includes(`:${s.currentActivityId}:`)),
      );

  const chatAllowed = grant
    ? s?.status === "live" && room?.capabilities?.chat === true
    : s?.status === "live" && s?.tools?.chat !== false;

  const checkAllowed = grant
    ? s?.status === "live" && room?.capabilities?.check === true
    : s?.status === "live" && s?.tools?.check !== false;

  const uploadAllowed = grant
    ? s?.status === "live" && room?.capabilities?.upload === true
    : false;
  const boardPanel = s && (
    <section className="online-room__board" aria-label="Bảng học tập">
      {unsentStroke && (
        <div role="status">
          Nét vẽ chưa gửi vẫn được giữ lại.{" "}
          <button
            disabled={!connected || s.status !== "live"}
            onClick={() =>
              void command(
                `/sessions/${sessionId}/boards/${grant ? "own" : s?.sharedBoardOwnerId || "common"}`,
                "PUT",
                unsentStroke,
                true,
              ).then((ok) => {
                if (ok) setUnsentStroke(null);
              })
            }
          >
            Gửi lại nét vẽ
          </button>
        </div>
      )}
      <OnlineBoard
        title={
          grant
            ? "Bảng nháp của tôi"
            : inspectBoard
              ? `Xem bảng riêng: ${members.find((m) => m.studentId === selected)?.displayName || selected}`
              : s?.sharedBoardOwnerId && s.sharedBoardOwnerId !== "common"
                ? `Bảng trình bày: ${members.find((m) => m.studentId === s.sharedBoardOwnerId)?.displayName || s.sharedBoardOwnerId}`
                : "Bảng chung"
        }
        board={board || null}
        actorId={grant?.studentId || teacherId || ""}
        canWrite={
          s.status === "live" &&
          !inspectBoard &&
          (!grant || room?.capabilities?.boardWrite === true)
        }
        isOwnPrivateBoard={!!grant}
        busy={!!unsentStroke}
        onCommand={async (cmd) => {
          const accepted = await command(
            `/sessions/${sessionId}/boards/${grant ? "own" : s?.sharedBoardOwnerId || "common"}`,
            "PUT",
            cmd,
            true,
          );
          if (!accepted && cmd.operation === "addStroke" && cmd.stroke)
            setUnsentStroke({
              operation: "addStroke",
              stroke: cmd.stroke,
            });
        }}
        onCaptureAttempt={
          grant
            ? async () => {
                await command(
                  `/sessions/${sessionId}/boards/own/attempts`,
                  "POST",
                  {},
                );
              }
            : selected
              ? async () => {
                  await command(
                    `/sessions/${sessionId}/boards/${selected}/attempts`,
                    "POST",
                    {},
                  );
                }
              : undefined
        }
      />
    </section>
  );
  // ---------- Bố cục phòng học kiểu bảng chung (mockups/phong-hoc-bang-chung.html) ----------
  const isTeacher = !grant;
  const myId = grant?.studentId || teacherId || "";
  const roster = grant ? room?.members || [] : [];
  const nameOf = (id: string) => {
    if (grant) return roster.find((m) => m.id === id)?.displayName || "";
    const m = members.find((x) => x.studentId === id);
    return m ? memberName(m) : "";
  };
  const waiting = members.filter((m) => m.state === "waiting");
  const inClass = members.filter((m) => m.state === "joined");
  const openCheck = room?.checks?.find((c) => c.status === "open");
  const selMember = members.find((m) => m.studentId === selected);
  const selName = selMember ? memberName(selMember) : "";
  const subsOf = (id: string) => room?.submissions?.filter((x) => x.studentId === id).length || 0;
  const acts = s?.Activity_sessionId_items || [];
  const preparedActivity = activity ?? acts[0];
  const studentActivities = room?.activities || [];
  const pageList = grant ? studentActivities : acts;
  const currentActivity = grant
    ? studentActivities.find((a) => a.id === s?.currentActivityId)
    : activity;
  const myHand = !!roster.find((m) => m.id === grant?.studentId)?.handRaised;
  const msgs = (grant ? room?.roomMessages : room?.messages) || [];
  const viewName = { document: "Tài liệu", board: "Bảng", check: "Hỏi nhanh" };
  const live = s?.status === "live";
  const notStarted = s?.status === "draft" || s?.status === "scheduled";
  const startedAt = s?.startedAt ? Date.parse(s.startedAt) : NaN;
  const elapsedMin = live && Number.isFinite(startedAt) ? Math.max(0, Math.floor((now - startedAt) / 60000)) : null;
  const elapsed =
    elapsedMin === null ? "" : elapsedMin >= 60 ? `${Math.floor(elapsedMin / 60)} giờ ${elapsedMin % 60} phút` : `${elapsedMin} phút`;
  const zoomOf = (memberId: string) => video.seats.find((z) => z.key === memberId && !z.isSelf);
  const selfSeat = video.seats.find((z) => z.isSelf);
  const shareActive = video.sharingSelf || (video.shareUserId !== null && video.shareUserId !== selfSeat?.userId);
  const stage: "document" | "board" | "check" | "share" = shareActive
    ? "share"
    : isTeacher && inspectBoard
      ? "board"
      : s?.sharedView || "document";

  // Học sinh tự lật trang → vào chế độ "xem riêng"
  const handleStudentPageChange = (page: number) => {
    setLocalPage(page);
    void command(`/sessions/${sessionId}/members/${grant!.studentId}`, "PATCH", { following: false });
  };
  // Học sinh nhấn "Theo thầy cô" → quay lại đồng bộ
  const snapBack = () => {
    setLocalPage(null);
    void command(`/sessions/${sessionId}/members/${grant!.studentId}`, "PATCH", { following: true });
  };

  const startSession = () => void command(`/sessions/${sessionId}/start`, "POST", {});
  // Kết thúc buổi: hiện bảng điểm danh đã điền sẵn, gia sư xác nhận hoặc để sau.
  const endSession = () => {
    if (!onEnded) return setEndOpen(true);
    if (!confirm("Kết thúc buổi học? Các em sẽ rời lớp.")) return;
    void command(`/sessions/${sessionId}/end`, "POST", {}).then((saved) => saved && onEnded());
  };
  const finishSession = async (rows: { studentId: string; present: boolean; excused: boolean }[] | null) => {
    const saved = await command(`/sessions/${sessionId}/end`, "POST", {});
    if (!saved) throw new Error("Chưa kết thúc được buổi học. Hãy thử lại.");
    if (rows)
      await api(`/sessions/${sessionId}/attendance`, {
        method: "PUT",
        body: JSON.stringify({ rows: rows.map((r) => ({ studentId: r.studentId, present: r.present, excused: r.excused })) }),
      });
    setEndOpen(false);
    onViewChange?.("summary");
  };
  const admit = (m: Member, approved: boolean) =>
    void command(`/sessions/${sessionId}/members/${m.id}/admit`, "POST", { approved });
  const lowerHand = (m: Member) =>
    void command(`/sessions/${sessionId}/members/${m.id}`, "PATCH", { handRaised: false });
  const createInvite = (studentId: string) =>
    void request<{ inviteUrl: string }>(`/sessions/${sessionId}/invites`, {
      method: "POST",
      body: JSON.stringify({ studentId, expiresAt: new Date(Date.now() + ttl * 3600000).toISOString() }),
    })
      .then((r) => {
        setLink(r.inviteUrl);
        setLinkFor(studentId);
        setCopied(false);
        void load();
      })
      .catch((e) => setError(e.message));
  const showView = (value: "document" | "board" | "check") => {
    setMenuOpen(false);
    setInspectBoard(false);
    if (video.sharingSelf) video.toggleShare();
    if (s && s.sharedView !== value) patchClassroom({ sharedView: value });
  };
  const callRandom = () => {
    setMenuOpen(false);
    const pool = inClass.filter((m) => m.studentId !== selected);
    const pick = (pool.length ? pool : inClass)[Math.floor(Math.random() * Math.max(1, (pool.length ? pool : inClass).length))];
    if (!pick) return setToast("Chưa có em nào trong lớp để gọi.");
    setSelectedStudent(pick.studentId);
    setPanelTab("follow");
    setToast(`Mời ${memberName(pick)} trả lời`);
  };

  const avatar = (name: string, id: string, size: "" | "sm" | "lg" = "") => (
    <span className={`lr-av${size ? ` lr-av--${size}` : ""}`} style={{ "--h": hueOf(id) } as CSSProperties} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );

  const statusPill = s && (
    <span className={`lr-live lr-live--${live ? "on" : notStarted ? "wait" : "end"}`}>
      <i aria-hidden="true" />
      {live ? (grant ? "Đang học" : "Đang dạy") : notStarted ? (grant ? "Chờ bắt đầu" : "Chưa bắt đầu") : "Đã kết thúc"}
      {elapsed && <span className="lr-live__tm">{elapsed}</span>}
    </span>
  );
  const videoLabel =
    video.status === "connected" ? "Video ổn định" : video.status === "joining" ? "Đang vào video…" : video.status === "reconnecting" ? "Đang nối lại video…" : video.status === "error" ? "Video lỗi" : "";
  const netBadge = (
    <span
      className={`lr-net${connected && video.status !== "error" ? "" : " is-off"}`}
      title={`Dữ liệu lớp: ${connected ? "đã kết nối" : "mất kết nối"}${videoLabel ? ` · ${videoLabel}` : ""}`}
    >
      {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
      <span>{!connected ? "Mất kết nối" : videoLabel || "Đã kết nối"}</span>
    </span>
  );

  const viewsNav = isTeacher && onViewChange && (
    <nav className="online-room__views lr-views" aria-label="Chế độ buổi học">
      {(
        [
          ["teach", "Giảng dạy", BookOpen],
          ["grading", "Chấm bài", ClipboardCheck],
          ["summary", "Tổng kết & duyệt", Sparkles],
        ] as const
      ).map(([value, label, Icon]) => (
        <button type="button" key={value} aria-current={view === value ? "page" : undefined} className={view === value ? "active" : ""} onClick={() => onViewChange(value)}>
          <Icon size={15} aria-hidden="true" />
          {label}
        </button>
      ))}
    </nav>
  );

  const invitePop = isTeacher && inviteOpen && s && (
    <div className="lr-pop" role="dialog" aria-label="Mời học sinh">
      <div className="lr-pop__h">
        <b>Mời học sinh</b>
        <button type="button" className="lr-ib lr-ib--sm" aria-label="Đóng" onClick={() => setInviteOpen(false)}>
          <X size={16} />
        </button>
      </div>
      <label className="lr-ttl">
        Liên kết dùng được trong
        <input type="number" min="1" max="720" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} />
        giờ
      </label>
      <ul className="lr-inv">
        {members.map((m) => {
          const active = room?.invites?.find((i) => i.studentId === m.studentId && i.state === "active");
          return (
            <li key={m.id}>
              {avatar(memberName(m), m.studentId, "sm")}
              <div>
                <b>{memberName(m)}</b>
                <small>
                  {statusLabel(m.state)}
                  {active ? " · có liên kết" : ""}
                </small>
              </div>
              {active && (
                <button type="button" className="lr-btn lr-btn--sm lr-btn--quiet" onClick={() => void command(`/sessions/${sessionId}/invites/${active.id}/revoke`, "POST", {})}>
                  Thu hồi
                </button>
              )}
              <button type="button" className="lr-btn lr-btn--sm lr-btn--ghost" onClick={() => createInvite(m.studentId)}>
                <Link2 size={14} />
                {active ? "Tạo lại" : "Tạo liên kết"}
              </button>
            </li>
          );
        })}
        {!members.length && <li className="lr-empty">Buổi này chưa có học sinh.</li>}
      </ul>
      {link && (
        <div className="lr-link">
          <p className="lr-lbl">Liên kết cho {nameOf(linkFor) || "học sinh"}</p>
          <div className="lr-link__row">
            <input readOnly value={link} aria-label="Liên kết mời" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="lr-btn lr-btn--sm lr-btn--soft"
              onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false))}
            >
              <Copy size={14} />
              {copied ? "Đã chép" : "Chép"}
            </button>
          </div>
          <p className="lr-fine">Mỗi em một liên kết riêng. Tạo liên kết mới sẽ thay liên kết cũ.</p>
        </div>
      )}
      <div className="lr-pop__sec">
        <p className="lr-lbl">Công cụ cả lớp</p>
        <div className="lr-toggles">
          {(Object.keys(toolNames) as (keyof Tools)[]).map((key) => (
            <label key={key} className="lr-tg">
              <input type="checkbox" checked={s.tools?.[key] !== false} onChange={(e) => patchClassroom({ tools: { [key]: e.target.checked } })} />
              {toolNames[key]}
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const topbar = (
    <header className="lr-top">
      <div className="lr-top__l">
        {isTeacher && (
          <button type="button" className="lr-ib" aria-label="Quay lại" title="Về lớp" onClick={onExit}>
            <ArrowLeft size={18} />
          </button>
        )}
        <span className="lr-cls" aria-hidden="true">
          <BookOpen size={17} />
        </span>
        <div className="lr-top__t">
          <h1>{s?.title || (room?.waiting ? "Phòng chờ" : "Phòng học")}</h1>
          {s?.sharedGoal && <p>{s.sharedGoal}</p>}
        </div>
      </div>
      <div className="lr-top__c">{viewsNav}</div>
      <div className="lr-top__r">
        {statusPill}
        {netBadge}
        {isTeacher && s && (live || notStarted) && (
          <button type="button" className={`lr-btn lr-btn--ghost lr-btn--sm${inviteOpen ? " is-on" : ""}`} aria-expanded={inviteOpen} onClick={() => setInviteOpen(!inviteOpen)}>
            <Link2 size={15} />
            Mời học sinh
          </button>
        )}
        {onThemeToggle && (
          <button type="button" className="lr-ib" aria-label="Đổi giao diện" title="Đổi giao diện sáng / tối" onClick={onThemeToggle}>
            <Moon size={17} />
          </button>
        )}
        {isTeacher && s && notStarted && (
          <button type="button" className="lr-btn lr-btn--pri lr-btn--sm" onClick={startSession}>
            Bắt đầu buổi học
          </button>
        )}
        {isTeacher && live && (
          <button type="button" className="lr-btn lr-btn--warn lr-btn--sm" onClick={endSession}>
            Kết thúc buổi
          </button>
        )}
        {grant && (
          <button type="button" className="lr-btn lr-btn--warn lr-btn--sm" onClick={onExit}>
            <LogOut size={15} />
            Rời lớp
          </button>
        )}
      </div>
      {invitePop}
    </header>
  );

  /* ---- hàng ghế video ---- */
  const seatEl = (o: {
    key: string;
    name: string;
    colorId: string;
    zoom?: VideoSeat;
    label?: string;
    sel?: boolean;
    hand?: boolean;
    badge?: "answered" | "working" | "unsync" | "";
    onClick?: () => void;
    actions?: ReactNode;
  }) => {
    const speaking = !!o.zoom && o.zoom.userId === video.speakerId && !o.zoom.muted;
    const ring = o.hand ? " is-hand" : speaking ? " is-speak" : "";
    const Tag = o.onClick ? "button" : "div";
    return (
      <Tag
        key={o.key}
        type={o.onClick ? "button" : undefined}
        className={`lr-seat${ring}${o.sel ? " is-sel" : ""}`}
        onClick={o.onClick}
        aria-pressed={o.onClick ? !!o.sel : undefined}
        aria-label={o.onClick ? `${o.label || o.name}${o.hand ? ", đang giơ tay" : ""}` : undefined}
      >
        {o.zoom?.videoOn ? (
          <SeatVideo video={video} userId={o.zoom.userId} />
        ) : (
          <span className="lr-seat__off">{avatar(o.name, o.colorId, "lg")}</span>
        )}
        {o.hand ? (
          <span className="lr-seat__bd is-hand">
            <Hand size={12} aria-hidden="true" /> Giơ tay
          </span>
        ) : o.badge === "answered" ? (
          <span className="lr-seat__bd is-ok">
            <Check size={12} strokeWidth={3} aria-hidden="true" /> Đã trả lời
          </span>
        ) : o.badge === "working" ? (
          <span className="lr-seat__bd is-wait">
            <Clock size={12} aria-hidden="true" /> Đang làm
          </span>
        ) : o.badge === "unsync" ? (
          <span className="lr-seat__bd is-unsync">
            <Eye size={12} aria-hidden="true" /> Xem riêng
          </span>
        ) : null}
        {o.actions}
        <span className="lr-seat__nm">
          {o.zoom ? (
            o.zoom.muted ? (
              <MicOff size={12} className="lr-off" aria-label="Đang tắt micro" />
            ) : (
              <Mic size={12} aria-label="Đang bật micro" />
            )
          ) : (
            <VideoOff size={12} className="lr-off" aria-label="Chưa vào video" />
          )}
          {o.label || o.name}
        </span>
      </Tag>
    );
  };

  const seatsTeacher = isTeacher && s && (
    <div className="lr-seats" aria-label="Ghế video của lớp">
      {seatEl({ key: "me", name: "Giáo viên", colorId: myId, zoom: selfSeat, label: "Bạn · Giáo viên" })}
      {inClass.map((m) =>
        seatEl({
          key: m.id,
          name: memberName(m),
          colorId: m.studentId,
          zoom: zoomOf(m.id),
          sel: selected === m.studentId,
          hand: !!m.handRaised,
          badge: openCheck
            ? openCheck.CheckResponse_checkId_items?.some((r) => r.studentId === m.studentId)
              ? "answered"
              : "working"
            : m.following === false
              ? "unsync"
              : "",
          onClick: () => {
            setSelectedStudent(m.studentId);
            setPanelTab("follow");
          },
        }),
      )}
      {!inClass.length && (
        <button type="button" className="lr-seat-add" onClick={() => setInviteOpen(true)}>
          <UserPlus size={18} aria-hidden="true" />
          {waiting.length ? `${waiting.length} em đang chờ` : "Mời học sinh"}
        </button>
      )}
    </div>
  );

  const zoomTeacher = video.seats.find((z) => z.isHost && !z.isSelf);
  const zoomPeers = video.seats.filter((z) => !z.isHost && !z.isSelf);
  const handByName = (name: string) => roster.find((m) => m.displayName === name)?.handRaised;
  const seatsStudent = grant && s && (
    <div className="lr-seats" aria-label="Ghế video của lớp">
      {seatEl({ key: "t", name: zoomTeacher?.name || "Thầy cô", colorId: "teacher", zoom: zoomTeacher, label: zoomTeacher?.name || "Thầy cô" })}
      {seatEl({ key: "me", name: nameOf(grant.studentId) || grant.displayName, colorId: grant.studentId, zoom: selfSeat, label: `Bạn · ${lastName(nameOf(grant.studentId) || grant.displayName)}`, hand: myHand })}
      {video.status === "connected"
        ? zoomPeers.map((z) => seatEl({ key: String(z.userId), name: z.name, colorId: z.key || z.name, zoom: z, hand: !!handByName(z.name) }))
        : roster
            .filter((m) => m.id !== grant.studentId)
            .map((m) => seatEl({ key: m.id, name: m.displayName, colorId: m.id, hand: !!m.handRaised }))}
    </div>
  );

  /* ---- sân khấu ---- */
  const chatBlock = (
    <div className="lr-chat" id="classroom-chat" aria-label="Trò chuyện">
      <div className="lr-msgs" ref={chatList}>
        {msgs.map((m) => {
          const mine = m.authorId === myId;
          const fromStudent = grant ? roster.some((x) => x.id === m.authorId) : members.some((x) => x.studentId === m.authorId);
          const who = mine ? "Bạn" : fromStudent ? nameOf(m.authorId) || "Học sinh" : "Giáo viên";
          return (
            <div key={m.id} className={`lr-msg${mine ? " is-me" : ""}${!mine && !fromStudent ? " is-t" : ""}`}>
              {!mine && avatar(who, m.authorId, "sm")}
              <div className="lr-msg__b">
                <small>
                  <b>{who}</b>
                  {m.createdAt ? ` · ${clock(m.createdAt)}` : ""}
                </small>
                <p>{m.text}</p>
              </div>
            </div>
          );
        })}
        {!msgs.length && <p className="lr-empty">Chưa có tin nhắn. Cả lớp cùng thấy tin nhắn ở đây.</p>}
      </div>
      <form
        className="lr-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void command(`/sessions/${sessionId}/messages`, "POST", { text: chat }).then((ok) => {
            if (ok) setChat("");
          });
        }}
      >
        <input aria-label="Tin nhắn" placeholder={chatAllowed ? "Nhắn cho cả lớp…" : "Trò chuyện đang tắt"} value={chat} required disabled={!chatAllowed} onChange={(e) => setChat(e.target.value)} />
        <button className="lr-send" aria-label="Gửi" disabled={!chatAllowed || !chat.trim()}>
          <Send size={15} />
        </button>
      </form>
    </div>
  );

  const studentStageBoard =
    grant &&
    s &&
    (s.sharedBoardOwnerId === grant.studentId ? (
      <p className="lr-banner">Bảng nháp của em đang được trình bày cho cả lớp.</p>
    ) : (
      <OnlineBoard
        testId="stage-board"
        title={
          s.sharedBoardOwnerId && s.sharedBoardOwnerId !== "common"
            ? `Bảng đang trình bày (${nameOf(s.sharedBoardOwnerId) || "học sinh"})`
            : "Bảng đang trình bày (Bảng chung)"
        }
        board={room?.sharedBoard || room?.commonBoard || null}
        actorId={grant.studentId}
        canWrite={false}
        onCommand={async () => {}}
      />
    ));

  const teacherCheck = isTeacher && s && (
    <div className="lr-check">
      <form
        className="lr-check__new"
        onSubmit={(e) => {
          e.preventDefault();
          if (s.currentActivityId)
            void command(`/sessions/${sessionId}/checks`, "POST", { activityId: s.currentActivityId, question }).then((ok) => ok && setQuestion(""));
        }}
      >
        <input value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Câu hỏi kiểm tra nhanh" placeholder="Gõ câu hỏi cho cả lớp, ví dụ: I have known her ___ five years." required />
        <button className="lr-btn lr-btn--pri" disabled={!live || !s.currentActivityId || s.tools?.check === false}>
          Mở câu hỏi
        </button>
      </form>
      {!live && <p className="lr-fine">Câu hỏi mở được khi buổi học đang diễn ra.</p>}
      {live && !s.currentActivityId && <p className="lr-fine">Chọn một trang (hoạt động) ở đầu bảng trước khi hỏi.</p>}
      {room?.checks?.map((c) => {
        const answers = c.CheckResponse_checkId_items || [];
        const total = Math.max(inClass.length, answers.length);
        return (
          <article key={c.id} className={`lr-qk${c.status === "open" ? " is-open" : ""}`}>
            <header>
              <h3>{c.question}</h3>
              <span className={`lr-chip${c.status === "open" ? " lr-chip--warn" : ""}`}>{statusLabel(c.status)}</span>
              {c.status === "open" && (
                <button type="button" className="lr-btn lr-btn--sm lr-btn--ghost" onClick={() => void command(`/checks/${c.id}`, "PATCH", { status: "closed" })}>
                  Đóng câu hỏi
                </button>
              )}
            </header>
            <div className="lr-prog">
              <span>Đã trả lời</span>
              <span className="lr-bar">
                <i style={{ width: `${total ? (answers.length / total) * 100 : 0}%` }} />
              </span>
              <b>
                {answers.length}/{total}
              </b>
            </div>
            <ul className="lr-ans">
              {answers.map((r) => (
                <li key={r.id}>
                  {avatar(nameOf(r.studentId) || "HS", r.studentId, "sm")}
                  <div>
                    <b>{nameOf(r.studentId) || "Học sinh"}</b>
                    <p>{r.answer}</p>
                    {r.feedback && (
                      <small>
                        Nhận xét: {r.feedback}
                        {r.support && ` · ${statusLabel(r.support)}`}
                      </small>
                    )}
                  </div>
                  <details>
                    <summary>Nhận xét</summary>
                    <SubmissionGrade
                      title={`kiểm tra ${nameOf(r.studentId) || r.studentId}`}
                      onGrade={async (feedback, support) => {
                        await command(`/checks/${c.id}/responses/${r.id}/review`, "POST", { feedback, support });
                      }}
                    >
                      {null}
                    </SubmissionGrade>
                  </details>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
      {!room?.checks?.length && <p className="lr-empty">Chưa có câu hỏi nào. Gõ câu hỏi ở trên để hỏi cả lớp.</p>}
    </div>
  );

  const askForm = (inline: boolean) =>
    grant &&
    room?.activeQuickCheck &&
    !room.ownCheckResponse && (
      <form
        className={`lr-ask${inline ? " is-inline" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          void command(`/checks/${room.activeQuickCheck!.id}/responses`, "POST", { answer }).then((ok) => ok && setAnswer(""));
        }}
      >
        <span className="lr-chip lr-chip--acc">
          <ListChecks size={13} aria-hidden="true" />
          Thầy cô hỏi nhanh
        </span>
        <h2>{room.activeQuickCheck.question}</h2>
        <input aria-label="Câu trả lời kiểm tra nhanh" placeholder="Nhập câu trả lời của em…" value={answer} onChange={(e) => setAnswer(e.target.value)} required />
        <div className="lr-ask__f">
          <small>
            <Lock size={13} aria-hidden="true" />
            {checkAllowed ? "Chỉ thầy cô thấy câu trả lời của em" : "Giáo viên đã tắt kiểm tra nhanh."}
          </small>
          <button className="lr-btn lr-btn--pri" disabled={!checkAllowed || !answer.trim()}>
            Gửi câu trả lời
          </button>
        </div>
      </form>
    );

  const shareView = (
    <div className="lr-share">
      <div className="lr-share__top">
        <span className="lr-dot" aria-hidden="true" />
        {video.sharingSelf ? (
          <>
            <span>
              Bạn đang chia sẻ màn hình. <b>Học sinh chỉ thấy cửa sổ bạn đã chọn.</b>
            </span>
            <span className="lr-grow" />
            <button type="button" className="lr-btn lr-btn--sm lr-btn--stop" onClick={video.toggleShare}>
              <Square size={12} aria-hidden="true" /> Dừng chia sẻ
            </button>
          </>
        ) : (
          <span>
            <b>{video.seats.find((z) => z.userId === video.shareUserId)?.name || "Thầy cô"}</b> đang chia sẻ màn hình
          </span>
        )}
      </div>
      <div className="lr-share__view">
        {!video.sharingSelf && video.shareUserId !== null && <ShareVideo video={video} userId={video.shareUserId} />}
      </div>
    </div>
  );

  const pagesHead = s && (
    <div className="lr-bhead">
      <div className="lr-pages" role={isTeacher ? "tablist" : undefined} aria-label="Trang bài học">
        {pageList.map((a, index) => {
          const cur = s.currentActivityId === a.id;
          const done = !grant && s.completedActivityIds?.includes(a.id);
          return isTeacher ? (
            <button
              type="button"
              key={a.id}
              role="tab"
              aria-selected={cur}
              aria-label={a.title}
              className={`lr-pg${cur ? " is-on" : ""}`}
              onClick={() => patchClassroom({ currentActivityId: a.id })}
              title={a.duration ? `${a.title} · ${a.duration} phút` : a.title}
            >
              <span className="lr-pg__n">{done ? <Check size={11} strokeWidth={3} /> : index + 1}</span>
              <span className="lr-pg__t">{a.title}</span>
            </button>
          ) : (
            <span key={a.id} className={`lr-pg${cur ? " is-on" : ""}`}>
              <span className="lr-pg__n">{index + 1}</span>
              <span className="lr-pg__t">{a.title}</span>
            </span>
          );
        })}
        {!pageList.length && <span className="lr-fine">Buổi này chưa có hoạt động.</span>}
      </div>
      <span className="lr-grow" />
      {isTeacher && stage === "document" && material && (
        <button
          type="button"
          className={`lr-btn lr-btn--sm lr-btn--quiet${pqPage !== null ? " is-on" : ""}`}
          aria-expanded={pqPage !== null}
          title="AI soạn nháp câu hỏi kiểm tra nhanh từ chữ trên trang đang chiếu"
          onClick={() => setPqPage(pqPage === null ? s.materialPage || 0 : null)}
        >
          <Sparkles size={14} aria-hidden="true" />
          Câu hỏi từ trang này
        </button>
      )}
      {isTeacher && s.currentActivityId && (
        <button
          type="button"
          className="lr-btn lr-btn--sm lr-btn--quiet"
          onClick={() => {
            if (s.currentActivityId)
              patchClassroom({ completedActivityIds: Array.from(new Set([...(s.completedActivityIds || []), s.currentActivityId])) });
          }}
          disabled={s.completedActivityIds?.includes(s.currentActivityId)}
        >
          <Check size={14} aria-hidden="true" />
          {s.completedActivityIds?.includes(s.currentActivityId) ? "Đã xong trang này" : "Xong trang này"}
        </button>
      )}
      <span className={`lr-follow${grant && localPage !== null ? " is-unsync" : ""}`}>
        <span className="lr-follow__dot" aria-hidden="true" />
        {isTeacher
          ? <>Lớp đang xem: <b>{stage === "share" ? "Màn hình chia sẻ" : viewName[s.sharedView || "document"]}</b></>
          : localPage !== null ? "Đang xem riêng" : "Đang theo thầy cô"}
      </span>
    </div>
  );

  const canvas = s && (
    <div className={`lr-canvas lr-canvas--${stage}`}>
      {stage === "document" &&
        (material ? (
          <div className="lr-doc">
            {grant && localPage !== null && (
              <div className="lr-unsync" role="status">
                <span className="lr-unsync__label">Đang xem riêng</span>
                {s.materialPage !== undefined && (
                  <span className="lr-unsync__hint">Thầy cô đang ở trang {s.materialPage + 1}</span>
                )}
                <button type="button" className="lr-unsync__back" onClick={snapBack}>
                  Theo thầy cô →
                </button>
              </div>
            )}
            <MaterialViewer
              materialId={material.id}
              version={material.version}
              title={material.title}
              kind="auto"
              directReadUrl={material.readUrl}
              controlledPage={grant ? (localPage ?? s.materialPage ?? 0) : (s.materialPage || 0)}
              onPageChange={grant ? handleStudentPageChange : (page) => patchClassroom({ materialPage: page })}
              annotations={room?.annotations || []}
              sessionId={grant ? undefined : sessionId}
              activityId={s.currentActivityId || undefined}
              students={members.map((m) => ({ id: m.studentId, name: memberName(m) }))}
              onSaved={grant ? undefined : () => void load()}
              onAskAI={grant ? undefined : (text) => setAiQuestion(text)}
            />
          </div>
        ) : (
          <div className="lr-empty lr-empty--pane">
            <FileText size={28} aria-hidden="true" />
            <b>{currentActivity?.title || (grant ? "Thầy cô chưa mở nội dung" : "Chưa có nội dung")}</b>
            {currentActivity?.description && <div className="lesson-public-content">{currentActivity.description}</div>}
            <p>
              {grant
                ? "Khi thầy cô mở tài liệu hoặc bảng viết, nội dung sẽ hiện ở đây."
                : "Gắn tài liệu khi soạn buổi để học sinh thấy và chú thích được — hoặc bấm Bảng để viết trực tiếp."}
            </p>
          </div>
        ))}
      {isTeacher && stage === "document" && (s.goal || activity?.teacherNotes) && <details className="lesson-private-notes">
        <summary>Ghi chú riêng của gia sư</summary>
        {s.goal && <p>{s.goal}</p>}
        {activity?.teacherNotes && <p>{activity.teacherNotes}</p>}
      </details>}
      {stage === "board" && (
        <div className="lr-boardwrap">
          {isTeacher && inspectBoard && (
            <p role="status" className="lr-banner">
              Đang xem bảng nháp của {selName}. Lớp vẫn thấy nội dung cũ.
              <button type="button" className="lr-link-btn" onClick={() => setInspectBoard(false)}>
                Về bảng chung
              </button>
            </p>
          )}
          {isTeacher ? boardPanel : studentStageBoard}
        </div>
      )}
      {stage === "check" && (isTeacher ? <div className="lr-doc">{teacherCheck}</div> : (
        <div className="lr-empty lr-empty--pane">
          {askForm(true) || (
            <>
              <ListChecks size={28} aria-hidden="true" />
              <b>{room?.ownCheckResponse ? "Em đã gửi câu trả lời" : "Thầy cô sắp hỏi nhanh"}</b>
              <p>{room?.ownCheckResponse ? `Câu trả lời của em: ${room.ownCheckResponse.answer}` : "Câu hỏi sẽ hiện ở đây."}</p>
            </>
          )}
        </div>
      ))}
      {stage === "share" && shareView}
      {/* Nơi trình duyệt vẽ màn hình mình chia sẻ; luôn có sẵn để bấm Chia sẻ là chạy ngay. */}
      {isTeacher &&
        (video.selfShareUsesVideo ? (
          <video ref={video.selfShareTarget} className={`lr-selfshare${video.sharingSelf ? " is-on" : ""}`} muted playsInline />
        ) : (
          <canvas ref={video.selfShareTarget} className={`lr-selfshare${video.sharingSelf ? " is-on" : ""}`} width={1920} height={1080} />
        ))}
      {stage !== "check" && askForm(false)}
      {toast && (
        <p className="lr-toast" role="status">
          {toast}
        </p>
      )}
      {video.error && (
        <p className="lr-vidalert" role="alert">
          {video.error}
          {video.status === "error" && (
            <button type="button" className="lr-btn lr-btn--sm lr-btn--ghost" onClick={video.retry}>
              Thử lại
            </button>
          )}
        </p>
      )}
    </div>
  );

  const cb = (o: { icon: ReactNode; label?: string; on?: boolean; off?: boolean; disabled?: boolean; onClick: () => void; title?: string; badge?: number; kind?: string; expanded?: boolean }) => (
    <button
      type="button"
      className={`lr-cb${o.on ? " is-on" : ""}${o.off ? " is-off" : ""}${o.kind ? ` lr-cb--${o.kind}` : ""}${o.label ? "" : " lr-cb--icon"}`}
      onClick={o.onClick}
      disabled={o.disabled}
      title={o.title || o.label}
      aria-label={o.label ? undefined : o.title}
      aria-pressed={o.on || undefined}
      aria-expanded={o.expanded}
    >
      {o.icon}
      {o.label && <span>{o.label}</span>}
      {!!o.badge && <span className="lr-cb__bdg">{o.badge}</span>}
    </button>
  );
  const avDisabled = video.status !== "connected" || !!video.busy;
  const micBtn = cb({
    icon: video.micOn ? <Mic size={18} /> : <MicOff size={18} />,
    label: isTeacher ? (video.micOn ? "Micro" : "Bật micro") : undefined,
    title: video.micOn ? "Tắt micro" : "Bật micro",
    off: !video.micOn,
    disabled: avDisabled,
    onClick: video.toggleMic,
  });
  const camBtn = cb({
    icon: video.camOn ? <Video size={18} /> : <VideoOff size={18} />,
    label: isTeacher ? (video.camOn ? "Camera" : "Bật camera") : undefined,
    title: video.camOn ? "Tắt camera" : "Bật camera",
    off: !video.camOn,
    disabled: avDisabled,
    onClick: video.toggleCam,
  });

  const ctrlTeacher = s && (
    <div className="lr-ctrl">
      {micBtn}
      {camBtn}
      <span className="lr-grow" />
      {cb({ icon: <FileText size={18} />, label: "Tài liệu", on: stage === "document", onClick: () => showView("document") })}
      {cb({ icon: <PenLine size={18} />, label: "Bảng", on: stage === "board", onClick: () => showView("board") })}
      <div className="lr-menuwrap">
        {cb({ icon: <Layers size={18} />, label: "Hoạt động lớp", on: stage === "check" || video.sharingSelf, expanded: menuOpen, onClick: () => setMenuOpen(!menuOpen) })}
        {menuOpen && (
          <div className="lr-menu" role="menu" aria-label="Hoạt động cho cả lớp">
            <p className="lr-menu__h">HOẠT ĐỘNG CHO CẢ LỚP</p>
            <button type="button" role="menuitem" className="lr-mi" onClick={() => showView("check")}>
              <span className="lr-mi__ic is-acc"><ListChecks size={17} /></span>
              <span>
                <b>Hỏi nhanh</b>
                <small>Hỏi cả lớp một câu, xem ngay em nào trả lời gì</small>
              </span>
              {openCheck && <span className="lr-chip lr-chip--warn">Đang mở</span>}
            </button>
            <button type="button" role="menuitem" className="lr-mi" onClick={callRandom} disabled={!inClass.length}>
              <span className="lr-mi__ic is-blue"><Shuffle size={17} /></span>
              <span>
                <b>Gọi ngẫu nhiên</b>
                <small>Chọn một em trong lớp để trả lời</small>
              </span>
            </button>
            <div className="lr-menu__sep" role="separator" />
            <p className="lr-menu__h">CHIA SẺ APP NGOÀI</p>
            <button
              type="button"
              role="menuitem"
              className="lr-mi"
              disabled={avDisabled && !video.sharingSelf}
              title="Chia sẻ một cửa sổ: chọn thẻ Cửa sổ, đừng chọn tab lớp học"
              onClick={() => { setInspectBoard(false); video.toggleShare(); setMenuOpen(false); }}
            >
              <span className="lr-mi__ic is-share"><MonitorUp size={17} /></span>
              <span>
                <b>Chia sẻ màn hình</b>
                <small>Dùng khi cần mở app/website ngoài — tài liệu nạp sẵn thì học sinh thấy rõ hơn và chú thích được</small>
              </span>
              {video.sharingSelf && <span className="lr-chip lr-chip--warn">Đang chia sẻ</span>}
            </button>
          </div>
        )}
      </div>
      <span className="lr-grow" />
      {cb({ icon: <ClipboardCheck size={18} />, label: "Bài nộp", badge: room?.submissions?.length || 0, onClick: () => setPanelTab("subs") })}
    </div>
  );

  const ctrlStudent = s && (
    <div className="lr-ctrl">
      {micBtn}
      {camBtn}
      <span className="lr-grow" />
      {cb({
        icon: <Hand size={18} />,
        label: myHand ? "Hạ tay" : "Giơ tay",
        kind: myHand ? "hand" : "pri",
        disabled: !live,
        onClick: () => void command(`/sessions/${sessionId}/members/${grant!.studentId}`, "PATCH", { handRaised: !myHand }),
      })}
      {cb({ icon: <PenLine size={18} />, label: "Bảng nháp của em", on: boardOpen, onClick: () => setBoardOpen(!boardOpen) })}
      {cb({ icon: <Upload size={18} />, label: "Nộp bài", onClick: () => setSubmitOpen(true) })}
      <span className="lr-grow" />
      <span className="lr-cb-spacer" aria-hidden="true" />
    </div>
  );

  const boardCard = s && (
    <section className="lr-card lr-boardcard" aria-label="Sân khấu lớp học">
      {pagesHead}
      {isTeacher && material && pqPage !== null && stage === "document" && (
        <PageQuestions
          key={`${material.id}:${pqPage}`}
          sessionId={sessionId}
          material={material}
          page={pqPage}
          live={live}
          canOpen={!!s.currentActivityId && s.tools?.check !== false}
          cache={pqCache.current}
          onOpen={(q) => (s.currentActivityId ? command(`/sessions/${sessionId}/checks`, "POST", { activityId: s.currentActivityId, question: q }) : Promise.resolve(false))}
          onShowAnswers={() => { setPqPage(null); showView("check"); }}
          onClose={() => setPqPage(null)}
        />
      )}
      {canvas}
      {isTeacher ? ctrlTeacher : ctrlStudent}
    </section>
  );

  /* ---- cột phải gia sư ---- */
  const hands = inClass.filter((m) => m.handRaised);
  const queueBox = hands.length > 0 && (
    <div className="lr-queue" aria-label="Đang chờ phát biểu">
      <p className="lr-queue__h">
        <Hand size={13} aria-hidden="true" /> Đang chờ phát biểu
      </p>
      {hands.map((m) => (
        <div key={m.id} className="lr-queue__row">
          {avatar(memberName(m), m.studentId, "sm")}
          <b>{memberName(m)}</b>
          <button
            type="button"
            className="lr-btn lr-btn--xs lr-btn--amber"
            onClick={() => {
              const z = zoomOf(m.id);
              if (z) video.askUnmute(z.userId);
              lowerHand(m);
              setSelectedStudent(m.studentId);
              setPanelTab("follow");
              setToast(z ? `Đã mời ${memberName(m)} bật micro` : `${memberName(m)} chưa vào video`);
            }}
          >
            <Mic size={13} aria-hidden="true" /> Mời nói
          </button>
          <button type="button" className="lr-ib lr-ib--sm lr-ib--bare" aria-label={`Hạ tay ${memberName(m)}`} onClick={() => lowerHand(m)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
  const waitBox = waiting.length > 0 && (
    <div className="lr-queue lr-queue--wait" aria-label="Đang chờ vào lớp">
      <p className="lr-queue__h">
        <UserPlus size={13} aria-hidden="true" /> Đang chờ vào lớp
      </p>
      {waiting.map((m) => (
        <div key={m.id} className="lr-queue__row">
          {avatar(memberName(m), m.studentId, "sm")}
          <b>{memberName(m)}</b>
          <button type="button" className="lr-btn lr-btn--xs lr-btn--quiet" onClick={() => admit(m, false)}>
            Từ chối
          </button>
          <button type="button" className="lr-btn lr-btn--xs lr-btn--pri" onClick={() => admit(m, true)}>
            Cho vào
          </button>
        </div>
      ))}
    </div>
  );

  const selEvidence = room?.evidence?.filter((e) => e.studentId === selected).slice(0, 3) || [];
  const selZoom = selMember ? zoomOf(selMember.id) : undefined;
  const selAnswered = openCheck?.CheckResponse_checkId_items?.find((r) => r.studentId === selected);
  const panel = isTeacher && s && (
    <aside className="lr-card lr-panel" aria-label="Hỗ trợ học sinh đã chọn">
      {waitBox}
      {queueBox}
      <div className="lr-seg" role="tablist" aria-label="Nội dung cột phải">
        {(
          [
            ["follow", "Học sinh", 0],
            ["chat", "Trò chuyện", msgs.length],
            ["subs", "Bài nộp", room?.submissions?.length || 0],
          ] as const
        ).map(([value, label, count]) => (
          <button type="button" role="tab" key={value} aria-selected={panelTab === value} className={panelTab === value ? "is-on" : ""} onClick={() => setPanelTab(value)}>
            {label}
            {count > 0 && <span className="lr-cnt">{count}</span>}
          </button>
        ))}
      </div>
      {panelTab === "follow" && (
        <>
          <div className="lr-pn-b">
            {selMember ? (
              <>
                <div className="lr-who">
                  {avatar(selName, selMember.studentId, "lg")}
                  <div>
                    <b>{selName}</b>
                    <small className={selMember.handRaised ? "is-hand" : ""}>
                      {selMember.handRaised ? (
                        <>
                          <Hand size={13} aria-hidden="true" /> Đang giơ tay
                        </>
                      ) : selZoom && selZoom.userId === video.speakerId && !selZoom.muted ? (
                        "Đang nói"
                      ) : (
                        statusLabel(selMember.state)
                      )}
                    </small>
                  </div>
                </div>
                <div className="lr-stats">
                  <span>
                    <b>{subsOf(selMember.studentId)}</b> bài đã nộp
                  </span>
                  {openCheck && <span className={selAnswered ? "is-ok" : ""}>{selAnswered ? `Đã trả lời: ${selAnswered.answer}` : "Chưa trả lời hỏi nhanh"}</span>}
                  <span>{selZoom ? (selZoom.videoOn ? "Đang bật camera" : "Tắt camera") : "Chưa vào video"}</span>
                </div>
                <div className="lr-who__act">
                  <button
                    type="button"
                    className="lr-btn lr-btn--sm lr-btn--ghost"
                    onClick={() => {
                      const next = !inspectBoard;
                      setInspectBoard(next);
                      if (next && video.sharingSelf) video.toggleShare();
                    }}
                  >
                    <Eye size={14} aria-hidden="true" />
                    {inspectBoard ? "Về bảng chung" : "Xem bảng nháp"}
                  </button>
                  <button
                    type="button"
                    className="lr-btn lr-btn--sm lr-btn--ghost"
                    disabled={!room?.boards?.some((b) => b.ownerId === selected && b.shared && (!s.currentActivityId || b.id.includes(`:${s.currentActivityId}:`)))}
                    title="Trình bày được khi em đã bật chia sẻ bảng nháp"
                    onClick={() => {
                      setInspectBoard(false);
                      patchClassroom({ sharedBoardOwnerId: selected, sharedView: "board" });
                    }}
                  >
                    Trình bày bảng em
                  </button>
                  <button type="button" className="lr-btn lr-btn--sm lr-btn--ghost" onClick={() => void command(`/sessions/${sessionId}/boards/${selected}/attempts`, "POST", {})}>
                    <Camera size={14} aria-hidden="true" />
                    Chụp bảng
                  </button>
                </div>
                <div className="lr-blk">
                  <p className="lr-lbl">Em được dùng</p>
                  <div className="lr-toggles">
                    {(Object.keys(toolNames) as (keyof Tools)[]).map((key) => (
                      <label key={key} className="lr-tg">
                        <input
                          type="checkbox"
                          checked={selMember.toolOverrides?.[key] !== false}
                          onChange={(e) => void command(`/sessions/${sessionId}/members/${selMember.id}`, "PATCH", { toolOverrides: { [key]: e.target.checked } })}
                        />
                        {toolNames[key]}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="lr-cop">
                  <AITeachingPanel
                    key={`${sessionId}:${selected}:${s.currentActivityId}`}
                    sessionId={sessionId}
                    studentId={selected}
                    activityId={s.currentActivityId}
                    active={["draft", "scheduled", "live"].includes(s.status)}
                    request={request}
                    reload={load}
                    injectedText={aiQuestion}
                  />
                </div>
                {selEvidence.length > 0 && (
                  <div className="lr-blk">
                    <p className="lr-lbl">Ghi nhận gần đây</p>
                    <ul className="lr-ev">
                      {selEvidence.map((e) => (
                        <li key={e.id}>
                          <b>{e.title}</b>
                          <span>{e.detail}</span>
                          <small>{statusLabel(e.support)}</small>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="lr-empty lr-empty--pane">
                <UserPlus size={26} aria-hidden="true" />
                <b>Chưa có em nào trong lớp</b>
                <p>Bấm Mời học sinh để gửi liên kết. Khi em vào lớp, bấm vào ghế của em để xem chi tiết.</p>
              </div>
            )}
          </div>
          {selMember && (
            <form
              className="lr-foot"
              onSubmit={(e) => {
                e.preventDefault();
                void command(`/sessions/${sessionId}/evidence`, "POST", {
                  studentId: selected,
                  activityId: s.currentActivityId,
                  kind: "GhiChu",
                  title: "Quan sát của giáo viên",
                  detail: note,
                  support: "ChuaRo",
                }).then((ok) => {
                  if (ok) setNote("");
                });
              }}
            >
              <div className="lr-compose">
                <textarea aria-label="Ghi chú quan sát" placeholder={`Ghi nhanh về ${lastName(selName)}…`} required rows={1} value={note} onChange={(e) => setNote(e.target.value)} />
                <button className="lr-send" aria-label="Lưu ghi chú" disabled={!note.trim()}>
                  <Send size={15} />
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {panelTab === "chat" && chatBlock}
      {panelTab === "subs" && (
        <div className="lr-pn-b">
          {!room?.submissions?.length && <p className="lr-empty">Chưa có bài nộp từ học sinh.</p>}
          {room?.submissions?.map((x) => (
            <div key={x.id} className="lr-sub">
              <div className="lr-sub__h">
                {avatar(nameOf(x.studentId) || "HS", x.studentId, "sm")}
                <div>
                  <b>{nameOf(x.studentId) || "Học sinh"}</b>
                  <small>{x.title}</small>
                </div>
                {x.finalFeedback && <span className="lr-chip lr-chip--ok">Đã chấm</span>}
              </div>
              {x.answer && <p className="lr-sub__a">{x.answer}</p>}
              {x.fileName && (
                <button
                  type="button"
                  className="lr-btn lr-btn--sm lr-btn--ghost"
                  onClick={() =>
                    void request<{ readUrl: string }>(`/submissions/${x.id}/read-url`)
                      .then((r) => window.open(r.readUrl, "_blank", "noopener,noreferrer"))
                      .catch((e) => setError(e.message))
                  }
                >
                  <FileText size={14} aria-hidden="true" />
                  Mở tệp: {x.fileName}
                </button>
              )}
              <details>
                <summary>{x.finalFeedback ? `Nhận xét: ${x.finalFeedback}` : "Chấm và nhận xét"}</summary>
                <SubmissionGrade
                  title={x.title}
                  onGrade={async (feedback, support) => {
                    await command(`/submissions/${x.id}/grade`, "PATCH", { feedback, support });
                  }}
                >
                  {null}
                </SubmissionGrade>
              </details>
            </div>
          ))}
        </div>
      )}
    </aside>
  );

  /* ---- cột phải học sinh ---- */
  const ownSubs = room?.ownSubmissions || [];
  const curIndex = studentActivities.findIndex((a) => a.id === s?.currentActivityId);
  const side = grant && s && (
    <aside className="lr-card lr-panel" aria-label="Việc của em và trò chuyện">
      <div className="lr-seg" role="tablist" aria-label="Nội dung cột phải">
        {(
          [
            ["follow", "Việc của em", 0],
            ["chat", "Trò chuyện", msgs.length],
          ] as const
        ).map(([value, label, count]) => (
          <button type="button" role="tab" key={value} aria-selected={panelTab === value} className={panelTab === value ? "is-on" : ""} onClick={() => setPanelTab(value)}>
            {label}
            {count > 0 && <span className="lr-cnt">{count}</span>}
          </button>
        ))}
      </div>
      {panelTab === "chat" ? (
        chatBlock
      ) : (
        <div className="lr-pn-b">
          <div className="lr-task">
            <small>ĐANG LÀM</small>
            <b>{currentActivity?.title || s.sharedGoal || "Theo dõi thầy cô"}</b>
            {studentActivities.length > 0 && (
              <ul className="lr-steps">
                {studentActivities.map((a, i) => (
                  <li key={a.id} className={i === curIndex ? "is-now" : ""}>
                    <span className={`lr-steps__d${i < curIndex ? " is-y" : i === curIndex ? " is-now" : ""}`}>{i < curIndex ? <Check size={11} strokeWidth={3} /> : null}</span>
                    {a.title}
                    <small>{a.duration == null ? "Chưa ước lượng" : `${a.duration} phút`}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {room?.ownCheckResponse && room.activeQuickCheck && (
            <p className="lr-sent">
              <Check size={15} aria-hidden="true" />
              Đã gửi câu trả lời: <b>{room.ownCheckResponse.answer}</b>
            </p>
          )}
          <div className="lr-blk">
            <p className="lr-lbl">BÀI CỦA EM</p>
            {ownSubs.length ? (
              <ul className="lr-receipts">
                {ownSubs.map((x) => (
                  <li key={x.id}>
                    <b>{x.title}</b>
                    {x.answer && <span>{x.answer}</span>}
                    {x.finalFeedback ? <small>Nhận xét: {x.finalFeedback}</small> : <em>Chờ thầy cô chấm</em>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="lr-fine">Chưa nộp bài nào. Làm xong, bấm Nộp bài ở dưới bảng.</p>
            )}
          </div>
          {msgs.length > 0 && (
            <button type="button" className="lr-linkrow" onClick={() => setPanelTab("chat")}>
              <MessageCircle size={15} aria-hidden="true" />
              {msgs.length} tin nhắn trong lớp
            </button>
          )}
        </div>
      )}
    </aside>
  );

  const studentDraft = grant && boardOpen && s && (
    <section className="lr-card lr-draft" aria-label="Bảng nháp của em">
      <div className="lr-draft__h">
        <b>Bảng nháp của em</b>
        <span className="lr-chip">
          <Eye size={12} aria-hidden="true" />
          Thầy cô xem được
        </span>
        <span className="lr-grow" />
        <button type="button" className="lr-ib lr-ib--sm lr-ib--bare" aria-label="Đóng bảng nháp" onClick={() => setBoardOpen(false)}>
          <X size={16} />
        </button>
      </div>
      {boardPanel}
    </section>
  );

  const submitModal = grant && submitOpen && s && (
    <div className="lr-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setSubmitOpen(false); }}>
      <div className="lr-modal" role="dialog" aria-modal="true" aria-labelledby="lr-submit-title">
        <div className="lr-modal__h">
          <div>
            <h2 id="lr-submit-title">Nộp bài</h2>
            <p>{currentActivity?.title || s.title}</p>
          </div>
          <button type="button" className="lr-ib" aria-label="Đóng" onClick={() => setSubmitOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="lr-modal__b">
          {uploadAllowed && <PhoneHandoff request={request} received={(room?.ownSubmissions || []).length} />}
          {/* Nộp từ máy tính xong thì đóng hộp: bài hiện ngay ở "Bài của em", và mã QR không đếm nhầm bài này là từ điện thoại. */}
          <SubmissionForm sessionId={sessionId} activityId={s.currentActivityId} enabled={uploadAllowed} request={request} onSubmitted={async () => { await load(); setSubmitOpen(false); }} />
          {!uploadAllowed && <p className="lr-fine">Thầy cô đang tắt nộp bài.</p>}
          <p className="lr-tipline">
            <Camera size={15} aria-hidden="true" />
            Làm trên vở? Quét mã ở trên bằng điện thoại để chụp và nộp thẳng.
          </p>
        </div>
      </div>
    </div>
  );

  const withMaterial = acts.filter((a) => a.materialId).length;
  const activeInvites = room?.invites?.filter((i) => i.state === "active").length || 0;
  const prep = isTeacher && s && notStarted && (
    <div className="lr-prep">
      <div className="lr-prep__in">
        <div className="lr-prep__main">
          <div className="lr-card lr-ready">
            <span className="lr-ready__ic" aria-hidden="true">
              <Video size={24} />
            </span>
            <h2>Sẵn sàng cho {s.title}?</h2>
            <p>Khi bắt đầu, lớp mở hàng ghế video, bảng chung và các nút micro, camera, chia sẻ màn hình. Học sinh ở phòng chờ vào lớp khi bạn cho phép.</p>
            <button type="button" className="lr-btn lr-btn--pri lr-btn--lg" onClick={startSession}>
              Bắt đầu buổi học
            </button>
          </div>
          {preparedActivity && <section className="lr-card lesson-preview">
            <h2>Xem trước: {preparedActivity.title}</h2>
            {preparedActivity.description && <div className="lesson-public-content">{preparedActivity.description}</div>}
            {preparedActivity.materialId && preparedActivity.materialVersion && <MaterialViewer materialId={preparedActivity.materialId} version={preparedActivity.materialVersion} title={preparedActivity.title} kind="auto" controlledPage={preparedActivity.materialStartPage ?? 0} />}
            {(s.goal || preparedActivity.teacherNotes) && <details className="lesson-private-notes">
              <summary>Ghi chú riêng của gia sư</summary>
              {s.goal && <p>{s.goal}</p>}
              {preparedActivity.teacherNotes && <p>{preparedActivity.teacherNotes}</p>}
            </details>}
          </section>}
          <div className="lr-card lr-tipcard">
            <div className="lr-tipcard__h">
              <MonitorUp size={18} aria-hidden="true" />
              <div>
                <b>Khi chữa đề, hãy chia sẻ đúng cửa sổ</b>
                <p>
                  Bấm <strong>Chia sẻ màn hình</strong> ở dưới bảng rồi chọn thẻ <strong>Cửa sổ</strong>, chọn cửa sổ PDF hoặc slide. Đừng chọn tab lớp học, học sinh sẽ thấy cả cột ghi chú của bạn.
                </p>
              </div>
            </div>
            <div className="lr-pick" aria-hidden="true">
              <div className="lr-pk is-no"><span className="lr-pk__mk"><X size={11} strokeWidth={3} /></span><i />Tab lớp học</div>
              <div className="lr-pk is-yes"><span className="lr-pk__mk"><Check size={11} strokeWidth={3} /></span><i />Cửa sổ PDF</div>
              <div className="lr-pk"><i />Toàn màn hình</div>
            </div>
          </div>
        </div>
        <div className="lr-prep__side">
          <div className="lr-card lr-box">
            <div className="lr-box__h"><b>Trước khi bắt đầu</b></div>
            <ul className="lr-chk">
              <li>
                <span className={`lr-chk__d${withMaterial ? " is-y" : ""}`}>{withMaterial ? <Check size={13} strokeWidth={3} /> : null}</span>
                <div>Tài liệu cho các trang<small>{withMaterial}/{acts.length} hoạt động có tài liệu</small></div>
              </li>
              <li>
                <span className={`lr-chk__d${activeInvites ? " is-y" : ""}`}>{activeInvites ? <Check size={13} strokeWidth={3} /> : null}</span>
                <div>
                  Liên kết mời học sinh
                  <small>
                    {activeInvites}/{members.length} em có liên kết còn hạn ·{" "}
                    <button type="button" className="lr-link-btn" onClick={() => setInviteOpen(true)}>Mở danh sách</button>
                  </small>
                </div>
              </li>
              <li>
                <span className={`lr-chk__d${s.currentActivityId ? " is-y" : ""}`}>{s.currentActivityId ? <Check size={13} strokeWidth={3} /> : null}</span>
                <div>Chọn trang mở đầu<small>{activity?.title || "Chọn trong kế hoạch bên dưới"}</small></div>
              </li>
            </ul>
          </div>
          <div className="lr-card lr-box">
            <div className="lr-box__h">
              <b>Phòng chờ</b>
              <span>{waiting.length ? `${waiting.length} em đang chờ` : "Chưa có em nào"}</span>
            </div>
            {members.map((m) => (
              <div key={m.id} className={`lr-wt${m.state === "waiting" ? " is-wait" : ""}`}>
                {avatar(memberName(m), m.studentId, "sm")}
                <div><b>{memberName(m)}</b><small>{statusLabel(m.state)}</small></div>
                {m.state === "waiting" ? (
                  <>
                    <button type="button" className="lr-btn lr-btn--sm lr-btn--quiet" onClick={() => admit(m, false)}>Từ chối</button>
                    <button type="button" className="lr-btn lr-btn--sm lr-btn--pri" onClick={() => admit(m, true)}>Cho vào</button>
                  </>
                ) : (
                  <button type="button" className="lr-btn lr-btn--sm lr-btn--ghost" onClick={() => { setInviteOpen(true); createInvite(m.studentId); }}>
                    <Link2 size={13} aria-hidden="true" /> Liên kết
                  </button>
                )}
              </div>
            ))}
            {!members.length && <p className="lr-empty">Buổi này chưa có học sinh.</p>}
          </div>
          {acts.length > 0 && (
            <div className="lr-card lr-box">
              <div className="lr-box__h"><b>Kế hoạch buổi</b><span>{acts.some(a => a.duration != null) ? `${acts.reduce((t, a) => t + (a.duration ?? 0), 0)} phút đã ước lượng` : "Chưa ước lượng"}</span></div>
              <ol className="lr-plan2">
                {acts.map((a, index) => (
                  <li key={a.id}>
                    <button type="button" aria-current={s.currentActivityId === a.id ? "step" : undefined} onClick={() => patchClassroom({ currentActivityId: a.id })}>
                      <i>{index + 1}</i><span>{a.title}</span><small>{a.duration == null ? "Chưa ước lượng" : `${a.duration} phút`}</small>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const legacyGrading = isTeacher && s && view === "grading" && (
    <div className="lr-legacy">
      <section className="online-room__submissions online-room__grading">
        <h2>Bài học sinh nộp</h2>
        {!room?.submissions?.length && <p className="muted">Chưa có bài nộp từ học sinh.</p>}
        {room?.submissions?.map((x) => (
          <SubmissionGrade key={x.id} title={x.title} onGrade={async (feedback, support) => { await command(`/submissions/${x.id}/grade`, "PATCH", { feedback, support }); }}>
            <div className="online-room__submission-meta">
              <p><strong>{nameOf(x.studentId) || x.studentId}</strong>: {x.title} — {x.answer}</p>
              {x.fileName && (
                <button type="button" className="button ghost small" onClick={() => void request<{ readUrl: string }>(`/submissions/${x.id}/read-url`).then((r) => window.open(r.readUrl, "_blank", "noopener,noreferrer")).catch((e) => setError(e.message))}>
                  Mở tệp: {x.fileName}
                </button>
              )}
            </div>
          </SubmissionGrade>
        ))}
      </section>
      <section className="online-room__checks">
        <h2>Câu hỏi nhanh</h2>
        {!room?.checks?.length && <p className="muted">Chưa có câu hỏi nào trong buổi.</p>}
        {room?.checks?.map((c) => (
          <div key={c.id} className="online-room__check-item">
            <p className="online-room__check-head"><strong>{c.question}</strong> · {statusLabel(c.status)}</p>
            {c.CheckResponse_checkId_items?.map((r) => (
              <SubmissionGrade key={r.id} title={`kiểm tra ${nameOf(r.studentId) || r.studentId}`} onGrade={async (feedback, support) => { await command(`/checks/${c.id}/responses/${r.id}/review`, "POST", { feedback, support }); }}>
                <span className="online-room__grade-summary">
                  {nameOf(r.studentId) || r.studentId}: {r.answer}{r.feedback && ` — ${r.feedback}`}{r.support && ` (${statusLabel(r.support)})`}
                </span>
              </SubmissionGrade>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
  const legacySummary = isTeacher && s && view === "summary" && (
    <div className="lr-legacy">
      <ReviewPanel sessionId={sessionId} status={s.status} members={members} evidence={room?.evidence || []} claims={room?.claims || []} request={request} reload={load} />
    </div>
  );

  const loadingOrWait = !s && (
    <div className="lr-prep">
      <div className="lr-card lr-waitcard">
        {error ? (
          <>
            <h2>Chưa vào được lớp</h2>
            <p role="alert">{error}</p>
            {grant && <a href="/" className="lr-btn lr-btn--ghost">Về trang chủ</a>}
          </>
        ) : room?.waiting ? (
          <>
            <div className="lr-waitbox">
              <span className="lr-spin" aria-hidden="true" />
              <div>
                <b role="status" aria-live="polite">Đang chờ giáo viên cho vào lớp.</b>
                <p>Thầy cô đã thấy em trong phòng chờ. Cứ để trang này mở, khi được cho vào em sẽ tự vào lớp.</p>
              </div>
            </div>
            <ul className="lr-chk">
              <li><span className="lr-chk__d" /><div>Để sẵn vở và bút<small>Cuối buổi em chụp bài để nộp ngay trong lớp.</small></div></li>
              <li><span className="lr-chk__d" /><div>Dùng tai nghe nếu có<small>Vào lớp, em bấm nút micro và camera ở dưới bảng để bật.</small></div></li>
            </ul>
          </>
        ) : (
          <p role="status" aria-live="polite" className="lr-loading"><span className="lr-spin" aria-hidden="true" />Đang tải phòng học…</p>
        )}
      </div>
    </div>
  );

  const ended = s && !live && !notStarted;
  const bodyHidden = isTeacher && view !== "teach";
  return (
    <div className={`lr online-room room-view-${view}${grant ? " lr--hs room-student" : " lr--gv"}`} data-shared-view={s?.sharedView || "document"}>
      {topbar}
      {error && s && (
        <p role="alert" className="lr-alert">
          {error}
          <button type="button" className="lr-ib lr-ib--sm" aria-label="Ẩn thông báo" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </p>
      )}
      {loadingOrWait}
      {legacyGrading}
      {legacySummary}
      {s && !bodyHidden && prep}
      {s && !(isTeacher && notStarted) && (
        <div className="lr-live-wrap" style={bodyHidden ? { display: "none" } : undefined}>
          {ended && (
            <p className="lr-endbar" role="status">
              Buổi học đã kết thúc.
              {isTeacher && onViewChange && (
                <button type="button" className="lr-link-btn" onClick={() => onViewChange("summary")}>
                  Mở tổng kết buổi
                </button>
              )}
            </p>
          )}
          {isTeacher ? seatsTeacher : seatsStudent}
          <main className={`lr-main${grant && boardOpen ? " is-split" : ""}`}>
            {boardCard}
            {studentDraft}
            {isTeacher ? panel : side}
          </main>
        </div>
      )}
      {submitModal}
      {isTeacher && endOpen && (
        <AttendanceDialog sessionId={sessionId} mode="end" onClose={() => setEndOpen(false)} onEnd={finishSession} />
      )}
    </div>
  );
}

/** Ghế video: gắn luồng camera của một người vào phần tử video-player của SDK. */
function SeatVideo({ video, userId }: { video: ClassVideo; userId: number }) {
  const ref = useRef<HTMLElement>(null);
  const { attachVideo, detachVideo } = video;
  useEffect(() => {
    const el = ref.current as VideoPlayer | null;
    if (!el) return;
    attachVideo(userId, el);
    return () => detachVideo(userId, el);
  }, [userId, attachVideo, detachVideo]);
  return (
    <video-player-container class="lr-seat__vpc">
      <video-player ref={ref} class="lr-seat__vp" />
    </video-player-container>
  );
}

/** Màn chia sẻ của người khác. */
function ShareVideo({ video, userId }: { video: ClassVideo; userId: number }) {
  const ref = useRef<HTMLElement>(null);
  const { attachShare, detachShare } = video;
  useEffect(() => {
    const el = ref.current as VideoPlayer | null;
    if (!el) return;
    attachShare(userId, el);
    return () => detachShare(userId, el);
  }, [userId, attachShare, detachShare]);
  return (
    <video-player-container class="lr-share__vpc">
      <video-player ref={ref} class="lr-share__vp" />
    </video-player-container>
  );
}

function SubmissionGrade({
  title,
  onGrade,
  children,
}: {
  title: string;
  onGrade: (feedback: string, support: string) => Promise<void>;
  children: React.ReactNode;
}) {
  const [feedback, setFeedback] = useState("");
  // Chưa biết em làm với mức hỗ trợ nào thì để "Chưa rõ", gia sư tự chọn.
  const [support, setSupport] = useState("ChuaRo");
  return (
    <form
      className="online-room__grade-card"
      onSubmit={(e) => {
        e.preventDefault();
        void onGrade(feedback, support);
      }}
    >
      {children}
      <div className="online-room__grade-controls">
        <label>
          Nhận xét
          <input
            aria-label={`Nhận xét cho ${title}`}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Nhận xét"
            required
          />
        </label>
        <label>
          Mức hỗ trợ
          <select
            aria-label={`Mức hỗ trợ cho ${title}`}
            value={support}
            onChange={(e) => setSupport(e.target.value)}
          >
            <option value="ChuaRo">Chưa rõ</option>
            <option value="DocLap">Độc lập</option>
            <option value="CoGoiY">Có gợi ý</option>
            <option value="DuocHuongDan">Được hướng dẫn</option>
          </select>
        </label>
        <button className="button primary small">Chấm bài</button>
      </div>
    </form>
  );
}

/** Mã QR "Nộp bằng điện thoại": điện thoại quét là vào thẳng màn nộp bài của em. */
function PhoneHandoff({ request, received }: { request: <T>(path: string, init?: RequestInit) => Promise<T>; received: number }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [base] = useState(received);
  const make = useCallback(() => {
    setError("");
    void request<{ url: string }>("/room/handoff", { method: "POST", body: "{}" })
      .then((r) => setUrl(r.url))
      .catch((e) => setError(e instanceof Error ? e.message : "Chưa tạo được mã"));
  }, [request]);
  useEffect(() => {
    make();
    const timer = setInterval(make, 12 * 60_000);
    return () => clearInterval(timer);
  }, [make]);
  const qr = url ? qrSvgPath(url) : null;
  const got = received - base;
  return (
    <div className="lr-qr">
      <div className="lr-qr__code" aria-hidden={!qr}>
        {qr ? (
          <svg viewBox={`0 0 ${qr.size} ${qr.size}`} width="132" height="132" role="img" aria-label="Mã QR nộp bài bằng điện thoại">
            <rect width={qr.size} height={qr.size} fill="#fff" />
            <path d={qr.d} fill="#1b1d29" />
          </svg>
        ) : (
          <span className="lr-spin" />
        )}
      </div>
      <div className="lr-qr__t">
        <b>Nộp bằng điện thoại</b>
        <span>Mở camera điện thoại, quét mã này rồi chụp bài.</span>
        {got > 0 ? (
          <span className="lr-qr__ok">Đã nhận {got} bài từ điện thoại</span>
        ) : (
          <span className="lr-qr__wait">{error || "Mã chỉ dùng cho em, đổi sau vài phút"}</span>
        )}
      </div>
    </div>
  );
}
