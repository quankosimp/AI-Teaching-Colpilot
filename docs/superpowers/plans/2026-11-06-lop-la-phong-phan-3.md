# "Lớp là phòng" — Phần 3: Màn Sau buổi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bấm Kết thúc buổi là sang màn Sau buổi: điểm danh tóm tắt, AI soạn mỗi em một dòng nháp từ nguồn có sẵn, gia sư Giữ/Sửa/Bỏ/Tự thêm, chọn Ôn lại/Làm tốt, rồi Lưu và đóng buổi. Điều cần nhớ hiện ở trang lớp và hồ sơ em, đóng bằng "Đã ổn".

**Architecture:** Không xây AI mới: dùng route sẵn có `POST /sessions/:id/ai/claims-draft` (soạn nhận định chờ duyệt từ minh chứng của một em), `PATCH /claims/:id/review` (approve/edit/reject), `POST /sessions/:id/evidence`, `POST /sessions/:id/claims/draft`, `PUT /sessions/:id/attendance`, `POST /sessions/:id/complete-review`. Thêm cột `Claim.kind`, `resolvedAt`, `resolvedBy`; AI trả thêm `kind`. Thêm router nhỏ `GET /sessions/:id/after`, `PATCH /claims/:id/kind`, `POST /claims/:id/resolve` trong `server/routes/classRooms.ts`. Giao diện: `src/product/classHome/AfterClass.tsx`, nối vào OnlineApp như một trang `after`.

**Spec:** `docs/superpowers/specs/2026-11-06-lop-la-phong-design.md` mục 5.5 (đã bỏ nút đánh dấu), 5.7, 6, 7, 8.

## Global Constraints
- Không thêm nút nào trong giờ dạy (spec 5.5).
- Chỉ dòng gia sư bấm Giữ mới vào hồ sơ (spec 2.7). AI không tự duyệt.
- Dòng nháp tối đa khoảng 120 ký tự; nhãn chỉ có hai loại `review` (Ôn lại) và `good` (Làm tốt).
- Em vắng mặt không có thẻ ghi nhớ trong buổi đó.
- Em không có nguồn: không gọi AI.
- AI lỗi không chặn việc đóng buổi.
- Chữ giao diện không mặc định môn Toán; một dòng một ý, cắt bằng "…".

## Tasks

### Task 1: Dữ liệu
- [ ] Thêm vào `model Claim`: `kind String?`, `resolvedAt DateTime?`, `resolvedBy String? @db.Uuid`.
- [ ] Migration `prisma/migrations/202611060005_claim_kind_resolve/migration.sql` (3 `ALTER TABLE "Claim" ADD COLUMN`).
- [ ] `prisma validate`, `prisma generate`, `tsc -p tsconfig.server.json`.

### Task 2: AI trả loại nhận định
- [ ] `server/ai/types.ts`: `ClaimDraftCandidate.kind?: "review" | "good"`.
- [ ] `server/ai/openaiAdapter.ts`: schema ứng viên thêm `kind: z.enum(["review","good"]).optional()`, `text` tối đa 160; prompt yêu cầu 1 nhận định ngắn (≤120 ký tự) kèm `kind`; giữ luật trích ID minh chứng.
- [ ] `server/routes/ai.ts`: khi tạo `Claim` từ ứng viên, lưu `kind: candidate.kind ?? null`.

### Task 3: API màn Sau buổi (trong `server/routes/classRooms.ts`)
- [ ] `GET /sessions/:id/after` (gia sư sở hữu; buổi `ended` hoặc `reviewed`, còn lại 409) → `{ session: { id, title, date, time, status, startedAt, endedAt, groupId, groupName, attendanceConfirmedAt }, students: [{ studentId, name, initials, color, present, late, consent, evidence: [{ id, title, kind, createdAt }], claims: [{ id, text, status, revision, kind, evidenceIds }] }], pendingSubmissions: [{ id, studentId, name, title, createdAt }] }`. `present` theo luật điểm danh hiện có (`attendance` hoặc `joinedAt`); evidence chỉ `status=active`, `isObservation`, kind khác `GoiYGiangDay`.
- [ ] `PATCH /claims/:id/kind` body `{ kind: "review" | "good" }` → `{ ok: true }`.
- [ ] `POST /claims/:id/resolve` → đặt `resolvedAt`, `resolvedBy`; chỉ claim `approved` → `{ ok: true }`.
- [ ] `GET /groups/:id` (classes.ts): `notes` chỉ lấy claim `approved` chưa `resolvedAt`, thêm `id` và `kind` vào mỗi note.
- [ ] Test tích hợp `tests/unit/product/after-class.integration.test.ts` (bỏ qua khi thiếu `RUN_CLASSES_INTEGRATION=1`): tạo lớp → mở lớp → bắt đầu → kết thúc → `GET /after` có học sinh, không có evidence → tạo evidence + claim → kind → approve → resolve → `GET /groups/:id` không còn note.

### Task 4: Màn Sau buổi (`src/product/classHome/AfterClass.tsx`)
- [ ] Tải `/sessions/:id/after`; tự gọi `claims-draft` cho em có mặt, đồng ý, có nguồn và chưa có claim, lần lượt từng em; thẻ "Đang soạn…".
- [ ] Thẻ em: dòng nháp + nhãn đổi được (PATCH kind), nguồn, Giữ (`approve`), Sửa (`edit` rồi `approve`), Bỏ (`reject`); Tự thêm (evidence `GhiChu` → `claims/draft` → `approve` → kind).
- [ ] Điểm danh tóm tắt + Sửa (`AttendanceDialog` mode edit); bài nộp chưa nhận xét + Nhận xét.
- [ ] Lưu và đóng buổi: tắt khi còn `pending`; lấy `/sessions/:id/attendance`, `PUT` lại các dòng nếu chưa xác nhận, `POST complete-review` (gửi `reviewNote` khi không có nhận định nào); xong thì về lớp.

### Task 5: Nối vào app
- [ ] `LiveRoom` thêm prop `onEnded?: () => void`: có prop thì Kết thúc buổi hỏi xác nhận, gọi `/end`, rồi `onEnded()` (không mở hộp điểm danh).
- [ ] `OnlineApp`: trang `after` + state `afterSession`; `onEnded` → trang `after`; thoát màn → về đúng lớp.
- [ ] `ClassPage` Nhật ký: buổi đã dạy mở màn Sau buổi (nút "Xác nhận ghi nhớ", "Xem lại"); giữ "Nhận xét N bài".
- [ ] Trang lớp và hồ sơ em: nhãn Ôn lại/Làm tốt theo `kind`; hồ sơ có nút **Đã ổn**.

### Task 6: Kiểm tra
- [ ] `pnpm lint`, `tsc -p tsconfig.server.json`, `pnpm test`, test tích hợp trên DB thử.
- [ ] Dựng lại Docker với `--env-file .env.local`; đi hết vòng trên app thật: mở lớp → học sinh vào bằng link, nộp bài → gia sư nhận xét → kết thúc → màn Sau buổi soạn nháp bằng OpenAI → Giữ/Sửa/Bỏ/Tự thêm → Lưu và đóng → trang lớp hiện điều cần nhớ → Đã ổn.
- [ ] Kiểm tra chữ không xuống dòng hoặc bị cắt ở 1440 và 1280; chụp ảnh gửi người dùng; không commit khi chưa được phép.
