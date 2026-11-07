# UI Review: Mời lên bảng (podium) + Bài của em hiển thị phản hồi

**Trạng thái:** Chờ xác minh UI  
**Người xác minh:** (chưa giao)  
**Ngày tạo:** 2026-11-08  
**Màn hình / URL:** LiveRoom — phía giáo viên (panel học sinh) + phía học sinh (stage + "Bài của em")  
**Viewport kiểm tra:** 1440×900 (desktop, light mode)

---

## Mục tiêu

**"Mời lên bảng":** Giáo viên mời 1 học sinh viết trực tiếp trên bảng chung đang trình bày cho cả lớp — tương tự tính năng "mời lên bảng" của ClassIn — thay vì chỉ teacher ghi tay.

**"Bài của em":** Học sinh thấy được mức hỗ trợ (`support`) sau khi thầy cô chấm bài, không chỉ nhận xét (`finalFeedback`).

## Màn hình và luồng bị ảnh hưởng

- `LiveRoom` → panel phải giáo viên → chi tiết học sinh → `lr-who__act`
- `LiveRoom` → stage học sinh → `studentStageBoard` (khi đang trình bày bảng chung)
- `LiveRoom` → panel phải học sinh → "BÀI CỦA EM"

## Điểm thay đổi chính

### 1. Nút "Mời lên bảng" / "Thu quyền bảng" (`LiveRoom.tsx`)

Thêm nút thứ 4 vào `lr-who__act` trong panel chi tiết học sinh:

| Trạng thái `selMember.canWrite` | Nút hiển thị | Hành động |
|---------------------------------|-------------|-----------|
| `false` (mặc định) | **Mời lên bảng** (ghost style) | PATCH `canWrite: true` + `patchClassroom({ sharedView:"board", sharedBoardOwnerId:"common" })` |
| `true` | **Thu quyền bảng** (warn/đỏ style) | PATCH `canWrite: false` |

Tái dùng endpoint hiện có: `PATCH /sessions/:id/members/:mId { canWrite: true/false }` (đã được xử lý ở `server/routes/classroom.ts`).

### 2. Học sinh viết được trên bảng chung khi được mời (`LiveRoom.tsx`)

`studentStageBoard` — `OnlineBoard` trên stage học sinh:

| Trước | Sau |
|-------|-----|
| `canWrite={false}` cứng | `canWrite={s.status === "live" && room?.capabilities?.boardWrite === true && (!s.sharedBoardOwnerId \|\| s.sharedBoardOwnerId === "common")}` |
| `onCommand={async () => {}}` (noop) | `onCommand={async (cmd) => { void command(\`/sessions/…/boards/common\`, "PUT", cmd, true); }}` |

Điều kiện: trạng thái buổi "live" + server đã cấp `boardWrite` cho học sinh (`RoomMember.canWrite`) + stage đang trình bày bảng chung (không phải bảng riêng bạn khác).

### 3. "Bài của em" — hiển thị mức hỗ trợ (`LiveRoom.tsx`)

Sau khi giáo viên chấm, học sinh thấy thêm chip "Mức hỗ trợ: …" (nếu `x.support` có giá trị):

```
Nhận xét: Em làm tốt phần 1, cần xem lại phần 2.
Mức hỗ trợ: Đạt khá
```

Dùng `statusLabel(x.support)` để hiển thị tên tiếng Việt (ChuaRo → "Chưa rõ", DatTot → "Đạt tốt", v.v.).

### 4. CSS mới (`room.css`)

```css
.lr-chip--support { background: var(--lr-soft) !important; color: var(--lr-sub); font-size: 11px; }
```

## Ảnh trước/sau

> ⚠️ Cần chụp khi có 2 tab: giáo viên + học sinh, buổi đang "live".

| Trạng thái | Mô tả |
|------------|-------|
| **Trước — panel học sinh** | 3 nút: Xem bảng nháp · Trình bày bảng em · Chụp bảng |
| **Sau — panel học sinh** | 4 nút: Xem bảng nháp · Trình bày bảng em · Chụp bảng · **Mời lên bảng** (xem `after-teacher-panel.jpg`) |
| **Sau — đã mời lên** | Nút đổi thành **Thu quyền bảng** màu đỏ (xem `after-teacher-panel-on.jpg`) |
| **Học sinh — đang trên bảng** | Stage chuyển về bảng chung, học sinh gõ/vẽ được (xem `after-student-stage-podium.jpg`) |
| **Bài của em — đã chấm với support** | Nhận xét + chip "Mức hỗ trợ: …" (xem `after-student-bai-cua-em.jpg`) |

## Cách kiểm tra

1. `npm run dev` ở `:3000`, Node 22
2. Tab 1: đăng nhập giáo viên, mở lớp đang dạy (Vào lại)
3. Tab 2: vào bằng link mời (học sinh)
4. Giáo viên: bấm vào ghế học sinh → panel chi tiết → thấy nút **Mời lên bảng**
5. Bấm **Mời lên bảng** → stage cả lớp chuyển về bảng chung
6. Tab học sinh: thấy bảng chung, **có thể vẽ/gõ**; giáo viên thấy strokes realtime
7. Giáo viên: bấm **Thu quyền bảng** → học sinh hết viết được (canvas read-only)
8. Chấm 1 bài nộp với `support` khác null → học sinh thấy chip "Mức hỗ trợ: …" trong "Bài của em"

## Giới hạn còn lại

- Nhiều học sinh có `canWrite: true` đồng thời là edge case — hiện hành vi không chặn (server không giới hạn 1 người), nhưng UX chưa thể hiện ai đang "trên bảng"
- Chưa có indicator trực quan "em X đang lên bảng" trên stage giáo viên (chỉ có nút Thu quyền trong panel chi tiết)
- Chưa kiểm tra viewport 768/375 (mobile) và dark mode
- Chưa có người xác minh UI
