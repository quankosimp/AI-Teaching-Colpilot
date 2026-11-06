-- Lịch lặp không bắt buộc của lớp: các thứ trong tuần (0 = Chủ Nhật) và giờ bắt đầu.
ALTER TABLE "StudentGroup" ADD COLUMN "scheduleDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "StudentGroup" ADD COLUMN "scheduleTime" TEXT;
