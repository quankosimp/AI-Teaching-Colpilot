import { test } from "node:test";
import { strict as assert } from "node:assert";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../server/app.js";
import { db, loadConfig } from "../../../server/context.js";
import {
  getAIAdapter,
  sanitizeContext,
  sanitizeErrorMessage,
  FakeAIAdapter,
} from "../../../server/ai/index.js";

test(
  "AI 001-007: teaching request modes, lifecycle, non-observation evidence, post-session claims, circuit breaker, consent and sanitization",
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

      // Verify AI circuit status endpoint (AI 007)
      const circuitProbe = await call("/ai/circuit-status", teacherToken);
      assert.equal(circuitProbe.status, 200);
      const probeJson = await circuitProbe.json();
      assert.equal(probeJson.provider, "mock");
      assert.equal(probeJson.circuitOpen, false);

      // Create test student and session
      const studentResp = await call("/students", teacherToken, "POST", {
        name: "Nguyễn Văn AI Test",
        grade: "8",
        subject: "Vật lý",
        goal: "Nắm vững định luật Ohm",
        notes: "",
        strengths: [],
        gaps: [],
        status: "active",
      });
      assert.equal(studentResp.status, 201);
      const student = (await studentResp.json()).student;

      const sessionResp = await call("/sessions", teacherToken, "POST", {
        studentIds: [student.id],
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

      // Add activity
      const actResp = await call(
        `/sessions/${sessionId}/activities`,
        teacherToken,
        "PUT",
        [
          {
            title: "Bài tập mạch nối tiếp",
            description: "Tính điện trở tương đương và cường độ dòng điện",
            duration: 15,
            type: "LuyenTap",
            materialId: null,
            materialVersion: null,
            teacherNotes: null,
            sourceEvidenceIds: [],
            sourceClaimRefs: [],
          },
        ],
        { "If-Match-Version": String(session.version) },
      );
      assert.equal(actResp.status, 200);
      const actJson = await actResp.json();
      const activityId = actJson.session.Activity_sessionId_items[0].id;

      // Query room member
      const member = await db.roomMember.findUniqueOrThrow({
        where: {
          sessionId_studentId: { sessionId, studentId: student.id },
        },
      });

      // --- AI 006: Consent enforcement ---
      // Ensure member.consent is false initially
      await db.roomMember.update({
        where: { id: member.id },
        data: { consent: false },
      });

      const noConsentResp = await call(
        `/sessions/${sessionId}/ai/suggestions`,
        teacherToken,
        "POST",
        {
          studentId: student.id,
          activityId,
          kind: "explain",
          prompt: "Hãy giúp em hiểu công thức nối tiếp",
        },
      );
      assert.equal(noConsentResp.status, 403);
      const noConsentBody = await noConsentResp.json();
      assert.match(noConsentBody.error.message, /consent/i);

      // Grant consent
      await db.roomMember.update({
        where: { id: member.id },
        data: { consent: true },
      });

      // --- AI 001: Four pedagogical teaching request modes ---
      const modes: Array<"explain" | "leading_question" | "example" | "difficulty"> = [
        "explain",
        "leading_question",
        "example",
        "difficulty",
      ];

      const suggestionIds: string[] = [];

      for (const mode of modes) {
        const resp = await call(
          `/sessions/${sessionId}/ai/suggestions`,
          teacherToken,
          "POST",
          {
            studentId: student.id,
            activityId,
            kind: mode,
            prompt: `Yêu cầu hỗ trợ chế độ ${mode} cho học sinh`,
          },
        );
        assert.equal(resp.status, 201, `Mode ${mode} should return 201`);
        const json = await resp.json();
        assert.ok(json.suggestion);
        assert.equal(json.suggestion.status, "ready");
        assert.equal(json.suggestion.provider, "mock"); // Honest labeling (AI 007)
        assert.equal(json.suggestion.studentId, student.id);
        assert.equal(json.suggestion.activityId, activityId);
        assert.ok(json.suggestion.responseText.length > 10);
        suggestionIds.push(json.suggestion.id);
      }

      // Verify boundary rejection: non-existent activity returns 400
      const badActResp = await call(
        `/sessions/${sessionId}/ai/suggestions`,
        teacherToken,
        "POST",
        {
          studentId: student.id,
          activityId: crypto.randomUUID(),
          kind: "explain",
          prompt: "test",
        },
      );
      assert.equal(badActResp.status, 400);

      // Verify boundary rejection: other teacher cannot request suggestion
      const unauthResp = await call(
        `/sessions/${sessionId}/ai/suggestions`,
        otherTeacherToken,
        "POST",
        {
          studentId: student.id,
          activityId,
          kind: "explain",
          prompt: "test",
        },
      );
      assert.equal(unauthResp.status, 403);

      // Query in-session suggestions
      const listResp = await call(`/sessions/${sessionId}/ai/suggestions`, teacherToken);
      assert.equal(listResp.status, 200);
      const listJson = await listResp.json();
      assert.equal(listJson.suggestions.length, 4);

      // --- AI 002: Lifecycle transitions (ready -> used / ignored / reported) & text editing ---
      // Transition suggestion 0 to "ignored"
      const ignoreResp = await call(
        `/ai-requests/${suggestionIds[0]}`,
        teacherToken,
        "PATCH",
        { status: "ignored" },
      );
      assert.equal(ignoreResp.status, 200);
      assert.equal((await ignoreResp.json()).status, "ignored");

      // Conflict: subsequent transition from non-ready state returns 409
      const replayIgnore = await call(
        `/ai-requests/${suggestionIds[0]}`,
        teacherToken,
        "PATCH",
        { status: "used" },
      );
      assert.equal(replayIgnore.status, 409);

      // Transition suggestion 1 to "reported"
      const reportResp = await call(
        `/ai-requests/${suggestionIds[1]}`,
        teacherToken,
        "PATCH",
        { status: "reported" },
      );
      assert.equal(reportResp.status, 200);
      assert.equal((await reportResp.json()).status, "reported");

      // --- AI 003: Save used suggestion as Evidence (isObservation: false) ---
      const editedTeachingText = "Giáo viên chỉnh sửa: Hướng dẫn học sinh vẽ sơ đồ mạch tương đương trước khi tính R.";
      const useResp = await call(
        `/ai-requests/${suggestionIds[2]}`,
        teacherToken,
        "PATCH",
        {
          status: "used",
          editedText: editedTeachingText,
          saveAsEvidence: true,
        },
      );
      assert.equal(useResp.status, 200);
      const useJson = await useResp.json();
      assert.equal(useJson.status, "used");
      assert.equal(useJson.editedText, editedTeachingText);
      assert.ok(useJson.evidenceId);

      // Inspect created Evidence directly from DB
      const evidenceRow = await db.evidence.findUniqueOrThrow({
        where: { id: useJson.evidenceId },
      });
      assert.equal(evidenceRow.kind, "GoiYGiangDay");
      assert.equal(evidenceRow.sourceType, "ai_suggestion");
      assert.equal(evidenceRow.sourceId, suggestionIds[2]);
      assert.equal(evidenceRow.isObservation, false); // CRITICAL: must not count as student observation
      assert.equal(evidenceRow.detail, editedTeachingText);
      assert.equal(evidenceRow.studentId, student.id);

      // Verify AIRequest persisted editedText and evidenceId
      const aiReqRow = await db.aIRequest.findUniqueOrThrow({
        where: { id: suggestionIds[2] },
      });
      assert.equal(aiReqRow.editedText, editedTeachingText);
      assert.equal(aiReqRow.evidenceId, evidenceRow.id);

      // --- AI 005: Timeout, Provider Failure & Circuit Breaker ---
      const adapter = getAIAdapter() as FakeAIAdapter;

      // Simulate provider timeout
      adapter.simulateTimeout = true;
      const timeoutResp = await call(
        `/sessions/${sessionId}/ai/suggestions`,
        teacherToken,
        "POST",
        {
          studentId: student.id,
          activityId,
          kind: "explain",
          prompt: "Timeout test",
        },
      );
      assert.equal(timeoutResp.status, 503);
      assert.match((await timeoutResp.json()).error.message, /AI_TIMEOUT|AI_UNAVAILABLE/);
      adapter.simulateTimeout = false;

      // Simulate multiple provider errors to trigger circuit breaker
      adapter.simulateError = true;
      for (let i = 0; i < 3; i++) {
        await call(
          `/sessions/${sessionId}/ai/suggestions`,
          teacherToken,
          "POST",
          {
            studentId: student.id,
            activityId,
            kind: "example",
            prompt: `Error trial ${i}`,
          },
        );
      }
      adapter.simulateError = false;

      // Circuit breaker is now open
      const circuitStatusAfter = await (await call("/ai/circuit-status", teacherToken)).json();
      assert.equal(circuitStatusAfter.circuitOpen, true);
      assert.ok(circuitStatusAfter.consecutiveFailures >= 3);

      // Fast rejection when circuit is open
      const fastFailResp = await call(
        `/sessions/${sessionId}/ai/suggestions`,
        teacherToken,
        "POST",
        {
          studentId: student.id,
          activityId,
          kind: "explain",
          prompt: "Circuit open test",
        },
      );
      assert.equal(fastFailResp.status, 503);
      assert.match((await fastFailResp.json()).error.message, /gián đoạn|circuit/i);

      // Reset circuit for clean state
      adapter.recordSuccess();

      // --- AI 004: Post-session Sourced Pending Claims ---
      // Before ending session, AI claims drafting returns 409 (must be post-session)
      const earlyClaims = await call(
        `/sessions/${sessionId}/ai/claims-draft`,
        teacherToken,
        "POST",
        { studentId: student.id },
      );
      assert.equal(earlyClaims.status, 409);

      // Start and End session
      await call(`/sessions/${sessionId}/start`, teacherToken, "POST", {});
      await call(`/sessions/${sessionId}/end`, teacherToken, "POST", {});

      // 0-observation guard: Currently, the only evidence in session is GoiYGiangDay (isObservation: false).
      // AI claim draft MUST return 0 claims and NOT fabricate competence claims!
      const zeroObsResp = await call(
        `/sessions/${sessionId}/ai/claims-draft`,
        teacherToken,
        "POST",
        { studentId: student.id },
      );
      assert.equal(zeroObsResp.status, 200);
      const zeroObsJson = await zeroObsResp.json();
      assert.deepEqual(zeroObsJson.claims, []);
      assert.match(zeroObsJson.summary, /Chưa có minh chứng quan sát thực tế/);

      // Now add a real student observation evidence
      const noteObs = await call(`/sessions/${sessionId}/evidence`, teacherToken, "POST", {
        studentId: student.id,
        activityId,
        title: "Giải đúng bài tập 1",
        detail: "Tự tính đúng điện trở tương đương Rtd = 10 Ohm",
        support: "DocLap",
        kind: "GhiChu",
      });
      assert.equal(noteObs.status, 201);
      const noteObsId = (await noteObs.json()).evidence.id;

      // Now trigger AI claims draft post-session
      const draftResp = await call(
        `/sessions/${sessionId}/ai/claims-draft`,
        teacherToken,
        "POST",
        { studentId: student.id, prompt: "Đánh giá khả năng tính toán độc lập" },
      );
      assert.equal(draftResp.status, 201);
      const draftJson = await draftResp.json();
      assert.ok(draftJson.claims.length > 0);
      assert.equal(draftJson.claims[0].status, "pending");
      assert.equal(draftJson.claims[0].revision, 1);
      // Validated returned evidence refs
      assert.ok(draftJson.claims[0].evidenceIds.includes(noteObsId));

      // Verify claim exists in database and is pending
      const createdClaim = await db.claim.findUniqueOrThrow({
        where: { id: draftJson.claims[0].id },
      });
      assert.equal(createdClaim.status, "pending");
      assert.equal(createdClaim.studentId, student.id);
      assert.deepEqual(createdClaim.evidenceIds, [noteObsId]);

      // --- AI 006: Context Minimization / Sanitization Unit Verification ---
      const piiText = "Học sinh Nguyễn Văn AI Test có token Bearer secret_token_1234567890123456789012345 và email test@example.com truy cập https://s3.bucket.internal/presigned-url?sig=abc";
      const sanitized = sanitizeContext(piiText, ["Nguyễn Văn AI Test"]);
      assert.ok(!sanitized.includes("Nguyễn Văn AI Test"), "Personal name must be stripped");
      assert.ok(!sanitized.includes("secret_token"), "Bearer token must be stripped");
      assert.ok(!sanitized.includes("test@example.com"), "Email must be stripped");
      assert.ok(!sanitized.includes("https://"), "URL must be stripped");
      assert.ok(sanitized.includes("[học sinh]"));
      assert.ok(sanitized.includes("[credential removed]"));
      assert.ok(sanitized.includes("[email removed]"));
      assert.ok(sanitized.includes("[link removed]"));

      // Sanitize error message test
      const rawError = "API error with key AIzaSyA123456789012345678901234567890 at https://api.internal/v1";
      const cleanErr = sanitizeErrorMessage(rawError);
      assert.ok(!cleanErr.includes("AIzaSyA"));
      assert.ok(!cleanErr.includes("https://"));

      // --- Backward Compatibility: Plan Suggestions ---
      // Approve the pending claim
      await db.claim.update({
        where: { id: createdClaim.id },
        data: { status: "approved", reviewedAt: new Date() },
      });

      // Create a draft session for lesson planning
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

      // Enable AI for plan suggestion test
      process.env.ENABLE_AI = "true";
      const planResp = await call(
        `/sessions/${planSession.id}/ai/plan-suggestions`,
        teacherToken,
        "POST",
        { studentId: student.id },
      );
      assert.equal(planResp.status, 201);
      const planJson = await planResp.json();
      assert.ok(planJson.suggestion);
      assert.equal(planJson.suggestion.status, "ready");
      assert.ok(planJson.suggestion.text.length > 10);
      assert.ok(planJson.suggestion.sources.length > 0);
    } finally {
      server.close();
    }
  },
);
