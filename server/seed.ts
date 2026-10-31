import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "minio";
import { db, loadConfig } from "./context.js";

const config = loadConfig();
if (config.mode !== "local_mock" && config.mode !== "test")
  throw new Error("Seed is allowed only in local_mock/test");
const accounts = [
  {
    subject: "teacher-a",
    name: "Hoàng Nam",
    email: "nam.demo@example.invalid",
    student: "Nguyễn Bảo Minh",
  },
  {
    subject: "teacher-b",
    name: "Mai An",
    email: "an.demo@example.invalid",
    student: "Trần Thu Hà",
  },
];
for (const account of accounts) {
  const identity = await db.teacherOAuthIdentity.upsert({
    where: {
      provider_providerSubject: {
        provider: "mock",
        providerSubject: account.subject,
      },
    },
    update: {},
    create: {
      provider: "mock",
      providerSubject: account.subject,
      teacherIdRef: {
        create: {
          name: account.name,
          email: account.email,
          workspaceId: randomUUID(),
        },
      },
    },
  });
  const existing = await db.student.findFirst({
    where: { teacherId: identity.teacherId, name: account.student },
  });
  if (!existing)
    await db.student.create({
      data: {
        teacherId: identity.teacherId,
        name: account.student,
        grade: "Lớp 9",
        subject: "Toán",
        goal: "Củng cố kiến thức",
        status: "active",
        strengths: [],
        gaps: [],
        notes: "",
        initials: account.subject === "teacher-a" ? "BM" : "TH",
        color: "violet",
      },
    });
}
const endpoint = process.env.MINIO_ENDPOINT,
  accessKey = process.env.MINIO_ACCESS_KEY,
  secretKey = process.env.MINIO_SECRET_KEY,
  bucket = process.env.MINIO_BUCKET;
if (!endpoint || !accessKey || !secretKey || !bucket)
  throw new Error("MinIO configuration missing");
const client = new Client({
  endPoint: endpoint,
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey,
  secretKey,
});
if (!(await client.bucketExists(bucket))) await client.makeBucket(bucket);
console.log("Local demo teachers, students and private bucket are ready.");
await db.$disconnect();
