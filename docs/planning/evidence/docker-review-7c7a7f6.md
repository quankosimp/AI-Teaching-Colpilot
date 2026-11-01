Showing 1 of 10 activities (limited to 1)

# Báo cáo Audit Độc lập `REVIEW-04` — Packaging (`7c7a7f6`) & Product Hook (`e1c1c9d`)

- **Phạm vi kiểm toán (Read-Only)**:
  1. Ops worktree [`/home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031) tại đúng commit **`7c7a7f6`** (`PRODUCT-12-A`). *(Lưu ý: Không chấm các thay đổi WIP chưa commit trên working tree là hoàn tất).*
  2. Product worktree [`/home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031) tại đúng commit **`e1c1c9d`** (container runtime & MinIO public presigner hooks).
- **Tuân thủ ràng buộc**: Chỉ đọc (`git show` / `read_file`), không sửa file, không chạy migration/reset DB, không dừng container, không tạo subagent.

---

## 1. Verdict Phân tách theo Phạm vi

| Hạng mục | Verdict | Trạng thái thực tế |
|---|---|---|
| **Product Hook (`e1c1c9d`)** | **PASS** | Đã hỗ trợ `BIND_HOST`, tách `client` nội bộ và `publicClient` ký URL công khai với `MINIO_REGION` + guard TLS nghiêm ngặt. |
| **Ops Packaging Artifacts (`7c7a7f6`)** | **NEEDS_FIXES** | Có 6 lỗi cụ thể (`MF-OPS-01..06`) ở `docker-doctor.mjs`, `.dockerignore`, CORS MinIO, bucket policy, `entrypoint.sh` và đồng bộ commit `e1c1c9d`. |
| **Local Docker Runtime (`7c7a7f6`)** | **BLOCKED / NEEDS_FIXES** | Gateway SPA trả `200`, DB & Storage nội bộ `ready` (`realtime: "not_configured"`), nhưng Gateway `/health/live` trả **`502 Bad Gateway`** do nhánh Ops tại `7c7a7f6` chưa tích hợp `e1c1c9d` và chưa rebuild image `api`. |
| **Public HTTPS & Real Providers (`EXT-01..04`)** | **BLOCKED (Expected)** | Chưa có VPS/domain/Google OAuth/Zoom/Gemini thật; tuyệt đối không tính là `PASS` cho nghiệm thu thật. |

---

## 2. Đánh giá Chi tiết Product Hook Commit `e1c1c9d` (`PASS`)

1. **`BIND_HOST` & Loopback Default ([`server/index.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/index.ts#L9-L14))**:
   - Sử dụng `process.env.BIND_HOST?.trim() || (config.mode === "local_mock" || config.mode === "test" ? "127.0.0.1" : "0.0.0.0")`.
   - Giữ nguyên mặc định an toàn `127.0.0.1` khi chạy trực tiếp trên host ở chế độ `local_mock`/`test`, đồng thời cho phép container API nhận `BIND_HOST=0.0.0.0` từ `compose.docker.yml` để Caddy `gateway` kết nối tới `api:3100`.
2. **Tách `publicClient` Presigner, `MINIO_REGION` & Guard TLS ([`server/routes/materials.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/materials.ts#L21-L71))**:
   - Tách `client` (`MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`) cho các thao tác S3 phía server (`statObject`, `copyObject`, `removeObject`, `getObject` tại [`L165-L307`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/materials.ts#L165-L307)) và `publicClient` (`MINIO_PUBLIC_ENDPOINT`, `MINIO_PUBLIC_PORT`, `MINIO_PUBLIC_USE_SSL`) chỉ dùng để ký URL cho trình duyệt tại `/materials/upload-intent` ([`L110-L122`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/materials.ts#L110-L122)) và `/materials/:id/read-url` ([`L345-L350`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/materials.ts#L345-L350)).
   - Truyền tường minh `region = process.env.MINIO_REGION || "us-east-1"` ([`L25`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/materials.ts#L25), [`L47`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/materials.ts#L47), [`L60`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/materials.ts#L60)) giúp MinIO SDK ký presigned URL hoàn toàn offline mà không mở kết nối mạng tới `127.0.0.1:59002` từ bên trong container `api`.
   - Kiểm tra bắt buộc TLS (`!useSSL || !publicUseSSL`) khi `APP_MODE` là `production` hoặc `staging` ([`L36-L40`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/materials.ts#L36-L40)).
3. **Vite Proxy Hook ([`vite.config.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/vite.config.ts#L7-L19))**:
   - Bổ sung `API_PROXY_TARGET` (mặc định `http://127.0.0.1:3100`) cho cả `/api` và `/socket.io` (`ws: true`).

---

## 3. Các Phát hiện Cần sửa trên Ops Commit `7c7a7f6` (`NEEDS_FIXES`)

### `[HIGH] MF-OPS-01` — `docker-doctor.mjs` luôn báo `BLOCKED` cứng và luôn thoát với exit code `0` kể cả khi lỗi
- **Vị trí**: [`scripts/docker-doctor.mjs`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/scripts/docker-doctor.mjs#L160-L246)
- **Chi tiết**:
  1. Tại [`L161-L217`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/scripts/docker-doctor.mjs#L161-L217), khi probe Gateway `http://127.0.0.1:4170/`, `/health/live` (trả `502` hoặc lỗi kết nối) hay `/api/v1/health` thất bại, biến `allChecksPassed` **không bao giờ** được gán `false`.
  2. Tại [`L219-L224`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/scripts/docker-doctor.mjs#L219-L224), `blockedPoints.push({ item: 'MinIO Public Signer split...' })` bị gắn cứng vô điều kiện trong mọi lần chạy, dù code đã có hay chưa.
  3. Tại [`L240-L246`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/scripts/docker-doctor.mjs#L240-L246), `runDiagnostics()` trả về `allChecksPassed` nhưng lời gọi ở [`L243`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/scripts/docker-doctor.mjs#L243) bỏ qua giá trị trả về, dẫn đến script luôn kết thúc với **exit code `0`** ngay cả khi thiếu file, container chưa chạy, hoặc gateway bị `502`.
- **Yêu cầu sửa**: Kiểm tra thực tế trạng thái probe/code thay vì gắn cứng `blockedPoints`; đặt `allChecksPassed = false` khi bất kỳ probe runtime/security nào lỗi hoặc `BLOCKED`, và gọi `process.exit(1)` khi `!allChecksPassed` hoặc `blockedPoints.length > 0`.

### `[HIGH] MF-OPS-02` — Rủi ro lộ file môi trường `deploy/local.env` vào Docker build context
- **Vị trí**: [`.dockerignore`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/.dockerignore#L9-L12), [`Dockerfile`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/Dockerfile#L45), [`deploy/README.md`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/deploy/README.md#L94-L95)
- **Chi tiết**: `.dockerignore` tại [`L10-L12`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/.dockerignore#L10-L12) chỉ chặn `.env` và `.env.*` ở thư mục gốc. Nếu người vận hành tạo `deploy/local.env` hoặc `deploy/.env` từ `deploy/local.env.example`, lệnh `COPY . .` tại [`Dockerfile#L45`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/Dockerfile#L45) sẽ đưa file chứa secret vào layer của image `builder`.
- **Yêu cầu sửa**: Cập nhật `.dockerignore` để chặn đệ quy `**/.env`, `**/.env.*`, `**/*.env`, `**/*.env.*` và chỉ giữ lại `!**/.env.example`, `!**/local.env.example`.

### `[HIGH] MF-OPS-03` — Cấu hình CORS mặc định của MinIO chứa wildcard `*`
- **Vị trí**: [`compose.docker.yml`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/compose.docker.yml#L32)
- **Chi tiết**: Dòng [`L32`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/compose.docker.yml#L32) đặt `MINIO_API_CORS_ALLOW_ORIGIN: ${MINIO_API_CORS_ALLOW_ORIGIN:-"http://127.0.0.1:4170,http://localhost:4170,*"}`. Dấu `*` ở cuối làm vô hiệu hóa giới hạn origin cục bộ.
- **Yêu cầu sửa**: Bỏ `,*` khỏi giá trị mặc định trong `compose.docker.yml` và khai báo tường minh `MINIO_API_CORS_ALLOW_ORIGIN="http://127.0.0.1:4170,http://localhost:4170"` trong `deploy/local.env.example`.

### `[MEDIUM] MF-OPS-04` — `init-minio.sh` chưa cưỡng chế tường minh chính sách bucket private (`anonymous none`)
- **Vị trí**: [`deploy/scripts/init-minio.sh`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/deploy/scripts/init-minio.sh#L28-L32)
- **Chi tiết**: Script chỉ gọi `mc mb --ignore-existing "local/${BUCKET}"` ([`L29`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/deploy/scripts/init-minio.sh#L29)) mà không gọi `mc anonymous set none "local/${BUCKET}"` để đảm bảo bucket luôn ở trạng thái private trên persistent volume `minio_data`.
- **Yêu cầu sửa**: Thêm `mc anonymous set none "local/${BUCKET}"` vào `deploy/scripts/init-minio.sh` và kiểm tra lại trong `scripts/docker-doctor.mjs`.

### `[MEDIUM] MF-OPS-05` — `entrypoint.sh` ẩn lỗi khi seed thất bại và `AUTO_SEED` mặc định `true` trong `compose.docker.yml`
- **Vị trí**: [`deploy/entrypoint.sh`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/deploy/entrypoint.sh#L30-L44), [`compose.docker.yml`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/compose.docker.yml#L95)
- **Chi tiết**:
  - Vòng lặp `until /app/node_modules/.bin/tsx server/seed.ts > /dev/null 2>&1 || [ $RETRIES -eq 0 ]` ([`L33-L40`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/deploy/entrypoint.sh#L33-L40)) nuốt toàn bộ log lỗi suốt 20 lần thử (40 giây) và khi hết lượt chỉ in cảnh báo (`WARNING: Seeding timed out`) mà không hiển thị nguyên nhân hay trả mã lỗi.
  - Ngoài ra, [`server/seed.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/server/seed.ts#L7-L8) chặn chạy ngoài `local_mock`/`test`, nên nếu `AUTO_SEED` giữ mặc định `true` ([`compose.docker.yml#L95`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/compose.docker.yml#L95)) khi chạy mode khác, container sẽ bị treo 40 giây vô ích.
- **Yêu cầu sửa**: Chỉ chạy `AUTO_SEED` khi `APP_MODE` là `local_mock` hoặc `test`, và khi hết lượt retry thì in output lỗi thực tế của `tsx server/seed.ts`.

### `[MEDIUM] MF-OPS-06` — Tích hợp commit `e1c1c9d` vào nhánh Ops, đồng bộ `MINIO_REGION` và rebuild `api`
- **Vị trí**: [`compose.docker.yml`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/compose.docker.yml#L84-L93), [`deploy/local.env.example`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/deploy/local.env.example#L31-L41)
- **Chi tiết**: Nhánh Ops tại `7c7a7f6` chưa có commit `e1c1c9d` nên container `api` đang bind `127.0.0.1:3100` (gây lỗi `502` tại Gateway `/health/live`).
- **Yêu cầu sửa**: Cherry-pick/merge `e1c1c9d`, bổ sung `MINIO_REGION: ${MINIO_REGION:-us-east-1}` vào `compose.docker.yml` & `deploy/local.env.example`, rebuild container `api` và xác nhận Gateway `/health/live` trả `200`.

---

## 4. Các Kiểm soát Đóng gói Đã Đạt tại `7c7a7f6`

- **Tính tái lập & Multi-stage Image ([`Dockerfile`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/Dockerfile#L6-L94))**: Dùng `node:22-bookworm-slim` (OpenSSL 3.0.x tương thích Prisma), ghim `pnpm@11.25.0` qua Corepack ([`L20`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/Dockerfile#L20)), cài đặt với `pnpm install --frozen-lockfile` ([`L33`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/Dockerfile#L33)), tách biệt image `api` và `gateway` (`caddy:2-alpine`), không nướng secret vào `ENV` của image.
- **Cô lập Cổng Loopback & Volume ([`compose.docker.yml`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/compose.docker.yml#L12-L130))**: Toàn bộ cổng publish ra host đều khóa chặt vào `127.0.0.1` (`4170`, `55433`, `59002`, `59003`), không mở `0.0.0.0`; cổng `api:3100` chỉ nằm trong mạng nội bộ `internal_net`; tên project `teaching-copilot-local` và volume `teaching-copilot-local-pg-data` / `teaching-copilot-local-minio-data` tách biệt hoàn toàn với môi trường dev/QA.
- **An toàn Migration & Guard Auth Mock ([`deploy/entrypoint.sh`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/deploy/entrypoint.sh#L12-L27), [`server/context.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/context.ts#L15-L38))**: Chỉ chạy `prisma migrate deploy` (không drop/reset DB); `loadConfig()` chặn hoàn toàn `APP_MODE=local_mock|test` nếu `NODE_ENV=production|staging`.
