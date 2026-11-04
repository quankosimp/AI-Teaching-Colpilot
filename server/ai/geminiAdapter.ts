import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type {
  AIAdapter,
  CircuitStatus,
  ClaimDraftRequestInput,
  ClaimDraftResult,
  PlanSuggestionInput,
  PlanSuggestionResult,
  TeachingRequestInput,
  TeachingSuggestionResult,
} from "./types.js";
import { CircuitBreaker, type CircuitBreakerConfig } from "./circuitBreaker.js";
import { sanitizeContext, sanitizeErrorMessage } from "./sanitizer.js";

const ClaimCandidateOutputSchema = z.strictObject({
  text: z.string().min(5).max(1000),
  evidenceIds: z.array(z.string().uuid()).min(1).max(10),
  reasoning: z.string().max(500).optional(),
});

const ClaimsDraftOutputSchema = z.strictObject({
  claims: z.array(ClaimCandidateOutputSchema).max(10),
  summary: z.string().max(1000).optional(),
});

export interface GeminiAdapterConfig {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  circuitConfig?: CircuitBreakerConfig;
}

export class RealGeminiAdapter implements AIAdapter {
  readonly provider = "gemini" as const;
  readonly model: string;
  private client: GoogleGenAI;
  private breaker: CircuitBreaker;
  private timeoutMs: number;

  constructor(config: GeminiAdapterConfig) {
    if (!config.apiKey || !config.model) {
      throw new Error("GEMINI_API_KEY and GEMINI_MODEL are required for RealGeminiAdapter");
    }
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? 15_000;
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.breaker = new CircuitBreaker(config.circuitConfig);
  }

  getCircuitStatus(): CircuitStatus {
    const status = this.breaker.getStatus();
    return {
      enabled: true,
      configured: true,
      provider: this.provider,
      model: this.model,
      circuitOpen: status.circuitOpen,
      consecutiveFailures: status.consecutiveFailures,
    };
  }

  recordSuccess(): void {
    this.breaker.recordSuccess();
  }

  recordFailure(): void {
    this.breaker.recordFailure();
  }

  private checkCircuit(): void {
    if (!this.breaker.canExecute()) {
      throw new Error("AI_CIRCUIT_OPEN: Dịch vụ AI tạm gián đoạn do lỗi liên tiếp; vui lòng thử lại sau.");
    }
  }

  async generateTeachingSuggestion(
    input: TeachingRequestInput,
  ): Promise<TeachingSuggestionResult> {
    this.checkCircuit();

    const names = input.studentNames || [];
    const cleanPrompt = sanitizeContext(input.prompt, names);
    const cleanActivity = sanitizeContext(input.activity.title, names);
    const cleanDesc = sanitizeContext(input.activity.description || "", names);
    const cleanSubject = sanitizeContext(input.student.subject || "", names);
    const cleanGrade = sanitizeContext(input.student.grade || "", names);
    const cleanGoal = sanitizeContext(input.student.goal || "", names);
    const cleanClaims = (input.priorApprovedClaims || []).map((c) => sanitizeContext(c, names));

    const modeLabels: Record<string, string> = {
      explain: "Giải thích lại khái niệm một cách trực quan, dễ hiểu",
      leading_question: "Đặt 1-2 câu hỏi gợi mở, dẫn dắt học sinh",
      example: "Đưa ra ví dụ tương tự đơn giản hơn để đối chiếu",
      difficulty: "Điều chỉnh độ khó phù hợp, tạo bước đệm trung gian",
    };

    const instructions = [
      "Bạn là trợ lý sư phạm cho giáo viên trong lớp học trực tuyến.",
      `Yêu cầu: ${modeLabels[input.mode] || "Hỗ trợ sư phạm"}.`,
      `Hoạt động hiện tại: ${cleanActivity}.`,
      cleanDesc ? `Mô tả hoạt động: ${cleanDesc}.` : "",
      cleanSubject ? `Môn: ${cleanSubject}.` : "",
      cleanGrade ? `Khối lớp: ${cleanGrade}.` : "",
      cleanGoal ? `Mục tiêu học tập: ${cleanGoal}.` : "",
      cleanPrompt ? `Lưu ý từ giáo viên: ${cleanPrompt}.` : "",
      cleanClaims.length > 0 ? `Lịch sử nhận định năng lực đã duyệt: ${cleanClaims.join("; ")}.` : "",
      "Quy tắc nghiêm ngặt: Trả lời ngắn gọn bằng tiếng Việt, thiết thực, không nhắc tên riêng học sinh, không bịa đặt thông tin cá nhân.",
    ].filter(Boolean).join("\n");

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: instructions,
        config: {
          abortSignal: AbortSignal.timeout(this.timeoutMs),
          maxOutputTokens: 1024,
          temperature: 0.3,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const text = response.text?.trim();
      if (!text) {
        throw new Error("Gemini không trả gợi ý nội dung");
      }

      this.recordSuccess();
      return {
        text,
        provider: this.provider,
        model: this.model,
        modelVersion: response.modelVersion || this.model,
        contextSummary: `Mode=${input.mode}; Activity=${cleanActivity}`,
        promptUsed: instructions,
        promptVersion: `teach-${input.mode}-v1`,
      };
    } catch (err) {
      this.recordFailure();
      const sanitized = sanitizeErrorMessage(err);
      throw new Error(`AI_UNAVAILABLE: ${sanitized}`);
    }
  }

  async generateClaimDrafts(
    input: ClaimDraftRequestInput,
  ): Promise<ClaimDraftResult> {
    this.checkCircuit();

    const names = input.studentNames || [];
    const cleanExtra = sanitizeContext(input.extraPrompt || "", names);

    // 0-observation guard: no evidence -> no competence claim (SRS AI 004)
    if (!input.observations || input.observations.length === 0) {
      this.recordSuccess();
      return {
        claims: [],
        summary: "Không có minh chứng quan sát thực tế để tạo nhận định năng lực",
        provider: this.provider,
        model: this.model,
        modelVersion: this.model,
        contextSummary: "0 observations",
        promptUsed: cleanExtra,
        promptVersion: "claim-draft-v1",
      };
    }

    const cleanObservations = input.observations.map((o) => ({
      ...o,
      title: sanitizeContext(o.title, names),
      detail: sanitizeContext(o.detail, names),
    }));

    const cleanGoal = sanitizeContext(input.student.goal || "", names);
    const obsDescriptions = cleanObservations.map(
      (o) => `[ID: ${o.id}] Tiêu đề: ${o.title}, Hỗ trợ: ${o.support}, Chi tiết: ${o.detail}`,
    );

    const instructions = [
      "Bạn là trợ lý đánh giá năng lực học sinh sau buổi học.",
      `Học sinh môn: ${sanitizeContext(input.student.subject || "", names)}, khối: ${sanitizeContext(input.student.grade || "", names)}.`,
      cleanGoal ? `Mục tiêu học tập: ${cleanGoal}.` : "",
      cleanExtra ? `Yêu cầu thêm từ giáo viên: ${cleanExtra}.` : "",
      "Nhiệm vụ: Tổng hợp các minh chứng quan sát thực tế thành 1 đến 2 nhận định năng lực dạng dự thảo (pending).",
      "Quy tắc nghiêm ngặt:",
      "1. Mỗi nhận định BẮT BUỘC phải trích dẫn đúng ID của ít nhất một minh chứng cung cấp bên dưới.",
      "2. Không tạo nhận định mà không có ID minh chứng đính kèm. Không bịa đặt ID.",
      "3. Trả lời định dạng JSON với cấu trúc: {\"claims\": [{\"text\": \"...\", \"evidenceIds\": [\"uuid\"]}]}",
      `Dữ liệu minh chứng quan sát:\n${obsDescriptions.join("\n")}`,
    ].filter(Boolean).join("\n");

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: instructions,
        config: {
          abortSignal: AbortSignal.timeout(this.timeoutMs),
          maxOutputTokens: 1024,
          temperature: 0.2,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const rawJson = response.text?.trim() || "{}";
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawJson);
      } catch {
        parsedJson = { claims: [] };
      }

      const parsed = ClaimsDraftOutputSchema.safeParse(parsedJson);
      if (!parsed.success) {
        throw new Error("Dữ liệu nhận định từ Gemini không đúng định dạng yêu cầu");
      }

      const validEvidenceIdSet = new Set(input.observations.map((o) => o.id));
      const validClaims: ClaimDraftResult["claims"] = [];

      for (const item of parsed.data.claims) {
        const text = item.text.trim();
        if (text.length < 5) continue;

        // Discard candidate wholly if duplicate evidence references exist
        const uniqueIds = new Set(item.evidenceIds);
        if (uniqueIds.size !== item.evidenceIds.length) {
          continue;
        }

        // Discard candidate wholly if ANY reference is hallucinated, peer or unknown
        const allExist = item.evidenceIds.every((id) => validEvidenceIdSet.has(id));
        if (!allExist || item.evidenceIds.length === 0) {
          continue;
        }

        validClaims.push({
          text,
          evidenceIds: item.evidenceIds,
          reasoning: item.reasoning?.trim(),
        });
      }

      this.recordSuccess();
      return {
        claims: validClaims,
        summary: `Tạo được ${validClaims.length} nhận định dự thảo từ Gemini.`,
        provider: this.provider,
        model: this.model,
        modelVersion: response.modelVersion || this.model,
        contextSummary: `${input.observations.length} observations analyzed`,
        promptUsed: instructions,
        promptVersion: "claim-draft-v1",
      };
    } catch (err) {
      this.recordFailure();
      const sanitized = sanitizeErrorMessage(err);
      throw new Error(`AI_UNAVAILABLE: ${sanitized}`);
    }
  }

  async generatePlanSuggestion(
    input: PlanSuggestionInput,
  ): Promise<PlanSuggestionResult> {
    this.checkCircuit();

    const names = input.studentNames || [];
    const cleanClaims = input.eligibleClaims.map((c) => sanitizeContext(c, names));
    const cleanSubject = sanitizeContext(input.subject || "", names);
    const cleanGrade = sanitizeContext(input.grade || "", names);
    const cleanGoal = sanitizeContext(input.goal || "", names);

    const prompt = [
      "Đề xuất một hoạt động ngắn cho giáo viên. Không đưa tên riêng, thông tin cá nhân hoặc kết luận mới. Trả lời ngắn bằng tiếng Việt.",
      cleanSubject && cleanGrade ? `Môn: ${cleanSubject}; lớp: ${cleanGrade}.` : "",
      cleanGoal ? `Mục tiêu học tập: ${cleanGoal}.` : "",
      ...cleanClaims.map((c) => `Nhận định đã duyệt: ${c}`),
    ].filter(Boolean).join("\n");

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          abortSignal: AbortSignal.timeout(this.timeoutMs),
          maxOutputTokens: 1024,
          temperature: 0.3,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const text = response.text?.trim();
      if (!text) {
        throw new Error("Gemini không trả gợi ý; có thể thử lại");
      }

      this.recordSuccess();
      return {
        text,
        provider: this.provider,
        model: this.model,
        modelVersion: response.modelVersion || this.model,
        contextSummary: "Lịch sử đã duyệt và có consent",
        promptUsed: prompt,
        promptVersion: "plan-v1",
      };
    } catch (err) {
      this.recordFailure();
      const sanitized = sanitizeErrorMessage(err);
      throw new Error(`AI_UNAVAILABLE: ${sanitized}`);
    }
  }
}
