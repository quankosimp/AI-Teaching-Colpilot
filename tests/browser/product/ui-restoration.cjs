const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");

(async () => {
  const origin = new URL(
    process.env.BROWSER_BASE_URL || "http://127.0.0.1:3171",
  ).origin;
  const artifacts =
    process.env.BROWSER_ARTIFACT_DIR || "/tmp/copilot-ui-restoration";
  await fs.mkdir(artifacts, { recursive: true });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const stamp = Date.now();
  const student = `UI learner ${stamp}`,
    material = `UI worksheet ${stamp}`,
    session = `UI lesson ${stamp}`;
  const nav = async (name) => {
    await page.locator(".restored-topbar").waitFor();
    if (
      await page
        .getByRole("button", { name: "Mở menu", exact: true })
        .isVisible()
    ) {
      await page.getByRole("button", { name: "Mở menu", exact: true }).click();
    }
    await page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("button", { name, exact: true })
      .click();
  };
  const closeDialog = async () => {
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  };
  const snapshot = async (name) => {
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"]) {
        if (
          (await page
            .locator(".online-restored")
            .getAttribute("data-theme")) !== theme
        ) {
          await page
            .getByRole("button", { name: "Đổi giao diện", exact: true })
            .click();
        }
        // Let the drawer's breakpoint transition settle before measuring geometry.
        await page.waitForTimeout(250);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${name} overflow at ${width}/${theme}`,
        );
        await page.screenshot({
          path: `${artifacts}/${name}-${width}-${theme}.png`,
          fullPage: true,
        });
      }
    }
  };
  try {
    await page.goto(origin);
    await page
      .getByRole("button", { name: "Demo Hoàng Nam", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Không gian dạy học của bạn" })
      .waitFor();
    await snapshot("dashboard");

    await nav("Học sinh");
    await page
      .getByRole("button", { name: "Thêm học sinh", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Tên học sinh", { exact: true }).fill(student);
    await dialog.getByLabel("Lớp", { exact: true }).fill("Lớp 9");
    await dialog.getByLabel("Môn học", { exact: true }).fill("Toán");
    await dialog
      .getByLabel("Mục tiêu", { exact: true })
      .fill("Giải phương trình từng bước");
    await dialog
      .getByRole("button", { name: "Thêm học sinh", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByLabel("Tìm học sinh", { exact: true }).fill(student);
    const studentCard = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", { name: student, exact: true }),
      });
    await studentCard.getByRole("button", { name: "Xem hồ sơ" }).click();
    await page.getByRole("button", { name: "Chỉnh sửa hồ sơ" }).click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Mục tiêu", { exact: true })
      .fill("Mục tiêu đã cập nhật");
    await dialog
      .getByLabel("Ghi chú", { exact: true })
      .fill("Ghi chú riêng kiểm tra lưu server");
    await dialog
      .getByLabel("Điểm mạnh (mỗi dòng một mục)")
      .fill("Giải thích rõ ràng");
    await dialog
      .getByRole("button", { name: "Lưu hồ sơ", exact: true })
      .click();
    await page
      .locator(".restored-profile")
      .first()
      .getByText("Mục tiêu đã cập nhật", { exact: true })
      .waitFor();
    await closeDialog();
    assert.equal(
      await page
        .getByRole("button", { name: "Chỉnh sửa hồ sơ" })
        .evaluate((el) => document.activeElement === el),
      true,
      "modal focus returns to opener",
    );
    await page
      .getByRole("tab", { name: "Lịch sử buổi học", exact: true })
      .click();
    await page.getByText("Học sinh chưa có buổi học nào.").waitFor();
    await page.getByRole("tab", { name: "Minh chứng", exact: true }).click();
    await page.getByText("Chưa có minh chứng của học sinh này.").waitFor();
    await page.getByRole("tab", { name: "Tổng quan", exact: true }).click();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page
        .getByRole("tab", { name: "Lịch sử buổi học" })
        .getAttribute("aria-selected"),
      "true",
    );
    await page.keyboard.press("End");
    assert.equal(
      await page
        .getByRole("tab", { name: "Minh chứng", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await page.keyboard.press("Home");
    assert.equal(
      await page
        .getByRole("tab", { name: "Tổng quan", exact: true })
        .getAttribute("tabindex"),
      "0",
    );
    await snapshot("profile");
    console.log(
      "PASS student creation, profile edit, real empty history/evidence and modal focus",
    );

    await nav("Kho học liệu");
    await page
      .getByRole("button", { name: "Tải học liệu", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Tên", { exact: true }).fill(material);
    await dialog.getByLabel("Chủ đề", { exact: true }).fill("Phương trình");
    await dialog
      .getByLabel("PDF hoặc ảnh, tối đa 10 MiB")
      .setInputFiles({
        name: "worksheet.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(
          "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
        ),
      });
    await dialog.getByRole("button", { name: "Tải lên", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByLabel("Tìm học liệu", { exact: true }).fill(material);
    await page.getByRole("button", { name: "Xem tệp", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.locator('canvas[data-rendered-page="1"]').waitFor();
    await closeDialog();
    await snapshot("materials");
    console.log(
      "PASS private PDF upload, server finalize and actual PDF canvas preview",
    );

    await nav("Soạn buổi học");
    await page
      .getByRole("button", { name: "Tạo buổi học", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Học sinh", { exact: true })
      .selectOption({ label: student });
    await dialog.getByLabel("Tên buổi học", { exact: true }).fill(session);
    await dialog
      .getByRole("button", { name: "Tạo bản nháp", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page
      .locator(".restored-plan-main")
      .getByRole("heading", { name: session, exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Thêm hoạt động", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Hoạt động", { exact: true })
      .fill("Hoạt động UI có mô tả");
    await dialog
      .getByLabel("Mô tả", { exact: true })
      .fill("Mô tả được lưu từ modal");
    await dialog.getByLabel("Thời lượng hoạt động", { exact: true }).fill("75");
    await dialog
      .getByRole("button", { name: "Thêm hoạt động", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page
      .getByRole("alert")
      .filter({
        hasText: "Tổng thời lượng hoạt động vượt thời lượng buổi học.",
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Chỉnh sửa hoạt động", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    assert.equal(
      await dialog.getByLabel("Mô tả hoạt động").inputValue(),
      "Mô tả được lưu từ modal",
    );
    assert.equal(await dialog.getByLabel("Số phút").inputValue(), "75");
    await closeDialog();
    await snapshot("plans");

    // Read back through a fresh browser login; this checks persistence without the current React state.
    await page.reload();
    await page
      .getByRole("heading", { name: "Không gian dạy học của bạn" })
      .waitFor();
    await nav("Soạn buổi học");
    await page.getByRole("button", { name: session, exact: true }).click();
    await page
      .getByText("Hoạt động UI có mô tả · 75 phút", { exact: true })
      .waitFor();
    await nav("Học sinh");
    await page.getByLabel("Tìm học sinh", { exact: true }).fill(student);
    await page.getByRole("button", { name: "Xem hồ sơ", exact: true }).click();
    await page
      .getByText("Ghi chú riêng kiểm tra lưu server", { exact: true })
      .waitFor();
    await page
      .getByRole("tab", { name: "Lịch sử buổi học", exact: true })
      .click();
    await page.getByRole("row").filter({ hasText: session }).waitFor();
    console.log(
      "PASS planning modals, description/duration warning, reload persistence and student session history",
    );

    await page.setViewportSize({ width: 375, height: 900 });
    const opener = page.getByRole("button", { name: "Mở menu", exact: true });
    await opener.click();
    const drawer = page.getByRole("dialog", { name: "Thanh điều hướng" });
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press("Tab");
      assert.equal(
        await drawer.evaluate((el) => el.contains(document.activeElement)),
        true,
      );
    }
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await drawer.evaluate((el) => el.contains(document.activeElement)),
      true,
    );
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    assert.equal(
      await opener.evaluate((el) => document.activeElement === el),
      true,
    );
    await nav("Tài khoản");
    await page
      .getByRole("main")
      .getByRole("button", { name: "Đăng xuất", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Demo Mai An", exact: true })
      .click();
    await nav("Học sinh");
    await page.getByLabel("Tìm học sinh", { exact: true }).fill(student);
    await page
      .getByRole("heading", { name: "Chưa tìm thấy học sinh" })
      .waitFor();
    await nav("Kho học liệu");
    await page.getByLabel("Tìm học liệu", { exact: true }).fill(material);
    await page
      .getByRole("heading", { name: "Chưa có học liệu phù hợp" })
      .waitFor();
    assert.deepEqual(errors, [], "no uncaught browser errors");
    console.log(
      "PASS mobile drawer keyboard/focus and workspace isolation after switching teachers",
    );
  } catch (error) {
    await page
      .screenshot({ path: `${artifacts}/failure.png`, fullPage: true })
      .catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
