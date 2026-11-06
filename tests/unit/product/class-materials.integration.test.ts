import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../server/app.js";
import { db, loadConfig } from "../../../server/context.js";

test("class materials, remembered page, AI consent and page questions guard", {
  skip: process.env.RUN_CLASSES_INTEGRATION !== "1",
}, async () => {
  // Never touch the user's working database.
  const database = new URL(process.env.DATABASE_URL!);
  assert.equal(database.hostname, "127.0.0.1");
  assert.notEqual(database.pathname, "/copilot");
  const config = loadConfig();
  const server = createApp(config).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const call = async (path: string, token = "", method = "GET", data?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1${path}`, {
      method,
      headers: { Origin: config.origin, "Content-Type": "application/json", "Idempotency-Key": randomUUID(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  try {
    const login = (await call("/auth/mock", "", "POST", { account: "teacher-a" })).body;
    const token = login.accessToken;
    const other = (await call("/auth/mock", "", "POST", { account: "teacher-b" })).body.accessToken;
    const teacherId = (await call("/auth/me", token)).body?.teacher?.id ?? login.teacher?.id;
    assert.ok(teacherId, "teacher id");
    const made = await call("/groups", token, "POST", { name: "Lịch sử 8 · Thử tài liệu", subject: "Lịch sử", grade: "Khối 8", newStudents: ["Em Ba"] });
    assert.equal(made.status, 201);
    const groupId = made.body.group.id;
    const studentId = made.body.group.students[0].id;

    // Một tài liệu đã tải xong của gia sư này.
    const material = await db.material.create({
      data: { teacherId, title: "Chương 2 · Thử", subject: "Lịch sử", grade: "Khối 8", topic: "Thử", level: "TrungBinh", kind: "PDF", description: "", source: "test",
        MaterialVersion_materialId_items: { create: { version: 1, uploadStatus: "ready", pages: [] } } },
    });

    // Ghim: kiểm quyền, rồi hiện ở danh sách ghim và ở hộp "Dùng cho lớp".
    assert.equal((await call(`/groups/${groupId}/materials/${material.id}`, other, "PUT", { pinned: true })).status, 403);
    assert.equal((await call(`/groups/${groupId}/materials/${material.id}`, token, "PUT", { pinned: true })).status, 200);
    let mats = (await call(`/groups/${groupId}/materials`, token)).body;
    assert.equal(mats.pinned.length, 1);
    assert.equal(mats.pinned[0].lastPage, 0);
    const classes = (await call(`/materials/${material.id}/classes`, token)).body.groups;
    assert.equal(classes.find((g: { id: string }) => g.id === groupId).pinned, true);

    // Mở lớp: tài liệu ghim được gắn sẵn. Lật tới trang 4 rồi kết thúc: lớp nhớ trang đó.
    const opened = await call(`/groups/${groupId}/open`, token, "POST", {});
    const sessionId = opened.body.sessionId;
    const acts = await db.activity.findMany({ where: { sessionId } });
    assert.equal(acts.length, 1);
    assert.equal(acts[0].materialId, material.id);
    assert.equal((await call(`/sessions/${sessionId}/start`, token, "POST", {})).status, 200);
    await db.session.update({ where: { id: sessionId }, data: { materialPage: 3 } });
    assert.equal((await call(`/sessions/${sessionId}/end`, token, "POST", {})).status, 200);
    mats = (await call(`/groups/${groupId}/materials`, token)).body;
    assert.equal(mats.pinned[0].lastPage, 3);

    // Buổi sau mở tiếp đúng trang đã dừng.
    const next = await call(`/groups/${groupId}/open`, token, "POST", {});
    assert.equal(next.body.action, "created");
    const nextAct = await db.activity.findFirstOrThrow({ where: { sessionId: next.body.sessionId } });
    assert.equal(nextAct.materialStartPage, 3);

    // Bỏ ghim: chuyển sang "đã dùng", vẫn nhớ trang.
    await call(`/groups/${groupId}/materials/${material.id}`, token, "PUT", { pinned: false });
    mats = (await call(`/groups/${groupId}/materials`, token)).body;
    assert.equal(mats.pinned.length, 0);
    assert.equal(mats.used[0].lastPage, 3);

    // Chuẩn bị buổi tới: dùng lại buổi đã hẹn chứ không tạo thêm.
    const prep = await call(`/groups/${groupId}/prepare`, token, "POST", {});
    assert.equal(prep.body.sessionId, next.body.sessionId);
    assert.equal(prep.body.created, false);

    // Đồng ý AI ở mức học sinh: ghi nhận, thu hồi, chủ khác không đụng được.
    assert.equal((await call(`/students/${studentId}/ai-consent`, other, "PUT", { granted: true })).status, 404);
    assert.equal((await call(`/students/${studentId}/ai-consent`, token, "PUT", { granted: true })).body.state, "granted");
    let row = (await call(`/groups/${groupId}`, token)).body.group.students[0];
    assert.equal(row.aiConsent, "granted");
    assert.equal((await call(`/students/${studentId}/ai-consent`, token, "PUT", { granted: false })).body.state, "revoked");
    row = (await call(`/groups/${groupId}`, token)).body.group.students[0];
    assert.equal(row.aiConsent, "revoked");
    const after = (await call(`/sessions/${sessionId}/after`, token)).body;
    assert.equal(after.students[0].consent, false);

    // Câu hỏi từ trang: chặn chữ quá ngắn và buổi của gia sư khác (không gọi AI).
    assert.equal((await call(`/sessions/${sessionId}/ai/page-questions`, token, "POST", { title: "x", page: 0, text: "ngắn" })).status, 400);
    assert.equal((await call(`/sessions/${sessionId}/ai/page-questions`, other, "POST", { title: "x", page: 0, text: "Một đoạn chữ đủ dài để vượt qua bước kiểm tra độ dài tối thiểu." })).status, 404);
  } finally {
    server.close(); await once(server, "close"); await db.$disconnect();
  }
});
