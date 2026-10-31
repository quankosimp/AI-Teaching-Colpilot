import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  asyncRoute,
  db,
  fail,
  requireTeacher,
  type AppConfig,
} from "../context.js";

// Remove URL, bearer and token-like substrings before constructing provider context.
function minimize(value: string, names: string[] = []) {
  let result = value;
  for (const name of names) {
    if (name.trim())
      result = result.replace(
        new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"),
        "[học sinh]",
      );
  }
  return result
    .replace(/https?:\/\/\S+/gi, "[link removed]")
    .replace(/\bBearer\s+\S+/gi, "[credential removed]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[email removed]")
    .replace(/(?<!\w)(?:\+?\d[\d .()-]{8,}\d)(?!\w)/g, "[phone removed]")
    .replace(/\b[A-Za-z0-9_=-]{32,}\b/g, "[token removed]")
    .slice(0, 1200);
}
export function aiRouter(config: AppConfig) {
  const r = Router();
  r.use(requireTeacher(config));
  r.post(
    "/sessions/:id/ai/plan-suggestions",
    asyncRoute(async (req, res) => {
      if (process.env.ENABLE_AI !== "true")
        return fail(res, 503, "AI_UNAVAILABLE", "AI chưa được bật");
      const key = process.env.GEMINI_API_KEY,
        model = process.env.GEMINI_MODEL;
      if (!key || !model)
        return fail(res, 503, "AI_UNAVAILABLE", "Gemini chưa được cấu hình");
      const parsed = z
        .strictObject({ studentId: z.uuid() })
        .safeParse(req.body);
      if (!parsed.success || !z.uuid().safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "Yêu cầu không hợp lệ");
      const session = await db.session.findUnique({
        where: { id: req.params.id },
      });
      if (!session)
        return fail(res, 404, "NOT_FOUND", "Không tìm thấy buổi học");
      if (session.teacherId !== res.locals.actor.id)
        return fail(res, 403, "PERMISSION_DENIED", "Không có quyền truy cập");
      if (!["draft", "scheduled"].includes(session.status))
        return fail(
          res,
          409,
          "SESSION_STATE_INVALID",
          "Không thể đề xuất cho buổi này",
        );
      const member = await db.roomMember.findUnique({
        where: {
          sessionId_studentId: {
            sessionId: session.id,
            studentId: parsed.data.studentId,
          },
        },
        include: { studentIdRef: true },
      });
      if (!member)
        return fail(
          res,
          403,
          "PERMISSION_DENIED",
          "Học sinh không thuộc buổi học",
        );
      const claims = await db.claim.findMany({
        where: {
          studentId: parsed.data.studentId,
          status: "approved",
          sessionIdRef: {
            teacherId: res.locals.actor.id,
            RoomMember_sessionId_items: {
              some: { studentId: parsed.data.studentId, consent: true },
            },
          },
        },
        orderBy: { reviewedAt: "desc" },
        take: 4,
        select: {
          id: true,
          revision: true,
          text: true,
          evidenceIds: true,
          sessionId: true,
        },
      });
      const evidence = await db.evidence.findMany({
        where: {
          id: { in: claims.flatMap((claim) => claim.evidenceIds) },
          studentId: parsed.data.studentId,
          status: "active",
          sessionIdRef: { teacherId: res.locals.actor.id },
        },
      });
      const eligible = claims.filter((claim) => {
        const selected = claim.evidenceIds.map((id) =>
          evidence.find(
            (item) => item.id === id && item.sessionId === claim.sessionId,
          ),
        );
        return (
          selected.length > 0 &&
          selected.every(Boolean) &&
          selected.some(
            (item) =>
              item?.isObservation &&
              item.kind !== "GoiYGiangDay" &&
              item.sourceType !== "ai_suggestion",
          )
        );
      });
      if (!eligible.length)
        return fail(
          res,
          409,
          "VALIDATION_ERROR",
          "Chưa có lịch sử đã duyệt và đồng ý sử dụng cho AI",
        );
      const studentNames = (
        await db.student.findMany({
          where: { teacherId: res.locals.actor.id },
          select: { name: true },
        })
      ).map((student) => student.name);
      const prompt = [
        "Đề xuất một hoạt động ngắn cho giáo viên. Không đưa tên riêng, thông tin cá nhân hoặc kết luận mới. Trả lời ngắn bằng tiếng Việt.",
        `Môn: ${minimize(member.studentIdRef.subject)}; lớp: ${minimize(member.studentIdRef.grade)}.`,
        ...eligible.map(
          (c) => `Nhận định đã duyệt: ${minimize(c.text, studentNames)}`,
        ),
      ].join("\n");
      try {
        const result = await new GoogleGenAI({
          apiKey: key,
        }).models.generateContent({
          model,
          contents: prompt,
          config: {
            abortSignal: AbortSignal.timeout(12_000),
            maxOutputTokens: 400,
            temperature: 0.3,
          },
        });
        const text = result.text?.trim();
        if (!text)
          return fail(
            res,
            503,
            "AI_UNAVAILABLE",
            "Gemini không trả gợi ý; có thể thử lại",
          );
        const request = await db.aIRequest.create({
          data: {
            sessionId: session.id,
            studentId: parsed.data.studentId,
            kind: "plan_suggestion",
            prompt,
            promptVersion: "plan-v1",
            responseText: text.slice(0, 4000),
            contextSummary: "Lịch sử đã duyệt và có consent",
            provider: "gemini",
            model,
            modelVersion: result.modelVersion || model,
            status: "ready",
            actorId: res.locals.actor.id,
          },
        });
        return res.status(201).json({
          suggestion: {
            id: request.id,
            text: request.responseText,
            status: request.status,
            sources: eligible.map((c) => ({
              claimId: c.id,
              revision: c.revision,
              evidenceIds: c.evidenceIds,
            })),
          },
        });
      } catch {
        return fail(
          res,
          503,
          "AI_UNAVAILABLE",
          "Gemini tạm không khả dụng; vẫn có thể soạn thủ công",
        );
      }
    }),
  );
  r.patch(
    "/ai-requests/:id",
    asyncRoute(async (req, res) => {
      const input = z
        .strictObject({ status: z.enum(["used", "ignored", "reported"]) })
        .safeParse(req.body);
      if (!input.success || !z.uuid().safeParse(req.params.id).success)
        return fail(res, 400, "VALIDATION_ERROR", "Yêu cầu không hợp lệ");
      const item = await db.aIRequest.findFirst({
        where: {
          id: req.params.id,
          sessionIdRef: { teacherId: res.locals.actor.id },
        },
      });
      if (!item) return fail(res, 404, "NOT_FOUND", "Không tìm thấy gợi ý");
      const changed = await db.aIRequest.updateMany({
        where: { id: item.id, status: "ready" },
        data: { status: input.data.status },
      });
      if (!changed.count)
        return fail(res, 409, "VERSION_CONFLICT", "Gợi ý đã được xử lý");
      return res.json({ id: item.id, status: input.data.status });
    }),
  );
  return r;
}
