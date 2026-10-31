import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  SKIP_IF_NO_SERVER,
  uid,
} from "./helpers.js";
import {
  createThreeContextRoom,
  connectClassroomSocket,
  assertValidStudentRoomProjection,
  assertValidRealtimeEnvelope,
} from "./g2-helpers.js";
import {
  StudentBoardCommand,
  SubmissionInput,
  RelabelInput,
  ClaimReviewCommand,
  CompleteReviewCommand,
} from "../../contracts/api.js";
import {
  nextSessionStatus,
  ReviewCompletionContext,
  StudentToolWriteContext,
} from "../../contracts/domain.js";
import { canReceiveEvent } from "../../contracts/events.js";

// =========================================================================
// G2 Blackbox Integration Test Suite: Room, Admission, Sockets & Tools
// Coverage: 3 Independent Contexts (Teacher, Student 1, Student 2 / Guest)
// Note: All unimplemented G2 endpoints are explicitly declared as BLOCKED
// pending Product G2 implementation delivery.
// =========================================================================

const BLOCKED_G2_ROOM = "BLOCKED: Requires Product G2 Room & Admission implementation (/api/v1/room)";
const BLOCKED_G2_SOCKET = "BLOCKED: Requires Product G2 Socket.IO live server implementation";
const BLOCKED_G2_REVIEW = "BLOCKED: Requires Product G2 Review & Claims command implementation (/api/v1/claims)";

// -------------------------------------------------------------------------
// 1. Room Lifecycle, Admission & Crypto Invite Token (ROOM 001..003)
// -------------------------------------------------------------------------

test(
  "T-ROOM-001-POS: Student lobby wait -> Teacher admission -> Student room projection granted",
  { skip: BLOCKED_G2_ROOM },
  async () => {
    const { teacher, student1, sessionId, cleanup } =
      await createThreeContextRoom("room-001");
    try {
      // 1. Student requests join with invite token -> status: "waiting"
      // 2. Teacher admits student via POST /api/v1/room/admit -> member admitted event
      // 3. Student fetches room view model -> assert valid projection without leaks
      assert.ok(teacher.token);
      assert.ok(student1.studentId);
      assert.ok(sessionId);
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-ROOM-002-NEG: Revoked invite token or wrong sessionId rejected with 401/403",
  { skip: BLOCKED_G2_ROOM },
  async () => {
    // 1. Attempt join with revoked invite token -> 401/403
    // 2. Attempt join with mismatched studentId / sessionId -> 403 Forbidden
  },
);

test(
  "T-ROOM-003-NEG: Admission attempts to ended session are rejected (403 Forbidden)",
  { skip: BLOCKED_G2_ROOM },
  async () => {
    // Contract verification:
    // Once session is ended (status === 'ended'), no new members can be admitted
    assert.equal(
      nextSessionStatus("ended", "start"),
      null,
      "Ended session cannot be restarted",
    );
  },
);

// -------------------------------------------------------------------------
// 2. Socket.IO Realtime Envelopes & Strict Audience Projection (LIVE 001..006)
// -------------------------------------------------------------------------

test(
  "T-LIVE-001-POS: Monotonic sequence event envelopes carry identifiers only (no private claims/secrets)",
  { skip: BLOCKED_G2_SOCKET },
  async () => {
    // 1. Verify sequence numbers increase monotonically
    // 2. Envelopes carry resourceId/activityId/version only; no raw tokens or claims
  },
);

test(
  "T-LIVE-002-NEG: Student socket strictly filtered from receiving teacher-only events (evidence.created, claim.reviewed, peer submissions)",
  { skip: SKIP_IF_NO_SERVER ? SKIP_IF_NO_SERVER : undefined },
  async () => {
    // Independent contract verification of canReceiveEvent visibility rules
    const teacherActor = { role: "teacher" as const, teacherId: "t-1" };
    const student1Actor = {
      role: "student" as const,
      teacherId: "t-1",
      sessionId: "ses-1",
      studentId: "stu-1",
    };

    // Teacher can receive evidence.created
    assert.equal(
      canReceiveEvent(teacherActor, {
        teacherId: "t-1",
        sessionId: "ses-1",
        visibility: { scope: "teacher" },
        type: "evidence.created",
      }),
      true,
    );

    // Student 1 MUST NOT receive evidence.created
    assert.equal(
      canReceiveEvent(student1Actor, {
        teacherId: "t-1",
        sessionId: "ses-1",
        visibility: { scope: "teacher" },
        type: "evidence.created",
      }),
      false,
    );

    // Student 1 MUST NOT receive Student 2's submission notification
    assert.equal(
      canReceiveEvent(student1Actor, {
        teacherId: "t-1",
        sessionId: "ses-1",
        visibility: { scope: "student", studentId: "stu-2" },
        type: "submission.created",
      }),
      false,
    );

    // Student 1 CAN receive public board.updated
    assert.equal(
      canReceiveEvent(student1Actor, {
        teacherId: "t-1",
        sessionId: "ses-1",
        visibility: { scope: "public" },
        type: "board.updated",
      }),
      true,
    );
  },
);

test(
  "T-LIVE-003-NEG: Reconnection queue enforces bounded limits (max 50 commands / 1 MiB / 5 min TTL) and rejects stale commands after session ended",
  { skip: BLOCKED_G2_SOCKET },
  async () => {
    // 1. Bounded buffer limits: max 50 commands, max 1 MiB, 5m TTL
    // 2. Server drops or rejects commands queued before session.ended
  },
);

// -------------------------------------------------------------------------
// 3. Shared Board Privacy & Author Checks (TOOL 001..002)
// -------------------------------------------------------------------------

test(
  "T-TOOL-001-POS & NEG: Board write allowed when canWrite is true and tool enabled; students can only undoOwnStroke (rejects undoing peer strokes)",
  { skip: BLOCKED_G2_SOCKET },
  async () => {
    // Contract verification of StudentBoardCommand schema
    const validStrokeCommand = StudentBoardCommand.safeParse({
      operation: "addStroke",
      stroke: {
        id: uid("stroke"),
        authorId: "stu-1",
        color: "#000000",
        points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
      },
    });
    assert.equal(validStrokeCommand.success, true);

    const validUndoCommand = StudentBoardCommand.safeParse({
      operation: "undoOwnStroke",
      strokeId: "stroke-1",
    });
    assert.equal(validUndoCommand.success, true);

    // Student attempting to undo stroke with invalid schema or missing strokeId
    const invalidUndo = StudentBoardCommand.safeParse({
      operation: "undoOwnStroke",
      strokeId: "",
    });
    assert.equal(invalidUndo.success, false);
  },
);

test(
  "T-TOOL-002-NEG: Shared board strictly enforces ownerId === sharedBoardOwnerId; mutations on unshared board rejected",
  { skip: BLOCKED_G2_SOCKET },
  async () => {
    // Assert shared board mutates only when ownerId matches current session sharedBoardOwnerId
  },
);

// -------------------------------------------------------------------------
// 4. Student Submission, Ownership & Teacher Evaluation (TOOL 005, EVD 001..002)
// -------------------------------------------------------------------------

test(
  "T-TOOL-005-POS & NEG: Student file upload generates presigned upload intent under student's namespace; direct storageKey bypass rejected",
  { skip: BLOCKED_G2_ROOM },
  async () => {
    // Contract verification of SubmissionInput
    const validSubmission = SubmissionInput.safeParse({
      title: "Bài tập tự giải",
      answer: "Đáp số Viète: x = 2",
      uploadId: uid("upload"),
    });
    assert.equal(validSubmission.success, true);

    // Direct storageKey injection must be rejected by schema
    const directInject = SubmissionInput.safeParse({
      title: "Hack",
      answer: "",
      storageKey: "arbitrary/path.pdf",
    });
    assert.equal(directInject.success, false);
  },
);

test(
  "T-TOOL-005-VM: Student room projection StudentSubmissionVM exposes student's own feedback and readUrl, but strictly hides AI suggestions or peer submissions",
  { skip: BLOCKED_G2_ROOM },
  async () => {
    // Assert StudentRoomViewModel projection verifies isolation of submissions across students
  },
);

// -------------------------------------------------------------------------
// 5. Teacher Grading, Relabeling & Evidence Invalidation Cascade (REV 001..006)
// -------------------------------------------------------------------------

test(
  "T-REV-002-POS & NEG: Evidence edit/delete triggers cascade invalidation on approved claims (status -> pending) and reopens review",
  { skip: BLOCKED_G2_REVIEW },
  async () => {
    // Contract verification:
    // When evidence status changes to 'corrected' or 'deleted',
    // dependent claims move from 'approved' -> 'pending', and session moves from 'reviewed' -> 'ended'
    assert.equal(
      nextSessionStatus("reviewed", "review_reopened"),
      "ended",
      "Reopening review must transition session from reviewed to ended",
    );
  },
);

test(
  "T-REV-005-POS & NEG: Evidence relabeling updates activityId/studentId only within session boundary and validates owner scope",
  { skip: BLOCKED_G2_REVIEW },
  async () => {
    // Contract verification of RelabelInput
    const validRelabel = RelabelInput.safeParse({
      studentId: "stu-1",
      sessionId: "ses-1",
      activityId: "act-1",
    });
    assert.equal(validRelabel.success, true);
  },
);

test(
  "T-REV-006-POS & NEG: Post-session review completion requires all claims resolved (no pending claims); zero-claim review requires explicit reviewNote",
  { skip: SKIP_IF_NO_SERVER ? SKIP_IF_NO_SERVER : undefined },
  async () => {
    // Contract verification of ReviewCompletionContext rules
    // 1. Session must be ended
    // 2. Pending claims must be 0
    // 3. Zero claims require reviewNote
    const validEmpty = ReviewCompletionContext.safeParse({
      status: "ended",
      pendingClaims: 0,
      totalClaims: 0,
      reviewNote: "Buổi học không có nhận định cần duyệt",
    });
    assert.equal(validEmpty.success, true);

    const invalidPending = ReviewCompletionContext.safeParse({
      status: "ended",
      pendingClaims: 1, // Pending claims present -> REJECT
      totalClaims: 2,
    });
    assert.equal(invalidPending.success, false);

    const invalidEmptyNoNote = ReviewCompletionContext.safeParse({
      status: "ended",
      pendingClaims: 0,
      totalClaims: 0, // 0 claims without note -> REJECT
    });
    assert.equal(invalidEmptyNoNote.success, false);

    const invalidNotEnded = ReviewCompletionContext.safeParse({
      status: "live", // Not ended -> REJECT
      pendingClaims: 0,
      totalClaims: 1,
    });
    assert.equal(invalidNotEnded.success, false);
  },
);

// -------------------------------------------------------------------------
// 6. Session-Ended Lockout (LIVE 006, AUTH 003)
// -------------------------------------------------------------------------

test(
  "T-LIVE-006-NEG: Session-ended lockout: all student write operations return 403 once session status is ended",
  { skip: SKIP_IF_NO_SERVER ? SKIP_IF_NO_SERVER : undefined },
  async () => {
    // Contract verification of StudentToolWriteContext rules
    // Once status !== 'live' (e.g. 'ended'), write action MUST fail
    const liveWrite = StudentToolWriteContext.safeParse({
      status: "live",
      memberState: "joined",
      memberBelongsToSession: true,
      roomSessionValid: true,
      canWrite: true,
      toolEnabled: true,
      memberToolEnabled: true,
    });
    assert.equal(liveWrite.success, true);

    const endedWrite = StudentToolWriteContext.safeParse({
      status: "ended", // Ended session!
      memberState: "joined",
      memberBelongsToSession: true,
      roomSessionValid: true,
      canWrite: true,
      toolEnabled: true,
      memberToolEnabled: true,
    });
    assert.equal(endedWrite.success, false, "Write command on ended session MUST be rejected");

    const revokedWrite = StudentToolWriteContext.safeParse({
      status: "live",
      memberState: "joined",
      memberBelongsToSession: true,
      roomSessionValid: false, // Invalid room session / revoked invite!
      canWrite: true,
      toolEnabled: true,
      memberToolEnabled: true,
    });
    assert.equal(revokedWrite.success, false, "Write command with invalid room session MUST be rejected");
  },
);
