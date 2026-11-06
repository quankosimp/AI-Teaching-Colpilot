import { useCallback, useEffect, useRef, useState } from "react";
import type { Participant, VideoPlayer } from "@zoom/videosdk";
import type { VideoTokenResponse } from "./types";

/**
 * Lớp học video tự vẽ (Zoom Video SDK lõi): mỗi người một ghế, màn chia sẻ đặt vào chỗ app chọn.
 * Khung Zoom dựng sẵn (UI Toolkit) không cho xếp ô video theo bố cục riêng nên phòng học không dùng nó nữa.
 */
type Client = ReturnType<(typeof import("@zoom/videosdk"))["default"]["createClient"]>;
type Stream = ReturnType<Client["getMediaStream"]>;

export type ClassVideoStatus = "idle" | "joining" | "connected" | "reconnecting" | "error" | "ended";
export type VideoSeat = {
  /** Zoom user id; với chế độ giả lập là số âm. */
  userId: number;
  name: string;
  /** user_key trong JWT: id thành viên phòng (học sinh) hoặc id giáo viên. */
  key: string;
  isSelf: boolean;
  isHost: boolean;
  videoOn: boolean;
  audioOn: boolean;
  muted: boolean;
  sharing: boolean;
};
export type ClassVideo = {
  provider: "zoom" | "mock" | "none";
  status: ClassVideoStatus;
  error: string;
  seats: VideoSeat[];
  speakerId: number | null;
  shareUserId: number | null;
  micOn: boolean;
  camOn: boolean;
  sharingSelf: boolean;
  busy: "" | "mic" | "cam" | "share";
  toggleMic: () => void;
  toggleCam: () => void;
  toggleShare: () => void;
  /** Mời một người bật micro (chỉ chủ phòng). */
  askUnmute: (userId: number) => void;
  attachVideo: (userId: number, el: VideoPlayer) => void;
  detachVideo: (userId: number, el: VideoPlayer) => void;
  attachShare: (userId: number, el: VideoPlayer) => void;
  detachShare: (userId: number, el: VideoPlayer) => void;
  /** Phần tử để trình duyệt vẽ màn hình mình đang chia sẻ (video hoặc canvas tuỳ trình duyệt). */
  selfShareTarget: (el: HTMLVideoElement | HTMLCanvasElement | null) => void;
  selfShareUsesVideo: boolean;
  retry: () => void;
};

const message = (e: unknown, fallback: string) => {
  const anyE = e as { reason?: string; message?: string; type?: string } | undefined;
  const reason = anyE?.reason || anyE?.message || "";
  if (/permission|denied|NotAllowed/i.test(reason))
    return "Trình duyệt đang chặn camera hoặc micro. Bấm biểu tượng ổ khoá trên thanh địa chỉ để cho phép rồi thử lại.";
  if (/user cancel|cancel/i.test(reason)) return "";
  return fallback;
};

export function useClassVideo(opts: {
  sessionId: string;
  isLive: boolean;
  role: "teacher" | "student";
  displayName: string;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
}): ClassVideo {
  const { sessionId, isLive, role } = opts;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const client = useRef<Client | null>(null);
  const stream = useRef<Stream | null>(null);
  // Tăng mỗi khi có (hoặc mất) luồng media. Zoom có thể báo người đang chia sẻ / bật camera
  // ngay trong lúc join, trước khi có luồng: các khung hình phải gắn lại khi luồng sẵn sàng.
  const [streamEpoch, setStreamEpoch] = useState(0);
  const shareEl = useRef<HTMLVideoElement | HTMLCanvasElement | null>(null);
  const [provider, setProvider] = useState<ClassVideo["provider"]>("none");
  const [status, setStatus] = useState<ClassVideoStatus>("idle");
  const [error, setError] = useState("");
  const [seats, setSeats] = useState<VideoSeat[]>([]);
  const [speakerId, setSpeakerId] = useState<number | null>(null);
  const [shareUserId, setShareUserId] = useState<number | null>(null);
  const [audioJoined, setAudioJoined] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [sharingSelf, setSharingSelf] = useState(false);
  const [busy, setBusy] = useState<ClassVideo["busy"]>("");
  const [attempt, setAttempt] = useState(0);
  const [usesVideo, setUsesVideo] = useState(true);

  const sync = useCallback(() => {
    const c = client.current;
    if (!c) return;
    const self = c.getCurrentUserInfo();
    const list = c.getAllUser().map((u: Participant) => ({
      userId: u.userId,
      name: u.displayName,
      key: u.userKey || u.userIdentity || "",
      isSelf: u.userId === self?.userId,
      isHost: u.isHost,
      videoOn: u.bVideoOn === true,
      audioOn: !!u.audio,
      muted: !u.audio || u.muted !== false,
      sharing: u.sharerOn === true,
    }));
    setSeats(list);
    const me = list.find((s) => s.isSelf);
    if (me) {
      setMicOn(!!me.audioOn && !me.muted);
      setCamOn(me.videoOn);
    }
  }, []);

  useEffect(() => {
    if (!isLive) {
      setStatus("idle");
      setSeats([]);
      setShareUserId(null);
      return;
    }
    let alive = true;
    const off: (() => void)[] = [];
    setStatus("joining");
    setError("");
    (async () => {
      const data = await optsRef.current.request<VideoTokenResponse>(`/sessions/${sessionId}/video-token`, { method: "POST" });
      if (!alive) return;
      if (!data?.token || data.topic !== sessionId || data.isHost !== (role === "teacher"))
        throw new Error("Phản hồi dịch vụ video không hợp lệ");
      setProvider(data.provider);
      if (data.provider !== "zoom") {
        // Chế độ giả lập (máy chủ chưa có khoá Zoom): chỉ có ghế của chính mình, không có hình.
        setSeats([{ userId: -1, name: data.userName || optsRef.current.displayName, key: "", isSelf: true, isHost: data.isHost, videoOn: false, audioOn: false, muted: true, sharing: false }]);
        setStatus("connected");
        return;
      }
      const ZoomVideo = (await import("@zoom/videosdk")).default;
      if (!alive) return;
      const c = ZoomVideo.createClient();
      client.current = c;
      await c.init("en-US", "Global", { patchJsMedia: true, leaveOnPageUnload: true, enforceMultipleVideos: true });
      if (!alive) return;
      const on = (event: string, fn: (...a: any[]) => void) => {
        (c.on as (e: string, f: (...a: any[]) => void) => void)(event, fn);
        off.push(() => (c.off as (e: string, f: (...a: any[]) => void) => void)(event, fn));
      };
      on("user-added", sync);
      on("user-removed", sync);
      on("user-updated", sync);
      on("peer-video-state-change", sync);
      on("current-audio-change", sync);
      on("active-speaker", (p: { userId?: number } | { userId?: number }[]) => {
        const u = Array.isArray(p) ? p[0] : p;
        setSpeakerId(u?.userId ?? null);
      });
      on("active-share-change", (p: { state: "Active" | "Inactive"; userId: number }) => {
        setShareUserId(p.state === "Active" ? p.userId : null);
        sync();
      });
      on("passively-stop-share", () => {
        setSharingSelf(false);
        sync();
      });
      on("connection-change", (p: { state?: string }) => {
        if (p?.state === "Reconnecting") setStatus("reconnecting");
        else if (p?.state === "Connected") setStatus("connected");
        else if (p?.state === "Closed") setStatus("ended");
        else if (p?.state === "Fail") {
          setStatus("error");
          setError("Mất kết nối video. Kiểm tra mạng rồi bấm Thử lại.");
        }
      });
      await c.join(data.topic, data.token, data.userName || optsRef.current.displayName);
      if (!alive) {
        await c.leave().catch(() => {});
        return;
      }
      const s = c.getMediaStream();
      stream.current = s;
      setStreamEpoch((n) => n + 1);
      setUsesVideo(s.isStartShareScreenWithVideoElement());
      setStatus("connected");
      sync();
      const active = s.getActiveShareUserId();
      if (active) setShareUserId(active);
      // Vào âm thanh ở trạng thái tắt micro: nghe được lớp ngay, tự bật micro khi cần nói.
      try {
        await s.startAudio({ mute: true });
        if (alive) setAudioJoined(true);
      } catch {
        /* Trình duyệt cần một cú bấm trước khi phát âm thanh: lần bấm Micro đầu tiên sẽ vào âm thanh. */
      }
      if (alive) sync();
    })().catch((e) => {
      if (!alive) return;
      setStatus("error");
      setError(message(e, "Không kết nối được video. Bài học trên bảng vẫn dùng được; bấm Thử lại khi mạng ổn định."));
    });
    return () => {
      alive = false;
      off.forEach((f) => {
        try { f(); } catch { /* client đã huỷ */ }
      });
      const c = client.current;
      client.current = null;
      stream.current = null;
      setStreamEpoch((n) => n + 1);
      setAudioJoined(false);
      setSharingSelf(false);
      setShareUserId(null);
      setSeats([]);
      if (c) void c.leave().catch(() => {});
    };
  }, [sessionId, isLive, role, attempt, sync]);

  const run = async (kind: ClassVideo["busy"], fn: (s: Stream) => Promise<unknown>) => {
    const s = stream.current;
    if (!s || busy) return;
    setBusy(kind);
    setError("");
    try {
      await fn(s);
    } catch (e) {
      const m = message(e, kind === "share" ? "Không chia sẻ được màn hình." : "Không điều khiển được thiết bị.");
      if (m) setError(m);
    } finally {
      setBusy("");
      sync();
    }
  };
  const toggleMic = () => {
    if (provider === "mock") return setMicOn((v) => !v);
    void run("mic", async (s) => {
      if (!audioJoined) {
        await s.startAudio();
        setAudioJoined(true);
        return;
      }
      if (s.isAudioMuted()) await s.unmuteAudio();
      else await s.muteAudio();
    });
  };
  const toggleCam = () => {
    if (provider === "mock") return setCamOn((v) => !v);
    void run("cam", async (s) => {
      if (s.isCapturingVideo()) await s.stopVideo();
      else await s.startVideo();
    });
  };
  const toggleShare = () => {
    if (provider === "mock") return setSharingSelf((v) => !v);
    void run("share", async (s) => {
      if (sharingSelf) {
        await s.stopShareScreen();
        setSharingSelf(false);
        return;
      }
      if (!shareEl.current) throw new Error("share target missing");
      await s.startShareScreen(shareEl.current as HTMLCanvasElement & HTMLVideoElement);
      setSharingSelf(true);
    });
  };
  const askUnmute = (userId: number) => {
    const s = stream.current;
    if (s && userId > 0) void Promise.resolve(s.unmuteAudio(userId)).catch(() => {});
  };
  const attachVideo = useCallback((userId: number, el: VideoPlayer) => {
    const s = stream.current;
    if (!s || userId < 0) return;
    void import("@zoom/videosdk").then(({ VideoQuality }) => s.attachVideo(userId, VideoQuality.Video_360P, el)).catch(() => {});
  }, [streamEpoch]);
  const detachVideo = useCallback((userId: number, el: VideoPlayer) => {
    const s = stream.current;
    if (s && userId > 0) void Promise.resolve(s.detachVideo(userId, el)).catch(() => {});
  }, [streamEpoch]);
  const attachShare = useCallback((userId: number, el: VideoPlayer) => {
    const s = stream.current;
    if (!s) return;
    // attachShareView báo lỗi bằng giá trị trả về (ExecutedFailure), không ném lỗi.
    void Promise.resolve(s.attachShareView(userId, el)).then(
      (r) => { if (!(r instanceof HTMLElement)) console.warn("Không hiện được màn hình chia sẻ", r); },
      (e) => console.warn("Không hiện được màn hình chia sẻ", e),
    );
  }, [streamEpoch]);
  const detachShare = useCallback((userId: number, el: VideoPlayer) => {
    const s = stream.current;
    if (s) void Promise.resolve(s.detachShareView(userId, el)).catch(() => {});
  }, [streamEpoch]);
  const selfShareTarget = useCallback((el: HTMLVideoElement | HTMLCanvasElement | null) => {
    shareEl.current = el;
  }, []);

  return {
    provider, status, error, seats, speakerId, shareUserId,
    micOn: audioJoined || provider === "mock" ? micOn : false,
    camOn, sharingSelf, busy,
    toggleMic, toggleCam, toggleShare, askUnmute,
    attachVideo, detachVideo, attachShare, detachShare,
    selfShareTarget, selfShareUsesVideo: usesVideo,
    retry: () => setAttempt((n) => n + 1),
  };
}
