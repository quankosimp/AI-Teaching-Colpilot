-- Tài liệu ghim cho lớp và trang đã dạy tới.
CREATE TABLE "GroupMaterial" (
    "groupId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT true,
    "lastPage" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupMaterial_pkey" PRIMARY KEY ("groupId", "materialId")
);
ALTER TABLE "GroupMaterial" ADD CONSTRAINT "GroupMaterial_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMaterial" ADD CONSTRAINT "GroupMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
