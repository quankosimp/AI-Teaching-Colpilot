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
    assert.equal(res.headers.get("x-powered-by"), null, "x-powered-by must be stripped");
  } finally {
    server.close();
    await once(server, "close");
  }
});

// =========================================================================
// 2. Runtime Production Mock Guard (AUTH 004)
// =========================================================================
test(
  "G1-AUTH004: Runtime production mock guard rejects demo auth in production mode",
  { skip: "BLOCKED: Requires Product auth router mounted in server/app.ts" },
  async () => {
    // Contract requirement:
    // When NODE_ENV === 'production', POST /api/v1/auth/mock must fail closed with 403 Forbidden
    // (Never allow demo mock auth in production).
    const server = createApp().listen(0, "127.0.0.1");
    try {
      await once(server, "listening");
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const res = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/mock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nam.giasu@example.com", name: "Hoàng Nam" }),
      });
      assert.equal(res.status, 403, "Production mock guard must return HTTP 403 Forbidden in production mode");
    } finally {
      server.close();
      await once(server, "close");
    }
  },
);

// =========================================================================
// 3. G1 Functional Integration Suites (Awaiting Product Wiring & Database)
// =========================================================================

test(
  "G1-AUTH001: Teacher authentication and session token issuance",
  { skip: "BLOCKED: Requires Product auth router (/api/v1/auth) and TEST_DATABASE_URL" },
  async () => {
    // Assert 200 OK, JWT access token, HttpOnly refresh cookie, no raw tokens in body
  },
);

test(
  "G1-AUTH002: Multi-tenant workspace data isolation across teachers",
  { skip: "BLOCKED: Requires Product students router (/api/v1/students) and TEST_DATABASE_URL" },
  async () => {
    // Assert reading or writing another teacher's student returns HTTP 403
  },
);

test(
  "G1-ROOM001-003: Session creation, crypto invite token hash generation and lobby admission",
  { skip: "BLOCKED: Requires Product sessions & room router (/api/v1/sessions, /api/v1/room) and TEST_DATABASE_URL" },
  async () => {
    // Assert raw invite token returned once, tokenHash stored in DB, admission gate works
  },
);

test(
  "G1-TOOL005: Material upload intent enforces 10 MiB limit and presigned URL generation",
  { skip: "BLOCKED: Requires Product materials upload router (/api/v1/materials) and MinIO test storage" },
  async () => {
    // Assert sizeBytes <= 10 MiB accepted, > 10 MiB rejected with 400 Validation Error
  },
);

test(
  "G1-REV002-004: Evidence edit triggers cascade invalidation on approved claims and session status",
  { skip: "BLOCKED: Requires Product review router (/api/v1/claims, /api/v1/evidence) and TEST_DATABASE_URL" },
  async () => {
    // Assert editing evidence moves approved claims to pending and reviewed session to ended
  },
);
