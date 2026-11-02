# Khôi phục giao diện ban đầu — 02/11/2026

Đã khôi phục bố cục chính và phong cách của bản ProductApp trước khi chuyển sang API. Nhánh: `fix/restore-original-ui`; source: `c2face5` (kế thừa `5453278`). Bản tham chiếu bất biến là `5bdb70d6c1416f70f2e23cba764302cf3d638b94`, trước `00d404f` chuyển sang OnlineApp.

Supervisor làm pair programming với một worker UI Codex (`60cbc5dd`, cấu hình `codex-alt/gpt-6.1-terra`): worker phụ trách shell/CSS và đối chiếu ảnh; supervisor phụ trách JSX, dữ liệu, tương tác, kiểm thử và tích hợp. Worker đã thực thi sửa và kiểm tra trình duyệt thành công. Các lần probe Gemini trước đó có trả lời ban đầu nhưng kết thúc bằng lỗi quota; không coi đó là worker sẵn sàng. Không có API xác nhận số token quota còn lại.

## Bố cục được khôi phục

| Vùng | Kết quả |
|---|---|
| Đăng nhập | Hero và form theo tỉ lệ bản đầu, màu tím/lavender, sáng/tối; tài khoản demo được ghi rõ là demo local. |
| Không gian quản lý | Sidebar 244px, topbar 64px, dashboard và card; các form tạo/chỉnh sửa chuyển vào modal thay vì trải dài trên trang. |
| Hồ sơ học sinh | Thẻ nhận diện, mục tiêu/ghi chú, các tab tổng quan, lịch sử buổi học và minh chứng. Tab hỗ trợ mũi tên/Home/End; dữ liệu được lọc theo học sinh và tài khoản. |
| Học liệu và kế hoạch | Card học liệu, xem PDF canvas; danh sách buổi và editor hoạt động. Modal vẫn gửi đúng mô tả/thời lượng, giữ version và cảnh báo vượt thời lượng. |
| Phòng dạy | Toàn chiều rộng; rail lộ trình/học sinh bên trái, video trên sân khấu giữa, Copilot bên phải, điều khiển ở đáy. Một stage chuyển học liệu/bảng/kiểm tra; review và chấm bài có chế độ riêng. |
| Bản nháp và video | Board editor luôn mounted khi đổi tab; xem nháp riêng không đổi nội dung học sinh và không remount PDF. Media giữ nguyên kết nối khi đổi sân khấu hoặc chế độ chấm/review. |
| Responsive và bàn phím | Kiểm tra sáng/tối, 360/375/768/1440px cho lớp học; quản lý 375/1440px. Drawer giữ focus và trả focus khi Escape; modal cũng được kiểm tra. |

Đây là khôi phục bố cục và hành vi chính, không phải bản sao từng pixel. Các khác biệt có chủ đích:

- Dashboard dùng số liệu thật hiện có: học sinh, buổi chưa hoàn tất, học liệu và buổi cần tổng kết. Không gắn số bài cần chấm/claim chờ duyệt giả từ prototype.
- Nội dung trống, lỗi và chưa cấu hình được hiển thị theo dữ liệu server. Các ảnh lớp học dùng PDF fixture trống để kiểm renderer/trang, không phải học liệu đã được biên soạn cho giáo viên.
- Không đưa mục bản ghi mô phỏng của prototype thành tính năng recording thật. Backlog/SRS về tính năng chưa triển khai được giữ nguyên.
- Vùng video mô phỏng có nhãn rõ. Quy tắc giới hạn chiều cao desktop chỉ áp dụng cho mock; layout/device behavior của Zoom thật chưa được nghiệm thu.

## Kiểm chứng

| Kiểm tra | Bằng chứng và phạm vi |
|---|---|
| Regression Node 22, PostgreSQL/MinIO riêng | **80 pass, 0 fail, 6 skip tường minh**; [TAP](evidence/ui-restoration-20261102/regression.tap). Cấu hình G1 tắt AI theo điều kiện suite; AI local được kiểm riêng trong suite của nó. Backend giữ nguyên so với `af70f23`. |
| Browser quản lý | `ui-restoration.cjs`: tạo/sửa hồ sơ; upload/private finalize/PDF canvas; tạo buổi và activity, mô tả/thời lượng; reload persistence; lịch sử; modal/drawer keyboard và đổi tài khoản không lộ dữ liệu. |
| Browser classroom | `g2-capabilities.cjs`: teacher + hai student context; admission, quyền, bảng, PDF/page sync, quick check, nộp/chấm bài, note, chat, TTL/revoke/end/review và hàng đợi offline. Có assertion hình học rail/video/stage/dock/footer, stage chỉ hiện một nội dung, tab còn truy cập được khi cuộn. |
| Browser review | `g2-browser.cjs`: điều chỉnh minh chứng mở lại review; review không có claim; quyền bảng sau kết thúc. |
| Media local | `g3-media.cjs`: contract fixture cho adapter và mock; đúng một lần lấy token qua chuyển tab/poll/chấm/review; giữ mute và draft, cleanup khi end. Không phải Zoom cloud pass. |
| AI local | `g4-ai.cjs`: bốn chế độ, chỉnh/dùng/bỏ qua/báo chưa phù hợp, retry và giữ input, nguồn claim, cách ly teacher/student. Không phải Gemini thật pass. |
| Static/build | Frontend/server typecheck, frontend/server build, truy vết 73 dòng SRS và `git diff --check` đạt. Build vẫn có cảnh báo bundle lớn; không suy rộng thành nghiệm thu hiệu năng release. |

Các script browser dùng `BROWSER_BASE_URL` và `BROWSER_ARTIFACT_DIR`; Playwright được cung cấp ngoài dependency production. Fixture chạy trên database/bucket UI test riêng, không reset database hiện có. Các suite được cập nhật để thao tác qua chế độ UI thật; giữ các assertion nghiệp vụ.

Docker local **http://127.0.0.1:4170** đã được cập nhật riêng service gateway từ source `c2face5`; API, PostgreSQL và MinIO giữ nguyên. [Browser production qua Caddy](evidence/ui-restoration-20261102/docker-browser.txt) đạt với giáo viên và hai context học sinh; [doctor](evidence/ui-restoration-20261102/docker-doctor.txt) thoát 0. [Image/runtime manifest](evidence/ui-restoration-20261102/runtime.json) ghi đúng image đã chạy. Health trả `degraded` như dự kiến vì thiếu provider thật, database/storage/realtime đều ready và pending failures bằng 0. Smoke cuối qua Docker tạo thêm fixture trên demo local, không reset dữ liệu.

Skill probe cũng đã chạy trên trang thật: đã sửa target nhỏ, nhãn auth nhỏ và Google hover dịch chuyển. Cảnh báo stylesheet scrollbar Zoom toàn cục, request refresh 401 khi chưa đăng nhập và viền màu brand được phân loại theo ngữ cảnh; không coi exit 0 của probe là bằng chứng toàn bộ UX/a11y đạt.

## Ảnh đối chiếu

- Dashboard: [bản đầu](evidence/ui-restoration-20261102/reference-dashboard-1440.png), [bản dùng API](evidence/ui-restoration-20261102/restored-dashboard-1440.png).
- Classroom: [bản đầu](evidence/ui-restoration-20261102/reference-classroom-1440.png), [bản khôi phục](evidence/ui-restoration-20261102/restored-classroom-1440.png).
- [Đăng nhập](evidence/ui-restoration-20261102/restored-auth-1440.png), [hồ sơ mobile tối](evidence/ui-restoration-20261102/restored-profile-375-dark.png), [học sinh mobile tối](evidence/ui-restoration-20261102/restored-student-360-dark.png).

Ảnh bản đầu dùng dữ liệu prototype; ảnh bản khôi phục dùng dữ liệu thử qua API. Không dùng khác biệt về số liệu làm kết luận tương đương từng pixel.

## Phạm vi SRS và tiếp theo

Không thay đổi 60 P0/13 P1 hay sửa DOCX/generator gốc. Đợt này sửa sự lệch UI do quá trình thay container online, giữ API/PostgreSQL/private storage/permissions/provenance. [Tổng quan và mind map SRS](implementation-report-20261101.md) vẫn là bản đối chiếu chức năng.

Google OAuth, Zoom, Gemini thật và public HTTPS vẫn BLOCKED vì thiếu cấu hình ngoài. G5, matrix NFR/a11y đầy đủ, backup/restore object storage và rollback toàn bộ release còn mở; đợt khôi phục này không đóng các gate đó.
