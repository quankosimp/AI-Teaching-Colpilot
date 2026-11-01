const { chromium } = require("playwright-core");
(async () => {
  const origin = "http://127.0.0.1:3002";
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
  const students = await (
    await fetch(origin + "/api/v1/students", {
      headers: { Authorization: "Bearer " + token },
    })
  ).json();
  const ids = students.students.slice(0, 2).map((s) => s.id);
  const title = "Browser " + Date.now();
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
        title: "Practice",
        description: "",
        duration: 10,
        type: "LuyenTap",
        materialId: null,
        materialVersion: null,
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
    await t.goto(origin);
    await t.getByRole("button", { name: "Demo Hoàng Nam" }).click();
    await t.getByRole("button", { name: "Soạn buổi học" }).click();
    await t.getByRole("button", { name: title }).click();
    await t.getByRole("button", { name: "Mở phòng học" }).click();
    await t.getByRole("heading", { name: title }).waitFor();
    for (const [p, link, name] of [
      [p1, links[0], "Student One"],
      [p2, links[1], "Student Two"],
    ]) {
      await p.goto(link);
      await p.getByLabel("Tên hiển thị").fill(name);
      await p.getByRole("checkbox").check();
      await p.getByRole("button", { name: "Gửi yêu cầu" }).click();
      await p.getByText("Đang chờ giáo viên").waitFor();
      if (p.url().includes("invite=")) throw Error("invite leaked in URL");
    }
    await t
      .locator("div")
      .filter({ hasText: /^Student One · waiting/ })
      .waitFor();
    for (const name of ["Student One", "Student Two"])
      await t
        .locator("div")
        .filter({ hasText: new RegExp("^" + name + " · waiting") })
        .getByRole("button", { name: "Cho vào" })
        .click();
    await t.getByRole("button", { name: "Bắt đầu" }).click();
    await p1.getByText("Bảng nháp của tôi").waitFor();
    await p2.getByText("Bảng nháp của tôi").waitFor();
    await p1.reload();
    await p1.getByText("Bảng nháp của tôi").waitFor();
    const tb = t.getByTestId("online-board"),
      sb = p1.getByTestId("online-board");
    await tb.getByRole("button", { name: "Thêm nét vẽ" }).click();
    await tb.getByText("1 nét vẽ", { exact: false }).waitFor();
    await tb.getByRole("button", { name: "Hoàn tác nét của tôi" }).click();
    await tb.getByText("0 nét vẽ", { exact: false }).waitFor();
    await sb.getByRole("button", { name: "Thêm nét vẽ" }).click();
    await sb.getByText("1 nét vẽ", { exact: false }).waitFor();
    await sb
      .getByRole("button", { name: "Chia sẻ nháp với giáo viên/lớp" })
      .click();
    await sb.getByRole("button", { name: "Dừng chia sẻ nháp" }).waitFor();
    await sb.getByRole("button", { name: "Hoàn tác nét của tôi" }).click();
    await sb.getByText("0 nét vẽ", { exact: false }).waitFor();
    await t.getByPlaceholder("Câu hỏi kiểm tra nhanh").fill("2 + 2?");
    await t.getByRole("button", { name: "Mở câu hỏi" }).click();
    await p1.getByRole("heading", { name: "2 + 2?" }).waitFor();
    const check = p1
      .locator("section")
      .filter({ has: p1.getByRole("heading", { name: "2 + 2?" }) });
    await check.locator("input").fill("4");
    await check.getByRole("button", { name: "Gửi câu trả lời" }).click();
    await check.getByText("Đã trả lời: 4").waitFor();
    await t.getByRole("button", { name: "Đóng", exact: true }).first().click();
    await p1
      .getByRole("heading", { name: "2 + 2?" })
      .waitFor({ state: "hidden" });
    await a.setOffline(true);
    for (let n = 0; n < 51; n++) {
      await sb
        .getByPlaceholder("Nhập bước biến đổi hoặc ghi chú bảng...")
        .fill("draft-" + n);
      await sb.getByRole("button", { name: "Lưu ghi chú bảng" }).click();
      if (n < 50)
        await p1
          .getByText("Đã giữ " + (n + 1) + " thao tác", { exact: false })
          .waitFor();
      else await p1.getByText("Hàng đợi đã đầy", { exact: false }).waitFor();
    }
    if (
      (await sb
        .getByPlaceholder("Nhập bước biến đổi hoặc ghi chú bảng...")
        .inputValue()) !== "draft-50"
    )
      throw Error("offline draft lost");
    await a.setOffline(false);
    await p1.getByText("đang kết nối", { exact: false }).waitFor();
    let replayed = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await (
        await fetch(origin + `/api/v1/room/state?sessionId=${id}`, {
          headers: { Authorization: "Bearer " + token },
        })
      ).json();
      if (
        state.boards.some((b) => b.ownerId === ids[0] && b.text === "draft-49")
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
        .inputValue()) !== "draft-50"
    )
      throw Error("full queue draft lost after reconnect");
    await sb.getByRole("button", { name: "Lưu ghi chú bảng" }).click();
    await p1.getByLabel("Ảnh hoặc PDF").setInputFiles({
      name: "answer.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nclassroom\n%%EOF\n"),
    });
    await p1.getByRole("button", { name: "Nộp bài" }).click();
    await p1.getByText("answer.pdf:", { exact: false }).waitFor();
    await t.getByText("Mở tệp: answer.pdf").waitFor();
    const panel = t.locator("section").filter({
      has: t.getByRole("heading", { name: "Minh chứng và nhận định" }),
    });
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
      .getByText("Hoàn thành bài tập · pending", { exact: false })
      .waitFor();
    await panel.getByRole("button", { name: "Duyệt", exact: true }).click();
    await panel
      .getByText("Hoàn thành bài tập · approved", { exact: false })
      .waitFor();
    const submissionForm = t.locator("form").filter({ hasText: "answer.pdf" });
    await submissionForm.getByPlaceholder("Nhận xét").fill("Good work");
    await submissionForm.locator("select").selectOption("CoGoiY");
    await submissionForm.getByRole("button", { name: "Chấm bài" }).click();
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
    await t.getByRole("button", { name: "Kết thúc", exact: true }).click();
    await panel.getByRole("button", { name: "Hoàn tất duyệt" }).click();
    await t.getByText("public · reviewed").waitFor();
    t.once("dialog", (d) => d.accept("Quan sát đã sửa"));
    const note = panel
      .locator("div")
      .filter({ hasText: "Đã hoàn thành bài tập" })
      .filter({ has: t.getByRole("button", { name: "Điều chỉnh" }) })
      .last();
    await note.getByRole("button", { name: "Điều chỉnh" }).click();
    await t.getByText("public · ended").waitFor();
    await panel
      .getByText("Hoàn thành bài tập · pending", { exact: false })
      .waitFor();
    const zeroTitle = "Zero " + Date.now();
    await post("/sessions", token, {
      studentIds: [ids[0]],
      title: zeroTitle,
      goal: "",
      sharedGoal: "zero",
      date: "2026-11-01",
      time: "19:00",
      duration: 60,
      tools: { board: true, upload: true, check: true, chat: true },
    });
    await t.goto(origin);
    await t.getByRole("button", { name: "Soạn buổi học" }).click();
    await t.getByRole("button", { name: zeroTitle }).click();
    await t.getByRole("button", { name: "Mở phòng học" }).click();
    await t.getByRole("heading", { name: zeroTitle }).waitFor();
    await t.getByRole("button", { name: "Bắt đầu" }).click();
    await t.getByRole("button", { name: "Kết thúc", exact: true }).click();
    await t
      .getByLabel("Ghi chú tổng kết (cần khi chưa có nhận định)")
      .fill("Chưa có dữ liệu quan sát");
    await t.getByRole("button", { name: "Hoàn tất duyệt" }).click();
    await t.getByText("zero · reviewed").waitFor();
    console.log(
      "PASS teacher + two isolated student contexts, mobile, admission, refresh, private PDF submission and manual review",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
