Showing 1 of 54 activities (limited to 1)

---

**Re-audit verdict: NEEDS_FIXES** cho Product commit `80efe9aa49aa81bcf2fda5900f391764ec1f6ed4`. Tôi đã gửi hai blocker còn lại và trace tĩnh cho supervisor.

| Finding trước | Kết quả tại `80efe9` |
|---|---|
| RG2-01 — claim riêng trong activity công khai | **Đã xử lý ở mức code:** tiêu đề activity mới trung tính; projection cũng che tiêu đề theo mẫu cũ có claim reference. |
| RG2-02 — sửa quick-check evidence | **Chưa đóng:** xử lý revision, invalidation, reopen và no-op cho một evidence, nhưng bỏ sót các evidence khác cùng nguồn. |
| RG2-03 — race chấm bài với complete-review | **Đã xử lý trace cũ ở mức code:** quyết định reopen dùng trạng thái session sau lock; test có điều phối thứ tự complete rồi grade và kiểm tra `endedAt`. |
| RG2-04 — annotation sai học sinh | **Chưa đóng cho dữ liệu lịch sử:** code mới ràng buộc owner, nhưng migration có thể suy diễn sai owner từ evidence cũ. |
| RG2-05 — concurrent tool overrides | **Đã xử lý ở mức code:** merge dùng member được đọc sau session lock. |
| RG2-06 — thứ tự outbox/replay | **Trace lỗi trước được xử lý ở mức code:** có barrier theo phiên và hàng đợi/cursor theo socket. Chưa xác nhận độc lập runtime hoặc hành vi nhiều process. |

Hai blocker cụ thể:

1. **HIGH — Claim vẫn có thể được duyệt sau khi nguồn bị sửa** (EVD/REV). API tạo evidence cho phép nhiều evidence cùng tham chiếu một `check_response` hoặc submission. Nhánh chấm lại tại [classroom.ts](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/classroom.ts:2836) dùng `findFirst` và chỉ invalidation claim phụ thuộc evidence đó; nhánh grade submission cũng dùng cách tương tự. Trace: tạo E1 và E2 cùng nguồn, duyệt claim dựa trên E2, hoàn tất review, rồi chấm lại khi E1 được chọn; claim dựa trên E2 vẫn approved và phiên có thể vẫn reviewed. Cần xử lý **mọi evidence cùng nguồn** dưới cùng lock và kiểm thử cả hai loại nguồn.

2. **HIGH — Backfill annotation có thể hợp thức hóa liên kết lịch sử sai** (EVD/REV). [migration.sql](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/prisma/migrations/202611010001_annotation_owner/migration.sql:2) gán owner khi evidence cũ chỉ có một student duy nhất. API cũ cho phép annotation chung không có owner được gắn evidence cho B; trong trường hợp đó migration sẽ biến annotation chung thành của B. Cần giữ owner chưa xác định khi không có provenance đáng tin cậy, hoặc đối soát thủ công trước khi coi nguồn đủ điều kiện.

Tôi đã đọc test đã commit: chúng bao gồm kiểm tra annotation sai học sinh và race grade/review, nhưng các đoạn liên quan không bao phủ trường hợp nhiều evidence cùng nguồn hay backfill annotation chung lịch sử. Đây là **review source và test**, không phải chạy lại độc lập 20 test, browser hoặc fault injection. Không có file hay database nào được sửa; không suy rộng kết quả thành nghiệm thu toàn bộ P0.
