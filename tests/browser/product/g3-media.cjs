const { chromium } = require("playwright-core");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

(async () => {
  const origin = new URL(
    process.env.BROWSER_BASE_URL || "http://127.0.0.1:3141",
  ).origin;
  const artifacts =
    process.env.BROWSER_ARTIFACT_DIR || "/tmp/copilot-browser-test";
  await fs.mkdir(artifacts, { recursive: true });

  const post = async (path, token, body, method = "POST", extra = {}) => {
    const r = await fetch(origin + "/api/v1" + path, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...extra,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const errText = await r.text();
      const err = new Error(path + " " + r.status + " " + errText);
      err.status = r.status;
      err.body = errText;
      throw err;
    }
    return r.json();
  };

  console.log("=== 1. UNIT & CONTRACT-SPY TESTS: Zoom Video SDK Adapter (SG3-01) ===");
  // We launch a headless browser to test createZoomSession with our record/replay mock UIToolkit
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });

  try {
    const unitPage = await browser.newPage();
    await unitPage.goto(origin);

    const spyResult = await unitPage.evaluate(async () => {
      // Build a strict contract spy for @zoom/videosdk-ui-toolkit matching installed 2.6.0-1 behavior
      let isConfigured = false;
      const calls = [];
      const listeners = {};
      let audioMuted = false;
      let videoOn = false;
      let sharing = false;

      const mediaStream = {
        muteAudio: async () => {
          calls.push("mediaStream.muteAudio");
          audioMuted = true;
        },
        unmuteAudio: async () => {
          calls.push("mediaStream.unmuteAudio");
          audioMuted = false;
        },
        startAudio: async () => {
          calls.push("mediaStream.startAudio");
          audioMuted = false;
        },
        startVideo: async () => {
          calls.push("mediaStream.startVideo");
          videoOn = true;
        },
        stopVideo: async () => {
          calls.push("mediaStream.stopVideo");
          videoOn = false;
        },
        startShareScreen: async () => {
          calls.push("mediaStream.startShareScreen");
          sharing = true;
        },
        stopShareScreen: async () => {
          calls.push("mediaStream.stopShareScreen");
          sharing = false;
        },
      };

      const client = {
        getSessionInfo: () => ({ isInMeeting: true }),
        getCurrentUserInfo: () => ({
          userId: 1001,
          displayName: "Teacher Host",
          muted: audioMuted,
          bAudioOn: !audioMuted,
          bVideoOn: videoOn,
          bShareOn: sharing,
        }),
        getAllUser: () => [
          {
            userId: 1001,
            displayName: "Teacher Host",
            isHost: true,
            muted: audioMuted,
            bAudioOn: !audioMuted,
            bVideoOn: videoOn,
            bShareOn: sharing,
          },
          {
            userId: 1002,
            displayName: "Student Peer",
            isHost: false,
            muted: true,
            bAudioOn: false,
            bVideoOn: true,
            bShareOn: false,
          },
        ],
        getMediaStream: () => mediaStream,
      };

      const mockToolkit = {
        joinSession: async (container, config) => {
          calls.push("joinSession");
          isConfigured = true;
        },
        leaveSession: async () => {
          calls.push("leaveSession");
          isConfigured = false;
        },
        closeSession: async (container) => {
          calls.push("closeSession");
        },
        getClient: () => client,
        getCurrentUserInfo: () => client.getCurrentUserInfo(),
        getAllUser: () => client.getAllUser(),
        onSessionJoined: (cb) => {
          if (!isConfigured) {
            throw new Error(
              "UIToolkit config is required. Call joinSession method first",
            );
          }
          calls.push("onSessionJoined");
        },
        offSessionJoined: (cb) => {
          calls.push("offSessionJoined");
        },
        onSessionClosed: (cb) => {
          if (!isConfigured) {
            throw new Error(
              "UIToolkit config is required. Call joinSession method first",
            );
          }
          calls.push("onSessionClosed");
        },
        offSessionClosed: (cb) => {
          calls.push("offSessionClosed");
        },
        on: (event, cb) => {
          if (!isConfigured) {
            throw new Error(
              "UIToolkit config is required. Call joinSession method first",
            );
          }
          calls.push("on:" + event);
          if (!listeners[event]) listeners[event] = new Set();
          listeners[event].add(cb);
        },
        off: (event, cb) => {
          calls.push("off:" + event);
          listeners[event]?.delete(cb);
        },
      };

      // Import createZoomSession from compiled bundle
      const { createZoomSession } = await import("/src/product/media/zoomAdapter.ts");

      // Verify that calling .on before joinSession throws the exact error
      let caughtPrematureError = false;
      try {
        mockToolkit.on("test", () => {});
      } catch (e) {
        if (e.message.includes("Call joinSession method first")) {
          caughtPrematureError = true;
        }
      }

      const container = document.createElement("div");
      document.body.appendChild(container);

      // Create Zoom session with spy override
      const handle = await createZoomSession(
        container,
        {
          provider: "zoom",
          token: "spy-jwt-token",
          topic: "spy-topic",
          sessionName: "spy-topic",
          userName: "Teacher Host",
          userId: "teacher-1001",
          isHost: true,
          roleType: 1,
        },
        mockToolkit,
      );

      // Verify join call happened BEFORE listener registration
      const joinIdx = calls.indexOf("joinSession");
      const onConnectionIdx = calls.indexOf("on:connection-change");
      const registrationOrderedCorrectly =
        joinIdx !== -1 && onConnectionIdx !== -1 && joinIdx < onConnectionIdx;

      // Verify initial participants mapped from getAllUser
      const participants = handle.getParticipants();
      const hostUser = participants.find((p) => p.name === "Teacher Host");
      const peerUser = participants.find((p) => p.name === "Student Peer");

      // Test real media stream invocations:
      // 1. Mute Audio
      await handle.toggleAudio(true);
      const muteAudioCalled = calls.includes("mediaStream.muteAudio");

      // 2. Unmute Audio
      await handle.toggleAudio(false);
      const unmuteAudioCalled =
        calls.includes("mediaStream.unmuteAudio") ||
        calls.includes("mediaStream.startAudio");

      // 3. Start Video
      await handle.toggleVideo(true);
      const startVideoCalled = calls.includes("mediaStream.startVideo");

      // 4. Stop Video
      await handle.toggleVideo(false);
      const stopVideoCalled = calls.includes("mediaStream.stopVideo");

      // 5. Start Share
      await handle.toggleShare(true);
      const startShareCalled = calls.includes("mediaStream.startShareScreen");

      // 6. Stop Share
      await handle.toggleShare(false);
      const stopShareCalled = calls.includes("mediaStream.stopShareScreen");

      // 7. Active speaker event array mapping
      let activeSpeakerFired = null;
      handle.on("active-speaker-change", (spk) => {
        activeSpeakerFired = spk;
      });
      listeners["active-speaker"]?.forEach((cb) => cb([{ userId: 1002, displayName: "Student Peer" }]));

      // 8. Error handling when mediaStream fails (never fake success)
      mediaStream.muteAudio = async () => {
        throw new Error("Device audio hardware failed");
      };
      let errorPropagated = false;
      let emittedError = null;
      handle.on("error", (err) => {
        emittedError = err;
      });
      try {
        await handle.toggleAudio(true);
      } catch (err) {
        if (err.message.includes("Device audio hardware failed")) {
          errorPropagated = true;
        }
      }

      // 9. Leave & Destroy cleanup
      await handle.destroy();
      const leaveCalled = calls.includes("leaveSession");
      const closeCalled = calls.includes("closeSession");
      const offCalled = calls.some((c) => c.startsWith("off:"));

      return {
        calls,
        caughtPrematureError,
        registrationOrderedCorrectly,
        hasHost: Boolean(hostUser?.isHost),
        hasPeer: Boolean(peerUser && !peerUser.isHost),
        muteAudioCalled,
        unmuteAudioCalled,
        startVideoCalled,
        stopVideoCalled,
        startShareCalled,
        stopShareCalled,
        activeSpeakerFired,
        errorPropagated,
        emittedError,
        leaveCalled,
        closeCalled,
        offCalled,
        statusAfterDestroy: handle.getStatus(),
      };
    });

    console.log("Recorded calls:", spyResult.calls);
    if (!spyResult.caughtPrematureError) {
      throw new Error("Failed: Mock UIToolkit did not enforce joinSession before registration");
    }
    if (!spyResult.registrationOrderedCorrectly) {
      throw new Error("Failed: createZoomSession did not invoke joinSession before registering listeners");
    }
    if (!spyResult.hasHost || !spyResult.hasPeer) {
      throw new Error("Failed: Participant roster mapping from SDK getAllUser was incorrect");
    }
    if (!spyResult.muteAudioCalled || !spyResult.unmuteAudioCalled) {
      throw new Error("Failed: Audio toggle did not invoke mediaStream.muteAudio / unmuteAudio");
    }
    if (!spyResult.startVideoCalled || !spyResult.stopVideoCalled) {
      throw new Error("Failed: Video toggle did not invoke mediaStream.startVideo / stopVideo");
    }
    if (!spyResult.startShareCalled || !spyResult.stopShareCalled) {
      throw new Error("Failed: Share toggle did not invoke mediaStream.startShareScreen / stopShareScreen");
    }
    if (spyResult.activeSpeakerFired !== "1002") {
      throw new Error(`Failed: Active speaker mapping failed, expected '1002', got: ${spyResult.activeSpeakerFired}`);
    }
    if (!spyResult.errorPropagated || !spyResult.emittedError?.includes("Device audio hardware failed")) {
      throw new Error("Failed: MediaStream failure was not propagated as an error");
    }
    if (!spyResult.leaveCalled || !spyResult.closeCalled || !spyResult.offCalled) {
      throw new Error("Failed: destroy did not call leaveSession, closeSession, and listener unregistration");
    }
    if (spyResult.statusAfterDestroy !== "disconnected") {
      throw new Error(`Failed: status after destroy should be disconnected, got: ${spyResult.statusAfterDestroy}`);
    }
    console.log("  ✓ SG3-01: Zoom Video SDK contract-spy and mediaStream operations verified successfully");

    console.log("=== 2. UNIT TESTS: Mock Provider XSS & Timer Neutralization (SG3-03) ===");
    const mockProbeResult = await unitPage.evaluate(async () => {
      const { createMockSession } = await import("/src/product/media/mockProvider.ts");
      const container = document.createElement("div");
      container.id = "mock-xss-test";
      document.body.appendChild(container);

      // Malicious student name with img onerror and script tags
      const maliciousName = '<img src="data:," onerror="window.__mockXssInjected=1">Student <script>window.__scriptInjected=1</script>';
      const handle = await createMockSession(container, {
        provider: "mock",
        token: "mock-token",
        topic: "topic-1",
        sessionName: "topic-1",
        userName: maliciousName,
        userId: "user-malicious",
        isHost: false,
      });

      await new Promise((r) => setTimeout(r, 150));
      const xssInjected = window.__mockXssInjected === 1;
      const scriptInjected = window.__scriptInjected === 1;
      const injectedImgCount = container.querySelectorAll("img").length;
      const tileNameText = container.querySelector(".mock-media__tile-name")?.textContent || "";

      // Test destroy timer clearing (supervisor probe #2)
      const lateContainer = document.createElement("div");
      document.body.appendChild(lateContainer);
      const lateHandle = await createMockSession(lateContainer, {
        provider: "mock",
        token: "mock-token-2",
        topic: "topic-2",
        sessionName: "topic-2",
        userName: "Late Student",
        userId: "user-late",
        isHost: false,
      });
      await lateHandle.destroy();
      const statusImmediatelyAfter = lateHandle.getStatus();
      await new Promise((r) => setTimeout(r, 150));
      const statusAfterTimer = lateHandle.getStatus();

      return {
        xssInjected,
        scriptInjected,
        injectedImgCount,
        tileNameText,
        statusImmediatelyAfter,
        statusAfterTimer,
      };
    });

    if (mockProbeResult.xssInjected || mockProbeResult.scriptInjected) {
      throw new Error("Failed SG3-03: Malicious student name executed XSS script/onerror handler!");
    }
    if (mockProbeResult.injectedImgCount > 0) {
      throw new Error(`Failed SG3-03: Unexpected img elements injected into container: ${mockProbeResult.injectedImgCount}`);
    }
    if (!mockProbeResult.tileNameText.includes("<img")) {
      throw new Error("Failed SG3-03: Name should be rendered literally via textContent");
    }
    if (mockProbeResult.statusAfterTimer !== "disconnected") {
      throw new Error(`Failed SG3-03: Uncleared timer flipped status to '${mockProbeResult.statusAfterTimer}' after destroy!`);
    }
    console.log("  ✓ SG3-03: Mock provider XSS prevention and timer neutralization verified");

    console.log("=== 3. BACKEND TESTS: Strict Mock Guard, Provider Validation, Race Conditions (SG3-04) ===");
    const auth = await post("/auth/mock", "", { account: "teacher-a" });
    const teacherToken = auth.accessToken;

    let students = await (
      await fetch(origin + "/api/v1/students", {
        headers: { Authorization: "Bearer " + teacherToken },
      })
    ).json();
    if (students.students.length < 1) {
      await post("/students", teacherToken, {
        name: "Lê Văn Tám",
        grade: "Lớp 9",
        subject: "Toán",
        goal: "Luyện thi",
        status: "active",
        strengths: [],
        gaps: [],
        notes: "",
      });
      students = await (
        await fetch(origin + "/api/v1/students", {
          headers: { Authorization: "Bearer " + teacherToken },
        })
      ).json();
    }
    const studentId = students.students[0].id;

    // Create a live session for backend contract testing
    const testSessionTitle = "Backend Media Guard " + Date.now();
    const createdSession = await post("/sessions", teacherToken, {
      studentIds: [studentId],
      title: testSessionTitle,
      goal: "Mục tiêu bảo mật",
      sharedGoal: "Mục tiêu chung bảo mật",
      date: "2026-11-01",
      time: "20:00",
      duration: 60,
      tools: { board: true, upload: true, check: true, chat: true },
    });
    const testSessionId = createdSession.session.id;

    // Upload material and set activities
    const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n186\n%%EOF\n");
    const sha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
    const intent = await post("/materials/upload-intent", teacherToken, {
      fileName: "test.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBuffer.length,
      sha256,
    });
    await fetch(intent.uploadUrl, { method: "PUT", body: pdfBuffer });
    const mat = await post("/materials", teacherToken, {
      title: "Học liệu bảo mật",
      subject: "Toán",
      grade: "Lớp 9",
      topic: "Đại số",
      level: "TrungBinh",
      kind: "PDF",
      description: "Bài tập",
      source: "Tự soạn",
      uploadId: intent.uploadId,
    });
    await post(
      `/sessions/${testSessionId}/activities`,
      teacherToken,
      [
        {
          title: "Hoạt động 1",
          description: "Mở đầu",
          duration: 15,
          type: "KhoiDong",
          materialId: mat.material.id,
          materialVersion: 1,
          teacherNotes: null,
          sourceEvidenceIds: [],
          sourceClaimRefs: [],
        },
      ],
      "PUT",
      { "If-Match-Version": String(createdSession.session.version) },
    );

    // 3a. Calling video-token before start (when session not live) -> 409 SESSION_STATE_INVALID
    try {
      await post(`/sessions/${testSessionId}/video-token`, teacherToken, { provider: "mock" });
      throw new Error("Expected video-token to fail when session is not live!");
    } catch (e) {
      if (e.status !== 409) {
        throw new Error(`Expected 409 SESSION_STATE_INVALID before start, got: ${e.status} ${e.message}`);
      }
      console.log("  ✓ Token mint rejected when session is not live (409)");
    }

    // Start session
    await post(`/sessions/${testSessionId}/start`, teacherToken, {});

    // 3b. Provider validation: invalid provider -> 400 VALIDATION_ERROR
    try {
      await post(`/sessions/${testSessionId}/video-token`, teacherToken, { provider: "unsupported_provider" });
      throw new Error("Expected 400 for invalid provider");
    } catch (e) {
      if (e.status !== 400) {
        throw new Error(`Expected 400 VALIDATION_ERROR, got: ${e.status} ${e.message}`);
      }
      console.log("  ✓ Invalid provider choice rejected with 400 VALIDATION_ERROR");
    }

    // 3c. Zoom unconfigured -> 503 MEDIA_UNAVAILABLE
    try {
      await post(`/sessions/${testSessionId}/video-token`, teacherToken, { provider: "zoom" });
      throw new Error("Expected 503 for unconfigured zoom");
    } catch (e) {
      if (e.status !== 503) {
        throw new Error(`Expected 503 MEDIA_UNAVAILABLE, got: ${e.status}`);
      }
      console.log("  ✓ Unconfigured Zoom returns truthful 503 MEDIA_UNAVAILABLE");
    }

    // 3d. Verify teacher mock token
    const teacherMockToken = await post(`/sessions/${testSessionId}/video-token`, teacherToken, { provider: "mock" });
    if (teacherMockToken.provider !== "mock" || teacherMockToken.roleType !== 1) {
      throw new Error(`Invalid teacher mock token response: ${JSON.stringify(teacherMockToken)}`);
    }

    // 3e. Student invite, admission, and grant
    const invite = await post(`/sessions/${testSessionId}/invites`, teacherToken, { studentId });
    const rawToken = invite.inviteUrl.split("invite=")[1];
    const joinAuth = await post("/room/join-request", "", {
      token: rawToken,
      name: "Student Test",
      consent: true,
    });
    const studentAccessToken = joinAuth.accessToken;
    const memberId = joinAuth.memberId;
    await post(`/sessions/${testSessionId}/members/${memberId}/admit`, teacherToken, {});

    // Student video-token request
    const studentMockToken = await post(`/sessions/${testSessionId}/video-token`, studentAccessToken, { provider: "mock" });
    if (studentMockToken.provider !== "mock" || studentMockToken.roleType !== 0) {
      throw new Error(`Invalid student mock token response: ${JSON.stringify(studentMockToken)}`);
    }
    console.log("  ✓ Student video-token returned valid participant roleType (0)");

    // 3f. Revoke-wins race: revoke student invite/session, then student requests token -> 401 or 403
    await post(`/sessions/${testSessionId}/invites/${invite.invite.id}/revoke`, teacherToken, {});
    try {
      await post(`/sessions/${testSessionId}/video-token`, studentAccessToken, { provider: "mock" });
      throw new Error("Expected video-token to fail after student session was revoked!");
    } catch (e) {
      if (e.status !== 401 && e.status !== 403) {
        throw new Error(`Expected 401 or 403 for revoked student, got: ${e.status} ${e.message}`);
      }
      console.log("  ✓ Revoke-wins race test: revoked student token request blocked (401/403)");
    }

    // 3g. End-wins race: end session, then teacher requests token -> 409 SESSION_STATE_INVALID
    await post(`/sessions/${testSessionId}/end`, teacherToken, {});
    try {
      await post(`/sessions/${testSessionId}/video-token`, teacherToken, { provider: "mock" });
      throw new Error("Expected video-token to fail after session ended!");
    } catch (e) {
      if (e.status !== 409) {
        throw new Error(`Expected 409 SESSION_STATE_INVALID after end, got: ${e.status} ${e.message}`);
      }
      console.log("  ✓ End-wins race test: token request after session end returned 409 SESSION_STATE_INVALID");
    }
    console.log("  ✓ SG3-04: Strict mock guard, provider validation, and atomic race protections verified");

    console.log("=== 4. INTEGRATION BROWSER TEST: MediaHost Lifecycle, No Token Churn, Dynamic Header Status (SG3-02, SG3-05) ===");
    // Create new session for multi-client UI test
    const uiSessionTitle = "UI Media Integration " + Date.now();
    const uiSessionCreated = await post("/sessions", teacherToken, {
      studentIds: [studentId],
      title: uiSessionTitle,
      goal: "Mục tiêu trực quan",
      sharedGoal: "Mục tiêu chung trực quan",
      date: "2026-11-01",
      time: "20:00",
      duration: 60,
      tools: { board: true, upload: true, check: true, chat: true },
    });
    const uiSessionId = uiSessionCreated.session.id;

    await post(
      `/sessions/${uiSessionId}/activities`,
      teacherToken,
      [
        {
          title: "Hoạt động 1: Khởi động",
          description: "Khởi động",
          duration: 15,
          type: "KhoiDong",
          materialId: mat.material.id,
          materialVersion: 1,
          teacherNotes: null,
          sourceEvidenceIds: [],
          sourceClaimRefs: [],
        },
        {
          title: "Hoạt động 2: Thực hành",
          description: "Thực hành",
          duration: 30,
          type: "LuyenTap",
          materialId: mat.material.id,
          materialVersion: 1,
          teacherNotes: null,
          sourceEvidenceIds: [],
          sourceClaimRefs: [],
        },
      ],
      "PUT",
      { "If-Match-Version": String(uiSessionCreated.session.version) },
    );

    const uiInvite = await post(`/sessions/${uiSessionId}/invites`, teacherToken, { studentId });

    const teacherContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const studentContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const teacherPage = await teacherContext.newPage();
    const studentPage = await studentContext.newPage();

    // Track network token requests on teacher page to verify ZERO token churn
    let teacherVideoTokenRequestCount = 0;
    teacherPage.on("request", (req) => {
      if (req.url().includes("/video-token")) {
        teacherVideoTokenRequestCount++;
      }
    });

    // 4a. Teacher loads room
    await teacherPage.goto(origin);
    await teacherPage.getByRole("button", { name: "Demo Hoàng Nam" }).click();
    await teacherPage.getByRole("button", { name: "Soạn buổi học" }).click();
    await teacherPage.getByRole("button", { name: uiSessionTitle }).click();
    await teacherPage.getByRole("button", { name: "Mở phòng học" }).click();
    await teacherPage.getByRole("heading", { name: uiSessionTitle }).waitFor();

    // Verify initial header status before session is live
    await teacherPage.getByText(/Video:\s*(chưa cấu hình|chưa kết nối)/).waitFor();

    // 4b. Student requests entry
    await studentPage.goto(uiInvite.inviteUrl);
    await studentPage.getByLabel("Tên hiển thị").fill("Student UI Media");
    await studentPage.getByRole("checkbox").check();
    await studentPage.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await studentPage.getByRole("status").filter({ hasText: "Đang chờ giáo viên" }).waitFor();

    // 4c. Teacher admits student and starts session
    await teacherPage.locator("div").filter({ hasText: /^Student UI Media · Đang chờ/ }).waitFor();
    await teacherPage.locator("div").filter({ hasText: /^Student UI Media · Đang chờ/ }).getByRole("button", { name: "Cho vào" }).click();
    await teacherPage.getByRole("button", { name: "Bắt đầu" }).click();

    // 4d. Verify MediaHost connects and Header updates dynamically (SG3-05)
    await teacherPage.locator('[data-testid="online-room-media"]').waitFor();
    await teacherPage.getByText("Đã kết nối video (Giả lập)").waitFor();
    // Dynamic header check
    await teacherPage.getByText(/Video:\s*đã kết nối \(giả lập\)/).waitFor();
    console.log("  ✓ SG3-05: Dynamic header truthfully reflects media status 'Video: đã kết nối (giả lập)'");

    // Verify 'Kiểm tra chặn quyền' is rendered in mock mode
    await teacherPage.locator('[data-testid="btn-sim-permission-denial"]').waitFor();

    // 4e. Test Persistent DOM Stage and ZERO token churn across sharedView and activity changes (SG3-02)
    await teacherPage.evaluate(() => {
      const el = document.querySelector('[data-testid="media-persistent-stage"]');
      if (el) el._mountEpoch = "persistent-" + Date.now();
    });
    const mountEpoch = await teacherPage.evaluate(() => {
      return document.querySelector('[data-testid="media-persistent-stage"]')?._mountEpoch;
    });

    const tokenCountBeforeSwitches = teacherVideoTokenRequestCount;

    // Switch sharedView: document -> board
    await teacherPage.getByLabel("Chọn nội dung chung").getByRole("button", { name: "Bảng", exact: true }).click();
    await teacherPage.getByTestId("online-board").waitFor();

    // Switch sharedView: board -> check
    await teacherPage.getByLabel("Chọn nội dung chung").getByRole("button", { name: "Kiểm tra", exact: true }).click();
    await teacherPage.getByText("Chưa có câu hỏi đang mở.").waitFor();

    // Switch Activity: Hoạt động 1 -> Hoạt động 2
    await teacherPage.getByLabel("Hoạt động hiện tại").selectOption({ label: "Hoạt động 2: Thực hành" });
    await teacherPage.getByLabel("Chọn nội dung chung").getByRole("button", { name: "Bảng", exact: true }).click();

    // Wait for at least one 5-second polling cycle to complete
    await teacherPage.waitForTimeout(5500);

    // Verify DOM element was NOT remounted
    const mountEpochAfter = await teacherPage.evaluate(() => {
      return document.querySelector('[data-testid="media-persistent-stage"]')?._mountEpoch;
    });
    if (mountEpochAfter !== mountEpoch) {
      throw new Error(`Persistent stage unmounted! Before: ${mountEpoch}, After: ${mountEpochAfter}`);
    }

    // Verify ZERO token requests occurred during view switches and polling cycles!
    const tokenCountAfterSwitches = teacherVideoTokenRequestCount;
    if (tokenCountAfterSwitches !== tokenCountBeforeSwitches) {
      throw new Error(`SG3-02 Token Churn Detected! Requests increased from ${tokenCountBeforeSwitches} to ${tokenCountAfterSwitches}`);
    }
    console.log(`  ✓ SG3-02: Zero token churn verified! Exactly ${tokenCountBeforeSwitches} token request made despite view switches and polling.`);

    // 4f. Test Media Controls & Mute State Retention
    const micBtn = teacherPage.locator('[data-testid="btn-toggle-mic"]');
    const selfTile = teacherPage.locator('.mock-media__tile').filter({ hasText: "(Bạn)" });

    await micBtn.click(); // Mute mic
    await teacherPage.getByText("🎙️ Bật mic").waitFor();
    await selfTile.locator('.mock-media__tile-status').filter({ hasText: "🔇 Mic tắt" }).waitFor();

    // Switch view to document and back to board, verify mute state is preserved
    await teacherPage.getByLabel("Chọn nội dung chung").getByRole("button", { name: "Học liệu", exact: true }).click();
    await teacherPage.getByLabel("Chọn nội dung chung").getByRole("button", { name: "Bảng", exact: true }).click();
    await teacherPage.getByText("🎙️ Bật mic").waitFor();
    await selfTile.locator('.mock-media__tile-status').filter({ hasText: "🔇 Mic tắt" }).waitFor();
    console.log("  ✓ SG3-02: Mute state preserved across view switches");

    // 4g. Test Draft Preservation & Media Cleanup on End Session (SG3-05)
    const boardInput = teacherPage.getByPlaceholder("Nhập bước biến đổi hoặc ghi chú bảng...");
    await boardInput.fill("crucial-offline-draft-text-must-not-be-lost");

    // End session
    await teacherPage.getByRole("button", { name: "Kết thúc", exact: true }).click();
    await teacherPage.getByText("Mục tiêu chung trực quan · Đã kết thúc").waitFor();

    // Assert board draft is intact
    const boardVal = await boardInput.inputValue();
    if (boardVal !== "crucial-offline-draft-text-must-not-be-lost") {
      throw new Error(`Board draft was lost on session end! Found: ${boardVal}`);
    }

    // Assert media was cleaned up: media container empty and status changed
    const mediaContainerChildCount = await teacherPage.evaluate(() => {
      const el = document.querySelector('[data-testid="media-persistent-stage"]');
      return el ? el.children.length : 0;
    });
    if (mediaContainerChildCount !== 0) {
      throw new Error(`Media container was not emptied on session end! Child count: ${mediaContainerChildCount}`);
    }
    await teacherPage.getByText("Chưa bắt đầu video").waitFor();
    console.log("  ✓ SG3-05: Board draft strictly preserved and media stage completely cleaned up on session end");

  } finally {
    await browser.close();
  }

  console.log("\n=======================================================");
  console.log("ALL G3 SUPERVISOR MUST-FIX TESTS PASSED SUCCESSFULLY!");
  console.log("=======================================================");
})().catch((err) => {
  console.error("G3 MEDIA TEST SUITE FAILED:", err);
  process.exit(1);
});
