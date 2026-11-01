export type MediaProviderType = "zoom" | "mock" | "none";

export type MediaSessionStatus =
  | "idle"
  | "joining"
  | "connected"
  | "reconnecting"
  | "error"
  | "disconnected";

export type DevicePermissionState = "prompt" | "granted" | "denied";

export interface MediaDevicePermissions {
  audio: DevicePermissionState;
  video: DevicePermissionState;
  screen: DevicePermissionState;
}

export interface MediaParticipant {
  id: string;
  name: string;
  isHost: boolean;
  isSelf: boolean;
  audioMuted: boolean;
  videoOn: boolean;
  isSharing: boolean;
  isSpeaking?: boolean;
}

export interface MediaSessionConfig {
  provider: MediaProviderType;
  token: string;
  topic: string;
  sessionName: string;
  userName: string;
  userId: string;
  isHost: boolean;
  roleType?: number;
  signal?: AbortSignal;
}

export interface MediaSessionHandle {
  provider: MediaProviderType;
  getStatus(): MediaSessionStatus;
  getError(): string | null;
  getParticipants(): MediaParticipant[];
  getActiveSpeakerId(): string | null;
  isAudioMuted(): boolean;
  isVideoOn(): boolean;
  isScreenSharing(): boolean;
  getDevicePermissions(): MediaDevicePermissions;

  toggleAudio(muted?: boolean): Promise<boolean>;
  toggleVideo(on?: boolean): Promise<boolean>;
  toggleShare(sharing?: boolean): Promise<boolean>;
  requestDevicePermission(kind: "audio" | "video" | "screen"): Promise<boolean>;
  leave(): Promise<void>;
  destroy(): Promise<void>;

  on(event: string, cb: (...args: any[]) => void): void;
  off(event: string, cb: (...args: any[]) => void): void;
}

export interface VideoTokenResponse {
  provider: "zoom" | "mock";
  token: string;
  topic: string;
  sessionName: string;
  userName: string;
  isHost: boolean;
  roleType?: number;
}
