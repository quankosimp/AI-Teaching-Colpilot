CREATE TABLE "UploadIntent" (
  "id" UUID NOT NULL,
  "teacherId" UUID NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UploadIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UploadIntent_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UploadIntent_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760)
);
CREATE UNIQUE INDEX "UploadIntent_storageKey_key" ON "UploadIntent"("storageKey");
CREATE INDEX "UploadIntent_teacherId_expiresAt_idx" ON "UploadIntent"("teacherId", "expiresAt");
