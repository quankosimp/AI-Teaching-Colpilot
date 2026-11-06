-- Preserve existing timings; an unestimated activity has no mandatory duration.
ALTER TABLE "Activity" ALTER COLUMN "duration" DROP NOT NULL;
ALTER TABLE "Activity" ADD COLUMN "materialStartPage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_materialStartPage_nonnegative"
  CHECK ("materialStartPage" >= 0 AND "materialStartPage" <= 9999);
