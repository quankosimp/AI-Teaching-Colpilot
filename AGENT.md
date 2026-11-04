# Quy tắc làm việc cho AI Teaching Copilot

## Nhánh phát triển

- Dùng `dev` làm nhánh nhận thay đổi đầu tiên. Mọi thay đổi code phải được commit và push lên `dev` trước khi đưa sang `main` hoặc nhánh phát hành. Không push code trực tiếp lên `main`.
- Nếu làm việc trên nhánh tạm, tích hợp thay đổi vào `dev` và push `dev` trước khi tạo pull request hoặc merge sang `main`.
- Trước khi push, kiểm tra diff và trạng thái Git; chỉ commit các file thuộc nhiệm vụ hiện tại. Giữ nguyên thay đổi chưa commit của người khác.

## Xác minh thay đổi UI

- Với **mọi** thay đổi giao diện, chụp ảnh màn hình **trước khi sửa** và **sau khi sửa**. Dùng cùng kích thước màn hình, chế độ sáng/tối và trạng thái dữ liệu để người review so sánh được.
- Lưu ảnh và ghi rõ màn hình, URL hoặc luồng thao tác, kích thước viewport tại `docs/reviews/ui/<ngay>-<ten-thay-doi>/`. Đính kèm đường dẫn ảnh trong mô tả review hoặc pull request.
- Cần **người xác minh** giao diện. Ghi người xác minh, ngày và kết quả trong mô tả review. Trước khi có xác nhận, ghi trạng thái `Chờ xác minh UI`; không mô tả thay đổi là đã được nghiệm thu hoặc merge sang `main`.
- Với thay đổi UI lớn (nhiều màn hình, điều hướng, bố cục chính hoặc luồng người dùng), thêm `review.md` trong cùng thư mục: mục tiêu, các màn hình và luồng bị ảnh hưởng, điểm thay đổi chính, ảnh trước/sau, cách kiểm tra và rủi ro còn lại.
- Nếu không thể chụp ảnh hoặc chưa có người xác minh, nêu rõ phần còn thiếu và giữ trạng thái chờ xác minh.

## Mô tả tính năng

- Mỗi tính năng mới hoặc lần cập nhật tính năng phải có mô tả bằng văn bản rõ ràng trong pull request; nếu chưa có pull request, ghi trong tài liệu thay đổi đi kèm commit.
- Mô tả cần nêu: nhu cầu hoặc vấn đề được giải quyết, hành vi trước và sau, cách người dùng sử dụng, phạm vi ảnh hưởng, cách đã kiểm tra và giới hạn còn lại.
- Không dùng câu chung chung như "cải thiện UI" hoặc "cập nhật tính năng" nếu thiếu hành vi cụ thể để người khác review.
