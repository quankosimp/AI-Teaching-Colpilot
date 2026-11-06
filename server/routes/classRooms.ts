import { Router, type Response } from "express";
import { z } from "zod";
import { ClassSchedule, nextOccurrences, pickOpenTarget, vnNowTime, vnToday } from "../../contracts/classes.js";
import { lessonMaterialActivity } from "../lessonMaterials.js";
import { aiAllowed, aiConsentState } from "../aiConsent.js";
import { getAIAdapter, isAIEnabled } from "../ai/index.js";
import { asyncRoute, audit, db, fail, requireTeacher, type AppConfig, type TeacherActor } from "../context.js";
import { ownedGroup } from "./classes.js";

const MAX_PER_SESSION = 5;
const LATE_MS = 10 * 60_000;
const safeId = z.uuid();
const ClaimKind = z.strictObject({ kind: z.enum(["review", "good"]) });

/** Nhận định của gia sư đang đăng nhập; trả null và đã báo lỗi nếu không phải. */
async function ownedClaim(id: string, actor: TeacherActor, res: Response) {
  if (!safeId.safeParse(id).success) {
    fail(res, 400, "VALIDATION_ERROR", "ID nhận định không hợp lệ");
    return null;
  }
  const claim = await db.claim.findUnique({
    where: { id },
    include: { sessionIdRef: { select: { teacherId: true } } },
  });
  if (!claim) {
    fail(res, 404, "NOT_FOUND", "Không tìm thấy nhận định");
    return null;
  }
  if (claim.sessionIdRef.teacherId !== actor.id) {
    await audit(actor, "security.denied", "claim", id, res.locals.requestId);
    fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
    return null;
  }
  return claim;
}


type GroupRow = { id: string; name: string };

/** Tạo một buổi cho lớp: lấy học sinh đang học, gắn sẵn tài liệu đã ghim (mở tiếp đúng trang). */
async function createClassSession(
  actor: TeacherActor,
  group: GroupRow,
  date: string,
  time: string,
  res: Response,
  via: "open" | "prepare",
): Promise<string | null> {
  const roster = await db.studentGroupMember.findMany({
    where: { groupId: group.id, studentIdRef: { teacherId: actor.id, status: "active" } },
    select: { studentId: true },
    orderBy: { studentId: "asc" },
  });
  if (!roster.length) {
    fail(res, 409, "SESSION_STATE_INVALID", "Thêm học sinh trước khi mở lớp.");
    return null;
  }
  if (roster.length > MAX_PER_SESSION) {
    fail(res, 409, "SESSION_STATE_INVALID", `Một buổi học tối đa ${MAX_PER_SESSION} em. Lớp này đang có ${roster.length} em.`);
    return null;
  }
  const ids = roster.map((m) => m.studentId);
  const pinned = await db.groupMaterial.findMany({
    where: { groupId: group.id, pinned: true, materialIdRef: { teacherId: actor.id, archivedAt: null } },
    orderBy: { createdAt: "asc" },
    include: { materialIdRef: { select: { id: true, currentVersion: true } } },
  });
  const sessionId = await db.$transaction(async (tx) => {
    const activities = [];
    for (const [i, pin] of pinned.entries()) {
      try {
        const a = await lessonMaterialActivity(tx, actor.id, { materialId: pin.materialId, version: pin.materialIdRef.currentVersion }, i);
        activities.push({ ...a, materialStartPage: pin.lastPage });
      } catch {
        // Tài liệu chưa tải xong hoặc không còn dùng được: bỏ qua, không chặn việc mở lớp.
      }
    }
    const count = await tx.session.count({ where: { groupId: group.id } });
    const session = await tx.session.create({
      data: {
        teacherId: actor.id,
        primaryStudentId: ids[0],
        groupId: group.id,
        groupName: group.name,
        title: `Buổi ${count + 1} · ${group.name}`,
        status: "scheduled",
        goal: "",
        sharedGoal: "",
        date,
        time,
        // Cột bắt buộc của Session; giao diện không hiện con số này.
        duration: 60,
        tools: { board: true, upload: true, check: true, chat: true },
        completedActivityIds: [],
        dismissedSuggestionIds: [],
        RoomMember_sessionId_items: { create: ids.map((studentId) => ({ studentId })) },
        ...(activities.length ? { Activity_sessionId_items: { create: activities } } : {}),
      },
    });
    return session.id;
  });
  await audit(actor, "session.created", "session", sessionId, res.locals.requestId, sessionId, { groupId: group.id, via });
  return sessionId;
}

/** Kết thúc buổi thì nhớ trang đang chiếu của tài liệu hiện tại cho lớp đó. Không bao giờ ném lỗi. */
export async function rememberMaterialPage(sessionId: string) {
  try {
    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: { groupId: true, materialPage: true, currentActivityId: true, Activity_sessionId_items: { select: { id: true, materialId: true, order: true }, orderBy: { order: "asc" } } },
    });
    if (!session?.groupId) return;
    const current = session.Activity_sessionId_items.find((a) => a.id === session.currentActivityId) ?? session.Activity_sessionId_items.find((a) => a.materialId);
    const now = new Date();
    for (const a of session.Activity_sessionId_items) {
      if (!a.materialId) continue;
      const page = a.id === current?.id ? session.materialPage : undefined;
      await db.groupMaterial.upsert({
        where: { groupId_materialId: { groupId: session.groupId, materialId: a.materialId } },
        create: { groupId: session.groupId, materialId: a.materialId, pinned: false, lastPage: page ?? 0, lastUsedAt: now },
        update: { lastUsedAt: now, ...(page !== undefined ? { lastPage: page } : {}) },
      });
    }
  } catch (e) {
    console.error("rememberMaterialPage failed", e instanceof Error ? e.message : e);
  }
}

/** Lớp là phòng: lịch lặp không bắt buộc và nút Mở lớp. */
export function classRoomsRouter(config: AppConfig) {
  const r = Router();
  const teacher = requireTeacher(config);

  r.put(
    "/groups/:id/schedule",
    teacher,
    asyncRoute(async (req, res) => {
      const group = await ownedGroup(req.params.id, res.locals.actor, res);
      if (!group) return;
      const parsed = ClassSchedule.safeParse(req.body);
      if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Lịch học chưa hợp lệ");
      const days = [...new Set(parsed.data.days)].sort();
      await db.studentGroup.update({
        where: { id: group.id },
        data: { scheduleDays: days, scheduleTime: parsed.data.time },
      });
      await audit(res.locals.actor, "group.schedule_set", "student_group", group.id, res.locals.requestId);
      return res.json({ schedule: { days, time: parsed.data.time } });
    }),
  );

  r.delete(
    "/groups/:id/schedule",
    teacher,
    asyncRoute(async (req, res) => {
      const group = await ownedGroup(req.params.id, res.locals.actor, res);
      if (!group) return;
      await db.studentGroup.update({ where: { id: group.id }, data: { scheduleDays: [], scheduleTime: null } });
      await audit(res.locals.actor, "group.schedule_cleared", "student_group", group.id, res.locals.requestId);
      return res.json({ schedule: null });
    }),
  );

  r.post(
    "/groups/:id/open",
    teacher,
    asyncRoute(async (req, res) => {
      const actor: TeacherActor = res.locals.actor;
      const group = await ownedGroup(req.params.id, actor, res);
      if (!group) return;
      const sessions = await db.session.findMany({
        where: { groupId: group.id, teacherId: actor.id },
        select: { id: true, status: true, date: true, time: true },
      });
      const target = pickOpenTarget(sessions, vnToday());
      if (target.kind !== "create")
        return res.json({
          sessionId: target.sessionId,
          action: target.kind,
          needsStart: target.kind === "start",
        });
      const made = await createClassSession(actor, group, vnToday(), vnNowTime(), res, "open");
      if (!made) return;
      return res.json({ sessionId: made, action: "created", needsStart: true });
    }),
  );


  /** Tài liệu của lớp: đang ghim cho buổi tới, và đã dùng trước đây. */
  r.get(
    "/groups/:id/materials",
    teacher,
    asyncRoute(async (req, res) => {
      const actor: TeacherActor = res.locals.actor;
      const group = await ownedGroup(req.params.id, actor, res);
      if (!group) return;
      const rows = await db.groupMaterial.findMany({
        where: { groupId: group.id, materialIdRef: { teacherId: actor.id, archivedAt: null } },
        include: { materialIdRef: { select: { id: true, title: true, kind: true, subject: true, currentVersion: true } } },
        orderBy: [{ pinned: "desc" }, { lastUsedAt: "desc" }, { createdAt: "desc" }],
      });
      const item = (r: (typeof rows)[number]) => ({
        materialId: r.materialId,
        title: r.materialIdRef.title,
        kind: r.materialIdRef.kind,
        subject: r.materialIdRef.subject,
        lastPage: r.lastPage,
        lastUsedAt: r.lastUsedAt,
      });
      return res.json({ pinned: rows.filter((r) => r.pinned).map(item), used: rows.filter((r) => !r.pinned).map(item) });
    }),
  );

  r.put(
    "/groups/:id/materials/:materialId",
    teacher,
    asyncRoute(async (req, res) => {
      const actor: TeacherActor = res.locals.actor;
      const group = await ownedGroup(req.params.id, actor, res);
      if (!group) return;
      const parsed = z.strictObject({ pinned: z.boolean() }).safeParse(req.body);
      if (!parsed.success || !safeId.safeParse(req.params.materialId).success)
        return fail(res, 400, "VALIDATION_ERROR", "Yêu cầu không hợp lệ");
      const material = await db.material.findFirst({ where: { id: req.params.materialId, teacherId: actor.id, archivedAt: null } });
      if (!material) return fail(res, 404, "NOT_FOUND", "Không tìm thấy tài liệu");
      await db.groupMaterial.upsert({
        where: { groupId_materialId: { groupId: group.id, materialId: material.id } },
        create: { groupId: group.id, materialId: material.id, pinned: parsed.data.pinned },
        update: { pinned: parsed.data.pinned },
      });
      return res.json({ ok: true, pinned: parsed.data.pinned });
    }),
  );

  /** Tài liệu này đang ghim cho lớp nào (cho hộp "Dùng cho lớp" ở kho). */
  r.get(
    "/materials/:id/classes",
    teacher,
    asyncRoute(async (req, res) => {
      const actor: TeacherActor = res.locals.actor;
      if (!safeId.safeParse(req.params.id).success) return fail(res, 400, "VALIDATION_ERROR", "ID không hợp lệ");
      const [groups, pins] = await Promise.all([
        db.studentGroup.findMany({ where: { teacherId: actor.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, subject: true } }),
        db.groupMaterial.findMany({ where: { materialId: req.params.id, groupIdRef: { teacherId: actor.id } } }),
      ]);
      return res.json({
        groups: groups.map((g) => {
          const pin = pins.find((p) => p.groupId === g.id);
          return { id: g.id, name: g.name, subject: g.subject, pinned: !!pin?.pinned, lastPage: pin?.lastPage ?? 0, used: !!pin?.lastUsedAt };
        }),
      });
    }),
  );

  /** Chuẩn bị buổi tới: mở buổi đã hẹn gần nhất, hoặc tạo một buổi theo lịch (không có lịch thì hôm nay). */
  r.post(
    "/groups/:id/prepare",
    teacher,
    asyncRoute(async (req, res) => {
      const actor: TeacherActor = res.locals.actor;
      const group = await ownedGroup(req.params.id, actor, res);
      if (!group) return;
      const today = vnToday();
      const planned = await db.session.findFirst({
        where: { groupId: group.id, teacherId: actor.id, status: { in: ["draft", "scheduled"] }, date: { gte: today } },
        orderBy: [{ date: "asc" }, { time: "asc" }],
        select: { id: true },
      });
      if (planned) return res.json({ sessionId: planned.id, created: false });
      const next = group.scheduleDays.length && group.scheduleTime
        ? nextOccurrences(group.scheduleDays, group.scheduleTime, today, 1, vnNowTime())[0]
        : undefined;
      const made = await createClassSession(actor, group, next ?? today, next && group.scheduleTime ? group.scheduleTime : vnNowTime(), res, "prepare");
      if (!made) return;
      return res.json({ sessionId: made, created: true });
    }),
  );

  /**
   * Gia sư ghi nhận (hoặc thu hồi) đồng ý dùng AI cho một em, thay mặt em hoặc phụ huynh.
   * Ghi một lần, dùng cho mọi buổi, kể cả gợi ý soạn bài trước giờ.
   */
  r.put(
    "/students/:id/ai-consent",
    teacher,
    asyncRoute(async (req, res) => {
      const actor: TeacherActor = res.locals.actor;
      const parsed = z.strictObject({ granted: z.boolean() }).safeParse(req.body);
      if (!parsed.success || !safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "Yêu cầu không hợp lệ");
      const student = await db.student.findFirst({ where: { id: req.params.id, teacherId: actor.id } });
      if (!student) return fail(res, 404, "NOT_FOUND", "Không tìm thấy học sinh");
      const now = new Date();
      const updated = await db.student.update({
        where: { id: student.id },
        data: parsed.data.granted ? { aiConsentAt: now, aiConsentRevokedAt: null } : { aiConsentRevokedAt: now },
        select: { aiConsentAt: true, aiConsentRevokedAt: true },
      });
      await audit(actor, parsed.data.granted ? "student.ai_consent_recorded" : "student.ai_consent_revoked", "student", student.id, res.locals.requestId);
      return res.json({ state: aiConsentState(updated), at: parsed.data.granted ? updated.aiConsentAt : updated.aiConsentRevokedAt });
    }),
  );


  /**
   * AI soạn câu hỏi kiểm tra nhanh từ nội dung một trang tài liệu (chữ do trình duyệt đọc từ PDF).
   * Chỉ trả gợi ý: gia sư xem, sửa rồi mới mở cho lớp. Không gửi dữ liệu học sinh.
   */
  r.post(
    "/sessions/:id/ai/page-questions",
    teacher,
    asyncRoute(async (req, res) => {
      const actor: TeacherActor = res.locals.actor;
      const parsed = z
        .strictObject({
          title: z.string().trim().max(200),
          page: z.number().int().min(0).max(9999),
          text: z.string().trim().min(20).max(12000),
        })
        .safeParse(req.body);
      if (!parsed.success || !safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "Trang này chưa có đủ chữ để soạn câu hỏi");
      const session = await db.session.findUnique({
        where: { id: req.params.id },
        include: { groupIdRef: { select: { subject: true, grade: true } } },
      });
      if (!session || session.teacherId !== actor.id) return fail(res, 404, "NOT_FOUND", "Không tìm thấy buổi học");
      if (!isAIEnabled()) return fail(res, 503, "AI_UNAVAILABLE", "AI chưa được bật");
      const adapter = getAIAdapter();
      if (!adapter) return fail(res, 503, "AI_UNAVAILABLE", "Dịch vụ AI không khả dụng");
      try {
        const result = await adapter.generateTeachingSuggestion({
          mode: "leading_question",
          prompt:
            "Soạn đúng 3 câu hỏi kiểm tra nhanh, ngắn, dựa hoàn toàn vào nội dung trang ở phần mô tả hoạt động. " +
            "Mỗi câu một dòng, bắt đầu bằng dấu gạch ngang. Không kèm đáp án, không giải thích, không thêm ý ngoài trang.",
          student: {
            id: session.primaryStudentId,
            subject: session.groupIdRef?.subject,
            grade: session.groupIdRef?.grade,
          },
          activity: {
            id: session.currentActivityId ?? session.id,
            title: `${parsed.data.title} · trang ${parsed.data.page + 1}`,
            description: parsed.data.text.slice(0, 6000),
          },
          priorApprovedClaims: [],
          studentNames: [],
        });
        const questions = result.text
          .split(/\n+/)
          .map((l) => l.replace(/^\s*(?:[-–•*]|\d+[.)])\s*/, "").trim())
          .filter((l) => l.length >= 6)
          .slice(0, 3);
        await audit(actor, "ai.page_questions", "session", session.id, res.locals.requestId, session.id, { provider: result.provider, count: questions.length });
        return res.json({ questions, provider: result.provider });
      } catch (e) {
        return fail(res, 503, "AI_UNAVAILABLE", "Chưa soạn được câu hỏi. Bạn thử lại sau ít phút.");
      }
    }),
  );

  /** Màn Sau buổi: ai có mặt, nguồn của từng em, nhận định của buổi, bài chưa nhận xét. */
  r.get(
    "/sessions/:id/after",
    teacher,
    asyncRoute(async (req, res) => {
      const actor: TeacherActor = res.locals.actor;
      if (!safeId.safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "ID buổi học không hợp lệ");
      const session = await db.session.findUnique({
        where: { id: req.params.id },
        include: {
          RoomMember_sessionId_items: {
            include: { studentIdRef: { select: { id: true, name: true, initials: true, color: true, aiConsentAt: true, aiConsentRevokedAt: true } } },
          },
        },
      });
      if (!session || session.teacherId !== actor.id)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy buổi học");
      if (session.status !== "ended" && session.status !== "reviewed")
        return fail(res, 409, "SESSION_STATE_INVALID", "Buổi học chưa kết thúc");
      const [evidence, claims, submissions] = await Promise.all([
        db.evidence.findMany({
          where: {
            sessionId: session.id,
            status: "active",
            isObservation: true,
            kind: { not: "GoiYGiangDay" },
            sourceType: { not: "ai_suggestion" },
          },
          orderBy: { createdAt: "asc" },
          select: { id: true, studentId: true, title: true, kind: true, createdAt: true },
        }),
        db.claim.findMany({
          where: { sessionId: session.id },
          orderBy: { createdAt: "asc" },
          select: { id: true, studentId: true, text: true, status: true, revision: true, kind: true, evidenceIds: true },
        }),
        db.submission.findMany({
          where: { sessionId: session.id, status: { not: "reviewed" } },
          orderBy: { createdAt: "asc" },
          select: { id: true, studentId: true, title: true, createdAt: true },
        }),
      ]);
      const names = new Map(session.RoomMember_sessionId_items.map((m) => [m.studentId, m.studentIdRef.name]));
      const students = session.RoomMember_sessionId_items
        .map((m) => {
          const present = m.attendance ? m.attendance === "present" : !!m.joinedAt;
          const late =
            present && !!m.joinedAt && !!session.startedAt &&
            m.joinedAt.getTime() - session.startedAt.getTime() > LATE_MS;
          return {
            studentId: m.studentId,
            name: m.studentIdRef.name,
            initials: m.studentIdRef.initials,
            color: m.studentIdRef.color,
            present,
            late,
            lateMinutes:
              late && m.joinedAt && session.startedAt
                ? Math.round((m.joinedAt.getTime() - session.startedAt.getTime()) / 60_000)
                : 0,
            consent: aiAllowed(m.consent, m.studentIdRef),
            aiConsent: aiConsentState(m.studentIdRef),
            evidence: evidence.filter((e) => e.studentId === m.studentId).map(({ studentId: _s, ...e }) => e),
            claims: claims.filter((c) => c.studentId === m.studentId).map(({ studentId: _s, ...c }) => c),
          };
        })
        .sort((a, b) => Number(b.present) - Number(a.present) || a.name.localeCompare(b.name, "vi"));
      return res.json({
        session: {
          id: session.id,
          title: session.title,
          date: session.date,
          time: session.time,
          status: session.status,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          groupId: session.groupId,
          groupName: session.groupName,
          attendanceConfirmedAt: session.attendanceConfirmedAt,
        },
        students,
        pendingSubmissions: submissions.map((s) => ({ ...s, name: names.get(s.studentId) ?? "" })),
      });
    }),
  );

  /** Gia sư đổi loại nhận định: Ôn lại hoặc Làm tốt. */
  r.patch(
    "/claims/:id/kind",
    teacher,
    asyncRoute(async (req, res) => {
      const claim = await ownedClaim(req.params.id, res.locals.actor, res);
      if (!claim) return;
      const parsed = ClaimKind.safeParse(req.body);
      if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Loại nhận định không hợp lệ");
      await db.claim.update({ where: { id: claim.id }, data: { kind: parsed.data.kind } });
      return res.json({ ok: true, kind: parsed.data.kind });
    }),
  );

  /** "Đã ổn": đóng một điều cần nhớ. Chỉ gia sư làm được, chỉ với nhận định đã duyệt. */
  r.post(
    "/claims/:id/resolve",
    teacher,
    asyncRoute(async (req, res) => {
      const actor: TeacherActor = res.locals.actor;
      const claim = await ownedClaim(req.params.id, actor, res);
      if (!claim) return;
      if (claim.status !== "approved")
        return fail(res, 409, "SESSION_STATE_INVALID", "Chỉ đóng được nhận định đã duyệt");
      await db.claim.update({ where: { id: claim.id }, data: { resolvedAt: new Date(), resolvedBy: actor.id } });
      await audit(actor, "claim.resolved", "claim", claim.id, res.locals.requestId, claim.sessionId);
      return res.json({ ok: true });
    }),
  );

  return r;
}
