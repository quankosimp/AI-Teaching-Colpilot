-- AddColumn: RoomMember.following
-- Tracks whether a student is synced to the teacher's stage view.
-- Default true: existing members are treated as following until they opt out.
ALTER TABLE "RoomMember" ADD COLUMN "following" BOOLEAN NOT NULL DEFAULT true;
