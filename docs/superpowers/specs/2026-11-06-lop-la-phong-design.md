# Thiết kế: "Lớp là phòng" — sắp xếp lại vòng dạy của gia sư

Ngày: 06/11/2026 · Cập nhật: bỏ nút đánh dấu trong giờ (xem 5.5) · Trạng thái: đã duyệt · Mockup: `exe101/mockups/lop-v2.html` (9 màn, nằm ngoài repo)

Quy ước nhãn: **[Đã có]** app đang làm được; **[Sửa]** có nhưng phải đổi; **[Mới]** phải xây; **[Giả định]** chưa được kiểm chứng với gia sư thật.

---

## 1. Vấn đề và mục tiêu

App hiện chia theo loại dữ liệu (Tổng quan, Lớp, Buổi học, Học sinh, Kho học liệu). Gia sư phải tự ghép chúng thành việc của mình. Hệ quả:
- Có ít nhất bốn lối tạo buổi, mỗi lối một kiểu form. Lối vào phòng dạy không rõ.
- Tên gọi không nói việc phải làm ("Sắp tới", "Mở buổi tiếp theo", "buổi lẻ").
- Số liệu nhiều nhưng không dẫn tới hành động.

**Mục tiêu:** gia sư đi hết một vòng dạy (mở lớp → dạy → ghi nhớ từng em → dùng lại ở buổi sau) mà không phải hỏi "chức năng này nằm ở đâu".

**Giá trị chính:** app nhớ giúp từng em, bằng cách gom những gì xảy ra trong buổi về một chỗ. [Giả định] Cần thử với 3–5 gia sư dạy nhiều môn (mục 10).

**Không làm:** quản lý trung tâm, chấm điểm hay xếp hạng học sinh, thay Drive làm chỗ lưu file, AI nghe cả buổi học, đọc chữ viết tay.

## 2. Những điều đã chốt

1. Sản phẩm phục vụ gia sư. Trung tâm là công việc của gia sư, không phải hồ sơ học sinh.
2. Mỗi **lớp là một phòng học cố định**. Link vào lớp của từng em không đổi. Dạy kèm 1–1 là lớp có một em. Bỏ khái niệm "buổi lẻ".
3. **Mở lớp lúc nào cũng được.** Lịch chỉ để nhắc, có thể lặp hằng tuần, có thể dời hoặc học bù.
4. **Mỗi lần mở lớp là một buổi**, tự ghi vào nhật ký của lớp. Không phải tạo buổi trước.
5. Cách dạy kết hợp: tài liệu, bảng trắng, chia sẻ màn hình. Kho tài liệu là tuỳ chọn.
6. Ghi nhớ gần như không cần nhập: **không thêm nút nào trong giờ dạy**. App dùng những việc gia sư vốn đã làm (nhận xét bài nộp, nhận xét câu trả lời câu hỏi nhanh, lưu bảng nháp) làm nguồn; sau buổi AI soạn nháp, gia sư xác nhận hoặc tự thêm.
7. **Gia sư luôn quyết định (HITL).** AI không tự ghi gì vào hồ sơ.
8. Ví dụ, dữ liệu mẫu và chữ trong giao diện không mặc định một môn.

## 3. Vòng dùng chính

1. **Tạo lớp**, thêm các em. Mỗi em có link riêng.
2. **Mở lớp.** Các em bấm link là vào.
3. **Dạy.** Chiếu tài liệu, bảng hoặc màn hình. Các em nộp bài, trả lời câu hỏi nhanh. Gia sư nhận xét như vẫn làm; mỗi nhận xét tự thành nguồn cho em đó.
4. **Kết thúc buổi.** Điểm danh tự điền. AI soạn mỗi em một dòng nháp. Gia sư chọn Giữ, Sửa, Bỏ hoặc tự thêm.
5. **Buổi sau**, điều cần nhớ hiện trên trang lớp và trong hồ sơ em (hiện trong phòng dạy để sau).

## 4. Điều hướng

- Thanh bên còn **Lớp · Tài liệu**, Tài khoản ở dưới cùng.
- Ô tìm kiếm ở đầu trang tìm được tên lớp hoặc tên em.
- **Bỏ các trang:** Tổng quan, Buổi học, Học sinh (danh sách riêng), Soạn buổi học, Phòng dạy, Chấm bài, Tổng kết & duyệt. Nội dung của chúng chuyển vào trang lớp, phòng dạy và màn sau buổi.
- Nhãn số trên mục Lớp bằng số lớp còn việc sau buổi.

## 5. Màn hình

### 5.1 Danh sách lớp (màn đầu) — mockup "Danh sách lớp"
- Mỗi lớp một thẻ: tên, môn, khối, ảnh các em, số em.
- **Trạng thái, một trong ba:** "Đang học · từ 08:02 · 4/4 em" (nút **Vào lại** màu xanh lá, thẻ đưa lên đầu) / "Lịch Thứ 5, 19:30 · tới 12/11" / "Chưa đặt lịch".
- **Việc còn dở, nếu có:** "3 em chờ xác nhận ghi nhớ", "2 bài chưa nhận xét". Không có thì ghi "Không có việc còn dở".
- Nút chính **Mở lớp**, nút phụ **Link mời**, nút "⋯".
- Ô cuối là "Tạo lớp mới", ghi chú "Dạy kèm 1–1 cũng là một lớp".
- Trạng thái trống (chưa có lớp nào): một ô giải thích và nút Tạo lớp.

### 5.2 Trang một lớp
**Đầu trang:** tên lớp, ảnh các em, môn, khối, số em; nút **Link mời**, nút **Mở lớp** cỡ lớn, nút "⋯" (sửa lớp, xoá lớp nếu chưa có buổi nào).

**Dòng lịch** dưới đầu trang: "Lịch: Thứ 5 hằng tuần, 19:30 · buổi tới 12/11", nút **Sửa lịch**. Chưa có lịch thì ghi "Chưa đặt lịch" và nút **Đặt lịch**.

Ba thẻ:

**a. Các em (mặc định)** — mockup "Trang lớp · Các em"
- Mỗi em một dòng: tên, ngày vào lớp; số buổi đã học trên tổng số buổi; tối đa 2 điều **cần nhớ đang mở**, mỗi điều có nhãn "Ôn lại" hoặc "Làm tốt" và ngày ghi; nút **Chép link**.
- Em chưa có gì: "Chưa có điều cần nhớ" màu xám. Không hiện chữ "Ổn định".
- Bấm tên em: mở hồ sơ ở khung bên phải (5.3). Không rời trang lớp.
- Cuối bảng có dòng **+ Thêm học sinh** (chọn em đã có hoặc gõ tên em mới).

**b. Nhật ký buổi** — mockup "Trang lớp · Nhật ký buổi"
- Dòng đầu là buổi sắp tới theo lịch (nếu có): ngày giờ, nút **Ghim tài liệu** nếu muốn chuẩn bị trước.
- Mỗi lần đã mở lớp là một dòng: ngày, giờ bắt đầu, thời lượng thực tế; tiêu đề (lấy từ tài liệu hoặc hoạt động đã mở, gia sư sửa được); nhãn đã dùng gì (tên tài liệu, Bảng chung, Chia sẻ màn hình); có mặt bao nhiêu em, em nào vắng.
- Cột cuối: nút đúng việc còn dở (**Xác nhận ghi nhớ · 3 em**, **Nhận xét 2 bài**) hoặc nhãn "Xong". Buổi học bù có nhãn "học bù".
- Bấm một buổi đã dạy: mở màn sau buổi (5.7) của buổi đó.
- Tên thẻ có số buổi còn chờ xác nhận.

**c. Tài liệu**
- Tài liệu đã ghim cho lớp và tài liệu đã dùng, mỗi cái ghi "dạy tới trang N". Nút **Ghim tài liệu** mở kho (5.9) ở chế độ chọn.

### 5.3 Hồ sơ một em (khung bên phải) — mockup "Hồ sơ một em"
- Đầu khung: tên, lớp, số buổi đi học.
- **Cần nhớ đang mở:** mỗi điều có nguồn (buổi nào, phần nào, ai ghi). Nút **Đã ổn** để đóng, **Sửa**.
- **Thêm điều cần nhớ:** gia sư tự thêm lúc nào cũng được.
- **Đã ghi nhận:** các điều đã đóng, mờ hơn.
- **Bài đã nộp:** tên, ngày, đã nhận xét chưa, nút Xem.
- **Đi học:** có mặt, các buổi vắng (có phép hay không), link riêng (Chép link, Đổi link).

### 5.4 Đặt lịch (không bắt buộc) — mockup "Đặt lịch"
- Chọn các thứ trong tuần và giờ bắt đầu. **Không hỏi thời lượng.**
- Xem trước 3 buổi tới.
- Dời hoặc học bù: sửa ngay trên dòng buổi sắp tới trong Nhật ký (đổi ngày giờ một lần, không đổi lịch lặp).
- Nút **Xoá lịch**. Không có lịch vẫn mở lớp được.

### 5.5 Phòng dạy — không thêm nút đánh dấu
Bỏ thiết kế cũ có hai nút "Cần ôn lại / Làm tốt" trong giờ: gia sư sẽ quên bấm, và nó lặp việc đã có. Nguồn cho bước sau buổi lấy từ những việc gia sư vốn làm [Đã có]:
- Nhận xét một bài nộp → tự tạo minh chứng `BaiLam` cho đúng em, đúng hoạt động.
- Nhận xét một câu trả lời câu hỏi nhanh → tự tạo minh chứng `KiemTraDocLap`.
- Lưu bảng nháp của em → minh chứng `TrangNhap`.
- Gia sư ghi quan sát ở màn tổng kết cũ → minh chứng `GhiChu`.

Để sau, chỉ làm nếu gia sư dùng thử cần: chấm câu hỏi nhanh một chạm "Đúng / Chưa đúng" (hiện bắt buộc gõ nhận xét); nói nhanh 30 giây sau buổi để AI tách theo từng em; hiện điều cần nhớ trên ô của em trong phòng dạy.

### 5.6 Chiếu cho cả lớp — mockup "Chiếu cho cả lớp"
- Ba lựa chọn: Tài liệu, Bảng trắng, Chia sẻ màn hình [Đã có].
- **Đã làm khác mockup:** không thêm hộp chọn tài liệu trong phòng. Tài liệu ghim cho lớp được gắn sẵn vào buổi khi bấm **Mở lớp** và mở đúng trang lần trước dừng, nên vào phòng là chiếu được ngay. Ghim và bỏ ghim ở tab **Tài liệu** của trang lớp (mục 5.9).
- **Câu hỏi từ trang này** (Phần 6), nút trên đầu khung chiếu, chỉ gia sư thấy, chỉ khi đang chiếu tài liệu:
  - Trình duyệt đọc chữ của trang đang chiếu (PDF có chữ). Trang là ảnh hoặc PDF scan thì báo "AI chỉ soạn được từ PDF có chữ", không gọi AI.
  - AI soạn nháp 3 câu hỏi kiểm tra nhanh, không kèm đáp án. Chỉ gửi chữ của trang và môn, khối của lớp; không gửi tên hay dữ liệu học sinh.
  - Gia sư sửa từng câu trong ô, bấm **Mở cho lớp** (mở câu hỏi nhanh như gõ tay) hoặc **Chép**. Không câu nào tự gửi.
  - Mở một câu thì lớp chuyển sang màn Hỏi nhanh. Quay lại Tài liệu vẫn còn các câu khác, câu đã mở ghi "Đã mở cho lớp". **Soạn lại** gọi AI lần nữa.
  - Trang được giữ cố định lúc bấm: gia sư lật trang trong lúc chờ thì câu hỏi vẫn là của trang đã chọn.

### 5.7 Sau buổi — mockup "Sau buổi"
Mở ngay khi bấm **Kết thúc buổi** (thay cho hộp điểm danh lúc kết thúc). Mở lại được từ Nhật ký buổi.
1. **Điểm danh:** một dòng tóm tắt điền sẵn từ giờ vào lớp ("4/4 em có mặt · Tuấn Kiệt vào muộn 12 phút"), nút **Sửa** mở bảng điểm danh đang có.
2. **Ghi nhớ cho từng em** (chỉ em có mặt). Mỗi em một thẻ:
   - Em có nguồn mà chưa có nháp: app tự gọi AI soạn (một em một lần, lần lượt), thẻ hiện "Đang soạn…".
   - Dòng nháp tối đa khoảng 120 ký tự, nhãn **Ôn lại** hoặc **Làm tốt** (AI gợi ý, gia sư đổi được bằng một chạm).
   - Bên dưới là các nguồn AI dùng (tên minh chứng: "Bài nộp: …", "Kiểm tra nhanh: …").
   - Nút **Giữ**, **Sửa** (sửa chữ rồi giữ), **Bỏ**. Đã giữ thì hiện "Đã giữ".
   - Em không có nguồn: không gọi AI, ghi "Chưa có nguồn nào trong buổi này", nút **Tự thêm**.
   - Em nào cũng có **Tự thêm**: gõ một dòng, chọn Ôn lại/Làm tốt, Lưu (app ghi thành quan sát của gia sư rồi giữ luôn).
   - Ghi chú dưới bảng: "Chỉ những dòng bạn bấm Giữ mới vào hồ sơ."
3. **Bài nộp chưa nhận xét:** danh sách, nút **Nhận xét** mở màn chấm đang có.
- Cuối trang: **Để sau** (về lớp, nhật ký ghi còn việc) và **Lưu và đóng buổi**: xác nhận điểm danh và đánh dấu buổi đã tổng kết. Nút này tắt khi còn dòng nháp chưa Giữ hoặc Bỏ.
- AI lỗi hoặc tắt: thẻ ghi "Chưa soạn được, bạn tự thêm nhé", vẫn đóng buổi được.

### 5.8 Màn chấm bài
Giữ màn chấm đang có, mở từ 5.7 hoặc từ thẻ Bài nộp. Mức hỗ trợ mặc định "Chưa rõ" [Đã có].

### 5.9 Tài liệu — mockup "Tài liệu"
- Thanh bên đổi tên thành **Tài liệu**. Đầu trang ghi rõ: không bắt buộc, chia sẻ màn hình vẫn dạy được như thường.
- Ba ô ngắn nói việc máy làm thêm khi có tệp: **Mở sẵn khi vào lớp**, **Nhớ trang đã dừng**, **Câu hỏi từ trang đang chiếu**.
- Mỗi tài liệu có nút **Dùng cho lớp** (thay cho "Thêm vào buổi"): hộp danh sách lớp, bấm một lớp là ghim hoặc bỏ ghim ngay, mỗi dòng ghi "Đang ghim · tiếp từ trang N" hoặc "Đã dùng · dừng ở trang N".
- **Tab Tài liệu của trang lớp** (thứ ba, sau Các em và Nhật ký buổi):
  - "Mở sẵn ở buổi tới": tài liệu đang ghim, mỗi dòng "tiếp từ trang N", nút **Bỏ ghim**; nút **Ghim tài liệu** mở hộp chọn nhiều tài liệu có ô tìm.
  - Chưa ghim gì thì ghi rõ là không bắt buộc, ghim khi lớp đang theo một bộ tài liệu dài.
  - "Đã dùng trước đây": tài liệu từng chiếu mà không ghim, "Lần cuối ngày · dừng ở trang N", nút **Ghim lại**.
  - Cuối khung: **Chuẩn bị buổi tới** mở màn soạn bài sẵn có cho buổi đã hẹn gần nhất; chưa có thì tạo một buổi theo lịch (không có lịch thì hôm nay). Về từ màn soạn bài là về đúng trang lớp.
- Kết thúc buổi thì máy ghi trang cuối đang chiếu cho tài liệu đó của lớp (lỗi ở bước này không chặn việc kết thúc).
- Tài liệu chưa tải xong hoặc đã lưu trữ thì bị bỏ qua khi mở lớp, không chặn **Mở lớp**.

### 5.10 Đồng ý dùng AI (Phần 5)
- **Hồ sơ một em**, mục **Trợ lý AI**, ba trạng thái:
  - "Chưa ghi nhận": AI chỉ dùng ở buổi em tự bấm Vào lớp (như trước).
  - "Đã ghi nhận đồng ý": dùng cho mọi buổi, kể cả gợi ý soạn bài trước giờ.
  - "Đã thu hồi": AI không đọc dữ liệu của em, kể cả khi em vào lớp.
- **Ghi nhận đồng ý** luôn có bước xác nhận: "Em hoặc phụ huynh đã đồng ý?", kèm câu nói AI đọc gì (bài làm, câu trả lời, trang nháp trong giờ, không kèm tên). **Thu hồi** hỏi lại một lần.
- **Màn Sau buổi:** em có nguồn mà chưa đồng ý thì thẻ ghi "Em chưa đồng ý dùng AI nên máy không soạn nháp", kèm nút **Ghi nhận đồng ý** ngay trong thẻ. Ghi nhận xong thì máy tự soạn nháp cho em đó.
- **Link của em:** dưới nút Vào lớp có một dòng nói rõ vào lớp là đồng ý cho thầy cô dùng trợ lý AI đọc bài trong giờ, không kèm tên, và thầy cô duyệt từng nhận xét.
- Luật chung cho mọi chỗ gọi AI có dữ liệu học sinh: thu hồi (sau lần ghi nhận gần nhất) thì chặn; đã ghi nhận thì cho; chưa quyết định thì theo đồng ý khi vào buổi đó.

## 6. Dữ liệu (so với code hiện có)

| Khái niệm | Lưu ở đâu | Ghi chú |
|---|---|---|
| Lớp | `StudentGroup` + `StudentGroupMember` [Đã có] | Thêm lịch: `scheduleDays Int[]` (0–6), `scheduleTime String?` trên `StudentGroup` [Mới] |
| Buổi | `Session` có `groupId` [Đã có] | **Mở lớp** tạo `Session` cho lớp với ngày hôm nay và bắt đầu ngay, nếu lớp chưa có buổi đang học [Sửa]. Buổi dời hoặc học bù là một `Session` trạng thái `scheduled` có ngày giờ riêng |
| Link riêng | `Student.linkVersion` [Đã có] | Link dẫn vào buổi đang học của lớp [Đã có] |
| Nguồn trong giờ | `Evidence` tự tạo khi nhận xét bài nộp, câu trả lời câu hỏi nhanh, lưu bảng nháp [Đã có] | Không thêm cột |
| Dòng nháp của AI | `Claim` trạng thái `pending`, `evidenceIds` trỏ tới nguồn; tạo qua route sẵn có `POST /sessions/:id/ai/claims-draft` [Đã có] | Thêm `kind` (`review` hoặc `good`); AI trả `kind` trong JSON [Mới] |
| Giữ / Sửa / Bỏ | `Claim` → `approved` / sửa `text` rồi `approved` / `rejected` [Đã có] | |
| Đã ổn | `Claim` thêm `resolvedAt`, `resolvedBy` [Mới] | Đã ổn thì không còn "đang mở" |
| Tài liệu đã dạy tới trang | `Activity.materialStartPage` [Đã có, công cụ khác vừa thêm] | Mở lớp gắn tài liệu ghim với `materialStartPage = GroupMaterial.lastPage`; kết thúc buổi ghi `Session.materialPage` vào `lastPage` [Đã làm] |
| Ghim tài liệu cho lớp | Bảng mới `GroupMaterial (groupId, materialId, pinned, lastPage, lastUsedAt, createdAt)`, khoá chính `(groupId, materialId)` [Đã làm] | `pinned = false` nghĩa là "đã dùng trước đây" |
| Đồng ý dùng AI | `RoomMember.consent` theo từng buổi [Đã có] cộng `Student.aiConsentAt`, `Student.aiConsentRevokedAt` [Đã làm] | Luật ở `server/aiConsent.ts`, dùng ở mọi route AI có dữ liệu học sinh. Xem câu hỏi mở 11.2 |
| Câu hỏi từ trang | Không lưu [Đã làm] | `POST /sessions/:id/ai/page-questions` chỉ trả gợi ý; câu được mở thành `QuickCheck` như gõ tay. Có ghi nhật ký kiểm toán |

"Cần nhớ đang mở" của một em = các `Claim` `approved`, chưa `resolvedAt`, thuộc buổi của lớp đó. Hiển thị tối đa 2 điều ở bảng Các em và trên ô trong phòng; hồ sơ hiện tất cả.

## 7. Luồng và trạng thái

- **Mở lớp:** nếu lớp có buổi `live` thì vào lại; nếu có buổi `scheduled` hôm nay thì bắt đầu buổi đó; nếu không thì tạo buổi mới và bắt đầu. Học sinh vào bằng link riêng [Đã có].
- **Vào lớp sớm:** học sinh mở link trước giờ thấy trang chờ [Đã có].
- **Kết thúc buổi:** kết thúc ngay, điểm danh lưu ở trạng thái máy điền, rồi chuyển sang màn sau buổi. Bảng điểm danh đầy đủ mở từ nút Sửa [Đã có]; bấm "Lưu và đóng buổi" là xác nhận điểm danh.
- **AI soạn nháp:** chạy khi mở màn sau buổi lần đầu, mỗi em một yêu cầu, chạy song song.
  - Đầu vào: đánh dấu trong giờ, kết quả câu hỏi nhanh, bài nộp và nhận xét, điều cần nhớ đang mở.
  - Đầu ra: tối đa 1 dòng mỗi em, bắt buộc trích ít nhất một nguồn (luật hiện có: nhận định không có nguồn hợp lệ thì bị loại).
  - Không có nguồn nào thì không gọi AI, hiện "không thấy điều gì đáng ghi".
- **AI đọc trang tài liệu [Mới, làm sau]:** chỉ PDF có chữ (không OCR ảnh). Gia sư bấm "Soạn câu hỏi từ trang này" trong phòng dạy; AI trả 2–3 câu hỏi, gia sư xem trước rồi mới mở cho lớp.

## 8. Lỗi và trường hợp biên

- AI lỗi hoặc tắt: màn sau buổi vẫn hiện các nguồn đã ghi; mỗi em có nút **Tự thêm**; không chặn việc đóng buổi.
- Học sinh chưa đồng ý dùng AI: không gửi dữ liệu của em đó cho AI; thẻ của em ghi lý do và chỉ cho tự thêm.
- Đánh dấu khi mất mạng: giữ trong hàng đợi gửi lại như các thao tác khác [Đã có].
- Mở lớp khi lớp chưa có em: nút Mở lớp tắt, ghi "Thêm học sinh trước".
- Gia sư đóng tab giữa màn sau buổi: nháp đã Giữ được lưu ngay; nháp chưa xử lý vẫn còn khi mở lại.
- Hai thiết bị cùng mở màn sau buổi: dùng version hiện có của `Claim`; xung đột thì báo và tải lại.

## 9. Thứ tự làm đề xuất

1. **Khung và Lớp** — đã làm (kế hoạch Phần 1).
2. ~~Đánh dấu một chạm~~ — bỏ (mục 5.5).
3. **Màn Sau buổi** với AI soạn nháp, Giữ/Sửa/Bỏ/Tự thêm, loại Ôn lại/Làm tốt, Đã ổn; hiện điều cần nhớ trong lớp và hồ sơ — đã làm.
- **Dọn dẹp** — đã làm: bỏ các trang Tổng quan, Buổi học, Học sinh và trang Lớp cũ; buổi cũ chưa thuộc lớp nào được gom vào lớp theo cặp gia sư và học sinh (migration `202611060006`).
4. **Tài liệu:** ghim cho lớp, mở tiếp đúng trang, Chuẩn bị buổi tới — đã làm (mục 5.9).
5. **Đồng ý dùng AI ở mức học sinh** — đã làm (mục 5.10). Câu 11.2 vẫn cần nhóm xác nhận về chính sách.
6. **AI đọc trang tài liệu** — đã làm (mục 5.6). Nên cho gia sư dùng thử trước khi nói về lợi ích.

## 10. Kiểm thử và đo

- Kiểm thử tự động cho: luật Mở lớp (live / scheduled hôm nay / tạo mới), lịch lặp, đánh dấu có ngữ cảnh, AI nháp bị loại khi thiếu nguồn, Giữ/Sửa/Bỏ/Đã ổn, quyền của gia sư khác lớp.
- Kiểm tra trên trình duyệt cả vòng 1–5 ở khổ 1440, 1280 và 375.
- Dùng thử với 3–5 gia sư dạy ít nhất hai môn khác nhau. Đo: thời gian từ mở app tới vào lớp; thời gian màn sau buổi; tỷ lệ dòng nháp được Giữ, Sửa, Bỏ; gia sư có tự mở "cần nhớ" ở buổi sau không. Không dùng số lần bấm AI làm bằng chứng lợi ích.

## 11. Câu hỏi mở

1. **Báo cáo CP4 và code đang khác nhau:** báo cáo viết không có phòng video, code đã có. Thiết kế này đi theo code. Cần thống nhất trước khi nộp báo cáo.
2. **Đồng ý dùng AI:** đã làm theo hướng gia sư ghi nhận thay em hoặc phụ huynh, có bước xác nhận và thu hồi được; đồng ý khi vào buổi vẫn giữ. Nhóm vẫn cần xác nhận cách này hợp chính sách dữ liệu, nhất là với học sinh nhỏ tuổi (có cần phụ huynh tự bấm không).
3. **Công việc song song:** một công cụ khác đang thêm luồng soạn nội dung (`LessonPreparation`, `LessonSchedule`, bookmark trang). Cần quyết định giữ phần nào khi gộp, để hai bên không sửa đè nhau.
