import "@zoom/videosdk-ui-toolkit/dist/videosdk-ui-toolkit.css";
import type { UIToolkit } from "@zoom/videosdk-ui-toolkit";
import type { MediaParticipant, MediaSessionConfig, MediaSessionHandle, MediaSessionStatus } from "./types";

type Toolkit = Pick<UIToolkit, "joinSession" | "leaveSession" | "destroy" | "onSessionJoined" | "offSessionJoined" | "onSessionClosed" | "offSessionClosed" | "on" | "off" | "getAllUser" | "getCurrentUserInfo">;
type Participant = ReturnType<Toolkit["getAllUser"]>[number];

export async function createZoomSession(
  container: HTMLElement,
  config: MediaSessionConfig,
  injectedToolkit?: Toolkit | { default: Toolkit },
): Promise<MediaSessionHandle> {
  config.signal?.throwIfAborted();
  const imported = injectedToolkit || await import("@zoom/videosdk-ui-toolkit");
  const toolkit: Toolkit = "default" in imported ? imported.default : imported;
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  let status: MediaSessionStatus = "joining";
  let error: string | null = null;
  let participants: MediaParticipant[] = [];
  let self: Participant | null = null;
  let speaker: string | null = null;
  let disposal: Promise<void> | null = null;
  let initialized = false;
  let registered = false;
  const emit = (event: string, ...args: any[]) => listeners.get(event)?.forEach((callback) => callback(...args));
  const sync = () => {
    if (disposal) return;
    self = toolkit.getCurrentUserInfo();
    participants = toolkit.getAllUser().map((user) => ({
      id: String(user.userId), name: user.displayName,
      isSelf: user.userId === self?.userId, isHost: user.isHost,
      audioMuted: !user.audio || user.muted !== false,
      videoOn: user.bVideoOn === true, isSharing: user.sharerOn === true,
      isSpeaking: String(user.userId) === speaker,
    }));
    emit("participants-change", participants);
  };
  const changeStatus = (next: MediaSessionStatus) => {
    if (disposal) return;
    status = next;
    if (next === "connected") sync();
    emit("status-change", status);
  };
  const joined = () => changeStatus("connected");
  const closed = () => changeStatus("disconnected");
  const connection = (payload: { state?: string }) => {
    if (payload?.state === "Connected") joined();
    else if (payload?.state === "Reconnecting") changeStatus("reconnecting");
    else if (payload?.state === "Closed") closed();
    else if (payload?.state === "Fail") {
      error = "Không thể kết nối video. Kiểm tra mạng và quyền thiết bị rồi thử lại.";
      changeStatus("error"); emit("error", error);
    }
  };
  const activeSpeaker = (payload: { userId?: number } | { userId?: number }[]) => {
    const user = Array.isArray(payload) ? payload[0] : payload;
    speaker = user?.userId == null ? null : String(user.userId);
    sync(); emit("active-speaker-change", speaker);
  };
  const subscriptions = [
    ["connection-change", connection], ["user-added", sync], ["user-updated", sync],
    ["user-removed", sync], ["active-speaker", activeSpeaker],
  ] as const;
  const dispose = (): Promise<void> => {
    if (disposal) return disposal;
    disposal = (async () => {
      config.signal?.removeEventListener("abort", aborted);
      if (registered) {
        const unsubscribe = [() => toolkit.offSessionJoined(joined), () => toolkit.offSessionClosed(closed),
          ...subscriptions.map(([name, callback]) => () => toolkit.off(name, callback))];
        for (const remove of unsubscribe) { try { remove(); } catch { /* Toolkit may already be destroyed by a native event. */ } }
      }
      try {
        if (initialized) {
          // closeSession ends the call for every participant; navigation/retry only leaves locally.
          try { await toolkit.leaveSession(); }
          finally { await toolkit.destroy(); }
        }
      }
      finally {
        container.replaceChildren(); participants = []; self = null; speaker = null;
        status = "disconnected"; emit("status-change", status); listeners.clear();
      }
    })();
    return disposal;
  };
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const aborted = () => {
    void dispose().catch(() => {});
    rejectAbort?.(new DOMException("Media connection cancelled", "AbortError"));
  };
  const abortPromise = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  config.signal?.addEventListener("abort", aborted, { once: true });
  try {
    config.signal?.throwIfAborted();
    const joining = toolkit.joinSession(container, {
      videoSDKJWT: config.token, sessionName: config.topic, userName: config.userName,
      featuresOptions: {
        preview: { enable: true }, video: { enable: true }, audio: { enable: true },
        share: { enable: true }, footer: { enable: true }, settings: { enable: true },
        users: { enable: true }, chat: { enable: false, enableEmoji: false }, leave: { enable: false },
      },
    });
    initialized = true;
    toolkit.onSessionJoined(joined); toolkit.onSessionClosed(closed);
    subscriptions.forEach(([name, callback]) => toolkit.on(name, callback));
    registered = true;
    await Promise.race([joining, abortPromise]);
    config.signal?.throwIfAborted();
    // Opening the preview is not proof of joining. Only SDK events set connected.
  } catch (failure) {
    await dispose().catch(() => {});
    if (config.signal?.aborted) throw failure;
    throw new Error("Không thể khởi tạo video. Có thể thử lại và tiếp tục học bằng học liệu.");
  }
  const nativeControls = async (): Promise<never> => {
    throw new Error("Dùng các nút mic, camera và chia sẻ trong thanh điều khiển Zoom.");
  };
  return {
    provider: "zoom", getStatus: () => status, getError: () => error,
    getParticipants: () => [...participants], getActiveSpeakerId: () => speaker,
    isAudioMuted: () => !self?.audio || self.muted !== false,
    isVideoOn: () => self?.bVideoOn === true,
    isScreenSharing: () => self?.sharerOn === true,
    getDevicePermissions: () => ({ audio: "prompt", video: "prompt", screen: "prompt" }),
    // The supported Toolkit toolbar owns real device operations and permission UI.
    // Never mirror its controls with guessed SDK fields or synthetic successes.
    toggleAudio: nativeControls, toggleVideo: nativeControls, toggleShare: nativeControls,
    requestDevicePermission: nativeControls, leave: dispose, destroy: dispose,
    on: (event, callback) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(callback);
    },
    off: (event, callback) => { listeners.get(event)?.delete(callback); },
  };
}
