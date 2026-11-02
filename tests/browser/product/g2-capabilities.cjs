const { chromium } = require("playwright-core");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

(async () => {
  const origin = new URL(process.env.BROWSER_BASE_URL || "http://127.0.0.1:3141").origin;
  const artifacts = process.env.BROWSER_ARTIFACT_DIR || "/tmp/copilot-browser-test";
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
    if (!r.ok) throw Error(path + " " + r.status + " " + (await r.text()));
    return r.json();
  };

  const auth = await post("/auth/mock", "", { account: "teacher-a" });
  const token = auth.accessToken;

  // Ensure at least 2 students exist
  let students = await (
    await fetch(origin + "/api/v1/students", {
      headers: { Authorization: "Bearer " + token },
    })
  ).json();
  if (students.students.length < 2) {
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
  const ids = students.students.slice(0, 2).map((s) => s.id);

  // Upload test PDF material with 2 pages for shared stage doc tests
  const pdfBuffer = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 2/Kids[3 0 R 4 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj 4 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000115 00000 n \n0000000186 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n257\n%%EOF\n",
  );
  const sha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const intent = await post("/materials/upload-intent", token, {
    fileName: "worksheet.pdf",
    mimeType: "application/pdf",
    sizeBytes: pdfBuffer.length,
    sha256,
  });
  const up = await fetch(intent.uploadUrl, { method: "PUT", body: pdfBuffer });
  if (!up.ok) throw Error("upload failed: " + up.status);
  const mat = await post("/materials", token, {
    title: "Phiếu học tập",
    subject: "Toán",
    grade: "Lớp 9",
    topic: "Hình học",
    level: "TrungBinh",
    kind: "PDF",
    description: "Mô tả bài tập",
    source: "Tự soạn",
    uploadId: intent.uploadId,
  });

  const title = "Capabilities " + Date.now();
  const created = await post("/sessions", token, {
    studentIds: ids,
    title,
    goal: "private",
    sharedGoal: "public",
    date: "2026-11-01",
    time: "19:00",
    duration: 60,
    tools: { board: true, upload: true, check: true, chat: true },
  });
  const id = created.session.id;

  await post(
    `/sessions/${id}/activities`,
    token,
    [
      {
        title: "Phiếu học tập",
        description: "",
        duration: 10,
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

  const links = [];
  for (const studentId of ids)
    links.push(
      (await post(`/sessions/${id}/invites`, token, { studentId })).inviteUrl,
    );

  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });

  try {
    const teacher = await browser.newContext({
        viewport: { width: 1200, height: 800 },
      }),
      a = await browser.newContext({
        viewport: { width: 360, height: 800 },
        isMobile: true,
      }),
      b = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const t = await teacher.newPage(),
      p1 = await a.newPage(),
      p2 = await b.newPage();

    // Teacher navigation and room load
    await t.goto(origin);
    await t.getByRole("button", { name: "Demo Hoàng Nam" }).click();
    await t.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("button", { name: "Soạn buổi học", exact: true }).click();
    await t.getByRole("button", { name: title }).click();
    await t.route("**/api/v1/room/state?*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await t.getByRole("button", { name: "Mở phòng học" }).click();
    await t
      .getByRole("status")
      .filter({ hasText: "Đang tải phòng học" })
      .waitFor();
    await t.getByRole("heading", { name: title }).waitFor();
    await t.unroute("**/api/v1/room/state?*");

    // Student 1 & 2 enter lobby via invites
    for (const [p, link, name] of [
      [p1, links[0], "Student One"],
      [p2, links[1], "Student Two"],
    ]) {
      await p.route("**/api/v1/room/invite-preview", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.continue();
      });
      await p.goto(link);
      await p
        .getByRole("status")
        .filter({ hasText: "Đang tải thông tin tham gia" })
        .waitFor();
      await p.getByLabel("Tên hiển thị").fill(name);
      await p.unroute("**/api/v1/room/invite-preview");
      await p.getByRole("checkbox").check();
      await p.getByRole("button", { name: "Gửi yêu cầu" }).click();
      await p
        .getByRole("status")
        .filter({ hasText: "Đang chờ giáo viên" })
        .waitFor();
      if (p.url().includes("invite=")) throw Error("invite leaked in URL");
    }

    // Teacher admits both students
    await t
      .locator("div")
      .filter({ hasText: /^Student One · Đang chờ/ })
      .waitFor();
    for (const name of ["Student One", "Student Two"])
      await t
        .locator("div")
        .filter({ hasText: new RegExp("^" + name + " · Đang chờ") })
        .getByRole("button", { name: "Cho vào" })
        .click();

    // Teacher starts session (LIVE 001)
    await t.getByRole("button", { name: "Bắt đầu" }).click();
    await p1.getByText("Bảng nháp của tôi").waitFor();
    await p2.getByText("Bảng nháp của tôi").waitFor();

    // Student 1 reloads, verifies grant restore
    await p1.reload();
    await p1.getByText("Bảng nháp của tôi").waitFor();
    await p1.getByText("Chưa có bài làm nào được nộp.").waitFor();
    await t.locator(".online-room__views").getByRole("button", { name: "Chấm bài", exact: true }).click();
    await t.getByText("Chưa có bài nộp từ học sinh.").waitFor();
    await t.locator(".online-room__views").getByRole("button", { name: "Giảng dạy", exact: true }).click();

    const tb = t.getByTestId("online-board"),
      sb = p1.getByTestId("online-board");

    // Member tool override test (ROOM 004)
    const roomInfo = await (
      await fetch(origin + `/api/v1/room/state?sessionId=${id}`, {
        headers: { Authorization: "Bearer " + token },
      })
    ).json();
    const memberId = roomInfo.session.RoomMember_sessionId_items.find(
      (m) => m.studentId === ids[0],
    ).id;

    await post(
      `/sessions/${id}/members/${memberId}`,
      token,
      { canWrite: false },
      "PATCH",
    );
    await sb.getByRole("button", { name: "Thêm nét vẽ" }).waitFor();
    for (
      let n = 0;
      n < 80 &&
      !(await sb.getByRole("button", { name: "Thêm nét vẽ" }).isDisabled());
      n++
    )
      await new Promise((r) => setTimeout(r, 100));
    if (!(await sb.getByRole("button", { name: "Thêm nét vẽ" }).isDisabled()))
      throw Error("student board ignores permission");

    await post(
      `/sessions/${id}/members/${memberId}`,
      token,
      { canWrite: true },
      "PATCH",
    );
    for (
      let n = 0;
      n < 80 &&
      !(await sb.getByRole("button", { name: "Thêm nét vẽ" }).isEnabled());
      n++
    )
      await new Promise((r) => setTimeout(r, 100));
    if (!(await sb.getByRole("button", { name: "Thêm nét vẽ" }).isEnabled()))
      throw Error("student board did not recover permission");
    if (!(await tb.getByRole("button", { name: "Thêm nét vẽ" }).isEnabled()))
      throw Error("teacher board disabled during live session");

    // Layout hooks and semantic labels
    if (
      !(await t.getByLabel("Hoạt động hiện tại").count()) ||
      !(await t.getByLabel("Câu hỏi kiểm tra nhanh").count())
    )
      throw Error("teacher controls lack accessible labels");
    const headerBox = await t.locator(".online-room__header").boundingBox(),
      boardBox = await t.locator(".online-room__board").boundingBox(),
      participantsBox = await t.locator(".online-room__participants").boundingBox();
    if (!headerBox || !boardBox || !participantsBox || headerBox.y >= boardBox.y)
      throw Error("teaching workspace must follow the room header");
    if (await t.locator(".online-room__review").isVisible())
      throw Error("full review must stay outside the teaching view");

    await t.setViewportSize({ width: 1440, height: 900 });
    await t.screenshot({
      path: path.join(artifacts, "teacher-wiring-1440.png"),
      fullPage: true,
    });
    await t.setViewportSize({ width: 1200, height: 800 });

    // Drawing & undo on teacher and student boards (TOOL 001)
    await tb.getByRole("button", { name: "Thêm nét vẽ" }).click();
    await tb.getByText("1 nét vẽ", { exact: false }).waitFor();
    await tb.getByRole("button", { name: "Hoàn tác nét của tôi" }).click();
    await tb.getByText("0 nét vẽ", { exact: false }).waitFor();

    await sb.getByRole("button", { name: "Thêm nét vẽ" }).click();
    await sb.getByText("1 nét vẽ", { exact: false }).waitFor();

    // Student 1 shares private board with class (TOOL 002)
    await sb
      .getByRole("button", { name: "Chia sẻ nháp với giáo viên/lớp" })
      .click();
    await sb.getByRole("button", { name: "Dừng chia sẻ nháp" }).waitFor();

    // Teacher selects Student One in members list
    await t
      .locator(".online-room__members")
      .getByRole("button", { name: "Student One" })
      .click();

    // Teacher dock: present student shared board on stage
    const dock = t.locator(".online-room__dock");
    await dock.getByRole("button", { name: "Trình bày bảng đã chia sẻ" }).click();
    await t.getByText("Bảng đang trình bày trên sân khấu", { exact: false }).waitFor();

    // Teacher presents common board again
    await dock.getByRole("button", { name: "Trình bày bảng chung" }).click();
    await t.getByText("Bảng chung", { exact: false }).waitFor();

    // Teacher inspects student private board
    await dock.getByRole("button", { name: "Xem bảng riêng" }).click();
    await tb.getByText("Xem bảng riêng: Student One", { exact: false }).waitFor();
    await dock.getByRole("button", { name: "Trở về bảng chung" }).click();
    await tb.getByText("Bảng chung", { exact: false }).waitFor();

    // Student stops sharing and undoes stroke
    await sb.getByRole("button", { name: "Dừng chia sẻ nháp" }).click();
    await sb.getByRole("button", { name: "Hoàn tác nét của tôi" }).click();
    await sb.getByText("0 nét vẽ", { exact: false }).waitFor();

    // Shared Stage Document & controlled page sync (LIVE 003, TOOL 003)
    await t.getByLabel("Hoạt động hiện tại").selectOption({ label: "Phiếu học tập" });
    const stage = t.locator(".online-room__stage");
    await stage.getByRole("button", { name: "Học liệu" }).click();
    // Page counters alone do not prove that an auto-detected PDF was rendered.
    await stage.locator("canvas").waitFor();
    await t.waitForFunction(() => {
      const canvas = document.querySelector(".online-room__stage canvas");
      return canvas && canvas.width > 0 && canvas.height > 0 && Number(canvas.dataset.renderedPage) > 0;
    });
    if (await stage.locator("img").count()) throw Error("PDF stage incorrectly rendered as image");
    await stage.getByText("Phiếu học tập").waitFor();
    await stage.getByText("Trang 1/2").waitFor();

    // Student syncs page
    await p1.locator(".online-room__stage").getByText("Phiếu học tập").waitFor();
    await p1.locator(".online-room__stage").getByText("Trang 1/2").waitFor();

    await p1.waitForFunction(() => Number(document.querySelector(".online-room__stage canvas")?.dataset.renderedPage) === 1);
    for (const [role, page] of [["teacher", t], ["student", p1]]) {
      for (const width of [360, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ["light", "dark"]) {
          const isDark = await page.evaluate(() => document.body.classList.contains("dark"));
          if (isDark !== (theme === "dark")) await page.getByRole("button", { name: "Đổi giao diện" }).click();
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
          if (overflow) throw Error(`${role} overflows at ${width}px ${theme}`);
          if (role === "teacher" && width === 1440) {
            const stageBox = await page.locator(".online-room__stage").boundingBox();
            const dockBox = await page.locator(".online-room__dock").boundingBox();
            const railBox = await page.locator(".online-room__participants").boundingBox();
            const boardBox = await page.locator(".online-room__workspace > .online-room__board").boundingBox();
            if (!stageBox || !dockBox || !railBox || !boardBox ||
                stageBox.x < railBox.x + railBox.width ||
                dockBox.x < stageBox.x + stageBox.width ||
                Math.abs(boardBox.x - stageBox.x) > 1 || stageBox.width < 320)
              throw Error("desktop requires separate participant rail, readable stage/board and Copilot dock");
          }
          await page.screenshot({ path: path.join(artifacts, `final-${role}-${width}-${theme}.png`), fullPage: true });
        }
      }
      await page.getByRole("button", { name: "Đổi giao diện" }).click();
    }
    await t.setViewportSize({ width: 1200, height: 800 });
    await p1.setViewportSize({ width: 360, height: 800 });

    // Teacher flips page
    await stage.getByRole("button", { name: "Trang sau" }).click();
    await stage.getByText("Trang 2/2").waitFor();
    await p1.locator(".online-room__stage").getByText("Trang 2/2").waitFor();

    await stage.getByRole("button", { name: "Trang trước" }).click();
    await stage.getByText("Trang 1/2").waitFor();
    await p1.locator(".online-room__stage").getByText("Trang 1/2").waitFor();

    // Window resize on stage does not crash
    await t.setViewportSize({ width: 1440, height: 900 });
    await stage.getByText("Trang 1/2").waitFor();
    await t.setViewportSize({ width: 1200, height: 800 });

    // Activity completion mark (LIV 002)
    const activitySection = t.locator(".online-room__activity");
    await activitySection.getByRole("button", { name: "Đánh dấu hoàn tất" }).click();
    await activitySection.getByRole("button", { name: "Đã hoàn tất hoạt động" }).waitFor();

    // Teaching dock quick note creation <= 2 actions (LIVE 004)
    await dock.getByLabel("Ghi chú quan sát").fill("Tiếp thu bài nhanh");
    await dock.getByRole("button", { name: "Lưu ghi chú" }).click();
    await dock.getByText("Quan sát của giáo viên: Tiếp thu bài nhanh").waitFor();
    await dock.getByRole("button", { name: "Chụp bảng học sinh" }).click();

    // Chat UI & allow/deny toggle (Decision D09, ROOM 004)
    const teacherChat = t.locator(".online-room__chat");
    const studentChat = p1.locator(".online-room__chat");
    await teacherChat.getByLabel("Tin nhắn").fill("Xin chào cả lớp");
    await teacherChat.getByRole("button", { name: "Gửi" }).click();
    await studentChat.getByText("teacher: Xin chào cả lớp").waitFor();

    await studentChat.getByLabel("Tin nhắn").fill("Em chào thầy ạ");
    await studentChat.getByRole("button", { name: "Gửi" }).click();
    await teacherChat.getByText("Em chào thầy ạ").waitFor();

    // Disable chat via class tools toggle
    const membersSection = t.locator(".online-room__members");
    const classTools = membersSection.getByRole("group", { name: "Công cụ cả lớp" });
    await classTools.getByLabel("Trò chuyện").click();
    await studentChat.getByText("Giáo viên đã tắt trò chuyện.").waitFor();
    if (!(await studentChat.getByRole("button", { name: "Gửi" }).isDisabled()))
      throw Error("student chat enabled when toggled off");

    // Re-enable chat
    await classTools.getByLabel("Trò chuyện").click();
    for (let n = 0; n < 50 && (await studentChat.getByRole("button", { name: "Gửi" }).isDisabled()); n++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (await studentChat.getByRole("button", { name: "Gửi" }).isDisabled())
      throw Error("student chat did not re-enable");

    // Quick Check & Review with support level (TOOL 004, TOOL 007)
    await stage.getByRole("button", { name: "Kiểm tra", exact: true }).click();
    await t.getByPlaceholder("Câu hỏi kiểm tra nhanh").fill("2 + 2?");
    await t.getByRole("button", { name: "Mở câu hỏi" }).click();
    await p1.getByRole("heading", { name: "2 + 2?" }).waitFor();
    const check = p1
      .locator("section")
      .filter({ has: p1.getByRole("heading", { name: "2 + 2?" }) });
    await check.getByLabel("Câu trả lời kiểm tra nhanh").fill("4");
    await check.getByRole("button", { name: "Gửi câu trả lời" }).click();
    await check.getByText("Đã trả lời: 4").waitFor();

    // Teacher closes quick check and grades response
    await t.getByRole("button", { name: "Đóng", exact: true }).first().click();
    await p1
      .getByRole("heading", { name: "2 + 2?" })
      .waitFor({ state: "hidden" });

    const checksSection = t.locator(".online-room__checks");
    const checkGradeForm = checksSection.locator("form").filter({ hasText: "Student One: 4" });
    await checkGradeForm.getByLabel("Nhận xét", { exact: false }).fill("Chính xác");
    await checkGradeForm.getByLabel("Mức hỗ trợ", { exact: false }).selectOption("DocLap");
    await checkGradeForm.getByRole("button", { name: "Chấm bài" }).click();
    await checksSection.getByText("Chính xác (Độc lập)", { exact: false }).waitFor();

    // Offline draft queue replay (LIVE 006, Decision D10)
    await a.setOffline(true);
    await sb.getByRole("button", { name: "Thêm nét vẽ" }).click();
    await p1.getByText("Đã giữ 1 thao tác", { exact: false }).waitFor();
    for (let n = 0; n < 50; n++) {
      await sb
        .getByPlaceholder("Nhập bước biến đổi hoặc ghi chú bảng...")
        .fill("draft-" + n);
      await sb.getByRole("button", { name: "Lưu ghi chú bảng" }).click();
      if (n < 49)
        await p1
          .getByText("Đã giữ " + (n + 2) + " thao tác", { exact: false })
          .waitFor();
      else await p1.getByText("Hàng đợi đã đầy", { exact: false }).waitFor();
    }
    if (
      (await sb
        .getByPlaceholder("Nhập bước biến đổi hoặc ghi chú bảng...")
        .inputValue()) !== "draft-49"
    )
      throw Error("offline draft lost");

    await sb.getByRole("button", { name: "Thêm nét vẽ" }).click();
    await p1.getByText("Nét vẽ chưa gửi vẫn được giữ lại.").waitFor();
    await a.setOffline(false);
    await p1.getByText("Kết nối dữ liệu: đã kết nối", { exact: false }).waitFor();
    let replayed = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await (
        await fetch(origin + `/api/v1/room/state?sessionId=${id}`, {
          headers: { Authorization: "Bearer " + token },
        })
      ).json();
      if (
        state.boards.some((b) => b.ownerId === ids[0] && b.text === "draft-48")
      ) {
        replayed = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!replayed) throw Error("queued drafts did not replay");
    if (
      (await sb
        .getByPlaceholder("Nhập bước biến đổi hoặc ghi chú bảng...")
        .inputValue()) !== "draft-49"
    )
      throw Error("full queue draft lost after reconnect");
    await sb.getByText("1 nét vẽ", { exact: false }).waitFor();
    await p1.getByRole("button", { name: "Gửi lại nét vẽ" }).click();
    await sb.getByText("2 nét vẽ", { exact: false }).waitFor();
    await sb.getByRole("button", { name: "Lưu ghi chú bảng" }).click();

    // Submissions: PDF from Student 1 and Text from Student 2 (TOOL 005)
    await p1.getByLabel("Ảnh hoặc PDF").setInputFiles({
      name: "answer.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nclassroom\n%%EOF\n"),
    });
    await p1.getByRole("button", { name: "Nộp bài" }).click();
    await p1.getByText("answer.pdf:", { exact: false }).waitFor();
    await t.locator(".online-room__views").getByRole("button", { name: "Chấm bài", exact: true }).click();
    await t.getByText("Mở tệp: answer.pdf").waitFor();

    await p2
      .locator(".online-room__submissions")
      .getByLabel("Bài làm")
      .fill("Bài của học sinh hai");
    await p2.getByRole("button", { name: "Nộp bài" }).click();
    await t.getByText("Bài của học sinh hai").waitFor();

    // Review Panel: manual observation, claim, grading (TOOL 007)
    await t.locator(".online-room__views").getByRole("button", { name: "Tổng kết & duyệt", exact: true }).click();
    const panel = t.locator(".online-room__review");
    await panel.getByLabel("Học sinh").selectOption({ label: "Student One" });
    await panel.getByLabel("Quan sát thực tế").fill("Đã hoàn thành bài tập");
    await panel.getByRole("button", { name: "Lưu quan sát" }).click();
    await panel.getByText("Đã hoàn thành bài tập", { exact: false }).waitFor();
    await panel
      .locator("label")
      .filter({ hasText: "Đã hoàn thành bài tập" })
      .getByRole("checkbox")
      .check();
    await panel
      .getByLabel("Nhận định", { exact: true })
      .fill("Hoàn thành bài tập");
    await panel
      .getByRole("button", { name: "Tạo nhận định chờ duyệt" })
      .click();
    await panel
      .getByText("Hoàn thành bài tập · Chờ duyệt", { exact: false })
      .waitFor();
    await panel.getByRole("button", { name: "Duyệt", exact: true }).click();
    await panel
      .getByText("Hoàn thành bài tập · Đã duyệt", { exact: false })
      .waitFor();

    await t.locator(".online-room__views").getByRole("button", { name: "Chấm bài", exact: true }).click();
    const submissionForm = t.locator("form").filter({ hasText: "answer.pdf" });
    await submissionForm
      .getByLabel("Nhận xét cho answer.pdf")
      .fill("Good work");
    await submissionForm
      .getByLabel("Mức hỗ trợ cho answer.pdf")
      .selectOption("CoGoiY");

    const secondForm = t
      .locator("form")
      .filter({ hasText: "Bài của học sinh hai" });
    if (
      (await secondForm.getByLabel("Nhận xét cho Bài làm").inputValue()) !== ""
    )
      throw Error("feedback leaked across submissions");
    if (
      (await secondForm.getByLabel("Mức hỗ trợ cho Bài làm").inputValue()) !==
      "DocLap"
    )
      throw Error("support leaked across submissions");

    await submissionForm.getByRole("button", { name: "Chấm bài" }).click();
    await t.locator(".online-room__views").getByRole("button", { name: "Tổng kết & duyệt", exact: true }).click();
    await panel.getByLabel("Học sinh").selectOption({ label: "Student One" });
    await panel.getByText("Good work", { exact: false }).waitFor();

    const gradedEvidence = panel
      .locator("div")
      .filter({ hasText: "Good work" })
      .filter({ has: t.getByRole("button", { name: "Xem nguồn" }) })
      .last();
    await gradedEvidence.getByRole("button", { name: "Xem nguồn" }).click();
    await panel.getByRole("button", { name: "Đóng nguồn" }).waitFor();
    await panel.getByRole("button", { name: "Đóng nguồn" }).click();

    // TTL configure & invite revoke (ROOM 001)
    await t.locator(".online-room__views").getByRole("button", { name: "Giảng dạy", exact: true }).click();
    await membersSection.getByLabel("Thời hạn liên kết (giờ)").fill("12");
    const studentTwoMember = membersSection.locator("div").filter({ hasText: "Student Two" });
    await studentTwoMember.getByRole("button", { name: "Tạo liên kết mời" }).click();
    await t.getByText("Liên kết mời một lần:").waitFor();
    await studentTwoMember.getByRole("button", { name: "Thu hồi liên kết" }).click();

    // End session (LIVE 005)
    await t.getByRole("button", { name: "Kết thúc", exact: true }).click();
    await t.getByText("public · Đã kết thúc").waitFor();
    await t.locator(".online-room__views").getByRole("button", { name: "Giảng dạy", exact: true }).click();
    if (!(await tb.getByRole("button", { name: "Thêm nét vẽ" }).isDisabled()))
      throw Error("teacher board enabled after end");

    // Student 1 verifies coherent post-end receipt
    await p1.getByText("public · Đã kết thúc").waitFor();
    await p1.getByText("answer.pdf: — Good work (Có gợi ý)", { exact: false }).waitFor();
    if (!(await sb.getByRole("button", { name: "Thêm nét vẽ" }).isDisabled()))
      throw Error("student board enabled after session end");

    // Review completion
    await t.locator(".online-room__views").getByRole("button", { name: "Tổng kết & duyệt", exact: true }).click();
    await panel.getByRole("button", { name: "Hoàn tất duyệt" }).click();
    await t.getByText("public · Đã hoàn tất duyệt").waitFor();

    // Security & admission checks (ROOM 001, ROOM 002, ROOM 003)
    const badPage = await b.newPage();
    await badPage.goto(origin + "/?invite=invalid");
    await badPage.getByRole("alert").waitFor();
    await badPage.getByRole("link", { name: "Quay về trang chủ" }).waitFor();
    if ((await badPage.locator("body").innerText()).includes("Student One"))
      throw Error("invalid invite revealed identity");
    await badPage.close();

    const denial = await post("/sessions", token, {
      studentIds: [ids[0]],
      title: "Denied private",
      goal: "",
      sharedGoal: "",
      date: "2026-11-01",
      time: "19:00",
      duration: 60,
      tools: { board: true, upload: true, check: true, chat: true },
    });
    const denyId = denial.session.id;
    const denyInvite = await post(`/sessions/${denyId}/invites`, token, {
      studentId: ids[0],
    });
    const denied = await b.newPage();
    await denied.goto(denyInvite.inviteUrl);
    await denied.getByLabel("Tên hiển thị").fill("Denied Student");
    await denied.getByRole("checkbox").check();
    await denied.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await denied
      .getByRole("status")
      .filter({ hasText: "Đang chờ giáo viên" })
      .waitFor();
    const denyState = await (
      await fetch(origin + `/api/v1/room/state?sessionId=${denyId}`, {
        headers: { Authorization: "Bearer " + token },
      })
    ).json();
    const denyMember = denyState.session.RoomMember_sessionId_items[0].id;
    await post(`/sessions/${denyId}/members/${denyMember}/admit`, token, {
      approved: false,
    });
    await denied
      .getByRole("alert")
      .filter({ hasText: "liên hệ giáo viên" })
      .waitFor();
    await denied.getByRole("button", { name: "Quay lại" }).waitFor();
    await denied.close();

    console.log(
      "PASS teacher + two isolated student contexts, stage/doc page sync, board private/share/presentation/undo, activity completion, tools allow/deny, quick checks/review, dock note 2 actions, chat, TTL/revoke, refresh/end receipt",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
