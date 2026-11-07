# UI Review: Workspace-first — hạ cấp Chia sẻ màn hình

**Trạng thái:** Chờ xác minh UI  
**Người xác minh:** (chưa giao)  
**Ngày tạo:** 2026-11-08  
**Màn hình / URL:** LiveRoom — giáo viên — `/` (workspace đang dạy)  
**Viewport kiểm tra:** 1440×900 (desktop, light mode)

---

## Mục tiêu

Giải quyết vấn đề: thanh điều khiển giáo viên có nút **"Chia sẻ màn hình"** ngang hàng với "Tài liệu" và "Bảng", dẫn gia sư đến luồng Zoom thụ động thay vì dùng nội dung native mà học sinh thấy được ngay, chú thích được và lưu làm bằng chứng.

## Màn hình và luồng bị ảnh hưởng

- `LiveRoom` → chế độ Giảng dạy (giáo viên) — thanh điều khiển phía dưới sân khấu
- Empty-state stage khi chưa có nội dung

## Điểm thay đổi chính

### 1. Thanh điều khiển giáo viên (`LiveRoom.tsx:1518-1552`)

| Trước | Sau |
|-------|-----|
| Tài liệu · Bảng · **Chia sẻ màn hình** · Hoạt động lớp | Tài liệu · Bảng · **Hoạt động lớp** |

Nút "Chia sẻ màn hình" được **chuyển vào menu "Hoạt động lớp"** dưới một section riêng **"CHIA SẺ APP NGOÀI"**, tách biệt bằng separator với các hoạt động tương tác (Hỏi nhanh, Gọi ngẫu nhiên). Icon được tô màu amber để phân biệt là "luồng ngoài". Copy giải thích rõ khi nào dùng.

Nút "Hoạt động lớp" cũng sáng lên khi đang chia sẻ màn hình (`on: stage === "check" || video.sharingSelf`).

### 2. Empty-state copy (`LiveRoom.tsx:1416-1418`)

| | Giáo viên | Học sinh |
|--|-----------|----------|
| Trước | "Gắn tài liệu khi soạn buổi, hoặc bấm Bảng để viết, **hoặc Chia sẻ màn hình để mở đề trên máy bạn**." | "Khi thầy cô mở tài liệu hoặc **chia sẻ màn hình**, nội dung sẽ hiện ở đây." |
| Sau | "Gắn tài liệu khi soạn buổi để học sinh thấy và chú thích được — hoặc bấm Bảng để viết trực tiếp." | "Khi thầy cô mở tài liệu hoặc bảng viết, nội dung sẽ hiện ở đây." |

### 3. CSS mới (`room.css:409-410`)

```css
.lr-mi__ic.is-share { background: var(--lr-amber-bg); color: var(--lr-amber); }
.lr-menu__sep { height: 1px; background: var(--lr-line); margin: 4px 6px; }
```

## Ảnh trước/sau

| Trạng thái | Mô tả |
|------------|-------|
| **Trước** | Thanh ctrl: Tài liệu · Bảng · Chia sẻ màn hình · Hoạt động lớp (xem ảnh chụp màn hình gốc từ issue) |
| **Sau — stage trống** | Empty-state copy mới, ctrl bar không có nút screen-share độc lập (xem `after-teacher-empty-state.jpg`) |
| **Sau — menu mở** | Menu "Hoạt động lớp" gồm 2 nhóm: Hoạt động cho cả lớp + Chia sẻ app ngoài với separator (xem `after-activities-menu.jpg`) |

> ✅ Ảnh sau chụp 2026-11-08 từ dev server `:3000` (1440×900 desktop light mode).  
> ⚠️ Ảnh "trước" lấy từ màn hình gốc (commit trước phase A).

## Cách kiểm tra

1. `npm run dev` (hoặc server đang chạy ở `:3000`)
2. Vào lớp đang dạy (Vào lại)
3. Kiểm tra thanh ctrl: chỉ có Tài liệu · Bảng · Hoạt động lớp
4. Mở menu "Hoạt động lớp": thấy 2 mục tương tác phía trên, separator, rồi "Chia sẻ màn hình" phía dưới với icon amber
5. Empty-state: chưa gắn tài liệu → copy mới, không nhắc screen-share
6. Stage vẫn đẩy tài liệu/bảng cho học sinh như cũ (không đổi logic sync)

## Rủi ro còn lại

- Chưa kiểm tra viewport 768/375 (mobile) và dark mode
- Chưa có người xác minh UI
- Không đổi logic đồng bộ stage — chỉ đổi UX trình bày
