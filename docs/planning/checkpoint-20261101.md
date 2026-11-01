# Repository checkpoint — 2026-11-01

Latest integrated source: **55c05e1**. Backend **0742241** and frontend **da0637f** are pushed; supervisor now combines them with UI/QA. Docker local: http://127.0.0.1:4170. HTTP/socket: **76 pass /0 fail /6 legacy placeholders skipped**; strengthened final browser and historical migration checks passed. G2 classroom/tools/manual-review milestone is accepted locally after scoped independent review; real providers/HTTPS, final NFR and60-P0 acceptance remain open. [Exact evidence](evidence/g2-integrated-55c05e1.json). The table below preserves the earlier publication snapshot.

Checkpoint được commit trên các nhánh riêng theo yêu cầu người dùng. G2 chưa được nghiệm thu.

| Vai trò | Nhánh | SHA snapshot |
|---|---|---|
| Supervisor | `feat/integrated-classroom-ui` | `71ce979c5861efb07fe65068d33236b66293fab5` |
| Backend | `workers/product-completion-20261031` | `f6a40bcf9d14939e2d61f177b3cdce34b70e1a31` |
| Frontend | `workers/classroom-wiring-20261101` | `2555198ae0dbef790a24aa65899e8a9dc3a40451` |
| UI | `workers/ui-completion-20261031` | `f55ef71976b8edb648034b5bd5065c9a528ac27d` |
| QA | `workers/demo-verification-20261031` | `1501d80d4c10471f65b53bab82037d33762479e5` |
| Ops | `workers/operations-local-20261031` | `29f97ca3c670635500fd2a042dc365e95a6c813a` |

SHA Supervisor trong bảng là snapshot trước commit chứa báo cáo này; nhánh đó được bổ sung commit tài liệu này khi xuất bản.

## Phạm vi và kiểm tra

- Supervisor: nền tảng G0/G1-local, Docker local đã nghiệm thu và hồ sơ truy vết SRS.
- Backend f6a40bc: bổ sung sửa provenance lịch sử, giữ observation nhập tay, capabilities và annotation an toàn. Supervisor chạy lại 14/14 unit/contract test và server typecheck đạt; review độc lập các sửa mới còn chờ.
- Frontend2555198: checkpoint WIP kết nối stage/công cụ/dock/chat. Supervisor xác minh typecheck, build và cú pháp harness; chưa chạy bộ browser mới, chưa nghiệm thu đầy đủ SRS.
- UI/QA/Ops: giữ các commit đã bàn giao. 31/31 kiểm thử QA trước đó được xác minh trên backend66baabd, không tự gán kết quả cho backend mới.
- Các nhánh worker được đẩy riêng để review; nhánh Supervisor hiện chứa G0/G1 và Docker, chưa hợp nhất các candidateG2 chưa nghiệm thu.

## Quota và model

- Hai writer backend/frontend đã thực thi tác vụ trên Gemini3.8 Flash High; không có API công khai trong bộ tool để đọc số token hoặc phần trăm quota còn lại.
- Probe Gemini4 Argon Medium có trả lời QUOTA_PROBE_OK, sau đó session báo stream interrupted. Khi giao tác vụ đọc code thực tế tiếp theo, provider báo quota hết và reset sau32h34m31s. Vì vậy Medium hiện được xếp blocked-quota, không coi probe ngắn là đủ bằng chứng còn quota chạy việc.
- Lần gọi gần nhất của tài khoản Worker Codex báo usage limit, provider trả mốc2:37 PM. Gemini4High và ClaudeOpus/SonnetHigh từng báo hết quota; các reset tương đối thuộc thời điểm báo lỗi, không phải quota đo mới.
- Thay đổi model giữ nguyên worktree và quyền sở hữu file; callback có thể lặp lại lastError cũ nên không coi đó là bằng chứng Flash vừa hết quota.

## Chưa hoàn tất

- Review backend mới, kiểm thử provenance/migration và quyền trên bản tích hợp cuối.
- Khép kín và kiểm thử toàn bộ thao tác classroom qua giao diện, kiểm tra capability default-deny và bố cục UI cuối.
- Zoom/Gemini đầy đủ, kiểm thử lỗi/NFR, backup/restore/rollback và nghiệm thuG5. Provider thật/HTTPS còn thiếu credentials và target.

Ba tài liệu gốc chưa được Git theo dõi vẫn giữ nguyên: docs/.qa/, SRS DOCX và docs/build_srs.py.

Chi tiết máy đọc: [publication-checkpoint-20261101.json](evidence/publication-checkpoint-20261101.json).
