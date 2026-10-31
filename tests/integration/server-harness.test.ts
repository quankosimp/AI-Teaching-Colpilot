import { test } from "node:test";
import { strict as assert } from "node:assert";
import { once } from "node:events";
import { createApp } from "../../server/app.js";

// =========================================================================
// 1. Standalone Liveness Probe Test (Actual Execution)
// =========================================================================
test("G1-INTEGRATION: Liveness probe responds 200 OK and sanitizes headers", async () => {
  const server = createApp().listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const res = await fetch(`http://127.0.0.1:${address.port}/health/live`);
    assert.equal(res.status, 200, "Liveness endpoint must return HTTP 200");
    const body = await res.json();
    assert.deepEqual(body, { status: "ok" });
    assert.equal(
      res.headers.get("x-powered-by"),
      null,
      "x-powered-by must be stripped",
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

// =========================================================================
// 2. Runtime Production Mock Guard (AUTH 004)
// =========================================================================
test("G1-AUTH004: Runtime production mock guard rejects demo auth in production mode", async () => {
  // In production mode, /api/v1/auth/mock must fail closed (404 Not Found)
  const prodConfig = {
    mode: "production" as const,
    origin: "https://demo.example.com",
    jwtSecret: new Uint8Array(32),
  };
  const server = createApp(prodConfig).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const res = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/auth/mock`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://demo.example.com",
        },
        body: JSON.stringify({ account: "teacher-a" }),
      },
    );
    assert.equal(
      res.status,
      404,
      "Production mock guard must return HTTP 404 Not Found in production mode",
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

// =========================================================================
// 3. G2 Feature Skips (Truthful Execution State)
// Full G1 blackbox integration is executed via tests/integration/g1-blackbox.test.ts
// =========================================================================

test(
  "G1-ROOM001-003: Session creation, crypto invite token hash generation and lobby admission",
  {
    skip: "BLOCKED: Requires G2 Room & Socket.IO implementation (/api/v1/room)",
  },
  async () => {},
);

test(
  "G1-REV002-004: Evidence edit triggers cascade invalidation on approved claims and session status",
  {
    skip: "BLOCKED: Requires G2 Review & Claims implementation (/api/v1/claims)",
  },
  async () => {},
);
