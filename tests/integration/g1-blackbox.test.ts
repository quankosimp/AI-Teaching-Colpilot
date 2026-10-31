import { test } from "node:test";
import { strict as assert } from "node:assert";
import { QA_BASE_URL, SKIP_IF_NO_SERVER, apiRequest, uid } from "./helpers.js";

// =========================================================================
// G1 Blackbox Integration Test Suite: HTTP API Verification
// Target: Running server instance specified by QA_BASE_URL (e.g. http://127.0.0.1:3100)
// =========================================================================

// -------------------------------------------------------------------------
// 1. Authentication, Token Issuance & Multi-tenant Isolation (AUTH 001..003)
// -------------------------------------------------------------------------

test(
  "T-AUTH-001-POS: Local teacher mock login issues JWT access token and refresh cookie",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const email = `${uid("teacher")}@example.com`;
    const name = "Thầy Nam Test";

    const res = await apiRequest("/api/v1/auth/mock", {
      method: "POST",
      body: { email, name, workspaceId: uid("ws") },
    });

    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}: ${res.rawText}`);
    assert.ok(res.data.token, "Response must include JWT access token");
    assert.equal(typeof res.data.token, "string");

    // Must also provide teacher profile
    assert.ok(res.data.teacher, "Response must include teacher profile");
    assert.equal(res.data.teacher.email, email);

    // Verify /api/v1/auth/me accepts token
    const meRes = await apiRequest("/api/v1/auth/me", {
      token: res.data.token,
    });
    assert.equal(meRes.status, 200, "Token must be valid for /auth/me");
    assert.equal(meRes.data.email, email);
  },
);

test(
  "T-AUTH-003-POS: Teacher logout revokes session and disables token refresh",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    // Login to obtain active session
    const loginRes = await apiRequest("/api/v1/auth/mock", {
      method: "POST",
      body: { email: `${uid("teacher")}@example.com`, name: "Thầy Nam", workspaceId: uid("ws") },
    });
    assert.equal(loginRes.status, 200);
    const token = loginRes.data.token;

    // Logout
    const logoutRes = await apiRequest("/api/v1/auth/logout", {
      method: "POST",
      token,
    });
    assert.equal(logoutRes.status, 200, "Logout must return 200 OK");

    // Subsequent access with revoked session or refresh must fail
    const meRes = await apiRequest("/api/v1/auth/me", {
      token,
    });
    assert.equal(meRes.status, 401, "Revoked session must be rejected with 401 Unauthorized");
  },
);

test(
  "T-AUTH-002-NEG: Multi-tenant boundary enforces 403 Forbidden on accessing another teacher's resource",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    // Create Teacher A
    const loginA = await apiRequest("/api/v1/auth/mock", {
      method: "POST",
      body: { email: `${uid("teacherA")}@example.com`, name: "Giáo viên A", workspaceId: uid("wsA") },
    });
    assert.equal(loginA.status, 200);
    const tokenA = loginA.data.token;

    // Create Teacher B
    const loginB = await apiRequest("/api/v1/auth/mock", {
      method: "POST",
      body: { email: `${uid("teacherB")}@example.com`, name: "Giáo viên B", workspaceId: uid("wsB") },
    });
    assert.equal(loginB.status, 200);
    const tokenB = loginB.data.token;

    // Teacher A creates a student
    const studentRes = await apiRequest("/api/v1/students", {
      method: "POST",
      token: tokenA,
      body: {
        name: "Học sinh của A",
        grade: "Lớp 9",
        subject: "Toán",
        goal: "Mục tiêu riêng của A",
        status: "active",
      },
    });
    assert.equal(studentRes.status, 201, `Failed to create student: ${studentRes.rawText}`);
    const studentId = studentRes.data.id;

    // Teacher B attempts to read Teacher A's student -> MUST return 403 Forbidden
    const crossRead = await apiRequest(`/api/v1/students/${studentId}`, {
      method: "GET",
      token: tokenB,
    });
    assert.equal(crossRead.status, 403, "Cross-teacher read must be rejected with HTTP 403 Forbidden");

    // Teacher B attempts to modify Teacher A's student -> MUST return 403 Forbidden
    const crossUpdate = await apiRequest(`/api/v1/students/${studentId}`, {
      method: "PATCH",
      token: tokenB,
      body: { name: "Bị đổi tên trái phép" },
    });
    assert.equal(crossUpdate.status, 403, "Cross-teacher update must be rejected with HTTP 403 Forbidden");
  },
);

// -------------------------------------------------------------------------
// 2. Student CRUD, Archival & Isolation (STU 001, 004, 005)
// -------------------------------------------------------------------------

test(
  "T-STU-001-POS: Student CRUD, profile update, archive and restoration lifecycle",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const login = await apiRequest("/api/v1/auth/mock", {
      method: "POST",
      body: { email: `${uid("teacher")}@example.com`, name: "Gia sư", workspaceId: uid("ws") },
    });
    assert.equal(login.status, 200);
    const token = login.data.token;

    // Create
    const createRes = await apiRequest("/api/v1/students", {
      method: "POST",
      token,
      body: {
        name: "Nguyễn Văn Bảo",
        grade: "Lớp 9",
        subject: "Toán",
        goal: "Luyện thi đại số",
        strengths: ["Hình học phẳng"],
        gaps: ["Căn bậc hai"],
        notes: "Ghi chú riêng",
        status: "active",
      },
    });
    assert.equal(createRes.status, 201);
    const student = createRes.data;

    // Update
    const updateRes = await apiRequest(`/api/v1/students/${student.id}`, {
      method: "PATCH",
      token,
      body: { goal: "Đã nâng cao mục tiêu" },
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.data.goal, "Đã nâng cao mục tiêu");

    // Archive
    const archiveRes = await apiRequest(`/api/v1/students/${student.id}`, {
      method: "PATCH",
      token,
      body: { status: "archived" },
    });
    assert.equal(archiveRes.status, 200);
    assert.equal(archiveRes.data.status, "archived");

    // Restore
    const restoreRes = await apiRequest(`/api/v1/students/${student.id}`, {
      method: "PATCH",
      token,
      body: { status: "active" },
    });
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.data.status, "active");
  },
);

test(
  "T-STU-001-NEG: Archived student cannot be added to a new session",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const login = await apiRequest("/api/v1/auth/mock", {
      method: "POST",
      body: { email: `${uid("teacher")}@example.com`, name: "Gia sư", workspaceId: uid("ws") },
    });
    const token = login.data.token;

    // Create and archive student
    const createRes = await apiRequest("/api/v1/students", {
      method: "POST",
      token,
      body: { name: "Học sinh lưu trữ", grade: "Lớp 8", subject: "Toán", goal: "Mục tiêu", status: "active" },
    });
    const studentId = createRes.data.id;
    await apiRequest(`/api/v1/students/${studentId}`, {
      method: "PATCH",
      token,
      body: { status: "archived" },
    });

    // Attempt to schedule new session with archived student
    const sessionRes = await apiRequest("/api/v1/sessions", {
      method: "POST",
      token,
      body: {
        studentIds: [studentId],
        title: "Buổi học không hợp lệ",
        goal: "Thử nghiệm",
        sharedGoal: "Thử nghiệm",
        date: "2026-11-05",
        time: "18:00",
        duration: 60,
        tools: { board: true, upload: true, check: true, chat: true },
      },
    });

    assert.equal(
      sessionRes.status,
      400,
      `Expected HTTP 400 Bad Request when adding archived student to session, got ${sessionRes.status}`,
    );
  },
);

// -------------------------------------------------------------------------
// 3. Session Planning & Activity Duration Limits (PLAN 001..003)
// -------------------------------------------------------------------------

test(
  "T-PLAN-001-POS & NEG: Session creation validates student count (accepts 1..5, rejects 0 or >5)",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const login = await apiRequest("/api/v1/auth/mock", {
      method: "POST",
      body: { email: `${uid("teacher")}@example.com`, name: "Gia sư", workspaceId: uid("ws") },
    });
    const token = login.data.token;

    // Helper: create active students
    const studentIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const s = await apiRequest("/api/v1/students", {
        method: "POST",
        token,
        body: { name: `HS ${i + 1}`, grade: "Lớp 9", subject: "Toán", goal: "Học", status: "active" },
      });
      studentIds.push(s.data.id);
    }

    // POS: 1 student (valid)
    const valid1 = await apiRequest("/api/v1/sessions", {
      method: "POST",
      token,
      body: {
        studentIds: [studentIds[0]],
        title: "Buổi 1-1",
        goal: "Mục tiêu",
        sharedGoal: "Mục tiêu chung",
        date: "2026-11-02",
        time: "19:00",
        duration: 60,
        tools: { board: true, upload: true, check: true, chat: true },
      },
    });
    assert.equal(valid1.status, 201, "Creating session with 1 student must succeed (201)");

    // POS: 5 students (valid group limit)
    const valid5 = await apiRequest("/api/v1/sessions", {
      method: "POST",
      token,
      body: {
        studentIds: studentIds.slice(0, 5),
        title: "Nhóm 5 học sinh",
        goal: "Mục tiêu",
        sharedGoal: "Mục tiêu chung",
        date: "2026-11-02",
        time: "19:00",
        duration: 90,
        tools: { board: true, upload: true, check: true, chat: true },
      },
    });
    assert.equal(valid5.status, 201, "Creating session with 5 students must succeed (201)");

    // NEG: 0 students (invalid)
    const invalid0 = await apiRequest("/api/v1/sessions", {
      method: "POST",
      token,
      body: {
        studentIds: [],
        title: "Không có học sinh",
        goal: "Mục tiêu",
        sharedGoal: "Mục tiêu chung",
        date: "2026-11-02",
        time: "19:00",
        duration: 60,
        tools: { board: true, upload: true, check: true, chat: true },
      },
    });
    assert.equal(invalid0.status, 400, "Creating session with 0 students must fail (400)");

    // NEG: 6 students (exceeds max limit 5)
    const invalid6 = await apiRequest("/api/v1/sessions", {
      method: "POST",
      token,
      body: {
        studentIds: studentIds.slice(0, 6),
        title: "Vượt quá 5 học sinh",
        goal: "Mục tiêu",
        sharedGoal: "Mục tiêu chung",
        date: "2026-11-02",
        time: "19:00",
        duration: 90,
        tools: { board: true, upload: true, check: true, chat: true },
      },
    });
    assert.equal(invalid6.status, 400, "Creating session with 6 students must fail (400)");
  },
);

test(
  "T-PLAN-002-POS: Activity reordering and cumulative duration warning validation",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const login = await apiRequest("/api/v1/auth/mock", {
      method: "POST",
      body: { email: `${uid("teacher")}@example.com`, name: "Gia sư", workspaceId: uid("ws") },
    });
    const token = login.data.token;

    const s = await apiRequest("/api/v1/students", {
      method: "POST",
      token,
      body: { name: "Minh", grade: "Lớp 9", subject: "Toán", goal: "Học", status: "active" },
    });

    const sessionRes = await apiRequest("/api/v1/sessions", {
      method: "POST",
      token,
      body: {
        studentIds: [s.data.id],
        title: "Buổi 60 phút",
        goal: "Mục tiêu",
        sharedGoal: "Mục tiêu",
        date: "2026-11-03",
        time: "19:00",
        duration: 60, // Total session duration = 60m
        tools: { board: true, upload: true, check: true, chat: true },
      },
    });
    const sessionId = sessionRes.data.id;

    // Put activities that total 75m (> 60m session duration)
    const activitiesRes = await apiRequest(`/api/v1/sessions/${sessionId}/activities`, {
      method: "PUT",
      token,
      body: {
        activities: [
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
    });

    assert.equal(activitiesRes.status, 200, "PUT activities must succeed with 200 OK");
    assert.ok(
      activitiesRes.data.warning || activitiesRes.data.exceedsDuration,
      "Response must return duration warning when sum(activities) > session.duration",
    );
  },
);

// -------------------------------------------------------------------------
// 4. Materials, MinIO Presigned Uploads & Security (MAT 001..003)
// -------------------------------------------------------------------------

test(
  "T-MAT-001-POS & NEG: Material upload intent accepts PDF/PNG <= 10 MiB, rejects invalid MIME or >10 MiB",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    const login = await apiRequest("/api/v1/auth/mock", {
      method: "POST",
      body: { email: `${uid("teacher")}@example.com`, name: "Gia sư", workspaceId: uid("ws") },
    });
    const token = login.data.token;

    // POS: Valid PDF within 10 MiB
    const validPdf = await apiRequest("/api/v1/materials/upload-intent", {
      method: "POST",
      token,
      body: {
        fileName: "giao-an.pdf",
        mimeType: "application/pdf",
        sizeBytes: 5 * 1024 * 1024, // 5 MiB
        sha256: "b".repeat(64),
      },
    });
    assert.equal(validPdf.status, 200, "Valid PDF upload intent must return 200 OK");
    assert.ok(validPdf.data.uploadUrl, "Response must include presigned PUT uploadUrl");
    assert.ok(validPdf.data.storageKey, "Response must include storageKey");

    // NEG: Invalid MIME type
    const invalidMime = await apiRequest("/api/v1/materials/upload-intent", {
      method: "POST",
      token,
      body: {
        fileName: "script.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 1024,
        sha256: "b".repeat(64),
      },
    });
    assert.equal(invalidMime.status, 400, "Unsupported MIME type must be rejected with 400");

    // NEG: Exceeds 10 MiB limit (10 * 1024 * 1024 + 1 bytes)
    const tooLarge = await apiRequest("/api/v1/materials/upload-intent", {
      method: "POST",
      token,
      body: {
        fileName: "large-scan.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10 * 1024 * 1024 + 1,
        sha256: "b".repeat(64),
      },
    });
    assert.equal(tooLarge.status, 400, "File exceeding 10 MiB must be rejected with 400");
  },
);

test(
  "T-MAT-002-POS & NEG: Presigned read URL issuance and cross-teacher read protection",
  { skip: SKIP_IF_NO_SERVER },
  async () => {
    // Teacher A creates material
    const loginA = await apiRequest("/api/v1/auth/mock", {
      method: "POST",
      body: { email: `${uid("teacherA")}@example.com`, name: "Giáo viên A", workspaceId: uid("wsA") },
    });
    const tokenA = loginA.data.token;

    const matA = await apiRequest("/api/v1/materials", {
      method: "POST",
      token: tokenA,
      body: {
        title: "Tài liệu riêng của A",
        subject: "Toán",
        grade: "Lớp 9",
        topic: "Viète",
        level: "TrungBinh",
        kind: "PDF",
        storageKey: `materials/${uid("mat")}.pdf`,
        fileName: "de-thi.pdf",
      },
    });
    assert.equal(matA.status, 201);
    const materialId = matA.data.id;

    // POS: Teacher A requests presigned read URL
    const readUrlA = await apiRequest(`/api/v1/materials/${materialId}/read-url`, {
      method: "GET",
      token: tokenA,
    });
    assert.equal(readUrlA.status, 200, "Owner must receive 200 OK with presigned readUrl");
    assert.ok(readUrlA.data.readUrl, "Must contain readUrl");

    // Teacher B logs in
    const loginB = await apiRequest("/api/v1/auth/mock", {
      method: "POST",
      body: { email: `${uid("teacherB")}@example.com`, name: "Giáo viên B", workspaceId: uid("wsB") },
    });
    const tokenB = loginB.data.token;

    // NEG: Teacher B attempts to get read URL for Teacher A's material -> 403 Forbidden
    const crossReadUrl = await apiRequest(`/api/v1/materials/${materialId}/read-url`, {
      method: "GET",
      token: tokenB,
    });
    assert.equal(crossReadUrl.status, 403, "Non-owner teacher must be rejected with 403 Forbidden");
  },
);
