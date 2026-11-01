DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Claim" WHERE id='30303030-3030-4030-8030-303030303030' AND status='pending' AND revision=2 AND "staleReason"='source_unverified') THEN RAISE EXCEPTION 'duplicate source claim not invalidated'; END IF;
 IF (SELECT status <> 'ended' OR "endedAt" IS NULL FROM "Session" WHERE id='44444444-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'review not reopened'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "ClaimRevision" WHERE "claimId"='30303030-3030-4030-8030-303030303030' AND reason='source_unverified') OR NOT EXISTS (SELECT 1 FROM "AuditLog" WHERE "targetId"='30303030-3030-4030-8030-303030303030' AND action='claim.source_unverified') THEN RAISE EXCEPTION 'migration audit missing'; END IF;
END $$;
