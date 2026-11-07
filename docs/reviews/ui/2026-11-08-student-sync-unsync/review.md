# UI Review: Học sinh tự xem có kiểm soát (sync/unsync)

**Trạng thái:** Chờ xác minh UI  
**Người xác minh:** (chưa giao)  
**Ngày tạo:** 2026-11-08  
**Màn hình / URL:** LiveRoom — phía học sinh + phía giáo viên — `/` (workspace đang dạy)  
**Viewport kiểm tra:** 1440×900 (desktop, light mode)

---

## Mục tiêu

Học sinh được tự lật trang tài liệu (hoặc xem bảng nháp riêng) mà không làm gián đoạn luồng lớp, nhưng **vẫn biết giáo viên đang ở trang nào** và có nút quay lại đồng bộ ("Theo thầy cô"). Giáo viên thấy học sinh nào đang xem riêng qua badge trên ghế video.

## Màn hình và luồng bị ảnh hưởng

- `LiveRoom` → chế độ Giảng dạy — phía **học sinh** (nhánh `grant`): MaterialViewer + banner unsync
- `LiveRoom` → chế độ Giảng dạy — phía **giáo viên**: ghế video học sinh + badge "Xem riêng"

## Điểm thay đổi chính

### 1. State `localPage` phía học sinh (`LiveRoom.tsx`)

Học sinh có state `localPage: number | null`:
- `null` = đang theo thầy cô (đồng bộ — mặc định)
- `number` = đang xem riêng trang đó

Khi học sinh lật trang trong MaterialViewer (`onPageChange`) → `localPage` được set → vào chế độ unsync.

### 2. Banner "Đang xem riêng" (`LiveRoom.tsx` + `room.css`)

Khi `localPage !== null`, hiển thị banner cố định trên stage học sinh:

```
⚠ Đang xem riêng · Thầy cô đang ở trang {s.materialPage + 1}
[Theo thầy cô →]
```

Nút "Theo thầy cô" gọi `snapBack()` → reset `localPage = null` → học sinh quay về trang giáo viên.

### 3. Badge "Xem riêng" trên ghế giáo viên (`LiveRoom.tsx` + `room.css`)

Khi `member.following === false`, ghế video của học sinh đó hiển thị badge:

```
👁 Xem riêng
```

Badge có background tối bán trong suốt để không che video.

### 4. Trạng thái `pagesHead` (`LiveRoom.tsx`)

Khi học sinh đang unsync, nhãn trạng thái phía dưới ghế video chuyển sang màu amber và hiện "Đang xem riêng" thay vì trạng thái mặc định.

### 5. Trường `following` trong database (`prisma/schema.prisma` + migration)

```prisma
following Boolean @default(true)
```

Học sinh PATCH `/sessions/:id/members/:mId` với `following: false` để báo giáo viên.  
Server cho phép học sinh tự đặt `following` (không cho phép tự đặt `canWrite`, `toolOverrides`).

### 6. Contract cập nhật (`contracts/api.ts`)

`MemberUpdate` thêm `following?: boolean`.

## CSS mới (`room.css`)

```css
.lr-seat__bd.is-unsync { background: rgb(17 16 30 / .55); color: #fff; }
.lr-follow.is-unsync { color: var(--lr-amber); font-weight: 600; }
.lr-follow.is-unsync .lr-follow__dot { background: var(--lr-amber-solid); ... }
.lr-unsync { ... }  /* banner amber trên stage học sinh */
.lr-unsync__label, .lr-unsync__hint, .lr-unsync__back { ... }
```

## Ảnh trước/sau

> ⚠️ Phase B thêm UI chỉ hiện khi học sinh thực sự vào phòng và lật trang riêng.  
> Trạng thái mặc định (không thay đổi nhìn thấy được) vẫn giữ nguyên — học sinh theo thầy cô.  
> Ảnh sau cần chụp từ 2 tab (giáo viên + học sinh) khi tính năng được kích hoạt.

| Trạng thái | Mô tả |
|------------|-------|
| **Học sinh — đang theo (mặc định)** | Stage bình thường, không banner, giáo viên thấy ghế bình thường |
| **Học sinh — đang xem riêng** | Banner amber "Đang xem riêng · Thầy cô đang ở trang X" + nút "Theo thầy cô →" |
| **Giáo viên — học sinh unsync** | Badge "👁 Xem riêng" trên ghế video học sinh đó |

## Cách kiểm tra

1. `npm run dev` ở `:3000`  
2. Mở 2 tab: tab 1 đăng nhập giáo viên vào lớp đang dạy; tab 2 vào bằng link mời (học sinh)
3. Giáo viên mở tài liệu có nhiều trang (gắn tài liệu trước hoặc qua Giảng dạy → nạp tài liệu)
4. Học sinh lật sang trang khác → banner "Đang xem riêng" hiện trên stage học sinh
5. Giáo viên thấy badge "Xem riêng" trên ghế video học sinh
6. Học sinh bấm "Theo thầy cô" → quay về trang đúng, banner biến mất, badge biến mất

## Rủi ro còn lại

- Chưa chụp ảnh trước/sau với 2 tab thực tế (học sinh)
- Chưa kiểm tra viewport 768/375 (mobile) và dark mode
- Chưa có người xác minh UI
- `following` chỉ persist ở client state khi tab học sinh còn mở — nếu học sinh reload thì về lại `following: true` (server default)
