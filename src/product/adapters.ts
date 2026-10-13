import { useState, useSyncExternalStore } from "react";
import type { AppData, Recording, SessionEvent } from "./model";
import { uid } from "./model";

export type TeacherAccount = {
  name: string;
  email: string;
  provider: "google-demo";
};
export interface AuthAdapter {
  signIn(): Promise<TeacherAccount>;
  signOut(): void;
}
export interface CallAdapter {
  connect(sessionId: string): Promise<void>;
  disconnect(): void;
}
export interface RecordingAdapter {
  start(sessionId: string): Recording;
  stop(recording: Recording): Recording;
}
export interface CollaborationAdapter {
  channel: string;
  supportsCrossDevice: boolean;
}
const authKey = "copilot-teacher-demo";
const parseAccount = () => {
  try {
    return JSON.parse(
      localStorage.getItem(authKey) || "null",
    ) as TeacherAccount | null;
  } catch {
    return null;
  }
};
let account = parseAccount();
const authListeners = new Set<() => void>();
const authNotify = () => authListeners.forEach((fn) => fn());
window.addEventListener("storage", (e) => {
  if (e.key === authKey) {
    account = parseAccount();
    authNotify();
  }
});
export const mockAuth: AuthAdapter = {
  async signIn() {
    await new Promise((resolve) => setTimeout(resolve, 450));
    account = {
      name: "Hoàng Nam",
      email: "nam.giasu@example.com",
      provider: "google-demo",
    };
    localStorage.setItem(authKey, JSON.stringify(account));
    authNotify();
    return account;
  },
  signOut() {
    localStorage.removeItem(authKey);
    account = null;
    authNotify();
  },
};
export const useTeacherAccount = () =>
  useSyncExternalStore(
    (fn) => {
      authListeners.add(fn);
      return () => {
        authListeners.delete(fn);
      };
    },
    () => account,
  );
export const mockCall: CallAdapter = {
  async connect() {
    await new Promise((resolve) => setTimeout(resolve, 400));
  },
  disconnect() {},
};
export const mockRecording: RecordingAdapter = {
  start(sessionId) {
    return {
      id: uid("rec"),
      sessionId,
      status: "recording",
      startedAt: new Date().toISOString(),
    };
  },
  stop(recording) {
    return {
      ...recording,
      status: "processing",
      endedAt: new Date().toISOString(),
      readyAt: new Date(Date.now() + 1800).toISOString(),
    };
  },
};
export const mockCollaboration: CollaborationAdapter = {
  channel: "teaching-copilot-v2",
  supportsCrossDevice: false,
};
export function useCall(sessionId: string) {
  const [state, setState] = useState<
    "idle" | "connecting" | "connected" | "disconnected"
  >("idle");
  const [mic, setMic] = useState(true);
  const [camera, setCamera] = useState(false);
  return {
    state,
    mic,
    camera,
    setMic,
    setCamera,
    async connect() {
      setState("connecting");
      await mockCall.connect(sessionId);
      setState("connected");
    },
    disconnect() {
      mockCall.disconnect();
      setState("disconnected");
    },
  };
}
export function appendEvent(
  data: AppData,
  event: Omit<SessionEvent, "id" | "createdAt">,
): AppData {
  if (event.kind === "board" && event.sourceId) {
    const last = data.events.at(-1);
    const active = data.recordings.find(
      (r) => r.sessionId === event.sessionId && r.status === "recording",
    );
    if (
      last?.kind === "board" &&
      last.sourceId === event.sourceId &&
      Date.now() - new Date(last.createdAt).getTime() < 800 &&
      (!active || new Date(last.createdAt) >= new Date(active.startedAt))
    ) {
      return {
        ...data,
        events: [...data.events.slice(0, -1), { ...last, ...event }],
      };
    }
  }
  return {
    ...data,
    events: [
      ...data.events,
      { ...event, id: uid("event"), createdAt: new Date().toISOString() },
    ],
  };
}
export async function mockSuggestion(
  data: AppData,
  studentId: string,
  activityId: string,
  prompt: string,
  fail: boolean,
) {
  await new Promise((resolve) => setTimeout(resolve, 650));
  if (fail)
    throw new Error(
      "Copilot chưa phản hồi. Bạn vẫn có thể ghi chú và tiếp tục dạy.",
    );
  const activity = data.sessions
    .flatMap((s) => s.activities)
    .find((a) => a.id === activityId);
  const approved = data.claims.filter(
    (c) => c.studentId === studentId && c.status === "approved",
  );
  const context =
    approved[0]?.text ||
    "Chưa có lịch sử đã duyệt; cần quan sát thêm trong hoạt động hiện tại.";
  const text = prompt.includes("Kiểm tra")
    ? "Cho x² − 4x + 3 = 0. Hãy tính tổng bình phương hai nghiệm và giải thích từng bước, không dùng gợi ý."
    : prompt.includes("độ khó")
      ? "Giảm số liệu về x² − 5x + 6 = 0. Cho học sinh tự xác định điều kiện nghiệm, sau đó mới tăng độ khó bằng tham số m."
      : prompt.includes("tương tự")
        ? "Đổi dữ kiện thành x² − 7x + 10 = 0. Yêu cầu tìm tổng, tích nghiệm và kiểm tra kết quả bằng cách thay nghiệm."
        : prompt.includes("Giải thích")
          ? "Dùng hai số có tổng 5 và tích 6 để minh họa Viète. Cho học sinh đối chiếu với hệ số của phương trình trước khi tổng quát hóa."
          : `Với “${activity?.title || "bài hiện tại"}”, hỏi: “Em đã kiểm tra điều kiện nào trước khi dùng công thức?” Chờ học sinh tự trình bày bước tiếp theo. Yêu cầu của gia sư: ${prompt}`;
  return { text, context };
}
