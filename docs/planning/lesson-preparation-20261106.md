**Lô 1: Chuẩn bị nội dung và sử dụng trong phòng dạy — 06/11/2026**

Đã triển khai luồng thủ công có nguồn: Kho học liệu → Dùng trong buổi → chọn buổi chưa dạy hoặc tạo buổi mới → chuẩn bị nội dung → xem trước trong phòng → bắt đầu với trang đã chọn. Từ màn soạn có thể dán đề, chọn tệp sẵn có hoặc tải tệp mới. Tải tệp ngay khi soạn giữ phần đề/ghi chú đang gõ khi quay lại.

Form thêm/sửa dùng chung `LessonContentEditor`. Nội dung học sinh xem lưu ở description, đáp án/ghi chú riêng ở teacherNotes. API học sinh tiếp tục dùng projection riêng, không trả teacherNotes hoặc mục tiêu riêng. Không chuyển ghi chú riêng sang nội dung công khai.

Activity.duration có thể null; dữ liệu thời lượng cũ giữ nguyên. Activity.materialStartPage lưu số trang bắt đầu theo chỉ số 0 và phiên bản tài liệu đã gắn. Bắt đầu buổi và chuyển hoạt động sử dụng bookmark này; chọn trang trực tiếp trong phòng vẫn được phép. Thay/gỡ tài liệu ở bộ chọn hoạt động đưa bookmark về 0.

Đây là bookmark trang đầu, chưa phải phạm vi trang bị giới hạn. Viewer chọn trên số trang thực tế; API kiểm tra số nguyên 0–9999 và nguồn thuộc quyền gia sư, chưa phân tích PDF phía server để kiểm tra giới hạn trang thực tế. Nội dung tệp chưa được gửi cho AI.

Migration `202611060003_lesson_content`: thêm cột bookmark và cho phép duration null, không reset hoặc xóa dữ liệu. Contracts và người dùng dữ liệu đã cập nhật cho null duration. Bổ sung StudentRecord.linkVersion để hợp đồng teacher response nhận trường link có sẵn từ bản trước; hồi quy phát hiện thiếu trường này.

Giữ các sửa UX đã có trước lô này: điều hướng lớp/hồ sơ, nhãn thiếu nhận xét, hỗ trợ mặc định Chưa rõ, nháp tổng kết riêng từng em, giải thích điều kiện nút AI. Nháp tổng kết vẫn chỉ giữ khi màn đang mounted, chưa có lưu nháp bền sau đóng/tải lại trang.

**Kiểm tra đã chạy**

- TypeScript giao diện và server đạt; diff check đạt.
- Build giao diện/server và Docker API/gateway trên Node 22 đạt. Build còn cảnh báo bundle lớn như trước; chưa nghiệm thu hiệu năng.
- Hồi quy trên DB/bucket thử riêng: 87 kiểm tra, 36 đạt, 0 lỗi, 51 bỏ qua theo cấu hình. Các kiểm tra HTTP cần QA_BASE_URL chưa được chạy trong lượt này.
- Integration mới chạy riêng: 1 đạt. Kiểm tra lưu lại nội dung/null duration/bookmark, sai quyền teacher, bookmark âm, xung đột version, trang lúc start/chuyển hoạt động và student projection không lộ ghi chú/mục tiêu riêng.
- Browser Chrome headless với API/PostgreSQL/MinIO thật trên DB/bucket thử riêng: upload PDF hai trang → dùng trong buổi → chọn trang 2 → lưu → tải lại → sửa/xem lại → vào phòng thấy trang 2. Kiểm tra thêm dán nội dung và tải tệp từ editor, giữ đề/ghi chú rồi lưu. Không gọi Zoom/OpenAI thật.
- Do cổng browser thử 4190 khác origin MinIO hiện có, harness chuyển tiếp yêu cầu storage qua Playwright request và thêm CORS cho origin thử; không đổi cấu hình MinIO của người dùng. Luồng local 4170 dùng cấu hình CORS sẵn có.
- Editor ở viewport 375px không tràn ngang toàn trang; chưa phải toàn bộ ma trận accessibility/mobile.

**Cập nhật local**

API và gateway ở http://127.0.0.1:4170 đã được rebuild/recreate; cấu hình provider đang chạy được giữ lại trong quá trình cập nhật. Không gọi provider để nghiệm thu. Health: database/storage/realtime ready; OpenAI/video configured, probe not_run.

Sao lưu PostgreSQL trước migration ở `verification/lesson/before-lesson.dump`. Số bản ghi trước/sau local update không đổi: 4 học sinh, 7 buổi, 3 hoạt động. Kiểm tra asset đang phục vụ xác nhận có UI chuẩn bị mới. Fixture kiểm thử nằm ở database `copilot_lesson_20261106` và bucket riêng, không thêm vào dữ liệu demo người dùng.

Bằng chứng cục bộ (gitignored): `verification/lesson/regression.txt`, `browser-result.json`, `editor.png`, `room-preview.png`, `editor-mobile.png`, `data-preserved.json` và log Docker build.

**Phạm vi còn lại**

Chưa triển khai AI đọc nguồn/soạn nội dung, thay consent cho cá nhân hóa, AI chấm bài, tổng kết tự tạo từ phản hồi, hồ sơ học tập theo môn/lớp và trợ giúp AI theo câu trả lời đang chọn. Đây là các đợt sau của kế hoạch; không coi lô 1 là đã hoàn thành toàn bộ thiết kế sản phẩm.
