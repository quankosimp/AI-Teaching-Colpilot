import "dotenv/config";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { Client } from "minio";
import { createApp } from "../../../server/app";
import { db, loadConfig } from "../../../server/context";

const enabled = process.env.RUN_G1_INTEGRATION === "1";
test(
  "local API isolates teachers, persists students and plans, rotates refresh and validates private uploads",
  { skip: !enabled },
  async () => {
    const config = loadConfig();
    const server = createApp(config).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/v1`;
    const call = (path: string, token?: string, init: RequestInit = {}) =>
      fetch(base + path, {
        ...init,
        headers: {
          Origin: config.origin,
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      });
    try {
      const login = async (account: string) => {
        const r = await call("/auth/mock", undefined, {
          method: "POST",
          body: JSON.stringify({ account }),
        });
        assert.equal(r.status, 200);
        return {
          token: (await r.json()).accessToken as string,
          cookie: r.headers.get("set-cookie")!.split(";")[0],
        };
      };
      const health = await call("/health");
      assert.equal(health.status, 200);
      assert.equal((await health.json()).status, "degraded");
      const a = await login("teacher-a"),
        b = await login("teacher-b");
      const studentsA = (await (await call("/students", a.token)).json())
        .students;
      const studentsB = (await (await call("/students", b.token)).json())
        .students;
      assert.ok(studentsA.length && studentsB.length);
      assert.equal(
        (await call(`/students/${studentsA[0].id}/history`, b.token)).status,
        403,
      );
      const sessionBody = {
        studentIds: [studentsA[0].id],
        title: "G1 integration",
        goal: "Private",
        sharedGoal: "Public",
        date: "2026-11-01",
        time: "19:00",
        duration: 60,
        tools: { board: true, upload: true, check: true, chat: true },
      };
      const key = crypto.randomUUID();
      const create = () =>
        call("/sessions", a.token, {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify(sessionBody),
        });
      const [s, duplicate] = await Promise.all([create(), create()]);
      assert.equal(s.status, 201);
      assert.equal(duplicate.status, 201);
      const session = (await s.json()).session;
      assert.equal((await duplicate.json()).session.id, session.id);
      assert.equal(
        (
          await call("/sessions", a.token, {
            method: "POST",
            headers: { "Idempotency-Key": key },
            body: JSON.stringify({ ...sessionBody, title: "different" }),
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await fetch(base + "/auth/refresh", {
            method: "POST",
            headers: { Origin: "https://attacker.example", Cookie: a.cookie },
          })
        ).status,
        403,
      );
      assert.equal((await call("/auth/google/start")).status, 503);
      assert.equal(
        (
          await call(`/sessions/${session.id}/ai/plan-suggestions`, a.token, {
            method: "POST",
            body: JSON.stringify({ studentId: studentsA[0].id }),
          })
        ).status,
        503,
      );
      assert.ok(
        (await (await call("/sessions", a.token)).json()).sessions.some(
          (x: { id: string }) => x.id === session.id,
        ),
      );
      assert.equal(
        (
          await call(`/sessions/${session.id}`, b.token, {
            method: "PATCH",
            headers: { "If-Match-Version": "1" },
            body: JSON.stringify({ title: "unauthorized" }),
          })
        ).status,
        403,
      );
      const bad = Buffer.from("not a pdf");
      const badIntentResponse = await call(
        "/materials/upload-intent",
        a.token,
        {
          method: "POST",
          body: JSON.stringify({
            fileName: "bad.pdf",
            mimeType: "application/pdf",
            sizeBytes: bad.length,
            sha256: createHash("sha256").update(bad).digest("hex"),
          }),
        },
      );
      assert.equal(badIntentResponse.status, 201);
      const badIntent = await badIntentResponse.json();
      assert.equal(
        (await fetch(badIntent.uploadUrl, { method: "PUT", body: bad })).status,
        200,
      );
      const badBody = {
        uploadId: badIntent.uploadId,
        title: "Bad",
        subject: "Toán",
        grade: "Lớp 9",
        topic: "Toán",
        level: "CoBan",
        kind: "PDF",
        description: "",
        source: "upload",
      };
      assert.equal(
        (
          await call("/materials", a.token, {
            method: "POST",
            headers: { "Idempotency-Key": crypto.randomUUID() },
            body: JSON.stringify(badBody),
          })
        ).status,
        400,
      );
      const bytes = Buffer.from("%PDF-1.4\nlocal-test\n%%EOF\n");
      const intentResponse = await call("/materials/upload-intent", a.token, {
        method: "POST",
        body: JSON.stringify({
          fileName: "a.pdf",
          mimeType: "application/pdf",
          sizeBytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        }),
      });
      assert.equal(intentResponse.status, 201);
      const intent = await intentResponse.json();
      assert.equal(
        (await fetch(intent.uploadUrl, { method: "PUT", body: bytes })).status,
        200,
      );
      const materialKey = crypto.randomUUID();
      const materialBody = {
        uploadId: intent.uploadId,
        title: "PDF",
        subject: "Toán",
        grade: "Lớp 9",
        topic: "Toán",
        level: "CoBan",
        kind: "PDF",
        description: "",
        source: "upload",
      };
      const submitMaterial = () =>
        call("/materials", a.token, {
          method: "POST",
          headers: { "Idempotency-Key": materialKey },
          body: JSON.stringify(materialBody),
        });
      const materialResponse = await submitMaterial();
      assert.equal(materialResponse.status, 201);
      const material = (await materialResponse.json()).material;
      const retry = await submitMaterial();
      assert.equal(retry.status, 201);
      assert.equal((await retry.json()).material.id, material.id);
      assert.equal(
        (
          await fetch(intent.uploadUrl, {
            method: "PUT",
            body: Buffer.from("changed"),
          })
        ).status,
        200,
      );
      assert.equal(
        (await call(`/materials/${material.id}/read-url`, b.token)).status,
        403,
      );
      const activities = await call(
        `/sessions/${session.id}/activities`,
        a.token,
        {
          method: "PUT",
          headers: { "If-Match-Version": "1" },
          body: JSON.stringify([
            {
              title: "Quan sát",
              description: "",
              duration: 20,
              type: "LuyenTap",
              materialId: material.id,
              materialVersion: 1,
              sourceEvidenceIds: [],
              sourceClaimRefs: [],
            },
          ]),
        },
      );
      assert.equal(activities.status, 200);
      const updated = (await activities.json()).session;
      const activityId = updated.Activity_sessionId_items[0].id;
      const annotation = await call(
        `/sessions/${session.id}/annotations`,
        a.token,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            activityId,
            materialId: material.id,
            materialVersion: 1,
            page: 0,
            x: 23,
            y: 42,
            text: "Quan sát",
            studentId: studentsA[0].id,
          }),
        },
      );
      assert.equal(annotation.status, 201);
      const saved = (await annotation.json()).annotation;
      assert.equal(saved.x, 23);
      assert.equal(saved.materialVersion, 1);
      const ev = await db.evidence.findFirst({
        where: { sourceId: saved.id, sourceType: "annotation" },
      });
      assert.equal(ev?.studentId, studentsA[0].id);
      assert.equal((await call(`/evidence/${ev!.id}`, b.token)).status, 403);
      const sourceResponse = await call(`/evidence/${ev!.id}`, a.token);
      assert.equal(sourceResponse.status, 200);
      assert.equal((await sourceResponse.json()).source.id, saved.id);
      const claim = await db.claim.create({
        data: {
          sessionId: session.id,
          studentId: studentsA[0].id,
          text: "Nhận định mẫu",
          evidenceIds: [ev!.id],
          status: "approved",
        },
      });
      const withSource = await call(
        `/sessions/${session.id}/activities`,
        a.token,
        {
          method: "PUT",
          headers: { "If-Match-Version": String(updated.version) },
          body: JSON.stringify([
            {
              id: activityId,
              title: "Quan sát",
              description: "",
              duration: 20,
              type: "LuyenTap",
              materialId: material.id,
              materialVersion: 1,
              sourceEvidenceIds: [ev!.id],
              sourceClaimRefs: [
                { claimId: claim.id, revision: claim.revision },
              ],
            },
          ]),
        },
      );
      assert.equal(withSource.status, 200);
      let detail = await (
        await call(`/sessions/${session.id}`, a.token)
      ).json();
      assert.equal(
        detail.session.Activity_sessionId_items[0].isSourceStale,
        false,
      );
      await db.claim.update({
        where: { id: claim.id },
        data: { status: "pending" },
      });
      detail = await (await call(`/sessions/${session.id}`, a.token)).json();
      assert.equal(
        detail.session.Activity_sessionId_items[0].isSourceStale,
        true,
      );
      const read = await call(`/materials/${material.id}/read-url`, a.token);
      assert.equal(read.status, 200);
      assert.deepEqual(
        Buffer.from(
          await (await fetch((await read.json()).readUrl)).arrayBuffer(),
        ),
        bytes,
      );
      const minio = new Client({
        endPoint: process.env.MINIO_ENDPOINT!,
        port: Number(process.env.MINIO_PORT),
        useSSL: false,
        accessKey: process.env.MINIO_ACCESS_KEY!,
        secretKey: process.env.MINIO_SECRET_KEY!,
      });
      const policy = await minio
        .getBucketPolicy(process.env.MINIO_BUCKET!)
        .catch(() => "");
      assert.ok(!policy);
      const refresh = await call("/auth/refresh", undefined, {
        method: "POST",
        headers: { Cookie: a.cookie },
      });
      assert.equal(refresh.status, 200);
      assert.equal(
        (
          await call("/auth/refresh", undefined, {
            method: "POST",
            headers: { Cookie: a.cookie },
          })
        ).status,
        401,
      );
      assert.equal((await call("/students", a.token)).status, 401);
    } finally {
      server.close();
      await once(server, "close");
      await db.$disconnect();
    }
  },
);
