-- AlterEnum
ALTER TYPE "AIKind" ADD VALUE IF NOT EXISTS 'explain';
ALTER TYPE "AIKind" ADD VALUE IF NOT EXISTS 'leading_question';
ALTER TYPE "AIKind" ADD VALUE IF NOT EXISTS 'example';
ALTER TYPE "AIKind" ADD VALUE IF NOT EXISTS 'difficulty';

-- AlterTable
ALTER TABLE "AIRequest" ADD COLUMN "editedText" TEXT,
ADD COLUMN "evidenceId" UUID;
