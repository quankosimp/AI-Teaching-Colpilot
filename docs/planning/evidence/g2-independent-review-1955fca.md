Showing 1 of 42 activities (limited to 1)

---

**G2 verdict: NEEDS_FIXES** cho snapshot `1955fcab3647e319d2309cd4524b34a610a064e3`. Tôi đã gửi các blocker và trace tĩnh cho supervisor; chưa đóng gate.

- **HIGH — Lộ đánh giá cá nhân qua activity của buổi tiếp theo** (REV/ROOM). [review.ts](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/review.ts:1551) đưa nội dung claim vào tiêu đề activity; [classroom.ts](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/classroom.ts:1933) trả tiêu đề đó cho mọi học sinh đã được duyệt. Tạo buổi tiếp theo từ claim của A rồi cho B vào sẽ để B thấy nội dung đánh giá của A. Cần dùng tiêu đề công khai trung tính và giữ claim trong phần riêng của giáo viên.

- **HIGH — Chấm lại quick check không làm mất hiệu lực claim** (EVD-003/REV). [classroom.ts](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/classroom.ts:2819) cập nhật evidence nhưng không lưu revision, chuyển claim đã duyệt về pending hay mở lại phiên reviewed. Trace: chấm, duyệt claim, hoàn tất review, rồi đổi nhận xét hoặc mức hỗ trợ; claim và phiên vẫn giữ trạng thái đã duyệt. Cần thực hiện các thay đổi này cùng transaction và session lock.

- **HIGH — Race chấm bài với hoàn tất review** (REV). [classroom.ts](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/classroom.ts:3406) quyết định mở lại phiên bằng trạng thái đọc trước lock. Nếu complete-review commit giữa lần đọc đó và lúc chấm lấy lock, chấm có thể chuyển claim về pending nhưng để phiên ở reviewed. Cần dùng trạng thái phiên vừa khóa và phát sự kiện mở lại.

- **HIGH — Annotation có thể gán làm evidence cho sai học sinh** (EVD-003/REV). [review.ts](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/review.ts:86) kiểm tra annotation thuộc phiên nhưng không kiểm tra học sinh; annotation được tạo tại [teacher.ts](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/teacher.ts:779) cũng không lưu liên kết học sinh. Giáo viên có thể tham chiếu annotation của A khi tạo observation và duyệt claim cho B. Cần ràng buộc nguồn với học sinh và kiểm tra lại khi approval.

- **MEDIUM — Các patch quyền công cụ đồng thời có thể ghi đè nhau** (ROOM-004). [classroom.ts](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/classroom.ts:1012) merge overrides trước khi lấy lock; hai patch khác trường có thể làm mất thay đổi trước, kể cả bật lại công cụ vừa tắt. Cần merge trạng thái mới đọc dưới lock hoặc dùng CAS.

- **MEDIUM — Thứ tự outbox không được bảo đảm khi phát lỗi** (LIVE). [realtime.ts](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/realtime.ts:447) tiếp tục phát sequence sau khi sequence trước lỗi; client [LiveRoom.tsx](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/src/product/LiveRoom.tsx:309) nâng cursor theo max, khiến replay sau đó bỏ qua sequence thấp hơn. Cần chặn phát tiếp theo từng phiên khi event trước lỗi và kiểm thử đồng bộ replay/live.

Các sửa SG2-01, SG2-02 và SG2-04 có cơ chế xử lý trong source: board lock được giới hạn theo công cụ, board ghi dưới session lock, và socket có timer hết hạn JWT. SG2-03 và SG2-05 vẫn còn blocker nêu trên.

Đây là **review tĩnh**, không phải tái hiện HTTP hoặc kiểm thử đồng thời độc lập; tôi không sửa file, reset database hay dừng server. Các mã SRS được ghi theo phạm vi trong báo cáo supervisor; các finding chưa chứng minh nghiệm thu toàn bộ sản phẩm.
