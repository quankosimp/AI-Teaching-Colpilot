# G1 local verification evidence

Scope: local Docker only. No real Google OAuth, Gemini, Zoom or public HTTPS acceptance is implied. Canonical SRS acceptance remains controlled by supervisor.

Showing 1 of 78 activities (limited to 1)

### TÁI KIỂM TOÁN ĐỘC LẬP CỔNG G1 (`b632542` — gồm `5017b05`, `a169bb2`, `b632542`)

* **Verdict G1 (Local Docker Scope)**: **`PASS`** — Toàn bộ 4 hạng mục chặn `MF-G1-01..04` đã được khắc phục triệt để, không phát sinh lỗi hồi quy (regression) hay nới lỏng ràng buộc bảo mật. Đủ điều kiện đóng cổng **G1 Local** và chuyển sang **G2**.
* **Thực chứng Kiểm tra Read-Only (Node `v22.23.4`, không reset DB đang chạy của QA)**:
  * `tsc --noEmit` (client) & `tsc -p tsconfig.server.json --noEmit` (server): **PASS (0 lỗi)**.
  * Unit & Contract tests (`tsx --test "tests/**/*.test.ts"`): **16/16 unit tests PASS** (cộng 2 suite tích hợp PG+MinIO `g1.integration.test.ts` và `g1.review.test.ts` nâng tổng số lên **18 tests**).

---

### I. XÁC NHẬN KHẮC PHỤC CÁC MỤC `MF-G1-01..04`

| Mã | File & Dòng Kiểm chứng | Kết quả Xác minh Chi tiết | Trạng thái |
|---|---|---|---|
| **`MF-G1-01`**<br>*(Source Eligibility & Per-Activity Validation)* | [`server/eligibleClaims.ts#L12-L62`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/eligibleClaims.ts#L12-L62)<br>[`server/routes/teacher.ts#L238-L290`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/teacher.ts#L238-L290)<br>[`server/routes/teacher.ts#L766-L832`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/teacher.ts#L766-L832)<br>[`server/routes/ai.ts#L100-L186`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/ai.ts#L100-L186) | 1) Hàm `filterEligibleApprovedClaims` bắt buộc mọi `evidenceIds` của `Claim` phải `active`, cùng `teacherId/studentId/sessionId`, không trùng lặp và có ít nhất 1 minh chứng quan sát thật (`isObservation === true && kind !== "GoiYGiangDay" && sourceType !== "ai_suggestion"`).<br>2) `GET /students/:id/history` và `POST /sessions/:id/ai/plan-suggestions` chỉ xuất `observationEvidenceIds` đủ điều kiện.<br>3) `PUT /sessions/:id/activities` kiểm tra **theo từng activity (`item`)**: cấm gửi lệch `sourceEvidenceIds` rỗng kèm `sourceClaimRefs` (hoặc ngược lại), cấm gắn `GoiYGiangDay`/`ai_suggestion`, và bắt buộc khớp `(claimId, revision)` của thành viên trong buổi học. | **VERIFIED FIXED** |
| **`MF-G1-02`**<br>*(Activity Form Inputs & Material Version)* | [`src/product/OnlineApp.tsx#L36-L45`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/src/product/OnlineApp.tsx#L36-L45)<br>[`src/product/OnlineApp.tsx#L446-L469`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/src/product/OnlineApp.tsx#L446-L469)<br>[`src/product/OnlineApp.tsx#L1158-L1177`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/src/product/OnlineApp.tsx#L1158-L1177)<br>[`server/routes/materials.ts#L283-L327`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/materials.ts#L283-L327) | 1) `addActivity` đã gửi đúng `description: activityDescription` và `duration: activityDuration` người dùng nhập, kích hoạt chính xác cảnh báo vượt thời lượng (`PLAN 002`).<br>2) Chọn học liệu cho hoạt động đã lấy `currentVersion` thực tế của học liệu thay vì gán cứng `1`; `GET /materials/:id/read-url?version=N` trả đúng phiên bản yêu cầu. | **VERIFIED FIXED** |
| **`MF-G1-03`**<br>*(MinIO Cleanup, `uploadId` Race `409` & Scoped Logout)* | [`server/routes/materials.ts#L130-L281`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/materials.ts#L130-L281)<br>[`server/cleanupUploads.ts#L6-L30`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/cleanupUploads.ts#L6-L30)<br>[`server/routes/auth.ts#L115-L144`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/auth.ts#L115-L144)<br>[`tests/unit/product/g1.review.test.ts#L236-L426`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/tests/unit/product/g1.review.test.ts#L236-L426) | 1) Khi tệp sai kích thước/loại/SHA-256/magic-bytes hoặc lỗi transaction, khối `finally` xóa sạch `finalKey` khỏi `/verified/` và xóa `upload.storageKey` tạm; sweeper `cleanupExpiredUploads` dọn các staging key quá hạn.<br>2) Đua lệnh dùng lại `uploadId` với `Idempotency-Key` khác trả đúng `[201, 409 VERSION_CONFLICT]` thay vì `500`.<br>3) `POST /auth/logout` thu hồi cả `actor.sessionId` lẫn phiên của `copilot_refresh` cookie nếu cùng thuộc `actor.id`, đồng thời không xóa/thu hồi nhầm cookie của giáo viên khác. | **VERIFIED FIXED** |
| **`MF-G1-04`**<br>*(Visual Annotation Layer & PDF Page Canvas)* | [`src/product/presentation/index.tsx#L40-L66`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/src/product/presentation/index.tsx#L40-L66)<br>[`src/product/MaterialViewer.tsx#L114-L305`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/src/product/MaterialViewer.tsx#L114-L305)<br>[`src/product/refinement.css#L460-L466`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/src/product/refinement.css#L460-L466) | `MaterialViewer` dựng từng trang PDF lên `<canvas>` (qua `pdfjs-dist` + `ResizeObserver`) hoặc `<img>` bên trong `AnnotationLayer` (`.annotation-page` `position: relative; width: 100%`), định vị các pin theo `left: ${pin.x}%, top: ${pin.y}%` khớp trang và `materialVersion`, giữ nguyên tọa độ chuẩn hóa khi đổi kích thước khung xem (`MAT 003`, `MAT 005`). | **VERIFIED FIXED** |

---

### II. PHẠM VI ĐÃ NGHIỆM THU CỤC BỘ G1 vs CÁC CỔNG TIẾP THEO

* **Đã đạt ở mức G1 Local (`PASS`)**:
  * Nền xác thực & cô lập tenant (`AUTH 002`, `AUTH 003`, `AUTH 004` local mock + khóa ở prod/staging, `OPS 001–002` cho các route G1).
  * Quản lý hồ sơ & xuất lịch sử đã duyệt có kiểm chứng nguồn quan sát (`STU 001,002,005`).
  * Tải lên/xem trước học liệu riêng tư có phiên bản và lớp phủ chú thích chuẩn hóa (`MAT 001,002,003,005`).
  * Lập kế hoạch buổi học 1–5 học sinh, sắp xếp/cảnh báo thời lượng, truy nguồn và gợi ý AI theo consent (`PLAN 001–004` ở chế độ local; provider thật chờ credentials).
* **Chưa tính là nghiệm thu toàn cục SRS (Chờ G2/G3 và Provider/VPS thật)**:
  * `AUTH 001` (Google OAuth thật), `AI 001–007` (Gemini thật), `VID 001–005` (Zoom Video SDK thật) và `OPS 001–004` trên HTTPS VPS đang chờ credentials/môi trường staging thật.
  * Các module phòng học trực tiếp, invite/lobby/Socket.IO outbox, công cụ lớp, ghi nhận minh chứng trực tiếp và duyệt tổng kết (`LIVE 001–006`, `ROOM 001–006`, `TOOL 001–007`, `EVD 001–004`, `REV 001–006`) thuộc phạm vi **G2–G3**.

Supervisor có thể đóng cổng **G1 Local** và giao **G2**.
