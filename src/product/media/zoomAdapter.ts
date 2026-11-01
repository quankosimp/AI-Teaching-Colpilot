import type {
  MediaDevicePermissions,
  MediaParticipant,
  MediaSessionConfig,
  MediaSessionHandle,
  MediaSessionStatus,
} from "./types";

export async function createZoomSession(
  container: HTMLElement,
  config: MediaSessionConfig,
): Promise<MediaSessionHandle> {
  const listeners: Record<string, Set<(...args: any[]) => void>> = {};
  const emit = (event: string, ...args: any[]) => {
    listeners[event]?.forEach((cb) => {
      try {
        cb(...args);
      } catch (err) {
        console.error(`[ZoomAdapter] Error in listener for ${event}:`, err);
      }
    });
  };

  let status: MediaSessionStatus = "joining";
  let error: string | null = null;
  let activeSpeakerId: string | null = null;
  let audioMuted = false;
  let videoOn = true;
  let isSharing = false;

  const permissions: MediaDevicePermissions = {
    audio: "prompt",
    video: "prompt",
    screen: "prompt",
  };

  const participantsMap = new Map<string, MediaParticipant>();
  participantsMap.set(config.userId, {
    id: config.userId,
    name: config.userName,
    isHost: config.isHost,
    isSelf: true,
    audioMuted,
    videoOn,
    isSharing,
  });

  let uitoolkitInstance: any = null;

  try {
    const toolkitModule = await import("@zoom/videosdk-ui-toolkit");
    uitoolkitInstance = toolkitModule.default || toolkitModule;

    uitoolkitInstance.onSessionJoined?.(() => {
      status = "connected";
      emit("status-change", status);
    });

    uitoolkitInstance.onSessionClosed?.(() => {
      status = "disconnected";
      emit("status-change", status);
    });

    uitoolkitInstance.on?.("connection-change", (payload: any) => {
      const state = payload?.state;
      if (state === "Connected") {
        status = "connected";
      } else if (state === "Reconnecting") {
        status = "reconnecting";
      } else if (state === "Closed" || state === "Fail") {
        status = "disconnected";
      }
      emit("status-change", status);
    });

    uitoolkitInstance.on?.("user-added", (payload: any) => {
      const users = Array.isArray(payload) ? payload : [payload];
      for (const u of users) {
        if (!u) continue;
        const id = String(u.userId || u.user_identity || u.id);
        const name = u.displayName || u.userName || id;
        participantsMap.set(id, {
          id,
          name,
          isHost: Boolean(u.isHost || u.roleType === 1),
          isSelf: id === config.userId,
          audioMuted: Boolean(u.muted || !u.bAudioOn),
          videoOn: Boolean(u.bVideoOn),
          isSharing: Boolean(u.bShareOn),
        });
      }
      emit("participants-change", Array.from(participantsMap.values()));
    });

    uitoolkitInstance.on?.("user-removed", (payload: any) => {
      const users = Array.isArray(payload) ? payload : [payload];
      for (const u of users) {
        if (!u) continue;
        const id = String(u.userId || u.user_identity || u.id);
        participantsMap.delete(id);
      }
      emit("participants-change", Array.from(participantsMap.values()));
    });

    uitoolkitInstance.on?.("user-updated", (payload: any) => {
      const users = Array.isArray(payload) ? payload : [payload];
      for (const u of users) {
        if (!u) continue;
        const id = String(u.userId || u.user_identity || u.id);
        const existing = participantsMap.get(id);
        if (existing) {
          if (u.bAudioOn !== undefined) existing.audioMuted = !u.bAudioOn;
          if (u.bVideoOn !== undefined) existing.videoOn = Boolean(u.bVideoOn);
          if (u.bShareOn !== undefined) existing.isSharing = Boolean(u.bShareOn);
          if (u.displayName) existing.name = u.displayName;
        }
      }
      emit("participants-change", Array.from(participantsMap.values()));
    });

    uitoolkitInstance.on?.("active-speaker", (payload: any) => {
      const speakerId = payload?.userId ? String(payload.userId) : null;
      activeSpeakerId = speakerId;
      emit("active-speaker-change", speakerId);
    });

    await uitoolkitInstance.joinSession(container, {
      videoSDKJWT: config.token,
      sessionName: config.topic,
      userName: config.userName,
      featuresOptions: {
        video: { enable: true },
        audio: { enable: true },
        share: { enable: true },
        chat: { enable: false },
        users: { enable: true },
        settings: { enable: true },
        leave: { enable: false },
      },
    });

    status = "connected";
    emit("status-change", status);
  } catch (err: any) {
    status = "error";
    error = err?.message || "Không thể khởi tạo Zoom Video SDK";
    emit("status-change", status);
    emit("error", error);
  }

  const handle: MediaSessionHandle = {
    provider: "zoom",
    getStatus: () => status,
    getError: () => error,
    getParticipants: () => Array.from(participantsMap.values()),
    getActiveSpeakerId: () => activeSpeakerId,
    isAudioMuted: () => audioMuted,
    isVideoOn: () => videoOn,
    isScreenSharing: () => isSharing,
    getDevicePermissions: () => ({ ...permissions }),

    async toggleAudio(muted?: boolean) {
      audioMuted = muted !== undefined ? muted : !audioMuted;
      const self = participantsMap.get(config.userId);
      if (self) self.audioMuted = audioMuted;
      emit("participants-change", Array.from(participantsMap.values()));
      return !audioMuted;
    },

    async toggleVideo(on?: boolean) {
      videoOn = on !== undefined ? on : !videoOn;
      const self = participantsMap.get(config.userId);
      if (self) self.videoOn = videoOn;
      emit("participants-change", Array.from(participantsMap.values()));
      return videoOn;
    },

    async toggleShare(sharing?: boolean) {
      isSharing = sharing !== undefined ? sharing : !isSharing;
      const self = participantsMap.get(config.userId);
      if (self) self.isSharing = isSharing;
      emit("participants-change", Array.from(participantsMap.values()));
      return isSharing;
    },

    async requestDevicePermission(kind: "audio" | "video" | "screen") {
      permissions[kind] = "granted";
      emit("permissions-change", { ...permissions });
      return true;
    },

    async leave() {
      try {
        if (uitoolkitInstance) {
          await uitoolkitInstance.leaveSession?.();
          await uitoolkitInstance.closeSession?.(container);
        }
      } catch (e) {
        console.warn("[ZoomAdapter] Error during leave:", e);
      } finally {
        status = "disconnected";
        emit("status-change", status);
      }
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

  return handle;
}
