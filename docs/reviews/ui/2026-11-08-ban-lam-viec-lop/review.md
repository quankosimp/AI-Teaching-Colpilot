# UI Review: Bàn làm việc lớp — lưới bảng nháp học sinh

**Trạng thái:** Chờ xác minh UI  
**Người xác minh:** (chưa giao)  
**Ngày tạo:** 2026-11-08  
**Màn hình / URL:** LiveRoom — phía giáo viên — tab "Bài làm" trong cột phải  
**Viewport kiểm tra:** 1440×900 (desktop, light mode)

---

## Mục tiêu

Giáo viên thấy được tất cả học sinh đang làm gì mà không phải mở từng bảng nháp riêng lẻ — đúng với ClassIn parity lớn nhất còn thiếu. Panel hiển thị thumbnail bảng nháp + số bài nộp của từng học sinh đang trong lớp, và cho phép "Trình bày" (đẩy bảng lên stage cả lớp) hoặc "Chụp" (lưu evidence) trực tiếp từ ô thumbnail.

## Màn hình và luồng bị ảnh hưởng

- `LiveRoom` → cột phải — tab mới **"Bài làm"** (giữa "Học sinh" và "Trò chuyện")

## Điểm thay đổi chính

### 1. Tab "Bài làm" trong right panel (`LiveRoom.tsx`)

Tab mới thứ 4 (theo thứ tự: Học sinh · **Bài làm** · Trò chuyện · Bài nộp). Chỉ hiện khi người dùng click.

### 2. Lưới học sinh (`LiveRoom.tsx` — section `panelTab === "work"`)

Mỗi ô gồm:
- **Tên học sinh** (truncated nếu dài)
- **Thumbnail bảng nháp**: SVG inline với `viewBox="0 0 800 420"` render lại toàn bộ strokes từ `room.boards` — hiển thị đúng pen/line/rect/circle, giữ màu gốc. Nếu chưa vẽ: placeholder "Chưa vẽ".
- **Số bài nộp**
- **Nút "Trình bày"**: reuse `patchClassroom({ sharedBoardOwnerId, sharedView:"board" })` — disabled khi học sinh chưa bật chia sẻ bảng
- **Nút "Chụp"**: reuse `POST /sessions/:id/boards/:studentId/attempts` — disabled khi chưa có bảng

### 3. Realtime (`LiveRoom.tsx`)

Thumbnails tự cập nhật theo `room.boards` được làm tươi mỗi `classroom.event` socket (< 1s sau khi học sinh vẽ nét mới) và mỗi 5s poll.

### 4. Hàm `renderThumbStroke` (`LiveRoom.tsx` — module-level)

Hàm SVG helper ở module level (không nằm trong component) render từng stroke thành `<line>`, `<rect>`, `<ellipse>`, hoặc `<path>`, tái dùng logic tương tự `OnlineBoard.tsx`.

### 5. CSS mới (`room.css`)

```css
.lr-wm { grid; 2 cột }
.lr-wm__cell { card với border-radius }
.lr-wm__thumb-wrap { aspect-ratio 800/420; background trắng }
.lr-wm__thumb { SVG responsive }
.lr-wm__thumb--empty { placeholder text }
.lr-wm__meta, .lr-wm__acts { typography nhỏ }
```

## Ảnh trước/sau

| Trạng thái | File |
|------------|------|
| **Trước** | Cột phải chỉ có 3 tab: Học sinh · Trò chuyện · Bài nộp |
| **Sau — panel tabs** | 4 tab: Học sinh · Bài làm · Trò chuyện · Bài nộp (xem `after-panel-tabs.jpg`) |
| **Sau — Bài làm tab (trống)** | "Chưa có học sinh trong lớp." khi không có ai vào (xem `after-bai-lam-tab-empty.jpg`) |

> ⚠️ Ảnh lưới với thumbnail thực cần chụp khi có học sinh trong lớp và đã vẽ bảng nháp.

## Cách kiểm tra

1. Mở lớp đang dạy (Vào lại)
2. Mở tab "Bài làm" trong cột phải
3. Mời ≥1 học sinh vào (tab học sinh → link mời)
4. Học sinh vẽ bảng nháp (tab Bảng nháp)
5. Giáo viên thấy thumbnail cập nhật realtime trong tab "Bài làm"
6. Nút "Trình bày" enable khi học sinh bật chia sẻ bảng → click → stage cả lớp chuyển về bảng học sinh
7. Nút "Chụp" → tạo evidence xem được ở Tổng kết & duyệt

## Rủi ro còn lại

- Chưa chụp thumbnail thực với bảng có strokes
- Chưa kiểm tra viewport 768/375 (mobile) và dark mode
- Chưa có người xác minh UI
- Lưới 2 cột có thể quá chật trên màn hình nhỏ (<768px) — cần responsive check
