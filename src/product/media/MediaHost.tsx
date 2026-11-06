import { useEffect, useRef, useState } from "react";
import type { MediaDevicePermissions, MediaParticipant, MediaSessionHandle, MediaSessionStatus, VideoTokenResponse } from "./types";
import { createMockSession } from "./mockProvider";
import { createZoomSession } from "./zoomAdapter";
import { MediaLifecycle } from "./lifecycle";
import "./media.css";

interface MediaHostProps {
  sessionId: string;
  isLive: boolean;
  role: "teacher" | "student";
  displayName: string;
  userId: string;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  onError?: (error: string) => void;
  onStatusChange?: (description: string) => void;
  /** Called whenever the provider reports a roster change (used to follow screen sharing). */
  onParticipantsChange?: (participants: MediaParticipant[]) => void;
  /** "stage": video fills its container, without the status header and help text. */
  variant?: "panel" | "stage";
}

export function MediaHost(props: MediaHostProps) {
  const { sessionId, isLive, role, userId } = props;
  const propsRef = useRef(props);
  propsRef.current = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const lifecycle = useRef(new MediaLifecycle());
  const handleRef = useRef<MediaSessionHandle | null>(null);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState<MediaSessionStatus>("idle");
  const [provider, setProvider] = useState<"mock" | "zoom" | "none">("none");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [participants, setParticipants] = useState<MediaParticipant[]>([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [permissions, setPermissions] = useState<MediaDevicePermissions>({ audio: "prompt", video: "prompt", screen: "prompt" });
  const [permissionAlert, setPermissionAlert] = useState<string | null>(null);

  useEffect(() => {
    const manager = lifecycle.current;
    if (!isLive) {
      handleRef.current = null;
      setStatus("idle"); setErrorMsg(null); setParticipants([]); setActiveSpeakerId(null);
      propsRef.current.onStatusChange?.("chưa kết nối");
      void manager.stop().catch(() => {});
      return;
    }
    setStatus("joining"); setErrorMsg(null); setPermissionAlert(null);
    setParticipants([]); setActiveSpeakerId(null);
    propsRef.current.onStatusChange?.("đang chuẩn bị");
    void manager.start(async (signal) => {
      const data = await propsRef.current.request<VideoTokenResponse>(`/sessions/${sessionId}/video-token`, { method: "POST", signal });
      signal.throwIfAborted();
      if ((data.provider !== "zoom" && data.provider !== "mock") || !data.token || data.topic !== sessionId || data.isHost !== (role === "teacher")) {
        throw new Error("Phản hồi dịch vụ video không hợp lệ");
      }
      setProvider(data.provider);
      const mount = document.createElement("div");
      containerRef.current!.appendChild(mount);
      try {
        const config = { ...data, userId, userName: data.userName || propsRef.current.displayName, signal };
        const handle = data.provider === "zoom" ? await createZoomSession(mount, config) : await createMockSession(mount, config);
        const destroy = handle.destroy.bind(handle);
        let destroyed: Promise<void> | undefined;
        handle.destroy = () => destroyed ||= destroy().finally(() => mount.remove());
        return handle;
      } catch (error) { mount.remove(); throw error; }
    }, (handle, signal) => {
      handleRef.current = handle;
      const setConnection = (next: MediaSessionStatus) => {
        if (signal.aborted) return;
        setStatus(next);
        const label = next === "connected" ? (handle.provider === "mock" ? "đã kết nối (giả lập)" : "đã kết nối Zoom")
          : next === "reconnecting" ? "đang khôi phục" : next === "joining" ? "đang chuẩn bị" : next === "error" ? "lỗi dịch vụ" : "đã ngắt";
        propsRef.current.onStatusChange?.(label);
      };
      const sync = () => {
        if (signal.aborted) return;
        const roster = handle.getParticipants();
        setParticipants(roster); setActiveSpeakerId(handle.getActiveSpeakerId());
        propsRef.current.onParticipantsChange?.(roster);
        setIsMuted(handle.isAudioMuted()); setIsVideoOn(handle.isVideoOn()); setIsSharing(handle.isScreenSharing());
        setPermissions(handle.getDevicePermissions());
      };
      handle.on("status-change", setConnection);
      handle.on("participants-change", sync);
      handle.on("active-speaker-change", sync);
      handle.on("permissions-change", sync);
      handle.on("error", () => {
        if (signal.aborted) return;
        const message = "Video gặp sự cố. Kiểm tra mạng và quyền thiết bị rồi thử lại.";
        setConnection("error"); setErrorMsg(message); propsRef.current.onError?.(message);
      });
      sync(); setConnection(handle.getStatus());
    }, () => {
      const message = "Không thể kết nối video. Có thể thử lại và tiếp tục học bằng học liệu.";
      handleRef.current = null; setStatus("error"); setErrorMsg(message);
      propsRef.current.onError?.(message); propsRef.current.onStatusChange?.("lỗi dịch vụ");
    });
    return () => {
      handleRef.current = null;
      void manager.stop().catch(() => {});
    };
  }, [sessionId, isLive, role, userId, retry]);

  const toggle = async (kind: "audio" | "video" | "screen") => {
    const handle = handleRef.current;
    if (!handle || provider !== "mock") return;
    if (permissions[kind] === "denied") {
      setPermissionAlert("Trình duyệt đã chặn quyền thiết bị. Kiểm tra quyền của trang rồi thử lại.");
      return;
    }
    try {
      if (kind === "audio") setIsMuted(!(await handle.toggleAudio()));
      if (kind === "video") setIsVideoOn(await handle.toggleVideo());
      if (kind === "screen") setIsSharing(await handle.toggleShare());
    } catch { setErrorMsg("Không thể điều khiển thiết bị."); }
  };
  const handleToggleAudio = () => void toggle("audio");
  const handleToggleVideo = () => void toggle("video");
  const handleToggleShare = () => void toggle("screen");
  const handleSimulatePermissionDenial = () => {
    setPermissions((current) => ({ ...current, audio: "denied", video: "denied" }));
    setPermissionAlert("Trình duyệt đã chặn quyền Camera/Microphone. Vui lòng kiểm tra quyền thiết bị trong cài đặt trình duyệt.");
  };
  const handleGrantPermission = async (kind: "audio" | "video") => {
    const handle = handleRef.current;
    if (handle && await handle.requestDevicePermission(kind)) {
      setPermissions(handle.getDevicePermissions()); setPermissionAlert(null);
    }
  };
  const activeSpeaker = participants.find((participant) => participant.id === activeSpeakerId);

  const stage = props.variant === "stage";
  return (
    <section
      className={`online-room__media${stage ? " online-room__media--stage" : ""}`}
      aria-label="Khu vực video lớp học"
      data-testid="online-room-media"
      data-status={status}
    >
      {!stage && <div className="online-room__media-header">
        <div>
          <span
            className={`online-room__media-status online-room__media-status--${status}`}
            data-testid="media-status-badge"
          >
            {status === "connected" &&
              (provider === "mock"
                ? "Đã kết nối video (Giả lập)"
                : "Đã kết nối Zoom Video")}
            {status === "joining" && "Đang chuẩn bị video…"}
            {status === "reconnecting" && "Đang khôi phục video…"}
            {status === "error" && "Lỗi dịch vụ video"}
            {status === "idle" && "Chưa bắt đầu video"}
            {status === "disconnected" && "Video đã ngắt"}
          </span>
          {activeSpeaker && (
            <span
              className="media-controls__speaker-badge"
              data-testid="active-speaker-badge"
            >
              🔊 Đang nói: {activeSpeaker.name}
            </span>
          )}
        </div>
        {status === "connected" && (
          <span className="media-controls__roster">
            Thành viên video: {participants.length}
          </span>
        )}
      </div>}

      {permissionAlert && (
        <div
          className="media-controls__permission-alert"
          role="alert"
          data-testid="media-permission-alert"
        >
          {permissionAlert}
          <button
            type="button"
            className="button small"
            style={{ marginLeft: "8px" }}
            onClick={() => {
              void handleGrantPermission("audio");
              void handleGrantPermission("video");
            }}
          >
            Cấp quyền lại
          </button>
        </div>
      )}

      {isLive && (errorMsg || status === "disconnected") && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "4px 0" }}>
          <p role="alert" style={{ color: "#dc2626", margin: 0 }}>
            {errorMsg || "Video đã ngắt. Có thể thử kết nối lại."}
          </p>
          <button
            type="button"
            className="button small secondary"
            onClick={() => setRetry((value) => value + 1)}
            data-testid="btn-retry-media"
          >
            Thử lại
          </button>
        </div>
      )}

      {!stage && provider === "zoom" && isLive && (
        <p>Điều khiển mic, camera và chia sẻ trong thanh Zoom. Nếu trình duyệt chặn thiết bị, mở quyền của trang rồi thử lại; học liệu và bản nháp vẫn dùng được.</p>
      )}
      {/* Persistent DOM container stays mounted */}
      <div className="online-room__media-stage">
        <div
          ref={containerRef}
          className="online-room__media-container"
          data-testid="media-persistent-stage"
        />
      </div>

      {status === "connected" && provider === "mock" && (
        <div className="media-controls" aria-label="Điều khiển video">
          <button
            type="button"
            className="button ghost small"
            onClick={handleToggleAudio}
            aria-pressed={isMuted}
            data-testid="btn-toggle-mic"
          >
            {isMuted ? "🎙️ Bật mic" : "🔇 Tắt mic"}
          </button>
          <button
            type="button"
            className="button ghost small"
            onClick={handleToggleVideo}
            aria-pressed={!isVideoOn}
            data-testid="btn-toggle-camera"
          >
            {isVideoOn ? "📷 Tắt camera" : "📹 Bật camera"}
          </button>
          <button
            type="button"
            className="button ghost small"
            onClick={handleToggleShare}
            aria-pressed={isSharing}
            data-testid="btn-toggle-share"
          >
            {isSharing ? "⏹️ Dừng chia sẻ" : "🖥️ Chia sẻ màn hình"}
          </button>
          {provider === "mock" && (
            <button
              type="button"
              className="button secondary small"
              onClick={handleSimulatePermissionDenial}
              data-testid="btn-sim-permission-denial"
              title="Kiểm tra cảnh báo hướng dẫn quyền thiết bị"
            >
              Kiểm tra chặn quyền
            </button>
          )}
        </div>
      )}
    </section>
  );
}
