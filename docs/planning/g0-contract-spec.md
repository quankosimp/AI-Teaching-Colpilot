# G0 contract specification — supervisor normalized

Status: design reviewed; runtime contracts and migration still require G0 validation and independent audit before freeze.

The approved master/ownership decisions override raw ARCH wording. Canonical paths are contracts/**, server/**, prisma/**. PRODUCT authors runtime contracts and container/data wiring; UI owns only src/product/ui.tsx, src/product/*.css and src/product/presentation/**. PRODUCT owns tests/unit/product/**; QA owns remaining test namespaces, fixtures and test workflow. Supervisor owns planning/RTM.

Additional binding clarifications:
- Activity must distinguish teacher-only assessment/notes from student-visible description; group goals and activity projections never include private reviews, Claim text or source references.
- Actor checks and live-session gates apply to student tool writes. Teacher grading, source corrections and review continue after session ended. No ended/reviewed session reopens its live tools.
- Common-board commands must preserve others' strokes; a student cannot replace the whole shared board or undo another author by submitting a full JSON body.
- Invite raw tokens, refresh tokens, student bearer tokens and Zoom JWTs must not be stored in AuditLog or plaintext idempotency response caches. Invite read responses are summaries; creation returns the raw secret once.
- The outbox has publication state/attempts and an atomic per-session sequence allocation; notification retries and replay apply actor projection. Don't emit an unfiltered teacher event payload into a public room.
- Claim approval validates evidence ownership (same teacher/student/session), observation eligibility and current source revisions. Relabel must invalidate, never silently transfer a multi-source claim to a different student.
- Bounded reconnect queue: 50 commands, 1 MiB, 5-minute TTL; idempotent commands only; revalidate membership/tools/session on replay, keep unsent user drafts and reject after ended.
- Liveness is process-only. Readiness checks required DB/storage; AI/media health reports configuration and cached probe outcomes, never sends a billable Gemini prompt on every public health check.
- Source snapshots/revisions are immutable; the live board remains editable under author policy. isObservation=false AI aids cannot alone substantiate competence claims.
- Auth/media mock providers are allowed only local/test. Real staging and production fail closed if a mock is configured; feature-disabled AI permits normal teaching without a fabricated model response.
- Freeze is released only after compiled schemas, Prisma validation/client generation, privacy/transition contract tests and independent review. Provider-real gates remain blocked without credentials; local/mock development can continue.

---

# ĐẶC TẢ THỰC THI CONTRACTS G0 (`G0-ARCH`)

Tài liệu này đóng băng hợp đồng kỹ thuật **G0** cho kiến trúc **Node 22 + Express + TypeScript (Modular Monolith) + PostgreSQL/Prisma + Socket.IO + MinIO (Private) + Caddy HTTPS + Gemini + Zoom Video SDK UI Toolkit**, bám sát **60 yêu cầu P0** (và cổng mở cho **13 P1**) trong [`docs/build_srs.py`](file:///home/quanan/AI-Teaching-Colpilot/docs/build_srs.py#L555-L955) và kế hoạch đã duyệt.

---

## 1. Phân quyền Ownership Đường dẫn (Chống xung đột Worktree)

* **`PRODUCT` (Owner thực thi contract + logic + backend + adapters + store wiring)**:
  * Tạo và sở hữu: `prisma/schema.prisma`, `prisma/migrations/**`, `contracts/**` (canonical types/schemas), `server/**`, `src/product/store.tsx`, `src/product/adapters.ts`, `src/product/permissions.ts`, `src/product/model.ts` (re-export từ `contracts`).
* **`UI` (Owner presentation thuần túy)**:
  * Sở hữu: `src/product/*.css` (`product.css`, `refinement.css`, `classroom.css`) và tầng hiển thị trong `src/product/*.tsx` chỉ nhận dữ liệu/hành động qua `ViewModel` + `UIHandlers` từ `contracts/ui.ts`. Không gọi `fetch`, `socket`, `localStorage`, Zoom SDK hay Gemini trực tiếp.
* **`QA` (Owner kiểm thử)**:
  * Sở hữu: `tests/**`, `playwright.config.*`, `vitest.config.*`, `verification/**`.
* **`REVIEW` & `ARCH` (Read-only)**:
  * Không sửa file; kiểm tra tuân thủ contract và gate G0–G4.

---

## 2. Canonical Prisma Schema Specification (`prisma/schema.prisma`)

Tái sử dụng trường từ [`src/product/model.ts`](file:///home/quanan/AI-Teaching-Colpilot/src/product/model.ts#L1-L264), bổ sung định danh máy chủ, khóa ngoại, kiểm soát phiên bản (`version`/`revision`) và lịch sử bất biến:

1. **Identity & Auth (`M01` — `AUTH 001..004`)**:
   * `Teacher`: `id (uuid)`, `email`, `name`, `avatarUrl?`, `workspaceId (uuid)`, `status (active|disabled)`, `createdAt`, `updatedAt`.
   * `TeacherOAuthIdentity`: `id`, `teacherId`, `provider ("google"|"mock")`, `providerSubject` — **`@@unique([provider, providerSubject])`** (`AUTH 001`: không dùng email làm khóa duy nhất).
   * `TeacherAuthSession`: `id`, `teacherId`, `refreshTokenHash (sha256, unique)`, `userAgent?`, `ipAddress?`, `expiresAt`, `revokedAt?`, `createdAt` (`AUTH 003`).
2. **Students & Groups (`M02` — `STU 001,002,004,005`)**:
   * `Student`: `id`, `teacherId`, `name`, `grade`, `subject`, `goal`, `status (active|archived)`, `strengths (String[])`, `gaps (String[])`, `notes (Text, teacher-private)`, `initials`, `color`, `version (Int @default(1))`, `archivedAt?`, `createdAt`, `updatedAt`. Index: `@@index([teacherId, status])`.
   * `StudentGroup`: `id`, `teacherId`, `name`, `grade`, `subject`, `createdAt`.
   * `StudentGroupMember`: `groupId`, `studentId` (`@@id([groupId, studentId])`).
3. **Materials & Private Files (`M03` — `MAT 001,002,003,005`)**:
   * `Material`: `id`, `teacherId`, `title`, `subject`, `grade`, `topic`, `level (CoBan|TrungBinh|NangCao)`, `kind (PDF|Anh|BaiTap|GhiChu)`, `description`, `source`, `currentVersion (Int @default(1))`, `archivedAt?`, `createdAt`, `updatedAt`.
   * `MaterialVersion`: `id`, `materialId`, `version (Int)`, `storageKey (String?)`, `mimeType (String?)`, `sizeBytes (Int?)`, `sha256 (String?)`, `pages (String[])`, `uploadStatus (pending|ready|failed)`, `createdAt` — **`@@unique([materialId, version])`**.
4. **Sessions, Activities, Members & Crypto Invites (`M04, M05, M07` — `PLAN 001..004`, `LIVE 001..006`, `ROOM 001..006`)**:
   * `Session`: `id`, `teacherId`, `primaryStudentId`, `groupId?`, `groupName?`, `title`, `goal (Text, teacher-internal)`, `sharedGoal (Text, student-visible)`, `date (YYYY-MM-DD)`, `time (HH:mm)`, `duration (Int)`, `status (draft|scheduled|live|ended|reviewed)`, `currentActivityId?`, `sharedView (document|board|check @default(document))`, `sharedBoardOwnerId (@default("common"))`, `materialPage (Int @default(0))`, `tools (Json: {board,upload,check,chat})`, `completedActivityIds (String[])`, `dismissedSuggestionIds (String[])`, `reviewNote?` (cho `REV 004` khi 0 claim), `startedAt?`, `endedAt?`, `reviewedAt?`, `version (Int @default(1))`, `createdAt`, `updatedAt`.
   * `Activity`: `id`, `sessionId`, `order (Int)`, `title`, `duration (Int)`, `description`, `type (KhoiDong|LyThuyet|LuyenTap|KiemTra)`, `materialId?`, `materialVersion (Int?)`, `sourceEvidenceIds (String[])`, `sourceClaimRefs (Json: Array<{claimId: string, revision: number}>)` — **`@@index([sessionId, order])`**.
   * `RoomMember`: `id`, `sessionId`, `studentId`, `state (invited|waiting|joined|disconnected|left)`, `canWrite (Boolean @default(true))`, `toolOverrides (Json?)`, `handRaised (Boolean @default(false))`, `consent (Boolean @default(false))`, `consentAt?`, `joinedAt?`, `leftAt?`, `updatedAt` — **`@@unique([sessionId, studentId])`**.
   * `Invite`: `id`, `sessionId`, `studentId`, `tokenHash (String @unique, SHA-256 hex của 32-byte CSPRNG)`, `maskedHint (String, 4 ký tự cuối)`, `expiresAt`, `revokedAt?`, `createdBy`, `createdAt` — **`@@index([sessionId, studentId])`**. Tuyệt đối không có cột `token` dạng rõ.
5. **Tools: Board, Attempt, Annotation, QuickCheck, Submission, Chat (`M08` — `TOOL 001..007`)**:
   * `Board`: `id` (`${sessionId}:${activityId}:${ownerId}`), `sessionId`, `activityId`, `ownerId ("common"|studentId)`, `shared (Boolean)`, `strokes (Json: Stroke[])`, `text (Text)`, `notes (Json: Array<{authorId, text}>)`, `revision (Int @default(1))`, `updatedAt`.
   * `BoardAttempt` (**Immutable**): `id`, `boardId`, `sessionId`, `activityId`, `studentId`, `strokes (Json)`, `text (Text)`, `createdAt`.
   * `Annotation`: `id`, `sessionId`, `activityId`, `materialId`, `materialVersion (Int)`, `page (Int)`, `x (Float 0..100)`, `y (Float 0..100)`, `text`, `authorId`, `createdAt` (`MAT 005`).
   * `QuickCheck`: `id`, `sessionId`, `activityId`, `question`, `status (open|closed)`, `openedAt`, `closedAt?`.
   * `CheckResponse`: `id`, `checkId`, `sessionId`, `studentId`, `answer`, `support (DocLap|CoGoiY|DuocHuongDan|ChuaRo)`, `feedback?`, `createdAt`, `updatedAt` — **`@@unique([checkId, studentId])`** (`TOOL 004`).
   * `Submission`: `id`, `sessionId`, `studentId`, `activityId?`, `title`, `answer`, `fileName?`, `storageKey?`, `mimeType?`, `sizeBytes?`, `status (new|draft|reviewed)`, `support?`, `suggestedFeedback?`, `finalFeedback?`, `score?`, `version (Int @default(1))`, `createdAt`, `updatedAt`.
   * `RoomMessage`: `id`, `sessionId`, `authorId ("teacher"|studentId)`, `text`, `createdAt`.
   * `RoomReaction`: `id`, `sessionId`, `studentId`, `emoji`, `label`, `createdAt` — **`@@unique([sessionId, studentId])`**.
6. **Evidence, Claims, AI, Outbox & Audit (`M09, M10, M11, M13` — `EVD 001..004`, `AI 001..007`, `REV 001..006`, `OPS 001..004`)**:
   * `Evidence`: `id`, `sessionId`, `studentId`, `activityId?`, `kind (GhiChu|BaiLam|MucHoTro|GoiYGiangDay|TrangNhap|KiemTraDocLap|ChuThichDe)`, `title`, `detail`, `support (DocLap|CoGoiY|DuocHuongDan|ChuaRo)`, `sourceType (note|submission|board_attempt|check_response|annotation|ai_suggestion)`, `sourceId?`, `submissionId?`, `isObservation (Boolean @default(true))` (`false` khi `kind == GoiYGiangDay` theo `AI 003`), `status (active|corrected|deleted @default(active))`, `version (Int @default(1))`, `createdBy`, `createdAt`, `updatedAt`.
   * `EvidenceRevision` (**Immutable**): `id`, `evidenceId`, `version`, `detail`, `support`, `studentId`, `sessionId`, `activityId?`, `status`, `changedBy`, `reason?`, `createdAt`.
   * `Claim`: `id`, `sessionId`, `studentId`, `text`, `evidenceIds (String[])`, `status (pending|approved|rejected)`, `revision (Int @default(1))`, `staleReason?`, `reviewedBy?`, `reviewedAt?`, `createdAt`, `updatedAt`.
   * `ClaimRevision` (**Immutable**): `id`, `claimId`, `revision`, `text`, `evidenceIds (String[])`, `status`, `actorId`, `reason?`, `createdAt`.
   * `AIRequest`: `id`, `sessionId`, `activityId?`, `studentId`, `kind (suggestion|claim_draft|plan_suggestion|grading_hint)`, `prompt`, `responseText`, `contextSummary`, `provider ("gemini"|"mock")`, `model`, `modelVersion`, `status (ready|used|ignored|reported|error)`, `actorId`, `createdAt`.
   * `SessionEventOutbox` (**Ordered Outbox**): `id`, `sessionId`, `seq (Int, tăng tuần tự theo session)`, `kind (String)`, `label (String)`, `actorId`, `shared (Boolean)`, `targetStudentId?`, `activityId?`, `materialId?`, `page?`, `sourceId?`, `boardSnapshot (Json?)`, `payload (Json)`, `occurredAt` — **`@@unique([sessionId, seq])`**.
   * `AuditLog` (**Append-only**): `id`, `workspaceId`, `actorId`, `actorRole (teacher|student|system|support)`, `action`, `targetType`, `targetId`, `sessionId?`, `requestId`, `metadata (Json)`, `createdAt`.
   * `IdempotencyRecord`: `key`, `actorId`, `route`, `requestHash`, `statusCode (Int)`, `responseBody (Json)`, `expiresAt` — **`@@id([actorId, route, key])`**.

---

## 3. Quy tắc Chuyển Trạng thái, Crypto Invite & Privacy Projection

1. **Vòng đời `Session` (`LIVE 001,005`, `REV 002,004`, `EVD 003`)**:
   * Cho phép: `draft | scheduled -> live` (qua `/start`, gán `startedAt` một lần); `live -> ended` (qua `/end`, đóng mọi `QuickCheck` đang `open`, chuyển mọi `RoomMember` sang `left`, dừng `Recording` đang chạy); `ended -> reviewed` (qua `/complete-review` khi `pendingClaims == 0`, cho phép hoàn tất kèm `reviewNote` nếu `claims.length == 0`).
   * **Reopen duy nhất (`reviewed -> ended`)**: Tự động kích hoạt trong cùng transaction khi giáo viên: (a) sửa `text`/`evidenceIds` hoặc mở lại một `Claim` đã `approved`, (b) sửa/xóa `Evidence` đang nằm trong `Claim.evidenceIds`, hoặc (c) relabel `Submission` (`studentId`/`sessionId`/`activityId`) có liên kết `Evidence`/`Claim`. Khi đó: mọi `Claim` liên quan chuyển về `status = "pending"`, `revision += 1`, `Session.status` chuyển từ `reviewed` về `ended`, ghi `AuditLog`.
   * Cấm tuyệt đối (`409 SESSION_STATE_INVALID`): `ended -> live`, `reviewed -> live`, `live -> draft|scheduled`.
2. **Stale Plan Warning (`PLAN 003,004`, `EVD 003`)**:
   * Khi tạo `Activity` từ `Claim` đã duyệt (`PlanSuggestions` hoặc `/next-session`), lưu cả `sourceEvidenceIds` và `sourceClaimRefs: [{ claimId, revision }]`.
   * Khi render `SessionDetailViewModel`, server tính cờ `activity.isSourceStale = true` nếu bất kỳ `Evidence` nguồn nào có `status != "active"` hoặc `Claim` nguồn có `status != "approved"` hoặc `Claim.revision > ref.revision`.
3. **Crypto Invites — Commands Only (`ROOM 001..003`)**:
   * Token thô (`rawInviteToken`) **chỉ trả về duy nhất 1 lần** trong response của `POST /api/v1/sessions/:id/invites` (tạo mới hoặc xoay vòng). Mọi lệnh đọc (`GET`) chỉ trả `InviteSummary` (`id, studentId, maskedHint, expiresAt, state: "active"|"expired"|"revoked"`).
   * **Xoay vòng vs Thu hồi**: Gọi `POST /api/v1/sessions/:id/invites` (rotate) đánh dấu `revokedAt` trên các `Invite` cũ của `(sessionId, studentId)` và tạo hash mới, nhưng **giữ nguyên `RoomMember.state = "joined"`** nếu học sinh đang ở trong phòng. Gọi `POST /api/v1/sessions/:id/invites/:inviteId/revoke` thu hồi hash, chuyển `RoomMember.state = "left"` và ngắt kết nối Socket.IO/Zoom của học sinh đó ngay lập tức.
4. **Privacy & Actor Projection (`STU 004`, `ROOM 006`, `AI 006`)**:
   * **Teacher Actor**: Truy cập đầy đủ các thực thể thuộc `teacherId` của mình (`AUTH 002`).
   * **Student Actor (`StudentRoomToken`)**: Chỉ nhận `StudentSessionViewModel` gồm: `session.{id, title, sharedGoal, status, currentActivityId, sharedView, sharedBoardOwnerId, materialPage, tools}`, `activities` (không có `sourceEvidenceIds`/`sourceClaimRefs`), `currentMaterial` (signed read URL của trang/tệp đang mở), `commonBoard` hoặc `sharedBoard`, `ownBoard`, `ownAttempts`, `ownSubmissions`, `activeQuickCheck` + `ownCheckResponse`, `roomMessages` và danh sách hiển thị tối giản của thành viên trong phòng (`id, displayName, initials, color, handRaised`). Không bao giờ trả `session.goal` nội bộ, `student.notes/gaps`, `evidence`, `claims`, `aiRequests` hay bài làm/nháp cá nhân của học sinh khác.

---

## 4. Hợp đồng REST API v1 & Mã lỗi (`server/routes/v1`)

* **Headers chuẩn**: `Authorization: Bearer <token>` (hoặc HttpOnly cookie), `X-Request-Id`, `Idempotency-Key` (bắt buộc cho các POST ghi dữ liệu học tập/duyệt), `If-Match-Version` (cho PATCH có kiểm soát xung đột).
* **Error Envelope (`SRS 7.3`)**:
  `{ error: { code: ErrorCode, message: string, requestId: string, details?: unknown, latestVersion?: number } }`
  với `ErrorCode`: `INVITE_INVALID` (401/403), `SESSION_NOT_LIVE` (409), `PERMISSION_DENIED` (403), `VERSION_CONFLICT` (409), `MEDIA_UNAVAILABLE` (503), `AI_UNAVAILABLE` (503), `UPLOAD_FAILED` (400/502), `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `NOT_FOUND` (404).

| Nhóm | Method & Route | Actor | Hợp đồng xử lý chính |
| :--- | :--- | :--- | :--- |
| **Auth & Ops** | `POST /api/v1/auth/google/callback`<br>`POST /api/v1/auth/mock`<br>`POST /api/v1/auth/logout`<br>`GET /api/v1/auth/me`<br>`GET /api/v1/health` | Public<br>Local/Test<br>Teacher<br>Teacher<br>Public | Đổi OAuth code+PKCE → JWT + Refresh cookie (`AUTH 001`).<br>Chỉ mở khi `NODE_ENV !== "production" && ENABLE_AUTH_MOCK === "true"` (`AUTH 004`).<br>Thu hồi `TeacherAuthSession` (`AUTH 003`).<br>Trả `TeacherAccount` + `featureFlags` (`OPS 004`).<br>Trạng thái DB, MinIO, Socket, Zoom, Gemini (`OPS 003`). |
| **Students & Materials** | `GET, POST /api/v1/students`<br>`PATCH /api/v1/students/:id`<br>`POST /api/v1/materials/upload-intent`<br>`POST /api/v1/materials`<br>`GET /api/v1/materials/:id/read-url` | Teacher | Lọc `status`, `grade`, `q`; tạo/sửa `goal, notes, strengths, gaps, status (active|archived)` (`STU 001..005`).<br>Kiểm tra MIME/size → trả MinIO presigned PUT URL + `storageKey` (`MAT 001,002`).<br>Xác nhận metadata + tạo `MaterialVersion`.<br>Cấp presigned GET URL ngắn hạn sau khi kiểm tra quyền (`MAT 002`). |
| **Sessions & Plan** | `GET, POST /api/v1/sessions`<br>`GET, PATCH /api/v1/sessions/:id`<br>`PUT /api/v1/sessions/:id/activities`<br>`POST /api/v1/sessions/:id/start`<br>`POST /api/v1/sessions/:id/end` | Teacher | Tạo session (1–5 học sinh ` active`, `PLAN 001`); cập nhật `title, goal, sharedGoal, date, time, duration, tools, sharedView, materialPage`.<br>Thêm/sửa/xóa/sắp xếp `Activity`, trả cảnh báo nếu `sum(duration) > session.duration` (`PLAN 002`) và `isSourceStale`.<br>Chuyển `draft|scheduled -> live` (`LIVE 001`); chuyển `live -> ended` (`LIVE 005`). |
| **Invites & Room** | `POST /api/v1/sessions/:id/invites`<br>`POST /api/v1/sessions/:id/invites/:invId/revoke`<br>`POST /api/v1/room/join-request`<br>`POST /api/v1/sessions/:id/members/:mId/admit`<br>`PATCH /api/v1/sessions/:id/members/:mId`<br>`GET /api/v1/room/state`<br>`POST /api/v1/sessions/:id/video-token` | Teacher<br>Teacher<br>InviteToken<br>Teacher<br>Teacher/Stu<br>Teacher/Stu<br>Teacher/Stu | Sinh CSPRNG token, lưu `tokenHash`, trả `{ rawToken, inviteUrl, expiresAt }` 1 lần duy nhất (`ROOM 001`).<br>Thu hồi invite + nếu đang ở phòng thì chuyển `left`.<br>Kiểm tra `tokenHash`, ghi `consent = true`, chuyển `waiting` (hoặc giữ `joined`), cấp `studentRoomToken` (`ROOM 002`).<br>Admit (`waiting -> joined`) hoặc từ chối (`ROOM 003`).<br>Teacher đổi `canWrite`/`toolOverrides`; Student đổi `handRaised`/rời phòng (`ROOM 004`).<br>Trả snapshot theo đúng Actor Projection + `lastEventSeq`.<br>Chỉ cấp Zoom JWT khi Teacher hoặc `RoomMember.state === "joined"` (`VID 001`, `ROOM 003`). |
| **Tools & Evidence** | `PUT /api/v1/sessions/:id/boards/:boardKey`<br>`POST /api/v1/sessions/:id/boards/:boardKey/attempts`<br>`POST /api/v1/sessions/:id/annotations`<br>`POST /api/v1/sessions/:id/checks`<br>`POST /api/v1/checks/:checkId/responses`<br>`POST /api/v1/checks/:checkId/responses/:rId/review`<br>`POST /api/v1/sessions/:id/submissions`<br>`PATCH /api/v1/submissions/:id/grade`<br>`PATCH /api/v1/submissions/:id/relabel`<br>`POST /api/v1/sessions/:id/messages`<br>`POST /api/v1/sessions/:id/reactions`<br>`POST /api/v1/sessions/:id/evidence`<br>`PATCH /api/v1/evidence/:id` | Teacher/Stu<br>Teacher/Stu<br>Teacher<br>Teacher<br>Student<br>Teacher<br>Teacher/Stu<br>Teacher<br>Teacher<br>Teacher/Stu<br>Student<br>Teacher<br>Teacher | Kiểm tra `session.status === "live"`, `tools.*` và `canWrite` ở backend (`ROOM 004`).<br>Lưu `BoardAttempt` bất biến; nếu Teacher lưu hoặc Student nộp nháp thì gắn `Evidence` (`TOOL 001,002`).<br>Lưu `Annotation` kèm `materialVersion` + tùy chọn tạo `Evidence` `ChuThichDe` (`MAT 005`, `EVD 002`).<br>Mở/đóng `QuickCheck`; Student gửi `CheckResponse` idempotent (`TOOL 004`); Teacher chấm + gắn `support` (`TOOL 007`).<br>Tạo `Submission` (kèm MinIO `storageKey`, `Idempotency-Key`, `TOOL 005`).<br>Chấm bài bắt buộc có `support` → tạo `Evidence` + `Claim` `pending`.<br>Relabel `Submission` → cascade `Evidence` + đưa `Claim` về `pending` + reopen `Session` nếu `reviewed`.<br>Gửi chat cơ bản; từ chối `403 PERMISSION_DENIED` nếu `!tools.chat` (`ROOM 004`).<br>Gửi reaction; từ chối nếu `!canStudentAct`.<br>Tạo/sửa `Evidence`; sửa `Evidence` tạo `EvidenceRevision` + reopen `Claim`/`Session` (`EVD 003`). |
| **AI & Review** | `POST /api/v1/sessions/:id/ai/suggestions`<br>`PATCH /api/v1/ai-requests/:id`<br>`POST /api/v1/sessions/:id/claims/draft`<br>`PATCH /api/v1/claims/:id/review`<br>`POST /api/v1/sessions/:id/complete-review`<br>`POST /api/v1/sessions/:id/next-session` | Teacher | Gọi Gemini adapter ở server với context tối thiểu (`AI 001,005,006,007`).<br>Cập nhật `used | ignored | reported`; nếu lưu minh chứng thì tạo `Evidence` (`isObservation: false`, `AI 002,003`).<br>Sinh `Claim` `pending` từ `Evidence` có `isObservation: true`; không sinh Claim nếu 0 evidence (`AI 004`).<br>Approve/Reject/Edit `Claim` (bắt buộc `evidenceIds.length >= 1`, ghi `ClaimRevision` + `AuditLog`, `REV 002,003`).<br>Chuyển `ended -> reviewed` khi `pendingClaims == 0` (chấp nhận 0 claim nếu có `reviewNote`, `REV 004`).<br>Tạo `Session` draft kế tiếp kèm `sourceEvidenceIds`, `sourceClaimRefs` và khởi tạo sẵn `RoomMember` (`REV 006`). |

---

## 5. Hợp đồng Realtime Socket.IO & UI View-Models

* **Envelope Sự kiện (`contracts/events.ts`)**:
  ```ts
  export type RealtimeEnvelope<T = unknown> = {
    eventId: string;
    sessionId: string;
    seq: number; // Monotonic per sessionId from SessionEventOutbox
    type:
      | "session.started" | "session.ended" | "activity.changed"
      | "member.join_requested" | "member.admitted" | "member.updated"
      | "board.updated" | "annotation.created"
      | "quick_check.opened" | "quick_check.closed" | "quick_check.responded"
      | "submission.created" | "chat.message" | "reaction.updated"
      | "evidence.created" | "claim.reviewed";
    occurredAt: string;
    actorId: string;
    payload: T;
  };
  ```
* **Giao thức Reconnect & Ordering (`ROOM 005`, `LIVE 002,006`)**:
  * Khi kết nối namespace `/classroom`, client gửi `{ sessionId, lastEventSeq }` kèm `Authorization`.
  * Server đặt socket vào room `session:${sessionId}:public` và (nếu là Teacher) `session:${sessionId}:teacher` hoặc (nếu là Student) `session:${sessionId}:student:${studentId}`.
  * Server truy vấn `SessionEventOutbox` với `seq > lastEventSeq` (lọc theo quyền của actor) và phát bù theo thứ tự `seq` tăng dần; nếu `lastEventSeq` quá cũ, phát sự kiện `room.resync_required` kèm snapshot mới nhất.
* **UI View-Model Contract (`contracts/ui.ts`)**:
  * Cung cấp 2 interface tách biệt: `TeacherWorkspaceViewModel` (dành cho `App.tsx`, `Review.tsx`, `SessionSetup.tsx`, `TeacherRoom`) và `StudentRoomViewModel` (dành riêng cho `GuestPortal`/`StudentSession`), cùng bộ `WorkspaceActions` / `ClassroomActions` trả `Promise<ActionResult>` để `UI` hiển thị trạng thái `loading / empty / error / retry / permission-denied` mà không chứa logic gọi mạng.

---

## 6. Tiêu chí Nghiệm thu Cổng G0 (`G0 Signoff Criteria`)

Trước khi `UI` áp dụng contract mới và `PRODUCT` triển khai tính năng `G1`, cổng `G0` phải thỏa mãn 6 tiêu chí bắt buộc:
1. `prisma/schema.prisma` có đầy đủ các bảng/enum ở Mục 2, chạy `npx prisma validate` và sinh Prisma Client thành công.
2. Thư mục `contracts/` (gồm `domain.ts`, `api.ts`, `events.ts`, `errors.ts`, `ui.ts`, `index.ts`) định nghĩa đầy đủ DTO, Error Codes, State Transitions và Projection Types; `src/product/model.ts` tương thích ngược để không làm gãy build hiện tại.
3. Ràng buộc bảo mật trong contract: `Invite` response đọc không có trường `token` rõ; `StudentRoomViewModel` không có trường `evidence`, `claims`, `notes`, `gaps` hay dữ liệu học sinh khác (`ROOM 006`, `STU 004`).
4. Ràng buộc toàn vẹn sư phạm trong contract: `Claim` approve bắt buộc `evidenceIds.length >= 1`; `Evidence` có `isObservation` tách biệt `Gợi ý giảng dạy`; `Activity` có `sourceClaimRefs` để tính `isSourceStale`.
5. `node node_modules/typescript/bin/tsc --noEmit` đạt 0 lỗi trên toàn repo.
6. Không có chỉnh sửa nào chạm vào `docs/SRS_AI_Teaching_Copilot_Modules_v0.1.docx` và `docs/build_srs.py`.

Đang chờ Supervisor review và mở cổng tiếp theo.
