import type {
  DevicePermissionState,
  MediaDevicePermissions,
  MediaParticipant,
  MediaSessionConfig,
  MediaSessionHandle,
  MediaSessionStatus,
} from "./types";

export function createMockSession(
  container: HTMLElement,
  config: MediaSessionConfig,
): Promise<MediaSessionHandle> {
  const listeners: Record<string, Set<(...args: any[]) => void>> = {};
  const emit = (event: string, ...args: any[]) => {
    listeners[event]?.forEach((cb) => {
      try {
        cb(...args);
      } catch (err) {
        console.error(`[MockProvider] Error in listener for ${event}:`, err);
      }
    });
  };

  let status: MediaSessionStatus = "joining";
  let error: string | null = null;
  let activeSpeakerId: string | null = config.isHost ? config.userId : "mock-teacher";
  let audioMuted = false;
  let videoOn = true;
  let isSharing = false;
  let isDestroyed = false;

  const permissions: MediaDevicePermissions = {
    audio: "granted",
    video: "granted",
    screen: "granted",
  };

  const participantsMap = new Map<string, MediaParticipant>();

  // Add self
  participantsMap.set(config.userId, {
    id: config.userId,
    name: config.userName,
    isHost: config.isHost,
    isSelf: true,
    audioMuted,
    videoOn,
    isSharing,
    isSpeaking: activeSpeakerId === config.userId,
  });

  // Add counterpart mock peer so roster is populated
  if (config.isHost) {
    participantsMap.set("mock-student-1", {
      id: "mock-student-1",
      name: "Học sinh (Mô phỏng)",
      isHost: false,
      isSelf: false,
      audioMuted: true,
      videoOn: true,
      isSharing: false,
      isSpeaking: false,
    });
  } else {
    participantsMap.set("mock-teacher", {
      id: "mock-teacher",
      name: "Giáo viên (Mô phỏng)",
      isHost: true,
      isSelf: false,
      audioMuted: false,
      videoOn: true,
      isSharing: false,
      isSpeaking: activeSpeakerId === "mock-teacher",
    });
  }

  // Render mock UI inside container using strict DOM manipulation (no innerHTML interpolation)
  container.innerHTML = "";
  const mockRoot = document.createElement("div");
  mockRoot.className = "mock-media";
  mockRoot.setAttribute("data-testid", "mock-media-provider");

  const banner = document.createElement("div");
  banner.className = "mock-media__banner";
  banner.setAttribute("role", "status");
  banner.textContent =
    "Môi trường giả lập (Simulated Media) — Không sử dụng camera/microphone thật";
  mockRoot.appendChild(banner);

  const grid = document.createElement("div");
  grid.className = "mock-media__grid";
  mockRoot.appendChild(grid);

  function renderTiles() {
    if (isDestroyed) return;
    grid.innerHTML = "";
    participantsMap.forEach((p) => {
      const tile = document.createElement("div");
      tile.className = `mock-media__tile${p.isSpeaking ? " mock-media__tile--speaking" : ""}`;
      tile.setAttribute("data-testid", `media-tile-${p.id}`);
      tile.setAttribute("data-user-id", p.id);

      const avatar = document.createElement("div");
      avatar.className = "mock-media__avatar";
      avatar.textContent = (p.name || "").slice(0, 2).toUpperCase();

      if (p.videoOn) {
        const preview = document.createElement("div");
        preview.className = "mock-media__video-sim";
        const simSpan = document.createElement("span");
        simSpan.textContent = `[Video: ${p.name}]`;
        preview.appendChild(simSpan);
        tile.appendChild(preview);
      } else {
        tile.appendChild(avatar);
      }

      const info = document.createElement("div");
      info.className = "mock-media__tile-info";

      const nameSpan = document.createElement("span");
      nameSpan.className = "mock-media__tile-name";
      nameSpan.textContent = `${p.name}${p.isSelf ? " (Bạn)" : ""}${p.isHost ? " ★" : ""}`;

      const statusSpan = document.createElement("span");
      statusSpan.className = "mock-media__tile-status";
      statusSpan.textContent = `${p.audioMuted ? "🔇 Mic tắt" : "🎙️ Mic bật"}${p.isSharing ? " · 🖥️ Đang chia sẻ" : ""}`;

      info.appendChild(nameSpan);
      info.appendChild(statusSpan);
      tile.appendChild(info);
      grid.appendChild(tile);
    });
  }

  container.appendChild(mockRoot);
  renderTiles();

  // Async simulated connection with timer handle for cleanup
  let connectTimer: any = setTimeout(() => {
    connectTimer = null;
    if (isDestroyed) return;
    status = "connected";
    emit("status-change", status);
    emit("participants-change", Array.from(participantsMap.values()));
  }, 100);

  const handle: MediaSessionHandle = {
    provider: "mock",
    getStatus: () => status,
    getError: () => error,
    getParticipants: () => Array.from(participantsMap.values()),
    getActiveSpeakerId: () => activeSpeakerId,
    isAudioMuted: () => audioMuted,
    isVideoOn: () => videoOn,
    isScreenSharing: () => isSharing,
    getDevicePermissions: () => ({ ...permissions }),

    async toggleAudio(muted?: boolean) {
      if (isDestroyed) return false;
      audioMuted = muted !== undefined ? muted : !audioMuted;
      const self = participantsMap.get(config.userId);
      if (self) {
        self.audioMuted = audioMuted;
        if (!audioMuted) {
          activeSpeakerId = config.userId;
        } else if (activeSpeakerId === config.userId) {
          activeSpeakerId = null;
        }
        self.isSpeaking = activeSpeakerId === config.userId;
      }
      renderTiles();
      emit("participants-change", Array.from(participantsMap.values()));
      emit("active-speaker-change", activeSpeakerId);
      return !audioMuted;
    },

    async toggleVideo(on?: boolean) {
      if (isDestroyed) return false;
      videoOn = on !== undefined ? on : !videoOn;
      const self = participantsMap.get(config.userId);
      if (self) self.videoOn = videoOn;
      renderTiles();
      emit("participants-change", Array.from(participantsMap.values()));
      return videoOn;
    },

    async toggleShare(sharing?: boolean) {
      if (isDestroyed) return false;
      isSharing = sharing !== undefined ? sharing : !isSharing;
      const self = participantsMap.get(config.userId);
      if (self) self.isSharing = isSharing;
      renderTiles();
      emit("participants-change", Array.from(participantsMap.values()));
      return isSharing;
    },

    async requestDevicePermission(kind: "audio" | "video" | "screen") {
      permissions[kind] = "granted";
      emit("permissions-change", { ...permissions });
      return true;
    },

    async leave() {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      isDestroyed = true;
      status = "disconnected";
      emit("status-change", status);
    },

    async destroy() {
      await this.leave();
      container.innerHTML = "";
    },

    on(event: string, cb: (...args: any[]) => void) {
      if (!listeners[event]) listeners[event] = new Set();
      listeners[event].add(cb);
    },

    off(event: string, cb: (...args: any[]) => void) {
      listeners[event]?.delete(cb);
    },
  };

  return Promise.resolve(handle);
}
