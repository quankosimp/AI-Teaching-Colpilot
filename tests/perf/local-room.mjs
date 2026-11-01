import { io } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

// Explicit opt-in only: this probe creates synthetic students/session on a local
// mock server. It measures actual HTTP and Socket.IO delivery, without providers.
const target = process.env.QA_BASE_URL;
if (!target) throw new Error("Set QA_BASE_URL to a disposable local mock server");
const origin = new URL(target).origin;
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname))
  throw new Error("This fixture is restricted to loopback targets");
const rounds = Number(process.env.PERF_ROUNDS || 30);
if (!Number.isInteger(rounds) || rounds < 30 || rounds > 200)
  throw new Error("PERF_ROUNDS must be an integer from30 to200");
const apiSamples = [];
const studentDelivery = [];
const teacherDelivery = [];
const sockets = [];
let sessionId;
let teacherToken;
let report;
let cleanupPassed = true;

async function request(path, token, method = "GET", body, measure = false, extraHeaders = {}) {
  const started = performance.now();
  const response = await fetch(`${origin}/api/v1${path}`, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new Error(`${method} ${path}: HTTP${response.status} ${data?.error?.code || "request_failed"}`);
  if (measure) apiSamples.push(performance.now() - started);
  return data;
}

async function connect(token) {
  const socket = io(`${origin}/classroom`, {
    auth: { token, sessionId, lastEventSeq: 0 },
    autoConnect: false,
    reconnection: false,
  });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Socket connect timeout")), 5000);
    socket.once("connect", () => { clearTimeout(timeout); resolve(); });
    socket.once("connect_error", () => { clearTimeout(timeout); reject(new Error("Socket connect error")); });
    socket.connect();
  });
  return socket;
}

function receipt(socket, boardId, revision, started) {
  return new Promise((resolve, reject) => {
    const onEvent = (event) => {
      if (event.sessionId !== sessionId || event.type !== "board.updated" || event.payload?.resourceId !== boardId || event.payload?.version !== revision) return;
      clearTimeout(timeout);
      socket.off("classroom.event", onEvent);
      resolve(performance.now() - started);
    };
    const timeout = setTimeout(() => {
      socket.off("classroom.event", onEvent);
      reject(new Error(`Missing board revision${revision} receipt`));
    }, 5000);
    socket.on("classroom.event", onEvent);
  });
}

function stats(values) {
  const ordered = [...values].sort((a, b) => a - b);
  if (!ordered.length || ordered.some((n) => !Number.isFinite(n)))
    throw new Error("Missing or invalid measurements");
  const rounded = (n) => Math.round(n * 100) / 100;
  return {
    samples: ordered.length,
    p50Ms: rounded(ordered[Math.ceil(ordered.length * 0.5) - 1]),
    p95Ms: rounded(ordered[Math.ceil(ordered.length * 0.95) - 1]),
    maxMs: rounded(ordered.at(-1)),
  };
}

try {
  teacherToken = (await request("/auth/mock", "", "POST", { account: "teacher-a" })).accessToken;
  const students = [];
  for (let index = 0; index < 5; index++) {
    const result = await request("/students", teacherToken, "POST", {
      name: `Load fixture ${index + 1} ${randomUUID().slice(0, 8)}`,
      grade: "9", subject: "Toán", goal: "", notes: "", strengths: [], gaps: [], status: "active",
    });
    students.push(result.student.id);
  }
  const created = await request("/sessions", teacherToken, "POST", {
    studentIds: students, title: `Load fixture ${randomUUID()}`, goal: "", sharedGoal: "Local load test",
    date: new Date().toISOString().slice(0, 10), time: "19:00", duration: 60,
    tools: { board: true, upload: true, check: true, chat: true },
  });
  sessionId = created.session.id;
  await request(`/sessions/${sessionId}/activities`, teacherToken, "PUT", [{
    title: "Shared-board load fixture", description: "", duration: 15, type: "LuyenTap",
    materialId: null, materialVersion: null, teacherNotes: null, sourceEvidenceIds: [], sourceClaimRefs: [],
  }], false, { "If-Match-Version": String(created.session.version) });
  const grants = [];
  for (const studentId of students) {
    const invite = await request(`/sessions/${sessionId}/invites`, teacherToken, "POST", { studentId });
    const grant = await request("/room/join-request", "", "POST", { token: invite.rawToken, name: "Load fixture", consent: true });
    grants.push(grant);
    await request(`/sessions/${sessionId}/members/${grant.memberId}/admit`, teacherToken, "POST", { approved: true });
  }
  await request(`/sessions/${sessionId}/start`, teacherToken, "POST", {});
  const tokens = [teacherToken, ...grants.map((grant) => grant.accessToken)];
  await Promise.all(tokens.map(connect));
  // Prime the shared board, then warm the request/outbox paths before sampling.
  const initialBoard = (await request(`/sessions/${sessionId}/boards/common`, teacherToken, "PUT", { operation: "setNote", text: "Warmup" })).board;
  let revision = initialBoard.revision;
  for (let index = 0; index < rounds + 5; index++) {
    const sampled = index >= 5;
    await Promise.all(tokens.map((token, actor) => request(
      `/room/state${actor === 0 ? `?sessionId=${sessionId}` : ""}`, token, "GET", undefined, sampled,
    )));
    const started = performance.now();
    const deliveries = Promise.all(sockets.map((socket) => receipt(socket, initialBoard.id, revision + 1, started)));
    // Attach a rejection handler immediately even if an HTTP request fails first.
    void deliveries.catch(() => {});
    const result = await request(`/sessions/${sessionId}/boards/common`, teacherToken, "PUT", { operation: "setNote", text: `Round ${index}` }, sampled);
    if (result.board.revision !== revision + 1) throw new Error("Unexpected board revision during fixture");
    revision = result.board.revision;
    const elapsed = await deliveries;
    if (sampled) {
      teacherDelivery.push(elapsed[0]);
      studentDelivery.push(...elapsed.slice(1));
    }
  }
  if (studentDelivery.length !== rounds * 5 || apiSamples.length !== rounds * 7)
    throw new Error("Incomplete sample collection");
  report = {
    sourceCommit: process.env.PERF_SOURCE_COMMIT || "unrecorded",
    timestamp: new Date().toISOString(), target: origin,
    environment: "Local-Docker loopback / Node HTTP+Socket.IO; no media or AI provider traffic",
    actors: { teacher: 1, students: 5 }, warmupRounds: 5, sampledRounds: rounds,
    api: stats(apiSamples), studentRealtime: stats(studentDelivery), teacherRealtime: stats(teacherDelivery),
    thresholds: { apiP95Ms: 500, studentRealtimeP95Ms: 1500 },
    limits: "Synthetic small shared-board session and projected state reads; not WAN/mobile-device/provider, all-endpoint or final release performance acceptance",
  };
  report.passed = report.api.p95Ms < 500 && report.studentRealtime.p95Ms < 1500;
} finally {
  if (sessionId && teacherToken) await request(`/sessions/${sessionId}/end`, teacherToken, "POST", {}).catch(() => {
    console.error("Fixture cleanup failed: synthetic session may still be live");
    cleanupPassed = false;
    process.exitCode = 1;
  });
  sockets.forEach((socket) => socket.disconnect());
}
report.fixtureCleanupPassed = cleanupPassed;
report.passed = report.passed && cleanupPassed;
if (process.env.PERF_ARTIFACT) await writeFile(process.env.PERF_ARTIFACT, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
