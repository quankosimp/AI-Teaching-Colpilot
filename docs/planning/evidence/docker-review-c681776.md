Showing 1 of 10 activities (limited to 1)

---

**REVIEW-04 — candidate `c681776`: packaging cần sửa; runtime local có bằng chứng hoạt động; public HTTPS và provider thật vẫn bị chặn.** Tôi đã kiểm tra source tại đúng commit, đọc bằng chứng và log đã lưu, cùng kiểm tra liveness gateway hiện trả HTTP 200. Không sửa code hoặc tạo tài nguyên.

Các phát hiện còn lại:

1. **HIGH — Có cửa sổ phục vụ bucket công khai trước khi chính sách private được áp dụng.** Trong [compose.docker.yml](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/compose.docker.yml:72), API chỉ chờ MinIO healthy, không chờ `minio-init` hoàn tất. [init-minio.sh](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/deploy/scripts/init-minio.sh:31) đặt lại anonymous policy bất đồng bộ. Với volume đã có bucket mang policy public, API và gateway có thể phục vụ trước khi lệnh này chạy xong; nếu init thất bại, API vẫn có thể tiếp tục. Yêu cầu: cho API phụ thuộc `minio-init` với `service_completed_successfully`, và xác minh startup thất bại khi không áp dụng được policy. Liên quan yêu cầu SRS về bảo mật và riêng tư tài liệu; chưa xác định được mã điều khoản SRS cụ thể từ bằng chứng đã đọc.

2. **MEDIUM — Doctor có thể báo container unhealthy là healthy.** [docker-doctor.mjs](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/scripts/docker-doctor.mjs:331) dùng `includes('healthy')`, nên chuỗi `unhealthy` cũng thỏa điều kiện. Các probe chức năng khác có thể bắt một số hậu quả, nhưng không sửa được kết luận sai về trạng thái container. Yêu cầu so sánh chính xác `healthy`, đồng thời kiểm tra các service bắt buộc hiện diện. Đây là lỗi độ tin cậy của bằng chứng vận hành, không đủ căn cứ quy kết một điều khoản SRS cụ thể.

3. **MEDIUM — Probe CORS origin ngoài có thể PASS khi không kết nối được MinIO.** Tại [docker-doctor.mjs](/home/quanan/.paseo/worktrees/2qimpyn4/teaching-ops-local-20261031/scripts/docker-doctor.mjs:381), response lỗi mạng có status `0` và không có header vẫn thỏa nhánh PASS. Probe origin hợp lệ riêng sẽ làm toàn bộ doctor thất bại nếu cùng đích không kết nối được, nhưng dòng PASS riêng vẫn là bằng chứng sai và có thể che lỗi riêng lẻ. Yêu cầu kiểm tra response hợp lệ và status mong đợi trước khi kết luận origin bị từ chối.

Bằng chứng runtime hiện có: log doctor dương báo exit 0 và kiểm tra upload/download, phân quyền giữa hai teacher, anonymous GET trên object thực; log âm với gateway không truy cập được báo exit 1. TAP lưu **41 pass, 0 fail, 6 skip**. Các kết quả này hỗ trợ luồng local đã kiểm tra, không chứng minh mọi nhánh lỗi hoặc nghiệm thu toàn bộ SRS. Bằng chứng gateway độc lập được lưu cho candidate `b766`; không tự coi đó là thử nghiệm độc lập mới trên toàn bộ candidate `c681`.

**Public HTTPS và Google/Zoom/Gemini thật: BLOCKED như dự kiến** vì chưa có môi trường và credential thật. Quyết định đóng gate thuộc supervisor.
