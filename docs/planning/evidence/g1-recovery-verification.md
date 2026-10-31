# G1 local verification evidence

Scope: local Docker only. No real Google OAuth, Gemini, Zoom or public HTTPS acceptance is implied. Canonical SRS acceptance remains controlled by supervisor.

Showing 1 of 51 activities (limited to 1)

**`WORKER_ALIVE`** — Đã tiếp quản vai trò **PRODUCT** trên worktree `/home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031` (branch `workers/product-completion-20261031`, `HEAD` giữ nguyên sạch tại **`b632542`** / `b63254217d139bdff33c4dffb46b7a47211fa8f0`, không chỉnh sửa thêm file hay SHA).

---

### 1. Kiểm tra 2 Commit Sửa lỗi G1 (`a169bb2` & `b632542`)

| Mã finding | Commit xử lý | Nội dung đã kiểm chứng trong code & thực nghiệm | Trạng thái |
|---|---|---|---|
| **`MF-G1-01`**<br>(`STU 002,005`, `PLAN 003`, `AI 003`, `D04`) | `a169bb2` | - Hàm [`filterEligibleApprovedClaims`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/eligibleClaims.ts#L12-L61) lọc chặt các `Claim` `approved`: bắt buộc `evidenceIds` không rỗng, không trùng, tất cả nguồn phải `status: "active"`, cùng `teacherId`/`studentId`/`sessionId`, và có ít nhất 1 nguồn quan sát thực (`isObservation === true`, `kind !== "GoiYGiangDay"`, `sourceType !== "ai_suggestion"`).<br>- Dùng thống nhất tại [`GET /students/:id/history`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/teacher.ts#L238-L290), [`PUT /sessions/:id/activities`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/teacher.ts#L766-L832) và [`POST /sessions/:id/ai/plan-suggestions`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/ai.ts#L100-L120).<br>- [`PUT /sessions/:id/activities`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/teacher.ts#L774-L832) kiểm tra độc lập **per-activity** (`item.sourceEvidenceIds` và `item.sourceClaimRefs` đối chiếu chéo từng `item`), chặn hoàn toàn việc Activity 1 mượn `claimRefs`/`evidenceIds` của Activity 2 hoặc gửi mảng lệch rỗng (`403 PERMISSION_DENIED`). | **FIXED & VERIFIED** |
| **`MF-G1-02`**<br>(`PLAN 002`, `MAT 003`) | `a169bb2` & `b632542` | - Hàm [`addActivity`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/src/product/OnlineApp.tsx#L446-L469) gửi đúng `description: activityDescription` và `duration: activityDuration` từ form (ví dụ `75` phút trên buổi `60` phút kích hoạt cảnh báo `role="alert"` *"Tổng thời lượng hoạt động vượt thời lượng buổi học."*).<br>- Khi gắn học liệu vào hoạt động tại [`OnlineApp.tsx`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/src/product/OnlineApp.tsx#L1167-L1171), client truyền `materialVersion: materials.find(m => m.id === materialId)?.currentVersion ?? null`. | **FIXED & VERIFIED** |
| **`MF-G1-03`**<br>(`MAT 001,002`, `AUTH 003`, `D12`) | `a169bb2` | - Trong [`POST /materials`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/materials.ts#L165-L280), khối `try / finally` xóa `finalKey` trong `/verified/` nếu chưa `committed`, xóa `upload.storageKey` ngay sau khi copy sang `/verified/` hoặc khi sai MIME/size, và bắt lỗi đụng độ `Upload already used` trả `409 VERSION_CONFLICT` thay vì `500`.<br>- Bổ sung [`cleanupExpiredUploads`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/cleanupUploads.ts#L6-L30) dọn các staging key quá hạn.<br>- Trong [`POST /auth/logout`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/auth.ts#L116-L143), đối chiếu `cookieSession?.teacherId === res.locals.actor.id` trước khi thu hồi theo `refreshTokenHash` và xóa cookie, đảm bảo thu hồi cả phiên trong cookie của cùng giáo viên nhưng không thể thu hồi hoặc xóa cookie của giáo viên khác. | **FIXED & VERIFIED** |
| **`MF-G1-04`**<br>(`MAT 003,005`) | `b632542` (cùng UI `5017b05`) | - Component [`MaterialViewer`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/src/product/MaterialViewer.tsx#L29-L307) dùng `pdfjs-dist@5.4.624` render từng trang PDF thật lên `<canvas>` (0 `<iframe>`), bọc trong [`AnnotationLayer`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/src/product/presentation/index.tsx#L52-L66).<br>- Lọc chú thích theo `materialId`, `materialVersion`, `activityId` và `currentPage`; tọa độ pin chuẩn hóa `0..100%` (`left: ${x}%; top: ${y}%`) giữ nguyên tỷ lệ khi resize khung nhìn và tách biệt theo từng trang/phiên bản. | **FIXED & VERIFIED** |

---

### 2. Kết quả Chạy Kiểm tra Thực tế (Exact SHA: `b632542`)

Tất cả lệnh chạy bằng Node `v22.23.4` (`/home/quanan/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node`) và `pnpm@11.25.0`, **không gọi `testdb:reset`** trên `copilot_test` đang dùng bởi QA:

1. **Install & Schema & Typecheck & Build**:
   - `pnpm install --frozen-lockfile --strict-peer-dependencies`: **PASS**
   - `pnpm exec prisma validate` & `pnpm exec prisma generate`: **PASS**
   - `pnpm lint` (`tsc --noEmit`): **PASS (0 lỗi)**
   - `pnpm typecheck:server` (`tsc -p tsconfig.server.json --noEmit`): **PASS (0 lỗi)**
   - `pnpm build` (`vite build`) & `pnpm build:server`: **PASS**
2. **Unit & Real Local PG + MinIO Integration Suite**:
   - Khởi tạo DB độc lập `copilot_recovery_test` (`127.0.0.1:55432`) + bucket `copilot-recovery-test` (`127.0.0.1:59000`), chạy `prisma migrate deploy` + `pnpm seed:local` + `RUN_G1_INTEGRATION=1 pnpm test`:
   - **18/18 tests PASS** (`0 fail`, `0 skipped`), bao gồm:
     - 16 unit/contract tests trong [`tests/product.test.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/tests/product.test.ts), [`config.test.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/tests/unit/product/config.test.ts), [`contracts.test.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/tests/unit/product/contracts.test.ts), [`health.test.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/tests/unit/product/health.test.ts).
     - [`g1.integration.test.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/tests/unit/product/g1.integration.test.ts): cách ly tenant, lưu trữ học sinh/kế hoạch, xoay vòng refresh token, kiểm tra private upload & stale source.
     - [`g1.review.test.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/tests/unit/product/g1.review.test.ts): lọc lịch sử `filterEligibleApprovedClaims`, chặn mượn nguồn giữa các activity (`403`), lưu `description` + `duration: 75`, xóa sạch staging/verified key khi sai magic bytes hoặc SHA-256 (`400`), đua lệnh cùng `uploadId` trả `[201, 409]`, dọn `cleanupExpiredUploads`, và cô lập `/auth/logout` giữa `teacher-a` và `teacher-b`.
3. **Disposable Headless Browser E2E trên `http://localhost:3001` (API `127.0.0.1:3100`)**:
   - Kịch bản ([`verify_g1_browser.py`](file:///home/quanan/.paseo/accounts/antigravity-1/home/.gemini/antigravity-cli/brain/8134a4b6-32d2-4495-b5a8-e61ebd2714e2/scratch/verify_g1_browser.py)):
     - Đăng nhập `Demo Hoàng Nam` (`teacher-a`), tải lên tệp PDF 2 trang thật ([`fixture-2page.pdf`](file:///home/quanan/.paseo/accounts/antigravity-1/home/.gemini/antigravity-cli/brain/8134a4b6-32d2-4495-b5a8-e61ebd2714e2/scratch/fixture-2page.pdf)).
     - Tạo buổi học nháp 60 phút, thêm hoạt động từ form với `description = "Mô tả nhập từ form 75 phút"` và `duration = 75` → lưu đúng nội dung và hiển thị cảnh báo vượt thời lượng (`durationWarningVisible: true`).
     - Gắn học liệu PDF vào hoạt động, mở `"Xem và chú thích đề"` → render `<canvas>` (`iframeCount: 0`, `Trang 1/2`), đặt pin chú thích tại `left: 24.9091%; top: 39.7607%` gắn học sinh `Nguyễn Bảo Minh`.
     - Resize viewport `1280x900` → `520x800`: tọa độ pin giữ nguyên (`relXBefore: 0.2491`, `relXAfter: 0.2491`).
     - Chuyển sang `Trang 2/2`: pin trang 1 ẩn (`pinsOnPage2: 0`); quay lại `Trang 1/2`: pin hiển thị lại (`pinsOnPage1Return: 1`).
     - Đăng xuất và chuyển sang `Demo Mai An` (`teacher-b`): không thấy học liệu hay buổi học của `teacher-a` (`teacherBSeesTeacherAMaterial: 0`, `teacherBSeesTeacherASession: 0`).
   - Ảnh chụp bằng chứng: [`g1-pdf-annotation-verified.png`](file:///home/quanan/.paseo/accounts/antigravity-1/home/.gemini/antigravity-cli/brain/8134a4b6-32d2-4495-b5a8-e61ebd2714e2/scratch/g1-pdf-annotation-verified.png).

---

### 3. Phạm vi & Trạng thái Chờ

- **Fixed in G1 (`b632542`)**: Toàn bộ `MF-G1-01`, `MF-G1-02`, `MF-G1-03`, `MF-G1-04` đã hoàn tất và vượt qua kiểm thử. Không phát sinh commit mới.
- **External / Later Gates (Không claim đã pass)**: Google OAuth thật, Zoom Video SDK thật, Gemini API thật và HTTPS staging/production vẫn đang chặn bởi việc chưa có credentials/domain; các luồng phòng học trực tiếp, invite/lobby, Socket.IO outbox, công cụ lớp học và duyệt tổng kết thuộc phạm vi G2–G4.

Đang chờ Supervisor nghiệm thu đóng cổng G1 và giao nhiệm vụ G2.
