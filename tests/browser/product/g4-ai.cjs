const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');

(async () => {
  const origin = new URL(process.env.BROWSER_BASE_URL || 'http://127.0.0.1:3161').origin;
  const artifacts = process.env.BROWSER_ARTIFACT_DIR || '/tmp/teaching-g34-browser';
  await fs.mkdir(artifacts, { recursive: true });
  const send = async (path, token, body, method = 'POST', extra = {}) => {
    const response = await fetch(origin + '/api/v1' + path, { method, headers: {
      Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra,
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.ok(response.ok, `${path}: ${response.status} ${response.ok ? '' : await response.text()}`);
    return response.status === 204 ? undefined : response.json();
  };
  const auth = await send('/auth/mock', '', { account: 'teacher-a' });
  const token = auth.accessToken;
  const students = [];
  for (let i = 0; i < 2; i++) students.push((await send('/students', token, {
    name: `AI learner ${randomUUID().slice(0, 8)}`, grade: '9', subject: 'Toán', goal: 'Giải phương trình',
    notes: '', status: 'active', strengths: [], gaps: [],
  })).student);
  const title = `Copilot browser ${Date.now()}`;
  const { session } = await send('/sessions', token, { title, studentIds: students.map(s => s.id),
    goal: 'Private assessment', sharedGoal: 'Luyện giải phương trình', date: '2026-11-01', time: '19:00', duration: 45,
    tools: { board: true, upload: true, check: true, chat: true },
  });
  await send(`/sessions/${session.id}/activities`, token, [{ title: 'Giải phương trình', duration: 15,
    type: 'LuyenTap', description: 'Bài toán tương tự', materialId: null, materialVersion: null,
    teacherNotes: null, sourceEvidenceIds: [], sourceClaimRefs: [],
  }], 'PUT', { 'If-Match-Version': String(session.version) });
  const invites = [];
  for (const student of students) invites.push(await send(`/sessions/${session.id}/invites`, token, { studentId: student.id }));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const contexts = await Promise.all([browser.newContext({ viewport: { width: 1440, height: 900 } }),
      browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true }), browser.newContext()]);
    const [teacher, a, b] = await Promise.all(contexts.map(context => context.newPage()));
    await teacher.goto(origin);
    await teacher.getByRole('button', { name: 'Demo Hoàng Nam' }).click();
    await teacher.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Soạn buổi học', exact: true }).click();
    await teacher.getByRole('button', { name: title }).click();
    await teacher.getByRole('button', { name: 'Mở phòng học' }).click();
    await teacher.getByRole('heading', { name: title }).waitFor();
    for (const [index, page] of [a, b].entries()) {
      await page.goto(invites[index].inviteUrl);
      await page.getByLabel('Tên hiển thị').fill(`AI student ${index + 1}`);
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
      const waiting = teacher.locator('div').filter({ hasText: new RegExp(`^AI student ${index + 1} · Đang chờ`) });
      await waiting.getByRole('button', { name: 'Cho vào' }).click();
    }
    await teacher.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
    await teacher.getByRole('button', { name: 'AI student 1', exact: true }).click();
    const panel = teacher.getByRole('region', { name: 'Copilot hỗ trợ giảng dạy', exact: true });
    await panel.getByLabel('Lưu ý cho Copilot').fill('Giữ nguyên ghi chú khi mất mạng');
    let firstKey;
    await teacher.route('**/api/v1/sessions/*/ai/suggestions', async route => {
      if (route.request().method() === 'POST') {
        firstKey = route.request().headers()['idempotency-key'];
        await route.abort('connectionfailed');
      } else await route.continue();
    });
    await panel.getByRole('button', { name: 'Lấy gợi ý', exact: true }).click();
    await panel.getByRole('alert').waitFor();
    assert.equal(await panel.getByLabel('Lưu ý cho Copilot').inputValue(), 'Giữ nguyên ghi chú khi mất mạng');
    await teacher.unroute('**/api/v1/sessions/*/ai/suggestions');
    const retried = teacher.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/ai/suggestions'));
    await panel.getByRole('button', { name: 'Thử lại gợi ý' }).click();
    assert.equal((await retried).headers()['idempotency-key'], firstKey);
    const used = panel.getByRole('article', { name: 'Gợi ý Copilot' }).first();
    await used.getByText('Giả lập local', { exact: true }).waitFor();
    await used.getByLabel('Nội dung gợi ý có thể chỉnh sửa').fill('Nội dung giáo viên tự chỉnh trước khi sử dụng');
    await used.getByRole('checkbox').check();
    await used.getByRole('button', { name: 'Đã sử dụng', exact: true }).click();
    await panel.getByRole('status').filter({ hasText: 'Đã lưu gợi ý hỗ trợ' }).waitFor();
    for (const [mode, action] of [['leading_question', 'Bỏ qua'], ['example', 'Báo chưa phù hợp'], ['difficulty', 'Bỏ qua']]) {
      await panel.getByLabel('Cách hỗ trợ').selectOption(mode);
      await panel.getByRole('button', { name: 'Lấy gợi ý', exact: true }).click();
      const card = panel.getByRole('article', { name: 'Gợi ý Copilot' }).first();
      await card.getByRole('button', { name: action, exact: true }).click();
      await card.getByLabel('Nội dung gợi ý có thể chỉnh sửa').waitFor({ state: 'detached' });
    }
    const room = await send(`/room/state?sessionId=${session.id}`, token, undefined, 'GET');
    const aid = room.evidence.find(item => item.kind === 'GoiYGiangDay');
    assert.equal(aid.isObservation, false);
    for (const page of [a, b]) {
      assert.equal(await page.getByRole('region', { name: 'Copilot hỗ trợ giảng dạy' }).count(), 0);
      assert.equal(await page.getByText('Nội dung giáo viên tự chỉnh trước khi sử dụng', { exact: true }).count(), 0);
    }
    await teacher.getByRole('button', { name: 'Kết thúc', exact: true }).click();
    const review = teacher.locator('.online-room__review');
    await review.getByRole('region', { name: 'Copilot dự thảo nhận định' }).waitFor();
    await review.getByLabel('Học sinh tổng kết', { exact: true }).selectOption(students[0].id);
    const draft = review.getByRole('region', { name: 'Copilot dự thảo nhận định' });
    await draft.getByRole('button', { name: 'Dự thảo nhận định bằng Copilot', exact: true }).click();
    await draft.getByRole('status').filter({ hasText: 'Chưa có minh chứng quan sát' }).waitFor();
    await review.getByLabel('Quan sát thực tế', { exact: true }).fill('Học sinh tự giải đúng phương trình và giải thích từng bước');
    const saved = teacher.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/evidence'));
    await review.getByRole('button', { name: 'Lưu quan sát', exact: true }).click();
    assert.equal((await saved).status(), 201);
    await review.getByLabel('Quan sát thực tế', { exact: true }).fill('');
    // The first zero-evidence result did not create a receipt, so the same command now uses the new observation.
    await draft.getByRole('button', { name: 'Dự thảo nhận định bằng Copilot', exact: true }).click();
    await draft.getByRole('status').filter({ hasText: 'nhận định chờ duyệt' }).waitFor();
    const state = await send(`/room/state?sessionId=${session.id}`, token, undefined, 'GET');
    assert.ok(state.claims.length > 0);
    assert.ok(state.claims.every(claim => claim.status === 'pending' && !claim.evidenceIds.includes(aid.id)));
    assert.ok(state.claims.every(claim => claim.studentId === students[0].id));
    const choose = review.getByLabel('Học sinh tổng kết', { exact: true });
    await choose.selectOption(students[1].id);
    assert.equal(await review.getByText(state.claims[0].text, { exact: true }).count(), 0);
    await choose.selectOption(students[0].id);
    await teacher.screenshot({ path: `${artifacts}/g4-teacher-review.png`, fullPage: true });
    for (const width of [360, 1440]) {
      await teacher.setViewportSize({ width, height: 900 });
      assert.equal(await teacher.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await draft.scrollIntoViewIfNeeded();
      await teacher.screenshot({ path: `${artifacts}/g4-review-${width}.png` });
    }
    console.log('PASS: four local AI modes; edit/use/ignore/report; failed-request draft and retry key; aid is not observation; zero-source and pending sourced drafts; teacher/student isolation; mobile overflow. Gemini real: BLOCKED.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
