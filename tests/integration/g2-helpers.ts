import { io, type Socket } from "socket.io-client";
import { uid, loginTeacher, apiRequest, type TeacherAuth, QA_BASE_URL } from "./helpers.js";
import {
  StudentRoomViewModel,
  type StudentRoomViewModel as StudentRoomVMType,
} from "../../contracts/ui.js";
import {
  RealtimeEnvelope,
  type RealtimeEnvelope as RealtimeEnvelopeType,
} from "../../contracts/events.js";

// =========================================================================
// G2 Test Harness: 3 Independent Contexts (Teacher, Student 1, Student 2 / Guest)
// =========================================================================

export type StudentContext = {
  studentId: string;
  name: string;
  inviteId: string;
  rawToken: string;
  accessToken: string;
  refreshToken: string;
  memberId: string;
};

export type ThreeContextRoom = {
  teacher: TeacherAuth;
  student1: StudentContext;
  student2: StudentContext;
  sessionId: string;
  activityId: string;
  sockets: Socket[];
  connectSocket: (token: string, sessionId: string) => Promise<Socket>;
  cleanup: () => Promise<void>;
};

export type CreateRoomOptions = {
  admitStudents?: boolean;
  startSession?: boolean;
};

/**
 * Creates 3 independent actor contexts against dedicated test DB:
 * - Context 1: Teacher (authenticated with access token)
 * - Context 2: Student 1 (active participant with invite token, admitted & live)
 * - Context 3: Student 2 / Guest (second participant for isolation/peer checks)
 */
export async function createThreeContextRoom(
  prefix = "g2",
  options: CreateRoomOptions = { admitStudents: true, startSession: true },
): Promise<ThreeContextRoom> {
  const teacher = await loginTeacher("teacher-a");

  // Create Student 1
  const s1Res = await apiRequest<{ student: { id: string } }>(
    "/api/v1/students",
    {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem-s1") },
      body: {
        name: `Học sinh 1 ${prefix}`,
        grade: "Lớp 9",
        subject: "Toán",
        goal: "G2 Context 1",
        strengths: ["Đại số"],
        gaps: [],
        notes: "",
        status: "active",
        initials: "HS1",
        color: "blue",
      },
    },
  );
  const student1Id = s1Res.data.student.id;

  // Create Student 2
  const s2Res = await apiRequest<{ student: { id: string } }>(
    "/api/v1/students",
    {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem-s2") },
      body: {
        name: `Học sinh 2 ${prefix}`,
        grade: "Lớp 9",
        subject: "Toán",
        goal: "G2 Context 2",
        strengths: ["Hình học"],
        gaps: [],
        notes: "",
        status: "active",
        initials: "HS2",
        color: "green",
      },
    },
  );
  const student2Id = s2Res.data.student.id;

  // Create Session with both students
  const sessionRes = await apiRequest<{ session: { id: string; version: number } }>(
    "/api/v1/sessions",
    {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem-ses") },
      body: {
        studentIds: [student1Id, student2Id],
        title: `Phòng học đa ngữ cảnh ${prefix}`,
        goal: "G2 Integration",
        sharedGoal: "G2 Shared Public Goal",
        date: "2026-11-05",
        time: "19:00",
        duration: 60,
        tools: { board: true, upload: true, check: true, chat: true },
      },
    },
  );
  const sessionId = sessionRes.data.session.id;
  const sessionVersion = sessionRes.data.session.version;

  // Add initial activity so currentActivityId is available
  const actRes = await apiRequest<{ session: { currentActivityId: string; activities: Array<{ id: string }> } }>(
    `/api/v1/sessions/${sessionId}/activities`,
    {
      method: "PUT",
      token: teacher.token,
      headers: { "If-Match-Version": String(sessionVersion) },
      body: [
        {
          title: "Hoạt động thực hành",
          description: "Khởi động và làm bài",
          duration: 15,
          type: "LuyenTap",
          materialId: null,
          materialVersion: null,
          teacherNotes: null,
          sourceEvidenceIds: [],
          sourceClaimRefs: [],
        },
      ],
    },
  );
  const rawSession = actRes.data?.session as Record<string, any>;
  const activityId =
    rawSession?.Activity_sessionId_items?.[0]?.id ||
    rawSession?.currentActivityId ||
    rawSession?.activities?.[0]?.id;

  // Create Invite for Student 1
  const inv1Res = await apiRequest<{ invite: { id: string }; rawToken: string }>(
    `/api/v1/sessions/${sessionId}/invites`,
    {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem-inv1") },
      body: { studentId: student1Id },
    },
  );
  const invite1Id = inv1Res.data.invite.id;
  const rawToken1 = inv1Res.data.rawToken;

  // Create Invite for Student 2
  const inv2Res = await apiRequest<{ invite: { id: string }; rawToken: string }>(
    `/api/v1/sessions/${sessionId}/invites`,
    {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem-inv2") },
      body: { studentId: student2Id },
    },
  );
  const invite2Id = inv2Res.data.invite.id;
  const rawToken2 = inv2Res.data.rawToken;

  // Student 1 Join Request
  const join1Res = await apiRequest<{
    accessToken: string;
    refreshToken: string;
    memberId: string;
    studentId: string;
  }>("/api/v1/room/join-request", {
    method: "POST",
    headers: { "Idempotency-Key": uid("idem-join1") },
    body: {
      token: rawToken1,
      name: `Học sinh 1 ${prefix}`,
      consent: true,
    },
  });

  // Student 2 Join Request
  const join2Res = await apiRequest<{
    accessToken: string;
    refreshToken: string;
    memberId: string;
    studentId: string;
  }>("/api/v1/room/join-request", {
    method: "POST",
    headers: { "Idempotency-Key": uid("idem-join2") },
    body: {
      token: rawToken2,
      name: `Học sinh 2 ${prefix}`,
      consent: true,
    },
  });

  // Admit students if requested
  if (options.admitStudents !== false) {
    await apiRequest(
      `/api/v1/sessions/${sessionId}/members/${join1Res.data.memberId}/admit`,
      {
        method: "POST",
        token: teacher.token,
        body: { approved: true },
      },
    );
    await apiRequest(
      `/api/v1/sessions/${sessionId}/members/${join2Res.data.memberId}/admit`,
      {
        method: "POST",
        token: teacher.token,
        body: { approved: true },
      },
    );
  }

  // Start session if requested
  if (options.startSession !== false) {
    await apiRequest(`/api/v1/sessions/${sessionId}/start`, {
      method: "POST",
      token: teacher.token,
      body: {},
    });
  }

  const sockets: Socket[] = [];

  const connectSocket = async (token: string, sid = sessionId): Promise<Socket> => {
    const s = connectClassroomSocket(QA_BASE_URL, { token, sessionId: sid });
    sockets.push(s);
    s.connect();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Socket connect timeout")), 5000);
      s.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      s.once("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    return s;
  };

  const cleanup = async () => {
    for (const s of sockets) {
      if (s.connected) s.disconnect();
    }
  };

  return {
    teacher,
    student1: {
      studentId: student1Id,
      name: `Học sinh 1 ${prefix}`,
      inviteId: invite1Id,
      rawToken: rawToken1,
      accessToken: join1Res.data.accessToken,
      refreshToken: join1Res.data.refreshToken,
      memberId: join1Res.data.memberId,
    },
    student2: {
      studentId: student2Id,
      name: `Học sinh 2 ${prefix}`,
      inviteId: invite2Id,
      rawToken: rawToken2,
      accessToken: join2Res.data.accessToken,
      refreshToken: join2Res.data.refreshToken,
      memberId: join2Res.data.memberId,
    },
    sessionId,
    activityId,
    sockets,
    connectSocket,
    cleanup,
  };
}

/**
 * Connects a Socket.IO client to /classroom using standard socket.io-client.
 */
export function connectClassroomSocket(
  baseUrl: string,
  auth: {
    token: string;
    sessionId?: string;
  },
): Socket {
  const socket = io(`${baseUrl.replace(/\/$/, "")}/classroom`, {
    autoConnect: false,
    reconnection: false,
    transports: ["websocket"],
    auth,
  });
  return socket;
}

/**
 * Validates that an object conforms strictly to StudentRoomViewModel
 * and verifies that teacher-private fields are absent.
 */
export function assertValidStudentRoomProjection(vm: unknown): StudentRoomVMType {
  const parsed = StudentRoomViewModel.safeParse(vm);
  if (!parsed.success) {
    throw new Error(
      `StudentRoomViewModel schema violation: ${parsed.error.message}`,
    );
  }

  // Strict negative checks: teacher-private fields must not exist
  const raw = vm as Record<string, unknown>;
  if ("claims" in raw) throw new Error("Security leak: claims present in StudentRoomViewModel");
  if ("auditLogs" in raw) throw new Error("Security leak: auditLogs present in StudentRoomViewModel");
  if ("teacherNotes" in raw) throw new Error("Security leak: teacherNotes present in StudentRoomViewModel");
  if ("aiSuggestions" in raw) throw new Error("Security leak: aiSuggestions present in StudentRoomViewModel");

  return parsed.data;
}

/**
 * Validates that an envelope adheres to the monotonic RealtimeEnvelope schema.
 */
export function assertValidRealtimeEnvelope(envelope: unknown): RealtimeEnvelopeType {
  const parsed = RealtimeEnvelope.safeParse(envelope);
  if (!parsed.success) {
    throw new Error(
      `RealtimeEnvelope schema violation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
