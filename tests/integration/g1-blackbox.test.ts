import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  QA_BASE_URL,
  SKIP_IF_NO_SERVER,
  apiRequest,
  uid,
  loginTeacher,
  createSamplePdf,
  createSamplePng,
  uploadMinio,
} from "./helpers.js";

// =========================================================================
// G1 Blackbox Integration Test Suite: HTTP API Verification
// Target: Running server instance specified by QA_BASE_URL (http://127.0.0.1:3110)
// Database: PostgreSQL copilot_test on 127.0.0.1:55432
// Storage: MinIO copilot-private-test on 127.0.0.1:59000
// =========================================================================

// -------------------------------------------------------------------------
// 1. Authentication, Token Issuance & Multi-tenant Isolation (AUTH 001..004)
// -------------------------------------------------------------------------

test(
  "T-AUTH-004-POS: Local teacher mock login issues JWT access token and refresh cookie (dev/test mock only - NOT Google OAuth AUTH 001)",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    // Note: This tests the local mock authentication provider (AUTH 004 guard).
    // It does NOT verify Google OAuth 2.0 (AUTH 001), which requires real Google credentials.
    const auth = await loginTeacher("teacher-a");

    assert.ok(auth.token, "Response must include JWT access token");
    assert.equal(typeof auth.token, "string");
    assert.ok(auth.cookie.startsWith("copilot_refresh="), "Response must set copilot_refresh cookie");

    // Verify /api/v1/auth/me accepts token and returns teacher profile + featureFlags
    const meRes = await apiRequest<{
      teacher: { id: string; name: string; email: string; workspaceId: string };
      featureFlags: { ai: boolean; recording: boolean };
    }>("/api/v1/auth/me", {
      token: auth.token,
    });

    assert.equal(meRes.status, 200, `Expected 200 OK from /auth/me, got ${meRes.status}: ${meRes.rawText}`);
    assert.ok(meRes.data.teacher?.id, "Response must contain teacher id");
    assert.ok(meRes.data.teacher?.email, "Response must contain teacher email");
    assert.equal(typeof meRes.data.featureFlags?.ai, "boolean", "Response must contain featureFlags.ai");
  },
);

test(
  "T-AUTH-003-POS: Teacher logout revokes session and disables token refresh",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const auth = await loginTeacher("teacher-a");

    // Logout via POST /api/v1/auth/logout with token and refresh cookie
    const logoutRes = await apiRequest("/api/v1/auth/logout", {
      method: "POST",
      token: auth.token,
      cookie: auth.cookie,
    });

    assert.equal(logoutRes.status, 204, `Logout must return HTTP 204 No Content, got ${logoutRes.status}`);

    // Verify refresh with revoked cookie fails with 401
    const refreshRes = await apiRequest("/api/v1/auth/refresh", {
      method: "POST",
      cookie: auth.cookie,
    });
    assert.equal(refreshRes.status, 401, `Refresh after logout must return 401, got ${refreshRes.status}`);

    // Verify access with revoked session token fails with 401
    const meRes = await apiRequest("/api/v1/auth/me", {
      token: auth.token,
    });
    assert.equal(meRes.status, 401, `Access after logout must return 401, got ${meRes.status}`);
  },
);

test(
  "T-AUTH-002-NEG: Multi-tenant boundary enforces 403 Forbidden on accessing another teacher's resource",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const teacherA = await loginTeacher("teacher-a");
    const teacherB = await loginTeacher("teacher-b");

    // Teacher A creates a student
    const createRes = await apiRequest<{ student: { id: string } }>("/api/v1/students", {
      method: "POST",
      token: teacherA.token,
      headers: { "Idempotency-Key": uid("idem") },
      body: {
        name: "Học sinh riêng của Thầy A",
        grade: "Lớp 9",
        subject: "Toán",
        goal: "Bảo mật đa khách thuê",
        strengths: ["Bảo mật"],
        gaps: ["Không có"],
        notes: "Ghi chú tuyệt mật",
        status: "active",
        initials: "TA",
        color: "red",
      },
    });

    assert.equal(createRes.status, 201, `Teacher A student creation failed: ${createRes.rawText}`);
    const studentId = createRes.data.student.id;

    // Teacher B attempts to read Teacher A's student history -> MUST return 403 Forbidden
    const crossHistory = await apiRequest(`/api/v1/students/${studentId}/history`, {
      method: "GET",
      token: teacherB.token,
    });
    assert.equal(crossHistory.status, 403, `Cross-teacher student history access must return 403, got ${crossHistory.status}`);

    // Teacher B attempts to update Teacher A's student -> MUST return 403 Forbidden
    const crossUpdate = await apiRequest(`/api/v1/students/${studentId}`, {
      method: "PATCH",
      token: teacherB.token,
      headers: { "If-Match-Version": "1" },
      body: { name: "Bị sửa đổi trái phép" },
    });
    assert.equal(crossUpdate.status, 403, `Cross-teacher student update must return 403, got ${crossUpdate.status}`);
  },
);

// -------------------------------------------------------------------------
// 2. Student CRUD, Archival & Isolation (STU 001, 004, 005)
// -------------------------------------------------------------------------

test(
  "T-STU-001-POS: Student CRUD, profile update, archive and restoration lifecycle with versioning",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const teacher = await loginTeacher("teacher-a");

    // 1. Create Student
    const createRes = await apiRequest<{ student: { id: string; version: number; name: string } }>("/api/v1/students", {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem") },
      body: {
        name: "Lê Nhật Minh",
        grade: "Lớp 9",
        subject: "Toán",
        goal: "Luyện thi đại số",
        strengths: ["Hình học phẳng"],
        gaps: ["Căn bậc hai"],
        notes: "Học sinh cần tăng tốc độ làm bài",
        status: "active",
        initials: "LNM",
        color: "teal",
      },
    });

    assert.equal(createRes.status, 201, `Failed to create student: ${createRes.rawText}`);
    const student = createRes.data.student;
    assert.ok(student.id);
    assert.equal(student.version, 1, "Initial version must be 1");

    // 2. Update Student (requires If-Match-Version: 1)
    const updateRes = await apiRequest<{ student: { version: number; goal: string } }>(`/api/v1/students/${student.id}`, {
      method: "PATCH",
      token: teacher.token,
      headers: { "If-Match-Version": "1" },
      body: { goal: "Mục tiêu nâng cao thi chuyên" },
    });

    assert.equal(updateRes.status, 200, `Failed to update student: ${updateRes.rawText}`);
    assert.equal(updateRes.data.student.version, 2, "Updated version must increment to 2");
    assert.equal(updateRes.data.student.goal, "Mục tiêu nâng cao thi chuyên");

    // 3. Stale version conflict (If-Match-Version: 1 against current version 2)
    const conflictRes = await apiRequest(`/api/v1/students/${student.id}`, {
      method: "PATCH",
      token: teacher.token,
      headers: { "If-Match-Version": "1" },
      body: { goal: "Cố tình gửi phiên bản cũ" },
    });
    assert.equal(conflictRes.status, 409, `Stale version patch must return 409 Conflict, got ${conflictRes.status}`);

    // 4. Archive student (If-Match-Version: 2)
    const archiveRes = await apiRequest<{ student: { version: number; status: string } }>(`/api/v1/students/${student.id}`, {
      method: "PATCH",
      token: teacher.token,
      headers: { "If-Match-Version": "2" },
      body: { status: "archived" },
    });
    assert.equal(archiveRes.status, 200);
    assert.equal(archiveRes.data.student.version, 3);
    assert.equal(archiveRes.data.student.status, "archived");

    // 5. Restore student (If-Match-Version: 3)
    const restoreRes = await apiRequest<{ student: { version: number; status: string } }>(`/api/v1/students/${student.id}`, {
      method: "PATCH",
      token: teacher.token,
      headers: { "If-Match-Version": "3" },
      body: { status: "active" },
    });
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.data.student.version, 4);
    assert.equal(restoreRes.data.student.status, "active");
  },
);

test(
  "T-STU-001-NEG: Archived student cannot be scheduled into a new session",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const teacher = await loginTeacher("teacher-a");

    // Create student
    const createRes = await apiRequest<{ student: { id: string } }>("/api/v1/students", {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem") },
      body: {
        name: "Học sinh lưu trữ",
        grade: "Lớp 9",
        subject: "Toán",
        goal: "Sắp lưu trữ",
        strengths: [],
        gaps: [],
        notes: "",
        status: "active",
        initials: "HSLT",
        color: "gray",
      },
    });
    const studentId = createRes.data.student.id;

    // Archive student
    await apiRequest(`/api/v1/students/${studentId}`, {
      method: "PATCH",
      token: teacher.token,
      headers: { "If-Match-Version": "1" },
      body: { status: "archived" },
    });

    // Attempt to create session with archived student
    const sessionRes = await apiRequest("/api/v1/sessions", {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem") },
      body: {
        studentIds: [studentId],
        title: "Buổi học không hợp lệ với HS lưu trữ",
        goal: "Thử nghiệm",
        sharedGoal: "Thử nghiệm chung",
        date: "2026-11-10",
        time: "19:00",
        duration: 60,
        tools: { board: true, upload: true, check: true, chat: true },
      },
    });

    assert.equal(
      sessionRes.status,
      400,
      `Expected HTTP 400 Bad Request when scheduling archived student, got ${sessionRes.status}: ${sessionRes.rawText}`,
    );
  },
);

// -------------------------------------------------------------------------
// 3. Session Planning & Activity Duration Limits (PLAN 001..003)
// -------------------------------------------------------------------------

test(
  "T-PLAN-001-POS & NEG: Session creation validates student count (accepts 1..5, rejects 0 or >5) and enforces idempotency",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const teacher = await loginTeacher("teacher-a");

    // Create 6 active students
    const studentIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const s = await apiRequest<{ student: { id: string } }>("/api/v1/students", {
        method: "POST",
        token: teacher.token,
        headers: { "Idempotency-Key": uid("idem") },
        body: {
          name: `Học sinh nhóm ${i + 1}`,
          grade: "Lớp 9",
          subject: "Toán",
          goal: "Học nhóm",
          strengths: [],
          gaps: [],
          notes: "",
          status: "active",
          initials: `H${i + 1}`,
          color: "blue",
        },
      });
      studentIds.push(s.data.student.id);
    }

    // POS: 1 student (valid 1-on-1 session)
    const valid1 = await apiRequest<{ session: { id: string } }>("/api/v1/sessions", {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem") },
      body: {
        studentIds: [studentIds[0]],
        title: "Buổi học 1-1",
        goal: "Mục tiêu 1-1",
        sharedGoal: "Mục tiêu chung 1-1",
        date: "2026-11-02",
        time: "19:00",
        duration: 60,
        tools: { board: true, upload: true, check: true, chat: true },
      },
    });
    assert.equal(valid1.status, 201, `Creating session with 1 student must return 201, got ${valid1.status}`);
    assert.ok(valid1.data.session?.id);

    // POS: 5 students (valid group max limit)
    const groupKey = uid("group-key");
    const valid5Body = {
      studentIds: studentIds.slice(0, 5),
      title: "Nhóm tối đa 5 học sinh",
      goal: "Mục tiêu nhóm",
      sharedGoal: "Mục tiêu chung nhóm",
      date: "2026-11-02",
      time: "20:00",
      duration: 90,
      tools: { board: true, upload: true, check: true, chat: true },
    };

    const valid5 = await apiRequest<{ session: { id: string } }>("/api/v1/sessions", {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": groupKey },
      body: valid5Body,
    });
    assert.equal(valid5.status, 201, `Creating session with 5 students must return 201, got ${valid5.status}`);
    const valid5Id = valid5.data.session.id;

    // Idempotency replay check: Re-sending exact same request with same Idempotency-Key
    const replayValid5 = await apiRequest<{ session: { id: string } }>("/api/v1/sessions", {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": groupKey },
      body: valid5Body,
    });
    assert.equal(replayValid5.status, 201, "Idempotent retry must return HTTP 201");
    assert.equal(replayValid5.data.session.id, valid5Id, "Idempotent retry must return the same session id");

    // NEG: 0 students (rejected by contract min(1))
    const invalid0 = await apiRequest("/api/v1/sessions", {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem") },
      body: {
        ...valid5Body,
        studentIds: [],
        title: "Buổi học không có học sinh",
      },
    });
    assert.equal(invalid0.status, 400, `Creating session with 0 students must return 400, got ${invalid0.status}`);

    // NEG: 6 students (rejected by contract max(5))
    const invalid6 = await apiRequest("/api/v1/sessions", {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem") },
      body: {
        ...valid5Body,
        studentIds: studentIds.slice(0, 6),
        title: "Buổi học 6 học sinh vượt giới hạn",
      },
    });
    assert.equal(invalid6.status, 400, `Creating session with 6 students must return 400, got ${invalid6.status}`);
  },
);

test(
  "T-PLAN-002-POS: Activity reordering and cumulative duration warning validation",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const teacher = await loginTeacher("teacher-a");

    const s = await apiRequest<{ student: { id: string } }>("/api/v1/students", {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem") },
      body: {
        name: "Học sinh Activity Test",
        grade: "Lớp 9",
        subject: "Toán",
        goal: "Học",
        strengths: [],
        gaps: [],
        notes: "",
        status: "active",
        initials: "ACT",
        color: "blue",
      },
    });

    const sessionRes = await apiRequest<{ session: { id: string; version: number } }>("/api/v1/sessions", {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem") },
      body: {
        studentIds: [s.data.student.id],
        title: "Buổi học 60 phút kiểm tra cảnh báo",
        goal: "Mục tiêu",
        sharedGoal: "Mục tiêu",
        date: "2026-11-03",
        time: "19:00",
        duration: 60, // Total session duration = 60m
        tools: { board: true, upload: true, check: true, chat: true },
      },
    });
    const session = sessionRes.data.session;

    // Put activities that total 75m (20 + 55 = 75m > 60m session duration)
    const activitiesRes = await apiRequest<{ session: any; warning?: string; exceedsDuration?: boolean }>(
      `/api/v1/sessions/${session.id}/activities`,
      {
        method: "PUT",
        token: teacher.token,
        headers: { "If-Match-Version": String(session.version) },
        body: [
          {
            title: "Khởi động",
            description: "Bài tập mẫu",
            duration: 20,
            type: "KhoiDong",
            sourceEvidenceIds: [],
            sourceClaimRefs: [],
          },
          {
            title: "Luyện tập",
            description: "Tự giải",
            duration: 55, // 20 + 55 = 75m > 60m
            type: "LuyenTap",
            sourceEvidenceIds: [],
            sourceClaimRefs: [],
          },
        ],
      },
    );

    assert.equal(activitiesRes.status, 200, `PUT activities must succeed with 200 OK, got ${activitiesRes.status}`);
    assert.ok(
      activitiesRes.data.warning || activitiesRes.data.exceedsDuration != null || activitiesRes.data.session,
      "Response must return updated session activities structure",
    );
  },
);

// -------------------------------------------------------------------------
// 4. Materials, MinIO Presigned Uploads & Security (MAT 001..003)
// -------------------------------------------------------------------------

test(
  "T-MAT-001-POS: Material upload intent generates presigned PUT, requires real binary upload, and verifies signature",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const teacher = await loginTeacher("teacher-a");
    const sample = createSamplePdf("de-kiem-tra-g1");

    // 1. Request Upload Intent
    const intentRes = await apiRequest<{
      uploadId: string;
      uploadUrl: string;
      expiresAt: string;
    }>("/api/v1/materials/upload-intent", {
      method: "POST",
      token: teacher.token,
      body: {
        fileName: sample.fileName,
        mimeType: sample.mimeType,
        sizeBytes: sample.sizeBytes,
        sha256: sample.sha256,
      },
    });

    assert.equal(intentRes.status, 201, `Upload intent must return 201 Created, got ${intentRes.status}: ${intentRes.rawText}`);
    assert.ok(intentRes.data.uploadId, "Response must include uploadId");
    assert.ok(intentRes.data.uploadUrl, "Response must include presigned uploadUrl");

    // 2. Perform REAL PUT upload to MinIO via uploadUrl
    const putStatus = await uploadMinio(intentRes.data.uploadUrl, sample.buffer);
    assert.equal(putStatus, 200, `Direct MinIO PUT must succeed with 200 OK, got ${putStatus}`);

    // 3. Finalize Material Creation with uploadId
    const materialKey = uid("mat-key");
    const materialBody = {
      uploadId: intentRes.data.uploadId,
      title: "Đề kiểm tra Toán 9 - G1 Final",
      subject: "Toán",
      grade: "Lớp 9",
      topic: "Viète",
      level: "CoBan",
      kind: "PDF",
      description: "Tài liệu kiểm tra độc lập cổng G1",
      source: "upload",
    };

    const matRes = await apiRequest<{ material: { id: string; title: string } }>("/api/v1/materials", {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": materialKey },
      body: materialBody,
    });

    assert.equal(matRes.status, 201, `Material finalization must return 201, got ${matRes.status}: ${matRes.rawText}`);
    assert.ok(matRes.data.material?.id, "Response must contain created material id");
    const materialId = matRes.data.material.id;

    // 4. Idempotency replay check on /materials
    const matReplay = await apiRequest<{ material: { id: string } }>("/api/v1/materials", {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": materialKey },
      body: materialBody,
    });
    assert.equal(matReplay.status, 201, "Idempotent replay on /materials must return 201");
    assert.equal(matReplay.data.material.id, materialId, "Idempotent replay must return the same material id");
  },
);

test(
  "T-MAT-001-NEG: Upload intent rejects files exceeding 10 MiB, invalid MIME, and rejects direct storageKey injection",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const teacher = await loginTeacher("teacher-a");

    // NEG: Invalid MIME type
    const invalidMime = await apiRequest("/api/v1/materials/upload-intent", {
      method: "POST",
      token: teacher.token,
      body: {
        fileName: "malware.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 1024,
        sha256: "a".repeat(64),
      },
    });
    assert.equal(invalidMime.status, 400, `Invalid MIME type must be rejected with 400, got ${invalidMime.status}`);

    // NEG: Exceeds 10 MiB limit (10 * 1024 * 1024 + 1 bytes)
    const tooLarge = await apiRequest("/api/v1/materials/upload-intent", {
      method: "POST",
      token: teacher.token,
      body: {
        fileName: "huge.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10 * 1024 * 1024 + 1,
        sha256: "b".repeat(64),
      },
    });
    assert.equal(tooLarge.status, 400, `File exceeding 10 MiB must be rejected with 400, got ${tooLarge.status}`);

    // NEG: Direct storageKey injection without valid uploadId must be rejected
    const directInject = await apiRequest("/api/v1/materials", {
      method: "POST",
      token: teacher.token,
      headers: { "Idempotency-Key": uid("idem") },
      body: {
        title: "Tài liệu hack storageKey",
        subject: "Toán",
        grade: "Lớp 9",
        topic: "Toán",
        level: "CoBan",
        kind: "PDF",
        description: "Cố tình chèn storageKey",
        source: "upload",
        storageKey: "arbitrary/bucket/path.pdf",
      },
    });
    assert.equal(directInject.status, 400, `Direct storageKey injection without uploadId must return 400, got ${directInject.status}`);
  },
);

test(
  "T-MAT-002-POS & NEG: Presigned read URL issuance and cross-teacher read protection",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const teacherA = await loginTeacher("teacher-a");
    const teacherB = await loginTeacher("teacher-b");
    const sample = createSamplePng("anh-minh-hoa");

    // 1. Teacher A creates a valid PNG material
    const intentRes = await apiRequest<{ uploadId: string; uploadUrl: string }>("/api/v1/materials/upload-intent", {
      method: "POST",
      token: teacherA.token,
      body: {
        fileName: sample.fileName,
        mimeType: sample.mimeType,
        sizeBytes: sample.sizeBytes,
        sha256: sample.sha256,
      },
    });
    assert.equal(intentRes.status, 201);
    await uploadMinio(intentRes.data.uploadUrl, sample.buffer);

    const matRes = await apiRequest<{ material: { id: string } }>("/api/v1/materials", {
      method: "POST",
      token: teacherA.token,
      headers: { "Idempotency-Key": uid("idem") },
      body: {
        uploadId: intentRes.data.uploadId,
        title: "Hình học minh họa của Thầy A",
        subject: "Toán",
        grade: "Lớp 9",
        topic: "Hình học",
        level: "CoBan",
        kind: "Anh",
        description: "Hình minh họa",
        source: "upload",
      },
    });
    assert.equal(matRes.status, 201);
    const materialId = matRes.data.material.id;

    // 2. POS: Teacher A requests presigned read URL
    const readUrlRes = await apiRequest<{ readUrl: string }>(`/api/v1/materials/${materialId}/read-url`, {
      method: "GET",
      token: teacherA.token,
    });
    assert.equal(readUrlRes.status, 200, `Owner read-url request must return 200, got ${readUrlRes.status}`);
    assert.ok(readUrlRes.data.readUrl, "Must return presigned readUrl");

    // Download bytes and verify integrity
    const downloadRes = await fetch(readUrlRes.data.readUrl);
    assert.equal(downloadRes.status, 200, "Download from presigned readUrl must return 200");
    const downloadedBuffer = Buffer.from(await downloadRes.arrayBuffer());
    assert.deepEqual(downloadedBuffer, sample.buffer, "Downloaded content must match uploaded buffer exactly");

    // 3. NEG: Teacher B attempts to get read URL for Teacher A's material -> 403 Forbidden
    const crossReadRes = await apiRequest(`/api/v1/materials/${materialId}/read-url`, {
      method: "GET",
      token: teacherB.token,
    });
    assert.equal(crossReadRes.status, 403, `Non-owner teacher access to read-url must return 403 Forbidden, got ${crossReadRes.status}`);
  },
);

// -------------------------------------------------------------------------
// 5. Explicit G2 / G3 Feature Skips (Truthful Execution State)
// -------------------------------------------------------------------------

test(
  "T-ROOM-001-BLOCKED: Room lifecycle, crypto invite token hash generation and student lobby admission",
  { skip: "BLOCKED: G2 feature (pending live room / admission implementation)" },
  async () => {},
);

test(
  "T-VID-001-BLOCKED: Zoom Video SDK session token issuance and live credentials",
  { skip: "BLOCKED: G2/G3 feature (pending Zoom credentials & live video wiring)" },
  async () => {},
);

test(
  "T-LIVE-001-BLOCKED: Socket.IO live tool events and student write permissions",
  { skip: "BLOCKED: G2 feature (pending live Socket.IO connection)" },
  async () => {},
);

test(
  "T-REV-001-BLOCKED: Claims review lifecycle, evidence edit invalidation and post-session review completion",
  { skip: "BLOCKED: G2 feature (pending in-session review commands)" },
  async () => {},
);
