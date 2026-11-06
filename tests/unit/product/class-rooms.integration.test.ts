import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../server/app.js";
import { db, loadConfig } from "../../../server/context.js";

test("class schedule and open-class flow", {
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
    const token = (await call("/auth/mock", "", "POST", { account: "teacher-a" })).body.accessToken;
    const other = (await call("/auth/mock", "", "POST", { account: "teacher-b" })).body.accessToken;
    const made = await call("/groups", token, "POST", { name: "Tiếng Anh 7 · Thử", subject: "Tiếng Anh", grade: "Khối 7", newStudents: ["Em Một", "Em Hai"] });
    assert.equal(made.status, 201);
    const groupId = made.body.group.id;

    // Schedule: validation, ownership, save, list shape, clear.
    assert.equal((await call(`/groups/${groupId}/schedule`, token, "PUT", { days: [9], time: "19:30" })).status, 400);
    assert.equal((await call(`/groups/${groupId}/schedule`, other, "PUT", { days: [4], time: "19:30" })).status, 403);
    const saved = await call(`/groups/${groupId}/schedule`, token, "PUT", { days: [4], time: "19:30" });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.schedule, { days: [4], time: "19:30" });
    let list = (await call("/groups", token)).body.groups.find((g: { id: string }) => g.id === groupId);
    assert.deepEqual(list.schedule, { days: [4], time: "19:30" });
    assert.equal(new Date(`${list.nextAt.date}T00:00:00Z`).getUTCDay(), 4);
    assert.equal(list.nextAt.sessionId, null);
    assert.equal(list.live, null);
    assert.equal((await call(`/groups/${groupId}/schedule`, token, "DELETE")).body.schedule, null);

    // Open: creates a session for today, then rejoins it once live.
    const opened = await call(`/groups/${groupId}/open`, token, "POST", {});
    assert.equal(opened.status, 200);
    assert.equal(opened.body.action, "created");
    assert.equal(opened.body.needsStart, true);
    const sessionId = opened.body.sessionId;
    assert.equal((await call(`/sessions/${sessionId}/start`, token, "POST", {})).status, 200);
    const again = await call(`/groups/${groupId}/open`, token, "POST", {});
    assert.deepEqual(again.body, { sessionId, action: "rejoin", needsStart: false });
    list = (await call("/groups", token)).body.groups.find((g: { id: string }) => g.id === groupId);
    assert.equal(list.live.sessionId, sessionId);
    assert.equal(list.live.total, 2);
    assert.equal((await call(`/groups/${groupId}/open`, other, "POST", {})).status, 403);

    // Detail carries notes and session usage fields.
    const detail = (await call(`/groups/${groupId}`, token)).body.group;
    assert.ok(Array.isArray(detail.students[0].notes));
    assert.ok(Array.isArray(detail.sessions[0].used));
    assert.equal(typeof detail.sessions[0].pendingSubmissions, "number");

    // Empty class cannot be opened.
    const empty = (await call("/groups", token, "POST", { name: "Lớp trống", subject: "Ngữ văn", grade: "Khối 9" })).body.group;
    assert.equal((await call(`/groups/${empty.id}/open`, token, "POST", {})).status, 409);
  } finally {
    server.close(); await once(server, "close"); await db.$disconnect();
  }
});
