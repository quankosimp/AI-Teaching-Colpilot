-- Loại nhận định (review = Ôn lại, good = Làm tốt) và thời điểm gia sư đánh dấu "Đã ổn".
ALTER TABLE "Claim" ADD COLUMN "kind" TEXT;
ALTER TABLE "Claim" ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "Claim" ADD COLUMN "resolvedBy" UUID;
