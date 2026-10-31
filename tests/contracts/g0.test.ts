import { test } from "node:test";
import { strict as assert } from "node:assert";
import { z } from "zod";
import {
  ApprovalContext,
  InviteSummary,
  CreateInviteResponse,
  IdempotencyResponse,
  AuditMetadata,
  StudentRoomViewModel,
  RealtimeEnvelope,
  canReceiveEvent,
  nextSessionStatus,
  StudentBoardCommand,
  ClaimReviewCommand,
  ReviewCompletionContext,
  StudentToolWriteContext,
  validateStudentRoomProjection,
  Tools,
  Stroke,
  SourceRef,
  ClaimRef,
  EvidenceForApproval,
  ObservationInput,
  StudentSubmission,
  UploadIntent,
  MAX_UPLOAD_BYTES,
} from "../../contracts/index.js";

// Helper fixtures
const validTools = { board: true, upload: true, check: true, chat: true };

const validSession = {
  id: "ses-100",
  title: "Đại số 9: Viète",
  sharedGoal: "Nắm vững định lý Viète và hệ thức nghiệm",
  status: "live" as const,
  currentActivityId: "act-1",
  sharedView: "document" as const,
  sharedBoardOwnerId: "common",
  materialPage: 1,
  tools: validTools,
};

const validActivity = {
  id: "act-1",
  title: "Khởi động",
  description: "Giải bài tập mẫu",
  duration: 15,
  order: 1,
  type: "KhoiDong" as const,
};

const validRoom: StudentRoomViewModel = {
  session: validSession,
  activities: [validActivity],
  currentMaterial: {
    id: "mat-1",
    title: "Phiếu học tập",
    version: 1,
    readUrl: "https://minio.local/signed/mat-1.pdf",
    page: 1,
  },
  commonBoard: null,
  sharedBoard: null,
  ownBoard: {
    id: "board-s1",
    ownerId: "stu-1",
    shared: false,
    revision: 1,
    strokes: [],
    text: "Nháp cá nhân của em",
  },
  ownAttempts: [],
  ownSubmissions: [],
  activeQuickCheck: null,
  ownCheckResponse: null,
  roomMessages: [],
  members: [
    {
      id: "stu-1",
      displayName: "Minh",
      initials: "BM",
      color: "violet",
      handRaised: false,
    },
  ],
  lastEventSeq: 42,
};

const validObservation: z.infer<typeof EvidenceForApproval> = {
  id: "ev-1",
  teacherId: "tea-1",
  studentId: "stu-1",
  sessionId: "ses-100",
  kind: "BaiLam",
  status: "active",
  isObservation: true,
  version: 1,
  currentEvidenceVersion: 1,
  source: { type: "submission", id: "sub-1", version: 1 },
  currentSourceVersion: 1,
};

// =========================================================================
// 1. Private Projection & Unrecognized Fields Rejection
// =========================================================================
test("G0-CONTRACT: StudentRoomViewModel rejects unrecognized and teacher-private fields", () => {
  // Baseline valid room
  assert.equal(StudentRoomViewModel.safeParse(validRoom).success, true);

  // Unrecognized root fields must be rejected (strict schema)
  assert.equal(
    StudentRoomViewModel.safeParse({
      ...validRoom,
      unrecognizedField: "leak",
    }).success,
    false,
    "Root level unrecognized fields must fail strict validation",
  );

  // Teacher internal goal must be rejected from student projection
  assert.equal(
    StudentRoomViewModel.safeParse({
      ...validRoom,
      session: {
        ...validSession,
        goal: "Giáo viên đánh giá khả năng phản xạ của Minh",
      },
    }).success,
    false,
    "Teacher internal goal must not leak into student session",
  );

  // Teacher internal review notes must be rejected
  assert.equal(
    StudentRoomViewModel.safeParse({
      ...validRoom,
      session: {
        ...validSession,
        reviewNote: "Học sinh còn yếu căn bậc hai",
      },
    }).success,
    false,
    "reviewNote must not leak into student session",
  );

  // Activity teacher notes must be rejected
  assert.equal(
    StudentRoomViewModel.safeParse({
      ...validRoom,
      activities: [
        {
          ...validActivity,
          teacherNotes: "Gợi ý thêm nếu học sinh chưa viết được delta",
        },
      ],
    }).success,
    false,
    "teacherNotes must not leak into student activities",
  );

  // Activity source references must be rejected from student projection
  assert.equal(
    StudentRoomViewModel.safeParse({
      ...validRoom,
      activities: [
        {
          ...validActivity,
          sourceEvidenceIds: ["ev-1"],
        },
      ],
    }).success,
    false,
    "sourceEvidenceIds must not leak into student activities",
  );

  // Strict domain DTOs reject unrecognized fields
  assert.equal(Tools.safeParse({ ...validTools, extraTool: true }).success, false);
  assert.equal(
    Stroke.safeParse({
      id: "st-1",
      authorId: "stu-1",
      color: "#000",
      points: [{ x: 0, y: 0 }],
      maliciousPayload: "eval()",
    }).success,
    false,
  );
});

// =========================================================================
// 2. Student Claims Leak Prevention
// =========================================================================
test("G0-CONTRACT: Student room projection strictly prevents claims and cross-student data leak", () => {
  // Claims must NEVER exist on student view model
  assert.equal(
    StudentRoomViewModel.safeParse({
      ...validRoom,
      claims: [
        {
          id: "claim-1",
          text: "Học sinh hiểu Viète",
          status: "approved",
        },
      ],
    }).success,
    false,
    "claims array in student room view model must be rejected",
  );

  // validateStudentRoomProjection ensures ownBoard belongs to the student
  const validProjection = validateStudentRoomProjection(validRoom, "stu-1");
  assert.equal(validProjection.success, true);

  // Cross-student ownBoard leak attempt
  const crossBoardRoom = {
    ...validRoom,
    ownBoard: {
      id: "board-s2",
      ownerId: "stu-2", // different student!
      shared: false,
      revision: 1,
      strokes: [],
      text: "Nháp riêng của bạn khác",
    },
  };
  assert.equal(
    validateStudentRoomProjection(crossBoardRoom, "stu-1").success,
    false,
    "ownBoard owned by another student must fail projection validation",
  );

  // Cross-student sharedBoard when shared=false must be rejected
  const privateOtherBoardRoom = {
    ...validRoom,
    sharedBoard: {
      id: "board-s2",
      ownerId: "stu-2",
      shared: false, // NOT shared!
      revision: 1,
      strokes: [],
      text: "Bảng chưa chia sẻ của bạn 2",
    },
  };
  assert.equal(
    validateStudentRoomProjection(privateOtherBoardRoom, "stu-1").success,
    false,
    "Unshared board of another student must not be projected to student",
  );
});

// =========================================================================
// 3. Invite Hash Stored / No Plaintext Token in Storage or Leak
// =========================================================================
test("G0-CONTRACT: Invite summaries, audit metadata and idempotency caches reject raw secrets", () => {
  const validInviteSummary: InviteSummary = {
    id: "inv-1",
    studentId: "stu-1",
    maskedHint: "9a2f",
    expiresAt: "2026-11-07T12:00:00Z",
    state: "active",
  };
  assert.equal(InviteSummary.safeParse(validInviteSummary).success, true);

  // InviteSummary must reject rawToken
  assert.equal(
    InviteSummary.safeParse({
      ...validInviteSummary,
      rawToken: "super-secret-raw-token-12345678901234567890",
    }).success,
    false,
    "rawToken must not be present in InviteSummary",
  );

  // InviteSummary must reject token
  assert.equal(
    InviteSummary.safeParse({
      ...validInviteSummary,
      token: "secret",
    }).success,
    false,
    "token must not be present in InviteSummary",
  );

  // CreateInviteResponse is the ONLY DTO permitted to return rawToken once
  assert.equal(
    CreateInviteResponse.safeParse({
      rawToken: "csprng-32-byte-secret-token-string-value",
      inviteUrl: "https://demo.local/?invite=csprng-token",
      expiresAt: "2026-11-07T12:00:00Z",
    }).success,
    true,
  );

  // AuditMetadata rejects raw secrets
  assert.equal(AuditMetadata.safeParse({ rawToken: "secret" }).success, false);
  assert.equal(AuditMetadata.safeParse({ refreshToken: "secret" }).success, false);
  assert.equal(AuditMetadata.safeParse({ zoomJwt: "secret" }).success, false);

  // IdempotencyResponse rejects secrets
  assert.equal(IdempotencyResponse.safeParse({ rawToken: "secret" }).success, false);
  assert.equal(IdempotencyResponse.safeParse({ bearerToken: "secret" }).success, false);
});

// =========================================================================
// 4. State Machine Transition & Lifecycle Rules
// =========================================================================
test("G0-CONTRACT: Session lifecycle enforces valid state transitions and rejects reopening live tools", () => {
  // Valid forward transitions
  assert.equal(nextSessionStatus("draft", "start"), "live");
  assert.equal(nextSessionStatus("scheduled", "start"), "live");
  assert.equal(nextSessionStatus("live", "end"), "ended");
  assert.equal(nextSessionStatus("ended", "complete_review"), "reviewed");

  // Valid cascade reopen from reviewed to ended (upon evidence/claim modification)
  assert.equal(nextSessionStatus("reviewed", "review_reopened"), "ended");

  // FORBIDDEN transitions:
  // Cannot restart ended session
  assert.equal(
    nextSessionStatus("ended", "start"),
    null,
    "Ended session cannot be restarted to live",
  );
  // Cannot restart reviewed session
  assert.equal(
    nextSessionStatus("reviewed", "start"),
    null,
    "Reviewed session cannot be restarted to live",
  );
  // Cannot reopen live session via review cascade
  assert.equal(
    nextSessionStatus("live", "review_reopened"),
    null,
    "Live session cannot be transitioned via review_reopened",
  );

  // Student write context: prohibited if session is ended, member is not joined, or canWrite is false
  const baseWrite = {
    status: "live" as const,
    memberState: "joined" as const,
    memberBelongsToSession: true,
    roomSessionValid: true,
    canWrite: true,
    toolEnabled: true,
    memberToolEnabled: true,
  };
  assert.equal(StudentToolWriteContext.safeParse(baseWrite).success, true);
  assert.equal(
    StudentToolWriteContext.safeParse({ ...baseWrite, status: "ended" }).success,
    false,
    "Student tool write must be rejected when session is ended",
  );
  assert.equal(
    StudentToolWriteContext.safeParse({ ...baseWrite, memberState: "waiting" }).success,
    false,
    "Student tool write must be rejected when member is in waiting state",
  );
  assert.equal(
    StudentToolWriteContext.safeParse({ ...baseWrite, canWrite: false }).success,
    false,
    "Student tool write must be rejected when member canWrite is false (even if session is valid)",
  );
  assert.equal(
    StudentToolWriteContext.safeParse({ ...baseWrite, toolEnabled: false }).success,
    false,
    "Student tool write must be rejected when tool is disabled",
  );
});

// =========================================================================
// 5. Source Ownership & isObservation Eligibility
// =========================================================================
test("G0-CONTRACT: Claim approval requires current, active observations and rejects non-observation aids", () => {
  const approvalPayload = {
    teacherId: "tea-1",
    studentId: "stu-1",
    sessionId: "ses-100",
    evidenceIds: ["ev-1"],
    evidence: [validObservation],
  };

  // Valid approval
  assert.equal(ApprovalContext.safeParse(approvalPayload).success, true);

  // Mismatched studentId
  assert.equal(
    ApprovalContext.safeParse({
      ...approvalPayload,
      evidence: [{ ...validObservation, studentId: "other-student" }],
    }).success,
    false,
    "Evidence belonging to another student cannot substantiate claim",
  );

  // Mismatched teacherId
  assert.equal(
    ApprovalContext.safeParse({
      ...approvalPayload,
      evidence: [{ ...validObservation, teacherId: "other-teacher" }],
    }).success,
    false,
    "Evidence belonging to another teacher workspace cannot substantiate claim",
  );

  // Mismatched sessionId
  assert.equal(
    ApprovalContext.safeParse({
      ...approvalPayload,
      evidence: [{ ...validObservation, sessionId: "other-session" }],
    }).success,
    false,
    "Evidence from another session cannot substantiate claim",
  );

  // isObservation == false (e.g. AI teaching suggestion) MUST NOT substantiate competence claims alone
  assert.equal(
    ApprovalContext.safeParse({
      ...approvalPayload,
      evidence: [
        {
          ...validObservation,
          kind: "GoiYGiangDay",
          isObservation: false,
          source: { type: "ai_suggestion", id: "ai-1", version: 1 },
        },
      ],
    }).success,
    false,
    "AI teaching aid with isObservation=false must be rejected from claim substantiation",
  );

  // Stale/deleted evidence version
  assert.equal(
    ApprovalContext.safeParse({
      ...approvalPayload,
      evidence: [{ ...validObservation, status: "deleted" }],
    }).success,
    false,
    "Deleted evidence cannot substantiate claim",
  );

  assert.equal(
    ApprovalContext.safeParse({
      ...approvalPayload,
      evidence: [{ ...validObservation, currentEvidenceVersion: 99 }],
    }).success,
    false,
    "Stale evidence version must be rejected",
  );

  // Empty evidenceIds in claim review command must fail
  assert.equal(
    ClaimReviewCommand.safeParse({
      action: "approve",
      revision: 1,
      evidenceIds: [],
    }).success,
    false,
    "Claim approval requires at least one evidenceId",
  );
});

// =========================================================================
// 6. Ordered Sequence & Realtime Audience Targeting
// =========================================================================
test("G0-CONTRACT: Realtime envelopes enforce monotonic sequencing and strict audience projection", () => {
  // Realtime envelope schema validation
  const validEnvelope: RealtimeEnvelope = {
    eventId: "evt-1",
    sessionId: "ses-100",
    seq: 10,
    type: "board.updated",
    occurredAt: "2026-10-31T15:00:00.000Z",
    actorId: "stu-1",
    payload: { resourceId: "board-1", activityId: "act-1", version: 2 },
  };
  assert.equal(RealtimeEnvelope.safeParse(validEnvelope).success, true);

  // Envelope rejects unrecognized payload fields (must carry identifiers only)
  assert.equal(
    RealtimeEnvelope.safeParse({
      ...validEnvelope,
      payload: { resourceId: "b-1", boardData: "raw content leak" },
    }).success,
    false,
    "Realtime envelope payload must only carry identifiers, rejecting arbitrary content",
  );

  // Envelope rejects negative sequence number
  assert.equal(
    RealtimeEnvelope.safeParse({ ...validEnvelope, seq: -1 }).success,
    false,
    "Realtime envelope seq must be non-negative integer",
  );

  // Envelope rejects secret fields in payload
  assert.equal(
    RealtimeEnvelope.safeParse({
      ...validEnvelope,
      payload: { rawToken: "secret" },
    }).success,
    false,
    "Realtime envelope payload must not contain rawToken",
  );

  // Audience targeting verification
  const studentActor = {
    role: "student" as const,
    teacherId: "tea-1",
    sessionId: "ses-100",
    studentId: "stu-1",
    memberId: "m-1",
  };

  const teacherActor = {
    role: "teacher" as const,
    teacherId: "tea-1",
    workspaceId: "ws-1",
  };

  // 1. Private student event to student 2
  const student2Event = {
    teacherId: "tea-1",
    sessionId: "ses-100",
    visibility: { scope: "student" as const, studentId: "stu-2" },
    type: "submission.created" as const,
  };

  assert.equal(
    canReceiveEvent(studentActor, student2Event),
    false,
    "Student 1 must NOT receive private event scoped to student 2",
  );

  // 2. Private student event to student 1
  const student1Event = {
    teacherId: "tea-1",
    sessionId: "ses-100",
    visibility: { scope: "student" as const, studentId: "stu-1" },
    type: "submission.created" as const,
  };

  assert.equal(
    canReceiveEvent(studentActor, student1Event),
    true,
    "Student 1 must receive event scoped to student 1",
  );

  // 3. Teacher can receive all session events
  assert.equal(
    canReceiveEvent(teacherActor, student2Event),
    true,
    "Teacher must receive private student events for their session",
  );

  // 4. Student cannot receive teacher-only scoped event
  const teacherOnlyEvent = {
    teacherId: "tea-1",
    sessionId: "ses-100",
    visibility: { scope: "teacher" as const },
    type: "evidence.created" as const,
  };

  assert.equal(
    canReceiveEvent(studentActor, teacherOnlyEvent),
    false,
    "Student must NOT receive teacher-only scoped events",
  );
});

// =========================================================================
// 7. MF01..03 Contract Review Audits (Post-d8d98a3 Refinements)
// =========================================================================
test("G0-CONTRACT: Audit MF01..03 refinements (upload cap, AI consistency, student submission and board ownership)", () => {
  // MF01: Member grant independent of invite rotation (roomSessionValid + canWrite)
  const rotatedInviteWrite = {
    status: "live" as const,
    memberState: "joined" as const,
    memberBelongsToSession: true,
    roomSessionValid: true, // student is joined in room even if invite was rotated
    canWrite: true,
    toolEnabled: true,
    memberToolEnabled: true,
  };
  assert.equal(StudentToolWriteContext.safeParse(rotatedInviteWrite).success, true);

  // MF02a: UploadIntent cap at 10 MiB
  assert.equal(MAX_UPLOAD_BYTES, 10 * 1024 * 1024);
  const validUpload = {
    fileName: "homework.pdf",
    mimeType: "application/pdf" as const,
    sizeBytes: MAX_UPLOAD_BYTES,
    sha256: "a".repeat(64),
  };
  assert.equal(UploadIntent.safeParse(validUpload).success, true);
  assert.equal(
    UploadIntent.safeParse({ ...validUpload, sizeBytes: MAX_UPLOAD_BYTES + 1 }).success,
    false,
    "UploadIntent must reject files exceeding 10 MiB",
  );

  // MF02b: ObservationInput kind/source consistency
  const validAIObservation = {
    studentId: "stu-1",
    kind: "GoiYGiangDay" as const,
    title: "Gợi ý giảng dạy",
    detail: "Thử phân tích hằng đẳng thức",
    support: "CoGoiY" as const,
    source: { type: "ai_suggestion" as const, id: "ai-1", version: 1 },
  };
  assert.equal(ObservationInput.safeParse(validAIObservation).success, true);

  // GoiYGiangDay with non-ai source must be rejected
  assert.equal(
    ObservationInput.safeParse({
      ...validAIObservation,
      source: { type: "submission" as const, id: "sub-1", version: 1 },
    }).success,
    false,
    "GoiYGiangDay must have source.type == ai_suggestion",
  );

  // Non-GoiYGiangDay kind with ai_suggestion source must be rejected
  assert.equal(
    ObservationInput.safeParse({
      ...validAIObservation,
      kind: "BaiLam" as const,
    }).success,
    false,
    "BaiLam must not have ai_suggestion as source",
  );

  // MF03a: StudentSubmission exposes own feedback and file, but strictly rejects suggestedFeedback
  const validStudentSubmission = {
    id: "sub-1",
    activityId: "act-1",
    title: "Bài tập 1",
    answer: "x = 2",
    status: "reviewed" as const,
    fileName: "sub-1.png",
    readUrl: "https://minio.local/signed/sub-1.png",
    support: "DocLap" as const,
    finalFeedback: "Làm đúng công thức",
    score: "10/10",
    createdAt: "2026-10-31T15:00:00.000Z",
  };
  assert.equal(StudentSubmission.safeParse(validStudentSubmission).success, true);

  // Must reject private AI suggested feedback on student submission view model
  assert.equal(
    StudentSubmission.safeParse({
      ...validStudentSubmission,
      suggestedFeedback: "AI suggestion: review step 2",
    }).success,
    false,
    "suggestedFeedback must never leak into StudentSubmission view model",
  );

  // MF03b: sharedBoard owner must match session.sharedBoardOwnerId
  const roomWithMismatchedSharedBoard = {
    ...validRoom,
    session: {
      ...validSession,
      sharedBoardOwnerId: "stu-1", // Teacher chose stu-1 board to share
    },
    sharedBoard: {
      id: "board-s2",
      ownerId: "stu-2", // But sharedBoard has owner stu-2!
      shared: true,
      revision: 1,
      strokes: [],
      text: "Nháp",
    },
  };
  assert.equal(
    validateStudentRoomProjection(roomWithMismatchedSharedBoard, "stu-1").success,
    false,
    "sharedBoard owner must match session.sharedBoardOwnerId",
  );
});
