import "dotenv/config";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { Client } from "minio";
import { cleanupExpiredUploads } from "../../../server/cleanupUploads";
import { createApp } from "../../../server/app";
import { db, loadConfig } from "../../../server/context";
import {
  AuthResponse,
  StudentResponse,
  TeacherMeResponse,
} from "../../../contracts/api";

const enabled = process.env.RUN_G1_INTEGRATION === "1";
test(
  "G1 review: source eligibility, logout isolation, upload cleanup and races",
  { skip: !enabled },
  async () => {
    const cfg = loadConfig();
    const server = createApp(cfg).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/v1`;
    const call = (path: string, token?: string, init: RequestInit = {}) =>
      fetch(base + path, {
        ...init,
        headers: {
          Origin: cfg.origin,
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      });
    const login = async (account: string) => {
      const response = await call("/auth/mock", undefined, {
        method: "POST",
        body: JSON.stringify({ account }),
      });
      assert.equal(response.status, 200);
      return {
        token: AuthResponse.parse(await response.json()).accessToken,
        cookie: response.headers.get("set-cookie")!.split(";")[0],
      };
    };
    try {
      const a = await login("teacher-a"),
        a2 = await login("teacher-a"),
        b = await login("teacher-b");
      const who = TeacherMeResponse.parse(
        await (await call("/auth/me", a.token)).json(),
      ).teacher;
      const studentInput = {
        name: `Kiểm thử ${randomUUID()}`,
        grade: "Lớp 9",
        subject: "Toán",
        goal: "Goal",
        status: "active",
        strengths: [],
        gaps: [],
        notes: "",
      };
      const createStudent = await call("/students", a.token, {
        method: "POST",
        headers: { "Idempotency-Key": randomUUID() },
        body: JSON.stringify(studentInput),
      });
      assert.equal(createStudent.status, 201);
      const pupil = StudentResponse.parse(await createStudent.json()).student;
      assert.ok(pupil.initials && pupil.color);
      const plan = await call("/sessions", a.token, {
        method: "POST",
        headers: { "Idempotency-Key": randomUUID() },
        body: JSON.stringify({
          studentIds: [pupil.id],
          title: "Review",
          goal: "",
          sharedGoal: "",
          date: "2026-11-01",
          time: "19:00",
          duration: 60,
          tools: { board: true, upload: true, check: true, chat: true },
        }),
      });
      assert.equal(plan.status, 201);
      const session = (await plan.json()).session;
      const observation = await db.evidence.create({
        data: {
          studentId: pupil.id,
          sessionId: session.id,
          createdBy: who.id,
          kind: "GhiChu",
          title: "observation",
          detail: "seen",
          support: "DocLap",
          sourceType: "note",
          isObservation: true,
        },
      });
      const deleted = await db.evidence.create({
        data: {
          studentId: pupil.id,
          sessionId: session.id,
          createdBy: who.id,
          kind: "GhiChu",
          title: "deleted",
          detail: "old",
          support: "ChuaRo",
          sourceType: "note",
          isObservation: true,
          status: "deleted",
        },
      });
      const corrected = await db.evidence.create({
        data: {
          studentId: pupil.id,
          sessionId: session.id,
          createdBy: who.id,
          kind: "GhiChu",
          title: "corrected",
          detail: "old",
          support: "ChuaRo",
          sourceType: "note",
          isObservation: true,
          status: "corrected",
        },
      });
      const aid = await db.evidence.create({
        data: {
          studentId: pupil.id,
          sessionId: session.id,
          createdBy: who.id,
          kind: "GoiYGiangDay",
          title: "AI",
          detail: "aid",
          support: "ChuaRo",
          sourceType: "ai_suggestion",
          isObservation: false,
        },
      });
      const claim = async (evidenceIds: string[]) =>
        db.claim.create({
          data: {
            studentId: pupil.id,
            sessionId: session.id,
            text: "approved",
            evidenceIds,
            status: "approved",
          },
        });
      const valid = await claim([observation.id]);
      const empty = await claim([]);
      const gone = await claim([deleted.id]);
      const revised = await claim([corrected.id]);
      const onlyAid = await claim([aid.id]);
      const history = (
        await (await call(`/students/${pupil.id}/history`, a.token)).json()
      ).claims;
      assert.ok(history.some((item: { id: string }) => item.id === valid.id));
      for (const item of [empty, gone, revised, onlyAid])
        assert.ok(!history.some((row: { id: string }) => row.id === item.id));
      const activity = {
        title: "A",
        description: "",
        duration: 15,
        type: "LuyenTap",
        sourceEvidenceIds: [observation.id],
        sourceClaimRefs: [{ claimId: valid.id, revision: valid.revision }],
      };
      const put = (items: unknown[]) =>
        call(`/sessions/${session.id}/activities`, a.token, {
          method: "PUT",
          headers: { "If-Match-Version": "1" },
          body: JSON.stringify(items),
        });
      assert.equal(
        (await put([{ ...activity, sourceEvidenceIds: [] }])).status,
        403,
      );
      assert.equal(
        (
          await put([
            { ...activity, sourceClaimRefs: [] },
            { ...activity, sourceEvidenceIds: [] },
          ])
        ).status,
        403,
      );
      assert.equal(
        (
          await put([
            {
              ...activity,
              sourceEvidenceIds: [aid.id],
              sourceClaimRefs: [
                { claimId: onlyAid.id, revision: onlyAid.revision },
              ],
            },
          ])
        ).status,
        403,
      );
      assert.equal(
        (await put([{ ...activity, description: "nhập thực", duration: 75 }]))
          .status,
        200,
      );
      const result = await (
        await call(`/sessions/${session.id}`, a.token)
      ).json();
      assert.equal(result.session.Activity_sessionId_items[0].duration, 75);
      assert.equal(
        result.session.Activity_sessionId_items[0].description,
        "nhập thực",
      );
      const storage = new Client({
        endPoint: process.env.MINIO_ENDPOINT!,
        port: Number(process.env.MINIO_PORT),
        useSSL: false,
        accessKey: process.env.MINIO_ACCESS_KEY!,
        secretKey: process.env.MINIO_SECRET_KEY!,
      });
      const bucket = process.env.MINIO_BUCKET!;
      const list = async () => {
        const items: string[] = [];
        for await (const item of storage.listObjectsV2(
          bucket,
          `${who.id}/verified/`,
          true,
        ))
          if (item.name) items.push(item.name);
        return items.sort();
      };
      const bytes = Buffer.from("not a pdf");
      const intent = await (
        await call("/materials/upload-intent", a.token, {
          method: "POST",
          body: JSON.stringify({
            fileName: "bad.pdf",
            mimeType: "application/pdf",
            sizeBytes: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          }),
        })
      ).json();
      const stage = await db.uploadIntent.findUniqueOrThrow({
        where: { id: intent.uploadId },
      });
      await fetch(intent.uploadUrl, { method: "PUT", body: bytes });
      const before = await list();
      const metadata = {
        uploadId: intent.uploadId,
        title: "bad",
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
            headers: { "Idempotency-Key": randomUUID() },
            body: JSON.stringify(metadata),
          })
        ).status,
        400,
      );
      assert.deepEqual(await list(), before);
      assert.equal(
        await storage.statObject(bucket, stage.storageKey).then(
          () => true,
          () => false,
        ),
        false,
      );
      const wrongHashFile = Buffer.from("%PDF-1.4\nwrong hash\n%%EOF\n");
      const hashIntent = await (
        await call("/materials/upload-intent", a.token, {
          method: "POST",
          body: JSON.stringify({
            fileName: "wrong.pdf",
            mimeType: "application/pdf",
            sizeBytes: wrongHashFile.length,
            sha256: "a".repeat(64),
          }),
        })
      ).json();
      const hashStage = await db.uploadIntent.findUniqueOrThrow({
        where: { id: hashIntent.uploadId },
      });
      await fetch(hashIntent.uploadUrl, { method: "PUT", body: wrongHashFile });
      const beforeHash = await list();
      assert.equal(
        (
          await call("/materials", a.token, {
            method: "POST",
            headers: { "Idempotency-Key": randomUUID() },
            body: JSON.stringify({
              ...metadata,
              uploadId: hashIntent.uploadId,
            }),
          })
        ).status,
        400,
      );
      assert.deepEqual(await list(), beforeHash);
      assert.equal(
        await storage.statObject(bucket, hashStage.storageKey).then(
          () => true,
          () => false,
        ),
        false,
      );
      const good = Buffer.from("%PDF-1.4\n%%EOF\n");
      const goodIntent = await (
        await call("/materials/upload-intent", a.token, {
          method: "POST",
          body: JSON.stringify({
            fileName: "good.pdf",
            mimeType: "application/pdf",
            sizeBytes: good.length,
            sha256: createHash("sha256").update(good).digest("hex"),
          }),
        })
      ).json();
      await fetch(goodIntent.uploadUrl, { method: "PUT", body: good });
      const goodBody = {
        ...metadata,
        uploadId: goodIntent.uploadId,
        title: "good",
      };
      const goodStage = await db.uploadIntent.findUniqueOrThrow({
        where: { id: goodIntent.uploadId },
      });
      const beforeRace = await list();
      const submit = () =>
        call("/materials", a.token, {
          method: "POST",
          headers: { "Idempotency-Key": randomUUID() },
          body: JSON.stringify(goodBody),
        });
      const results = await Promise.all([submit(), submit()]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      assert.equal(
        (
          await call("/auth/logout", a.token, {
            method: "POST",
            headers: { Cookie: a2.cookie },
          })
        ).status,
        204,
      );
      assert.equal(
        (
          await call("/auth/refresh", undefined, {
            method: "POST",
            headers: { Cookie: a2.cookie },
          })
        ).status,
        401,
      );
      // A previously issued PUT can be reused until expiry; the targeted sweeper removes it afterward.
      const expiredKey = `${who.id}/${randomUUID()}`;
      await storage.putObject(bucket, expiredKey, Buffer.from("temporary"));
      const expired = await db.uploadIntent.create({
        data: {
          teacherId: who.id,
          storageKey: expiredKey,
          fileName: "late.pdf",
          mimeType: "application/pdf",
          sizeBytes: 9,
          sha256: "a".repeat(64),
          expiresAt: new Date(Date.now() - 120_000),
        },
      });
      await cleanupExpiredUploads(new Date(), [expired.id]);
      assert.equal(
        await storage.statObject(bucket, expiredKey).then(
          () => true,
          () => false,
        ),
        false,
      );
      assert.equal(
        await db.uploadIntent.findUnique({ where: { id: expired.id } }),
        null,
      );
      const a3 = await login("teacher-a");
      const otherLogout = await call("/auth/logout", a3.token, {
        method: "POST",
        headers: { Cookie: b.cookie },
      });
      assert.equal(otherLogout.status, 204);
      assert.equal(otherLogout.headers.get("set-cookie"), null);
      const bRefresh = await call("/auth/refresh", undefined, {
        method: "POST",
        headers: { Cookie: b.cookie },
      });
      assert.equal(bRefresh.status, 200);
      const bRefreshed = AuthResponse.parse(await bRefresh.json()).accessToken;
      const newCookie = bRefresh.headers.get("set-cookie")!.split(";")[0];
      // When access is lost, client refreshes with the cookie then logs out that fresh session.
      assert.equal(
        (
          await call("/auth/logout", bRefreshed, {
            method: "POST",
            headers: { Cookie: newCookie },
          })
        ).status,
        204,
      );
      assert.equal(
        (
          await call("/auth/refresh", undefined, {
            method: "POST",
            headers: { Cookie: newCookie },
          })
        ).status,
        401,
      );
    } finally {
      server.close();
      await once(server, "close");
      await db.$disconnect();
    }
  },
);
