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

### 2.3. Cấu hình Cổng Mạng & Port Boundary
- **Root G1 Server**: Đang chạy trên cổng `3110` (`APP_ORIGIN="http://127.0.0.1:3110"`). Không kill process hoặc can thiệp phiên này.
- **QA G2 Test Server**: Dành riêng cổng `3111` (`APP_ORIGIN="http://127.0.0.1:3111"`, `PORT=3111`) cho suite kiểm thử G2 độc lập.
- **Khởi động Server Backend QA G2 (Port 3111)**:
```bash
PORT=3111 \
APP_ORIGIN="http://127.0.0.1:3111" \
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

---

## 5. Danh Mục Ca Kiểm Thử G2 Chuẩn Bị (`tests/integration/g2-blackbox.test.ts`)

Toàn bộ các ca kiểm thử G2 được thiết kế với 3 ngữ cảnh độc lập (Teacher, Student 1, Student 2 / Guest) và kiểm chứng tuần tự theo đúng tiêu chí SRS canonical. Hiện tại toàn bộ được đánh dấu `BLOCKED: G2 feature` để tránh false claims trước khi Product bàn giao endpoint G2.

| TestID | Mục tiêu kiểm thử | SRS Mapping | Trạng thái Hiện tại |
|---|---|---|---|
| `T-ROOM-001-POS` | Giáo viên tạo link riêng từng học sinh có TTL cấu hình; token lưu dạng hash SHA-256; xoay link (rotation) thu hồi link cũ | `ROOM 001` | BLOCKED (G2 Room) |
| `T-ROOM-001-NEG` | Link hết hạn TTL hoặc đã xoay/thu hồi bị từ chối truy cập; hash token không lọt log | `ROOM 001` | BLOCKED (G2 Room) |
| `T-ROOM-002-POS` | Học sinh mở link hợp lệ, xác nhận tên consent và vào phòng chờ (waiting lobby) | `ROOM 002` | BLOCKED (G2 Room) |
| `T-ROOM-002-NEG` | Link hết hạn/thu hồi/sai session trả lỗi không làm lộ tên lớp hay danh tính học sinh khác | `ROOM 002` | BLOCKED (G2 Room) |
| `T-ROOM-003-POS` | Giáo viên admit học sinh chờ; học sinh chuyển trạng thái joined, nhận quyền công cụ và video token | `ROOM 003` | BLOCKED (G2 Room) |
| `T-ROOM-003-NEG` | Học sinh bị từ chối (deny) hoặc chưa admit không nhận video token và bị chặn thao tác công cụ | `ROOM 003` | BLOCKED (G2 Room) |
| `T-ROOM-004-POS/NEG`| Giáo viên bật tắt công cụ theo buổi/thành viên; backend chặn thao tác công cụ bị tắt | `ROOM 004` | BLOCKED (G2 Room) |
| `T-ROOM-005-POS` | Đồng bộ state phòng học theo thứ tự sequence đơn điệu; client reconnect với `lastEventSeq` nhận slice thiếu | `ROOM 005` | BLOCKED (G2 Socket) |
| `T-ROOM-005-NEG` | Event trùng số sequence đã xử lý được loại bỏ idempotent, không sinh side-effect lặp | `ROOM 005` | BLOCKED (G2 Socket) |
| `T-ROOM-006-POS` | Học sinh nhận nội dung chung phòng học và trạng thái cá nhân trong `StudentRoomViewModel` | `ROOM 006` | BLOCKED (G2 Socket) |
| `T-ROOM-006-NEG` | Private fanout: Socket học sinh tuyệt đối không nhận note giáo viên, bài của bạn (`STU 004`) hay claim chưa duyệt | `ROOM 006`, `STU 004` | BLOCKED (G2 Socket) |
| `T-LIVE-005-POS` | Kết thúc session dừng nhận hoạt động mới, chuyển sang ended, điều hướng giáo viên tổng kết | `LIVE 005` | BLOCKED (G2 Room) |
| `T-LIVE-005-NEG` | Khóa sau session ended: Toàn bộ thao tác gửi bài, vẽ bảng của học sinh trả 403 Forbidden | `LIVE 005` | BLOCKED (G2 Room) |
| `T-LIVE-006-POS` | Mất kết nối realtime giữ nguyên dữ liệu đang soạn và thử kết nối lại độc lập | `LIVE 006` | BLOCKED (G2 Socket) |
| `T-LIVE-006-NEG` | Hàng đợi reconnect giới hạn (max 50 lệnh / 1 MiB / 5 phút TTL); server hủy lệnh cũ sau session ended | `LIVE 006`, `LIVE 005` | BLOCKED (G2 Socket) |
| `T-TOOL-001-POS` | Bảng trắng đồng bộ nét vẽ có authorId giữa giáo viên và học sinh được cấp quyền | `TOOL 001` | BLOCKED (G2 Socket) |
| `T-TOOL-001-NEG` | Học sinh chỉ undo nét vẽ của chính mình (`undoOwnStroke`); từ chối undo nét của bạn hoặc vẽ khi tắt quyền | `TOOL 001` | BLOCKED (G2 Socket) |
| `T-TOOL-002-POS/NEG`| Thao tác bảng chung yêu cầu `ownerId === sharedBoardOwnerId`; học sinh chỉ thao tác trên bảng được gán | `TOOL 002` | BLOCKED (G2 Socket) |
| `T-TOOL-004-POS/NEG`| Quick check mở: học sinh gửi phản hồi 1 lần; phản hồi trùng bị từ chối idempotent | `TOOL 004` | BLOCKED (G2 Room) |
| `T-TOOL-005-POS` | Học sinh gửi bài (text/ảnh/PDF) qua presigned upload intent, tạo Submission và SessionEvent | `TOOL 005` | BLOCKED (G2 Room) |
| `T-TOOL-005-NEG` | Từ chối chèn trực tiếp `storageKey`; lỗi upload cho phép retry không tạo bản ghi trùng | `TOOL 005` | BLOCKED (G2 Room) |
| `T-EVD-003-POS/NEG`| Sửa/xóa evidence có version audit; sửa evidence của Claim approved chuyển Claim về pending | `EVD 003` | BLOCKED (G2 Review) |
| `T-REV-002-POS/NEG`| Không thể approve Claim không có evidence; sửa Claim approved tạo revision pending | `REV 002` | BLOCKED (G2 Review) |
| `T-REV-004-POS/NEG`| Buổi học chỉ chuyển `reviewed` khi không còn Claim pending; zero-claim review yêu cầu `reviewNote` | `REV 004` | BLOCKED (G2 Review) |
