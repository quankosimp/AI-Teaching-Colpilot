-- Keep the already-applied 008 migration byte-for-byte unchanged.
ALTER TYPE "AIKind" ADD VALUE IF NOT EXISTS 'explain';
ALTER TYPE "AIKind" ADD VALUE IF NOT EXISTS 'leading_question';
ALTER TYPE "AIKind" ADD VALUE IF NOT EXISTS 'example';
ALTER TYPE "AIKind" ADD VALUE IF NOT EXISTS 'difficulty';
