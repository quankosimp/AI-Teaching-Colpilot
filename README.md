# AI Teaching Copilot — UI phòng học tích hợp

Prototype React/Vite cho gia sư dạy 1–1 và nhóm tối đa 5 học sinh. Giáo viên và học sinh dùng hai giao diện riêng trong cùng một buổi học. Giữ phong cách sáng và màu tím hiện tại; chưa có dark mode.

## Chạy tại máy

Chạy `npm install` và `npm run dev`, mở địa chỉ Vite hiển thị (mặc định http://localhost:3000/). Chọn **Tiếp tục với Google** và tài khoản demo Hoàng Nam. Giao diện đăng nhập/đăng ký này là mô phỏng.

## Dùng thử hai vai trò

1. Mở **Soạn buổi học**, chọn hoặc tạo buổi. Chọn học sinh/nhóm, mục tiêu, hoạt động, học liệu và công cụ được phép dùng.
2. Trong **Học sinh & quyền tham gia**, mở liên kết của từng em ở tab khác trong cùng trình duyệt. Link riêng theo người học, có hạn dùng, tạo lại và thu hồi được.
3. Giáo viên chọn **Bắt đầu dạy → Mở phòng dạy**. Học sinh xác nhận tên, xem thông báo ghi hình và **Xin vào phòng học**. Giáo viên **Cho vào** ở danh sách thành viên.
4. Dùng **Đề bài**, **Bảng chung**, **Kiểm tra**. Đổi hoạt động/trang đề đồng bộ sang học sinh chọn **Theo giáo viên**. Gia sư chủ động đánh dấu hoạt động hoàn tất.
5. Học sinh có **Nháp của tôi**, **Bài làm**, **Chat**, **Giơ tay**. Chia sẻ nháp là thao tác riêng. Các em không xem bài nộp, câu trả lời và nháp chưa chia sẻ của nhau; gia sư có quyền xem nháp riêng để hỗ trợ.
6. Ghi chú, Copilot, mức hỗ trợ và nhận định ở panel riêng của giáo viên. **Chấm bài** nhận bài gốc và cho sửa nhãn; nhận định liên quan phải duyệt lại sau khi đổi nhãn.
7. **Ghi hình** lưu sự kiện công khai cho bản phát lại mô phỏng. Dừng ghi chuyển sang xử lý; kết thúc buổi tự dừng bản ghi. **Bản ghi buổi học** có trình phát, mốc hoạt động, nguồn gốc và trạng thái lỗi/thử lại.
8. **Tổng kết & duyệt** tách nhận định theo học sinh. Chỉ phần đã duyệt vào hồ sơ và được dùng để soạn buổi tiếp với liên kết nguồn.

## Dữ liệu và giới hạn

- Dữ liệu giả gồm lớp 1–1, buổi nhóm, học liệu Toán lớp 8–9, nháp nhiều lần thử, bài làm SVG mẫu, minh chứng, kiểm tra và bản ghi.
- localStorage v2 chuyển dữ liệu v1 sang danh sách thành viên, giữ hồ sơ, buổi, bài nộp, minh chứng và nhận định cũ; không xóa khóa v1.
- BroadcastChannel thông báo cập nhật; Web Locks tuần tự hóa đọc/sửa/lưu giữa các tab. Cập nhật đọc dữ liệu mới nhất trước khi lưu.
- Đồng bộ áp dụng **cùng trình duyệt và cùng origin**. localhost:3000 và 127.0.0.1:3000 là hai nguồn dữ liệu khác nhau. Chưa đồng bộ hai thiết bị.
- Vai trò, link và quyền công cụ mô phỏng trên frontend; chưa có phân quyền máy chủ. Ảnh JPG/PNG hoặc PDF tối đa 1 MB do dung lượng trình duyệt.
- Mic, camera, cuộc gọi, Google OAuth, AI và ghi hình là mô phỏng. Bản phát lại dựng sự kiện vùng chung; chưa ghi track âm thanh/video hay tạo MP4.
- **Tài khoản → Khôi phục mẫu** thay dữ liệu demo hiện tại sau khi xác nhận, dùng để mở lại trọn bộ kịch bản.
- Mở **Tình huống demo** để thử mất kết nối, AI lỗi, tải bài lỗi và xử lý bản ghi lỗi. Bộ mẫu có link ?invite=demo-expired và ?invite=demo-revoked.

## Cấu trúc

- src/product/store.tsx: dữ liệu, migration và bộ điều phối cộng tác trong trình duyệt; cung cấp thao tác có kết quả lưu.
- src/product/adapters.ts: hợp đồng đăng nhập, cuộc gọi, ghi hình và adapter mock. LiveKit, Google OAuth và lưu trữ máy chủ sẽ kết nối tại lớp này và backend phân quyền.
- src/product/Classroom.tsx: lobby, phòng giáo viên, guest portal và phòng học sinh. Các công cụ bảng nháp, đề/chú thích, kiểm tra, bài nộp, nguồn minh chứng, tổng kết và bản ghi nằm trong module riêng.
- src/product/refinement.css: token thương hiệu và typography. classroom.css bổ sung login, phòng học và responsive.

## Kiểm tra

Chạy `npm run lint` và `npm run build`. Nếu npm không có trong PATH:

- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/vite/bin/vite.js build`

Bằng chứng trong verification/: ảnh desktop/mobile, báo cáo probe và kết quả kiểm tra nhiều tab. Các phiên kiểm tra dùng trình duyệt độc lập, không thay dữ liệu tab người dùng.
