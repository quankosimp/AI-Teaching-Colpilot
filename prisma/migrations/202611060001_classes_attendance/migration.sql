-- Classes: permanent per-student link (rotated by bumping linkVersion) and attendance confirmed by the teacher.
ALTER TABLE "Student" ADD COLUMN "linkVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "RoomMember" ADD COLUMN "attendance" TEXT;
ALTER TABLE "RoomMember" ADD COLUMN "excused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Session" ADD COLUMN "attendanceConfirmedAt" TIMESTAMP(3);
