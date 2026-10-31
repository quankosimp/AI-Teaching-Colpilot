import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  ApprovalContext,
  InviteSummary,
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
} from "../../../contracts/index";

const observation = {
  id: "e1",
  teacherId: "t1",
  studentId: "s1",
  sessionId: "room1",
  kind: "BaiLam" as const,
  status: "active" as const,
  isObservation: true,
  version: 2,
  currentEvidenceVersion: 2,
  source: { type: "submission" as const, id: "sub1", version: 3 },
  currentSourceVersion: 3,
};
const approval = {
  teacherId: "t1",
  studentId: "s1",
  sessionId: "room1",
  evidenceIds: ["e1"],
  evidence: [observation],
};
test("approval needs current observations belonging to the same teacher, student and session", () => {
  assert.equal(ApprovalContext.safeParse(approval).success, true);
  for (const change of [
    { teacherId: "other" },
    { studentId: "other" },
    { sessionId: "other" },
    { status: "deleted" },
    { currentSourceVersion: 4 },
    { currentEvidenceVersion: 3 },
  ]) {
    assert.equal(
      ApprovalContext.safeParse({
        ...approval,
        evidence: [{ ...observation, ...change }],
      }).success,
      false,
    );
  }
  assert.equal(
    ApprovalContext.safeParse({ ...approval, evidenceIds: [] }).success,
    false,
  );
  assert.equal(
    ApprovalContext.safeParse({
      ...approval,
      evidence: [
        {
          ...observation,
          kind: "GoiYGiangDay",
          isObservation: false,
          source: { type: "ai_suggestion", id: "ai", version: 3 },
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    ClaimReviewCommand.safeParse({
      action: "approve",
      revision: 1,
      evidenceIds: [],
    }).success,
    false,
  );
});
test("lifecycle rejects reopening live tools", () => {
  assert.equal(nextSessionStatus("draft", "start"), "live");
  assert.equal(nextSessionStatus("scheduled", "start"), "live");
  assert.equal(nextSessionStatus("reviewed", "review_reopened"), "ended");
  assert.equal(nextSessionStatus("ended", "start"), null);
  assert.equal(nextSessionStatus("reviewed", "start"), null);
  assert.equal(nextSessionStatus("live", "review_reopened"), null);
});
test("read projections and cached or audited metadata reject secret fields", () => {
  const invite = {
    id: "i",
    studentId: "s",
    maskedHint: "1234",
    expiresAt: "2026-10-31T00:00:00Z",
    state: "active",
  };
  assert.equal(InviteSummary.safeParse(invite).success, true);
  assert.equal(
    InviteSummary.safeParse({ ...invite, rawToken: "secret" }).success,
    false,
  );
  assert.equal(
    IdempotencyResponse.safeParse({ rawToken: "secret" }).success,
    false,
  );
  assert.equal(
    AuditMetadata.safeParse({ refreshToken: "secret" }).success,
    false,
  );
  assert.equal(
    StudentBoardCommand.safeParse({ operation: "replace", strokes: [] })
      .success,
    false,
  );
});
test("student room rejects private fields and event fanout enforces recipient", () => {
  const room = {
    session: {
      id: "room1",
      title: "Class",
      sharedGoal: "Learn",
      status: "live",
      currentActivityId: null,
      sharedView: "document",
      sharedBoardOwnerId: "common",
      materialPage: 0,
      tools: { board: true, check: true, upload: true, chat: true },
    },
    activities: [],
    currentMaterial: null,
    commonBoard: null,
    sharedBoard: null,
    ownBoard: null,
    ownAttempts: [],
    ownSubmissions: [],
    activeQuickCheck: null,
    ownCheckResponse: null,
    roomMessages: [],
    members: [],
    lastEventSeq: 0,
  };
  assert.equal(StudentRoomViewModel.safeParse(room).success, true);
  assert.equal(
    validateStudentRoomProjection(
      {
        ...room,
        sharedBoard: {
          id: "b",
          ownerId: "s2",
          shared: false,
          revision: 1,
          strokes: [],
          text: "private",
        },
      },
      "s1",
    ).success,
    false,
  );
  assert.equal(
    validateStudentRoomProjection(
      {
        ...room,
        ownBoard: {
          id: "b",
          ownerId: "s2",
          shared: false,
          revision: 1,
          strokes: [],
          text: "private",
        },
      },
      "s1",
    ).success,
    false,
  );
  assert.equal(
    StudentRoomViewModel.safeParse({ ...room, claims: [] }).success,
    false,
  );
  assert.equal(
    StudentRoomViewModel.safeParse({
      ...room,
      session: { ...room.session, goal: "private" },
    }).success,
    false,
  );
  assert.equal(
    StudentRoomViewModel.safeParse({
      ...room,
      activities: [
        {
          id: "a",
          title: "A",
          description: "x",
          duration: 1,
          order: 0,
          type: "KiemTra",
          teacherNotes: "private",
        },
      ],
    }).success,
    false,
  );
  const actor = {
    role: "student" as const,
    teacherId: "t1",
    sessionId: "room1",
    studentId: "s1",
  };
  const event = {
    teacherId: "t1",
    sessionId: "room1",
    visibility: { scope: "student" as const, studentId: "s2" },
    type: "submission.created" as const,
  };
  assert.equal(canReceiveEvent(actor, event), false);
  assert.equal(
    canReceiveEvent(actor, { ...event, visibility: { scope: "public" } }),
    false,
  );
  assert.equal(
    canReceiveEvent(actor, {
      ...event,
      visibility: { scope: "student", studentId: "s1" },
    }),
    true,
  );
  assert.equal(
    RealtimeEnvelope.safeParse({
      eventId: "e",
      sessionId: "room1",
      seq: 1,
      type: "submission.created",
      occurredAt: "2026-10-31T00:00:00Z",
      actorId: "s2",
      payload: { token: "secret" },
    }).success,
    false,
  );
});

test("review completion and student writes respect session and membership gates", () => {
  assert.equal(
    ReviewCompletionContext.safeParse({
      status: "ended",
      pendingClaims: 0,
      totalClaims: 0,
      reviewNote: "Chưa đủ dữ liệu",
    }).success,
    true,
  );
  assert.equal(
    ReviewCompletionContext.safeParse({
      status: "ended",
      pendingClaims: 0,
      totalClaims: 0,
    }).success,
    false,
  );
  assert.equal(
    ReviewCompletionContext.safeParse({
      status: "ended",
      pendingClaims: 1,
      totalClaims: 1,
    }).success,
    false,
  );
  const write = {
    status: "live",
    memberState: "joined",
    memberBelongsToSession: true,
    inviteValid: true,
    toolEnabled: true,
    memberToolEnabled: true,
  };
  assert.equal(StudentToolWriteContext.safeParse(write).success, true);
  assert.equal(
    StudentToolWriteContext.safeParse({ ...write, status: "ended" }).success,
    false,
  );
  assert.equal(
    StudentToolWriteContext.safeParse({ ...write, toolEnabled: false }).success,
    false,
  );
  assert.equal(
    AuditMetadata.safeParse({ reasonCode: "raw-secret" }).success,
    false,
  );
  assert.equal(
    IdempotencyResponse.safeParse({ status: "raw-secret" }).success,
    false,
  );
});
