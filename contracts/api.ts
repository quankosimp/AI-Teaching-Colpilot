import { z } from "zod";
import {
  ApprovalContext,
  ClaimRef,
  Id,
  SourceRef,
  Stroke,
  SupportLevel,
  Tools,
} from "./domain.js";

export const RequestHeaders = z.strictObject({
  requestId: Id,
  idempotencyKey: Id.optional(),
  ifMatchVersion: z.number().int().positive().optional(),
});
export const InviteSummary = z.strictObject({
  id: Id,
  studentId: Id,
  maskedHint: z.string().length(4),
  expiresAt: z.iso.datetime({ offset: true }),
  state: z.enum(["active", "expired", "revoked"]),
});
export type InviteSummary = z.infer<typeof InviteSummary>;
// This response is one-time; never persist it in logs or idempotency response caches.
export const CreateInviteResponse = z.strictObject({
  rawToken: z.string().min(32),
  inviteUrl: z.url(),
  expiresAt: z.iso.datetime({ offset: true }),
  invite: InviteSummary.optional(),
});
export const InviteCommand = z.strictObject({
  studentId: Id,
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});
export const JoinRequest = z.strictObject({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  consent: z.literal(true),
});
export const LessonMaterialRef = z.strictObject({
  materialId: z.uuid(),
  version: z.number().int().positive(),
});
export const SessionCreate = z.strictObject({
  studentIds: z
    .array(Id)
    .min(1)
    .max(5)
    .refine((ids) => new Set(ids).size === ids.length),
  title: z.string().trim().min(1),
  goal: z.string(),
  sharedGoal: z.string(),
  date: z.iso.date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duration: z.number().int().positive(),
  tools: Tools,
  status: z.enum(["draft", "scheduled"]).optional(),
  initialMaterial: LessonMaterialRef.optional(),
});
export const ActivityInput = z.strictObject({
  id: Id.optional(),
  title: z.string().trim().min(1),
  description: z.string(),
  teacherNotes: z.string().nullable().optional(),
  duration: z.number().int().positive().nullable().default(null),
  type: z.enum(["KhoiDong", "LyThuyet", "LuyenTap", "KiemTra"]),
  materialId: Id.nullable().optional(),
  materialVersion: z.number().int().positive().nullable().optional(),
  materialStartPage: z.number().int().min(0).max(9999).default(0),
  sourceEvidenceIds: z.array(Id),
  sourceClaimRefs: z.array(ClaimRef),
});
export const AnnotationInput = z
  .strictObject({
    activityId: Id,
    materialId: Id,
    materialVersion: z.number().int().positive(),
    page: z.number().int().nonnegative(),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    text: z.string().trim().min(1),
    studentId: Id.optional().nullable(),
    sharedWithClass: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.sharedWithClass && data.studentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Không thể chia sẻ toàn lớp chú thích dành riêng cho một học sinh",
        path: ["sharedWithClass"],
      });
    }
  });
export const ObservationInput = z
  .strictObject({
    studentId: Id,
    activityId: Id.nullable().optional(),
    kind: z.enum([
      "GhiChu",
      "BaiLam",
      "MucHoTro",
      "GoiYGiangDay",
      "TrangNhap",
      "KiemTraDocLap",
      "ChuThichDe",
    ]),
    title: z.string(),
    detail: z.string(),
    support: SupportLevel,
    source: SourceRef.optional(),
  })
  .refine(
    (input) =>
      !input.source ||
      (input.kind === "GoiYGiangDay") ===
        (input.source.type === "ai_suggestion"),
    { message: "AI teaching aid kind and source must match" },
  );
export const ClaimReviewCommand = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("approve"),
    revision: z.number().int().positive(),
    evidenceIds: z.array(Id).min(1),
  }),
  z.strictObject({
    action: z.literal("reject"),
    revision: z.number().int().positive(),
    reason: z.string().optional(),
  }),
  z.strictObject({
    action: z.literal("edit"),
    revision: z.number().int().positive(),
    text: z.string().trim().min(1),
    evidenceIds: z.array(Id).min(1),
  }),
]);
export { ApprovalContext };
export const CompleteReviewCommand = z.strictObject({
  reviewNote: z.string().trim().min(1).optional(),
});
export const StudentBoardCommand = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("addStroke"), stroke: Stroke }),
  z.strictObject({
    operation: z.literal("undoOwnStroke"),
    strokeId: Id.optional(),
  }),
  z.strictObject({ operation: z.literal("clearOwnStrokes") }),
  z.strictObject({
    operation: z.literal("setNote"),
    text: z.string().max(4000),
  }),
  z.strictObject({
    operation: z.literal("setShared"),
    shared: z.boolean(),
  }),
]);
export const InvitePreviewInput = z.strictObject({
  token: z.string().min(1),
});
export const InvitePreviewResponse = z.strictObject({
  inviteState: z.literal("active"),
  sessionId: Id,
  sessionTitle: z.string(),
  sessionStatus: z.enum(["draft", "scheduled", "live"]),
  studentDefaultName: z.string(),
});
export const StudentRefreshInput = z.strictObject({
  refreshToken: z.string().min(32),
});
export const StudentAuthResponse = z.strictObject({
  accessToken: z.string().min(1),
  studentRoomToken: z.string().min(1).optional(),
  refreshToken: z.string().min(32),
  sessionId: Id,
  studentId: Id,
  memberId: Id,
  displayName: z.string(),
  memberState: z.enum(["waiting", "joined"]),
});
export const AdmitCommand = z.strictObject({
  approved: z.boolean().optional(),
});
export const ClassroomStatePatch = z.strictObject({
  currentActivityId: Id.nullable().optional(),
  completedActivityIds: z.array(Id).optional(),
  sharedView: z.enum(["document", "board", "check"]).optional(),
  sharedBoardOwnerId: Id.optional(),
  materialPage: z.number().int().nonnegative().optional(),
  tools: Tools.partial().optional(),
});
export const QuickCheckStatusUpdate = z.strictObject({
  status: z.enum(["open", "closed"]),
});
export const CheckResponseReviewInput = z.strictObject({
  support: SupportLevel,
  feedback: z.string().trim().min(1),
});
export const EvidenceUpdateInput = z.strictObject({
  detail: z.string().trim().min(1).optional(),
  support: SupportLevel.optional(),
  status: z.enum(["active", "corrected", "deleted"]).optional(),
  reason: z.string().trim().max(500).optional(),
});
export const ClaimDraftInput = z.strictObject({
  studentId: Id.optional(),
  text: z.string().trim().min(1).optional(),
  evidenceIds: z.array(Id).min(1).optional(),
});
export const API_ROUTES = {
  googleCallback: ["POST", "/api/v1/auth/google/callback"],
  mockAuth: ["POST", "/api/v1/auth/mock"],
  logout: ["POST", "/api/v1/auth/logout"],
  me: ["GET", "/api/v1/auth/me"],
  health: ["GET", "/api/v1/health"],
  studentsList: ["GET", "/api/v1/students"],
  studentsCreate: ["POST", "/api/v1/students"],
  studentsUpdate: ["PATCH", "/api/v1/students/:id"],
  uploadIntent: ["POST", "/api/v1/materials/upload-intent"],
  materialsCreate: ["POST", "/api/v1/materials"],
  materialReadUrl: ["GET", "/api/v1/materials/:id/read-url"],
  sessionsList: ["GET", "/api/v1/sessions"],
  sessionsCreate: ["POST", "/api/v1/sessions"],
  sessionRead: ["GET", "/api/v1/sessions/:id"],
  sessionUpdate: ["PATCH", "/api/v1/sessions/:id"],
  sessionClassroomState: ["PATCH", "/api/v1/sessions/:id/classroom"],
  activities: ["PUT", "/api/v1/sessions/:id/activities"],
  start: ["POST", "/api/v1/sessions/:id/start"],
  end: ["POST", "/api/v1/sessions/:id/end"],
  invitesList: ["GET", "/api/v1/sessions/:id/invites"],
  invite: ["POST", "/api/v1/sessions/:id/invites"],
  revokeInvite: ["POST", "/api/v1/sessions/:id/invites/:invId/revoke"],
  invitePreview: ["POST", "/api/v1/room/invite-preview"],
  joinRequest: ["POST", "/api/v1/room/join-request"],
  roomRefresh: ["POST", "/api/v1/room/refresh"],
  admit: ["POST", "/api/v1/sessions/:id/members/:mId/admit"],
  memberUpdate: ["PATCH", "/api/v1/sessions/:id/members/:mId"],
  roomState: ["GET", "/api/v1/room/state"],
  videoToken: ["POST", "/api/v1/sessions/:id/video-token"],
  board: ["PUT", "/api/v1/sessions/:id/boards/:boardKey"],
  boardAttempt: ["POST", "/api/v1/sessions/:id/boards/:boardKey/attempts"],
  annotation: ["POST", "/api/v1/sessions/:id/annotations"],
  checks: ["POST", "/api/v1/sessions/:id/checks"],
  checkUpdate: ["PATCH", "/api/v1/checks/:checkId"],
  response: ["POST", "/api/v1/checks/:checkId/responses"],
  responseReview: ["POST", "/api/v1/checks/:checkId/responses/:rId/review"],
  submissionUploadIntent: [
    "POST",
    "/api/v1/sessions/:id/submissions/upload-intent",
  ],
  submission: ["POST", "/api/v1/sessions/:id/submissions"],
  submissionReadUrl: ["GET", "/api/v1/submissions/:id/read-url"],
  grade: ["PATCH", "/api/v1/submissions/:id/grade"],
  relabel: ["PATCH", "/api/v1/submissions/:id/relabel"],
  messages: ["POST", "/api/v1/sessions/:id/messages"],
  reactions: ["POST", "/api/v1/sessions/:id/reactions"],
  evidenceList: ["GET", "/api/v1/sessions/:id/evidence"],
  evidenceCreate: ["POST", "/api/v1/sessions/:id/evidence"],
  evidenceUpdate: ["PATCH", "/api/v1/evidence/:id"],
  aiSuggest: ["POST", "/api/v1/sessions/:id/ai/suggestions"],
  aiUpdate: ["PATCH", "/api/v1/ai-requests/:id"],
  aiClaimsDraft: ["POST", "/api/v1/sessions/:id/ai/claims-draft"],
  aiPlanSuggestions: ["POST", "/api/v1/sessions/:id/ai/plan-suggestions"],
  claimsList: ["GET", "/api/v1/sessions/:id/claims"],
  claimDraft: ["POST", "/api/v1/sessions/:id/claims/draft"],
  claimReview: ["PATCH", "/api/v1/claims/:id/review"],
  reviewComplete: ["POST", "/api/v1/sessions/:id/complete-review"],
  nextSession: ["POST", "/api/v1/sessions/:id/next-session"],
} as const;

// Cached command responses are deliberately restricted to non-secret references.
export const IdempotencyResponse = z.strictObject({
  resourceId: z.uuid().optional(),
  version: z.number().int().positive().optional(),
  status: z.enum(["created", "updated", "accepted", "completed"]).optional(),
});
export const AuditMetadata = z.strictObject({
  previousStatus: z
    .enum([
      "draft",
      "scheduled",
      "live",
      "ended",
      "reviewed",
      "pending",
      "approved",
      "rejected",
      "active",
      "corrected",
      "deleted",
      "invited",
      "waiting",
      "joined",
      "disconnected",
      "left",
      "revoked",
    ])
    .optional(),
  nextStatus: z
    .enum([
      "draft",
      "scheduled",
      "live",
      "ended",
      "reviewed",
      "pending",
      "approved",
      "rejected",
      "active",
      "corrected",
      "deleted",
      "invited",
      "waiting",
      "joined",
      "disconnected",
      "left",
      "revoked",
    ])
    .optional(),
  reasonCode: z
    .enum([
      "source_corrected",
      "source_deleted",
      "claim_edited",
      "submission_relabelled",
      "manual",
      "permission_changed",
    ])
    .optional(),
  revision: z.number().int().positive().optional(),
});

export const StudentInput = z.strictObject({
  name: z.string().trim().min(1),
  grade: z.string(),
  subject: z.string(),
  goal: z.string(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  notes: z.string(),
  status: z.enum(["active", "archived"]),
});
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UploadIntent = z.strictObject({
  fileName: z.string().min(1),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const MaterialInput = z.strictObject({
  title: z.string().trim().min(1),
  subject: z.string(),
  grade: z.string(),
  topic: z.string(),
  level: z.enum(["CoBan", "TrungBinh", "NangCao"]),
  kind: z.enum(["PDF", "Anh", "BaiTap", "GhiChu"]),
  description: z.string(),
  source: z.string(),
  uploadId: Id.optional(),
});
export const MemberUpdate = z.strictObject({
  canWrite: z.boolean().optional(),
  toolOverrides: Tools.partial().optional(),
  handRaised: z.boolean().optional(),
  leave: z.boolean().optional(),
});
export const CheckInput = z.strictObject({
  activityId: Id,
  question: z.string().trim().min(1),
});
export const CheckResponseInput = z.strictObject({
  answer: z.string().trim().min(1),
});
export const GradeInput = z.strictObject({
  feedback: z.string().trim().min(1),
  support: SupportLevel,
  score: z.string().optional(),
});
export const SubmissionInput = z.strictObject({
  activityId: Id.optional(),
  title: z.string().trim().min(1),
  answer: z.string(),
  uploadId: Id.optional(),
});
export const RelabelInput = z.strictObject({
  studentId: Id,
  sessionId: Id,
  activityId: Id.nullable(),
});
export const MessageInput = z.strictObject({
  text: z.string().trim().min(1).max(2000),
});
export const ReactionInput = z.strictObject({
  emoji: z.string().max(32),
  label: z.string().max(80),
});
export {
  TeachingRequestMode,
  AIRequestInput,
  AIStatusUpdate,
  AIClaimsDraftInput,
  AISuggestionItem,
  AISuggestionResponse,
  AIStatusUpdateResponse,
  AIClaimCandidate,
  AIClaimsDraftResponse,
  AICircuitStatusResponse,
} from "./ai.js";

// Additive G1 v1 DTOs; mutations require Origin and optimistic version headers where specified.
export const AuthMockInput = z.strictObject({
  account: z.enum(["teacher-a", "teacher-b"]),
});
export const AuthResponse = z.strictObject({ accessToken: z.string().min(1) });
export const TeacherMeResponse = z.strictObject({
  teacher: z.strictObject({
    id: Id,
    name: z.string(),
    email: z.email(),
    workspaceId: Id,
  }),
  featureFlags: z.record(z.string(), z.boolean()),
});
export const StudentRecord = StudentInput.extend({
  id: Id,
  teacherId: Id,
  initials: z.string(),
  color: z.string(),
  version: z.number().int().positive(),
  linkVersion: z.number().int().positive().optional(),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const StudentResponse = z.strictObject({ student: StudentRecord });
export const StudentListResponse = z.strictObject({
  students: z.array(StudentRecord),
});
export const VersionHeader = z.string().regex(/^[1-9]\d*$/);
export const REPLAY_ROUTES = [
  "POST /api/v1/students",
  "POST /api/v1/sessions",
  "POST /api/v1/materials",
  "POST /api/v1/sessions/:id/annotations",
  "POST /api/v1/sessions/:id/start",
  "POST /api/v1/sessions/:id/end",
  "POST /api/v1/sessions/:id/boards/:boardKey/attempts",
  "POST /api/v1/sessions/:id/checks",
  "POST /api/v1/checks/:checkId/responses",
  "POST /api/v1/sessions/:id/submissions",
  "POST /api/v1/sessions/:id/evidence",
  "POST /api/v1/sessions/:id/ai/suggestions",
  "POST /api/v1/sessions/:id/ai/claims-draft",
  "POST /api/v1/sessions/:id/ai/plan-suggestions",
  "POST /api/v1/sessions/:id/claims/draft",
  "POST /api/v1/sessions/:id/next-session",
] as const;
export type AuthMockInput = z.infer<typeof AuthMockInput>;
export type AuthResponse = z.infer<typeof AuthResponse>;
export type TeacherMeResponse = z.infer<typeof TeacherMeResponse>;
export type StudentResponse = z.infer<typeof StudentResponse>;
export type StudentListResponse = z.infer<typeof StudentListResponse>;
