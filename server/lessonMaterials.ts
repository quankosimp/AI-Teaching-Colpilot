import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { LessonMaterialRef } from "../contracts/api.js";
import { SessionConflict } from "./sessionLock.js";

export async function lessonMaterialActivity(
  tx: Prisma.TransactionClient,
  teacherId: string,
  ref: z.infer<typeof LessonMaterialRef>,
  order: number,
) {
  const version = await tx.materialVersion.findFirst({
    where: {
      materialId: ref.materialId,
      version: ref.version,
      uploadStatus: "ready",
      materialIdRef: { teacherId, archivedAt: null },
    },
    select: { materialIdRef: { select: { title: true } } },
  });
  if (!version) throw new SessionConflict("PERMISSION_DENIED", "Tài liệu không còn khả dụng.");
  return {
    order,
    title: version.materialIdRef.title,
    description: "",
    duration: null,
    type: "LuyenTap" as const,
    materialId: ref.materialId,
    materialVersion: ref.version,
    sourceEvidenceIds: [],
    sourceClaimRefs: [],
  };
}
