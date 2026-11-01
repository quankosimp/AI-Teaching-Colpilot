ALTER TABLE "RoomMember" ADD COLUMN "displayName" TEXT;

ALTER TABLE "UploadIntent"
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'material',
  ADD COLUMN "sessionId" UUID,
  ADD COLUMN "studentId" UUID;

CREATE INDEX "UploadIntent_sessionId_studentId_expiresAt_idx" ON "UploadIntent"("sessionId", "studentId", "expiresAt");

CREATE TABLE "StudentRoomSession" (
  "id" UUID NOT NULL,
  "teacherId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "memberId" UUID NOT NULL,
  "inviteId" UUID NOT NULL,
  "displayName" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentRoomSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentRoomSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentRoomSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentRoomSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentRoomSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "RoomMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentRoomSession_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "Invite"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StudentRoomSession_refreshTokenHash_key" ON "StudentRoomSession"("refreshTokenHash");
CREATE INDEX "StudentRoomSession_sessionId_studentId_idx" ON "StudentRoomSession"("sessionId", "studentId");
CREATE INDEX "StudentRoomSession_memberId_revokedAt_idx" ON "StudentRoomSession"("memberId", "revokedAt");
