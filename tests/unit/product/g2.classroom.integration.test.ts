import { test } from "node:test";
import { strict as assert } from "node:assert";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { SignJWT, decodeJwt } from "jose";
import { io } from "socket.io-client";
import { createApp } from "../../../server/app";
import { db, loadConfig } from "../../../server/context";

test(
  "classroom admission, socket isolation, board and end permissions",
  { skip: process.env.RUN_G2_INTEGRATION !== "1" },
  async () => {
    const config = loadConfig();
    const server = createApp(config).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const call = (
      path: string,
      token = "",
      method = "GET",
      body?: unknown,
      headers: Record<string, string> = {},
    ) =>
      fetch(`${base}/api/v1${path}`, {
        method,
        headers: {
          Origin: config.origin,
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(method === "GET"
            ? {}
            : { "Idempotency-Key": crypto.randomUUID() }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const sockets: ReturnType<typeof io>[] = [];
    try {
      const login = async (account: string) => {
        const r = await call("/auth/mock", "", "POST", { account });
        assert.equal(r.status, 200);
        return (await r.json()).accessToken as string;
      };
      const a = await login("teacher-a"),
        b = await login("teacher-b");
      const students = (await (await call("/students", a)).json()).students;
      assert.ok(students.length);
      const student2 = await call("/students", a, "POST", {
        name: "G2 second",
        grade: "9",
        subject: "Math",
        goal: "",
        notes: "",
        strengths: [],
        gaps: [],
        status: "active",
      });
      assert.equal(student2.status, 201);
      const student2id = (await student2.json()).student.id;
      const created = await call("/sessions", a, "POST", {
        studentIds: [students[0].id, student2id],
        title: "G2 test",
        goal: "private",
        sharedGoal: "public",
        date: "2026-11-01",
        time: "19:00",
        duration: 60,
        tools: { board: true, upload: true, check: true, chat: true },
      });
      assert.equal(created.status, 201);
      const session = (await created.json()).session;
      const id = session.id;
      const acts = await call(
        `/sessions/${id}/activities`,
        a,
        "PUT",
        [
          {
            title: "Practice",
            description: "",
            duration: 10,
            type: "LuyenTap",
            materialId: null,
            materialVersion: null,
            teacherNotes: null,
            sourceEvidenceIds: [],
            sourceClaimRefs: [],
          },
        ],
        { "If-Match-Version": String(session.version) },
      );
      assert.equal(acts.status, 200);
      assert.equal((await call(`/room/state?sessionId=${id}`, b)).status, 403);
      const inv = async (studentId: string) => {
        const r = await call(`/sessions/${id}/invites`, a, "POST", {
          studentId,
        });
        assert.equal(r.status, 201);
        return (await r.json()).rawToken as string;
      };
      const t1 = await inv(students[0].id),
        t2 = await inv(student2id);
      const invalid = await call("/room/invite-preview", "", "POST", {
        token: "invalid",
      });
      assert.equal(invalid.status, 401);
      assert.ok(!(await invalid.text()).includes("G2 test"));
      const join = async (token: string, name: string) => {
        const r = await call("/room/join-request", "", "POST", {
          token,
          name,
          consent: true,
        });
        assert.equal(r.status, 200);
        return r.json();
      };
      const g1 = await join(t1, "One"),
        g2 = await join(t2, "Two");
      const waiting = await (await call("/room/state", g1.accessToken)).json();
      assert.equal(waiting.waiting, true);
      assert.equal(waiting.session, undefined);
      const connect = async (token: string) => {
        const s = io(`${base}/classroom`, {
          auth: { token, sessionId: id },
          transports: ["websocket"],
          reconnection: false,
        });
        sockets.push(s);
        await new Promise<void>((resolve, reject) => {
          s.once("connect", () => resolve());
          s.once("connect_error", reject);
        });
        return s;
      };
      const rotated = await inv(students[0].id);
      assert.equal(
        (await call("/room/invite-preview", "", "POST", { token: t1 })).status,
        401,
      );
      assert.equal((await call("/room/state", g1.accessToken)).status, 200);
      const teacherSocket = await connect(a),
        studentSocket = await connect(g1.accessToken);
      let privateEvents = 0;
      studentSocket.on("classroom.event", (e: { type: string }) => {
        if (e.type === "member.join_requested") privateEvents++;
      });
      assert.equal(
        (
          await call(
            `/sessions/${id}/members/${g1.memberId}/admit`,
            a,
            "POST",
            { approved: true },
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await call(
            `/sessions/${id}/members/${g2.memberId}/admit`,
            a,
            "POST",
            { approved: true },
          )
        ).status,
        200,
      );
      assert.equal(
        (await call(`/sessions/${id}/start`, a, "POST", {})).status,
        200,
      );
      const room = await (await call("/room/state", g1.accessToken)).json();
      assert.equal(room.session.sharedGoal, "public");
      assert.equal(room.session.goal, undefined);
      const stroke = {
        id: crypto.randomUUID(),
        authorId: g1.studentId,
        color: "#111111",
        kind: "line",
        width: 3,
        points: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      };
      assert.equal(
        (
          await call(`/sessions/${id}/boards/own`, g1.accessToken, "PUT", {
            operation: "addStroke",
            stroke,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call(
            `/sessions/${id}/boards/${g1.studentId}`,
            g2.accessToken,
            "PUT",
            { operation: "clearOwnStrokes" },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await call(`/sessions/${id}/members/${g1.memberId}`, a, "PATCH", {
            canWrite: false,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call(`/sessions/${id}/boards/own`, g1.accessToken, "PUT", {
            operation: "clearOwnStrokes",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await call(`/sessions/${id}/messages`, g1.accessToken, "POST", {
            text: "still allowed",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await call(`/sessions/${id}/submissions`, g1.accessToken, "POST", {
            title: "text",
            answer: "allowed",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await call(`/sessions/${id}/members/${g1.memberId}`, a, "PATCH", {
            canWrite: true,
          })
        ).status,
        200,
      );
      const sharedStroke = (authorId: string) => ({
        ...stroke,
        id: crypto.randomUUID(),
        authorId,
      });
      const teacherId = (await (await call("/auth/me", a)).json()).teacher.id;
      const one = sharedStroke(g1.studentId),
        two = sharedStroke(teacherId),
        boardKey = crypto.randomUUID();
      const write = (token: string, item: typeof one, key: string) =>
        call(
          `/sessions/${id}/boards/common`,
          token,
          "PUT",
          { operation: "addStroke", stroke: item },
          { "Idempotency-Key": key },
        );
      const [w1, w2] = await Promise.all([
        write(g1.accessToken, one, boardKey),
        write(a, two, crypto.randomUUID()),
      ]);
      assert.equal(w1.status, 200);
      assert.equal(w2.status, 200);
      assert.equal((await write(g1.accessToken, one, boardKey)).status, 200);
      const state = await (await call(`/room/state?sessionId=${id}`, a)).json();
      const common = state.boards.find(
        (row: { ownerId: string }) => row.ownerId === "common",
      );
      assert.equal(
        common.strokes.filter((row: { id: string }) => row.id === one.id)
          .length,
        1,
      );
      assert.equal(
        common.strokes.filter((row: { id: string }) => row.id === two.id)
          .length,
        1,
      );
      const decoded = decodeJwt(g2.accessToken);
      const shortToken = await new SignJWT({
        sid: decoded.sid,
        tid: decoded.tid,
        ses: decoded.ses,
        mid: decoded.mid,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer("teaching-copilot")
        .setAudience("student")
        .setSubject(g2.studentId)
        .setIssuedAt()
        .setExpirationTime("2s")
        .sign(config.jwtSecret);
      const shortSocket = await connect(shortToken);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("expired socket still connected")),
          4000,
        );
        shortSocket.once("disconnect", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      const bytes = Buffer.from("%PDF-1.4\nprivate submission\n%%EOF\n");
      const intentResponse = await call(
        `/sessions/${id}/submissions/upload-intent`,
        g1.accessToken,
        "POST",
        {
          fileName: "answer.pdf",
          mimeType: "application/pdf",
          sizeBytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      );
      assert.equal(intentResponse.status, 201);
      const intent = await intentResponse.json();
      assert.equal(
        (await fetch(intent.uploadUrl, { method: "PUT", body: bytes })).status,
        200,
      );
      const payload = {
        title: "PDF answer",
        answer: "",
        uploadId: intent.uploadId,
      };
      assert.equal(
        (
          await call(
            `/sessions/${id}/submissions`,
            g2.accessToken,
            "POST",
            payload,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await call(`/sessions/${id}/submissions`, g1.accessToken, "POST", {
            ...payload,
            storageKey: "other",
          })
        ).status,
        400,
      );
      const key = crypto.randomUUID();
      const send = () =>
        call(`/sessions/${id}/submissions`, g1.accessToken, "POST", payload, {
          "Idempotency-Key": key,
        });
      const submitted = await send();
      assert.equal(submitted.status, 201);
      const submission = (await submitted.json()).submission;
      const retry = await send();
      assert.equal(retry.status, 201);
      assert.equal((await retry.json()).submission.id, submission.id);
      assert.equal(
        (await call(`/submissions/${submission.id}/read-url`, g2.accessToken))
          .status,
        403,
      );
      assert.equal(
        (await call(`/submissions/${submission.id}/read-url`, b)).status,
        403,
      );
      const signed = await call(`/submissions/${submission.id}/read-url`, a);
      assert.equal(signed.status, 200);
      assert.equal(
        Buffer.from(
          await (await fetch((await signed.json()).readUrl)).arrayBuffer(),
        ).toString(),
        bytes.toString(),
      );
      const invites = (await (await call(`/sessions/${id}/invites`, a)).json())
        .invites;
      const activeInvite = invites.find(
        (v: { studentId: string; revokedAt: string | null }) =>
          v.studentId === students[0].id && !v.revokedAt,
      );
      assert.ok(activeInvite);
      const disconnected = new Promise<void>((resolve) =>
        studentSocket.once("disconnect", () => resolve()),
      );
      assert.equal(
        (
          await call(
            `/sessions/${id}/invites/${activeInvite.id}/revoke`,
            a,
            "POST",
            {},
          )
        ).status,
        200,
      );
      await Promise.race([
        disconnected,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("socket remained connected")),
            3000,
          ),
        ),
      ]);
      assert.equal((await call("/room/state", g1.accessToken)).status, 401);
      assert.equal(
        (
          await call("/room/refresh", "", "POST", {
            refreshToken: g1.refreshToken,
          })
        ).status,
        401,
      );
      assert.ok(rotated);
      assert.equal(
        (await call(`/sessions/${id}/end`, a, "POST", {})).status,
        200,
      );
      assert.equal(
        (
          await call(`/sessions/${id}/boards/own`, g2.accessToken, "PUT", {
            operation: "clearOwnStrokes",
          })
        ).status,
        409,
      );
      assert.equal(
        (await call(`/sessions/${id}/start`, a, "POST", {})).status,
        409,
      );
      const evidenceResponse = await call(
        `/sessions/${id}/evidence`,
        a,
        "POST",
        {
          studentId: g2.studentId,
          kind: "GhiChu",
          title: "Observation",
          detail: "Completed exercise",
          support: "DocLap",
        },
      );
      assert.equal(evidenceResponse.status, 201);
      const evidence = (await evidenceResponse.json()).evidence;
      const draft = await call(`/sessions/${id}/claims/draft`, a, "POST", {
        studentId: g2.studentId,
        text: "Understands exercise",
        evidenceIds: [evidence.id],
      });
      assert.equal(draft.status, 201);
      const claim = (await draft.json()).claim;
      assert.equal(
        (await call(`/sessions/${id}/complete-review`, a, "POST", {})).status,
        400,
      );
      assert.equal(
        (
          await call(`/claims/${claim.id}/review`, a, "PATCH", {
            action: "approve",
            revision: claim.revision,
            evidenceIds: [evidence.id],
          })
        ).status,
        200,
      );
      assert.equal(
        (await call(`/sessions/${id}/complete-review`, a, "POST", {})).status,
        200,
      );
      const noop = await call(
        `/evidence/${evidence.id}`,
        a,
        "PATCH",
        { detail: evidence.detail },
        { "If-Match-Version": String(evidence.version) },
      );
      assert.equal(noop.status, 200);
      assert.equal((await noop.json()).evidence.version, evidence.version);
      const beforeCorrection = await (
        await call(`/room/state?sessionId=${id}`, a)
      ).json();
      assert.equal(beforeCorrection.session.status, "reviewed");
      assert.equal(
        beforeCorrection.claims.find((c: { id: string }) => c.id === claim.id)
          .status,
        "approved",
      );
      assert.equal(
        (
          await call(
            `/evidence/${evidence.id}`,
            a,
            "PATCH",
            { detail: "Corrected", reason: "Correction" },
            { "If-Match-Version": String(evidence.version) },
          )
        ).status,
        200,
      );
      const afterReview = await (
        await call(`/room/state?sessionId=${id}`, a)
      ).json();
      assert.equal(afterReview.session.status, "ended");
      assert.equal(
        afterReview.claims.find((c: { id: string }) => c.id === claim.id)
          .status,
        "pending",
      );
      assert.equal(privateEvents, 0);
      assert.ok(teacherSocket.connected);
    } finally {
      sockets.forEach((s) => s.disconnect());
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.$disconnect();
    }
  },
);
