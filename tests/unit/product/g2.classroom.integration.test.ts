import { test } from "node:test";
import { strict as assert } from "node:assert";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { SignJWT, decodeJwt } from "jose";
import { io } from "socket.io-client";
import {
  appendOutboxEvent,
  triggerOutboxPublish,
} from "../../../server/realtime";
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
      const starts = await Promise.all([
        call(`/sessions/${id}/start`, a, "POST", {}),
        call(`/sessions/${id}/start`, a, "POST", {}),
      ]);
      assert.deepEqual(
        starts.map((r) => r.status),
        [200, 200],
      );
      assert.equal(
        await db.sessionEventOutbox.count({
          where: { sessionId: id, kind: "session.started" },
        }),
        1,
      );
      const room = await (await call("/room/state", g1.accessToken)).json();
      assert.equal(room.session.sharedGoal, "public");
      assert.equal(room.session.goal, undefined);
      const orderedRace = async (
        first: () => Promise<Response>,
        second: () => Promise<Response>,
      ) => {
        let unlock!: () => void;
        let signal!: () => void;
        const ready = new Promise<void>((r) => (signal = r));
        const gate = new Promise<void>((r) => (unlock = r));
        const holder = db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${id}::uuid FOR UPDATE`;
          signal();
          await gate;
        });
        await ready;
        const one = first();
        await new Promise((r) => setTimeout(r, 100));
        const two = second();
        await new Promise((r) => setTimeout(r, 100));
        unlock();
        await holder;
        return Promise.all([one, two]);
      };
      const teacherIdForTest = (await (await call("/auth/me", a)).json())
        .teacher.id;
      const siblingResponse = await call("/sessions", a, "POST", {
        studentIds: [g2.studentId],
        title: "Independent room",
        goal: "",
        sharedGoal: "",
        date: "2026-11-01",
        time: "19:00",
        duration: 60,
        tools: { board: true, upload: true, check: true, chat: true },
      });
      assert.equal(siblingResponse.status, 201);
      const siblingId = (await siblingResponse.json()).session.id;
      const captured: number[] = [];
      teacherSocket.on("classroom.event", (event: { seq: number }) =>
        captured.push(event.seq),
      );
      const injected = await db.$transaction(async (tx) => {
        const first = await appendOutboxEvent(tx, {
          sessionId: id,
          type: "board.updated",
          label: "blocked",
          actorId: teacherIdForTest,
          visibility: { scope: "public" },
        });
        const second = await appendOutboxEvent(tx, {
          sessionId: id,
          type: "board.updated",
          label: "after",
          actorId: teacherIdForTest,
          visibility: { scope: "public" },
        });
        await tx.sessionEventOutbox.update({
          where: { id: first.id },
          data: { payload: { resourceId: 42 } },
        });
        const independent = await appendOutboxEvent(tx, {
          sessionId: siblingId,
          type: "board.updated",
          label: "independent",
          actorId: teacherIdForTest,
          visibility: { scope: "public" },
        });
        return { first, second, independent };
      });
      triggerOutboxPublish(id);
      for (let n = 0; n < 40; n++) {
        const row = await db.sessionEventOutbox.findUniqueOrThrow({
          where: { id: injected.first.id },
        });
        if (row.publicationAttempts > 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.equal(
        (
          await db.sessionEventOutbox.findUniqueOrThrow({
            where: { id: injected.second.id },
          })
        ).publishedAt,
        null,
      );
      for (let n = 0; n < 40; n++) {
        if (
          (
            await db.sessionEventOutbox.findUniqueOrThrow({
              where: { id: injected.independent.id },
            })
          ).publishedAt
        )
          break;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.ok(
        (
          await db.sessionEventOutbox.findUniqueOrThrow({
            where: { id: injected.independent.id },
          })
        ).publishedAt,
      );
      await db.sessionEventOutbox.update({
        where: { id: injected.first.id },
        data: { payload: {} },
      });
      triggerOutboxPublish(id);
      for (let n = 0; n < 60; n++) {
        if (
          (
            await db.sessionEventOutbox.findUniqueOrThrow({
              where: { id: injected.second.id },
            })
          ).publishedAt
        )
          break;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.ok(
        (
          await db.sessionEventOutbox.findUniqueOrThrow({
            where: { id: injected.second.id },
          })
        ).publishedAt,
      );
      await new Promise((r) => setTimeout(r, 100));
      const sequence = captured.filter(
        (seq) => seq === injected.first.seq || seq === injected.second.seq,
      );
      assert.deepEqual(sequence, [injected.first.seq, injected.second.seq]);
      teacherSocket.emit("classroom.reconnect", {
        sessionId: id,
        lastEventSeq: injected.first.seq - 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.deepEqual(
        captured.filter(
          (seq) => seq === injected.first.seq || seq === injected.second.seq,
        ),
        sequence,
      );
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
      const [disabled, lateBoard] = await orderedRace(
        () =>
          call(`/sessions/${id}/members/${g1.memberId}`, a, "PATCH", {
            canWrite: false,
          }),
        () =>
          call(`/sessions/${id}/boards/own`, g1.accessToken, "PUT", {
            operation: "clearOwnStrokes",
          }),
      );
      assert.equal(disabled.status, 200);
      assert.equal(lateBoard.status, 403);
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
      assert.equal(
        (
          await call(`/sessions/${id}/boards/common`, a, "PUT", {
            operation: "clearOwnStrokes",
          })
        ).status,
        200,
      );
      const afterClear = await (
        await call(`/room/state?sessionId=${id}`, a)
      ).json();
      const remaining = afterClear.boards.find(
        (row: { ownerId: string }) => row.ownerId === "common",
      );
      assert.ok(
        remaining.strokes.some((row: { id: string }) => row.id === one.id),
      );
      assert.ok(
        !remaining.strokes.some((row: { id: string }) => row.id === two.id),
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
      const sessionState = await (
        await call(`/room/state?sessionId=${id}`, a)
      ).json();
      const activityId = sessionState.session.currentActivityId;
      const checkResult = await call(`/sessions/${id}/checks`, a, "POST", {
        activityId,
        question: "Race check",
      });
      assert.equal(checkResult.status, 201);
      const check = (await checkResult.json()).check;
      const [reply1, reply2] = await Promise.all([
        call(`/checks/${check.id}/responses`, g2.accessToken, "POST", {
          answer: "one",
        }),
        call(`/checks/${check.id}/responses`, g2.accessToken, "POST", {
          answer: "two",
        }),
      ]);
      assert.deepEqual([reply1.status, reply2.status].sort(), [201, 409]);
      const [closed, lateAnswer] = await orderedRace(
        () => call(`/checks/${check.id}`, a, "PATCH", { status: "closed" }),
        () =>
          call(`/checks/${check.id}/responses`, g1.accessToken, "POST", {
            answer: "late",
          }),
      );
      assert.equal(closed.status, 200);
      assert.equal(lateAnswer.status, 409);
      const [toggle1, toggle2] = await Promise.all([
        call(`/sessions/${id}/members/${g2.memberId}`, a, "PATCH", {
          toolOverrides: { chat: false },
        }),
        call(`/sessions/${id}/members/${g2.memberId}`, a, "PATCH", {
          toolOverrides: { upload: false },
        }),
      ]);
      assert.equal(toggle1.status, 200);
      assert.equal(toggle2.status, 200);
      const memberAfter = await db.roomMember.findUniqueOrThrow({
        where: { id: g2.memberId },
      });
      assert.deepEqual(memberAfter.toolOverrides, {
        chat: false,
        upload: false,
      });
      await call(`/sessions/${id}/members/${g2.memberId}`, a, "PATCH", {
        toolOverrides: { chat: true, upload: true },
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
      assert.equal(submission.storageKey, undefined);
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
      const badSource = await call(`/sessions/${id}/evidence`, a, "POST", {
        studentId: g2.studentId,
        kind: "BaiLam",
        title: "Wrong student",
        detail: "invalid",
        support: "DocLap",
        source: { type: "submission", id: submission.id, version: 1 },
      });
      assert.equal(badSource.status, 409);
      const badVersion = await call(`/sessions/${id}/evidence`, a, "POST", {
        studentId: g1.studentId,
        kind: "BaiLam",
        title: "Wrong version",
        detail: "invalid",
        support: "DocLap",
        source: { type: "submission", id: submission.id, version: 999 },
      });
      assert.equal(badVersion.status, 409);
      const grade = await call(
        `/submissions/${submission.id}/grade`,
        a,
        "PATCH",
        { feedback: "First grade", support: "DocLap" },
      );
      assert.equal(grade.status, 200);
      const graded = await grade.json();
      assert.equal(graded.submission.storageKey, undefined);
      const draftSource = await call(
        `/sessions/${id}/claims/draft`,
        a,
        "POST",
        {
          studentId: g1.studentId,
          text: "Source claim",
          evidenceIds: [graded.evidence.id],
        },
      );
      assert.equal(draftSource.status, 201);
      const sourceClaim = (await draftSource.json()).claim;
      const extraEvidenceResponse = await call(
        `/sessions/${id}/evidence`,
        a,
        "POST",
        {
          studentId: g1.studentId,
          kind: "BaiLam",
          title: "Additional source",
          detail: "Observed work",
          support: "DocLap",
          source: {
            type: "submission",
            id: submission.id,
            version: graded.submission.version,
          },
        },
      );
      assert.equal(extraEvidenceResponse.status, 201);
      const extraEvidence = (await extraEvidenceResponse.json()).evidence;
      const extraClaimResponse = await call(
        `/sessions/${id}/claims/draft`,
        a,
        "POST",
        {
          studentId: g1.studentId,
          text: "Additional source claim",
          evidenceIds: [extraEvidence.id],
        },
      );
      assert.equal(extraClaimResponse.status, 201);
      const extraClaim = (await extraClaimResponse.json()).claim;
      assert.equal(
        (
          await call(`/claims/${extraClaim.id}/review`, a, "PATCH", {
            action: "approve",
            revision: extraClaim.revision,
            evidenceIds: [extraEvidence.id],
          })
        ).status,
        200,
      );
      const sameGrade = await call(
        `/submissions/${submission.id}/grade`,
        a,
        "PATCH",
        { feedback: "First grade", support: "DocLap" },
      );
      assert.equal(sameGrade.status, 200);
      assert.equal(
        (await sameGrade.json()).submission.version,
        graded.submission.version,
      );
      assert.equal(
        await db.evidenceRevision.count({
          where: { evidenceId: extraEvidence.id },
        }),
        0,
      );

      const [sourceApproval, regrade] = await orderedRace(
        () =>
          call(`/claims/${sourceClaim.id}/review`, a, "PATCH", {
            action: "approve",
            revision: sourceClaim.revision,
            evidenceIds: [graded.evidence.id],
          }),
        () =>
          call(`/submissions/${submission.id}/grade`, a, "PATCH", {
            feedback: "Regraded",
            support: "CoGoiY",
          }),
      );
      assert.equal(sourceApproval.status, 200);
      assert.equal(regrade.status, 200);
      let sourceRoom = await (
        await call(`/room/state?sessionId=${id}`, a)
      ).json();
      let sourceCurrent = sourceRoom.claims.find(
        (c: { id: string }) => c.id === sourceClaim.id,
      );
      assert.equal(sourceCurrent.status, "pending");
      assert.equal(
        sourceRoom.claims.find((c: { id: string }) => c.id === extraClaim.id)
          .status,
        "pending",
      );
      assert.equal(
        await db.evidenceRevision.count({
          where: { evidenceId: extraEvidence.id },
        }),
        1,
      );

      assert.equal(
        sourceRoom.submissions.find(
          (x: { id: string }) => x.id === submission.id,
        ).storageKey,
        undefined,
      );
      const [sourceApproval2, relabel] = await orderedRace(
        () =>
          call(`/claims/${sourceClaim.id}/review`, a, "PATCH", {
            action: "approve",
            revision: sourceCurrent.revision,
            evidenceIds: [graded.evidence.id],
          }),
        () =>
          call(`/submissions/${submission.id}/relabel`, a, "PATCH", {
            studentId: g2.studentId,
            sessionId: id,
            activityId,
          }),
      );
      assert.equal(sourceApproval2.status, 200);
      assert.equal(relabel.status, 200);
      assert.equal((await relabel.json()).submission.storageKey, undefined);
      sourceRoom = await (await call(`/room/state?sessionId=${id}`, a)).json();
      sourceCurrent = sourceRoom.claims.find(
        (c: { id: string }) => c.id === sourceClaim.id,
      );
      assert.equal(sourceCurrent.status, "pending");
      assert.equal(
        (
          await call(`/claims/${sourceClaim.id}/review`, a, "PATCH", {
            action: "approve",
            revision: sourceCurrent.revision,
            evidenceIds: [graded.evidence.id],
          })
        ).status,
        400,
      );
      const material = await db.material.create({
        data: {
          teacherId,
          title: "Race material",
          subject: "Math",
          grade: "9",
          topic: "Race",
          level: "CoBan",
          kind: "PDF",
          description: "",
          source: "test",
          MaterialVersion_materialId_items: {
            create: { version: 1, uploadStatus: "ready", pages: [] },
          },
        },
      });
      await db.activity.update({
        where: { id: activityId },
        data: { materialId: material.id, materialVersion: 1 },
      });
      const annotationBody = {
        activityId,
        materialId: material.id,
        materialVersion: 1,
        page: 0,
        x: 10,
        y: 20,
        text: "First annotation",
        studentId: g2.studentId,
      };
      const firstAnnotation = await call(
        `/sessions/${id}/annotations`,
        a,
        "POST",
        annotationBody,
      );
      assert.equal(firstAnnotation.status, 201);
      const firstAnnotationData = await firstAnnotation.json();
      const wrongAnnotation = await call(
        `/sessions/${id}/evidence`,
        a,
        "POST",
        {
          studentId: g1.studentId,
          kind: "ChuThichDe",
          title: "wrong",
          detail: "wrong",
          support: "DocLap",
          source: {
            type: "annotation",
            id: firstAnnotationData.annotation.id,
            version: 1,
          },
        },
      );
      assert.equal(wrongAnnotation.status, 409);
      const sharedAnnotation = await call(
        `/sessions/${id}/annotations`,
        a,
        "POST",
        { ...annotationBody, studentId: undefined, text: "Common annotation" },
      );
      assert.equal(sharedAnnotation.status, 201);
      const commonId = (await sharedAnnotation.json()).annotation.id;
      const commonClaimSource = await call(
        `/sessions/${id}/evidence`,
        a,
        "POST",
        {
          studentId: g2.studentId,
          kind: "ChuThichDe",
          title: "wrong",
          detail: "wrong",
          support: "DocLap",
          source: { type: "annotation", id: commonId, version: 1 },
        },
      );
      assert.equal(commonClaimSource.status, 409);
      const annotationState = await (
        await call(`/room/state?sessionId=${id}`, a)
      ).json();
      const annotationEvidence = annotationState.evidence.find(
        (e: { kind: string; detail: string }) =>
          e.kind === "ChuThichDe" && e.detail === "First annotation",
      );
      assert.ok(annotationEvidence);
      const annotationClaimResponse = await call(
        `/sessions/${id}/claims/draft`,
        a,
        "POST",
        {
          studentId: g2.studentId,
          text: "Annotation claim",
          evidenceIds: [annotationEvidence.id],
        },
      );
      assert.equal(annotationClaimResponse.status, 201);
      const annotationClaim = (await annotationClaimResponse.json()).claim;
      const [annotationApproval, anotherAnnotation] = await orderedRace(
        () =>
          call(`/claims/${annotationClaim.id}/review`, a, "PATCH", {
            action: "approve",
            revision: annotationClaim.revision,
            evidenceIds: [annotationEvidence.id],
          }),
        () =>
          call(`/sessions/${id}/annotations`, a, "POST", {
            ...annotationBody,
            text: "Second annotation",
          }),
      );
      assert.equal(annotationApproval.status, 200);
      assert.equal(anotherAnnotation.status, 201);
      const annotationRoom = await (
        await call(`/room/state?sessionId=${id}`, a)
      ).json();
      assert.equal(
        annotationRoom.claims.find(
          (c: { id: string }) => c.id === annotationClaim.id,
        ).status,
        "approved",
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
      const [revoked, lateMessage] = await orderedRace(
        () =>
          call(
            `/sessions/${id}/invites/${activeInvite.id}/revoke`,
            a,
            "POST",
            {},
          ),
        () =>
          call(`/sessions/${id}/messages`, g1.accessToken, "POST", {
            text: "too late",
          }),
      );
      assert.equal(revoked.status, 200);
      assert.equal(lateMessage.status, 403);
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
      let release!: () => void;
      let locked!: () => void;
      const lockedSignal = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const releaseSignal = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${id}::uuid FOR UPDATE`;
        locked();
        await releaseSignal;
      });
      await lockedSignal;
      const end1 = call(`/sessions/${id}/end`, a, "POST", {});
      const end2 = call(`/sessions/${id}/end`, a, "POST", {});
      await new Promise((resolve) => setTimeout(resolve, 100));
      const late = call(`/sessions/${id}/boards/own`, g2.accessToken, "PUT", {
        operation: "clearOwnStrokes",
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      release();
      await blocker;
      const ends = await Promise.all([end1, end2]);
      assert.deepEqual(
        ends.map((r) => r.status),
        [200, 200],
      );
      assert.equal((await late).status, 409);
      assert.equal(
        await db.sessionEventOutbox.count({
          where: { sessionId: id, kind: "session.ended" },
        }),
        1,
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
      const extraPending = (
        await (await call(`/room/state?sessionId=${id}`, a)).json()
      ).claims.find((c: { id: string }) => c.id === extraClaim.id);
      assert.equal(
        (
          await call(`/claims/${extraClaim.id}/review`, a, "PATCH", {
            action: "reject",
            revision: extraPending.revision,
          })
        ).status,
        200,
      );
      const invalidatedSource = (
        await (await call(`/room/state?sessionId=${id}`, a)).json()
      ).claims.find((c: { id: string }) => c.id === sourceClaim.id);
      assert.equal(
        (
          await call(`/claims/${sourceClaim.id}/review`, a, "PATCH", {
            action: "reject",
            revision: invalidatedSource.revision,
          })
        ).status,
        200,
      );
      const relabeledDraft = await call(
        `/sessions/${id}/claims/draft`,
        a,
        "POST",
        {
          studentId: g2.studentId,
          text: "Relabeled source claim",
          evidenceIds: [graded.evidence.id],
        },
      );
      assert.equal(relabeledDraft.status, 201);
      const relabeledClaim = (await relabeledDraft.json()).claim;
      assert.equal(
        (
          await call(`/claims/${relabeledClaim.id}/review`, a, "PATCH", {
            action: "approve",
            revision: relabeledClaim.revision,
            evidenceIds: [graded.evidence.id],
          })
        ).status,
        200,
      );
      const relabeledDraft2 = await call(
        `/sessions/${id}/claims/draft`,
        a,
        "POST",
        {
          studentId: g2.studentId,
          text: "Second relabeled claim",
          evidenceIds: [extraEvidence.id],
        },
      );
      assert.equal(relabeledDraft2.status, 201);
      const relabeledClaim2 = (await relabeledDraft2.json()).claim;
      assert.equal(
        (
          await call(`/claims/${relabeledClaim2.id}/review`, a, "PATCH", {
            action: "approve",
            revision: relabeledClaim2.revision,
            evidenceIds: [extraEvidence.id],
          })
        ).status,
        200,
      );
      assert.equal(
        (await call(`/sessions/${id}/complete-review`, a, "POST", {})).status,
        200,
      );
      const noChange = await call(
        `/submissions/${submission.id}/grade`,
        a,
        "PATCH",
        { feedback: "Regraded", support: "CoGoiY" },
      );
      assert.equal(noChange.status, 200);
      const afterNoChange = await (
        await call(`/room/state?sessionId=${id}`, a)
      ).json();
      assert.equal(afterNoChange.session.status, "reviewed");
      assert.equal(
        afterNoChange.claims.find(
          (c: { id: string }) => c.id === relabeledClaim.id,
        ).status,
        "approved",
      );
      assert.equal(
        afterNoChange.claims.find(
          (c: { id: string }) => c.id === relabeledClaim2.id,
        ).status,
        "approved",
      );
      assert.equal(
        (
          await call(`/submissions/${submission.id}/grade`, a, "PATCH", {
            feedback: "Regraded",
            support: "CoGoiY",
            score: "9",
          })
        ).status,
        200,
      );
      const afterFirstCorrection = await (
        await call(`/room/state?sessionId=${id}`, a)
      ).json();
      assert.equal(afterFirstCorrection.session.status, "ended");
      for (const claimId of [relabeledClaim.id, relabeledClaim2.id]) {
        const row = afterFirstCorrection.claims.find(
          (c: { id: string }) => c.id === claimId,
        );
        assert.equal(row.status, "pending");
        assert.equal(
          (
            await call(`/claims/${claimId}/review`, a, "PATCH", {
              action: "approve",
              revision: row.revision,
              evidenceIds: row.evidenceIds,
            })
          ).status,
          200,
        );
      }
      const beforeRaceEnd = (
        await db.session.findUniqueOrThrow({ where: { id } })
      ).endedAt;
      const [finishRace, gradeRace] = await orderedRace(
        () => call(`/sessions/${id}/complete-review`, a, "POST", {}),
        () =>
          call(`/submissions/${submission.id}/grade`, a, "PATCH", {
            feedback: "Grade after completion",
            support: "DuocHuongDan",
          }),
      );
      assert.equal(finishRace.status, 200);
      assert.equal(gradeRace.status, 200);
      const afterGradeRace = await (
        await call(`/room/state?sessionId=${id}`, a)
      ).json();
      const reopenedClaim = afterGradeRace.claims.find(
        (c: { id: string }) => c.id === relabeledClaim.id,
      );
      assert.equal(afterGradeRace.session.status, "ended");
      assert.equal(reopenedClaim.status, "pending");
      const reopenedClaim2 = afterGradeRace.claims.find(
        (c: { id: string }) => c.id === relabeledClaim2.id,
      );
      assert.equal(reopenedClaim2.status, "pending");
      assert.equal(
        (
          await call(`/claims/${relabeledClaim2.id}/review`, a, "PATCH", {
            action: "reject",
            revision: reopenedClaim2.revision,
          })
        ).status,
        200,
      );
      assert.equal(
        new Date(afterGradeRace.session.endedAt).getTime(),
        beforeRaceEnd!.getTime(),
      );
      assert.equal(
        (
          await call(`/claims/${relabeledClaim.id}/review`, a, "PATCH", {
            action: "reject",
            revision: reopenedClaim.revision,
          })
        ).status,
        200,
      );
      const checkResponse = await db.checkResponse.findUniqueOrThrow({
        where: {
          checkId_studentId: { checkId: check.id, studentId: g2.studentId },
        },
      });
      const reviewedCheck = await call(
        `/checks/${check.id}/responses/${checkResponse.id}/review`,
        a,
        "POST",
        { feedback: "First feedback", support: "DocLap" },
      );
      assert.equal(reviewedCheck.status, 200);
      const checkEvidence = (await reviewedCheck.json()).evidence;
      const checkSourceVersion = (
        await db.checkResponse.findUniqueOrThrow({
          where: { id: checkResponse.id },
        })
      ).version;
      const extraCheckResponse = await call(
        `/sessions/${id}/evidence`,
        a,
        "POST",
        {
          studentId: g2.studentId,
          kind: "KiemTraDocLap",
          title: "Extra check observation",
          detail: "Observed",
          support: "DocLap",
          source: {
            type: "check_response",
            id: checkResponse.id,
            version: checkSourceVersion,
          },
        },
      );
      assert.equal(extraCheckResponse.status, 201);
      const extraCheck = (await extraCheckResponse.json()).evidence;
      const extraCheckClaimResponse = await call(
        `/sessions/${id}/claims/draft`,
        a,
        "POST",
        {
          studentId: g2.studentId,
          text: "Extra check claim",
          evidenceIds: [extraCheck.id],
        },
      );
      assert.equal(extraCheckClaimResponse.status, 201);
      const extraCheckClaim = (await extraCheckClaimResponse.json()).claim;
      assert.equal(
        (
          await call(`/claims/${extraCheckClaim.id}/review`, a, "PATCH", {
            action: "approve",
            revision: extraCheckClaim.revision,
            evidenceIds: [extraCheck.id],
          })
        ).status,
        200,
      );

      const repeatedCheck = await call(
        `/checks/${check.id}/responses/${checkResponse.id}/review`,
        a,
        "POST",
        { feedback: "First feedback", support: "DocLap" },
      );
      assert.equal(repeatedCheck.status, 200);
      assert.equal(
        (await repeatedCheck.json()).evidence.version,
        checkEvidence.version,
      );
      assert.equal(
        await db.evidenceRevision.count({
          where: { evidenceId: checkEvidence.id },
        }),
        0,
      );
      const checkClaimResult = await call(
        `/sessions/${id}/claims/draft`,
        a,
        "POST",
        {
          studentId: g2.studentId,
          text: "Check claim",
          evidenceIds: [checkEvidence.id],
        },
      );
      assert.equal(checkClaimResult.status, 201);
      const checkClaim = (await checkClaimResult.json()).claim;
      assert.equal(
        (
          await call(`/claims/${checkClaim.id}/review`, a, "PATCH", {
            action: "approve",
            revision: checkClaim.revision,
            evidenceIds: [checkEvidence.id],
          })
        ).status,
        200,
      );
      const oldEnd = (await db.session.findUniqueOrThrow({ where: { id } }))
        .endedAt;
      const [finishCheck, changeCheck] = await orderedRace(
        () => call(`/sessions/${id}/complete-review`, a, "POST", {}),
        () =>
          call(
            `/checks/${check.id}/responses/${checkResponse.id}/review`,
            a,
            "POST",
            { feedback: "Changed feedback", support: "CoGoiY" },
          ),
      );
      assert.equal(finishCheck.status, 200);
      assert.equal(changeCheck.status, 200);
      const checkAfter = await (
        await call(`/room/state?sessionId=${id}`, a)
      ).json();
      const changedClaim = checkAfter.claims.find(
        (c: { id: string }) => c.id === checkClaim.id,
      );
      assert.equal(checkAfter.session.status, "ended");
      assert.equal(changedClaim.status, "pending");
      const otherCheckClaim = checkAfter.claims.find(
        (c: { id: string }) => c.id === extraCheckClaim.id,
      );
      assert.equal(otherCheckClaim.status, "pending");
      assert.equal(
        await db.evidenceRevision.count({
          where: { evidenceId: extraCheck.id },
        }),
        1,
      );
      assert.equal(
        (
          await call(`/claims/${extraCheckClaim.id}/review`, a, "PATCH", {
            action: "reject",
            revision: otherCheckClaim.revision,
          })
        ).status,
        200,
      );

      assert.equal(
        new Date(checkAfter.session.endedAt).getTime(),
        oldEnd!.getTime(),
      );
      assert.equal(
        await db.evidenceRevision.count({
          where: { evidenceId: checkEvidence.id },
        }),
        1,
      );
      assert.equal(
        (
          await call(`/claims/${checkClaim.id}/review`, a, "PATCH", {
            action: "reject",
            revision: changedClaim.revision,
          })
        ).status,
        200,
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
      const pending = afterReview.claims.find(
        (c: { id: string }) => c.id === claim.id,
      );
      const [approval, correction] = await orderedRace(
        () =>
          call(`/claims/${claim.id}/review`, a, "PATCH", {
            action: "approve",
            revision: pending.revision,
            evidenceIds: [evidence.id],
          }),
        () =>
          call(
            `/evidence/${evidence.id}`,
            a,
            "PATCH",
            { detail: "Concurrent correction" },
            { "If-Match-Version": String(evidence.version + 1) },
          ),
      );
      assert.equal(correction.status, 200);
      assert.ok([200, 409].includes(approval.status));
      const postRace = await (
        await call(`/room/state?sessionId=${id}`, a)
      ).json();
      const racedClaim = postRace.claims.find(
        (c: { id: string }) => c.id === claim.id,
      );
      if (racedClaim.status === "pending")
        assert.equal(
          (
            await call(`/claims/${claim.id}/review`, a, "PATCH", {
              action: "approve",
              revision: racedClaim.revision,
              evidenceIds: [evidence.id],
            })
          ).status,
          200,
        );
      const [complete, newClaim] = await orderedRace(
        () => call(`/sessions/${id}/complete-review`, a, "POST", {}),
        () =>
          call(`/sessions/${id}/claims/draft`, a, "POST", {
            studentId: g2.studentId,
            text: "Another observation",
            evidenceIds: [evidence.id],
          }),
      );
      assert.ok([200, 400, 409].includes(complete.status));
      assert.equal(newClaim.status, 201);
      const finalState = await (
        await call(`/room/state?sessionId=${id}`, a)
      ).json();
      assert.ok(
        !(
          finalState.session.status === "reviewed" &&
          finalState.claims.some(
            (c: { status: string }) => c.status === "pending",
          )
        ),
      );
      const privateEvidence = await call(
        `/sessions/${id}/evidence`,
        a,
        "POST",
        {
          studentId: g1.studentId,
          kind: "GhiChu",
          title: "private observation",
          detail: "PRIVATE-ONLY-STUDENT-A",
          support: "DocLap",
        },
      );
      assert.equal(privateEvidence.status, 201);
      const privateId = (await privateEvidence.json()).evidence.id;
      const privateDraft = await call(
        `/sessions/${id}/claims/draft`,
        a,
        "POST",
        {
          studentId: g1.studentId,
          text: "PRIVATE-ONLY-STUDENT-A",
          evidenceIds: [privateId],
        },
      );
      assert.equal(privateDraft.status, 201);
      const privateClaim = (await privateDraft.json()).claim;
      assert.equal(
        (
          await call(`/claims/${privateClaim.id}/review`, a, "PATCH", {
            action: "approve",
            revision: privateClaim.revision,
            evidenceIds: [privateId],
          })
        ).status,
        200,
      );
      const next = await call(`/sessions/${id}/next-session`, a, "POST", {});
      assert.equal(next.status, 201);
      const nextId = (await next.json()).session.id;
      const nextActivity = await db.activity.findFirstOrThrow({
        where: { sessionId: nextId, teacherNotes: "PRIVATE-ONLY-STUDENT-A" },
      });
      assert.ok(!nextActivity.title.includes("PRIVATE-ONLY-STUDENT-A"));
      await db.activity.update({
        where: { id: nextActivity.id },
        data: {
          title: "Củng cố: PRIVATE-ONLY-STUDENT-A",
          description: "PRIVATE-ONLY-STUDENT-A",
        },
      });
      const nextInvite = await call(`/sessions/${nextId}/invites`, a, "POST", {
        studentId: g2.studentId,
      });
      const nextToken = (await nextInvite.json()).rawToken;
      const nextGrant = await join(nextToken, "Student B");
      assert.equal(
        (
          await call(
            `/sessions/${nextId}/members/${nextGrant.memberId}/admit`,
            a,
            "POST",
            { approved: true },
          )
        ).status,
        200,
      );
      assert.equal(
        (await call(`/sessions/${nextId}/start`, a, "POST", {})).status,
        200,
      );
      const bProjection = await (
        await call("/room/state", nextGrant.accessToken)
      ).text();
      assert.ok(!bProjection.includes("PRIVATE-ONLY-STUDENT-A"));
      assert.equal(privateEvents, 0);
      assert.ok(teacherSocket.connected);
    } finally {
      sockets.forEach((s) => s.disconnect());
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.$disconnect();
    }
  },
);
