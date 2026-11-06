-- Đồng ý dùng AI ở mức học sinh: gia sư ghi nhận một lần (thay cho đồng ý theo từng buổi), có thể thu hồi.
ALTER TABLE "Student" ADD COLUMN "aiConsentAt" TIMESTAMP(3);
ALTER TABLE "Student" ADD COLUMN "aiConsentRevokedAt" TIMESTAMP(3);
