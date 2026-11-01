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
}

export function MediaHost({
  sessionId,
  isLive,
  role,
  displayName,
  userId,
  request,
  onError,
}: MediaHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MediaSessionHandle | null>(null);

  const [status, setStatus] = useState<MediaSessionStatus>("idle");
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
    if (handleRef.current) {
      try {
        await handleRef.current.leave();
        await handleRef.current.destroy();
      } catch (e) {
        console.warn("[MediaHost] Error during session cleanup:", e);
      }
      handleRef.current = null;
    }
    setStatus("idle");
    setParticipants([]);
    setActiveSpeakerId(null);
  }, []);

  const connectMedia = useCallback(async () => {
    if (!containerRef.current || !sessionId) return;
    setStatus("joining");
    setErrorMsg(null);
    setPermissionAlert(null);

    try {
      const data = await request<VideoTokenResponse>(
        `/sessions/${sessionId}/video-token`,
        { method: "POST" },
      );

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

      handleRef.current = handle;
      setStatus(handle.getStatus());
      setParticipants(handle.getParticipants());
      setActiveSpeakerId(handle.getActiveSpeakerId());
      setIsMuted(handle.isAudioMuted());
      setIsVideoOn(handle.isVideoOn());
      setIsSharing(handle.isScreenSharing());
      setPermissions(handle.getDevicePermissions());

      handle.on("status-change", (nextStatus: MediaSessionStatus) => {
        setStatus(nextStatus);
      });

      handle.on("participants-change", (list: MediaParticipant[]) => {
        setParticipants([...list]);
      });

      handle.on("active-speaker-change", (speakerId: string | null) => {
        setActiveSpeakerId(speakerId);
      });

      handle.on("error", (err: string) => {
        setErrorMsg(err);
        onError?.(err);
      });

      handle.on("permissions-change", (perms: MediaDevicePermissions) => {
        setPermissions({ ...perms });
      });
    } catch (err: any) {
      console.warn("[MediaHost] video-token request failed:", err);
      setStatus("error");
      const msg =
        err?.status === 503
          ? "Dịch vụ video chưa được cấu hình trên môi trường này."
          : err?.message || "Không thể kết nối dịch vụ video.";
      setErrorMsg(msg);
      onError?.(msg);
    }
  }, [sessionId, role, displayName, userId, request, onError]);

  useEffect(() => {
    if (isLive) {
      void connectMedia();
    } else {
      void cleanupSession();
    }
    return () => {
      void cleanupSession();
    };
  }, [isLive, connectMedia, cleanupSession]);

  const handleToggleAudio = async () => {
    if (!handleRef.current) return;
    if (permissions.audio === "denied") {
      setPermissionAlert(
        "Trình duyệt đã chặn quyền Microphone. Vui lòng nhấn vào biểu tượng ổ khóa trên thanh địa chỉ để cấp quyền.",
      );
      return;
    }
    const unmuted = await handleRef.current.toggleAudio();
    setIsMuted(!unmuted);
  };

  const handleToggleVideo = async () => {
    if (!handleRef.current) return;
    if (permissions.video === "denied") {
      setPermissionAlert(
        "Trình duyệt đã chặn quyền Camera. Vui lòng nhấn vào biểu tượng ổ khóa trên thanh địa chỉ để cấp quyền.",
      );
      return;
    }
    const on = await handleRef.current.toggleVideo();
    setIsVideoOn(on);
  };

  const handleToggleShare = async () => {
    if (!handleRef.current) return;
    const sharing = await handleRef.current.toggleShare();
    setIsSharing(sharing);
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
        <p role="alert" style={{ color: "#dc2626", margin: "4px 0" }}>
          {errorMsg}
        </p>
      )}

      {/* The persistent DOM container stays mounted */}
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
          <button
            type="button"
            className="button secondary small"
            onClick={handleSimulatePermissionDenial}
            data-testid="btn-sim-permission-denial"
            title="Kiểm tra cảnh báo hướng dẫn quyền thiết bị"
          >
            Kiểm tra chặn quyền
          </button>
        </div>
      )}
    </section>
  );
}
