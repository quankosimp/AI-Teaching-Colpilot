# AI Teaching Copilot

**AI Teaching Copilot** là nền tảng lớp học trực tuyến và trợ lý sư phạm AI dành cho giáo viên / gia sư dạy kèm (1–1 hoặc nhóm nhỏ). Hệ thống tích hợp xuyên suốt vòng đời giảng dạy khép kín: **Hồ sơ năng lực học sinh $\rightarrow$ Soạn giáo án cá nhân hóa $\rightarrow$ Phòng học trực tiếp đa thiết bị (Realtime) $\rightarrow$ Tổng kết & Duyệt nhận định năng lực dựa trên minh chứng thực tế**.

---

## 1. Tính năng cốt lõi & Hai luồng trải nghiệm

Hệ thống tự động phân luồng tại [`src/main.tsx`](./src/main.tsx) thành 2 không gian làm việc độc lập theo vai trò:

### A. Không gian làm việc của Giáo viên (`/` — `OnlineApp`)
1. **Tổng quan & Lịch dạy (`OnlineOverview`):**
   - Thống kê nhanh học sinh đang theo học, buổi học đang diễn ra, buổi chờ duyệt và nhận định năng lực đã xác thực.
   - **Lịch dạy tương tác (`Lịch tháng` / `Danh sách`):** Xem lịch theo lưới tháng (Calendar), lọc theo ngày, và nhấn trực tiếp vào từng buổi học để mở **Modal Chi tiết buổi học** (xem mục tiêu, danh sách học sinh, lộ trình hoạt động, hoặc nhảy thẳng tới *Chỉnh sửa giáo án* / *Mở phòng học*).
2. **Hồ sơ học sinh & Tri thức tích lũy:**
   - Quản lý mục tiêu học tập, điểm mạnh, lỗ hổng kiến thức cần bù đắp, lịch sử các buổi học, minh chứng quan sát và kho nhận định năng lực đã duyệt (`approved`) hoặc chờ duyệt (`pending`).
3. **Thư viện học liệu riêng tư (`MinIO` / S3-compatible):**
   - Tải lên học liệu PDF/JPEG/PNG (tối đa 10 MiB, kiểm tra magic bytes & băm SHA-256), quản lý phiên bản (`MaterialVersion`) và cấp phát URL đọc có chữ ký ngắn hạn (Presigned Read URL).
4. **Soạn buổi học (`Lesson Plan`) kết hợp AI Copilot:**
   - Thiết kế chuỗi hoạt động theo thời lượng (*Khởi động*, *Lý thuyết*, *Luyện tập*, *Kiểm tra*), gắn học liệu cho từng hoạt động.
   - **Đề xuất hoạt động từ lịch sử đã duyệt (`POST /api/v1/sessions/:id/ai/plan-suggestions`):** AI đối chiếu các nhận định năng lực đã duyệt của học sinh (khi có `consent: true`) để gợi ý hoạt động phù hợp cho buổi mới.
5. **Phòng học trực tiếp thời gian thực (`LiveRoom` — WebSocket / Socket.IO):**
   - **Quản lý phòng chờ & Mã mời (`Invite Code`):** Tạo mã mời cho học sinh, kiểm soát quyền vào phòng (`waiting` $\rightarrow$ `joined`), bật/tắt quyền viết bảng và thu hồi quyền truy cập tức thì.
   - **Sân khấu giảng dạy hợp nhất:** Trình chiếu tài liệu PDF/ảnh có chú thích trực tiếp, **Bảng viết tương tác (`OnlineBoard`)** hỗ trợ bảng chung và bảng nháp riêng của từng học sinh, **Câu hỏi kiểm tra nhanh (`QuickCheck`)**, và **Nộp bài/chấm bài tại chỗ (`Submission`)**.
   - **Video & Âm thanh trực tiếp (`MediaHost`):** Tích hợp `@zoom/videosdk-ui-toolkit` với chế độ PiP thu gọn hoặc mở rộng.
   - **Copilot giảng dạy trong lớp (`AITeachingPanel` — `POST /api/v1/sessions/:id/ai/suggestions`):** Hỗ trợ 4 chế độ sư phạm (*Giải thích lại*, *Câu hỏi gợi mở*, *Ví dụ tương tự*, *Điều chỉnh độ khó*) kèm bộ lọc ẩn danh tên riêng học sinh (`sanitizeContext`) trước khi gửi tới Gemini.
6. **Tổng kết & Duyệt sau buổi học (`ReviewPanel`):**
   - Đối chiếu toàn bộ minh chứng quan sát thu thập trong buổi học (bài nộp, câu trả lời kiểm tra nhanh, bảng nháp, ghi chú giáo viên).
   - **Copilot dự thảo nhận định từ minh chứng (`AIClaimDraftPanel` — `POST /api/v1/sessions/:id/ai/claims-draft`):** Tổng hợp các minh chứng quan sát hợp lệ thành nhận định dự thảo (`pending`) kèm trích dẫn chính xác UUID minh chứng. Giáo viên toàn quyền chỉnh sửa, duyệt (`approved`) hoặc từ chối (`rejected`).

### B. Cổng tham gia lớp học của Học sinh (`/?room=1` hoặc `#student-room` — `StudentEntry`)
- Học sinh truy cập bằng liên kết cổng học sinh và nhập **Mã mời (`Invite Code`)** do giáo viên cung cấp.
- Tích xác nhận **đồng ý tham gia & sử dụng hỗ trợ AI (`consent`)** trước khi vào phòng chờ.
- Đồng bộ thời gian thực với giáo viên: xem tài liệu đang trình chiếu, làm bài trên bảng viết, trả lời câu hỏi kiểm tra nhanh (`QuickCheck`) và tải ảnh bài làm lên trực tiếp.

---

## 2. Kiến trúc kỹ thuật

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4 + hệ thống Design Token SaaS (Sáng/Tối đồng bộ tại [`src/product/online-restoration.css`](./src/product/online-restoration.css)), `socket.io-client`, `pdfjs-dist`, `@zoom/videosdk-ui-toolkit`.
- **Backend:** Node.js 22, Express, TypeScript (`tsx`), `socket.io` (Outbox pattern + Realtime classroom channel), xác thực JWT (`jose`) kết hợp Refresh Cookie `HttpOnly`.
- **Cơ sở dữ liệu & Lưu trữ:** PostgreSQL (quản lý qua Prisma ORM với khóa phiên `sessionLock`, bảng bất biến `ClaimRevision` / `EvidenceRevision` và `AuditLog`), MinIO (lưu trữ đối tượng riêng tư).
- **Tích hợp AI (`server/ai/`):** `@google/genai` (`RealGeminiAdapter` + `FakeAIAdapter` cho môi trường mock/test), tích hợp bộ ngắt mạch (`CircuitBreaker`), kiểm tra `consent` bắt buộc, ẩn danh thông tin cá nhân (`sanitizer.ts`) và kiểm chứng trích dẫn UUID minh chứng bằng Zod.

---

## 3. Hướng dẫn cài đặt & Chạy cục bộ (Local Development)

### Yêu cầu hệ thống
- **Node.js:** `>=22.13.0 <23`
- **Package Manager:** `pnpm@11.25.0` (hoặc `npm` / `npx`)
- **Docker & Docker Compose:** Dùng để khởi chạy PostgreSQL (`127.0.0.1:55432`) và MinIO (`127.0.0.1:59000`).

### Các bước khởi chạy

1. **Cài đặt phụ thuộc:**
   ```bash
   pnpm install --frozen-lockfile --strict-peer-dependencies
   ```

2. **Tạo tệp cấu hình môi trường `.env`:**
   ```bash
   cp .env.example .env
   ```
   *(Tệp `.env` đã được cấu hình trong `.gitignore` để không bao giờ đẩy khóa bí mật lên Git).*

3. **Khởi động PostgreSQL và MinIO bằng Docker Compose:**
   ```bash
   docker compose -f compose.local.yml up -d
   ```

4. **Chạy migration Prisma & sinh Prisma Client:**
   ```bash
   pnpm exec prisma migrate deploy && pnpm exec prisma generate
   ```

5. **Khởi tạo dữ liệu mẫu cục bộ (`seed`):**
   ```bash
   pnpm seed:local
   ```
   Lệnh này khởi tạo bucket MinIO riêng tư cùng 2 tài khoản giáo viên demo (**Hoàng Nam** và **Mai An**) và học sinh mẫu. Chạy lại nhiều lần không gây trùng lặp dữ liệu.

6. **Chạy API Server và Giao diện Web:**
   - Terminal 1 (API & WebSocket tại `http://127.0.0.1:3100`):
     ```bash
     pnpm dev:server
     ```
   - Terminal 2 (Vite Frontend tại `http://localhost:3000`):
     ```bash
     pnpm dev
     ```
   - Mở trình duyệt tại **`http://localhost:3000`** (Vite tự động proxy `/api` và `/socket.io` sang `http://127.0.0.1:3100`).

---

## 4. Cấu hình Gemini AI, Google OAuth & Zoom Video SDK

Trong tệp `.env`:

### Bật trợ lý Gemini AI thật
```env
ENABLE_AI=true
GEMINI_MODEL=gemini-3-flash-preview
GEMINI_API_KEY=<khóa_api_gemini_của_bạn>
```
- Khi `ENABLE_AI=true` cùng `GEMINI_API_KEY` và `GEMINI_MODEL` hợp lệ, hệ thống tự động kích hoạt [`RealGeminiAdapter`](./server/ai/geminiAdapter.ts) và bật cờ `featureFlags.ai = true` tại `GET /api/v1/auth/me`.
- Nếu `ENABLE_AI=true` nhưng để trống `GEMINI_API_KEY` trong chế độ `APP_MODE=local_mock` hoặc `test`, hệ thống dùng `FakeAIAdapter` để phục vụ kiểm thử cục bộ (tuyệt đối không fallback sang mock ở `staging` / `production`).

### Cấu hình Google OAuth & Zoom Video SDK (Tùy chọn)
```env
# Google OAuth2
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# Zoom Video SDK
ZOOM_SDK_KEY=
ZOOM_SDK_SECRET=
```

---

## 5. Kiểm thử & Đảm bảo chất lượng (Testing & QA)

- **Kiểm tra kiểu tĩnh (Typecheck) & Build:**
  ```bash
  pnpm lint
  pnpm typecheck:server
  pnpm build
  pnpm build:server
  ```
- **Khởi tạo lại cơ sở dữ liệu kiểm thử (`copilot_test`):**
  ```bash
  APP_MODE=test pnpm testdb:reset
  ```
- **Chạy toàn bộ bộ kiểm thử sản phẩm:**
  ```bash
  pnpm test
  ```
- **Kiểm tra sức khỏe dịch vụ (Health Probes):**
  - `GET /health/live`: Kiểm tra tiến trình máy chủ sống.
  - `GET /api/v1/health`: Kiểm tra trạng thái kết nối PostgreSQL, MinIO bucket, hàng đợi sự kiện Realtime và trạng thái cấu hình AI / Video.
  - `GET /api/v1/ai/circuit-status`: Kiểm tra trạng thái Circuit Breaker và model AI hiện hành.

---

## 6. Cấu trúc thư mục chính

```text
├── contracts/               # Schema Zod dùng chung giữa Frontend & Backend (API, AI, Media)
├── prisma/                  # Schema PostgreSQL, migrations và ràng buộc toàn vẹn dữ liệu
├── server/                  # Backend Express + Socket.IO
│   ├── ai/                  # RealGeminiAdapter, FakeAIAdapter, CircuitBreaker, Sanitizer
│   ├── routes/              # Các tuyến API: auth, teacher, classroom, review, materials, ai
│   ├── app.ts               # Khởi tạo ứng dụng Express & Healthcheck
│   ├── realtime.ts          # Đồng bộ phòng học thời gian thực & Outbox publisher
│   └── seed.ts              # Khởi tạo dữ liệu demo cục bộ
├── src/
│   ├── main.tsx             # Điểm vào ứng dụng (Phân luồng Giáo viên / Học sinh)
│   └── product/             # Toàn bộ giao diện sản phẩm chính
│       ├── OnlineApp.tsx        # Điều phối Workspace giáo viên, Hồ sơ, Học liệu, Giáo án
│       ├── OnlineOverview.tsx   # Trang Tổng quan, Lịch tháng (Calendar) & Modal chi tiết buổi học
│       ├── LiveRoom.tsx         # Phòng học trực tiếp (Giáo viên) & Cổng vào lớp (Học sinh)
│       ├── OnlineBoard.tsx      # Bảng viết tương tác thời gian thực
│       ├── ReviewPanel.tsx      # Tổng kết buổi học & Duyệt nhận định năng lực
│       ├── AITeachingPanel.tsx  # Giao diện Copilot trợ giảng & Dự thảo nhận định
│       ├── media/               # Tích hợp Zoom Video SDK (MediaHost)
│       └── online-restoration.css # Hệ thống giao diện & chủ đề Sáng/Tối
└── tests/                   # Bộ kiểm thử đơn vị, tích hợp API và kiểm thử trình duyệt (Playwright)
```
