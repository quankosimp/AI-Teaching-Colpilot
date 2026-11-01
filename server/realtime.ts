import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  ClassroomReconnect,
  EventPayload,
  EventType,
  EventVisibility,
  RealtimeEnvelope,
  ResyncRequired,
  canReceiveEvent,
} from "../contracts/events.js";
import {
  db,
  verifyStudentToken,
  verifyTeacherToken,
  type AppConfig,
  type ClassroomActor,
} from "./context.js";

export type OutboxEventInput = {
  sessionId: string;
  type: z.infer<typeof EventType>;
  label: string;
  actorId: string;
  visibility: z.infer<typeof EventVisibility>;
  activityId?: string | null;
  materialId?: string | null;
  page?: number | null;
  sourceId?: string | null;
  resourceId?: string;
  version?: number;
};

export async function appendOutboxEvent(
  tx: Prisma.TransactionClient,
  input: OutboxEventInput,
) {
  const updated = await tx.session.update({
    where: { id: input.sessionId },
    data: { nextEventSeq: { increment: 1 } },
    select: { nextEventSeq: true },
  });
  const seq = updated.nextEventSeq - 1;
  const payload = EventPayload.parse({
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    ...(input.activityId ? { activityId: input.activityId } : {}),
    ...(input.version ? { version: input.version } : {}),
  });
  return tx.sessionEventOutbox.create({
    data: {
      sessionId: input.sessionId,
      seq,
      kind: input.type,
      label: input.label,
      actorId: input.actorId,
      shared: input.visibility.scope === "public",
      targetStudentId:
        input.visibility.scope === "student"
          ? input.visibility.studentId
          : null,
      activityId: input.activityId ?? null,
      materialId: input.materialId ?? null,
      page: input.page ?? null,
      sourceId: input.sourceId ?? null,
      payload: payload as Prisma.InputJsonValue,
    },
  });
}

type SocketPrincipal = {
  actor: ClassroomActor;
  sessionId: string;
  teacherId: string;
};

const activeIntegrations = new Set<{
  io: SocketIOServer;
  publish: (sessionId?: string) => Promise<void>;
  disconnectStudent: (sessionId: string, studentId: string) => void;
  disconnectTeacher: (teacherId: string, sessionIds?: string[]) => void;
}>();

export function triggerOutboxPublish(sessionId?: string) {
  for (const item of activeIntegrations) {
    void item.publish(sessionId).catch(() => {});
  }
}

export function disconnectStudentSockets(sessionId: string, studentId: string) {
  for (const item of activeIntegrations) {
    item.disconnectStudent(sessionId, studentId);
  }
}

export function disconnectTeacherSockets(
  teacherId: string,
  sessionIds?: string[],
) {
  for (const item of activeIntegrations) {
    item.disconnectTeacher(teacherId, sessionIds);
  }
}

function rowToVisibility(row: {
  shared: boolean;
  targetStudentId: string | null;
}): z.infer<typeof EventVisibility> {
  if (row.shared) return { scope: "public" };
  if (row.targetStudentId)
    return { scope: "student", studentId: row.targetStudentId };
  return { scope: "teacher" };
}

function rowToEnvelope(row: {
  id: string;
  sessionId: string;
  seq: number;
  kind: string;
  occurredAt: Date;
  actorId: string;
  payload: Prisma.JsonValue;
}): RealtimeEnvelope {
  return RealtimeEnvelope.parse({
    eventId: row.id,
    sessionId: row.sessionId,
    seq: row.seq,
    type: row.kind,
    occurredAt: row.occurredAt.toISOString(),
    actorId: row.actorId,
    payload: EventPayload.parse(
      typeof row.payload === "object" && row.payload !== null
        ? row.payload
        : {},
    ),
  });
}

async function revalidateSocketPrincipal(
  principal: SocketPrincipal,
): Promise<{
  valid: boolean;
  memberState?: string;
  sessionStatus?: string;
}> {
  if (principal.actor.role === "teacher") {
    const authSession = await db.teacherAuthSession.findUnique({
      where: { id: principal.actor.sessionId },
      include: { teacherIdRef: true },
    });
    if (
      !authSession ||
      authSession.revokedAt ||
      authSession.expiresAt <= new Date() ||
      authSession.teacherIdRef.status !== "active"
    )
      return { valid: false };
    return { valid: true };
  }
  const [grant, member, session] = await Promise.all([
    db.studentRoomSession.findUnique({
      where: { id: principal.actor.grantId },
    }),
    db.roomMember.findUnique({
      where: { id: principal.actor.memberId },
    }),
    db.session.findUnique({
      where: { id: principal.sessionId },
      select: { status: true },
    }),
  ]);
  if (
    !grant ||
    grant.revokedAt ||
    grant.expiresAt <= new Date() ||
    !member ||
    !session
  )
    return { valid: false };
  if (
    member.state === "left" &&
    session.status !== "ended" &&
    session.status !== "reviewed"
  )
    return { valid: false };
  return {
    valid: true,
    memberState: member.state,
    sessionStatus: session.status,
  };
}

function canSocketReceive(
  principal: SocketPrincipal,
  memberState: string | undefined,
  row: {
    shared: boolean;
    targetStudentId: string | null;
    kind: string;
  },
): boolean {
  const typeParsed = EventType.safeParse(row.kind);
  if (!typeParsed.success) return false;
  const visibility = rowToVisibility(row);
  if (principal.actor.role === "teacher") {
    return canReceiveEvent(
      { role: "teacher", teacherId: principal.actor.id },
      {
        teacherId: principal.teacherId,
        sessionId: principal.sessionId,
        visibility,
        type: typeParsed.data,
      },
    );
  }
  if (memberState === "waiting") {
    return (
      visibility.scope === "student" &&
      visibility.studentId === principal.actor.studentId &&
      (typeParsed.data === "member.admitted" ||
        typeParsed.data === "member.updated")
    );
  }
  return canReceiveEvent(
    {
      role: "student",
      teacherId: principal.actor.teacherId,
      sessionId: principal.actor.sessionId,
      studentId: principal.actor.studentId,
    },
    {
      teacherId: principal.teacherId,
      sessionId: principal.sessionId,
      visibility,
      type: typeParsed.data,
    },
  );
}

export function attachClassroomRealtime(
  httpServer: HttpServer,
  config: AppConfig,
) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.origin,
      credentials: true,
    },
  });
  const namespace = io.of("/classroom");
  const principals = new Map<string, SocketPrincipal>();

  const syncSocketRooms = (socket: Socket, principal: SocketPrincipal, memberState?: string) => {
    const publicRoom = `session:${principal.sessionId}:public`;
    if (principal.actor.role === "teacher") {
      void socket.join(publicRoom);
      void socket.join(`session:${principal.sessionId}:teacher`);
    } else {
      void socket.join(
        `session:${principal.sessionId}:student:${principal.actor.studentId}`,
      );
      if (memberState === "joined") {
        void socket.join(publicRoom);
      } else {
        void socket.leave(publicRoom);
      }
    }
  };

  const replaySince = async (
    socket: Socket,
    principal: SocketPrincipal,
    lastEventSeq: number,
  ) => {
    const status = await revalidateSocketPrincipal(principal);
    if (!status.valid) {
      socket.disconnect(true);
      return;
    }
    syncSocketRooms(socket, principal, status.memberState);
    const session = await db.session.findUnique({
      where: { id: principal.sessionId },
      select: { nextEventSeq: true },
    });
    if (!session) {
      socket.disconnect(true);
      return;
    }
    const maxSeq = Math.max(0, session.nextEventSeq - 1);
    if (lastEventSeq < 0 || lastEventSeq > maxSeq || maxSeq - lastEventSeq > 200) {
      const resync = ResyncRequired.parse({
        type: "room.resync_required",
        sessionId: principal.sessionId,
        lastEventSeq: maxSeq,
      });
      socket.emit("room.resync_required", resync);
      return;
    }
    const rows = await db.sessionEventOutbox.findMany({
      where: {
        sessionId: principal.sessionId,
        seq: { gt: lastEventSeq },
      },
      orderBy: { seq: "asc" },
    });
    for (const row of rows) {
      if (canSocketReceive(principal, status.memberState, row)) {
        socket.emit("classroom.event", rowToEnvelope(row));
      }
    }
  };

  namespace.use(async (socket, next) => {
    try {
      const rawAuthToken =
        (typeof socket.handshake.auth?.token === "string"
          ? socket.handshake.auth.token
          : undefined) ||
        (typeof socket.handshake.headers.authorization === "string" &&
        socket.handshake.headers.authorization.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);
      const requestedSessionId =
        typeof socket.handshake.auth?.sessionId === "string"
          ? socket.handshake.auth.sessionId
          : typeof socket.handshake.query?.sessionId === "string"
            ? socket.handshake.query.sessionId
            : "";
      if (!rawAuthToken || !z.uuid().safeParse(requestedSessionId).success)
        return next(new Error("UNAUTHORIZED"));

      const teacher = await verifyTeacherToken(rawAuthToken, config);
      if (teacher) {
        const session = await db.session.findUnique({
          where: { id: requestedSessionId },
          select: { id: true, teacherId: true },
        });
        if (!session || session.teacherId !== teacher.id)
          return next(new Error("PERMISSION_DENIED"));
        principals.set(socket.id, {
          actor: teacher,
          sessionId: session.id,
          teacherId: session.teacherId,
        });
        return next();
      }

      const student = await verifyStudentToken(rawAuthToken, config);
      if (student && student.sessionId === requestedSessionId) {
        const member = await db.roomMember.findUnique({
          where: { id: student.memberId },
          select: { state: true },
        });
        if (!member || member.state === "invited" || member.state === "left")
          return next(new Error("PERMISSION_DENIED"));
        principals.set(socket.id, {
          actor: student,
          sessionId: student.sessionId,
          teacherId: student.teacherId,
        });
        return next();
      }
      return next(new Error("UNAUTHORIZED"));
    } catch {
      return next(new Error("UNAUTHORIZED"));
    }
  });

  namespace.on("connection", async (socket) => {
    const principal = principals.get(socket.id);
    if (!principal) {
      socket.disconnect(true);
      return;
    }
    socket.on("disconnect", () => {
      principals.delete(socket.id);
    });
    const status = await revalidateSocketPrincipal(principal);
    if (!status.valid) {
      socket.disconnect(true);
      return;
    }
    syncSocketRooms(socket, principal, status.memberState);

    const rawSeq =
      socket.handshake.auth?.lastEventSeq ??
      socket.handshake.query?.lastEventSeq;
    if (rawSeq !== undefined) {
      const parsed = ClassroomReconnect.safeParse({
        sessionId: principal.sessionId,
        lastEventSeq: Number(rawSeq),
      });
      if (parsed.success) {
        await replaySince(socket, principal, parsed.data.lastEventSeq);
      }
    }

    socket.on("classroom.reconnect", async (payload: unknown) => {
      const parsed = ClassroomReconnect.safeParse(payload);
      if (!parsed.success || parsed.data.sessionId !== principal.sessionId)
        return;
      await replaySince(socket, principal, parsed.data.lastEventSeq);
    });
  });

  let publishing = false;
  let rerun = false;
  const publish = async (_onlySessionId?: string) => {
    if (publishing) {
      rerun = true;
      return;
    }
    publishing = true;
    try {
      do {
        rerun = false;
        const pending = await db.sessionEventOutbox.findMany({
          where: {
            publishedAt: null,
            publicationAttempts: { lt: 10 },
          },
          orderBy: [{ sessionId: "asc" }, { seq: "asc" }],
          take: 100,
        });
        for (const row of pending) {
          const now = new Date();
          try {
            const envelope = rowToEnvelope(row);
            for (const [socketId, socket] of namespace.sockets) {
              const principal = principals.get(socketId);
              if (!principal || principal.sessionId !== row.sessionId) continue;
              const status = await revalidateSocketPrincipal(principal);
              if (!status.valid) {
                socket.disconnect(true);
                continue;
              }
              syncSocketRooms(socket, principal, status.memberState);
              if (canSocketReceive(principal, status.memberState, row)) {
                socket.emit("classroom.event", envelope);
              }
            }
            await db.sessionEventOutbox.update({
              where: { id: row.id },
              data: {
                publishedAt: now,
                publicationAttempts: { increment: 1 },
                lastAttemptAt: now,
              },
            });
          } catch {
            await db.sessionEventOutbox
              .update({
                where: { id: row.id },
                data: {
                  publicationAttempts: { increment: 1 },
                  lastAttemptAt: now,
                },
              })
              .catch(() => {});
          }
        }
      } while (rerun);
    } finally {
      publishing = false;
    }
  };

  const timer = setInterval(() => {
    void publish().catch(() => {});
  }, 400);
  timer.unref();

  let closed = false;
  const shutdown = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    activeIntegrations.delete(handle);
    for (const [, socket] of namespace.sockets) {
      socket.disconnect(true);
    }
    io.engine?.close();
  };

  const handle = {
    io,
    publish,
    shutdown,
    disconnectStudent(sessionId: string, studentId: string) {
      for (const [socketId, socket] of namespace.sockets) {
        const principal = principals.get(socketId);
        if (
          principal &&
          principal.actor.role === "student" &&
          principal.sessionId === sessionId &&
          principal.actor.studentId === studentId
        ) {
          socket.disconnect(true);
        }
      }
    },
    disconnectTeacher(teacherId: string, sessionIds?: string[]) {
      for (const [socketId, socket] of namespace.sockets) {
        const principal = principals.get(socketId);
        if (
          principal &&
          principal.actor.role === "teacher" &&
          principal.actor.id === teacherId &&
          (!sessionIds || sessionIds.includes(principal.actor.sessionId))
        ) {
          socket.disconnect(true);
        }
      }
    },
  };
  activeIntegrations.add(handle);

  httpServer.on("close", shutdown);

  return handle;
}
