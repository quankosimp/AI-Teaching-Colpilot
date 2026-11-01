-- Preserve plan provenance on idempotent retries; existing requests remain unverified.
ALTER TABLE "AIRequest" ADD COLUMN "sourceClaimRefs" JSONB NOT NULL DEFAULT '[]';
