DO $$ BEGIN
 IF (SELECT "studentId" IS NOT NULL FROM "Annotation" WHERE id='77777777-7777-4777-8777-777777777777') THEN RAISE EXCEPTION 'inferred owner was retained'; END IF;
 IF (SELECT "studentId" IS NOT NULL FROM "Annotation" WHERE id='88888888-8888-4888-8888-888888888888') THEN RAISE EXCEPTION 'ambiguous owner was retained'; END IF;
 IF (SELECT "studentId" FROM "Annotation" WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') <> '22222222-2222-4222-8222-222222222222'::uuid THEN RAISE EXCEPTION 'direct owner lost'; END IF;
 IF (SELECT count(*) FROM "Claim" WHERE id IN ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','ffffffff-ffff-4fff-8fff-ffffffffffff') AND status='pending' AND revision=2 AND "staleReason"='source_unverified') <> 2 THEN RAISE EXCEPTION 'claims not invalidated'; END IF;
 IF (SELECT status <> 'ended' OR "endedAt" IS NULL FROM "Session" WHERE id='44444444-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'review not reopened'; END IF;
 IF (SELECT count(*) FROM "ClaimRevision" WHERE reason='source_unverified') <> 2 OR (SELECT count(*) FROM "AuditLog" WHERE action='claim.source_unverified') <> 2 THEN RAISE EXCEPTION 'migration history missing'; END IF;
END $$;
