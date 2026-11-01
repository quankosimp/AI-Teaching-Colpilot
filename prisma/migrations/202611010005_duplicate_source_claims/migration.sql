BEGIN;
-- Historical duplicate source observations may have escaped the old findFirst correction.
CREATE TEMP TABLE "DuplicateSourceClaim" ON COMMIT DROP AS
WITH linked AS (
  SELECT e.id,e."sessionId",e."studentId",e."sourceType",COALESCE(e."sourceId",e."submissionId"::text) AS source_id
  FROM "Evidence" e WHERE e."sourceType" IN ('submission','check_response') AND e.status <> 'deleted'
), duplicated AS (
  SELECT "sessionId","studentId","sourceType",source_id FROM linked WHERE source_id IS NOT NULL
  GROUP BY "sessionId","studentId","sourceType",source_id HAVING COUNT(*) > 1
)
SELECT DISTINCT c.* FROM "Claim" c JOIN linked e ON e.id::text = ANY(c."evidenceIds")
JOIN duplicated d ON d."sessionId"=e."sessionId" AND d."studentId"=e."studentId" AND d."sourceType"=e."sourceType" AND d.source_id=e.source_id
WHERE c.status='approved';
INSERT INTO "ClaimRevision" (id,"claimId",revision,text,"evidenceIds",status,"actorId",reason,"createdAt")
SELECT gen_random_uuid(),id,revision,text,"evidenceIds",status,'migration:duplicate_source','source_unverified',CURRENT_TIMESTAMP FROM "DuplicateSourceClaim" ON CONFLICT ("claimId",revision) DO NOTHING;
UPDATE "Claim" c SET status='pending',"staleReason"='source_unverified',revision=c.revision+1,"updatedAt"=CURRENT_TIMESTAMP FROM "DuplicateSourceClaim" u WHERE c.id=u.id;
INSERT INTO "AuditLog" (id,"workspaceId","actorId","actorRole",action,"targetType","targetId","sessionId","requestId",metadata,"createdAt")
SELECT gen_random_uuid(),t."workspaceId",'migration:duplicate_source','system','claim.source_unverified','claim',c.id::text,c."sessionId",'migration:duplicate_source','{"reasonCode":"source_unverified"}'::jsonb,CURRENT_TIMESTAMP FROM "DuplicateSourceClaim" c JOIN "Session" s ON s.id=c."sessionId" JOIN "Teacher" t ON t.id=s."teacherId";
UPDATE "Session" s SET status='ended',version=s.version+1,"updatedAt"=CURRENT_TIMESTAMP WHERE s.status='reviewed' AND EXISTS (SELECT 1 FROM "DuplicateSourceClaim" c WHERE c."sessionId"=s.id);
COMMIT;
