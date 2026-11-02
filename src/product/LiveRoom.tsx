import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api, getAccessToken } from "./onlineApi";
import { statusLabel } from "./statusLabels";
import { ReviewPanel } from "./ReviewPanel";
import { SubmissionForm } from "./SubmissionForm";
import { OnlineBoard, type BoardState } from "./OnlineBoard";
import { MaterialViewer } from "./MaterialViewer";
import { BoundedReconnectQueue } from "./reconnectQueue";
import { MediaHost } from "./media/MediaHost";
import { ArrowLeft, BookOpen, ClipboardCheck, Sparkles } from "lucide-react";
import "./online-restoration.css";
import { AITeachingPanel } from "./AITeachingPanel";

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
  session?: {
    id: string;
    title: string;
    status: "draft" | "scheduled" | "live" | "ended" | "reviewed";
    version: number;
    sharedGoal: string;
    currentActivityId: string | null;
    completedActivityIds?: string[];
    sharedView?: "document" | "board" | "check";
    sharedBoardOwnerId?: string;
    materialPage?: number;
    tools?: Tools;
    Activity_sessionId_items?: {
      id: string;
      title: string;
      materialId?: string | null;
      materialVersion?: number | null;
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
  messages?: { id: string; authorId: string; text: string }[];
  roomMessages?: { id: string; authorId: string; text: string }[];
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
      <main className="card online-lobby restored-student-lobby">
        <h1>Tham gia lớp học</h1>
        {!preview && !error && (
          <p role="status" aria-live="polite">
            Đang tải thông tin tham gia lớp học…
          </p>
        )}
        {error && (
          <div role="alert">
            <p>{error}</p>
            <p>Liên hệ giáo viên để được hỗ trợ hoặc nhận liên kết mời mới.</p>
            <a href="/">Quay về trang chủ</a>
          </div>
        )}
        {preview && (
          <form
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
            <p>{preview.sessionTitle}</p>
            <label>
              Tên hiển thị{" "}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />{" "}
              Tôi đồng ý tham gia lớp học
            </label>
            <button disabled={!consent}>Gửi yêu cầu</button>
          </form>
        )}
      </main>
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
}: {
  sessionId: string;
  grant?: Grant;
  teacherId?: string;
  onExit: () => void;
  view?: "teach" | "grading" | "summary";
  onViewChange?: (view: "teach" | "grading" | "summary") => void;
}) {
  const [selectedStudent, setSelectedStudent] = useState("");
  const [inspectBoard, setInspectBoard] = useState(false);
  const [note, setNote] = useState("");
  const [chat, setChat] = useState("");
  const [ttl, setTtl] = useState(24);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [connected, setConnected] = useState(false);
  const [mediaVideoStatus, setMediaVideoStatus] = useState("chưa cấu hình");
  const handleMediaError = useCallback((err: string) => {
    console.warn("[LiveRoom Media]", err);
  }, []);
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
  const selected = selectedStudent || members[0]?.studentId || "";
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
  const RoomContainer = grant ? "main" : "section";
  return (
    <RoomContainer
      className={`card online-room room-view-${view}${grant ? " room-student" : ""}${room?.waiting ? " online-lobby" : ""}`}
      data-shared-view={s?.sharedView || "document"}
    >
      <header className="online-room__header">
        <button className="button ghost small" onClick={onExit}>
          <ArrowLeft size={15} />
          Quay lại
        </button>
        {grant && (
          <button
            type="button"
            onClick={() => document.body.classList.toggle("dark")}
          >
            Đổi giao diện
          </button>
        )}
        <h1>{s?.title || "Phòng chờ"}</h1>
        <p>
          Kết nối dữ liệu: {connected ? "đã kết nối" : "mất kết nối"} · Video:{" "}
          {mediaVideoStatus}
        </p>
        {!grant && s && (
          <div className="online-room__lifecycle">
            <button
              onClick={() =>
                void command(`/sessions/${sessionId}/start`, "POST", {})
              }
              disabled={s.status === "ended" || s.status === "reviewed"}
            >
              Bắt đầu
            </button>
            <button
              onClick={() =>
                void command(`/sessions/${sessionId}/end`, "POST", {}).then(
                  (saved) => saved && onViewChange?.("summary"),
                )
              }
              disabled={s.status !== "live"}
            >
              Kết thúc
            </button>
          </div>
        )}
      </header>
      {!grant && onViewChange && (
        <nav className="online-room__views" aria-label="Chế độ buổi học">
          {(
            [
              ["teach", "Giảng dạy", BookOpen],
              ["grading", "Chấm bài", ClipboardCheck],
              ["summary", "Tổng kết & duyệt", Sparkles],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              type="button"
              key={value}
              aria-current={view === value ? "page" : undefined}
              className={view === value ? "active" : ""}
              onClick={() => onViewChange(value)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
      )}
      {error && <p role="alert">{error}</p>}
      {!room && !error && (
        <p role="status" aria-live="polite">
          Đang tải phòng học…
        </p>
      )}
      {room?.waiting && (
        <p role="status" aria-live="polite">
          Đang chờ giáo viên cho vào lớp.
        </p>
      )}
      {s && (
        <>
          <p>
            {s.sharedGoal} · {statusLabel(s.status)}
          </p>
          <div
            className={`online-room__workspace${grant ? "" : " online-room__workspace--teacher"}`}
          >
            <aside
              className="online-room__participants"
              aria-label="Video và lộ trình buổi học"
            >
              <MediaHost
                sessionId={sessionId}
                isLive={s.status === "live"}
                role={grant ? "student" : "teacher"}
                displayName={
                  grant
                    ? members.find((m) => m.studentId === grant.studentId)
                        ?.displayName ||
                      grant.displayName ||
                      "Học sinh"
                    : "Giáo viên"
                }
                userId={grant?.studentId || teacherId || "teacher"}
                request={request}
                onError={handleMediaError}
                onStatusChange={setMediaVideoStatus}
              />
              {!grant && s.Activity_sessionId_items && (
                <section className="online-room__activity">
                  <h2>Hoạt động</h2>
                  <select
                    aria-label="Hoạt động hiện tại"
                    value={s.currentActivityId || ""}
                    onChange={(e) =>
                      patchClassroom({
                        currentActivityId: e.target.value || null,
                      })
                    }
                  >
                    <option value="">Chọn hoạt động</option>
                    {s.Activity_sessionId_items.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}{" "}
                        {s.completedActivityIds?.includes(a.id)
                          ? " (Đã hoàn tất)"
                          : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!s.currentActivityId}
                    onClick={() => {
                      if (s.currentActivityId)
                        patchClassroom({
                          completedActivityIds: Array.from(
                            new Set([
                              ...(s.completedActivityIds || []),
                              s.currentActivityId,
                            ]),
                          ),
                        });
                    }}
                  >
                    {s.completedActivityIds?.includes(s.currentActivityId || "")
                      ? "Đã hoàn tất hoạt động"
                      : "Đánh dấu hoàn tất"}
                  </button>
                </section>
              )}
              {!grant && (
                <>
                  <section
                    className="online-room__members"
                    aria-label="Học sinh trong phòng"
                  >
                    <h2>Học sinh</h2>
                    <label>
                      Thời hạn liên kết (giờ)
                      <input
                        type="number"
                        min="1"
                        max="720"
                        value={ttl}
                        onChange={(e) => setTtl(Number(e.target.value))}
                      />
                    </label>
                    <fieldset>
                      <legend>Công cụ cả lớp</legend>
                      {(Object.keys(toolNames) as (keyof Tools)[]).map(
                        (key) => (
                          <label key={key}>
                            <input
                              type="checkbox"
                              checked={s.tools?.[key] !== false}
                              onChange={(e) =>
                                patchClassroom({
                                  tools: { [key]: e.target.checked },
                                })
                              }
                            />
                            {toolNames[key]}
                          </label>
                        ),
                      )}
                    </fieldset>
                    {members.map((m) => (
                      <div key={m.id}>
                        <button
                          type="button"
                          aria-pressed={selected === m.studentId}
                          onClick={() => {
                            setSelectedStudent(m.studentId);
                            setInspectBoard(false);
                          }}
                        >
                          {m.displayName || m.studentIdRef?.name || m.studentId}
                        </button>{" "}
                        · {statusLabel(m.state)}{" "}
                        <button
                          onClick={() =>
                            void request<{ inviteUrl: string }>(
                              `/sessions/${sessionId}/invites`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  studentId: m.studentId,
                                  expiresAt: new Date(
                                    Date.now() + ttl * 3600000,
                                  ).toISOString(),
                                }),
                              },
                            )
                              .then((r) => setLink(r.inviteUrl))
                              .catch((e) => setError(e.message))
                          }
                        >
                          Tạo liên kết mời
                        </button>
                        <fieldset>
                          <legend>
                            Quyền {m.displayName || m.studentIdRef?.name}
                          </legend>
                          {(Object.keys(toolNames) as (keyof Tools)[]).map(
                            (key) => (
                              <label key={key}>
                                <input
                                  type="checkbox"
                                  checked={m.toolOverrides?.[key] !== false}
                                  onChange={(e) =>
                                    void command(
                                      `/sessions/${sessionId}/members/${m.id}`,
                                      "PATCH",
                                      {
                                        toolOverrides: {
                                          [key]: e.target.checked,
                                        },
                                      },
                                    )
                                  }
                                />
                                {toolNames[key]}
                              </label>
                            ),
                          )}
                        </fieldset>
                        {room?.invites
                          ?.filter(
                            (i) =>
                              i.studentId === m.studentId &&
                              i.state === "active",
                          )
                          .map((i) => (
                            <button
                              key={i.id}
                              onClick={() =>
                                void command(
                                  `/sessions/${sessionId}/invites/${i.id}/revoke`,
                                  "POST",
                                  {},
                                )
                              }
                            >
                              Thu hồi liên kết
                            </button>
                          ))}
                        {m.state === "waiting" && (
                          <>
                            <button
                              onClick={() =>
                                void command(
                                  `/sessions/${sessionId}/members/${m.id}/admit`,
                                  "POST",
                                  { approved: true },
                                )
                              }
                            >
                              Cho vào
                            </button>
                            <button
                              onClick={() =>
                                void command(
                                  `/sessions/${sessionId}/members/${m.id}/admit`,
                                  "POST",
                                  { approved: false },
                                )
                              }
                            >
                              Từ chối
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                    {link && (
                      <p>
                        Liên kết mời một lần:{" "}
                        <input
                          readOnly
                          value={link}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                      </p>
                    )}
                  </section>
                </>
              )}
            </aside>

            <div className="online-room__stage" aria-label="Sân khấu lớp học">
              {!grant && (
                <div aria-label="Chọn nội dung chung">
                  {(
                    [
                      ["document", "Học liệu"],
                      ["board", "Bảng"],
                      ["check", "Kiểm tra"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={(s.sharedView || "document") === value}
                      onClick={() => patchClassroom({ sharedView: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {s.sharedView === "document" &&
                (material ? (
                  <MaterialViewer
                    materialId={material.id}
                    version={material.version}
                    title={material.title}
                    kind="auto"
                    directReadUrl={material.readUrl}
                    controlledPage={s.materialPage || 0}
                    onPageChange={
                      grant
                        ? undefined
                        : (page) => patchClassroom({ materialPage: page })
                    }
                    annotations={room?.annotations || []}
                    sessionId={grant ? undefined : sessionId}
                    activityId={s.currentActivityId || undefined}
                    students={members.map((m) => ({
                      id: m.studentId,
                      name:
                        m.displayName || m.studentIdRef?.name || m.studentId,
                    }))}
                    onSaved={
                      grant
                        ? undefined
                        : () => {
                            void load();
                          }
                    }
                  />
                ) : (
                  <p>Hoạt động chưa có học liệu.</p>
                ))}
              {s.sharedView === "check" && (
                <div>
                  <p>
                    {room?.activeQuickCheck?.question ||
                      room?.checks?.find((c) => c.status === "open")
                        ?.question ||
                      "Chưa có câu hỏi đang mở."}
                  </p>
                </div>
              )}
              {s.sharedView === "board" &&
                (grant ? (
                  s.sharedBoardOwnerId &&
                  s.sharedBoardOwnerId !== "common" &&
                  s.sharedBoardOwnerId !== grant.studentId ? (
                    <OnlineBoard
                      testId="stage-board"
                      title={`Bảng đang trình bày (${members.find((m) => m.studentId === s.sharedBoardOwnerId)?.displayName || s.sharedBoardOwnerId})`}
                      board={room?.sharedBoard || null}
                      actorId={grant.studentId}
                      canWrite={false}
                      onCommand={async () => {}}
                    />
                  ) : s.sharedBoardOwnerId === grant.studentId ? (
                    <p>Bảng nháp của bạn đang được trình bày cho cả lớp.</p>
                  ) : (
                    <OnlineBoard
                      testId="stage-board"
                      title="Bảng đang trình bày (Bảng chung)"
                      board={room?.sharedBoard || room?.commonBoard || null}
                      actorId={grant.studentId}
                      canWrite={false}
                      onCommand={async () => {}}
                    />
                  )
                ) : (
                  <p>
                    Bảng đang trình bày trên sân khấu:{" "}
                    {s.sharedBoardOwnerId === "common"
                      ? "Bảng chung"
                      : members.find(
                          (m) => m.studentId === s.sharedBoardOwnerId,
                        )?.displayName || s.sharedBoardOwnerId}
                    .
                  </p>
                ))}
            </div>
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
                      : s?.sharedBoardOwnerId &&
                          s.sharedBoardOwnerId !== "common"
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
            {!grant && (
              <aside
                className="online-room__dock"
                aria-label="Hỗ trợ học sinh đã chọn"
              >
                <h2>Học sinh được chọn</h2>
                <p>
                  {members.find((m) => m.studentId === selected)?.displayName ||
                    selected ||
                    "Chưa chọn học sinh"}
                </p>
                <p>
                  Giáo viên có thể xem bảng riêng để hỗ trợ; chỉ bảng đã chia sẻ
                  mới được trình bày cho lớp.
                </p>
                <button
                  type="button"
                  disabled={!selected}
                  onClick={() => setInspectBoard(!inspectBoard)}
                >
                  {inspectBoard ? "Trở về bảng chung" : "Xem bảng riêng"}
                </button>
                <button
                  type="button"
                  disabled={
                    !room?.boards?.some(
                      (b) =>
                        b.ownerId === selected &&
                        b.shared &&
                        (!s.currentActivityId ||
                          b.id.includes(`:${s.currentActivityId}:`)),
                    )
                  }
                  onClick={() => {
                    setInspectBoard(false);
                    patchClassroom({
                      sharedBoardOwnerId: selected,
                      sharedView: "board",
                    });
                  }}
                >
                  Trình bày bảng đã chia sẻ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInspectBoard(false);
                    patchClassroom({
                      sharedBoardOwnerId: "common",
                      sharedView: "board",
                    });
                  }}
                >
                  Trình bày bảng chung
                </button>
                <button
                  type="button"
                  disabled={!selected}
                  onClick={() =>
                    void command(
                      `/sessions/${sessionId}/boards/${selected}/attempts`,
                      "POST",
                      {},
                    )
                  }
                >
                  Chụp bảng học sinh
                </button>
                <h3>Minh chứng gần đây</h3>
                <AITeachingPanel
                  key={`${sessionId}:${selected}:${s.currentActivityId}`}
                  sessionId={sessionId}
                  studentId={selected}
                  activityId={s.currentActivityId}
                  active={["draft", "scheduled", "live"].includes(s.status)}
                  request={request}
                  reload={load}
                />
                {room?.evidence
                  ?.filter((e) => e.studentId === selected)
                  .slice(0, 3)
                  .map((e) => (
                    <p key={e.id}>
                      {e.title}: {e.detail} ({statusLabel(e.support)})
                    </p>
                  ))}
                <form
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
                  <label>
                    Ghi chú quan sát
                    <textarea
                      aria-label="Ghi chú quan sát"
                      required
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  <button disabled={!selected || !note.trim()}>
                    Lưu ghi chú
                  </button>
                </form>
              </aside>
            )}
          </div>
          {!grant && s.Activity_sessionId_items && (
            <section className="online-room__checks">
              <h2>Kiểm tra nhanh</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (s.currentActivityId)
                    void command(`/sessions/${sessionId}/checks`, "POST", {
                      activityId: s.currentActivityId,
                      question,
                    }).then(() => setQuestion(""));
                }}
              >
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  aria-label="Câu hỏi kiểm tra nhanh"
                  placeholder="Câu hỏi kiểm tra nhanh"
                  required
                />
                <button
                  disabled={
                    s.status !== "live" ||
                    !s.currentActivityId ||
                    s.tools?.check === false
                  }
                >
                  Mở câu hỏi
                </button>
              </form>
              {room?.checks?.map((c) => (
                <div key={c.id}>
                  <p>
                    {c.question} · {statusLabel(c.status)}{" "}
                    {c.status === "open" && (
                      <button
                        onClick={() =>
                          void command(`/checks/${c.id}`, "PATCH", {
                            status: "closed",
                          })
                        }
                      >
                        Đóng
                      </button>
                    )}
                  </p>
                  {c.CheckResponse_checkId_items?.map((r) => (
                    <SubmissionGrade
                      key={r.id}
                      title={`kiểm tra ${members.find((m) => m.studentId === r.studentId)?.displayName || r.studentId}`}
                      onGrade={async (feedback, support) => {
                        await command(
                          `/checks/${c.id}/responses/${r.id}/review`,
                          "POST",
                          { feedback, support },
                        );
                      }}
                    >
                      <span>
                        {members.find((m) => m.studentId === r.studentId)
                          ?.displayName || r.studentId}
                        : {r.answer}
                        {r.feedback && ` — ${r.feedback}`}{" "}
                        {r.support && ` (${statusLabel(r.support)})`}
                      </span>
                    </SubmissionGrade>
                  ))}
                </div>
              ))}
            </section>
          )}
          {grant && room?.activeQuickCheck && (
            <section className="online-room__activity">
              <h2>{room.activeQuickCheck.question}</h2>
              {room.ownCheckResponse ? (
                <p>Đã trả lời: {room.ownCheckResponse.answer}</p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void command(
                      `/checks/${room.activeQuickCheck!.id}/responses`,
                      "POST",
                      { answer },
                    );
                  }}
                >
                  <input
                    aria-label="Câu trả lời kiểm tra nhanh"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    required
                  />
                  <button disabled={!checkAllowed}>Gửi câu trả lời</button>
                </form>
              )}
              {!checkAllowed && <p>Giáo viên đã tắt kiểm tra nhanh.</p>}
            </section>
          )}
          {grant && (
            <section className="online-room__submissions online-room__grading">
              <h2>Bài làm</h2>
              <SubmissionForm
                sessionId={sessionId}
                activityId={s.currentActivityId}
                enabled={uploadAllowed}
                request={request}
                onSubmitted={load}
              />
              {!uploadAllowed && <p>Giáo viên đã tắt nộp bài.</p>}
              {!room?.ownSubmissions?.length && (
                <p>Chưa có bài làm nào được nộp.</p>
              )}
              {room?.ownSubmissions?.map((x) => (
                <p key={x.id}>
                  {x.title}: {x.answer}{" "}
                  {x.finalFeedback && `— ${x.finalFeedback}`}{" "}
                  {x.support && `(${statusLabel(x.support)})`}
                </p>
              ))}
            </section>
          )}
          {!grant && (
            <section className="online-room__submissions online-room__grading">
              <h2>Bài học sinh nộp</h2>
              {!room?.submissions?.length && (
                <p>Chưa có bài nộp từ học sinh.</p>
              )}
              {room?.submissions?.map((x) => (
                <SubmissionGrade
                  key={x.id}
                  title={x.title}
                  onGrade={async (feedback, support) => {
                    await command(`/submissions/${x.id}/grade`, "PATCH", {
                      feedback,
                      support,
                    });
                  }}
                >
                  <p>
                    {members.find((m) => m.studentId === x.studentId)
                      ?.displayName || x.studentId}
                    : {x.title} — {x.answer}
                  </p>
                  {x.fileName && (
                    <button
                      type="button"
                      onClick={() =>
                        void request<{ readUrl: string }>(
                          `/submissions/${x.id}/read-url`,
                        )
                          .then((r) =>
                            window.open(
                              r.readUrl,
                              "_blank",
                              "noopener,noreferrer",
                            ),
                          )
                          .catch((e) => setError(e.message))
                      }
                    >
                      Mở tệp: {x.fileName}
                    </button>
                  )}
                </SubmissionGrade>
              ))}
            </section>
          )}
          <section aria-label="Trò chuyện" className="online-room__chat">
            <h2>Trò chuyện</h2>
            {(grant ? room?.roomMessages : room?.messages)?.map((m) => (
              <p key={m.id}>
                {m.authorId}: {m.text}
              </p>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void command(`/sessions/${sessionId}/messages`, "POST", {
                  text: chat,
                }).then((ok) => {
                  if (ok) setChat("");
                });
              }}
            >
              <label>
                Tin nhắn
                <input
                  aria-label="Tin nhắn"
                  value={chat}
                  required
                  onChange={(e) => setChat(e.target.value)}
                />
              </label>
              <button disabled={!chatAllowed}>Gửi</button>
            </form>
            {!chatAllowed && <p>Giáo viên đã tắt trò chuyện.</p>}
          </section>
          {!grant && (
            <ReviewPanel
              sessionId={sessionId}
              status={s.status}
              members={members}
              evidence={room?.evidence || []}
              claims={room?.claims || []}
              request={request}
              reload={load}
            />
          )}
        </>
      )}
    </RoomContainer>
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
  const [support, setSupport] = useState("DocLap");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onGrade(feedback, support);
      }}
    >
      {children}
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
          <option value="DocLap">Độc lập</option>
          <option value="CoGoiY">Có gợi ý</option>
          <option value="DuocHuongDan">Được hướng dẫn</option>
          <option value="ChuaRo">Chưa rõ</option>
        </select>
      </label>
      <button>Chấm bài</button>
    </form>
  );
}
