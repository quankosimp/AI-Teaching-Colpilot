import { z } from "zod";
import {
  Id,
  SessionStatus,
  Stroke,
  SupportLevel,
  Tools,
  Timestamp,
} from "./domain.js";
import { ErrorCode } from "./errors.js";

export const StudentActivity = z.strictObject({
  id: Id,
  title: z.string(),
  description: z.string(),
  duration: z.number().int().positive(),
  order: z.number().int().nonnegative(),
  type: z.enum(["KhoiDong", "LyThuyet", "LuyenTap", "KiemTra"]),
});
export const StudentMember = z.strictObject({
  id: Id,
  displayName: z.string(),
  initials: z.string(),
  color: z.string(),
  handRaised: z.boolean(),
});
export const StudentBoard = z.strictObject({
  id: Id,
  ownerId: Id,
  shared: z.boolean(),
  revision: z.number().int().positive(),
  strokes: z.array(Stroke),
  text: z.string(),
});
export const StudentAttempt = z.strictObject({
  id: Id,
  activityId: Id,
  strokes: z.array(Stroke),
  text: z.string(),
  createdAt: Timestamp,
});
export const StudentSubmission = z.strictObject({
  id: Id,
  activityId: Id.nullable(),
  title: z.string(),
  answer: z.string(),
  status: z.enum(["new", "draft", "reviewed"]),
  fileName: z.string().nullable().optional(),
  readUrl: z.url().nullable().optional(),
  support: SupportLevel.nullable().optional(),
  finalFeedback: z.string().nullable().optional(),
  score: z.string().nullable().optional(),
  createdAt: Timestamp,
});
export const StudentRoomViewModel = z.strictObject({
  session: z.strictObject({
    id: Id,
    title: z.string(),
    sharedGoal: z.string(),
    status: SessionStatus,
    currentActivityId: Id.nullable(),
    sharedView: z.enum(["document", "board", "check"]),
    sharedBoardOwnerId: Id,
    materialPage: z.number().int().nonnegative(),
    tools: Tools,
  }),
  capabilities: z.strictObject({ boardWrite: z.boolean() }).optional(),
  activities: z.array(StudentActivity),
  currentMaterial: z
    .strictObject({
      id: Id,
      title: z.string(),
      version: z.number().int().positive(),
      readUrl: z.url(),
      page: z.number().int().nonnegative(),
    })
    .nullable(),
  commonBoard: StudentBoard.nullable(),
  sharedBoard: StudentBoard.nullable(),
  ownBoard: StudentBoard.nullable(),
  ownAttempts: z.array(StudentAttempt),
  ownSubmissions: z.array(StudentSubmission),
  activeQuickCheck: z
    .strictObject({ id: Id, activityId: Id, question: z.string() })
    .nullable(),
  ownCheckResponse: z.strictObject({ id: Id, answer: z.string() }).nullable(),
  roomMessages: z.array(
    z.strictObject({
      id: Id,
      authorId: Id,
      text: z.string(),
      createdAt: Timestamp,
    }),
  ),
  members: z.array(StudentMember),
  lastEventSeq: z.number().int().nonnegative(),
});
export type StudentRoomViewModel = z.infer<typeof StudentRoomViewModel>;
export const TeacherWorkspaceViewModel = z.strictObject({
  teacher: z.strictObject({
    id: Id,
    name: z.string(),
    email: z.email(),
    workspaceId: Id,
  }),
  featureFlags: z.record(z.string(), z.boolean()),
  session: z
    .strictObject({
      id: Id,
      title: z.string(),
      status: SessionStatus,
      goal: z.string(),
      sharedGoal: z.string(),
      version: z.number().int().positive(),
    })
    .nullable(),
  activities: z.array(
    z.strictObject({
      id: Id,
      title: z.string(),
      description: z.string(),
      teacherNotes: z.string().nullable(),
      sourceEvidenceIds: z.array(Id),
      sourceClaimRefs: z.array(
        z.strictObject({ claimId: Id, revision: z.number().int().positive() }),
      ),
      isSourceStale: z.boolean(),
    }),
  ),
});
export type TeacherWorkspaceViewModel = z.infer<
  typeof TeacherWorkspaceViewModel
>;
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: z.infer<typeof ErrorCode>;
      message: string;
      requestId: string;
    };
export interface WorkspaceActions {
  selectSession(id: string): Promise<ActionResult>;
  saveSession(input: unknown): Promise<ActionResult>;
}
export interface ClassroomActions {
  start(): Promise<ActionResult>;
  end(): Promise<ActionResult>;
  selectActivity(id: string): Promise<ActionResult>;
  retry(): Promise<ActionResult>;
}

// Projection is constructed server-side; validate ownership before sending it to a student.
export function validateStudentRoomProjection(
  input: unknown,
  studentId: string,
) {
  const result = StudentRoomViewModel.safeParse(input);
  if (!result.success) return result;
  const view = result.data;
  if (
    (view.commonBoard && view.commonBoard.ownerId !== "common") ||
    (view.ownBoard && view.ownBoard.ownerId !== studentId) ||
    (view.sharedBoard &&
      (view.sharedBoard.ownerId !== view.session.sharedBoardOwnerId ||
        (view.sharedBoard.ownerId !== "common" && !view.sharedBoard.shared)))
  ) {
    return {
      success: false as const,
      error: "Board projection is not visible to this student",
    };
  }
  return result;
}
