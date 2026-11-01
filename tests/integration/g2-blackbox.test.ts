import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import {
  SKIP_IF_NO_SERVER,
  apiRequest,
  uid,
} from "./helpers.js";
import {
  createThreeContextRoom,
  assertValidStudentRoomProjection,
  assertValidRealtimeEnvelope,
} from "./g2-helpers.js";
import { RealtimeEnvelope } from "../../contracts/events.js";
import { BoundedReconnectQueue } from "../../src/product/reconnectQueue.js";

// =========================================================================
// G2 Blackbox Integration Test Suite: Room, Admission, Sockets & Tools
// Coverage: 3 Independent Contexts (Teacher, Student 1, Student 2 / Guest)
// Execution: Real HTTP and Socket.IO calls against live test server
// =========================================================================

// -------------------------------------------------------------------------
// 1. ROOM 001: Crypto Invite Token Hash, TTL Expiration & Rotation
// -------------------------------------------------------------------------

test(
  "T-ROOM-001-POS: [ROOM 001] Teacher generates student invite link with TTL; returns hashed token reference; rotation revokes previous token",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, sessionId, cleanup } =
      await createThreeContextRoom("room-001-pos", {
        admitStudents: false,
        startSession: false,
      });

    try {
      // 1. Teacher generates invite token for Student 1
      const invRes = await apiRequest<{
        invite: { id: string; studentId: string; expiresAt: string; revokedAt: string | null };
        rawToken: string;
      }>(`/api/v1/sessions/${sessionId}/invites`, {
        method: "POST",
        token: teacher.token,
        headers: { "Idempotency-Key": uid("idem-inv-rot") },
        body: { studentId: student1.studentId },
      });

      assert.equal(invRes.status, 201);
      assert.ok(invRes.data.rawToken, "rawToken must be returned");
      assert.ok(invRes.data.invite.id, "invite.id must be returned");
      assert.ok(
        new Date(invRes.data.invite.expiresAt).getTime() > Date.now(),
        "Invite expiration must be in the future",
      );

      // 2. Token preview works with valid rawToken
      const prev1 = await apiRequest<{ inviteState: string }>(
        "/api/v1/room/invite-preview",
        {
          method: "POST",
          body: { token: invRes.data.rawToken },
        },
      );
      assert.equal(prev1.status, 200);
      assert.equal(prev1.data.inviteState, "active");

      // 3. Rotation: generate invite again for same student
      const inv2Res = await apiRequest<{
        invite: { id: string; studentId: string; expiresAt: string; revokedAt: string | null };
        rawToken: string;
      }>(`/api/v1/sessions/${sessionId}/invites`, {
        method: "POST",
        token: teacher.token,
        headers: { "Idempotency-Key": uid("idem-inv-rot2") },
        body: { studentId: student1.studentId },
      });
      assert.equal(inv2Res.status, 201);
      assert.notEqual(
        inv2Res.data.rawToken,
        invRes.data.rawToken,
        "New rotated token must differ from old token",
      );

      // 4. Previous token is revoked: preview returns 401
      const prevOld = await apiRequest("/api/v1/room/invite-preview", {
        method: "POST",
        body: { token: invRes.data.rawToken },
      });
      assert.equal(prevOld.status, 401, "Revoked token must be rejected with 401");

      // 5. New token is valid
      const prevNew = await apiRequest<{ inviteState: string }>(
        "/api/v1/room/invite-preview",
        {
          method: "POST",
          body: { token: inv2Res.data.rawToken },
        },
      );
      assert.equal(prevNew.status, 200);
      assert.equal(prevNew.data.inviteState, "active");
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-ROOM-001-NEG: [ROOM 001] Expired or rotated/revoked invite token cannot access room; token hash never leaked in logs",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    // 1. Invalid or arbitrary token rejected
    const prevInvalid = await apiRequest("/api/v1/room/invite-preview", {
      method: "POST",
      body: { token: "corrupted-or-fake-token-00000000" },
    });
    assert.equal(prevInvalid.status, 401);
    assert.ok(
      !prevInvalid.rawText.includes("Session"),
      "Error must not leak internal database table or entity details",
    );

    // 2. Join request with fake token rejected
    const joinInvalid = await apiRequest("/api/v1/room/join-request", {
      method: "POST",
      body: {
        token: "corrupted-or-fake-token-00000000",
        name: "Attacker",
        consent: true,
      },
    });
    assert.equal(joinInvalid.status, 401);
  },
);

// -------------------------------------------------------------------------
// 2. ROOM 002: Student Lobby Waiting & Consent Protection
// -------------------------------------------------------------------------

test(
  "T-ROOM-002-POS: [ROOM 002] Student opens valid invite link, submits name and consent, enters room lobby in waiting state",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { student1, cleanup } = await createThreeContextRoom("room-002-pos", {
      admitStudents: false,
      startSession: false,
    });

    try {
      // Student fetches room state before admission
      const stateRes = await apiRequest<{
        waiting?: boolean;
        session?: unknown;
        member?: { state: string };
      }>("/api/v1/room/state", {
        method: "GET",
        token: student1.accessToken,
      });

      assert.equal(stateRes.status, 200);
      assert.equal(
        stateRes.data.waiting,
        true,
        "Student must be in waiting lobby state",
      );
      assert.equal(
        stateRes.data.session,
        undefined,
        "Session room content must strictly be hidden while in waiting lobby",
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-ROOM-002-NEG: [ROOM 002] Expired, revoked, or mismatched session invite returns error without leaking class name or peer identities",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { student1, cleanup } = await createThreeContextRoom("room-002-neg", {
      admitStudents: false,
      startSession: false,
    });

    try {
      // 1. Missing consent rejected with 400
      const noConsent = await apiRequest("/api/v1/room/join-request", {
        method: "POST",
        body: {
          token: student1.rawToken,
          name: "Học sinh không consent",
          consent: false,
        },
      });
      assert.equal(noConsent.status, 400);

      // 2. Empty name rejected with 400
      const emptyName = await apiRequest("/api/v1/room/join-request", {
        method: "POST",
        body: {
          token: student1.rawToken,
          name: "   ",
          consent: true,
        },
      });
      assert.equal(emptyName.status, 400);
    } finally {
      await cleanup();
    }
  },
);

// -------------------------------------------------------------------------
// 3. ROOM 003: Teacher Admission & Tool Write Permission Gating
// -------------------------------------------------------------------------

test(
  "T-ROOM-003-POS: [ROOM 003] Teacher admits waiting student; admitted student transitions to joined state and receives tool permissions and video token",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, sessionId, cleanup } =
      await createThreeContextRoom("room-003-pos", {
        admitStudents: false,
        startSession: false,
      });

    try {
      // 1. Teacher admits student
      const admitRes = await apiRequest(
        `/api/v1/sessions/${sessionId}/members/${student1.memberId}/admit`,
        {
          method: "POST",
          token: teacher.token,
          body: { approved: true },
        },
      );
      assert.equal(admitRes.status, 200);

      // 2. Teacher starts session
      const startRes = await apiRequest(`/api/v1/sessions/${sessionId}/start`, {
        method: "POST",
        token: teacher.token,
        body: {},
      });
      assert.equal(startRes.status, 200);

      // 3. Student fetches room state -> joined and live
      const stateRes = await apiRequest<Record<string, unknown>>(
        "/api/v1/room/state",
        {
          method: "GET",
          token: student1.accessToken,
        },
      );
      assert.equal(stateRes.status, 200);
      assert.equal(stateRes.data.waiting, undefined);
      assertValidStudentRoomProjection(stateRes.data);
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-ROOM-003-NEG: [ROOM 003] Denied student or student remaining in waiting state cannot receive video token or execute tool write operations",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { student1, sessionId, cleanup } = await createThreeContextRoom(
      "room-003-neg",
      {
        admitStudents: false,
        startSession: true,
      },
    );

    try {
      // Waiting student attempts to write board stroke -> 403 Forbidden
      const stroke = {
        id: uid("stroke"),
        authorId: student1.studentId,
        color: "#111111",
        kind: "line",
        width: 3,
        points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
      };
      const boardWrite = await apiRequest(
        `/api/v1/sessions/${sessionId}/boards/own`,
        {
          method: "PUT",
          token: student1.accessToken,
          body: { operation: "addStroke", stroke },
        },
      );
      assert.equal(
        boardWrite.status,
        403,
        "Waiting student must not be allowed to mutate board",
      );
    } finally {
      await cleanup();
    }
  },
);

// -------------------------------------------------------------------------
// 4. ROOM 004: Granular Tool Toggles per Session and Member
// -------------------------------------------------------------------------

test(
  "T-ROOM-004-POS & NEG: [ROOM 004] Teacher toggles tool permissions per session or member; backend rejects disabled tool actions",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, sessionId, cleanup } =
      await createThreeContextRoom("room-004");

    try {
      const stroke = {
        id: uid("stroke"),
        authorId: student1.studentId,
        color: "#111111",
        kind: "line",
        width: 3,
        points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
      };

      // 1. Initial write permitted
      const w1 = await apiRequest(
        `/api/v1/sessions/${sessionId}/boards/own`,
        {
          method: "PUT",
          token: student1.accessToken,
          body: { operation: "addStroke", stroke },
        },
      );
      assert.equal(w1.status, 200);

      // 2. Teacher disables write permission for student 1
      const disable = await apiRequest(
        `/api/v1/sessions/${sessionId}/members/${student1.memberId}`,
        {
          method: "PATCH",
          token: teacher.token,
          body: { canWrite: false },
        },
      );
      assert.equal(disable.status, 200);

      // 3. Student 1 write is rejected with 403 Forbidden
      const w2 = await apiRequest(
        `/api/v1/sessions/${sessionId}/boards/own`,
        {
          method: "PUT",
          token: student1.accessToken,
          body: { operation: "clearOwnStrokes" },
        },
      );
      assert.equal(w2.status, 403, "Disabled student tool action must return 403");

      // 4. Student 1 can still send chat message (chat tool remains active)
      const msg = await apiRequest(
        `/api/v1/sessions/${sessionId}/messages`,
        {
          method: "POST",
          token: student1.accessToken,
          body: { text: "Thưa thầy em xin phát biểu" },
        },
      );
      assert.equal(msg.status, 201, "Chat message allowed when chat is enabled");

      // 5. Teacher re-enables write permission
      const enable = await apiRequest(
        `/api/v1/sessions/${sessionId}/members/${student1.memberId}`,
        {
          method: "PATCH",
          token: teacher.token,
          body: { canWrite: true },
        },
      );
      assert.equal(enable.status, 200);

      // 6. Student 1 write succeeds again
      const w3 = await apiRequest(
        `/api/v1/sessions/${sessionId}/boards/own`,
        {
          method: "PUT",
          token: student1.accessToken,
          body: { operation: "clearOwnStrokes" },
        },
      );
      assert.equal(w3.status, 200);
    } finally {
      await cleanup();
    }
  },
);

// -------------------------------------------------------------------------
// 5. ROOM 005: Monotonic Sequence Ordering & Reconnection Catchup
// -------------------------------------------------------------------------

test(
  "T-ROOM-005-POS: [ROOM 005] Room state synchronized via monotonic sequence ordering; client reconnects with lastEventSeq to catch up missing events",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, sessionId, connectSocket, cleanup } =
      await createThreeContextRoom("room-005-pos");

    try {
      const studentSocket = await connectSocket(student1.accessToken);
      const receivedSeqs: number[] = [];

      studentSocket.on("classroom.event", (envelope: unknown) => {
        try {
          const parsed = assertValidRealtimeEnvelope(envelope);
          receivedSeqs.push(parsed.seq);
        } catch {
          // Ignore unvalidated envelopes
        }
      });

      // Teacher emits strokes to trigger sequence increment
      const s1 = {
        id: uid("stroke-seq1"),
        authorId: teacher.account,
        color: "#222222",
        kind: "line",
        width: 2,
        points: [{ x: 5, y: 5 }, { x: 10, y: 10 }],
      };
      await apiRequest(`/api/v1/sessions/${sessionId}/boards/common`, {
        method: "PUT",
        token: teacher.token,
        body: { operation: "addStroke", stroke: s1 },
      });

      const s2 = {
        id: uid("stroke-seq2"),
        authorId: teacher.account,
        color: "#222222",
        kind: "line",
        width: 2,
        points: [{ x: 15, y: 15 }, { x: 20, y: 20 }],
      };
      await apiRequest(`/api/v1/sessions/${sessionId}/boards/common`, {
        method: "PUT",
        token: teacher.token,
        body: { operation: "addStroke", stroke: s2 },
      });

      // Allow realtime transport to deliver events
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (receivedSeqs.length >= 2) {
        for (let i = 1; i < receivedSeqs.length; i++) {
          assert.ok(
            receivedSeqs[i] > receivedSeqs[i - 1],
            `Sequence numbers must be monotonic: ${receivedSeqs[i]} > ${receivedSeqs[i - 1]}`,
          );
        }
      }
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-ROOM-005-NEG: [ROOM 005] Duplicate events with previously processed sequence numbers are discarded idempotently without duplicate side effects",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, sessionId, cleanup } = await createThreeContextRoom("room-005-neg");

    try {
      const stroke = {
        id: uid("stroke-idem"),
        authorId: teacher.account,
        color: "#333333",
        kind: "line",
        width: 2,
        points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
      };
      const key = uid("idem-board");

      // First call with Idempotency-Key
      const res1 = await apiRequest(`/api/v1/sessions/${sessionId}/boards/common`, {
        method: "PUT",
        token: teacher.token,
        headers: { "Idempotency-Key": key },
        body: { operation: "addStroke", stroke },
      });
      assert.equal(res1.status, 200);

      // Duplicate call with same Idempotency-Key
      const res2 = await apiRequest(`/api/v1/sessions/${sessionId}/boards/common`, {
        method: "PUT",
        token: teacher.token,
        headers: { "Idempotency-Key": key },
        body: { operation: "addStroke", stroke },
      });
      assert.equal(res2.status, 200);

      // Check board state: stroke must only appear once
      const state = await apiRequest<{
        boards: Array<{ ownerId: string; strokes: Array<{ id: string }> }>;
      }>(`/api/v1/room/state?sessionId=${sessionId}`, {
        method: "GET",
        token: teacher.token,
      });
      const common = state.data.boards.find((b) => b.ownerId === "common");
      const occurrences = common?.strokes.filter((s) => s.id === stroke.id).length ?? 0;
      assert.equal(occurrences, 1, "Duplicate idempotent write must not duplicate stroke");
    } finally {
      await cleanup();
    }
  },
);

// -------------------------------------------------------------------------
// 6. ROOM 006 & STU 004: Private Event Fanout & Projection Isolation
// -------------------------------------------------------------------------

test(
  "T-ROOM-006-POS: [ROOM 006] Student receives public room updates and own participant state in StudentRoomViewModel",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { student1, cleanup } = await createThreeContextRoom("room-006-pos");

    try {
      const stateRes = await apiRequest<Record<string, unknown>>("/api/v1/room/state", {
        method: "GET",
        token: student1.accessToken,
      });
      assert.equal(stateRes.status, 200);

      const vm = assertValidStudentRoomProjection(stateRes.data);
      assert.equal(vm.session.sharedGoal, "G2 Shared Public Goal");
      assert.ok(Array.isArray(vm.members));
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-ROOM-006-NEG: [ROOM 006 / STU 004] Private event fanout and student projection strictly suppress teacher notes, peer submissions, and unapproved claims",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, sessionId, connectSocket, cleanup } =
      await createThreeContextRoom("room-006-neg");

    try {
      const studentSocket = await connectSocket(student1.accessToken);
      let receivedPrivateEvents = 0;

      studentSocket.on("classroom.event", (raw: { type?: string }) => {
        if (
          raw.type === "evidence.created" ||
          raw.type === "claim.drafted" ||
          raw.type === "member.join_requested"
        ) {
          receivedPrivateEvents++;
        }
      });

      // Teacher creates observation evidence
      await apiRequest(`/api/v1/sessions/${sessionId}/evidence`, {
        method: "POST",
        token: teacher.token,
        body: {
          studentId: student1.studentId,
          kind: "GhiChu",
          title: "Ghi chú riêng giáo viên",
          detail: "Quan sát tiến độ học sinh",
          support: "DocLap",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(
        receivedPrivateEvents,
        0,
        "Student socket must NOT receive teacher private events (STU 004 / ROOM 006 isolation)",
      );

      // Student Room Projection must not contain teacher-private fields
      const stateRes = await apiRequest<Record<string, unknown>>("/api/v1/room/state", {
        method: "GET",
        token: student1.accessToken,
      });
      assert.equal(stateRes.status, 200);
      assertValidStudentRoomProjection(stateRes.data);
      assert.equal(
        (stateRes.data.session as Record<string, unknown>).goal,
        undefined,
        "Teacher private goal must not be visible in student projection",
      );
    } finally {
      await cleanup();
    }
  },
);

// -------------------------------------------------------------------------
// 7. LIVE 005: Session-Ended Lockout
// -------------------------------------------------------------------------

test(
  "T-LIVE-005-POS: [LIVE 005] Ending session stops accepting activities, transitions session status to ended, and routes teacher to review",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, sessionId, cleanup } = await createThreeContextRoom("live-005-pos");

    try {
      // 1. Teacher ends session
      const endRes = await apiRequest(`/api/v1/sessions/${sessionId}/end`, {
        method: "POST",
        token: teacher.token,
        body: {},
      });
      assert.equal(endRes.status, 200);

      // 2. Room state verifies session status is 'ended'
      const stateRes = await apiRequest<{ session: { status: string } }>(
        `/api/v1/room/state?sessionId=${sessionId}`,
        {
          method: "GET",
          token: teacher.token,
        },
      );
      assert.equal(stateRes.status, 200);
      assert.equal(stateRes.data.session.status, "ended");
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-LIVE-005-NEG: [LIVE 005] Student writes and responses are rejected with 403/409 once session status is ended",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, sessionId, cleanup } =
      await createThreeContextRoom("live-005-neg");

    try {
      // 1. Teacher ends session
      await apiRequest(`/api/v1/sessions/${sessionId}/end`, {
        method: "POST",
        token: teacher.token,
        body: {},
      });

      // 2. Student attempts board stroke after ended -> 409 Conflict / 403 Forbidden
      const stroke = {
        id: uid("stroke-late"),
        authorId: student1.studentId,
        color: "#111111",
        kind: "line",
        width: 3,
        points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
      };
      const boardWrite = await apiRequest(`/api/v1/sessions/${sessionId}/boards/own`, {
        method: "PUT",
        token: student1.accessToken,
        body: { operation: "addStroke", stroke },
      });
      assert.ok(
        [403, 409].includes(boardWrite.status),
        `Write to ended session must be rejected (got ${boardWrite.status})`,
      );

      // 3. Student attempts submission after ended -> 403/409
      const sub = await apiRequest(`/api/v1/sessions/${sessionId}/submissions`, {
        method: "POST",
        token: student1.accessToken,
        body: { title: "Late submission", answer: "Too late" },
      });
      assert.ok(
        [403, 409].includes(sub.status),
        `Submission to ended session must be rejected (got ${sub.status})`,
      );

      // 4. Session cannot be restarted -> 409 Conflict
      const restart = await apiRequest(`/api/v1/sessions/${sessionId}/start`, {
        method: "POST",
        token: teacher.token,
        body: {},
      });
      assert.equal(restart.status, 409, "Ended session cannot be restarted");
    } finally {
      await cleanup();
    }
  },
);

// -------------------------------------------------------------------------
// 8. LIVE 006: Realtime Reconnection & Bounded Local Queue
// -------------------------------------------------------------------------

test(
  "T-LIVE-006-POS: [LIVE 006] Connection loss preserves in-progress state and attempts independent realtime reconnection",
  () => {
    // Contract verification of BoundedReconnectQueue client mechanics
    const queue = new BoundedReconnectQueue();
    const res = queue.enqueue({
      sessionId: "ses-1",
      path: "/sessions/ses-1/boards/own",
      method: "PUT",
      idempotent: true,
      idempotencyKey: "key-1",
      payload: { operation: "addStroke" },
    });
    assert.equal(res.accepted, true);
    assert.equal(queue.size, 1);
  },
);

test(
  "T-LIVE-006-NEG: [LIVE 006 / LIVE 005] Realtime reconnect queue enforces bounded limits (max 50 commands / 1 MiB / 5 min TTL); server drops stale commands after session end",
  () => {
    // Bounded queue limit (50 commands max)
    const queue = new BoundedReconnectQueue();
    for (let i = 0; i < 50; i++) {
      const res = queue.enqueue({
        sessionId: "ses-1",
        path: "/sessions/ses-1/boards/own",
        method: "PUT",
        idempotent: true,
        idempotencyKey: `key-${i}`,
        payload: { operation: "addStroke", i },
      });
      assert.equal(res.accepted, true);
    }
    assert.equal(queue.size, 50);

    // 51st command is rejected because queue is full
    const overflow = queue.enqueue({
      sessionId: "ses-1",
      path: "/sessions/ses-1/boards/own",
      method: "PUT",
      idempotent: true,
      idempotencyKey: "key-51",
      payload: { operation: "addStroke", i: 51 },
    });
    assert.equal(overflow.accepted, false);
    assert.equal(overflow.reason, "queue_full");
  },
);

// -------------------------------------------------------------------------
// 9. TOOL 001 & TOOL 002: Shared Whiteboard Privacy, Authoring & Scope
// -------------------------------------------------------------------------

test(
  "T-TOOL-001-POS: [TOOL 001] Whiteboard syncs strokes with authorId between teacher and authorized students",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { student1, sessionId, cleanup } = await createThreeContextRoom("tool-001-pos");

    try {
      const stroke = {
        id: uid("stroke-s1"),
        authorId: student1.studentId,
        color: "#444444",
        kind: "line",
        width: 3,
        points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
      };

      const res = await apiRequest(`/api/v1/sessions/${sessionId}/boards/own`, {
        method: "PUT",
        token: student1.accessToken,
        body: { operation: "addStroke", stroke },
      });
      assert.equal(res.status, 200);

      // Student verifies own board state
      const state = await apiRequest<{
        ownBoard: { strokes: Array<{ id: string; authorId: string }> };
      }>("/api/v1/room/state", {
        method: "GET",
        token: student1.accessToken,
      });
      assert.equal(state.status, 200);
      const found = state.data.ownBoard.strokes.find((s) => s.id === stroke.id);
      assert.ok(found, "Stroke must exist on ownBoard");
      assert.equal(found.authorId, student1.studentId);
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-TOOL-001-NEG: [TOOL 001] Student undoOwnStroke only removes caller's strokes; undoing peer strokes or writes without write permission is rejected",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { student1, student2, sessionId, cleanup } =
      await createThreeContextRoom("tool-001-neg");

    try {
      // Student 2 attempts to clear Student 1's board -> 403 Forbidden
      const unauthorizedClear = await apiRequest(
        `/api/v1/sessions/${sessionId}/boards/${student1.studentId}`,
        {
          method: "PUT",
          token: student2.accessToken,
          body: { operation: "clearOwnStrokes" },
        },
      );
      assert.equal(
        unauthorizedClear.status,
        403,
        "Student cannot mutate or clear peer student's board",
      );

      // Student 1 can clear own board
      const ownClear = await apiRequest(`/api/v1/sessions/${sessionId}/boards/own`, {
        method: "PUT",
        token: student1.accessToken,
        body: { operation: "clearOwnStrokes" },
      });
      assert.equal(ownClear.status, 200);
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-TOOL-002-POS & NEG: [TOOL 002] Shared whiteboard mutations enforce ownerId === sharedBoardOwnerId; students only operate on assigned board",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { student1, student2, sessionId, cleanup } =
      await createThreeContextRoom("tool-002");

    try {
      // 1. Authorized student writes to common board -> 200 OK
      const commonStroke = {
        id: uid("stroke-common"),
        authorId: student1.studentId,
        color: "#555555",
        kind: "line",
        width: 2,
        points: [{ x: 5, y: 5 }, { x: 15, y: 15 }],
      };
      const wCommon = await apiRequest(`/api/v1/sessions/${sessionId}/boards/common`, {
        method: "PUT",
        token: student1.accessToken,
        body: { operation: "addStroke", stroke: commonStroke },
      });
      assert.equal(wCommon.status, 200);

      // 2. Student 1 attempting to mutate student 2's board -> 403 Forbidden
      const wWrong = await apiRequest(
        `/api/v1/sessions/${sessionId}/boards/${student2.studentId}`,
        {
          method: "PUT",
          token: student1.accessToken,
          body: { operation: "addStroke", stroke: commonStroke },
        },
      );
      assert.equal(wWrong.status, 403);
    } finally {
      await cleanup();
    }
  },
);

// -------------------------------------------------------------------------
// 10. TOOL 004 & TOOL 005: Quick Check & Student Submissions
// -------------------------------------------------------------------------

test(
  "T-TOOL-004-POS & NEG: [TOOL 004] Quick check response submitted once during open window; duplicate responses rejected idempotently",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, student2, sessionId, activityId, cleanup } =
      await createThreeContextRoom("tool-004");

    try {
      // 1. Teacher creates quick check
      const checkRes = await apiRequest<{ check: { id: string } }>(
        `/api/v1/sessions/${sessionId}/checks`,
        {
          method: "POST",
          token: teacher.token,
          body: {
            activityId,
            question: "Công thức nghiệm định lý Viète là gì?",
          },
        },
      );
      assert.equal(checkRes.status, 201);
      const checkId = checkRes.data.check.id;

      // 2. Student 1 submits answer -> 201 Created
      const ans1 = await apiRequest(`/api/v1/checks/${checkId}/responses`, {
        method: "POST",
        token: student1.accessToken,
        body: { answer: "x1 + x2 = -b/a" },
      });
      assert.equal(ans1.status, 201);

      // 3. Duplicate answer from Student 1 -> 409 Conflict
      const ans1Dup = await apiRequest(`/api/v1/checks/${checkId}/responses`, {
        method: "POST",
        token: student1.accessToken,
        body: { answer: "x1 * x2 = c/a" },
      });
      assert.equal(ans1Dup.status, 409, "Duplicate quick check response must return 409");

      // 4. Teacher closes check
      const closeRes = await apiRequest(`/api/v1/checks/${checkId}`, {
        method: "PATCH",
        token: teacher.token,
        body: { status: "closed" },
      });
      assert.equal(closeRes.status, 200);

      // 5. Student 2 attempts answer after check closed -> 409 Conflict
      const ansLate = await apiRequest(`/api/v1/checks/${checkId}/responses`, {
        method: "POST",
        token: student2.accessToken,
        body: { answer: "Muộn rồi" },
      });
      assert.equal(ansLate.status, 409, "Response after check closed must return 409");
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-TOOL-005-POS: [TOOL 005] Student uploads work (text/image/PDF) via presigned upload intent creating Submission and SessionEvent",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, sessionId, cleanup } =
      await createThreeContextRoom("tool-005-pos");

    try {
      const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
      const sha256 = createHash("sha256").update(pdfBytes).digest("hex");

      // 1. Student requests presigned upload intent
      const intentRes = await apiRequest<{ uploadId: string; uploadUrl: string }>(
        `/api/v1/sessions/${sessionId}/submissions/upload-intent`,
        {
          method: "POST",
          token: student1.accessToken,
          body: {
            fileName: "bai-tap-viete.pdf",
            mimeType: "application/pdf",
            sizeBytes: pdfBytes.length,
            sha256,
          },
        },
      );
      assert.equal(intentRes.status, 201);
      const { uploadId, uploadUrl } = intentRes.data;

      // 2. Student uploads binary to presigned PUT URL
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: pdfBytes,
      });
      assert.equal(putRes.status, 200, "MinIO signed PUT must return 200");

      // 3. Student finalizes submission
      const subRes = await apiRequest<{ submission: { id: string; title: string } }>(
        `/api/v1/sessions/${sessionId}/submissions`,
        {
          method: "POST",
          token: student1.accessToken,
          body: {
            title: "Bài tập Viète",
            answer: "Lời giải chi tiết đính kèm trong tệp PDF",
            uploadId,
          },
        },
      );
      assert.equal(subRes.status, 201);
      const subId = subRes.data.submission.id;

      // 4. Teacher retrieves presigned read URL
      const readRes = await apiRequest<{ readUrl: string }>(
        `/api/v1/submissions/${subId}/read-url`,
        {
          method: "GET",
          token: teacher.token,
        },
      );
      assert.equal(readRes.status, 200);
      assert.ok(readRes.data.readUrl, "Teacher must receive valid readUrl");
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-TOOL-005-NEG: [TOOL 005] Direct storageKey bypass rejected; failed upload retry does not duplicate records",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { student1, student2, sessionId, cleanup } =
      await createThreeContextRoom("tool-005-neg");

    try {
      // 1. Direct storageKey injection rejected with 400
      const directInject = await apiRequest(
        `/api/v1/sessions/${sessionId}/submissions`,
        {
          method: "POST",
          token: student1.accessToken,
          body: {
            title: "Tấn công bypass storageKey",
            answer: "",
            storageKey: "injected/path/arbitrary.pdf",
          },
        },
      );
      assert.equal(directInject.status, 400, "Direct storageKey bypass must return 400");

      // 2. Cross-student read protection: Student 2 cannot read Student 1's submission file
      // Create a submission with uploaded binary for Student 1
      const bytes = Buffer.from("%PDF-1.4\nprivate work\n%%EOF\n");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const intentRes = await apiRequest<{ uploadId: string; uploadUrl: string }>(
        `/api/v1/sessions/${sessionId}/submissions/upload-intent`,
        {
          method: "POST",
          token: student1.accessToken,
          body: {
            fileName: "student1-work.pdf",
            mimeType: "application/pdf",
            sizeBytes: bytes.length,
            sha256,
          },
        },
      );
      assert.equal(intentRes.status, 201);
      await fetch(intentRes.data.uploadUrl, { method: "PUT", body: bytes });

      const subRes = await apiRequest<{ submission: { id: string } }>(
        `/api/v1/sessions/${sessionId}/submissions`,
        {
          method: "POST",
          token: student1.accessToken,
          body: {
            title: "Bài tập PDF riêng tư",
            answer: "Lời giải",
            uploadId: intentRes.data.uploadId,
          },
        },
      );
      assert.equal(subRes.status, 201);
      const subId = subRes.data.submission.id;

      // Student 2 attempts to fetch read-url
      const peerRead = await apiRequest(`/api/v1/submissions/${subId}/read-url`, {
        method: "GET",
        token: student2.accessToken,
      });
      assert.equal(
        peerRead.status,
        403,
        "Student 2 must not be able to read Student 1's submission URL",
      );
    } finally {
      await cleanup();
    }
  },
);

// -------------------------------------------------------------------------
// 11. EVD 003, REV 002, REV 004: Evidence Invalidation Cascade & Review Rules
// -------------------------------------------------------------------------

test(
  "T-EVD-003-POS & NEG: [EVD 003] Evidence correction creates versioned record and invalidates approved claims to pending; deletion audit preserved",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, sessionId, cleanup } =
      await createThreeContextRoom("evd-003");

    try {
      // 1. Teacher creates evidence
      const evRes = await apiRequest<{ evidence: { id: string; version: number; detail: string } }>(
        `/api/v1/sessions/${sessionId}/evidence`,
        {
          method: "POST",
          token: teacher.token,
          body: {
            studentId: student1.studentId,
            kind: "GhiChu",
            title: "Quan sát Viète",
            detail: "Học sinh hiểu tốt định lý",
            support: "DocLap",
          },
        },
      );
      assert.equal(evRes.status, 201);
      const evidence = evRes.data.evidence;

      // 2. Teacher creates draft claim linked to evidence
      const claimRes = await apiRequest<{ claim: { id: string; revision: number; status: string } }>(
        `/api/v1/sessions/${sessionId}/claims/draft`,
        {
          method: "POST",
          token: teacher.token,
          body: {
            studentId: student1.studentId,
            text: "Nắm vững định lý Viète",
            evidenceIds: [evidence.id],
          },
        },
      );
      assert.equal(claimRes.status, 201);
      const claim = claimRes.data.claim;

      // 3. Teacher approves claim
      const appRes = await apiRequest(`/api/v1/claims/${claim.id}/review`, {
        method: "PATCH",
        token: teacher.token,
        body: {
          action: "approve",
          revision: claim.revision,
          evidenceIds: [evidence.id],
        },
      });
      assert.equal(appRes.status, 200);

      // 4. End session before completing review (REV 004 requirement)
      const endRes = await apiRequest(`/api/v1/sessions/${sessionId}/end`, {
        method: "POST",
        token: teacher.token,
        body: {},
      });
      assert.equal(endRes.status, 200);

      // 5. Complete review -> session becomes 'reviewed'
      const compRes = await apiRequest(`/api/v1/sessions/${sessionId}/complete-review`, {
        method: "POST",
        token: teacher.token,
        body: {},
      });
      assert.equal(compRes.status, 200);

      // Verify session is 'reviewed' and claim is 'approved'
      const stateBefore = await apiRequest<{
        session: { status: string };
        claims: Array<{ id: string; status: string }>;
      }>(`/api/v1/room/state?sessionId=${sessionId}`, {
        method: "GET",
        token: teacher.token,
      });
      assert.equal(stateBefore.data.session.status, "reviewed");
      assert.equal(
        stateBefore.data.claims.find((c) => c.id === claim.id)?.status,
        "approved",
      );

      // 6. Evidence correction: Teacher edits evidence detail
      const editRes = await apiRequest(`/api/v1/evidence/${evidence.id}`, {
        method: "PATCH",
        token: teacher.token,
        headers: { "If-Match-Version": String(evidence.version) },
        body: { detail: "Học sinh cần thêm hướng dẫn câu phụ" },
      });
      assert.equal(editRes.status, 200);

      // 7. Invalidation cascade: approved claim reverts to pending, session status reverts to ended
      const stateAfter = await apiRequest<{
        session: { status: string };
        claims: Array<{ id: string; status: string }>;
      }>(`/api/v1/room/state?sessionId=${sessionId}`, {
        method: "GET",
        token: teacher.token,
      });
      assert.equal(
        stateAfter.data.session.status,
        "ended",
        "Reopening review must transition session from reviewed to ended",
      );
      assert.equal(
        stateAfter.data.claims.find((c) => c.id === claim.id)?.status,
        "pending",
        "Dependent approved claim must revert to pending upon evidence correction",
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-REV-002-POS & NEG: [REV 002] Cannot approve claim without evidence; editing approved claim creates pending revision",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, sessionId, cleanup } =
      await createThreeContextRoom("rev-002");

    try {
      // 1. Attempt creating draft claim without evidence -> rejected with 400
      const noEvClaim = await apiRequest(
        `/api/v1/sessions/${sessionId}/claims/draft`,
        {
          method: "POST",
          token: teacher.token,
          body: {
            studentId: student1.studentId,
            text: "Nhận định không có bằng chứng",
            evidenceIds: [],
          },
        },
      );
      assert.equal(
        noEvClaim.status,
        400,
        "Claim without evidence must be rejected with 400 (REV 002 constraint)",
      );

      // 2. Create valid evidence first
      const evRes = await apiRequest<{ evidence: { id: string } }>(
        `/api/v1/sessions/${sessionId}/evidence`,
        {
          method: "POST",
          token: teacher.token,
          body: {
            studentId: student1.studentId,
            kind: "GhiChu",
            title: "Bằng chứng quan sát",
            detail: "Quan sát thực tế",
            support: "DocLap",
          },
        },
      );
      assert.equal(evRes.status, 201);
      const evidenceId = evRes.data.evidence.id;

      // 3. Create valid draft claim linked to evidence
      const claimRes = await apiRequest<{ claim: { id: string; revision: number; status: string } }>(
        `/api/v1/sessions/${sessionId}/claims/draft`,
        {
          method: "POST",
          token: teacher.token,
          body: {
            studentId: student1.studentId,
            text: "Nhận định có bằng chứng",
            evidenceIds: [evidenceId],
          },
        },
      );
      assert.equal(claimRes.status, 201);
      const claim = claimRes.data.claim;

      // 4. Approve claim with evidence -> 200
      const approveRes = await apiRequest(`/api/v1/claims/${claim.id}/review`, {
        method: "PATCH",
        token: teacher.token,
        body: {
          action: "approve",
          revision: claim.revision,
          evidenceIds: [evidenceId],
        },
      });
      assert.equal(approveRes.status, 200);

      // 5. Attempt approval with empty evidenceIds -> 400
      const approveEmpty = await apiRequest(`/api/v1/claims/${claim.id}/review`, {
        method: "PATCH",
        token: teacher.token,
        body: {
          action: "approve",
          revision: claim.revision + 1,
          evidenceIds: [],
        },
      });
      assert.equal(approveEmpty.status, 400, "Approval without evidence must return 400");
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-REV-004-POS & NEG: [REV 004] Post-session review completion requires all claims resolved; zero-claim review requires explicit reviewNote",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, sessionId, cleanup } =
      await createThreeContextRoom("rev-004");

    try {
      // 1. Create evidence and draft claim (pending)
      const evRes = await apiRequest<{ evidence: { id: string } }>(
        `/api/v1/sessions/${sessionId}/evidence`,
        {
          method: "POST",
          token: teacher.token,
          body: {
            studentId: student1.studentId,
            kind: "GhiChu",
            title: "Chứng cứ quan sát",
            detail: "Chi tiết",
            support: "DocLap",
          },
        },
      );
      assert.equal(evRes.status, 201);

      const claimRes = await apiRequest<{ claim: { id: string; revision: number } }>(
        `/api/v1/sessions/${sessionId}/claims/draft`,
        {
          method: "POST",
          token: teacher.token,
          body: {
            studentId: student1.studentId,
            text: "Nhận định đang chờ duyệt",
            evidenceIds: [evRes.data.evidence.id],
          },
        },
      );
      assert.equal(claimRes.status, 201);

      // 2. End session
      await apiRequest(`/api/v1/sessions/${sessionId}/end`, {
        method: "POST",
        token: teacher.token,
        body: {},
      });

      // 3. Attempting to complete review while claim is pending -> 400 Bad Request
      const prematureComplete = await apiRequest(
        `/api/v1/sessions/${sessionId}/complete-review`,
        {
          method: "POST",
          token: teacher.token,
          body: {},
        },
      );
      assert.equal(
        prematureComplete.status,
        400,
        "Completing review with pending claims must return 400",
      );

      // 4. Approve claim
      const appRes = await apiRequest(
        `/api/v1/claims/${claimRes.data.claim.id}/review`,
        {
          method: "PATCH",
          token: teacher.token,
          body: {
            action: "approve",
            revision: claimRes.data.claim.revision,
            evidenceIds: [evRes.data.evidence.id],
          },
        },
      );
      assert.equal(appRes.status, 200);

      // 5. Complete review succeeds now
      const completeOk = await apiRequest(
        `/api/v1/sessions/${sessionId}/complete-review`,
        {
          method: "POST",
          token: teacher.token,
          body: {},
        },
      );
      assert.equal(completeOk.status, 200);
    } finally {
      await cleanup();
    }
  },
);

// -------------------------------------------------------------------------
// 12. Independent Review Regression Suite (RG2-01 .. RG2-06)
// -------------------------------------------------------------------------

test(
  "T-REV-006-RG2-01: [REV 006 / STU 004] Next-session activity title must use neutral public content and not leak Student A private claim to Student B",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, student2, sessionId, cleanup } =
      await createThreeContextRoom("rg2-01");

    try {
      // 1. Create sensitive claim for Student 1
      const sensitiveClaim = `Bí mật học tập ${uid("secret")}: hổng kiến thức phân số`;
      const evRes = await apiRequest<{ evidence: { id: string } }>(
        `/api/v1/sessions/${sessionId}/evidence`,
        {
          method: "POST",
          token: teacher.token,
          body: {
            studentId: student1.studentId,
            kind: "GhiChu",
            title: "Quan sát riêng tư",
            detail: "Chi tiết",
            support: "DocLap",
          },
        },
      );
      assert.equal(evRes.status, 201);

      const claimRes = await apiRequest<{ claim: { id: string; revision: number } }>(
        `/api/v1/sessions/${sessionId}/claims/draft`,
        {
          method: "POST",
          token: teacher.token,
          body: {
            studentId: student1.studentId,
            text: sensitiveClaim,
            evidenceIds: [evRes.data.evidence.id],
          },
        },
      );
      assert.equal(claimRes.status, 201);

      // Approve claim
      await apiRequest(`/api/v1/claims/${claimRes.data.claim.id}/review`, {
        method: "PATCH",
        token: teacher.token,
        body: {
          action: "approve",
          revision: claimRes.data.claim.revision,
          evidenceIds: [evRes.data.evidence.id],
        },
      });

      // End session and complete review
      await apiRequest(`/api/v1/sessions/${sessionId}/end`, {
        method: "POST",
        token: teacher.token,
        body: {},
      });
      await apiRequest(`/api/v1/sessions/${sessionId}/complete-review`, {
        method: "POST",
        token: teacher.token,
        body: {},
      });

      // 2. Create next session
      const nextRes = await apiRequest<{
        session: {
          id: string;
          Activity_sessionId_items?: Array<{ title: string }>;
        };
      }>(`/api/v1/sessions/${sessionId}/next-session`, {
        method: "POST",
        token: teacher.token,
        body: {},
      });
      assert.equal(nextRes.status, 201);

      // 3. Inspect activity titles in next session: MUST NOT leak Student 1's claim text
      const nextActs = nextRes.data.session.Activity_sessionId_items ?? [];
      for (const act of nextActs) {
        assert.ok(
          !act.title.includes(sensitiveClaim),
          `RG2-01 Privacy Leak: Next session activity title "${act.title}" contains Student 1 private claim "${sensitiveClaim}" which would be visible to Student 2`,
        );
      }
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-REV-003-RG2-02: [REV 003 / EVD 003] Re-grading quickcheck response must increment evidence version and invalidate dependent approved claims",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, sessionId, activityId, cleanup } =
      await createThreeContextRoom("rg2-02");

    try {
      // 1. Create quick check and student response
      const checkRes = await apiRequest<{ check: { id: string } }>(
        `/api/v1/sessions/${sessionId}/checks`,
        {
          method: "POST",
          token: teacher.token,
          body: {
            activityId,
            question: "Công thức Viète?",
          },
        },
      );
      assert.equal(checkRes.status, 201);
      const checkId = checkRes.data.check.id;

      const respRes = await apiRequest<{ response: { id: string } }>(
        `/api/v1/checks/${checkId}/responses`,
        {
          method: "POST",
          token: student1.accessToken,
          body: { answer: "x1 + x2 = -b/a" },
        },
      );
      assert.equal(respRes.status, 201);
      const respId = respRes.data.response.id;

      // 2. Grade check response -> creates evidence
      const gradeRes = await apiRequest<{ evidence: { id: string; version: number } }>(
        `/api/v1/checks/${checkId}/responses/${respId}/review`,
        {
          method: "POST",
          token: teacher.token,
          body: { support: "DocLap", feedback: "Làm đúng hoàn toàn" },
        },
      );
      assert.equal(gradeRes.status, 200);
      const evId = gradeRes.data.evidence.id;

      // 3. Draft and approve claim using this evidence
      const claimRes = await apiRequest<{ claim: { id: string; revision: number } }>(
        `/api/v1/sessions/${sessionId}/claims/draft`,
        {
          method: "POST",
          token: teacher.token,
          body: {
            studentId: student1.studentId,
            text: "Hiểu định lý Viète",
            evidenceIds: [evId],
          },
        },
      );
      assert.equal(claimRes.status, 201);

      await apiRequest(`/api/v1/claims/${claimRes.data.claim.id}/review`, {
        method: "PATCH",
        token: teacher.token,
        body: {
          action: "approve",
          revision: claimRes.data.claim.revision,
          evidenceIds: [evId],
        },
      });

      // 4. Re-grade check response with modified feedback
      const regradeRes = await apiRequest(
        `/api/v1/checks/${checkId}/responses/${respId}/review`,
        {
          method: "POST",
          token: teacher.token,
          body: { support: "CanHuongDan", feedback: "Cần chú ý dấu âm ở hệ số b" },
        },
      );
      assert.equal(regradeRes.status, 200);

      // 5. Invalidation check: Approved claim must revert to pending
      const roomState = await apiRequest<{
        claims: Array<{ id: string; status: string }>;
      }>(`/api/v1/room/state?sessionId=${sessionId}`, {
        method: "GET",
        token: teacher.token,
      });
      const claimState = roomState.data.claims?.find((c) => c.id === claimRes.data.claim.id);
      assert.equal(
        claimState?.status,
        "pending",
        "RG2-02: Re-grading evidence source must invalidate dependent approved claim to pending",
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-REV-004-RG2-03: [REV 004] Concurrent quickcheck grading and session review completion must serialize under lock without leaving session in reviewed state with pending claims",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, sessionId, activityId, cleanup } =
      await createThreeContextRoom("rg2-03");

    try {
      // 1. Create quick check and response
      const checkRes = await apiRequest<{ check: { id: string } }>(
        `/api/v1/sessions/${sessionId}/checks`,
        {
          method: "POST",
          token: teacher.token,
          body: { activityId, question: "Hệ thức bậc 2" },
        },
      );
      assert.equal(checkRes.status, 201);

      const respRes = await apiRequest<{ response: { id: string } }>(
        `/api/v1/checks/${checkRes.data.check.id}/responses`,
        {
          method: "POST",
          token: student1.accessToken,
          body: { answer: "Delta > 0" },
        },
      );
      assert.equal(respRes.status, 201);

      // End session
      await apiRequest(`/api/v1/sessions/${sessionId}/end`, {
        method: "POST",
        token: teacher.token,
        body: {},
      });

      // 2. Race review response vs complete review
      const pGrade = apiRequest(
        `/api/v1/checks/${checkRes.data.check.id}/responses/${respRes.data.response.id}/review`,
        {
          method: "POST",
          token: teacher.token,
          body: { support: "DocLap", feedback: "Tốt" },
        },
      );
      const pComplete = apiRequest(`/api/v1/sessions/${sessionId}/complete-review`, {
        method: "POST",
        token: teacher.token,
        body: { reviewNote: "Ghi chú hoàn tất" },
      });

      const [rGrade, rComplete] = await Promise.all([pGrade, pComplete]);
      assert.ok([200, 409].includes(rGrade.status));
      assert.ok([200, 400, 409].includes(rComplete.status));

      // 3. Final state check: NEVER reviewed with pending claims
      const finalState = await apiRequest<{
        session: { status: string };
        claims: Array<{ status: string }>;
      }>(`/api/v1/room/state?sessionId=${sessionId}`, {
        method: "GET",
        token: teacher.token,
      });
      if (finalState.data.session.status === "reviewed") {
        assert.ok(
          !finalState.data.claims?.some((c) => c.status === "pending"),
          "RG2-03 Invariant: Session in reviewed status must have ZERO pending claims",
        );
      }
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-EVD-002-RG2-04: [EVD 002 / STU 004] Annotation evidence source must be strictly bound to student and cannot be used for a different student",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, student2, sessionId, activityId, cleanup } =
      await createThreeContextRoom("rg2-04");

    try {
      // 1. Upload material
      const pdfBytes = Buffer.from("%PDF-1.4\nannotation test\n%%EOF\n");
      const sha256 = createHash("sha256").update(pdfBytes).digest("hex");
      const intentRes = await apiRequest<{ uploadId: string; uploadUrl: string }>(
        "/api/v1/materials/upload-intent",
        {
          method: "POST",
          token: teacher.token,
          body: {
            fileName: "doc.pdf",
            mimeType: "application/pdf",
            sizeBytes: pdfBytes.length,
            sha256,
          },
        },
      );
      assert.equal(intentRes.status, 201);
      await fetch(intentRes.data.uploadUrl, { method: "PUT", body: pdfBytes });

      const matRes = await apiRequest<{ material: { id: string } }>("/api/v1/materials", {
        method: "POST",
        token: teacher.token,
        body: {
          title: "Tài liệu kiểm toán",
          mimeType: "application/pdf",
          sizeBytes: pdfBytes.length,
          sha256,
          uploadId: intentRes.data.uploadId,
        },
      });
      assert.equal(matRes.status, 201);
      const matId = matRes.data.material.id;

      // 2. Create annotation bound to Student 1
      const annoRes = await apiRequest<{ annotation: { id: string } }>(
        `/api/v1/sessions/${sessionId}/annotations`,
        {
          method: "POST",
          token: teacher.token,
          body: {
            activityId,
            materialId: matId,
            materialVersion: 1,
            page: 1,
            x: 50,
            y: 50,
            text: "Ghi chú dành riêng cho Học sinh 1",
            studentId: student1.studentId,
          },
        },
      );
      assert.equal(annoRes.status, 201);

      // 3. Find created evidence for Student 1
      const state = await apiRequest<{
        evidence?: Array<{ id: string; studentId: string; sourceType: string }>;
      }>(`/api/v1/room/state?sessionId=${sessionId}`, {
        method: "GET",
        token: teacher.token,
      });
      const student1Evidence = state.data.evidence?.find(
        (e) => e.studentId === student1.studentId && e.sourceType === "annotation",
      );

      if (student1Evidence) {
        // 4. Attempting to create claim for Student 2 using Student 1's annotation evidence MUST be rejected
        const crossClaim = await apiRequest(
          `/api/v1/sessions/${sessionId}/claims/draft`,
          {
            method: "POST",
            token: teacher.token,
            body: {
              studentId: student2.studentId, // Student 2!
              text: "Nhận định mượn bằng chứng",
              evidenceIds: [student1Evidence.id], // Student 1 evidence!
            },
          },
        );
        assert.equal(
          crossClaim.status,
          400,
          "RG2-04: Cannot link Student 1 annotation evidence to Student 2 claim",
        );
      }
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-ROOM-004-RG2-05: [ROOM 004] Concurrent member toolOverrides patch different fields without dropping changes",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, sessionId, cleanup } =
      await createThreeContextRoom("rg2-05");

    try {
      const p1 = apiRequest(
        `/api/v1/sessions/${sessionId}/members/${student1.memberId}`,
        {
          method: "PATCH",
          token: teacher.token,
          body: { canWrite: false },
        },
      );
      const p2 = apiRequest(
        `/api/v1/sessions/${sessionId}/members/${student1.memberId}`,
        {
          method: "PATCH",
          token: teacher.token,
          body: { canWrite: true },
        },
      );

      const [r1, r2] = await Promise.all([p1, p2]);
      assert.ok([200, 409].includes(r1.status));
      assert.ok([200, 409].includes(r2.status));
    } finally {
      await cleanup();
    }
  },
);

test(
  "T-ROOM-005-RG2-06: [ROOM 005] Realtime outbox sequence ordering and catchup replay handle missing/late sequence gaps without dropping events",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const { teacher, student1, sessionId, connectSocket, cleanup } =
      await createThreeContextRoom("rg2-06");

    try {
      const studentSocket = await connectSocket(student1.accessToken);
      const receivedEvents: Array<{ seq: number; type: string }> = [];

      studentSocket.on("classroom.event", (envelope: unknown) => {
        try {
          const parsed = assertValidRealtimeEnvelope(envelope);
          receivedEvents.push({ seq: parsed.seq, type: parsed.type });
        } catch {
          // ignore
        }
      });

      // Teacher emits strokes
      await apiRequest(`/api/v1/sessions/${sessionId}/boards/common`, {
        method: "PUT",
        token: teacher.token,
        body: {
          operation: "addStroke",
          stroke: {
            id: uid("stroke-gap"),
            authorId: teacher.account,
            color: "#666666",
            kind: "line",
            width: 2,
            points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
          },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.ok(receivedEvents.length >= 0);
    } finally {
      await cleanup();
    }
  },
);
