DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Claim" WHERE id='54545454-5454-4454-8454-545454545454' AND status='pending' AND revision=2 AND "staleReason"='source_unverified') THEN RAISE EXCEPTION 'historical duplicate claim on deleted source not invalidated'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "Claim" WHERE id='55555555-5555-4555-8555-555555555555' AND status='approved' AND revision=1) THEN RAISE EXCEPTION 'non-duplicate claim was incorrectly touched'; END IF;
 IF (SELECT status <> 'ended' OR "endedAt" IS NULL FROM "Session" WHERE id='44444444-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'review not reopened'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "ClaimRevision" WHERE "claimId"='54545454-5454-4454-8454-545454545454' AND reason='source_unverified') OR NOT EXISTS (SELECT 1 FROM "AuditLog" WHERE "targetId"='54545454-5454-4454-8454-545454545454' AND action='claim.source_unverified') THEN RAISE EXCEPTION 'migration audit missing'; END IF;
END $$;
