import React, { useEffect, useRef, useState, useCallback } from "react";
import type {
  MediaDevicePermissions,
  MediaParticipant,
  MediaSessionConfig,
  MediaSessionHandle,
  MediaSessionStatus,
  VideoTokenResponse,
} from "./types";
import { createMockSession } from "./mockProvider";
import { createZoomSession } from "./zoomAdapter";
import "./media.css";

interface MediaHostProps {
  sessionId: string;
  isLive: boolean;
  role: "teacher" | "student";
  displayName: string;
  userId: string;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  onError?: (err: string) => void;
  onStatusChange?: (statusDesc: string) => void;
}

export function MediaHost({
  sessionId,
  isLive,
  role,
  displayName,
  userId,
  request,
  onError,
  onStatusChange,
}: MediaHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MediaSessionHandle | null>(null);
  const connectEpochRef = useRef(0);
  const connectedSessionIdRef = useRef<string | null>(null);
  const isJoiningRef = useRef(false);

  // Stable refs for props that might change identity across parent re-renders
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const requestRef = useRef(request);
  requestRef.current = request;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const [status, setStatus] = useState<MediaSessionStatus>("idle");
  const statusRef = useRef<MediaSessionStatus>("idle");
  statusRef.current = status;

  const [provider, setProvider] = useState<"zoom" | "mock" | "none">("none");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [participants, setParticipants] = useState<MediaParticipant[]>([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [permissions, setPermissions] = useState<MediaDevicePermissions>({
    audio: "prompt",
    video: "prompt",
    screen: "prompt",
  });
  const [permissionAlert, setPermissionAlert] = useState<string | null>(null);

  const cleanupSession = useCallback(async () => {
    // Invalidate any in-flight connection
    connectEpochRef.current++;
    connectedSessionIdRef.current = null;
    isJoiningRef.current = false;

    if (handleRef.current) {
      const h = handleRef.current;
      handleRef.current = null;
      try {
        await h.leave();
        await h.destroy();
      } catch (e) {
        console.warn("[MediaHost] Error during session cleanup:", e);
      }
    }
    setStatus("idle");
    setParticipants([]);
    setActiveSpeakerId(null);
    onStatusChangeRef.current?.("chưa kết nối");
  }, []);

  const connectMedia = useCallback(
    async (isRetry = false) => {
      if (!containerRef.current || !sessionId) return;

      // Avoid duplicate re-joins on polling / re-render
      if (!isRetry) {
        if (isJoiningRef.current) return;
        if (
          handleRef.current &&
          connectedSessionIdRef.current === sessionId &&
          (statusRef.current === "connected" || statusRef.current === "joining")
        ) {
          return;
        }
      }

      isJoiningRef.current = true;
      const currentEpoch = ++connectEpochRef.current;
      setStatus("joining");
      setErrorMsg(null);
      setPermissionAlert(null);
      onStatusChangeRef.current?.("đang chuẩn bị");

      try {
        const data = await requestRef.current<VideoTokenResponse>(
          `/sessions/${sessionId}/video-token`,
          { method: "POST" },
        );

        // Cancel if superseded by end / unmount / newer retry
        if (currentEpoch !== connectEpochRef.current) return;

        setProvider(data.provider);

        const config: MediaSessionConfig = {
          provider: data.provider,
          token: data.token,
          topic: data.topic,
          sessionName: data.sessionName || data.topic,
          userName: data.userName || displayName,
          userId,
          isHost: role === "teacher",
          roleType: data.roleType,
        };

        let handle: MediaSessionHandle;
        if (data.provider === "zoom") {
          handle = await createZoomSession(containerRef.current, config);
        } else {
          handle = await createMockSession(containerRef.current, config);
        }

        // Cancel if superseded during async session setup
        if (currentEpoch !== connectEpochRef.current) {
          void handle.destroy();
          return;
        }

        // Clean up any stale previous handle before assigning
        if (handleRef.current && handleRef.current !== handle) {
          void handleRef.current.destroy();
        }

        handleRef.current = handle;
        connectedSessionIdRef.current = sessionId;
        setStatus(handle.getStatus());
        setParticipants(handle.getParticipants());
        setActiveSpeakerId(handle.getActiveSpeakerId());
        setIsMuted(handle.isAudioMuted());
        setIsVideoOn(handle.isVideoOn());
        setIsSharing(handle.isScreenSharing());
        setPermissions(handle.getDevicePermissions());

        const initialLabel =
          data.provider === "mock"
            ? "đã kết nối (giả lập)"
            : "đã kết nối zoom";
        onStatusChangeRef.current?.(initialLabel);

        handle.on("status-change", (nextStatus: MediaSessionStatus) => {
          if (currentEpoch !== connectEpochRef.current) return;
          setStatus(nextStatus);
          if (nextStatus === "connected") {
            onStatusChangeRef.current?.(
              data.provider === "mock"
                ? "đã kết nối (giả lập)"
                : "đã kết nối zoom",
            );
          } else if (nextStatus === "reconnecting") {
            onStatusChangeRef.current?.("đang khôi phục");
          } else if (nextStatus === "disconnected") {
            onStatusChangeRef.current?.("đã ngắt");
          }
        });

        handle.on("participants-change", (list: MediaParticipant[]) => {
          if (currentEpoch !== connectEpochRef.current) return;
          setParticipants([...list]);
        });

        handle.on("active-speaker-change", (speakerId: string | null) => {
          if (currentEpoch !== connectEpochRef.current) return;
          setActiveSpeakerId(speakerId);
        });

        handle.on("error", (err: string) => {
          if (currentEpoch !== connectEpochRef.current) return;
          setErrorMsg(err);
          onErrorRef.current?.(err);
          onStatusChangeRef.current?.("lỗi dịch vụ");
        });

        handle.on("permissions-change", (perms: MediaDevicePermissions) => {
          if (currentEpoch !== connectEpochRef.current) return;
          setPermissions({ ...perms });
        });
      } catch (err: any) {
        if (currentEpoch !== connectEpochRef.current) return;
        console.warn("[MediaHost] video-token request failed:", err);
        setStatus("error");
        const msg =
          err?.status === 503
            ? "Dịch vụ video chưa được cấu hình trên môi trường này."
            : err?.message || "Không thể kết nối dịch vụ video.";
        setErrorMsg(msg);
        onErrorRef.current?.(msg);
        onStatusChangeRef.current?.(
          err?.status === 503 ? "chưa cấu hình" : "lỗi dịch vụ",
        );
      } finally {
        isJoiningRef.current = false;
      }
    },
    [sessionId, role, displayName, userId],
  );

  useEffect(() => {
    if (isLive) {
      void connectMedia();
    } else {
      void cleanupSession();
    }
    return () => {
      void cleanupSession();
    };
  }, [isLive, sessionId, connectMedia, cleanupSession]);

  const handleToggleAudio = async () => {
    if (!handleRef.current) return;
    if (permissions.audio === "denied") {
      setPermissionAlert(
        "Trình duyệt đã chặn quyền Microphone. Vui lòng kiểm tra quyền thiết bị trong cài đặt trình duyệt.",
      );
      return;
    }
    try {
      const unmuted = await handleRef.current.toggleAudio();
      setIsMuted(!unmuted);
    } catch (e: any) {
      setErrorMsg(e?.message || "Không thể điều khiển microphone");
    }
  };

  const handleToggleVideo = async () => {
    if (!handleRef.current) return;
    if (permissions.video === "denied") {
      setPermissionAlert(
        "Trình duyệt đã chặn quyền Camera. Vui lòng kiểm tra quyền thiết bị trong cài đặt trình duyệt.",
      );
      return;
    }
    try {
      const on = await handleRef.current.toggleVideo();
      setIsVideoOn(on);
    } catch (e: any) {
      setErrorMsg(e?.message || "Không thể điều khiển camera");
    }
  };

  const handleToggleShare = async () => {
    if (!handleRef.current) return;
    try {
      const sharing = await handleRef.current.toggleShare();
      setIsSharing(sharing);
    } catch (e: any) {
      setErrorMsg(e?.message || "Không thể chia sẻ màn hình");
    }
  };

  const handleSimulatePermissionDenial = () => {
    setPermissions((prev) => ({ ...prev, audio: "denied", video: "denied" }));
    setPermissionAlert(
      "Trình duyệt đã chặn quyền Camera/Microphone. Vui lòng kiểm tra quyền thiết bị trong cài đặt trình duyệt.",
    );
  };

  const handleGrantPermission = async (kind: "audio" | "video") => {
    if (!handleRef.current) return;
    await handleRef.current.requestDevicePermission(kind);
    setPermissionAlert(null);
  };

  const activeSpeaker = participants.find((p) => p.id === activeSpeakerId);

  return (
    <section
      className="online-room__media"
      aria-label="Khu vực video lớp học"
      data-testid="online-room-media"
    >
      <div className="online-room__media-header">
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
      </div>

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

      {errorMsg && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "4px 0" }}>
          <p role="alert" style={{ color: "#dc2626", margin: 0 }}>
            {errorMsg}
          </p>
          <button
            type="button"
            className="button small secondary"
            onClick={() => void connectMedia(true)}
            data-testid="btn-retry-media"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Persistent DOM container stays mounted */}
      <div className="online-room__media-stage">
        <div
          ref={containerRef}
          className="online-room__media-container"
          data-testid="media-persistent-stage"
        />
      </div>

      {status === "connected" && (
        <div className="media-controls" aria-label="Điều khiển video">
          <button
            type="button"
            onClick={handleToggleAudio}
            aria-pressed={isMuted}
            data-testid="btn-toggle-mic"
          >
            {isMuted ? "🎙️ Bật mic" : "🔇 Tắt mic"}
          </button>
          <button
            type="button"
            onClick={handleToggleVideo}
            aria-pressed={!isVideoOn}
            data-testid="btn-toggle-camera"
          >
            {isVideoOn ? "📷 Tắt camera" : "📹 Bật camera"}
          </button>
          <button
            type="button"
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
