import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api, getAccessToken } from "./onlineApi";
import { statusLabel } from "./statusLabels";
import { ReviewPanel } from "./ReviewPanel";
import { SubmissionForm } from "./SubmissionForm";
import { OnlineBoard, type BoardState } from "./OnlineBoard";
import { BoundedReconnectQueue } from "./reconnectQueue";

type Grant = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  studentId: string;
  memberId: string;
  displayName: string;
};
type Member = {
  id: string;
  studentId: string;
  state: string;
  displayName: string;
  studentIdRef?: { name: string };
};
type Room = {
  waiting?: boolean;
  capabilities?: { boardWrite: boolean };
  sessionStatus?: string;
  session?: {
    id: string;
    title: string;
    status: "draft" | "scheduled" | "live" | "ended" | "reviewed";
    version: number;
    sharedGoal: string;
    currentActivityId: string | null;
    Activity_sessionId_items?: { id: string; title: string }[];
    RoomMember_sessionId_items?: Member[];
  };
  boards?: BoardState[];
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
  }[];
  checks?: { id: string; question: string; status: string }[];
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
      <LiveRoom
        sessionId={grant.sessionId}
        grant={grant}
        onExit={() => {
          sessionStorage.removeItem(savedKey);
          location.href = "/";
        }}
      />
    );
  return (
    <main className="card online-lobby">
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
  );
}
export function LiveRoom({
  sessionId,
  grant,
  teacherId,
  onExit,
}: {
  sessionId: string;
  grant?: Grant;
  teacherId?: string;
  onExit: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [connected, setConnected] = useState(false);
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
  const board = grant
    ? room?.ownBoard
    : room?.boards?.find(
        (b) =>
          b.ownerId === "common" && b.id.includes(`:${s?.currentActivityId}:`),
      );
  return (
    <main className={`card online-room${room?.waiting ? " online-lobby" : ""}`}>
      <header className="online-room__header">
        <button onClick={onExit}>Quay lại</button>
        <h1>{s?.title || "Phòng chờ"}</h1>
        <p>
          Kết nối dữ liệu: {connected ? "đang kết nối" : "mất kết nối"} · Video:
          chưa cấu hình
        </p>
      </header>
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
          <section className="online-room__board" aria-label="Bảng học tập">
            {unsentStroke && (
              <div role="status">
                Nét vẽ chưa gửi vẫn được giữ lại.{" "}
                <button
                  disabled={!connected || s.status !== "live"}
                  onClick={() =>
                    void command(
                      `/sessions/${sessionId}/boards/${grant ? "own" : "common"}`,
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
              title={grant ? "Bảng nháp của tôi" : "Bảng chung"}
              board={board || null}
              actorId={grant?.studentId || teacherId || ""}
              canWrite={
                s.status === "live" &&
                (!grant || room?.capabilities?.boardWrite === true)
              }
              isOwnPrivateBoard={!!grant}
              busy={!!unsentStroke}
              onCommand={async (cmd) => {
                const accepted = await command(
                  `/sessions/${sessionId}/boards/${grant ? "own" : "common"}`,
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
                  : undefined
              }
            />
          </section>
          {!grant && (
            <>
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
                  void command(`/sessions/${sessionId}/end`, "POST", {})
                }
                disabled={s.status !== "live"}
              >
                Kết thúc
              </button>
              <section
                className="online-room__members"
                aria-label="Học sinh trong phòng"
              >
                <h2>Học sinh</h2>
                {members.map((m) => (
                  <div key={m.id}>
                    {m.displayName || m.studentIdRef?.name} ·{" "}
                    {statusLabel(m.state)}{" "}
                    <button
                      onClick={() =>
                        void request<{ inviteUrl: string }>(
                          `/sessions/${sessionId}/invites`,
                          {
                            method: "POST",
                            body: JSON.stringify({ studentId: m.studentId }),
                          },
                        )
                          .then((r) => setLink(r.inviteUrl))
                          .catch((e) => setError(e.message))
                      }
                    >
                      Tạo liên kết mời
                    </button>
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
          {!grant && s.Activity_sessionId_items && (
            <section className="online-room__activity">
              <h2>Hoạt động</h2>
              <select
                aria-label="Hoạt động hiện tại"
                value={s.currentActivityId || ""}
                onChange={(e) =>
                  void request(`/sessions/${sessionId}/classroom`, {
                    method: "PATCH",
                    headers: { "If-Match-Version": String(s.version) },
                    body: JSON.stringify({
                      currentActivityId: e.target.value || null,
                    }),
                  })
                    .then(load)
                    .catch((e) => setError(e.message))
                }
              >
                <option value="">Chọn hoạt động</option>
                {s.Activity_sessionId_items.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
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
                <button disabled={s.status !== "live" || !s.currentActivityId}>
                  Mở câu hỏi
                </button>
              </form>
              {room?.checks?.map((c) => (
                <p key={c.id}>
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
                  <button disabled={s.status !== "live"}>
                    Gửi câu trả lời
                  </button>
                </form>
              )}
            </section>
          )}
          {grant && (
            <section className="online-room__submissions">
              <h2>Bài làm</h2>
              <SubmissionForm
                sessionId={sessionId}
                activityId={s.currentActivityId}
                enabled={s.status === "live"}
                request={request}
                onSubmitted={load}
              />
              {!room?.ownSubmissions?.length && (
                <p>Chưa có bài làm nào được nộp.</p>
              )}
              {room?.ownSubmissions?.map((x) => (
                <p key={x.id}>
                  {x.title}: {x.answer}{" "}
                  {x.finalFeedback && `— ${x.finalFeedback}`}
                </p>
              ))}
            </section>
          )}
          {!grant && (
            <section className="online-room__submissions">
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
    </main>
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
