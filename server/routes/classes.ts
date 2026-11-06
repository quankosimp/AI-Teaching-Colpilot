import { Router, type Response } from "express";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { LessonMaterialRef, StudentAuthResponse } from "../../contracts/api.js";
import { lessonMaterialActivity } from "../lessonMaterials.js";
import { nextOccurrences, vnNowTime, vnToday } from "../../contracts/classes.js";
import { aiConsentState } from "../aiConsent.js";
import {
  asyncRoute,
  audit,
  db,
  fail,
  requireStudent,
  requireTeacher,
  type AppConfig,
  type StudentActor,
  type TeacherActor,
} from "../context.js";
import { createOnce } from "../idempotency.js";
import {
  appendOutboxEvent,
  disconnectStudentSockets,
  triggerOutboxPublish,
} from "../realtime.js";
import { lockSession, SessionConflict } from "../sessionLock.js";
import { signStudentAccess } from "./classroom.js";

/*
 * Lớp học: nhóm học sinh cố định của một gia sư, link vào lớp cố định cho từng em,
 * điểm danh (máy điền theo giờ vào lớp, gia sư xác nhận) và nộp bài bằng điện thoại.
 */

const safeId = z.uuid();
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");
const LATE_MS = 10 * 60_000;
const SHORT_MINUTES = 10;
const COLORS = ["violet", "sky", "emerald", "amber", "rose", "indigo", "teal"];

const Name = z.string().trim().min(1).max(80);
const GroupCreate = z.strictObject({
  name: Name,
  subject: z.string().trim().min(1).max(60),
  grade: z.string().trim().min(1).max(40),
  studentIds: z.array(z.uuid()).max(30).default([]),
  newStudents: z.array(Name).max(30).default([]),
});
const GroupPatch = z.strictObject({
  name: Name.optional(),
  subject: z.string().trim().min(1).max(60).optional(),
  grade: z.string().trim().min(1).max(40).optional(),
});
const MembersAdd = z.strictObject({
  studentIds: z.array(z.uuid()).max(30).default([]),
  newStudents: z.array(Name).max(30).default([]),
});
const GroupSessionCreate = z.strictObject({
  title: z.string().trim().max(160).optional(),
  date: z.iso.date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duration: z.number().int().min(15).max(300),
  studentIds: z.array(z.uuid()).min(1).max(5).optional(),
  status: z.enum(["draft", "scheduled"]).optional(),
  initialMaterial: LessonMaterialRef.optional(),
});
const AttendanceSave = z.strictObject({
  rows: z
    .array(
      z.strictObject({
        studentId: z.uuid(),
        present: z.boolean(),
        excused: z.boolean().optional(),
      }),
    ),
});
const LinkInput = z.strictObject({ token: z.string().min(10).max(200) });
const LinkJoin = z.strictObject({
  token: z.string().min(10).max(200),
  sessionId: z.uuid(),
  mode: z.enum(["join", "move", "submit"]).default("join"),
});

/* ---------- link cố định ---------- */
function linkSig(config: AppConfig, studentId: string, version: number) {
  return createHmac("sha256", Buffer.from(config.jwtSecret))
    .update(`student-link:${studentId}:${version}`)
    .digest("base64url")
    .slice(0, 32);
}
function linkUrl(
  config: AppConfig,
  student: { id: string; linkVersion: number },
) {
  const token = `${student.id}.${linkSig(config, student.id, student.linkVersion)}`;
  return `${config.origin}/?link=${encodeURIComponent(token)}`;
}
async function studentFromLink(config: AppConfig, token: string) {
  const [id, sig] = token.split(".");
  if (!id || !sig || !safeId.safeParse(id).success) return null;
  const student = await db.student.findUnique({ where: { id } });
  if (!student || student.status !== "active") return null;
  const expected = Buffer.from(linkSig(config, id, student.linkVersion));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null;
  return student;
}

/* ---------- điểm danh ---------- */
type MemberRow = {
  studentId: string;
  joinedAt: Date | null;
  leftAt: Date | null;
  attendance: string | null;
  excused: boolean;
};
type SessionRow = {
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
};
const isDone = (s: { status: string }) =>
  s.status === "ended" || s.status === "reviewed";
const isPresent = (m: MemberRow) =>
  m.attendance ? m.attendance === "present" : !!m.joinedAt;
function minutesIn(m: MemberRow, s: SessionRow, now = new Date()) {
  if (!m.joinedAt) return 0;
  const end = m.leftAt ?? s.endedAt ?? now;
  return Math.max(0, Math.round((end.getTime() - m.joinedAt.getTime()) / 60_000));
}
const isLate = (m: MemberRow, s: SessionRow) =>
  !!m.joinedAt &&
  !!s.startedAt &&
  m.joinedAt.getTime() - s.startedAt.getTime() > LATE_MS;
/** o = có mặt, l = muộn, e = vắng có phép, a = vắng không phép */
function mark(m: MemberRow, s: SessionRow) {
  if (isPresent(m)) return isLate(m, s) ? "l" : "o";
  return m.excused ? "e" : "a";
}
const sortKey = (s: { date: string; time: string }) => `${s.date} ${s.time}`;
function todayVN() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
}

export async function ownedGroup(id: string, actor: TeacherActor, res: Response) {
  if (!safeId.safeParse(id).success) {
    fail(res, 400, "VALIDATION_ERROR", "ID lớp không hợp lệ");
    return null;
  }
  const group = await db.studentGroup.findUnique({ where: { id } });
  if (group && group.teacherId !== actor.id) {
    await audit(actor, "security.denied", "student_group", id, res.locals.requestId);
    fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
    return null;
  }
  if (!group) {
    fail(res, 404, "NOT_FOUND", "Không tìm thấy lớp");
    return null;
  }
  return group;
}

const studentSelect = {
  id: true,
  name: true,
  initials: true,
  color: true,
  status: true,
  gaps: true,
  strengths: true,
  aiConsentAt: true,
  aiConsentRevokedAt: true,
} as const;
const groupInclude = {
  StudentGroupMember_groupId_items: {
    include: { studentIdRef: { select: studentSelect } },
  },
  Session_groupId_items: {
    select: {
      id: true,
      title: true,
      date: true,
      time: true,
      duration: true,
      status: true,
      startedAt: true,
      endedAt: true,
      attendanceConfirmedAt: true,
      Activity_sessionId_items: {
        select: { id: true, title: true, materialIdRef: { select: { title: true } } },
        orderBy: { order: "asc" as const },
      },
      Submission_sessionId_items: { select: { status: true } },
      RoomMember_sessionId_items: {
        select: {
          state: true,
          studentId: true,
          joinedAt: true,
          leftAt: true,
          attendance: true,
          excused: true,
        },
      },
    },
  },
} as const;
type GroupFull = Awaited<ReturnType<typeof loadGroups>>[number];
function loadGroups(teacherId: string, id?: string) {
  return db.studentGroup.findMany({
    where: { teacherId, ...(id ? { id } : {}) },
    include: groupInclude,
    orderBy: { createdAt: "asc" },
  });
}

function summarize(group: GroupFull) {
  const students = group.StudentGroupMember_groupId_items.map(
    (m) => m.studentIdRef,
  ).filter((s) => s.status === "active");
  const sessions = [...group.Session_groupId_items].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b)),
  );
  const done = sessions.filter(isDone);
  let slots = 0;
  let present = 0;
  for (const s of done)
    for (const m of s.RoomMember_sessionId_items) {
      slots += 1;
      if (isPresent(m)) present += 1;
    }
  const today = todayVN();
  const next =
    sessions.find((s) => s.status === "live") ??
    sessions.find(
      (s) =>
        (s.status === "draft" || s.status === "scheduled") && s.date >= today,
    ) ??
    null;
  const liveRow = sessions.find((s) => s.status === "live") ?? null;
  const schedule =
    group.scheduleDays.length && group.scheduleTime
      ? { days: [...group.scheduleDays].sort(), time: group.scheduleTime }
      : null;
  const planned = sessions.find(
    (s) => (s.status === "draft" || s.status === "scheduled") && s.date >= today,
  );
  const fromSchedule = schedule
    ? nextOccurrences(schedule.days, schedule.time, vnToday(), 1, vnNowTime())[0]
    : undefined;
  const nextAt =
    planned && (!fromSchedule || planned.date <= fromSchedule)
      ? { date: planned.date, time: planned.time, sessionId: planned.id }
      : fromSchedule && schedule
        ? { date: fromSchedule, time: schedule.time, sessionId: null }
        : null;
  const pendingSubmissions = done.reduce(
    (n, s) => n + s.Submission_sessionId_items.filter((x) => x.status !== "reviewed").length,
    0,
  );
  return {
    id: group.id,
    name: group.name,
    subject: group.subject,
    grade: group.grade,
    createdAt: group.createdAt,
    students: students.map(({ gaps: _g, strengths: _s, aiConsentAt: _a, aiConsentRevokedAt: _r, ...s }) => s),
    taught: done.length,
    attendance: { present, slots },
    next: next
      ? {
          id: next.id,
          title: next.title,
          date: next.date,
          time: next.time,
          duration: next.duration,
          status: next.status,
          activities: next.Activity_sessionId_items.length,
        }
      : null,
    unconfirmed: done.filter((s) => !s.attendanceConfirmedAt).length,
    schedule,
    nextAt,
    live: liveRow
      ? {
          sessionId: liveRow.id,
          startedAt: liveRow.startedAt,
          joined: liveRow.RoomMember_sessionId_items.filter((m) => m.state === "joined").length,
          total: liveRow.RoomMember_sessionId_items.length,
        }
      : null,
    pending: {
      unconfirmed: done.filter((s) => !s.attendanceConfirmedAt).length,
      submissions: pendingSubmissions,
    },
  };
}

type Note = { id: string; kind: "review" | "good" | null; text: string; date: string; sessionId: string };
function detail(group: GroupFull, notes: Map<string, Note[]> = new Map()) {
  const base = summarize(group);
  const roster = group.StudentGroupMember_groupId_items.map(
    (m) => m.studentIdRef,
  ).filter((s) => s.status === "active");
  const sessions = [...group.Session_groupId_items].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b)),
  );
  const done = sessions.filter(isDone);
  const students = roster.map((st) => {
    const marks = done.flatMap((s) => {
      const m = s.RoomMember_sessionId_items.find(
        (x) => x.studentId === st.id,
      );
      return m ? [mark(m, s)] : [];
    });
    const attended = marks.filter((x) => x === "o" || x === "l").length;
    return {
      id: st.id,
      name: st.name,
      initials: st.initials,
      color: st.color,
      recent: marks.slice(-6),
      attended,
      total: marks.length,
      gaps: st.gaps,
      strengths: st.strengths,
      notes: notes.get(st.id) ?? [],
      aiConsent: aiConsentState(st),
    };
  });
  const counts = new Map<string, string[]>();
  for (const st of roster)
    for (const g of st.gaps) {
      const key = g.trim();
      if (!key) continue;
      counts.set(key, [...(counts.get(key) ?? []), st.name]);
    }
  const gaps = [...counts.entries()]
    .map(([text, names]) => ({ text, names, count: names.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const list = [...sessions].reverse().map((s) => {
    const members = s.RoomMember_sessionId_items;
    const absent = members
      .filter((m) => !isPresent(m))
      .map((m) => roster.find((r) => r.id === m.studentId)?.name)
      .filter((n): n is string => !!n);
    return {
      id: s.id,
      title: s.title,
      date: s.date,
      time: s.time,
      duration: s.duration,
      status: s.status,
      invited: members.length,
      present: members.length - absent.length,
      absentNames: absent,
      attendanceConfirmed: !!s.attendanceConfirmedAt,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      used: [
        ...new Set(s.Activity_sessionId_items.map((a) => a.materialIdRef?.title || a.title)),
      ].slice(0, 3),
      pendingSubmissions: s.Submission_sessionId_items.filter((x) => x.status !== "reviewed").length,
    };
  });
  return { ...base, students, gaps, sessions: list };
}

async function createStudents(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  actor: TeacherActor,
  names: string[],
  grade: string,
  subject: string,
) {
  const ids: string[] = [];
  for (const [i, name] of names.entries()) {
    const created = await tx.student.create({
      data: {
        teacherId: actor.id,
        name,
        grade,
        subject,
        goal: "",
        strengths: [],
        gaps: [],
        notes: "",
        status: "active",
        initials:
          name
            .trim()
            .split(/\s+/)
            .slice(-2)
            .map((p) => p[0])
            .join("")
            .toUpperCase() || "HS",
        color: COLORS[(Date.now() + i) % COLORS.length],
      },
    });
    ids.push(created.id);
  }
  return ids;
}
async function checkOwnStudents(actor: TeacherActor, ids: string[]) {
  if (!ids.length) return true;
  const count = await db.student.count({
    where: { id: { in: ids }, teacherId: actor.id, status: "active" },
  });
  return count === new Set(ids).size;
}

export function classesRouter(config: AppConfig) {
  const r = Router();
  const teacher = requireTeacher(config);

  /* ===== Lớp (gia sư) ===== */
  r.get(
    "/groups",
    teacher,
    asyncRoute(async (_req, res) => {
      const groups = await loadGroups(res.locals.actor.id);
      return res.json({ groups: groups.map(summarize) });
    }),
  );

  r.post(
    "/groups",
    teacher,
    asyncRoute(async (req, res) => {
      const parsed = GroupCreate.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Thông tin lớp chưa hợp lệ");
      const actor: TeacherActor = res.locals.actor;
      const { name, subject, grade, studentIds, newStudents } = parsed.data;
      if (!(await checkOwnStudents(actor, studentIds)))
        return fail(res, 400, "VALIDATION_ERROR", "Có học sinh không hợp lệ");
      const result = await createOnce(req, res, "/groups", async (tx) => {
        const created = await createStudents(tx, actor, newStudents, grade, subject);
        const group = await tx.studentGroup.create({
          data: { teacherId: actor.id, name, subject, grade },
        });
        const all = [...new Set([...studentIds, ...created])];
        if (all.length)
          await tx.studentGroupMember.createMany({
            data: all.map((studentId) => ({ groupId: group.id, studentId })),
          });
        await tx.auditLog.create({
          data: {
            workspaceId: actor.workspaceId,
            actorId: actor.id,
            actorRole: "teacher",
            action: "group.created",
            targetType: "student_group",
            targetId: group.id,
            requestId: res.locals.requestId,
            metadata: { members: all.length },
          },
        });
        return group.id;
      });
      if (!result) return;
      const [group] = await loadGroups(actor.id, result.resourceId);
      return res.status(201).json({ group: detail(group) });
    }),
  );

  r.get(
    "/groups/:id",
    teacher,
    asyncRoute(async (req, res) => {
      const group = await ownedGroup(req.params.id, res.locals.actor, res);
      if (!group) return;
      const [full] = await loadGroups(res.locals.actor.id, group.id);
      // Điều cần nhớ của từng em: các nhận định đã duyệt trong lớp này, mới nhất trước.
      const claims = await db.claim.findMany({
        where: {
          status: "approved",
          resolvedAt: null,
          studentId: { in: full.StudentGroupMember_groupId_items.map((m) => m.studentId) },
          sessionIdRef: { groupId: full.id, teacherId: res.locals.actor.id },
        },
        orderBy: { reviewedAt: "desc" },
        select: { id: true, kind: true, studentId: true, text: true, sessionId: true, reviewedAt: true, updatedAt: true },
      });
      const notes = new Map<string, Note[]>();
      for (const c of claims) {
        const list = notes.get(c.studentId) ?? [];
        if (list.length < 20)
          list.push({
            id: c.id,
            kind: c.kind === "review" || c.kind === "good" ? c.kind : null,
            text: c.text,
            sessionId: c.sessionId,
            date: (c.reviewedAt ?? c.updatedAt).toISOString().slice(0, 10),
          });
        notes.set(c.studentId, list);
      }
      return res.json({ group: detail(full, notes) });
    }),
  );

  r.patch(
    "/groups/:id",
    teacher,
    asyncRoute(async (req, res) => {
      const group = await ownedGroup(req.params.id, res.locals.actor, res);
      if (!group) return;
      const parsed = GroupPatch.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Thông tin lớp chưa hợp lệ");
      await db.studentGroup.update({ where: { id: group.id }, data: parsed.data });
      const [full] = await loadGroups(res.locals.actor.id, group.id);
      return res.json({ group: detail(full) });
    }),
  );

  r.delete(
    "/groups/:id",
    teacher,
    asyncRoute(async (req, res) => {
      const group = await ownedGroup(req.params.id, res.locals.actor, res);
      if (!group) return;
      const used = await db.session.count({ where: { groupId: group.id } });
      if (used)
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Lớp đã có buổi học nên không xoá được",
        );
      await db.$transaction([
        db.studentGroupMember.deleteMany({ where: { groupId: group.id } }),
        db.studentGroup.delete({ where: { id: group.id } }),
      ]);
      return res.status(204).end();
    }),
  );

  r.post(
    "/groups/:id/members",
    teacher,
    asyncRoute(async (req, res) => {
      const group = await ownedGroup(req.params.id, res.locals.actor, res);
      if (!group) return;
      const parsed = MembersAdd.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Danh sách học sinh chưa hợp lệ");
      const actor: TeacherActor = res.locals.actor;
      if (!(await checkOwnStudents(actor, parsed.data.studentIds)))
        return fail(res, 400, "VALIDATION_ERROR", "Có học sinh không hợp lệ");
      await db.$transaction(async (tx) => {
        const created = await createStudents(
          tx,
          actor,
          parsed.data.newStudents,
          group.grade,
          group.subject,
        );
        const ids = [...new Set([...parsed.data.studentIds, ...created])];
        if (ids.length)
          await tx.studentGroupMember.createMany({
            data: ids.map((studentId) => ({ groupId: group.id, studentId })),
            skipDuplicates: true,
          });
      });
      const [full] = await loadGroups(actor.id, group.id);
      return res.json({ group: detail(full) });
    }),
  );

  r.delete(
    "/groups/:id/members/:studentId",
    teacher,
    asyncRoute(async (req, res) => {
      const group = await ownedGroup(req.params.id, res.locals.actor, res);
      if (!group) return;
      if (!safeId.safeParse(req.params.studentId).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID học sinh không hợp lệ");
      await db.studentGroupMember.deleteMany({
        where: { groupId: group.id, studentId: req.params.studentId },
      });
      const [full] = await loadGroups(res.locals.actor.id, group.id);
      return res.json({ group: detail(full) });
    }),
  );

  /** Lên buổi tiếp theo cho lớp: học sinh lấy từ lớp, nội dung soạn sau. */
  r.post(
    "/groups/:id/sessions",
    teacher,
    asyncRoute(async (req, res) => {
      const group = await ownedGroup(req.params.id, res.locals.actor, res);
      if (!group) return;
      const parsed = GroupSessionCreate.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Ngày giờ buổi học chưa hợp lệ");
      const actor: TeacherActor = res.locals.actor;
      const count = await db.session.count({ where: { groupId: group.id } });
      const title = parsed.data.title || `Buổi ${count + 1} · ${group.name}`;
      const { initialMaterial, status, studentIds } = parsed.data;
      const result = await createOnce(
        req,
        res,
        `/groups/${group.id}/sessions`,
        async (tx) => {
          const roster = await tx.studentGroupMember.findMany({
            where: { groupId: group.id, studentIdRef: { teacherId: actor.id, status: "active" } },
            select: { studentId: true },
            orderBy: { studentId: "asc" },
          });
          const eligible = new Set(roster.map((member) => member.studentId));
          const ids = studentIds ? [...new Set(studentIds)] : [...eligible];
          if (!ids.length)
            throw new SessionConflict("VALIDATION_ERROR", "Lớp này chưa có học sinh đang học.");
          if (ids.some((id) => !eligible.has(id)))
            throw new SessionConflict("VALIDATION_ERROR", "Có học sinh không thuộc danh sách đang học của lớp.");
          const session = await tx.session.create({
            data: {
              teacherId: actor.id,
              primaryStudentId: ids[0],
              groupId: group.id,
              groupName: group.name,
              title,
              status,
              goal: "",
              sharedGoal: "",
              date: parsed.data.date,
              time: parsed.data.time,
              duration: parsed.data.duration,
              tools: { board: true, upload: true, check: true, chat: true },
              completedActivityIds: [],
              dismissedSuggestionIds: [],
              RoomMember_sessionId_items: {
                create: ids.map((studentId) => ({ studentId })),
              },
              ...(initialMaterial && {
                Activity_sessionId_items: {
                  create: await lessonMaterialActivity(tx, actor.id, initialMaterial, 0),
                },
              }),
            },
          });
          await tx.auditLog.create({
            data: {
              workspaceId: actor.workspaceId,
              actorId: actor.id,
              actorRole: "teacher",
              action: "session.created",
              targetType: "session",
              targetId: session.id,
              requestId: res.locals.requestId,
              metadata: { groupId: group.id },
            },
          });
          return session.id;
        },
      );
      if (!result) return;
      return res.status(201).json({
        session: await db.session.findUniqueOrThrow({
          where: { id: result.resourceId },
          include: {
            Activity_sessionId_items: { orderBy: { order: "asc" } },
            RoomMember_sessionId_items: true,
          },
        }),
      });
    }),
  );

  /** Số bài nộp theo buổi, để trang Buổi học biết buổi nào còn bài cần chấm. */
  r.get(
    "/session-stats",
    teacher,
    asyncRoute(async (_req, res) => {
      const rows = await db.submission.groupBy({
        by: ["sessionId", "status"],
        where: { sessionIdRef: { teacherId: res.locals.actor.id } },
        _count: { _all: true },
      });
      const stats = new Map<string, { sessionId: string; submissions: number; pending: number }>();
      for (const row of rows) {
        const item = stats.get(row.sessionId) ?? { sessionId: row.sessionId, submissions: 0, pending: 0 };
        item.submissions += row._count._all;
        if (row.status !== "reviewed") item.pending += row._count._all;
        stats.set(row.sessionId, item);
      }
      const sessions = await db.session.findMany({
        where: { teacherId: res.locals.actor.id },
        select: { id: true, attendanceConfirmedAt: true },
      });
      return res.json({
        stats: sessions.map((s) => ({
          sessionId: s.id,
          submissions: stats.get(s.id)?.submissions ?? 0,
          pending: stats.get(s.id)?.pending ?? 0,
          attendanceConfirmed: !!s.attendanceConfirmedAt,
        })),
      });
    }),
  );

  /* ===== Link cố định của từng em (gia sư) ===== */
  r.get(
    "/students/:id/link",
    teacher,
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const student = await db.student.findFirst({
        where: { id: req.params.id, teacherId: res.locals.actor.id },
      });
      if (!student) return fail(res, 404, "NOT_FOUND", "Không tìm thấy học sinh");
      return res.json({ url: linkUrl(config, student) });
    }),
  );
  r.post(
    "/students/:id/link/rotate",
    teacher,
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const owned = await db.student.findFirst({
        where: { id: req.params.id, teacherId: res.locals.actor.id },
      });
      if (!owned) return fail(res, 404, "NOT_FOUND", "Không tìm thấy học sinh");
      const student = await db.student.update({
        where: { id: owned.id },
        data: { linkVersion: { increment: 1 } },
      });
      await audit(
        res.locals.actor,
        "student.link_rotated",
        "student",
        student.id,
        res.locals.requestId,
      );
      return res.json({ url: linkUrl(config, student) });
    }),
  );

  /* ===== Điểm danh (gia sư) ===== */
  r.get(
    "/sessions/:id/attendance",
    teacher,
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const session = await db.session.findUnique({
        where: { id: req.params.id },
        include: {
          RoomMember_sessionId_items: {
            include: {
              studentIdRef: {
                select: { id: true, name: true, initials: true, color: true },
              },
            },
          },
        },
      });
      if (!session || session.teacherId !== res.locals.actor.id)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy buổi học");
      const rows = session.RoomMember_sessionId_items.map((m) => {
        const minutes = minutesIn(m, session);
        return {
          studentId: m.studentId,
          name: m.studentIdRef.name,
          initials: m.studentIdRef.initials,
          color: m.studentIdRef.color,
          joinedAt: m.joinedAt,
          leftAt: m.leftAt,
          minutes,
          late: isLate(m, session),
          lateMinutes:
            m.joinedAt && session.startedAt
              ? Math.round(
                  (m.joinedAt.getTime() - session.startedAt.getTime()) / 60_000,
                )
              : 0,
          short: !!m.joinedAt && !!m.leftAt && minutes < SHORT_MINUTES,
          autoPresent: !!m.joinedAt,
          present: isPresent(m),
          excused: m.excused,
        };
      });
      rows.sort((a, b) => Number(b.autoPresent) - Number(a.autoPresent));
      return res.json({
        sessionId: session.id,
        title: session.title,
        groupName: session.groupName,
        date: session.date,
        time: session.time,
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        confirmedAt: session.attendanceConfirmedAt,
        rows,
      });
    }),
  );
  r.put(
    "/sessions/:id/attendance",
    teacher,
    asyncRoute(async (req, res) => {
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const parsed = AttendanceSave.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Bảng điểm danh chưa hợp lệ");
      const session = await db.session.findUnique({ where: { id: req.params.id } });
      if (!session || session.teacherId !== res.locals.actor.id)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy buổi học");
      if (session.status === "draft" || session.status === "scheduled")
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Buổi học chưa bắt đầu nên chưa điểm danh được",
        );
      await db.$transaction(async (tx) => {
        const rows = new Map(parsed.data.rows.map((row) => [row.studentId, row]));
        for (const [present, excused] of [[true, false], [false, true], [false, false]]) {
          const studentIds = [...rows.values()]
            .filter((row) => row.present === present && (row.present ? false : !!row.excused) === excused)
            .map((row) => row.studentId);
          if (!studentIds.length) continue;
          await tx.roomMember.updateMany({
            where: { sessionId: session.id, studentId: { in: studentIds } },
            data: { attendance: present ? "present" : "absent", excused },
          });
        }
        await tx.session.update({
          where: { id: session.id },
          data: { attendanceConfirmedAt: new Date() },
        });
      });
      await audit(
        res.locals.actor,
        "attendance.confirmed",
        "session",
        session.id,
        res.locals.requestId,
        session.id,
      );
      return res.json({ ok: true });
    }),
  );

  /* ===== Link cố định (học sinh, không cần đăng nhập) ===== */
  r.post(
    "/room/link-preview",
    asyncRoute(async (req, res) => {
      const parsed = LinkInput.safeParse(req.body);
      const student = parsed.success
        ? await studentFromLink(config, parsed.data.token)
        : null;
      if (!student)
        return fail(
          res,
          401,
          "INVITE_INVALID",
          "Link vào lớp không đúng hoặc đã được đổi. Em xin link mới từ thầy cô nhé.",
        );
      const members = await db.roomMember.findMany({
        where: {
          studentId: student.id,
          sessionIdRef: {
            teacherId: student.teacherId,
            status: { in: ["draft", "scheduled", "live"] },
          },
        },
        include: {
          sessionIdRef: {
            select: {
              id: true,
              title: true,
              date: true,
              time: true,
              duration: true,
              status: true,
              startedAt: true,
              groupName: true,
            },
          },
        },
      });
      const sessions = members
        .map((m) => ({ member: m, s: m.sessionIdRef }))
        .sort((a, b) => sortKey(a.s).localeCompare(sortKey(b.s)));
      const liveRow = sessions.find((x) => x.s.status === "live");
      const today = todayVN();
      const nextRow = sessions.find(
        (x) => x.s.status !== "live" && x.s.date >= today,
      );
      let inClass = false;
      if (liveRow && liveRow.member.state === "joined") {
        inClass =
          (await db.studentRoomSession.count({
            where: {
              memberId: liveRow.member.id,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
          })) > 0;
      }
      const pick = (x?: (typeof sessions)[number]) =>
        x
          ? {
              sessionId: x.s.id,
              title: x.s.title,
              groupName: x.s.groupName,
              date: x.s.date,
              time: x.s.time,
              duration: x.s.duration,
              startedAt: x.s.startedAt,
            }
          : null;
      return res.json({
        student: { name: student.name, initials: student.initials },
        live: liveRow ? { ...pick(liveRow), inClass } : null,
        next: pick(nextRow),
      });
    }),
  );

  r.post(
    "/room/link-join",
    asyncRoute(async (req, res) => {
      const parsed = LinkJoin.safeParse(req.body);
      if (!parsed.success)
        return fail(res, 400, "VALIDATION_ERROR", "Yêu cầu vào lớp không hợp lệ");
      const student = await studentFromLink(config, parsed.data.token);
      if (!student)
        return fail(
          res,
          401,
          "INVITE_INVALID",
          "Link vào lớp không đúng hoặc đã được đổi",
        );
      const member = await db.roomMember.findFirst({
        where: { sessionId: parsed.data.sessionId, studentId: student.id },
        include: { sessionIdRef: true },
      });
      if (!member || member.sessionIdRef.teacherId !== student.teacherId)
        return fail(res, 404, "NOT_FOUND", "Em không có trong buổi học này");
      const session = member.sessionIdRef;
      if (session.status !== "live")
        return fail(
          res,
          409,
          "SESSION_NOT_LIVE",
          "Buổi học chưa bắt đầu, em đợi thầy cô mở lớp nhé",
        );
      const mode = parsed.data.mode;
      const teacherRow = await db.teacher.findUniqueOrThrow({
        where: { id: session.teacherId },
        select: { workspaceId: true },
      });
      const refreshToken = randomToken();
      const { grant, row } = await db.$transaction(async (tx) => {
        const locked = await lockSession(tx, session.id);
        if (locked.status !== "live")
          throw new SessionConflict("SESSION_STATE_INVALID", "Buổi học đã kết thúc");
        const fresh = await tx.roomMember.findUniqueOrThrow({
          where: { id: member.id },
        });
        const submitOnly = mode === "submit" && fresh.state === "joined";
        const now = new Date();
        const invite = await tx.invite.create({
          data: {
            sessionId: session.id,
            studentId: student.id,
            tokenHash: digest(randomToken()),
            maskedHint: "link",
            expiresAt: new Date(Date.now() + 12 * 3600_000),
            createdBy: session.teacherId,
          },
        });
        if (mode === "move")
          await tx.studentRoomSession.updateMany({
            where: { memberId: member.id, revokedAt: null },
            data: { revokedAt: now },
          });
        const updated = submitOnly
          ? fresh
          : await tx.roomMember.update({
              where: { id: member.id },
              data: {
                displayName: student.name,
                consent: true,
                consentAt: fresh.consentAt ?? now,
                state: "joined",
                joinedAt: fresh.joinedAt ?? now,
                leftAt: null,
              },
            });
        const created = await tx.studentRoomSession.create({
          data: {
            sessionId: session.id,
            studentId: student.id,
            teacherId: session.teacherId,
            memberId: member.id,
            inviteId: invite.id,
            displayName: student.name,
            refreshTokenHash: digest(refreshToken),
            expiresAt: new Date(Date.now() + 12 * 3600_000),
          },
        });
        if (!submitOnly && fresh.state !== "joined")
          await appendOutboxEvent(tx, {
            sessionId: session.id,
            type: "member.admitted",
            label: `${student.name} vào lớp bằng link riêng`,
            actorId: `student:${student.id}`,
            visibility: { scope: "public" },
            resourceId: member.id,
          });
        await tx.auditLog.create({
          data: {
            workspaceId: teacherRow.workspaceId,
            actorId: `student:${student.id}`,
            actorRole: "student",
            action: submitOnly ? "member.device_added" : "member.joined_by_link",
            targetType: "room_member",
            targetId: member.id,
            sessionId: session.id,
            requestId: res.locals.requestId,
            metadata: { mode, previousStatus: fresh.state },
          },
        });
        return { grant: created, row: updated };
      });
      if (mode === "move") disconnectStudentSockets(session.id, student.id);
      triggerOutboxPublish(session.id);
      const accessToken = await signStudentAccess(config, {
        studentId: student.id,
        grantId: grant.id,
        teacherId: session.teacherId,
        sessionId: session.id,
        memberId: member.id,
      });
      return res.json({
        mode: mode === "submit" && row.state === "joined" ? "submit" : "join",
        grant: StudentAuthResponse.parse({
          accessToken,
          studentRoomToken: accessToken,
          refreshToken,
          sessionId: session.id,
          studentId: student.id,
          memberId: member.id,
          displayName: student.name,
          memberState: "joined",
        }),
      });
    }),
  );

  /** Mã QR "Nộp bằng điện thoại": cấp một quyền phụ ngắn hạn cho cùng một em. */
  r.post(
    "/room/handoff",
    requireStudent(config),
    asyncRoute(async (_req, res) => {
      const actor: StudentActor = res.locals.actor;
      const current = await db.studentRoomSession.findUnique({
        where: { id: actor.grantId },
        include: { sessionIdRef: { select: { status: true } } },
      });
      if (!current || current.sessionIdRef.status !== "live")
        return fail(
          res,
          409,
          "SESSION_NOT_LIVE",
          "Chỉ nộp bằng điện thoại được khi lớp đang học",
        );
      const raw = randomToken();
      const expiresAt = new Date(Date.now() + 15 * 60_000);
      await db.studentRoomSession.create({
        data: {
          sessionId: current.sessionId,
          studentId: current.studentId,
          teacherId: current.teacherId,
          memberId: current.memberId,
          inviteId: current.inviteId,
          displayName: current.displayName,
          refreshTokenHash: digest(raw),
          expiresAt,
        },
      });
      return res.json({
        url: `${config.origin}/?handoff=${encodeURIComponent(raw)}`,
        expiresAt,
      });
    }),
  );

  return r;
}
