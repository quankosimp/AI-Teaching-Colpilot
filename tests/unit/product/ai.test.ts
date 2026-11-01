import { test } from "node:test";
import { strict as assert } from "node:assert";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../server/app.js";
import { db, loadConfig } from "../../../server/context.js";
import {
  getAIAdapter,
  getCircuitStatus,
  sanitizeContext,
  sanitizeErrorMessage,
  FakeAIAdapter,
  setAIAdapterForTesting,
  resetAIAdapterForTesting,
  CircuitBreaker,
} from "../../../server/ai/index.js";

test(
  "AI 001-007 comprehensive: 4 modes, context minimization, claim drafting races, idempotency coordination, circuit breaker, and plan suggestions",
  { skip: process.env.RUN_G2_INTEGRATION !== "1" },
  async () => {
    const config = loadConfig();
    const server = createApp(config).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;

    const call = (
      path: string,
      token = "",
      method = "GET",
      body?: unknown,
      headers: Record<string, string> = {},
    ) =>
      fetch(`${base}/api/v1${path}`, {
        method,
        headers: {
          Origin: config.origin,
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(method === "GET" ? {} : { "Idempotency-Key": randomUUID() }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    try {
      // 1. Auth setup
      const login = async (account: string) => {
        const r = await call("/auth/mock", "", "POST", { account });
        assert.equal(r.status, 200);
        return (await r.json()).accessToken as string;
      };
      const teacherToken = await login("teacher-a");
      const otherTeacherToken = await login("teacher-b");
      const teacherIdentity = await db.teacherOAuthIdentity.findUniqueOrThrow({
        where: { provider_providerSubject: { provider: "mock", providerSubject: "teacher-a" } },
      });
      const teacherId = teacherIdentity.teacherId;

      // --- SG4-01: Environment Guard, ENABLE_AI & Truthful Health Probe ---
      process.env.ENABLE_AI = "false";
      const disabledProbe = await call("/ai/circuit-status", teacherToken);
      assert.equal(disabledProbe.status, 200);
      const disabledStatus = await disabledProbe.json();
      assert.equal(disabledStatus.enabled, false);
      assert.equal(disabledStatus.circuitOpen, true);

      // Disabled AI route guard (503 AI_UNAVAILABLE)
      const disabledResp = await call(
        `/sessions/00000000-0000-0000-0000-000000000000/ai/suggestions`,
        teacherToken,
        "POST",
        {
          studentId: "00000000-0000-0000-0000-000000000000",
          activityId: "00000000-0000-0000-0000-000000000000",
          kind: "explain",
          prompt: "test",
        },
      );
      assert.equal(disabledResp.status, 503);
      const disabledBody = await disabledResp.json();
      assert.match(disabledBody.error.message, /AI chưa được bật/i);

      // Re-enable AI
      process.env.ENABLE_AI = "true";

      // Verify truthful health probe when enabled
      const enabledProbe = await call("/ai/circuit-status", teacherToken);
      assert.equal(enabledProbe.status, 200);
      const probeJson = await enabledProbe.json();
      assert.equal(probeJson.enabled, true);
      assert.equal(probeJson.provider, "mock");
      assert.equal(probeJson.circuitOpen, false);

      // Even contradictory process environment/test injection must not enable mock in a production app.
      const productionServer = createApp({ ...config, mode: "production" }).listen(0, "127.0.0.1");
      await once(productionServer, "listening");
      try {
        const address = productionServer.address();
        assert.ok(address && typeof address !== "string");
        const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/sessions/${randomUUID()}/ai/suggestions`, {
          method: "POST", headers: { Origin: config.origin, "Content-Type": "application/json", Authorization: `Bearer ${teacherToken}` },
          body: JSON.stringify({ studentId: randomUUID(), activityId: randomUUID(), kind: "explain", prompt: "" }),
        });
        assert.equal(response.status, 503);
      } finally { await new Promise<void>(resolve => productionServer.close(() => resolve())); }

      // setAIAdapterForTesting gate check: forbidden in production/staging NODE_ENV
      const oldNodeEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = "production";
        assert.throws(
          () => setAIAdapterForTesting(new FakeAIAdapter()),
          /only permitted when APP_MODE=test and NODE_ENV is non-production/,
        );
      } finally {
        process.env.NODE_ENV = oldNodeEnv;
      }

      // --- Setup Test Students and Peer for Context Minimization ---
      // Target student
      const studentResp = await call("/students", teacherToken, "POST", {
        name: "Nguyễn Văn Target A",
        grade: "8",
        subject: "Vật lý",
        goal: "Nắm vững định luật Ohm và mạch nối tiếp",
        notes: "",
        strengths: [],
        gaps: [],
        status: "active",
      });
      assert.equal(studentResp.status, 201);
      const student = (await studentResp.json()).student;

      // Peer student
      const peerResp = await call("/students", teacherToken, "POST", {
        name: "Trần Thị Peer B",
        grade: "8",
        subject: "Vật lý",
        goal: "Mục tiêu bí mật của Peer B",
        notes: "",
        strengths: [],
        gaps: [],
        status: "active",
      });
      assert.equal(peerResp.status, 201);
      const peer = (await peerResp.json()).student;

      // Create session including target student and peer
      const sessionResp = await call("/sessions", teacherToken, "POST", {
        studentIds: [student.id, peer.id],
        title: "Buổi học AI Copilot",
        goal: "Luyện tập công thức mạch điện",
        sharedGoal: "Mọi học sinh làm được bài tập mạch nối tiếp",
        date: "2026-11-02",
        time: "08:00",
        duration: 45,
        tools: { board: true, upload: true, check: true, chat: true },
      });
      assert.equal(sessionResp.status, 201);
      const session = (await sessionResp.json()).session;
      const sessionId = session.id;

      // Add activity containing peer personal name, bearer token, and S3 presigned link
      const dirtyActivityDesc =
        "Hoạt động cùng học sinh Trần Thị Peer B, token Bearer secret_token_1234567890123456789012345678 và file https://s3.bucket.internal/presigned?sig=xyz";
      const activity = await db.activity.create({
        data: {
          sessionId,
          title: "Thí nghiệm mạch điện cùng Trần Thị Peer B",
          duration: 20,
          description: dirtyActivityDesc,
          type: "LuyenTap",
          order: 0,
          sourceClaimRefs: [],
        },
      });
      const activityId = activity.id;

      // Ensure target member consent is false initially
      const targetMember = await db.roomMember.findUniqueOrThrow({
        where: { sessionId_studentId: { sessionId, studentId: student.id } },
      });
      await db.roomMember.update({
        where: { id: targetMember.id },
        data: { consent: false },
      });

      // Consent enforcement check (403 when consent=false)
      const noConsentResp = await call(
        `/sessions/${sessionId}/ai/suggestions`,
        teacherToken,
        "POST",
        {
          studentId: student.id,
          activityId,
          kind: "explain",
          prompt: "Hãy giúp em hiểu bài",
        },
      );
      assert.equal(noConsentResp.status, 403);
      const noConsentBody = await noConsentResp.json();
      assert.match(noConsentBody.error.message, /consent/i);

      // Grant consent
      await db.roomMember.update({
        where: { id: targetMember.id },
        data: { consent: true },
      });

      // --- SG4-02: Capturing Adapter Verification of Context Minimization ---
      const capturingAdapter = new FakeAIAdapter();
      setAIAdapterForTesting(capturingAdapter);

      const userPromptWithSecrets =
        "Lưu ý riêng cho học sinh Nguyễn Văn Target A và Trần Thị Peer B qua email student@school.edu";
      const suggestResp = await call(
        `/sessions/${sessionId}/ai/suggestions`,
        teacherToken,
        "POST",
        {
          studentId: student.id,
          activityId,
          kind: "explain",
          prompt: userPromptWithSecrets,
        },
      );
      assert.equal(suggestResp.status, 201);
      const suggestBody = await suggestResp.json();

      // Check captured context in adapter
      const capturedPrompt = capturingAdapter.lastDispatchedPrompt || "";
      assert.ok(capturedPrompt.length > 0, "Adapter must capture dispatched prompt");
      assert.ok(!capturedPrompt.includes("Nguyễn Văn Target A"), "Target personal name must be stripped");
      assert.ok(!capturedPrompt.includes("Trần Thị Peer B"), "Peer personal name must be stripped");
      assert.ok(!capturedPrompt.includes("secret_token"), "Bearer token must be stripped");
      assert.ok(!capturedPrompt.includes("https://s3.bucket"), "S3 presigned URL must be stripped");
      assert.ok(!capturedPrompt.includes("student@school.edu"), "Email must be stripped");
      assert.ok(capturedPrompt.includes("[học sinh]"), "Should contain sanitized replacement");
      assert.ok(capturedPrompt.includes("[link removed]"), "Should contain sanitized link");
      assert.ok(capturedPrompt.includes("[credential removed]"), "Should contain sanitized credential");
      assert.ok(capturedPrompt.includes("Nắm vững định luật Ohm"), "Target student goal should be included");
      assert.ok(!capturedPrompt.includes("Mục tiêu bí mật của Peer B"), "Peer goal must never leak");

      // --- SG4-04: Persist Exact Pedagogical Kind & Full Audit Snapshot ---
      assert.equal(suggestBody.suggestion.kind, "explain");
      const savedAIReq = await db.aIRequest.findUniqueOrThrow({
        where: { id: suggestBody.suggestion.id },
      });
      assert.equal(savedAIReq.kind, "explain", "AIRequest.kind must persist exact pedagogical mode");
      assert.ok(savedAIReq.prompt.includes("Chế độ sư phạm: explain"), "AIRequest.prompt must snapshot full minimized instruction");

      // Verify all 4 modes persist exact kind
      const modes: Array<"leading_question" | "example" | "difficulty"> = [
        "leading_question",
        "example",
        "difficulty",
      ];
      for (const mode of modes) {
        const r = await call(
          `/sessions/${sessionId}/ai/suggestions`,
          teacherToken,
          "POST",
          {
            studentId: student.id,
            activityId,
            kind: mode,
            prompt: `Soạn câu hỏi cho ${mode}`,
          },
        );
        assert.equal(r.status, 201);
        const b = await r.json();
        assert.equal(b.suggestion.kind, mode);
        const dbRow = await db.aIRequest.findUniqueOrThrow({ where: { id: b.suggestion.id } });
        assert.equal(dbRow.kind, mode);
      }

      // Query GET /sessions/:id/ai/suggestions returns all modes
      const listResp = await call(`/sessions/${sessionId}/ai/suggestions`, teacherToken);
      assert.equal(listResp.status, 200);
      const listJson = await listResp.json();
      assert.ok(listJson.suggestions.length >= 4);

      // --- SG4-05: Idempotency & In-Flight Concurrency Coordination ---
      const testIdemKey = randomUUID();
      const initialCallCount = capturingAdapter.callCount;

      // First call with testIdemKey
      const idemResp1 = await call(
        `/sessions/${sessionId}/ai/suggestions`,
        teacherToken,
        "POST",
        {
          studentId: student.id,
          activityId,
          kind: "explain",
          prompt: "Idempotency test call",
        },
        { "Idempotency-Key": testIdemKey },
      );
      assert.equal(idemResp1.status, 201);
      const idemCallCountAfterFirst = capturingAdapter.callCount;
      assert.equal(idemCallCountAfterFirst, initialCallCount + 1);

      // Replay call with exact same Idempotency-Key: preflight must return cached result without calling adapter!
      const idemResp2 = await call(
        `/sessions/${sessionId}/ai/suggestions`,
        teacherToken,
        "POST",
        {
          studentId: student.id,
          activityId,
          kind: "explain",
          prompt: "Idempotency test call",
        },
        { "Idempotency-Key": testIdemKey },
      );
      assert.equal(idemResp2.status, 200);
      assert.equal(capturingAdapter.callCount, idemCallCountAfterFirst, "Replay must NOT re-call adapter");

      // Concurrent calls with identical Idempotency-Key
      const concurrentKey = randomUUID();
      const callCountBeforeConcurrent = capturingAdapter.callCount;
      const [c1, c2] = await Promise.all([
        call(
          `/sessions/${sessionId}/ai/suggestions`,
          teacherToken,
          "POST",
          {
            studentId: student.id,
            activityId,
            kind: "explain",
            prompt: "Concurrent call",
          },
          { "Idempotency-Key": concurrentKey },
        ),
        call(
          `/sessions/${sessionId}/ai/suggestions`,
          teacherToken,
          "POST",
          {
            studentId: student.id,
            activityId,
            kind: "explain",
            prompt: "Concurrent call",
          },
          { "Idempotency-Key": concurrentKey },
        ),
      ]);
      assert.ok([200, 201].includes(c1.status));
      assert.ok([200, 201].includes(c2.status));
      assert.equal(
        capturingAdapter.callCount,
        callCountBeforeConcurrent + 1,
        "Concurrent calls with same idempotency key must only invoke adapter ONCE",
      );

      // Conflict call: same Idempotency-Key with different body -> 409
      const conflictResp = await call(
        `/sessions/${sessionId}/ai/suggestions`,
        teacherToken,
        "POST",
        {
          studentId: student.id,
          activityId,
          kind: "difficulty", // Different kind!
          prompt: "Different payload",
        },
        { "Idempotency-Key": concurrentKey },
      );
      assert.equal(conflictResp.status, 409);

      // A failed first attempt must release the key to one waiter, not every waiter.
      const recoveryKey = randomUUID();
      let arrived = 0;
      let allArrived!: () => void;
      const arrival = new Promise<void>(resolve => { allArrived = resolve; });
      const countArrival = (req: import("node:http").IncomingMessage) => {
        if (req.headers["idempotency-key"] === recoveryKey && ++arrived === 6) allArrived();
      };
      server.on("request", countArrival);
      class FailFirstAdapter extends FakeAIAdapter {
        attempts = 0;
        async generateTeachingSuggestion(input: any) {
          if (++this.attempts === 1) { await arrival; throw new Error("Transient provider failure"); }
          return super.generateTeachingSuggestion(input);
        }
      }
      const recoveryAdapter = new FailFirstAdapter();
      setAIAdapterForTesting(recoveryAdapter);
      const recovered = await Promise.all(Array.from({ length: 6 }, () => call(`/sessions/${sessionId}/ai/suggestions`, teacherToken, "POST",
        { studentId: student.id, activityId, kind: "explain", prompt: "Recover one request" }, { "Idempotency-Key": recoveryKey })));
      server.off("request", countArrival);
      assert.equal(recovered.filter(response => response.status === 503).length, 1);
      assert.ok(recovered.every(response => [200, 201, 503].includes(response.status)));
      assert.equal(recoveryAdapter.attempts, 2, "Only one waiter may retry a failed provider attempt");
      setAIAdapterForTesting(capturingAdapter);

      // --- Lifecycle Updates & Evidence Creation with Review Reopening ---
      // Update suggestion to 'used' with saveAsEvidence: true
      const patchResp = await call(
        `/ai-requests/${suggestBody.suggestion.id}`,
        teacherToken,
        "PATCH",
        {
          status: "used",
          editedText: "Nội dung giáo viên đã chỉnh sửa cho dễ hiểu",
          saveAsEvidence: true,
        },
      );
      assert.equal(patchResp.status, 200);
      const patchBody = await patchResp.json();
      assert.equal(patchBody.status, "used");
      assert.equal(patchBody.editedText, "Nội dung giáo viên đã chỉnh sửa cho dễ hiểu");
      assert.ok(patchBody.evidenceId);

      // Verify created evidence properties (isObservation: false, kind: GoiYGiangDay)
      const createdEvidence = await db.evidence.findUniqueOrThrow({
        where: { id: patchBody.evidenceId },
      });
      assert.equal(createdEvidence.isObservation, false);
      assert.equal(createdEvidence.kind, "GoiYGiangDay");
      assert.equal(createdEvidence.sourceType, "ai_suggestion");
      const replayStatus = await call(`/ai-requests/${suggestBody.suggestion.id}`, teacherToken, "PATCH", {
        status: "used", editedText: "Nội dung giáo viên đã chỉnh sửa cho dễ hiểu", saveAsEvidence: true,
      });
      assert.equal(replayStatus.status, 200);
      assert.equal((await replayStatus.json()).evidenceId, createdEvidence.id, "Retry must not duplicate the saved teaching aid");

      // Verify outbox event 'evidence.created' was emitted
      const evOutbox = await db.sessionEventOutbox.findFirst({
        where: {
          sessionId,
          kind: "evidence.created",
          targetStudentId: null,
        },
      });
      assert.ok(evOutbox, "Outbox event evidence.created must be recorded");

      // --- SG4-03: Post-Session Claims Drafting, Candidate Rejection & Races ---
      // Create active observation evidence for the student
      const noteObs = await db.evidence.create({
        data: {
          sessionId,
          studentId: student.id,
          activityId,
          kind: "GhiChu",
          title: "Quan sát mạch nối tiếp",
          detail: "Học sinh tính đúng điện trở tương đương",
          support: "DocLap",
          sourceType: "note",
          sourceVersion: 1,
          isObservation: true,
          isAuto: false,
          status: "active",
          version: 1,
          createdBy: teacherId,
        },
      });

      // Peer observation evidence (belongs to peer)
      const peerObs = await db.evidence.create({
        data: {
          sessionId,
          studentId: peer.id,
          activityId,
          kind: "GhiChu",
          title: "Quan sát Peer B",
          detail: "Peer B hoàn thành bài toán",
          support: "DocLap",
          sourceType: "note",
          sourceVersion: 1,
          isObservation: true,
          isAuto: false,
          status: "active",
          version: 1,
          createdBy: teacherId,
        },
      });

      // End session to transition to post-session
      await db.session.update({
        where: { id: sessionId },
        data: { status: "ended" },
      });

      // Resource-backed observations need real IDs, even for historical rows already in the database.
      const invalidObservations: string[] = [];
      for (const sourceType of ["board_attempt", "check_response", "annotation", "submission"] as const) {
        const invalid = await call(`/sessions/${sessionId}/evidence`, teacherToken, "POST", {
          studentId: student.id, kind: "GhiChu", title: "Invalid resource", detail: "Missing actual source", support: "DocLap",
          source: { type: sourceType, id: "not-a-uuid", version: 1 },
        });
        assert.equal(invalid.status, 403, `${sourceType}: malformed resource ID must not resolve to version one`);
        const historical = await db.evidence.create({ data: {
          sessionId, studentId: student.id, kind: "GhiChu", title: "Legacy invalid resource", detail: "Must never be sent to model",
          support: "DocLap", sourceType, sourceId: "not-a-uuid", sourceVersion: 1, isObservation: true, status: "active", createdBy: teacherId,
        } });
        invalidObservations.push(historical.id);
        const forgedClaim = await db.claim.create({ data: { sessionId, studentId: student.id, text: "Legacy invalid claim", evidenceIds: [historical.id], status: "pending" } });
        const approved = await call(`/claims/${forgedClaim.id}/review`, teacherToken, "PATCH", { action: "approve", revision: 1, evidenceIds: [historical.id] });
        assert.equal(approved.status, 400, "Human approval must also reject an invalid historical resource source");
        assert.equal((await approved.json()).error.message, "Minh chứng không còn hợp lệ");
        await db.claim.update({ where: { id: forgedClaim.id }, data: { status: "approved" } }); // Legacy pre-fix data.
      }
      const invalidHistory = await call(`/students/${student.id}/history`, teacherToken);
      assert.equal(invalidHistory.status, 200);
      assert.ok((await invalidHistory.json()).claims.every((claim: { evidenceIds: string[] }) => claim.evidenceIds.every(id => !invalidObservations.includes(id))));

      // 1) Candidate with mixed/hallucinated ref: must discard whole candidate, never keep partial claim!
      class MixedCandidateAdapter extends FakeAIAdapter {
        async generateClaimDrafts() {
          return {
            claims: [
              {
                text: "Nhận định bị ô nhiễm tham chiếu lạ",
                evidenceIds: [noteObs.id, "00000000-0000-0000-0000-999999999999"], // Contains fake UUID
              },
              {
                text: "Nhận định bị ô nhiễm tham chiếu của peer",
                evidenceIds: [noteObs.id, peerObs.id], // Contains peer ref
              },
              {
                text: "Nhận định sạch hợp lệ",
                evidenceIds: [noteObs.id],
              },
            ],
            summary: "Test mixed",
            provider: "mock" as const,
            model: "mock-model",
            modelVersion: "1.0",
            contextSummary: "mixed",
            promptUsed: "mixed",
            promptVersion: "v1",
          };
        }
      }

      setAIAdapterForTesting(new MixedCandidateAdapter());
      const mixedResp = await call(
        `/sessions/${sessionId}/ai/claims-draft`,
        teacherToken,
        "POST",
        { studentId: student.id },
      );
      assert.equal(mixedResp.status, 201);
      const mixedJson = await mixedResp.json();
      // Only the clean candidate must be kept; contaminated candidates wholly discarded!
      assert.equal(mixedJson.claims.length, 1);
      assert.equal(mixedJson.claims[0].text, "Nhận định sạch hợp lệ");
      assert.deepEqual(mixedJson.claims[0].evidenceIds, [noteObs.id]);

      // 2) Candidate where ALL refs are invalid in a reviewed session: reviewed session NOT reopened!
      await db.session.update({
        where: { id: sessionId },
        data: { status: "reviewed" },
      });

      class AllInvalidCandidateAdapter extends FakeAIAdapter {
        async generateClaimDrafts() {
          return {
            claims: [
              {
                text: "Toàn bộ ref là hallucinated",
                evidenceIds: ["00000000-0000-0000-0000-111111111111"],
              },
            ],
            summary: "all invalid",
            provider: "mock" as const,
            model: "mock-model",
            modelVersion: "1.0",
            contextSummary: "invalid",
            promptUsed: "invalid",
            promptVersion: "v1",
          };
        }
      }

      setAIAdapterForTesting(new AllInvalidCandidateAdapter());
      const emptyReceiptKey = randomUUID();
      const allInvalidResp = await call(
        `/sessions/${sessionId}/ai/claims-draft`,
        teacherToken,
        "POST",
        { studentId: student.id },
        { "Idempotency-Key": emptyReceiptKey },
      );
      assert.equal(allInvalidResp.status, 201);
      const allInvalidJson = await allInvalidResp.json();
      assert.equal(allInvalidJson.claims.length, 0);
      const emptyReplay = await call(`/sessions/${sessionId}/ai/claims-draft`, teacherToken, "POST",
        { studentId: student.id }, { "Idempotency-Key": emptyReceiptKey });
      assert.equal(emptyReplay.status, 200, "An empty model result must still have a durable replay receipt");
      assert.deepEqual(await emptyReplay.json(), allInvalidJson);

      // Verify session status is STILL "reviewed" (not wrongly reopened when 0 valid claims persist)
      const sessionAfterAllInvalid = await db.session.findUniqueOrThrow({ where: { id: sessionId } });
      assert.equal(sessionAfterAllInvalid.status, "reviewed", "Reviewed session must not reopen when 0 claims created");

      class UnexpectedObservationAdapter extends AllInvalidCandidateAdapter {
        async generateClaimDrafts() {
          const extra = await db.evidence.create({ data: {
            sessionId, studentId: student.id, kind: "GhiChu", title: "Added after dispatch", detail: "New observation",
            support: "DocLap", sourceType: "note", sourceVersion: null, isObservation: true, status: "active", createdBy: teacherId,
          } });
          return { ...(await super.generateClaimDrafts()), claims: [{ text: "Not in the model input snapshot", evidenceIds: [noteObs.id, extra.id] }] };
        }
      }
      setAIAdapterForTesting(new UnexpectedObservationAdapter());
      const unexpected = await call(`/sessions/${sessionId}/ai/claims-draft`, teacherToken, "POST", { studentId: student.id });
      assert.equal(unexpected.status, 201);
      assert.deepEqual((await unexpected.json()).claims, [], "An observation added after dispatch cannot validate a model reference");

      // 3) Controlled deferred race: evidence edited/version changed while model waits -> 409 VERSION_CONFLICT
      class DeferredEvidenceChangeAdapter extends FakeAIAdapter {
        async generateClaimDrafts(input: any) {
          // Mutate evidence in DB while model is computing!
          await db.evidence.update({
            where: { id: noteObs.id },
            data: { version: { increment: 1 }, detail: "Chi tiết bị sửa đổi trong cuộc đua" },
          });
          return super.generateClaimDrafts(input);
        }
      }

      setAIAdapterForTesting(new DeferredEvidenceChangeAdapter());
      const raceEditResp = await call(
        `/sessions/${sessionId}/ai/claims-draft`,
        teacherToken,
        "POST",
        { studentId: student.id },
      );
      assert.equal(raceEditResp.status, 409, "Must return 409 VERSION_CONFLICT when evidence mutated during AI call");

      // 4) Controlled deferred race: consent revoked while model waits -> 403 PERMISSION_DENIED
      class DeferredConsentRevokeAdapter extends FakeAIAdapter {
        async generateClaimDrafts(input: any) {
          await db.roomMember.update({
            where: { id: targetMember.id },
            data: { consent: false },
          });
          return super.generateClaimDrafts(input);
        }
      }

      setAIAdapterForTesting(new DeferredConsentRevokeAdapter());
      const raceConsentResp = await call(
        `/sessions/${sessionId}/ai/claims-draft`,
        teacherToken,
        "POST",
        { studentId: student.id },
      );
      assert.equal(raceConsentResp.status, 403, "Must return 403 when consent revoked during AI call");

      // Restore consent and evidence version
      await db.roomMember.update({
        where: { id: targetMember.id },
        data: { consent: true },
      });
      const refreshedObs = await db.evidence.findUniqueOrThrow({ where: { id: noteObs.id } });

      // Clean successful post-session claim drafting
      setAIAdapterForTesting(capturingAdapter);
      const draftReceiptKey = randomUUID();
      const cleanDraftResp = await call(
        `/sessions/${sessionId}/ai/claims-draft`,
        teacherToken,
        "POST",
        { studentId: student.id },
        { "Idempotency-Key": draftReceiptKey },
      );
      assert.equal(cleanDraftResp.status, 201);
      const cleanDraftBody = await cleanDraftResp.json();
      assert.ok(cleanDraftBody.claims.length > 0);
      assert.ok(cleanDraftBody.claims.every((claim: { evidenceIds: string[] }) => claim.evidenceIds.every(id => !invalidObservations.includes(id))));
      assert.ok(!capturingAdapter.lastDispatchedPrompt?.includes("Must never be sent to model"));
      const createdClaim = cleanDraftBody.claims[0];
      assert.equal(createdClaim.status, "pending");

      // Since session was reviewed and a valid claim was persisted, verify session was reopened to 'ended'
      const sessionAfterValidClaim = await db.session.findUniqueOrThrow({ where: { id: sessionId } });
      assert.equal(sessionAfterValidClaim.status, "ended", "Session must be reopened to ended when new claim created");

      // --- Plan Suggestions Idempotency & Controlled Races (IndependentQA blocker) ---
      // Approve the pending claim
      await db.claim.update({
        where: { id: createdClaim.id },
        data: { status: "approved", reviewedAt: new Date() },
      });
      const draftReplay = await call(`/sessions/${sessionId}/ai/claims-draft`, teacherToken, "POST",
        { studentId: student.id }, { "Idempotency-Key": draftReceiptKey });
      assert.equal(draftReplay.status, 200);
      assert.deepEqual(await draftReplay.json(), cleanDraftBody,
        "Replay returns the original pending draft receipt even after a teacher approves its claim");

      // Create draft planning session
      const planSessionResp = await call("/sessions", teacherToken, "POST", {
        studentIds: [student.id],
        title: "Buổi học kế tiếp lập kế hoạch",
        goal: "Kế hoạch bài tập nâng cao",
        sharedGoal: "Kế hoạch học tập",
        date: "2026-11-03",
        time: "09:00",
        duration: 45,
        tools: { board: true, upload: true, check: true, chat: true },
      });
      assert.equal(planSessionResp.status, 201);
      const planSession = (await planSessionResp.json()).session;

      // Grant consent for student in the new planning session
      await db.roomMember.update({
        where: { sessionId_studentId: { sessionId: planSession.id, studentId: student.id } },
        data: { consent: true },
      });

      // 1) Idempotency replay preflight for plan-suggestions
      const planIdemKey = randomUUID();
      const planCallCountBefore = capturingAdapter.callCount;
      const planResp1 = await call(
        `/sessions/${planSession.id}/ai/plan-suggestions`,
        teacherToken,
        "POST",
        { studentId: student.id },
        { "Idempotency-Key": planIdemKey },
      );
      assert.equal(planResp1.status, 201);
      const planJson1 = await planResp1.json();
      assert.ok(planJson1.suggestion);
      assert.ok(planJson1.suggestion.sources.length > 0);
      assert.equal(capturingAdapter.callCount, planCallCountBefore + 1);

      // Replay must hit preflight without invoking adapter
      const planResp2 = await call(
        `/sessions/${planSession.id}/ai/plan-suggestions`,
        teacherToken,
        "POST",
        { studentId: student.id },
        { "Idempotency-Key": planIdemKey },
      );
      assert.equal(planResp2.status, 200);
      assert.deepEqual(await planResp2.json(), planJson1, "Plan retry must preserve the exact source provenance");
      assert.equal(capturingAdapter.callCount, planCallCountBefore + 1, "Plan suggestion replay must not call adapter");

      // 2) Plan suggestions race: session started while model waits -> 409 SESSION_STATE_INVALID
      class PlanSessionStartedRaceAdapter extends FakeAIAdapter {
        async generatePlanSuggestion(input: any) {
          await db.session.update({
            where: { id: planSession.id },
            data: { status: "live" },
          });
          return super.generatePlanSuggestion(input);
        }
      }

      setAIAdapterForTesting(new PlanSessionStartedRaceAdapter());
      const planRaceResp = await call(
        `/sessions/${planSession.id}/ai/plan-suggestions`,
        teacherToken,
        "POST",
        { studentId: student.id },
      );
      assert.equal(planRaceResp.status, 409, "Must return 409 when session state changed while awaiting model");

      // Restore plan session status to draft
      await db.session.update({
        where: { id: planSession.id },
        data: { status: "draft" },
      });

      // 3) Plan suggestions race: claim revised while model waits -> 409 VERSION_CONFLICT
      class PlanClaimRevisedRaceAdapter extends FakeAIAdapter {
        async generatePlanSuggestion(input: any) {
          await db.claim.update({
            where: { id: createdClaim.id },
            data: { revision: { increment: 1 } },
          });
          return super.generatePlanSuggestion(input);
        }
      }

      setAIAdapterForTesting(new PlanClaimRevisedRaceAdapter());
      const planClaimRaceResp = await call(
        `/sessions/${planSession.id}/ai/plan-suggestions`,
        teacherToken,
        "POST",
        { studentId: student.id },
      );
      assert.equal(planClaimRaceResp.status, 409, "Must return 409 when source claim revised during AI call");

      const historyActivity = await db.activity.create({ data: {
        sessionId: planSession.id, order: 0, title: "Current activity", duration: 10, type: "LuyenTap", description: "",
        sourceEvidenceIds: [], sourceClaimRefs: [],
      } });
      class TeachingHistoryRevisedAdapter extends FakeAIAdapter {
        async generateTeachingSuggestion(input: any) {
          await db.claim.update({ where: { id: createdClaim.id }, data: { revision: { increment: 1 } } });
          return super.generateTeachingSuggestion(input);
        }
      }
      setAIAdapterForTesting(new TeachingHistoryRevisedAdapter());
      const historyChanged = await call(`/sessions/${planSession.id}/ai/suggestions`, teacherToken, "POST", {
        studentId: student.id, activityId: historyActivity.id, kind: "explain", prompt: "Use approved history",
      });
      assert.equal(historyChanged.status, 409, "Teaching advice must also revalidate historical assessment context");
      class TeachingHistoryConsentAdapter extends FakeAIAdapter {
        async generateTeachingSuggestion(input: any) {
          await db.roomMember.update({ where: { id: targetMember.id }, data: { consent: false } });
          return super.generateTeachingSuggestion(input);
        }
      }
      setAIAdapterForTesting(new TeachingHistoryConsentAdapter());
      const historyRevoked = await call(`/sessions/${planSession.id}/ai/suggestions`, teacherToken, "POST", {
        studentId: student.id, activityId: historyActivity.id, kind: "explain", prompt: "Use approved history",
      });
      assert.equal(historyRevoked.status, 403, "Revoked historical consent must prevent saving new advice");

      // --- CircuitBreaker Exclusive Half-Open Unit Verification ---
      const testBreaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 50 });
      assert.equal(testBreaker.canExecute(), true);
      testBreaker.recordFailure();
      assert.equal(testBreaker.canExecute(), true);
      testBreaker.recordFailure(); // Reached threshold 2 -> circuit open
      assert.equal(testBreaker.canExecute(), false);
      assert.equal(testBreaker.getStatus().circuitOpen, true);

      // Wait for cooldown
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Exclusive half-open check: first call allowed, second caller blocked until trial probe finishes!
      assert.equal(testBreaker.canExecute(), true, "First caller allowed as exclusive half-open trial");
      assert.equal(testBreaker.canExecute(), false, "Second concurrent caller blocked while trial in-flight");

      // Trial succeeds -> circuit resets
      testBreaker.recordSuccess();
      assert.equal(testBreaker.getStatus().circuitOpen, false);
      assert.equal(testBreaker.canExecute(), true);
    } finally {
      resetAIAdapterForTesting();
      server.close();
    }
  },
);
