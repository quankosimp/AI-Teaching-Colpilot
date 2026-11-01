import { test } from "node:test";
import { strict as assert } from "node:assert";
import { once } from "node:events";
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
      assert.equal(privateEvents, 0);
      assert.ok(teacherSocket.connected);
    } finally {
      sockets.forEach((s) => s.disconnect());
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.$disconnect();
    }
  },
);
