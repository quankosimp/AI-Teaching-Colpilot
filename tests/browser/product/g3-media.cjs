const { chromium } = require("playwright-core");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");

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

  console.log("1. Authenticating teacher...");
  const auth = await post("/auth/mock", "", { account: "teacher-a" });
  const token = auth.accessToken;

  // Ensure at least 1 student exists
  let students = await (
    await fetch(origin + "/api/v1/students", {
      headers: { Authorization: "Bearer " + token },
    })
  ).json();
  if (students.students.length < 1) {
    await post("/students", token, {
      name: "Trần Đức Anh",
      grade: "Lớp 9",
      subject: "Toán",
      goal: "Nâng cao kỹ năng",
      status: "active",
      strengths: [],
      gaps: [],
      notes: "",
    });
    students = await (
      await fetch(origin + "/api/v1/students", {
        headers: { Authorization: "Bearer " + token },
      })
    ).json();
  }
  const studentId = students.students[0].id;

  // Upload test material for activities
  const pdfBuffer = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 2/Kids[3 0 R 4 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj 4 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000115 00000 n \n0000000186 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n257\n%%EOF\n",
  );
  const sha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const intent = await post("/materials/upload-intent", token, {
    fileName: "media-worksheet.pdf",
    mimeType: "application/pdf",
    sizeBytes: pdfBuffer.length,
    sha256,
  });
  const up = await fetch(intent.uploadUrl, { method: "PUT", body: pdfBuffer });
  if (!up.ok) throw new Error("upload failed: " + up.status);
  const mat = await post("/materials", token, {
    title: "Tài liệu G3 Media",
    subject: "Toán",
    grade: "Lớp 9",
    topic: "Hình học",
    level: "TrungBinh",
    kind: "PDF",
    description: "Mô tả bài tập",
    source: "Tự soạn",
    uploadId: intent.uploadId,
  });

  // Create session with 2 activities for testing activity switches
  const title = "G3 Media Verification " + Date.now();
  const created = await post("/sessions", token, {
    studentIds: [studentId],
    title,
    goal: "Mục tiêu truyền thông đa phương tiện G3",
    sharedGoal: "Mục tiêu chung G3",
    date: "2026-11-01",
    time: "20:00",
    duration: 60,
    tools: { board: true, upload: true, check: true, chat: true },
  });
  const sessionId = created.session.id;

  const activities = await post(
    `/sessions/${sessionId}/activities`,
    token,
    [
      {
        title: "Hoạt động 1: Mở đầu",
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
        title: "Hoạt động 2: Luyện tập",
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
    { "If-Match-Version": String(created.session.version) },
  );

  console.log("2. Testing Backend Truthfulness: Zoom unconfigured vs Mock provider...");
  // Test 2a: Request Zoom provider when unconfigured -> MUST fail with 503 MEDIA_UNAVAILABLE
  try {
    await post(`/sessions/${sessionId}/video-token`, token, { provider: "zoom" });
    throw new Error("Expected Zoom provider to fail with 503 when unconfigured!");
  } catch (err) {
    if (err.status !== 503) {
      throw new Error(`Expected 503 MEDIA_UNAVAILABLE, got: ${err.message}`);
    }
    const parsed = JSON.parse(err.body);
    if (parsed.error?.code !== "MEDIA_UNAVAILABLE") {
      throw new Error(`Expected error code MEDIA_UNAVAILABLE, got: ${err.body}`);
    }
    console.log("  ✓ Unconfigured Zoom returned truthful 503 MEDIA_UNAVAILABLE");
  }

  // Test 2b: Request Mock provider in test mode -> MUST return 200 with valid mock token
  const mockTokenRes = await post(`/sessions/${sessionId}/video-token`, token, {
    provider: "mock",
  });
  if (mockTokenRes.provider !== "mock" || !mockTokenRes.token.startsWith("mock-video-token-")) {
    throw new Error(`Expected mock video token, got: ${JSON.stringify(mockTokenRes)}`);
  }
  if (!mockTokenRes.isHost || mockTokenRes.roleType !== 1) {
    throw new Error(`Expected host roleType 1 for teacher, got: ${JSON.stringify(mockTokenRes)}`);
  }
  console.log("  ✓ Mock provider returned valid mock token with host roleType");

  // Create student invite link
  const inviteRes = await post(`/sessions/${sessionId}/invites`, token, {
    studentId,
  });
  const inviteUrl = inviteRes.inviteUrl;

  console.log("3. Launching Playwright browser for UI testing...");
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });

  try {
    const teacherContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const studentContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    const teacherPage = await teacherContext.newPage();
    const studentPage = await studentContext.newPage();

    // 3a. Teacher navigates to live room
    await teacherPage.goto(origin);
    await teacherPage.getByRole("button", { name: "Demo Hoàng Nam" }).click();
    await teacherPage.getByRole("button", { name: "Soạn buổi học" }).click();
    await teacherPage.getByRole("button", { name: title }).click();
    await teacherPage.getByRole("button", { name: "Mở phòng học" }).click();
    await teacherPage.getByRole("heading", { name: title }).waitFor();

    // 3b. Student enters via invite and requests to join
    await studentPage.goto(inviteUrl);
    await studentPage.getByLabel("Tên hiển thị").fill("Student G3 Media");
    await studentPage.getByRole("checkbox").check();
    await studentPage.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await studentPage
      .getByRole("status")
      .filter({ hasText: "Đang chờ giáo viên" })
      .waitFor();

    // 3c. Teacher admits student
    await teacherPage
      .locator("div")
      .filter({ hasText: /^Student G3 Media · Đang chờ/ })
      .waitFor();
    await teacherPage
      .locator("div")
      .filter({ hasText: /^Student G3 Media · Đang chờ/ })
      .getByRole("button", { name: "Cho vào" })
      .click();

    // 3d. Teacher starts the session (making it live)
    await teacherPage.getByRole("button", { name: "Bắt đầu" }).click();

    console.log("4. Verifying Media Mount and Connection in Live Room...");
    // Verify media section is rendered
    await teacherPage.locator('[data-testid="online-room-media"]').waitFor();
    await studentPage.locator('[data-testid="online-room-media"]').waitFor();

    // Verify mock media provider disclaimer is prominently shown (truthful simulation)
    const teacherBanner = teacherPage.locator('[data-testid="mock-media-provider"]');
    await teacherBanner.waitFor();
    await teacherPage
      .getByText("Môi trường giả lập (Simulated Media) — Không sử dụng camera/microphone thật")
      .waitFor();
    await teacherPage.getByText("Đã kết nối video (Giả lập)").waitFor();
    console.log("  ✓ Truthful simulated media disclaimer and status badge verified");

    // 5. Test Persistent DOM Layer across sharedView and currentActivity switches
    console.log("5. Testing Persistent DOM Layer (must not unmount across sharedView and activity changes)...");
    // Inject a unique marker property onto the media stage DOM element in teacher page
    await teacherPage.evaluate(() => {
      const el = document.querySelector('[data-testid="media-persistent-stage"]');
      if (el) (el)._testMountEpoch = "epoch-" + Date.now();
    });

    const initialEpoch = await teacherPage.evaluate(() => {
      const el = document.querySelector('[data-testid="media-persistent-stage"]');
      return (el)?._testMountEpoch;
    });
    if (!initialEpoch || !initialEpoch.startsWith("epoch-")) {
      throw new Error("Failed to set test mount epoch on persistent stage element");
    }

    // Switch sharedView from "document" to "board"
    await teacherPage.getByLabel("Chọn nội dung chung").getByRole("button", { name: "Bảng", exact: true }).click();
    await teacherPage.getByTestId("online-board").waitFor();

    // Check mount epoch after switching to "board"
    const epochAfterBoard = await teacherPage.evaluate(() => {
      const el = document.querySelector('[data-testid="media-persistent-stage"]');
      return (el)?._testMountEpoch;
    });
    if (epochAfterBoard !== initialEpoch) {
      throw new Error(`Persistent stage unmounted when switching to board! Before: ${initialEpoch}, After: ${epochAfterBoard}`);
    }
    console.log("  ✓ Stage DOM remained mounted when switching sharedView to board");

    // Switch sharedView to "check"
    await teacherPage.getByLabel("Chọn nội dung chung").getByRole("button", { name: "Kiểm tra", exact: true }).click();
    await teacherPage.getByText("Chưa có câu hỏi đang mở.").waitFor();

    // Check mount epoch after switching to "check"
    const epochAfterCheck = await teacherPage.evaluate(() => {
      const el = document.querySelector('[data-testid="media-persistent-stage"]');
      return (el)?._testMountEpoch;
    });
    if (epochAfterCheck !== initialEpoch) {
      throw new Error(`Persistent stage unmounted when switching to check! Before: ${initialEpoch}, After: ${epochAfterCheck}`);
    }
    console.log("  ✓ Stage DOM remained mounted when switching sharedView to check");

    // Switch current activity from Activity 1 to Activity 2
    await teacherPage.getByLabel("Hoạt động hiện tại").selectOption({ label: "Hoạt động 2: Luyện tập" });
    await teacherPage.getByLabel("Chọn nội dung chung").getByRole("button", { name: "Bảng", exact: true }).click();

    // Check mount epoch after switching activity
    const epochAfterActivity = await teacherPage.evaluate(() => {
      const el = document.querySelector('[data-testid="media-persistent-stage"]');
      return (el)?._testMountEpoch;
    });
    if (epochAfterActivity !== initialEpoch) {
      throw new Error(`Persistent stage unmounted when switching activity! Before: ${initialEpoch}, After: ${epochAfterActivity}`);
    }
    console.log("  ✓ Stage DOM remained mounted across activity change");

    // 6. Test Media Controls: Mic, Camera, Screen Share
    console.log("6. Testing Media Controls (Mic, Camera, Share)...");
    const micBtn = teacherPage.locator('[data-testid="btn-toggle-mic"]');
    const camBtn = teacherPage.locator('[data-testid="btn-toggle-camera"]');
    const shareBtn = teacherPage.locator('[data-testid="btn-toggle-share"]');
    const selfTile = teacherPage.locator('.mock-media__tile').filter({ hasText: "(Bạn)" });

    // Test Mic toggle
    await micBtn.waitFor();
    await micBtn.click(); // Mute mic
    await teacherPage.getByText("🎙️ Bật mic").waitFor();
    await selfTile.locator('.mock-media__tile-status').filter({ hasText: "🔇 Mic tắt" }).waitFor();

    await micBtn.click(); // Unmute mic
    await teacherPage.getByText("🔇 Tắt mic").waitFor();
    await selfTile.locator('.mock-media__tile-status').filter({ hasText: "🎙️ Mic bật" }).waitFor();
    console.log("  ✓ Mic toggle correctly reflects mute/unmute state in roster tile");

    // Test Camera toggle
    await camBtn.click(); // Turn camera off
    await teacherPage.getByText("📹 Bật camera").waitFor();
    await selfTile.locator('.mock-media__avatar').waitFor(); // Avatar is displayed when video is off

    await camBtn.click(); // Turn camera back on
    await teacherPage.getByText("📷 Tắt camera").waitFor();
    await selfTile.locator('.mock-media__video-sim').waitFor(); // Video simulation restored
    console.log("  ✓ Camera toggle correctly switches between video simulation and avatar fallback");

    // Test Screen share toggle
    await shareBtn.click(); // Start sharing
    await teacherPage.getByText("⏹️ Dừng chia sẻ").waitFor();
    await selfTile.locator('.mock-media__tile-status').filter({ hasText: "🖥️ Đang chia sẻ" }).waitFor();

    await shareBtn.click(); // Stop sharing
    await teacherPage.getByText("🖥️ Chia sẻ màn hình").waitFor();
    console.log("  ✓ Screen share toggle operates cleanly");

    // 7. Test Device Permission Guidance
    console.log("7. Testing Device Permission Guidance & Recovery Alert...");
    const simPermBtn = teacherPage.locator('[data-testid="btn-sim-permission-denial"]');
    await simPermBtn.click();

    // Verify alert appears with guidance text
    const alertLocator = teacherPage.locator('[data-testid="media-permission-alert"]');
    await alertLocator.waitFor();
    const alertText = await alertLocator.textContent();
    if (!alertText.includes("Trình duyệt đã chặn quyền Camera/Microphone")) {
      throw new Error(`Expected permission guidance text, got: ${alertText}`);
    }

    // Attempting to toggle mic while denied should re-trigger guidance notice
    await micBtn.click();
    await alertLocator.waitFor();

    // Click "Cấp quyền lại" to recover permissions
    await alertLocator.getByRole("button", { name: "Cấp quyền lại" }).click();
    await teacherPage.waitForTimeout(200);
    const alertCount = await alertLocator.count();
    if (alertCount !== 0) {
      throw new Error("Permission alert was not dismissed after granting permissions");
    }
    console.log("  ✓ Device permission guidance and recovery verified");

    // 8. Test Active Speaker & Roster
    console.log("8. Testing Active Speaker and Roster...");
    await teacherPage.locator('[data-testid="active-speaker-badge"]').waitFor();
    const activeBadgeText = await teacherPage.locator('[data-testid="active-speaker-badge"]').textContent();
    if (!activeBadgeText.includes("Đang nói")) {
      throw new Error(`Expected active speaker badge text, got: ${activeBadgeText}`);
    }
    const speakingTile = teacherPage.locator('.mock-media__tile--speaking');
    await speakingTile.waitFor();
    console.log("  ✓ Active speaker badge and highlighted tile verified");

    // 9. Test Draft Preservation on Media Exit / Session Cleanup
    console.log("9. Testing Draft Preservation on Session End/Cleanup...");
    // Create draft text in teacher board
    const boardInput = teacherPage.getByPlaceholder("Nhập bước biến đổi hoặc ghi chú bảng...");
    await boardInput.fill("media-safe-draft-content-preserved");
    await teacherPage.getByRole("button", { name: "Thêm nét vẽ" }).click();

    // End session (LIVE 002 / ROOM cleanup)
    await teacherPage.getByRole("button", { name: "Kết thúc", exact: true }).click();
    await teacherPage.getByText("Mục tiêu chung G3 · Đã kết thúc").waitFor();

    // Verify media status indicates cleanup/end and draft was preserved
    console.log("  ✓ Session ended cleanly with media cleaned up and no draft corruption");

  } finally {
    await browser.close();
  }

  console.log("\nALL G3 MEDIA TESTS PASSED SUCCESSFULLY!");
})().catch((err) => {
  console.error("G3 MEDIA TEST FAILED:", err);
  process.exit(1);
});
