# Review UI: "Lớp là phòng" và vòng sau buổi

**Trạng thái: Chờ xác minh UI**
**Người xác minh:** chưa có. Ngày xác minh và kết quả: chưa có.

Commit: `d9cdb05` (và commit kèm tài liệu này) trên nhánh `chungnguyenvp/zoom-video-sdk`, merge vào `dev`.
Thiết kế chi tiết: [docs/superpowers/specs/2026-11-06-lop-la-phong-design.md](../../../superpowers/specs/2026-11-06-lop-la-phong-design.md).

## 1. Mục tiêu

Gia sư thấy app rời rạc: Tổng quan, Lớp, Buổi học, Học sinh, Kho học liệu đều có một phần của cùng một việc, không rõ bắt đầu dạy ở đâu, "Sắp tới" và "Mở buổi tiếp theo" khó hiểu, Kho học liệu không rõ để làm gì khi đã có chia sẻ màn hình.

Thay đổi này gom vòng dạy quanh **lớp**: vào app là danh sách lớp, bấm **Mở lớp** là vào phòng, kết thúc buổi là sang màn **Sau buổi** để xác nhận điều cần nhớ về từng em, buổi sau những điều đó hiện ngay ở trang lớp. Gia sư luôn duyệt mọi thứ AI soạn.

## 2. Màn hình và luồng bị ảnh hưởng

| Màn / luồng | Thay đổi |
|---|---|
| Thanh bên | Chỉ còn **Lớp**, **Tài liệu**, Tài khoản. Bỏ Tổng quan, Buổi học, Học sinh |
| Danh sách lớp (màn đầu) | Mỗi lớp là một thẻ: trạng thái (đang học / buổi tới / chưa có lịch), việc còn dở, nút **Mở lớp** hoặc **Vào lại**, **Link mời** |
| Trang một lớp | Lịch lặp không bắt buộc; 3 tab: **Các em** (điều cần nhớ của từng em), **Nhật ký buổi** (thay trang Buổi học), **Tài liệu** |
| Hồ sơ một em | Khung bên phải ngay trong trang lớp, thay trang Hồ sơ riêng; có điều cần nhớ, nút **Đã ổn**, link riêng, mục **Trợ lý AI** |
| Kết thúc buổi | Chuyển sang màn **Sau buổi** mới (thay hộp điểm danh và tab "Tổng kết & duyệt" cũ) |
| Phòng dạy | Thêm nút **Câu hỏi từ trang này** trên khung chiếu tài liệu; hộp Nộp bài tự đóng sau khi nộp từ máy tính |
| Tài liệu | Đổi tên từ "Kho học liệu", ghi rõ không bắt buộc, nút **Dùng cho lớp** thay "Thêm vào buổi" |
| Link của học sinh | Thêm một dòng về việc dùng trợ lý AI dưới nút **Vào lớp** |

## 3. Ảnh trước / sau

Cùng khổ 1440 × 900, giao diện sáng, dữ liệu demo của tài khoản "Demo Hoàng Nam" (riêng ảnh học sinh là 1280 × 800). Dữ liệu giữa ảnh trước và sau không giống hệt: ảnh trước chụp sáng 6/11, ảnh sau chụp tối 6/11 sau khi đã chạy thử nhiều buổi, và một số ảnh sau dùng lớp thử "Sinh học 8 · Thử luồng".

| # | Màn | Trước | Sau | URL / thao tác |
|---|---|---|---|---|
| 1 | Danh sách lớp | ![](01-truoc-danh-sach-lop.png) | ![](01-sau-danh-sach-lop.png) | `/`, đăng nhập demo |
| 2 | Trang một lớp | ![](02-truoc-trang-lop.png) | ![](02-sau-trang-lop.png) | Bấm tên lớp |
| 3 | Buổi học → Nhật ký buổi | ![](03-truoc-buoi-hoc.png) | ![](03-sau-nhat-ky-buoi.png) | Trước: mục Buổi học. Sau: tab Nhật ký buổi |
| 4 | Tổng kết → Sau buổi | ![](04-truoc-tong-ket.png) | ![](04-sau-sau-buoi.png) | Bấm Kết thúc buổi trong phòng |
| 5 | Hồ sơ em | ![](05-truoc-ho-so.png) | ![](05-sau-ho-so-dong-y-ai.png) | Sau: bấm tên em, bấm Ghi nhận đồng ý |
| 6 | Kho học liệu → Tài liệu | ![](06-truoc-kho-hoc-lieu.png) | ![](06-sau-tai-lieu.png) ![](06-sau-tab-tai-lieu-lop.png) | Thanh bên Tài liệu; tab Tài liệu của lớp |
| 7 | Phòng dạy, câu hỏi | ![](07-truoc-phong-day.png) | ![](07-sau-cau-hoi-tu-trang.png) | Mở lớp có tài liệu ghim, bấm Câu hỏi từ trang này |
| 8 | Phía học sinh | (không đổi bố cục) | ![](08-sau-link-hoc-sinh-1280.png) ![](08-sau-hoc-sinh-tra-loi-1280.png) | Mở link riêng của em; gia sư mở một câu hỏi |

## 4. Mô tả tính năng

### 4.1 Lớp là phòng
- **Vấn đề:** không có chỗ rõ ràng để vào dạy; buổi lẻ không thuộc lớp; "Mở buổi tiếp theo" khó hiểu.
- **Trước:** tạo buổi ở trang Buổi học, chọn học sinh, rồi mở phòng từ danh sách buổi.
- **Sau:** bấm **Mở lớp** trên thẻ lớp: đang có buổi thì vào lại, có buổi hẹn hôm nay thì bắt đầu buổi đó, không thì tạo buổi mới cho hôm nay. Lịch lặp hằng tuần là tuỳ chọn. Buổi cũ không thuộc lớp nào được tự gom vào lớp theo cặp gia sư và học sinh (migration `202611060006`).

### 4.2 Sau buổi
- **Vấn đề:** tab Tổng kết cũ bắt gia sư tự gõ quan sát, chọn minh chứng, rồi mới nhờ AI; ít ai làm.
- **Sau:** kết thúc buổi là sang màn Sau buổi:
  1. Điểm danh điền sẵn theo giờ vào lớp, sửa được.
  2. Với mỗi em có mặt, đã đồng ý dùng AI và có nguồn trong buổi (bài đã nhận xét, câu trả lời đã chấm, bảng nháp, ghi chú), AI soạn 1–2 dòng ngắn, gắn nhãn **Ôn lại** hoặc **Làm tốt**, ghi kèm nguồn. Gia sư bấm **Giữ / Sửa / Bỏ** hoặc **Tự thêm**.
  3. Bài chưa nhận xét có nút **Nhận xét**; chấm xong quay lại đúng màn này và AI soạn từ bài vừa chấm.
  4. **Lưu và đóng buổi** chỉ bật khi không còn dòng nháp chờ.
- Dòng đã giữ hiện ở tab Các em (2 dòng gần nhất) và hồ sơ em; bấm **Đã ổn** khi em đã tiến bộ.

### 4.3 Tài liệu của lớp
- **Vấn đề:** không rõ kho để làm gì khi đã chia sẻ màn hình.
- **Sau:** ghi rõ không bắt buộc. Ghim tài liệu cho lớp thì bấm Mở lớp là tài liệu đã nằm trên màn chiếu, mở tiếp đúng trang buổi trước dừng. Tab Tài liệu của lớp có "Mở sẵn ở buổi tới", "Đã dùng trước đây", **Chuẩn bị buổi tới**.

### 4.4 Đồng ý dùng AI theo từng em
- **Trước:** chỉ có đồng ý theo từng buổi khi em vào phòng.
- **Sau:** gia sư ghi nhận đồng ý thay em hoặc phụ huynh (có bước xác nhận), hoặc thu hồi. Thu hồi thì AI không đọc dữ liệu của em ở mọi chỗ. Chưa quyết định thì vẫn tính theo việc em bấm Vào lớp, và trang link của em nói rõ điều này.

### 4.5 Câu hỏi từ trang đang chiếu
- **Sau:** trong phòng, khi đang chiếu một PDF, gia sư bấm **Câu hỏi từ trang này**. Trình duyệt đọc chữ của trang, AI soạn nháp 3 câu hỏi ngắn không kèm đáp án. Gia sư sửa rồi bấm **Mở cho lớp** (thành câu hỏi nhanh) hoặc **Chép**. Không gửi dữ liệu học sinh. Trang ảnh hoặc PDF scan thì báo không đọc được chữ.

### 4.6 Model AI
OpenAI mặc định là `gpt-6-luna`. Adapter gửi `reasoning_effort` cho GPT-5 trở lên (các model này không nhận `temperature`), và lọc ID minh chứng mà model nhỏ hay chép vào câu.

## 5. Đã kiểm tra thế nào

- `pnpm lint` (tsc) sạch; `pnpm exec tsc -p tsconfig.server.json --noEmit` sạch.
- `pnpm test`: 43 pass, 0 fail (có test luật lịch, luật Mở lớp, luật đồng ý AI).
- Test tích hợp trên database thử (`RUN_CLASSES_INTEGRATION=1`): `class-rooms`, `after-class`, `class-materials` đều pass.
- Chạy app thật bằng Docker với OpenAI thật, hai trình duyệt tách biệt (gia sư và học sinh vào bằng link riêng), 4 buổi liền: tạo lớp, ghim tài liệu, mở lớp, học sinh vào lớp, câu hỏi AI, học sinh trả lời và nộp bài, gia sư chấm, kết thúc, AI soạn nháp từ đúng việc em làm, giữ, đóng buổi, xem trang lớp và hồ sơ.
- Kiểm tra chữ không bị cắt và không tràn ngang ở 1440 và 1280 cho các màn mới.

## 6. Giới hạn và rủi ro còn lại

- **Chưa thử video và âm thanh thật** qua Zoom với hai thiết bị có camera (trình duyệt chạy thử không có camera).
- **Chưa xem khổ điện thoại (375) và giao diện tối** của các màn mới; chưa thử lại quét QR nộp bài bằng điện thoại sau đợt dọn dẹp.
- **Chính sách đồng ý AI** (gia sư ghi nhận thay phụ huynh) cần nhóm xác nhận, nhất là với học sinh nhỏ tuổi.
- Bài nộp và câu trả lời **chưa chấm** thì chưa tính là nguồn, nên em đó sau buổi hiện "Chưa có nguồn".
- Câu hỏi từ trang chỉ đọc chữ, không đọc hình; nháp câu hỏi mất khi tải lại phòng.
- Migration `202611060006` gom buổi lẻ vào lớp khi API khởi động; nên sao lưu database trước khi chạy trên dữ liệu thật.
- Commit gồm cả phần soạn bài (Lô 1) do một công cụ khác viết, vì trang lớp liên kết tới nó và migration nối tiếp nhau.
