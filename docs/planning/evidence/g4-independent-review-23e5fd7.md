Independent read-only review of immutable23e5fd7. The NEEDS_FIXES verdict and production-fallback/plan-concurrency findings are retained. Positive assessments of complete context sanitization or rejecting every mixed invalid-reference candidate are broader than the code supports; supervisor SG4-02/03 explicitly override those assessments. This is source/type inspection, not supervisor or independent real-provider execution. Worker links reference worktrees that may not contain this commit; the immutable Git source is authoritative.

Showing 1 of 363 activities (limited to 1)

# Báo Cáo Độc Lập Kiểm Toán G4 AI Backend (Strict Immutable Commit 23e5fd7)

**Đối tượng kiểm toán**: Exact commit [`23e5fd720ad5fa4cf2ad64574f62c7d2c40a3533`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031) so sánh với [`55c05e1`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031).  
**Phương thức kiểm toán**: STRICT READ-ONLY — Truy xuất trực tiếp qua `git show 23e5fd7:<path>`, không đọc mutable worker files, không sửa DB/source, không push, không dùng subagent.  
**Kết luận tổng thể**: **NEEDS_FIXES** — Không chấp nhận kết luận "Toàn bộ AI hoàn chỉnh" hay "Gemini thật đã chạy thành công" từ fake tests. Có blocker kiến trúc nghiêm trọng về cơ chế fail-closed của fake provider trên môi trường staging/production.

---

## 1. Bằng Chứng Gói SDK Google GenAI Đã Cài Đặt

- **Khai báo `package.json`**: `"@google/genai": "^2.4.0"`, `"google-auth-library": "10.6.2"`.
- **Phiên bản cài đặt thực tế trong `node_modules`**:
  `node_modules/@google/genai/package.json` -> **Version `2.24.0`**.
- **Kiểm tra API SDK trong bundle**:
  Tập tin [`node_modules/@google/genai/dist/genai.d.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/node_modules/@google/genai/dist/genai.d.ts#L2308) xác nhận cấu hình `GenerateContentConfig` hỗ trợ `abortSignal?: AbortSignal`. Lớp [`RealGeminiAdapter`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/ai/geminiAdapter.ts#L100) sử dụng `abortSignal: AbortSignal.timeout(this.timeoutMs)` khớp với type definition của SDK.

---

## 2. Concrete Blockers Phát Hiện Trên Commit 23e5fd7

### Blocker 1: Fake Adapter Không Fail-Closed Trên Staging / Production
- **Tập tin**:
  - [`server/ai/index.ts#L20-L38`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/ai/index.ts#L20-L38)
  - [`server/routes/ai.ts#L40-L770`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/ai.ts#L40-L770)
- **Cơ chế lỗi**:
  Trong hàm [`getAIAdapter()`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/ai/index.ts#L20-L38):
  ```typescript
  const enabled = process.env.ENABLE_AI === "true";
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  const appMode = process.env.APP_MODE || "local_mock";

  if (enabled && apiKey && model && appMode !== "local_mock" && appMode !== "test") {
    // Khởi tạo RealGeminiAdapter
    return defaultRealAdapter;
  }

  // Fallback:
  if (!defaultFakeAdapter) {
    defaultFakeAdapter = new FakeAIAdapter();
  }
  return defaultFakeAdapter;
  ```
  Nếu hệ thống chạy trên `appMode === "staging"` hoặc `appMode === "production"` (hoặc `config.mode === "production"`), nhưng `ENABLE_AI !== "true"` hoặc chưa cấu hình `GEMINI_API_KEY`: điều kiện `if` bị bỏ qua và hàm **tự động fallback về `FakeAIAdapter`**.
  Đồng thời, các route trong [`server/routes/ai.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/ai.ts) không kiểm tra cờ môi trường production/staging để chặn fake adapter.
- **Hậu quả**:
  Khi deploy lên staging hoặc production mà thiếu cấu hình Gemini, hệ thống sẽ âm thầm tạo nhận định và gợi ý giả lập (mock data) thay vì fail-closed trả mã lỗi `503 AI_UNAVAILABLE`.

### Blocker 2: Thiếu Khóa Concurrency và Idempotency Trong `POST /sessions/:id/ai/plan-suggestions`
- **Tập tin**: [`server/routes/ai.ts#L590-L745`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/ai.ts#L590-L745)
- **Cơ chế lỗi**:
  Khác với hai route `suggestions` và `claims-draft` (được bảo vệ bằng [`createOnce`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/idempotency.ts) và [`lockSession`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/sessionLock.ts)), endpoint `plan-suggestions` không bọc session lock khi ghi vào database sau khi gọi external AI adapter.
  Nếu trạng thái buổi học hoặc quyền/consent của học sinh thay đổi trong lúc adapter đang chờ mạng, gợi ý kế hoạch vẫn được insert vào bảng `AIRequest` mà không được tái kiểm tra nguyên tử.

---

## 3. Đánh Giá Chi Tiết Các Trục Nghiệp Vụ Của G4 AI

### A. Kiểm Soát Chấp Thuận (Consent) và Cách Ly Dữ Liệu Học Sinh (Peer Isolation)
- **Kiểm tra Consent**:
  - `POST /sessions/:id/ai/suggestions` ([`ai.ts#L67-L77`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-classroom-wiring-20261101/server/routes/ai.ts#L67-L77)): Kiểm tra `member.consent`. Nếu học sinh chưa cấp consent, lập tức chặn với mã lỗi `403 PERMISSION_DENIED`. Kiểm tra lại một lần nữa dưới transaction lock ([`ai.ts#L162`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-classroom-wiring-20261101/server/routes/ai.ts#L162)).
  - `POST /sessions/:id/ai/claims-draft` ([`ai.ts#L384`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-classroom-wiring-20261101/server/routes/ai.ts#L384)): Bắt buộc `member.consent === true`.
- **Giảm thiểu và Cách ly Dữ liệu Học sinh**:
  - Không truy vấn hay rò rỉ dữ liệu của học sinh cùng lớp (chỉ query `studentId: parsed.data.studentId`).
  - Hàm [`sanitizeContext`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/ai/sanitizer.ts#L8-L38) quét toàn bộ danh sách tên học sinh của giáo viên và thay thế bằng `[học sinh]`, đồng thời loại bỏ URLs, tokens (Bearer, JWT), email, số điện thoại, và cắt ngắn tối đa 1500 ký tự trước khi gửi ra provider.
  - Prompt hệ thống yêu cầu rõ ràng: *"Quy tắc nghiêm ngặt: Trả lời ngắn gọn bằng tiếng Việt, thiết thực, không nhắc tên riêng học sinh, không bịa đặt thông tin cá nhân."*

### B. Chống Bịa Đặt Dữ Liệu (Hallucinated References) & 0-Observation Guard
- **Bộ lọc 0-Observation Guard**:
  - Cả trong adapter ([`geminiAdapter.ts#L127`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/ai/geminiAdapter.ts#L127), [`fakeAdapter.ts#L93`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/ai/fakeAdapter.ts#L93)) và route handler ([`ai.ts#L402-L408`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-classroom-wiring-20261101/server/routes/ai.ts#L402-L408)): nếu không có minh chứng quan sát thực tế (`isObservation: true`, loại trừ gợi ý AI), hệ thống **tuyệt đối không bịa đặt nhận định năng lực**, trả về danh sách rỗng: `claims: []` và thông điệp rõ ràng.
- **Thẩm tra ID Minh chứng (Anti-Hallucination)**:
  - Khi Gemini trả về cấu trúc JSON, adapter chỉ chấp nhận các ID nằm trong danh sách minh chứng đầu vào (`validEvidenceIdSet`).
  - Dưới transaction lock của route ([`ai.ts#L470-L525`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-classroom-wiring-20261101/server/routes/ai.ts#L470-L525)), hệ thống truy vấn lại các minh chứng sống trong DB (`liveObsMap`). Nếu model trả về ID minh chứng bịa đặt hoặc không còn tồn tại, candidate claim đó bị loại bỏ hoàn toàn.
- **Trạng thái Nhận định Chỉ Là `pending`**:
  - Nhận định do AI dự thảo luôn được tạo với `status: "pending"` ([`ai.ts#L525`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-classroom-wiring-20261101/server/routes/ai.ts#L525), [`contracts/ai.ts#L63`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-classroom-wiring-20261101/contracts/ai.ts#L63)). AI **không có quyền tự động duyệt (approved)** bất kỳ nhận định nào; quyền duyệt thuộc về giáo viên.
  - Nếu buổi học đã được đóng duyệt (`status: "reviewed"`), việc tạo dự thảo AI mới sẽ mở lại trạng thái thành `"ended"` và phát event `review.reopened` ([`ai.ts#L487-L508`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-classroom-wiring-20261101/server/routes/ai.ts#L487-L508)).

### C. Đánh Dấu Minh Chứng AI Là Không Phải Quan Sát Năng Lực (Non-Observation)
- Khi gợi ý giảng dạy được giáo viên chấp nhận và lưu thành minh chứng (`saveAsEvidence === true`, [`ai.ts#L254-L277`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-classroom-wiring-20261101/server/routes/ai.ts#L254-L277)):
  - Minh chứng được tạo với `kind: "GoiYGiangDay"`, `sourceType: "ai_suggestion"`, `support: "ChuaRo"`.
  - Đặt cờ bắt buộc: `isObservation: false`.
  - Bộ lọc minh chứng quan sát (`isObservation: true`) loại trừ hoàn toàn các bản ghi này khỏi nguồn tạo nhận định năng lực tiếp theo.

### D. Timeout, Circuit Breaker và Xử Lý Lỗi
- **Timeout**: Cấu hình mặc định 10 giây qua `AbortSignal.timeout(10_000)` trong SDK Gemini ([`geminiAdapter.ts#L24`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/ai/geminiAdapter.ts#L24)).
- **Circuit Breaker** ([`server/ai/circuitBreaker.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/ai/circuitBreaker.ts)):
  - Ngưỡng 3 lỗi liên tiếp (`failureThreshold: 3`), thời gian làm nguội 20 giây (`cooldownMs: 20_000`).
  - Khi circuit hở, route ngắt sớm ngay lập tức với mã lỗi `503 AI_UNAVAILABLE`.
  - Endpoint probe: `GET /ai/circuit-status` ([`ai.ts#L765`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-classroom-wiring-20261101/server/routes/ai.ts#L765)) trả về trạng thái chi tiết của circuit.
- **Lọc Khóa Bí Mật Trong Lỗi**:
  - Hàm [`sanitizeErrorMessage`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/ai/sanitizer.ts#L43-L56) loại bỏ các chuỗi key `AIza...`, URLs nội bộ, và hash trước khi trả lỗi ra ngoài.

### E. Tương Thích Kế Hoạch Bài Dạy (Plan Suggestions)
- Route `POST /sessions/:id/ai/plan-suggestions` ([`ai.ts#L590`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-classroom-wiring-20261101/server/routes/ai.ts#L590)) sử dụng [`filterEligibleApprovedClaims`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/eligibleClaims.ts) để chỉ nạp các nhận định đã duyệt có minh chứng quan sát thực sự và có consent. Trả về đúng cấu trúc `{ suggestion: { id, text, status, sources } }` tương thích ngược.

---

## 4. Giới Hạn Kiểm Thử & Tính Chân Thực Của Bằng Chứng

- **Test Suite Thực Tế**:
  Tập tin [`tests/unit/product/ai.test.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/tests/unit/product/ai.test.ts) chạy với cấu hình `appMode = "test"`. Toàn bộ 460 dòng kiểm thử thực thi trên [`FakeAIAdapter`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/ai/fakeAdapter.ts) (`provider: "mock"`).
- **Chưa Kiểm Thử Gemini Thật**:
  Không có lệnh gọi mạng nào ra API Gemini của Google được thực hiện trong quá trình test. Không thể suy diễn rằng kết nối Gemini trên môi trường production hoạt động bình thường nếu chỉ căn cứ vào kết quả pass của test suite này.

---

## 5. Khuyến Nghị Sửa Lỗi Cụ Thể

1. **Khắc phục Fail-Closed trong [`server/ai/index.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/ai/index.ts)**:
   Nếu `appMode === "production"` hoặc `appMode === "staging"` (hoặc `process.env.NODE_ENV === "production" | "staging"`), nếu thiếu `GEMINI_API_KEY` hoặc `ENABLE_AI !== "true"`, hàm phải throw hoặc trả adapter lỗi fail-closed, tuyệt đối không trả về `FakeAIAdapter`.
2. **Khóa Transaction trong `plan-suggestions`**:
   Bọc thao tác ghi nhận `plan_suggestion` trong [`server/routes/ai.ts`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/ai.ts) với `lockSession` và `createOnce` để đảm bảo tính nguyên tử và nhất quán trạng thái buổi học.

