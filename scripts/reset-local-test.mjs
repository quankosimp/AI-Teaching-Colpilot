import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const raw = process.env.TEST_DATABASE_URL;
const bucket = process.env.MINIO_TEST_BUCKET;
if (
  process.env.APP_MODE !== "test" ||
  !raw ||
  !bucket ||
  !bucket.endsWith("-test")
) {
  throw new Error(
    "Set APP_MODE=test, TEST_DATABASE_URL and a MINIO_TEST_BUCKET ending in -test.",
  );
}
const url = new URL(raw);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.port !== "55432" ||
  url.pathname !== "/copilot_test"
) {
  throw new Error(
    "Reset is restricted to the disposable copilot_test database on local port 55432.",
  );
}
const adminUrl = new URL(raw);
adminUrl.pathname = "/postgres";
const admin = new PrismaClient({
  datasources: { db: { url: adminUrl.toString() } },
});
try {
  const existing =
    await admin.$queryRaw`SELECT datname FROM pg_database WHERE datname = 'copilot_test'`;
  if (!existing.length)
    await admin.$executeRawUnsafe('CREATE DATABASE "copilot_test"');
} finally {
  await admin.$disconnect();
}
const environment = { ...process.env, DATABASE_URL: raw, MINIO_BUCKET: bucket };
const prisma = fileURLToPath(import.meta.resolve("prisma/build/index.js"));
const tsx = fileURLToPath(import.meta.resolve("tsx/cli"));
for (const args of [
  [prisma, "migrate", "reset", "--force", "--skip-seed"],
  [tsx, "server/seed.ts"],
]) {
  const result = spawnSync(process.execPath, args, {
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
