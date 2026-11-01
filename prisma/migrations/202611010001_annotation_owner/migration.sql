ALTER TABLE "Annotation" ADD COLUMN "studentId" UUID;
UPDATE "Annotation" a SET "studentId" = candidates."studentId"
FROM (
  SELECT "sourceId", MIN("studentId"::text)::uuid AS "studentId"
  FROM "Evidence" WHERE "sourceType" = 'annotation' AND "sourceId" IS NOT NULL
  GROUP BY "sourceId" HAVING COUNT(DISTINCT "studentId") = 1
) candidates WHERE a.id::text = candidates."sourceId";
