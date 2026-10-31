# QA G1 Blackbox Integration Test Suite

Tài liệu hướng dẫn thực thi kiểm thử tích hợp hộp đen (Blackbox HTTP Integration Tests) cho các API G1 của AI Teaching Copilot.

---

## 1. Nguyên Tắc Kiểm Thử
- **Không giả lập signature server nội bộ**: Toàn bộ kiểm thử giao tiếp qua HTTP thực tế tới địa chỉ được chỉ định bởi biến môi trường `QA_BASE_URL` (ví dụ: `http://127.0.0.1:3100`).
- **Phân định rõ ràng**:
  - Khi **chưa có server** (`QA_BASE_URL` vắng mặt): Các ca kiểm thử tích hợp tự động hiển thị trạng thái `﹣ [test] (0.1ms) # BLOCKED: QA_BASE_URL not set...` để bảo đảm CI G0 luôn GREEN mà không xác nhận sai (false claim) rằng G1 đã hoàn tất.
  - Khi **server đang chạy** (`QA_BASE_URL` có giá trị): Toàn bộ các yêu cầu HTTP được gửi thực tế. Bất kỳ phản hồi lỗi không mong muốn nào (`404`, `401`, `500`) hoặc vi phạm hợp đồng dữ liệu sẽ làm bài test **FAIL** ngay lập tức.
- **Cách ly dữ liệu (Test Data Isolation)**: Mỗi ca kiểm thử tự sinh định danh tài nguyên duy nhất (`uid(...)`) cho giáo viên, học sinh, buổi học để tránh xung đột dữ liệu và không yêu cầu xóa sạch cơ sở dữ liệu dùng chung.

---

## 2. Chuẩn Bị Môi Trường Cục Bộ

### 2.1. Khởi động Hạ tầng Docker (PostgreSQL & MinIO)
```bash
# Đảm bảo container PostgreSQL và MinIO đang hoạt động
docker compose -f docker-compose.yml up -d db minio
```

### 2.2. Migrate Cơ sở dữ liệu Test
```bash
export DATABASE_URL="postgresql://user:password@127.0.0.1:5432/teaching_copilot_test"
pnpm exec prisma db push
```

### 2.3. Khởi động Server Backend G1 (Port 3100)
```bash
export PORT=3100
export NODE_ENV="test"
export ENABLE_AUTH_MOCK="true"
export DATABASE_URL="postgresql://user:password@127.0.0.1:5432/teaching_copilot_test"

# Khởi chạy server
pnpm run build:server
node dist-server/server/index.js
```

---

## 3. Lệnh Chạy Kiểm Thử

### 3.1. Chạy Toàn Bộ Test Suite (Chế độ Blackbox)
```bash
QA_BASE_URL="http://127.0.0.1:3100" pnpm test
```

### 3.2. Chạy Riêng Suite Tích Hợp G1
```bash
QA_BASE_URL="http://127.0.0.1:3100" npx tsx --test tests/integration/g1-blackbox.test.ts
```

### 3.3. Chạy Chế độ CI Mặc định (G0 Contract Tests & Liveness)
```bash
pnpm test
```

---

## 4. Danh Mục Ca Kiểm Thử Đã Chuẩn Bị (`tests/integration/g1-blackbox.test.ts`)

| TestID | Mục tiêu kiểm thử | SRS Mapping |
|---|---|---|
| `T-AUTH-001-POS` | Mock login giáo viên cấp JWT access token và cookie refresh | `AUTH 001` |
| `T-AUTH-003-POS` | Đăng xuất giáo viên thu hồi phiên, chặn đổi token bằng refresh cũ | `AUTH 003` |
| `T-AUTH-002-NEG` | Ranh giới multi-tenant trả HTTP 403 Forbidden khi truy cập học sinh của giáo viên khác | `AUTH 002` |
| `T-STU-001-POS` | Vòng đời học sinh: Tạo, đọc, sửa, lưu trữ (archive) và khôi phục (restore) | `STU 001` |
| `T-STU-001-NEG` | Học sinh đã lưu trữ (archived) bị từ chối khi thêm vào buổi học mới (400 Bad Request) | `STU 001` |
| `T-PLAN-001-POS/NEG` | Tạo buổi học: Chấp nhận 1 đến 5 học sinh; từ chối khi 0 hoặc > 5 học sinh (400 Bad Request) | `PLAN 001` |
| `T-PLAN-002-POS` | Sắp xếp Activity và trả cảnh báo thời lượng nếu tổng thời lượng hoạt động > thời lượng buổi | `PLAN 002` |
| `T-MAT-001-POS/NEG` | Upload intent học liệu: Chấp nhận PDF/PNG <= 10 MiB; từ chối sai MIME hoặc > 10 MiB | `MAT 001` |
| `T-MAT-002-POS/NEG` | Cấp signed read URL học liệu cho chủ sở hữu; từ chối giáo viên khác (403 Forbidden) | `MAT 002` |
