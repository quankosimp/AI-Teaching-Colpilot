-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TeacherStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('google', 'mock');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "MaterialLevel" AS ENUM ('CoBan', 'TrungBinh', 'NangCao');

-- CreateEnum
CREATE TYPE "MaterialKind" AS ENUM ('PDF', 'Anh', 'BaiTap', 'GhiChu');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('pending', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('draft', 'scheduled', 'live', 'ended', 'reviewed');

-- CreateEnum
CREATE TYPE "SharedView" AS ENUM ('document', 'board', 'check');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('KhoiDong', 'LyThuyet', 'LuyenTap', 'KiemTra');

-- CreateEnum
CREATE TYPE "MemberState" AS ENUM ('invited', 'waiting', 'joined', 'disconnected', 'left');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "SupportLevel" AS ENUM ('DocLap', 'CoGoiY', 'DuocHuongDan', 'ChuaRo');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('new', 'draft', 'reviewed');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('GhiChu', 'BaiLam', 'MucHoTro', 'GoiYGiangDay', 'TrangNhap', 'KiemTraDocLap', 'ChuThichDe');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('note', 'submission', 'board_attempt', 'check_response', 'annotation', 'ai_suggestion');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('active', 'corrected', 'deleted');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "AIKind" AS ENUM ('suggestion', 'claim_draft', 'plan_suggestion', 'grading_hint');

-- CreateEnum
CREATE TYPE "AIProvider" AS ENUM ('gemini', 'mock');

-- CreateEnum
CREATE TYPE "AIStatus" AS ENUM ('ready', 'used', 'ignored', 'reported', 'error');

-- CreateEnum
CREATE TYPE "ActorRole" AS ENUM ('teacher', 'student', 'system', 'support');

-- CreateTable
CREATE TABLE "Teacher" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "workspaceId" UUID NOT NULL,
    "status" "TeacherStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherOAuthIdentity" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerSubject" TEXT NOT NULL,

    CONSTRAINT "TeacherOAuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherAuthSession" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherAuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "status" "StudentStatus" NOT NULL DEFAULT 'active',
    "strengths" TEXT[],
    "gaps" TEXT[],
    "notes" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentGroup" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentGroupMember" (
    "groupId" UUID NOT NULL,
    "studentId" UUID NOT NULL,

    CONSTRAINT "StudentGroupMember_pkey" PRIMARY KEY ("groupId","studentId")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "level" "MaterialLevel" NOT NULL,
    "kind" "MaterialKind" NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialVersion" (
    "id" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "pages" TEXT[],
    "uploadStatus" "UploadStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "primaryStudentId" UUID NOT NULL,
    "groupId" UUID,
    "groupName" TEXT,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "sharedGoal" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'draft',
    "currentActivityId" UUID,
    "sharedView" "SharedView" NOT NULL DEFAULT 'document',
    "sharedBoardOwnerId" TEXT NOT NULL DEFAULT 'common',
    "materialPage" INTEGER NOT NULL DEFAULT 0,
    "tools" JSONB NOT NULL,
    "completedActivityIds" TEXT[],
    "dismissedSuggestionIds" TEXT[],
    "reviewNote" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "nextEventSeq" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "teacherNotes" TEXT,
    "type" "ActivityType" NOT NULL,
    "materialId" UUID,
    "materialVersion" INTEGER,
    "sourceEvidenceIds" TEXT[],
    "sourceClaimRefs" JSONB NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMember" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "state" "MemberState" NOT NULL DEFAULT 'invited',
    "canWrite" BOOLEAN NOT NULL DEFAULT true,
    "toolOverrides" JSONB,
    "handRaised" BOOLEAN NOT NULL DEFAULT false,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "maskedHint" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "sessionId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "strokes" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "notes" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardAttempt" (
    "id" UUID NOT NULL,
    "boardId" TEXT NOT NULL,
    "sessionId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "strokes" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "materialVersion" INTEGER NOT NULL,
    "page" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickCheck" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "status" "CheckStatus" NOT NULL DEFAULT 'open',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "QuickCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckResponse" (
    "id" UUID NOT NULL,
    "checkId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "answer" TEXT NOT NULL,
    "support" "SupportLevel" NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "activityId" UUID,
    "title" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "fileName" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'new',
    "support" "SupportLevel",
    "suggestedFeedback" TEXT,
    "finalFeedback" TEXT,
    "score" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMessage" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomReaction" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "activityId" UUID,
    "kind" "EvidenceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "support" "SupportLevel" NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceId" TEXT,
    "sourceVersion" INTEGER,
    "submissionId" UUID,
    "isObservation" BOOLEAN NOT NULL DEFAULT true,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceRevision" (
    "id" UUID NOT NULL,
    "evidenceId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "detail" TEXT NOT NULL,
    "support" "SupportLevel" NOT NULL,
    "studentId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "activityId" UUID,
    "sourceType" "SourceType" NOT NULL,
    "sourceId" TEXT,
    "sourceVersion" INTEGER,
    "status" "EvidenceStatus" NOT NULL,
    "changedBy" UUID NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "evidenceIds" TEXT[],
    "status" "ClaimStatus" NOT NULL DEFAULT 'pending',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "staleReason" TEXT,
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimRevision" (
    "id" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "evidenceIds" TEXT[],
    "status" "ClaimStatus" NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRequest" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "activityId" UUID,
    "studentId" UUID NOT NULL,
    "kind" "AIKind" NOT NULL,
    "prompt" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "responseText" TEXT NOT NULL,
    "contextSummary" TEXT NOT NULL,
    "provider" "AIProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "status" "AIStatus" NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionEventOutbox" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL,
    "targetStudentId" UUID,
    "activityId" UUID,
    "materialId" UUID,
    "page" INTEGER,
    "sourceId" TEXT,
    "boardSnapshot" JSONB,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "publicationAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),

    CONSTRAINT "SessionEventOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" "ActorRole" NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "sessionId" UUID,
    "requestId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "key" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("actorId","route","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherOAuthIdentity_provider_providerSubject_key" ON "TeacherOAuthIdentity"("provider", "providerSubject");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAuthSession_refreshTokenHash_key" ON "TeacherAuthSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "Student_teacherId_status_idx" ON "Student"("teacherId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialVersion_materialId_version_key" ON "MaterialVersion"("materialId", "version");

-- CreateIndex
CREATE INDEX "Activity_sessionId_order_idx" ON "Activity"("sessionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_sessionId_studentId_key" ON "RoomMember"("sessionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE INDEX "Invite_sessionId_studentId_idx" ON "Invite"("sessionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckResponse_checkId_studentId_key" ON "CheckResponse"("checkId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomReaction_sessionId_studentId_key" ON "RoomReaction"("sessionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceRevision_evidenceId_version_key" ON "EvidenceRevision"("evidenceId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimRevision_claimId_revision_key" ON "ClaimRevision"("claimId", "revision");

-- CreateIndex
CREATE INDEX "SessionEventOutbox_publishedAt_occurredAt_idx" ON "SessionEventOutbox"("publishedAt", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionEventOutbox_sessionId_seq_key" ON "SessionEventOutbox"("sessionId", "seq");

-- AddForeignKey
ALTER TABLE "TeacherOAuthIdentity" ADD CONSTRAINT "TeacherOAuthIdentity_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAuthSession" ADD CONSTRAINT "TeacherAuthSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGroup" ADD CONSTRAINT "StudentGroup_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGroupMember" ADD CONSTRAINT "StudentGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGroupMember" ADD CONSTRAINT "StudentGroupMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialVersion" ADD CONSTRAINT "MaterialVersion_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_primaryStudentId_fkey" FOREIGN KEY ("primaryStudentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardAttempt" ADD CONSTRAINT "BoardAttempt_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardAttempt" ADD CONSTRAINT "BoardAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardAttempt" ADD CONSTRAINT "BoardAttempt_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardAttempt" ADD CONSTRAINT "BoardAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickCheck" ADD CONSTRAINT "QuickCheck_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickCheck" ADD CONSTRAINT "QuickCheck_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckResponse" ADD CONSTRAINT "CheckResponse_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "QuickCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckResponse" ADD CONSTRAINT "CheckResponse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckResponse" ADD CONSTRAINT "CheckResponse_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMessage" ADD CONSTRAINT "RoomMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomReaction" ADD CONSTRAINT "RoomReaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomReaction" ADD CONSTRAINT "RoomReaction_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRevision" ADD CONSTRAINT "EvidenceRevision_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRevision" ADD CONSTRAINT "EvidenceRevision_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRevision" ADD CONSTRAINT "EvidenceRevision_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRevision" ADD CONSTRAINT "EvidenceRevision_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRevision" ADD CONSTRAINT "EvidenceRevision_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimRevision" ADD CONSTRAINT "ClaimRevision_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRequest" ADD CONSTRAINT "AIRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRequest" ADD CONSTRAINT "AIRequest_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRequest" ADD CONSTRAINT "AIRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEventOutbox" ADD CONSTRAINT "SessionEventOutbox_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEventOutbox" ADD CONSTRAINT "SessionEventOutbox_targetStudentId_fkey" FOREIGN KEY ("targetStudentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEventOutbox" ADD CONSTRAINT "SessionEventOutbox_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEventOutbox" ADD CONSTRAINT "SessionEventOutbox_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Immutable review provenance and audit rows: corrections append new revisions.
CREATE FUNCTION reject_immutable_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'immutable table: %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER evidence_revision_immutable BEFORE UPDATE OR DELETE ON "EvidenceRevision" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER claim_revision_immutable BEFORE UPDATE OR DELETE ON "ClaimRevision" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER board_attempt_immutable BEFORE UPDATE OR DELETE ON "BoardAttempt" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
ALTER TABLE "Annotation" ADD CONSTRAINT annotation_normalized_position CHECK (x >= 0 AND x <= 100 AND y >= 0 AND y <= 100 AND page >= 0);
ALTER TABLE "Evidence" ADD CONSTRAINT ai_aid_not_observation CHECK ((kind <> 'GoiYGiangDay' AND "sourceType" <> 'ai_suggestion') OR NOT "isObservation");
