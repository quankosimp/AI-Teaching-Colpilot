import { Router } from "express";
import { createOnce, lookupReplay } from "../idempotency.js";
import { Client } from "minio";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  MaterialInput,
  MAX_UPLOAD_BYTES,
  UploadIntent,
} from "../../contracts/api.js";
import {
  asyncRoute,
  audit,
  db,
  fail,
  requireTeacher,
  type AppConfig,
} from "../context.js";

export function storage() {
  const endpoint = process.env.MINIO_ENDPOINT,
    accessKey = process.env.MINIO_ACCESS_KEY,
    secretKey = process.env.MINIO_SECRET_KEY,
    bucket = process.env.MINIO_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket)
    throw new Error("Storage is not configured");
  if (
    ["production", "staging"].includes(process.env.APP_MODE || "") &&
    process.env.MINIO_USE_SSL !== "true"
  )
    throw new Error("Storage must use TLS outside local environments");
  return {
    bucket,
    client: new Client({
      endPoint: endpoint,
      port: Number(process.env.MINIO_PORT || 9000),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey,
      secretKey,
    }),
  };
}
function signature(mime: string, b: Buffer) {
  if (mime === "application/pdf")
    return b.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mime === "image/jpeg")
    return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  );
}
export function materialsRouter(config: AppConfig) {
  const r = Router();
  r.use(requireTeacher(config));
  r.get(
    "/materials",
    asyncRoute(async (_req, res) =>
      res.json({
        materials: await db.material.findMany({
          where: { teacherId: res.locals.actor.id, archivedAt: null },
          include: {
            MaterialVersion_materialId_items: {
              where: { uploadStatus: "ready" },
              orderBy: { version: "desc" },
              take: 1,
            },
          },
          orderBy: { createdAt: "desc" },
        }),
      }),
    ),
  );
  r.post(
    "/materials/upload-intent",
    asyncRoute(async (req, res) => {
      const parsed = UploadIntent.safeParse(req.body);
      if (!parsed.success)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Tệp không hợp lệ hoặc vượt 10 MiB",
        );
      const { client, bucket } = storage();
      const key = `${res.locals.actor.id}/${randomUUID()}`;
      const intent = await db.uploadIntent.create({
        data: {
          ...parsed.data,
          teacherId: res.locals.actor.id,
          storageKey: key,
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
      });
      return res.status(201).json({
        uploadId: intent.id,
        uploadUrl: await client.presignedPutObject(bucket, key, 600),
        expiresAt: intent.expiresAt,
      });
    }),
  );
  r.post(
    "/materials",
    asyncRoute(async (req, res) => {
      const parsed = MaterialInput.safeParse(req.body);
      if (
        !parsed.success ||
        !parsed.data.uploadId ||
        !z.uuid().safeParse(parsed.data.uploadId).success
      )
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Thông tin học liệu không hợp lệ",
        );
      const prior = await lookupReplay(req, res, "/materials");
      if (prior === null) return;
      if (prior)
        return res.status(201).json({
          material: await db.material.findUniqueOrThrow({
            where: { id: prior.resourceId },
          }),
        });
      const upload = await db.uploadIntent.findUnique({
        where: { id: parsed.data.uploadId },
      });
      if (!upload || upload.teacherId !== res.locals.actor.id)
        return fail(res, 403, "PERMISSION_DENIED", "Upload không khả dụng");
      if (upload.usedAt || upload.expiresAt <= new Date())
        return fail(
          res,
          409,
          "VERSION_CONFLICT",
          "Upload đã được sử dụng hoặc hết hạn",
        );
      const { client, bucket } = storage();
      if (
        (upload.mimeType === "application/pdf" && parsed.data.kind !== "PDF") ||
        (upload.mimeType !== "application/pdf" && parsed.data.kind !== "Anh")
      ) {
        await client.removeObject(bucket, upload.storageKey).catch(() => {});
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Loại học liệu không khớp tệp",
        );
      }
      const staged = await client
        .statObject(bucket, upload.storageKey)
        .catch(() => null);
      if (!staged)
        return fail(
          res,
          409,
          "VERSION_CONFLICT",
          "Upload không còn khả dụng hoặc chưa tải lên",
        );
      if (staged.size !== upload.sizeBytes || staged.size > MAX_UPLOAD_BYTES) {
        await client.removeObject(bucket, upload.storageKey).catch(() => {});
        return fail(res, 400, "UPLOAD_FAILED", "Tệp sai kích thước");
      }
      // Copy to a new server-only key first: the signed PUT can still mutate the staging key.
      const finalKey = `${res.locals.actor.id}/verified/${randomUUID()}`;
      let committed = false;
      try {
        try {
          await client.copyObject(
            bucket,
            finalKey,
            `/${bucket}/${upload.storageKey}`,
          );
        } catch {
          return fail(
            res,
            409,
            "VERSION_CONFLICT",
            "Upload không còn khả dụng; hãy tải lại",
          );
        }
        await client.removeObject(bucket, upload.storageKey).catch(() => {});
        const stat = await client
          .statObject(bucket, finalKey)
          .catch(() => null);
        if (
          !stat ||
          stat.size !== upload.sizeBytes ||
          stat.size > MAX_UPLOAD_BYTES
        )
          return fail(
            res,
            400,
            "UPLOAD_FAILED",
            "Tệp chưa tải lên hoặc sai kích thước",
          );
        const stream = await client.getObject(bucket, finalKey);
        const hash = createHash("sha256");
        let bytes = 0;
        let prefix = Buffer.alloc(0);
        for await (const chunk of stream) {
          const part = Buffer.from(chunk);
          bytes += part.length;
          if (bytes > MAX_UPLOAD_BYTES) {
            stream.destroy();
            return fail(res, 400, "UPLOAD_FAILED", "Tệp quá lớn");
          }
          if (prefix.length < 8)
            prefix = Buffer.concat([prefix, part]).subarray(0, 8);
          hash.update(part);
        }
        if (
          bytes !== upload.sizeBytes ||
          hash.digest("hex") !== upload.sha256 ||
          !signature(upload.mimeType, prefix)
        )
          return fail(
            res,
            400,
            "UPLOAD_FAILED",
            "Nội dung tệp không khớp loại hoặc mã kiểm tra",
          );
        const { uploadId: _uploadId, ...metadata } = parsed.data;
        const result = await createOnce(req, res, "/materials", async (tx) => {
          const claimed = await tx.uploadIntent.updateMany({
            where: {
              id: upload.id,
              teacherId: res.locals.actor.id,
              usedAt: null,
              expiresAt: { gt: new Date() },
            },
            data: { usedAt: new Date() },
          });
          if (!claimed.count) throw new Error("Upload already used");
          const material = await tx.material.create({
            data: {
              ...metadata,
              teacherId: res.locals.actor.id,
              MaterialVersion_materialId_items: {
                create: {
                  version: 1,
                  storageKey: finalKey,
                  mimeType: upload.mimeType,
                  sizeBytes: bytes,
                  sha256: upload.sha256,
                  pages: [],
                  uploadStatus: "ready",
                },
              },
            },
          });
          await tx.auditLog.create({
            data: {
              workspaceId: res.locals.actor.workspaceId,
              actorId: res.locals.actor.id,
              actorRole: "teacher",
              action: "material.created",
              targetType: "material",
              targetId: material.id,
              requestId: res.locals.requestId,
              metadata: {},
            },
          });
          return material.id;
        });
        if (!result) return;
        committed = !result.replay;
        return res.status(201).json({
          material: await db.material.findUniqueOrThrow({
            where: { id: result.resourceId },
          }),
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Upload already used")
          return fail(res, 409, "VERSION_CONFLICT", "Upload đã được sử dụng");
        throw error;
      } finally {
        if (!committed)
          await client.removeObject(bucket, finalKey).catch(() => {});
      }
    }),
  );
  r.get(
    "/materials/:id/read-url",
    asyncRoute(async (req, res) => {
      if (!z.uuid().safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const requestedVersion =
        req.query.version === undefined ? undefined : Number(req.query.version);
      if (
        requestedVersion !== undefined &&
        (!Number.isInteger(requestedVersion) || requestedVersion < 1)
      )
        return fail(res, 400, "VALIDATION_ERROR", "Phiên bản không hợp lệ");
      const material = await db.material.findUnique({
        where: { id: req.params.id },
      });
      if (!material)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy học liệu");
      if (material.teacherId !== res.locals.actor.id) {
        await audit(
          res.locals.actor,
          "security.denied",
          "material",
          material.id,
          res.locals.requestId,
        );
        return fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
      }
      const file = await db.materialVersion.findUnique({
        where: {
          materialId_version: {
            materialId: material.id,
            version: requestedVersion ?? material.currentVersion,
          },
        },
      });
      if (!file?.storageKey || file.uploadStatus !== "ready")
        return fail(res, 404, "NOT_FOUND", "Tệp chưa sẵn sàng");
      const { client, bucket } = storage();
      return res.json({
        readUrl: await client.presignedGetObject(bucket, file.storageKey, 300),
        version: file.version,
        mimeType: file.mimeType,
      });
    }),
  );
  return r;
}
