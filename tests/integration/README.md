# QA G1 Blackbox Integration Test Suite

Tài liệu hướng dẫn thực thi kiểm thử tích hợp hộp đen (Blackbox HTTP Integration Tests) cho các API G1 của AI Teaching Copilot trên môi trường Docker cục bộ.

---

## 1. Nguyên Tắc Kiểm Thử
- **Blackbox HTTP thực tế**: Toàn bộ kiểm thử giao tiếp qua HTTP thực tế tới địa chỉ được chỉ định bởi biến môi trường `QA_BASE_URL` (mặc định: `http://127.0.0.1:3110`) và `APP_ORIGIN` tương ứng.
- **Dedicated Test Environment**:
  - Cơ sở dữ liệu: `copilot_test` trên `127.0.0.1:55432` (tuyệt đối không reset hoặc ảnh hưởng database dev `copilot`).
  - Lưu trữ: MinIO private bucket `copilot-private-test` trên `127.0.0.1:59000`.
- **Phân định rõ ràng**:
  - Khi **chưa có server** (`QA_BASE_URL` rỗng): Các ca kiểm thử tích hợp tự động hiển thị trạng thái `﹣ [test] # BLOCKED: QA_BASE_URL not set...` để bảo đảm CI không xác nhận sai (false claim) rằng G1 đã hoàn tất.
  - Khi **server đang chạy** (`QA_BASE_URL` có giá trị): Toàn bộ các yêu cầu HTTP được gửi thực tế với JWT Bearer token, HttpOnly refresh cookie, `Origin` header và `Idempotency-Key`.
- **Trung thực về phạm vi G2/G3**:
  - Mock login được gán nhãn `AUTH 004` (mock guard dev/test), KHÔNG đánh dấu `AUTH 001` (Google OAuth thật cần credentials) là đã nghiệm thu.
  - Các ca kiểm thử thuộc G2 (phòng học realtime `ROOM`, video SDK `VID`, Socket.IO `LIVE`, chấm bài/duyệt nhận định `REV`) được đánh dấu `BLOCKED: G2 feature`.

---

## 2. Chuẩn Bị Môi Trường Cục Bộ

### 2.1. Khởi động Hạ tầng Docker (PostgreSQL & MinIO)
```bash
docker compose -f compose.local.yml up -d
```

### 2.2. Khởi tạo Cơ sở dữ liệu Test và Bucket Riêng
```bash
cp .env.example .env
APP_MODE=test pnpm testdb:reset
```
*Lệnh trên áp dụng Prisma migrations vào `copilot_test` và seed 2 tài khoản giáo viên demo (`teacher-a`, `teacher-b`) cùng bucket `copilot-private-test`.*

### 2.3. Khởi động Server Backend QA (Port 3110)
```bash
PORT=3110 \
APP_ORIGIN="http://127.0.0.1:3110" \
APP_MODE="test" \
DATABASE_URL="postgresql://copilot:copilot_local_only@127.0.0.1:55432/copilot_test" \
MINIO_BUCKET="copilot-private-test" \
MINIO_ENDPOINT="127.0.0.1" \
MINIO_PORT="59000" \
MINIO_USE_SSL="false" \
MINIO_ACCESS_KEY="copilotlocal" \
MINIO_SECRET_KEY="copilot_local_only" \
JWT_SECRET="local-only-change-before-any-shared-use-0123456789" \
node --import tsx server/index.ts
```

---

## 3. Lệnh Chạy Kiểm Thử

### 3.1. Chạy Toàn Bộ Test Suite (Chế độ Blackbox có Server)
```bash
QA_BASE_URL="http://127.0.0.1:3110" APP_ORIGIN="http://127.0.0.1:3110" pnpm test
```

### 3.2. Chạy Riêng Suite Tích Hợp G1 Blackbox
```bash
QA_BASE_URL="http://127.0.0.1:3110" APP_ORIGIN="http://127.0.0.1:3110" node --import tsx --test tests/integration/g1-blackbox.test.ts
```

### 3.3. Chạy Toàn Bộ Tích Hợp Product + QA
```bash
RUN_G1_INTEGRATION=1 \
APP_MODE=test \
DATABASE_URL="postgresql://copilot:copilot_local_only@127.0.0.1:55432/copilot_test" \
MINIO_BUCKET="copilot-private-test" \
QA_BASE_URL="http://127.0.0.1:3110" \
APP_ORIGIN="http://127.0.0.1:3110" \
pnpm test
```

---

## 4. Danh Mục Ca Kiểm Thử Đã Thực Hiện (`tests/integration/g1-blackbox.test.ts`)

| TestID | Mục tiêu kiểm thử | SRS Mapping | Trạng thái Thực tế |
|---|---|---|---|
| `T-AUTH-004-POS` | Mock login giáo viên cấp JWT access token và cookie refresh; `/auth/me` trả hồ sơ | `AUTH 004` (Mock guard) | PASS |
| `T-AUTH-003-POS` | Đăng xuất giáo viên trả 204 No Content, thu hồi `sid`, xóa cookie refresh | `AUTH 003` | PASS |
| `T-AUTH-003-SESSION-SCOPING` | Đăng xuất thu hồi đúng phiên của giáo viên, không xóa cookie của giáo viên khác | `AUTH 003`, `D12` | PASS |
| `T-AUTH-002-NEG` | Ranh giới multi-tenant: Teacher B bị từ chối 403 Forbidden khi đọc/sửa học sinh Teacher A | `AUTH 002` | PASS |
| `T-STU-001-POS` | Vòng đời học sinh: Tạo (201), Sửa có `If-Match-Version`, Bắt xung đột (409), Archive & Restore | `STU 001` | PASS |
| `T-STU-001-NEG` | Học sinh đã lưu trữ (archived) bị từ chối 400 khi xếp vào buổi học mới | `STU 001` | PASS |
| `T-STU-005-POS/NEG`| Lịch sử học sinh chỉ trả Claim đã duyệt có bằng chứng quan sát sống; loại bỏ rỗng/xóa/sửa/AI-only | `STU 005`, `D04` | PASS |
| `T-PLAN-001-POS/NEG`| Tạo buổi học: 1 đến 5 học sinh (201); từ chối 0 hoặc 6 học sinh (400); kiểm tra idempotency replay | `PLAN 001` | PASS |
| `T-PLAN-002-POS` | Hoạt động lưu đúng thời lượng do người dùng nhập (75m > 60m buổi) và mô tả form | `PLAN 002` | PASS |
| `T-PLAN-003-NEG` | Xác thực nguồn per-activity: Chặn mượn chéo claimRefs giữa các activity và chặn dùng trợ giảng AI | `PLAN 003`, `AI 003` | PASS |
| `T-MAT-001-POS` | Upload intent (201), tải tệp PDF thật lên MinIO qua PUT, chốt học liệu với `uploadId`, replay idempotency | `MAT 001` | PASS |
| `T-MAT-001-NEG` | Từ chối tệp > 10 MiB (400), sai MIME (400), từ chối chèn trực tiếp `storageKey` không qua uploadId | `MAT 001` | PASS |
| `T-MAT-002-POS/NEG`| Cấp presigned read URL cho chủ sở hữu tải nội dung nguyên vẹn; từ chối giáo viên khác (403) | `MAT 002` | PASS |
| `T-MAT-004-NEG` | Tải lên hỏng/sai hash được dọn dẹp khỏi MinIO (/verified/ không rác); tái sử dụng uploadId trả 409 | `MAT 001`, `MF-G1-03` | PASS |
| `T-ROOM-001-BLOCKED`| Vòng đời phòng học, mã hash token và kiểm soát lobby | `ROOM 001-003` | BLOCKED (G2) |
| `T-VID-001-BLOCKED`| Cấp token Zoom Video SDK | `VID 001` | BLOCKED (G2/G3) |
| `T-LIVE-001-BLOCKED`| Sự kiện Socket.IO thời gian thực | `LIVE 001` | BLOCKED (G2) |
| `T-REV-001-BLOCKED`| Vòng đời chấm bài và phê duyệt nhận định | `REV 001-006` | BLOCKED (G2) |
