import { io, type Socket } from "socket.io-client";
import { uid, loginTeacher, apiRequest, type TeacherAuth } from "./helpers.js";
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
  inviteToken: string;
  token?: string;
  socket?: Socket;
};

export type ThreeContextRoom = {
  teacher: TeacherAuth;
  student1: StudentContext;
  student2: StudentContext;
  sessionId: string;
  cleanup: () => Promise<void>;
};

/**
 * Creates 3 independent actor contexts against dedicated test DB:
 * - Context 1: Teacher (authenticated with access token)
 * - Context 2: Student 1 (active participant with invite token)
 * - Context 3: Student 2 / Guest (second participant for isolation/peer checks)
 */
export async function createThreeContextRoom(
  prefix = "g2",
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
  const sessionRes = await apiRequest<{ session: { id: string } }>(
    "/api/v1/sessions",
    {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem-ses") },
      body: {
        studentIds: [student1Id, student2Id],
        title: `Phòng học đa ngữ cảnh ${prefix}`,
        goal: "G2 Integration",
        sharedGoal: "G2 Shared",
        date: "2026-11-05",
        time: "19:00",
        duration: 60,
        tools: { board: true, upload: true, check: true, chat: true },
      },
    },
  );
  const sessionId = sessionRes.data.session.id;

  const sockets: Socket[] = [];

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
      inviteToken: uid("invite-s1"),
    },
    student2: {
      studentId: student2Id,
      name: `Học sinh 2 ${prefix}`,
      inviteToken: uid("invite-s2"),
    },
    sessionId,
    cleanup,
  };
}

/**
 * Connects a Socket.IO client using standard socket.io-client.
 */
export function connectClassroomSocket(
  baseUrl: string,
  auth: {
    role: "teacher" | "student";
    token: string;
    sessionId?: string;
    studentId?: string;
  },
): Socket {
  const socket = io(baseUrl, {
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
