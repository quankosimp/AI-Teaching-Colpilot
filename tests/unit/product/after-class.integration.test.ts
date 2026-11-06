import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../server/app.js";
import { db, loadConfig } from "../../../server/context.js";

test("after-class data, claim kind and resolve", {
  skip: process.env.RUN_CLASSES_INTEGRATION !== "1",
}, async () => {
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
    const token = (await call("/auth/mock", "", "POST", { account: "teacher-a" })).body.accessToken;
    const other = (await call("/auth/mock", "", "POST", { account: "teacher-b" })).body.accessToken;
    const group = (await call("/groups", token, "POST", { name: "Ngữ văn 9 · Thử", subject: "Ngữ văn", grade: "Khối 9", newStudents: ["Em Ba"] })).body.group;
    const studentId = group.students[0].id;
    const sessionId = (await call(`/groups/${group.id}/open`, token, "POST", {})).body.sessionId;
    assert.equal((await call(`/sessions/${sessionId}/after`, token)).status, 409); // chưa kết thúc
    assert.equal((await call(`/sessions/${sessionId}/start`, token, "POST", {})).status, 200);
    assert.equal((await call(`/sessions/${sessionId}/end`, token, "POST", {})).status, 200);

    let after = await call(`/sessions/${sessionId}/after`, token);
    assert.equal(after.status, 200);
    assert.equal((await call(`/sessions/${sessionId}/after`, other)).status, 404);
    assert.equal(after.body.students.length, 1);
    assert.equal(after.body.students[0].present, false);
    assert.deepEqual(after.body.students[0].evidence, []);

    // Tự thêm: quan sát của gia sư → nhận định chờ duyệt → loại → duyệt.
    const ev = await call(`/sessions/${sessionId}/evidence`, token, "POST", { studentId, kind: "GhiChu", title: "Ghi chú sau buổi", detail: "Lập dàn ý còn thiếu luận điểm phụ", support: "ChuaRo" });
    assert.equal(ev.status, 201);
    const draft = await call(`/sessions/${sessionId}/claims/draft`, token, "POST", { studentId, text: "Lập dàn ý còn thiếu luận điểm phụ", evidenceIds: [ev.body.evidence.id] });
    assert.equal(draft.status, 201);
    const claim = draft.body.claim;
    assert.equal((await call(`/claims/${claim.id}/kind`, token, "PATCH", { kind: "bad" })).status, 400);
    assert.equal((await call(`/claims/${claim.id}/kind`, other, "PATCH", { kind: "review" })).status, 403);
    assert.equal((await call(`/claims/${claim.id}/kind`, token, "PATCH", { kind: "review" })).status, 200);
    assert.equal((await call(`/claims/${claim.id}/resolve`, token, "POST", {})).status, 409); // chưa duyệt
    const approved = await call(`/claims/${claim.id}/review`, token, "PATCH", { action: "approve", revision: claim.revision, evidenceIds: [ev.body.evidence.id] });
    assert.equal(approved.status, 200);

    after = await call(`/sessions/${sessionId}/after`, token);
    assert.equal(after.body.students[0].evidence.length, 1);
    assert.equal(after.body.students[0].claims[0].kind, "review");
    assert.equal(after.body.students[0].claims[0].status, "approved");

    let detail = (await call(`/groups/${group.id}`, token)).body.group;
    assert.equal(detail.students[0].notes.length, 1);
    assert.equal(detail.students[0].notes[0].kind, "review");
    assert.equal((await call(`/claims/${claim.id}/resolve`, token, "POST", {})).status, 200);
    detail = (await call(`/groups/${group.id}`, token)).body.group;
    assert.equal(detail.students[0].notes.length, 0);
  } finally {
    server.close(); await once(server, "close"); await db.$disconnect();
  }
});
