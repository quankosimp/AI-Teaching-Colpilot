BEGIN;
-- The previous migration inferred ownership from evidence, which can be forged.
-- Existing source rows remain intact; inferred ownership is not authoritative.
CREATE TEMP TABLE "UntrustedAnnotation" (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO "UntrustedAnnotation" (id)
SELECT a.id FROM "Annotation" a
WHERE a."studentId" IS NOT NULL AND a."createdAt" <= COALESCE(
  (SELECT "finished_at" FROM "_prisma_migrations" WHERE migration_name = '202611010001_annotation_owner' AND "finished_at" IS NOT NULL ORDER BY "finished_at" DESC LIMIT 1),
  CURRENT_TIMESTAMP
);
CREATE TEMP TABLE "UntrustedClaim" ON COMMIT DROP AS
SELECT DISTINCT c.* FROM "Claim" c
JOIN "Evidence" e ON e.id::text = ANY(c."evidenceIds")
JOIN "UntrustedAnnotation" a ON a.id::text = e."sourceId"
WHERE c.status = 'approved' AND e."sourceType" = 'annotation';
INSERT INTO "ClaimRevision" (id,"claimId",revision,text,"evidenceIds",status,"actorId",reason,"createdAt")
SELECT gen_random_uuid(),id,revision,text,"evidenceIds",status,'migration:annotation_provenance','source_unverified',CURRENT_TIMESTAMP FROM "UntrustedClaim"
ON CONFLICT ("claimId",revision) DO NOTHING;
UPDATE "Claim" c SET status='pending',"staleReason"='source_unverified',revision=c.revision+1,"updatedAt"=CURRENT_TIMESTAMP FROM "UntrustedClaim" u WHERE c.id=u.id;
INSERT INTO "AuditLog" (id,"workspaceId","actorId","actorRole",action,"targetType","targetId","sessionId","requestId",metadata,"createdAt")
SELECT gen_random_uuid(),t."workspaceId",'migration:annotation_provenance','system','claim.source_unverified','claim',c.id::text,c."sessionId",'migration:annotation_provenance','{"reasonCode":"source_unverified"}'::jsonb,CURRENT_TIMESTAMP
FROM "UntrustedClaim" c JOIN "Session" s ON s.id=c."sessionId" JOIN "Teacher" t ON t.id=s."teacherId";
UPDATE "Session" s SET status='ended',version=s.version+1,"updatedAt"=CURRENT_TIMESTAMP WHERE s.status='reviewed' AND EXISTS (SELECT 1 FROM "UntrustedClaim" c WHERE c."sessionId"=s.id);
UPDATE "Annotation" a SET "studentId"=NULL FROM "UntrustedAnnotation" u WHERE a.id=u.id;

COMMIT;
