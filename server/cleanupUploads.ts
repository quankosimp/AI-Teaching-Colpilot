import { db } from "./context.js";
import { storage } from "./routes/materials.js";

// Signed PUT URLs can be reused until expiry, so sweep their staging keys after
// expiry plus a small clock-skew margin. Never touch verified material keys.
export async function cleanupExpiredUploads(
  now = new Date(),
  onlyIntentIds?: string[],
) {
  const cutoff = new Date(now.getTime() - 60_000);
  const { client, bucket } = storage();
  const expired = await db.uploadIntent.findMany({
    where: {
      expiresAt: { lt: cutoff },
      ...(onlyIntentIds ? { id: { in: onlyIntentIds } } : {}),
    },
    select: { id: true, storageKey: true },
    take: 100,
  });
  for (const item of expired) {
    try {
      await client.removeObject(bucket, item.storageKey);
      await db.uploadIntent.deleteMany({
        where: { id: item.id, expiresAt: { lt: cutoff } },
      });
    } catch {
      // Keep the row for a later retry when storage is unavailable.
    }
  }
}
