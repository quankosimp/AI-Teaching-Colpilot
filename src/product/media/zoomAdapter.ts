import "@zoom/videosdk-ui-toolkit/dist/videosdk-ui-toolkit.css";
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
  toolkitModuleOverride?: any,
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

  const syncFromSdk = () => {
    try {
      const client = uitoolkitInstance?.getClient?.();
      const current =
        uitoolkitInstance?.getCurrentUserInfo?.() ||
        client?.getCurrentUserInfo?.();
      const all =
        uitoolkitInstance?.getAllUser?.() || client?.getAllUser?.() || [];

      if (current) {
        audioMuted = Boolean(current.muted || !current.bAudioOn);
        videoOn = Boolean(current.bVideoOn);
        isSharing = Boolean(current.bShareOn);
      }

      participantsMap.clear();
      for (const u of all) {
        const id = String(u.userId);
        const isSelf = current
          ? u.userId === current.userId
          : id === config.userId;
        participantsMap.set(id, {
          id,
          name: u.displayName || (isSelf ? config.userName : `User ${id}`),
          isHost: Boolean(u.isHost || u.roleType === 1),
          isSelf,
          audioMuted: Boolean(u.muted || !u.bAudioOn),
          videoOn: Boolean(u.bVideoOn),
          isSharing: Boolean(u.bShareOn),
          isSpeaking: activeSpeakerId === id,
        });
      }
      if (!participantsMap.has(config.userId) && !current) {
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
      }
      emit("participants-change", Array.from(participantsMap.values()));
    } catch (e) {
      console.warn("[ZoomAdapter] syncFromSdk warning:", e);
    }
  };

  const onSessionJoined = () => {
    status = "connected";
    syncFromSdk();
    emit("status-change", status);
  };

  const onSessionClosed = () => {
    status = "disconnected";
    emit("status-change", status);
  };

  const onConnectionChange = (payload: any) => {
    const state = payload?.state;
    if (state === "Connected") {
      status = "connected";
      syncFromSdk();
    } else if (state === "Reconnecting") {
      status = "reconnecting";
    } else if (state === "Closed" || state === "Fail") {
      status = "disconnected";
    }
    emit("status-change", status);
  };

  const onUserEvent = () => {
    syncFromSdk();
  };

  const onActiveSpeaker = (payload: any) => {
    let speakerId: string | null = null;
    if (Array.isArray(payload) && payload.length > 0) {
      speakerId = payload[0]?.userId != null ? String(payload[0].userId) : null;
    } else if (payload?.userId != null) {
      speakerId = String(payload.userId);
    }
    activeSpeakerId = speakerId;
    syncFromSdk();
    emit("active-speaker-change", speakerId);
  };

  try {
    const toolkitModule =
      toolkitModuleOverride || (await import("@zoom/videosdk-ui-toolkit"));
    uitoolkitInstance = toolkitModule.default || toolkitModule;

    const joinPromise = uitoolkitInstance.joinSession(container, {
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

    try {
      uitoolkitInstance.onSessionJoined?.(onSessionJoined);
      uitoolkitInstance.onSessionClosed?.(onSessionClosed);
      uitoolkitInstance.on?.("connection-change", onConnectionChange);
      uitoolkitInstance.on?.("user-added", onUserEvent);
      uitoolkitInstance.on?.("user-removed", onUserEvent);
      uitoolkitInstance.on?.("user-updated", onUserEvent);
      uitoolkitInstance.on?.("active-speaker", onActiveSpeaker);
    } catch (regErr) {
      console.warn("[ZoomAdapter] Listener registration notice:", regErr);
    }

    await joinPromise;

    status = "connected";
    syncFromSdk();
    emit("status-change", status);
  } catch (err: any) {
    status = "error";
    error = err?.message || "Không thể khởi tạo Zoom Video SDK";
    emit("status-change", status);
    emit("error", error);
    throw err;
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
      const client = uitoolkitInstance?.getClient?.();
      const mediaStream = client?.getMediaStream?.();
      if (!mediaStream) {
        const err = new Error("Media stream không khả dụng trên client Zoom");
        emit("error", err.message);
        throw err;
      }
      const shouldMute = muted !== undefined ? muted : !audioMuted;
      try {
        if (shouldMute) {
          await mediaStream.muteAudio?.();
          audioMuted = true;
        } else {
          const current =
            uitoolkitInstance?.getCurrentUserInfo?.() ||
            client?.getCurrentUserInfo?.();
          if (current && !current.bAudioOn) {
            await mediaStream.startAudio?.();
          } else {
            await mediaStream.unmuteAudio?.();
          }
          audioMuted = false;
        }
        syncFromSdk();
        return !audioMuted;
      } catch (err: any) {
        const msg = err?.message || "Không thể điều khiển microphone";
        emit("error", msg);
        throw err;
      }
    },

    async toggleVideo(on?: boolean) {
      const client = uitoolkitInstance?.getClient?.();
      const mediaStream = client?.getMediaStream?.();
      if (!mediaStream) {
        const err = new Error("Media stream không khả dụng trên client Zoom");
        emit("error", err.message);
        throw err;
      }
      const shouldTurnOn = on !== undefined ? on : !videoOn;
      try {
        if (shouldTurnOn) {
          await mediaStream.startVideo?.();
          videoOn = true;
        } else {
          await mediaStream.stopVideo?.();
          videoOn = false;
        }
        syncFromSdk();
        return videoOn;
      } catch (err: any) {
        const msg = err?.message || "Không thể điều khiển camera";
        emit("error", msg);
        throw err;
      }
    },

    async toggleShare(sharing?: boolean) {
      const client = uitoolkitInstance?.getClient?.();
      const mediaStream = client?.getMediaStream?.();
      if (!mediaStream) {
        const err = new Error("Media stream không khả dụng trên client Zoom");
        emit("error", err.message);
        throw err;
      }
      const shouldShare = sharing !== undefined ? sharing : !isSharing;
      try {
        if (shouldShare) {
          await mediaStream.startShareScreen?.();
          isSharing = true;
        } else {
          await mediaStream.stopShareScreen?.();
          isSharing = false;
        }
        syncFromSdk();
        return isSharing;
      } catch (err: any) {
        const msg = err?.message || "Không thể chia sẻ màn hình";
        emit("error", msg);
        throw err;
      }
    },

    async requestDevicePermission(kind: "audio" | "video" | "screen") {
      if (typeof navigator === "undefined" || !navigator.mediaDevices) {
        permissions[kind] = "denied";
        emit("permissions-change", { ...permissions });
        return false;
      }
      try {
        if (kind === "audio") {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          s.getTracks().forEach((t) => t.stop());
          permissions.audio = "granted";
        } else if (kind === "video") {
          const s = await navigator.mediaDevices.getUserMedia({ video: true });
          s.getTracks().forEach((t) => t.stop());
          permissions.video = "granted";
        } else if (kind === "screen") {
          if (navigator.mediaDevices.getDisplayMedia) {
            const s = await navigator.mediaDevices.getDisplayMedia({
              video: true,
            });
            s.getTracks().forEach((t) => t.stop());
            permissions.screen = "granted";
          } else {
            permissions.screen = "granted";
          }
        }
        emit("permissions-change", { ...permissions });
        return true;
      } catch (e) {
        permissions[kind] = "denied";
        emit("permissions-change", { ...permissions });
        return false;
      }
    },

    async leave() {
      try {
        if (uitoolkitInstance) {
          uitoolkitInstance.offSessionJoined?.(onSessionJoined);
          uitoolkitInstance.offSessionClosed?.(onSessionClosed);
          uitoolkitInstance.off?.("connection-change", onConnectionChange);
          uitoolkitInstance.off?.("user-added", onUserEvent);
          uitoolkitInstance.off?.("user-removed", onUserEvent);
          uitoolkitInstance.off?.("user-updated", onUserEvent);
          uitoolkitInstance.off?.("active-speaker", onActiveSpeaker);
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
