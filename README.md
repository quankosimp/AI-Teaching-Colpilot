# AI Teaching Copilot

Ứng dụng React/Vite và API Express cho gia sư. Phiên bản hiện tại đang triển khai G1: đăng nhập giáo viên, hồ sơ, học liệu riêng tư và kế hoạch dùng PostgreSQL/MinIO. Phòng học đa thiết bị, video Zoom và Gemini chưa được nối hoàn chỉnh; không dùng dữ liệu giả để khẳng định các phần này đã hoạt động.

## Chạy cục bộ

Yêu cầu Node 22.13+ trong nhánh 22, pnpm 11.25.0 và Docker Compose. Các tài khoản, mật khẩu trong `.env.example` chỉ dành cho máy cục bộ. Không dùng cấu hình đó trên staging hoặc production.

1. `pnpm install --frozen-lockfile --strict-peer-dependencies`
2. `cp .env.example .env`
3. `docker compose -f compose.local.yml up -d`
4. `pnpm exec prisma migrate deploy && pnpm exec prisma generate`
5. `pnpm seed:local` tạo hai giáo viên và hai học sinh mẫu cùng bucket MinIO private. Chạy lại không tạo bản sao.
6. `pnpm dev:server`, sau đó ở terminal khác chạy `pnpm dev` và mở `http://localhost:3000`. Vite chuyển `/api` tới API `http://127.0.0.1:3100`.

Các cổng PostgreSQL `55432` và MinIO `59000` chỉ bind `127.0.0.1`. Nếu cổng giao diện 3000 đã được dùng, chọn cổng khác cho Vite và sửa `APP_ORIGIN` tương ứng trong `.env` trước khi khởi động lại API. Dùng cùng hostname cho origin và URL trình duyệt.

Trong `APP_MODE=local_mock`, chọn **Demo Hoàng Nam** hoặc **Demo Mai An**. Mock bị chặn khi `NODE_ENV` là production hoặc staging. Google OAuth cần `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` và origin HTTPS phù hợp; khi chưa cấu hình, API trả 503. Refresh token được lưu trong cookie HttpOnly; access token giữ trong bộ nhớ tab. API kiểm tra Origin đối với lệnh ghi.

## Kiểm tra

- `pnpm test`, `pnpm lint`, `pnpm typecheck:server`, `pnpm build`, `pnpm build:server`.
- Cơ sở dữ liệu QA riêng: sau khi `cp .env.example .env` và bật Docker như trên, chạy `APP_MODE=test pnpm testdb:reset`. Lệnh chỉ reset `copilot_test` trên `127.0.0.1:55432`, sau đó seed hai giáo viên/học sinh và khởi tạo bucket `copilot-private-test`.
- Chạy integration với cơ sở QA, không dùng dữ liệu demo: `set -a; source .env; set +a; APP_MODE=test DATABASE_URL="$TEST_DATABASE_URL" MINIO_BUCKET="$MINIO_TEST_BUCKET" RUN_G1_INTEGRATION=1 pnpm test`. `pnpm exec prisma validate` kiểm tra schema.
- `GET /health/live` chỉ kiểm tra tiến trình; `GET /api/v1/health` kiểm tra PostgreSQL và bucket, không gọi Gemini hoặc Zoom.

## Phạm vi và giới hạn hiện tại

Server hỗ trợ mock login, Google OAuth callback, refresh/logout, danh sách/tạo/sửa học sinh và lịch sử đã duyệt, danh sách/tạo/sửa session và activity, upload PDF/JPEG/PNG tối đa 10 MiB và signed read URL. Tệp được kiểm kích thước, chữ ký loại và SHA-256 trước khi hoàn tất học liệu. Google, Zoom và Gemini thật chưa được nghiệm thu vì chưa có credentials. Các chức năng phòng học, đồng bộ realtime, chấm bài và tổng kết vẫn cần G2; không được xem là hoạt động online chỉ vì UI cũ còn nằm trong repo.

Để dừng các dịch vụ cục bộ: `docker compose -f compose.local.yml stop`. Không xóa volume nếu cần giữ dữ liệu.
