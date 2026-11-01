import { GoogleGenAI } from "@google/genai";
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
import { CircuitBreaker } from "./circuitBreaker.js";
import { sanitizeContext, sanitizeErrorMessage } from "./sanitizer.js";

export interface GeminiAdapterConfig {
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export class RealGeminiAdapter implements AIAdapter {
  readonly provider = "gemini" as const;
  readonly model: string;
  private readonly client: GoogleGenAI;
  private readonly timeoutMs: number;
  private breaker = new CircuitBreaker();

  constructor(config: GeminiAdapterConfig) {
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
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
      throw new Error("AI_CIRCUIT_OPEN: Gemini tạm thời gián đoạn do lỗi liên tiếp; vui lòng thử lại sau.");
    }
  }

  async generateTeachingSuggestion(
    input: TeachingRequestInput,
  ): Promise<TeachingSuggestionResult> {
    this.checkCircuit();

    const cleanPrompt = sanitizeContext(input.prompt);
    const cleanActivity = sanitizeContext(input.activity.title);
    const cleanClaims = (input.priorApprovedClaims || []).map((c) => sanitizeContext(c));

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
      input.student.subject ? `Môn: ${sanitizeContext(input.student.subject)}.` : "",
      input.student.grade ? `Khối lớp: ${sanitizeContext(input.student.grade)}.` : "",
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
          maxOutputTokens: 500,
          temperature: 0.3,
        },
      });

      const text = response.text?.trim();
      if (!text) {
        this.recordFailure();
        throw new Error("Gemini không trả gợi ý nội dung");
      }

      this.recordSuccess();
      return {
        text,
        provider: this.provider,
        model: this.model,
        modelVersion: response.modelVersion || this.model,
        contextSummary: `Mode=${input.mode}; Activity=${cleanActivity}`,
        promptUsed: cleanPrompt,
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
        promptUsed: sanitizeContext(input.extraPrompt || ""),
        promptVersion: "claim-draft-v1",
      };
    }

    const obsDescriptions = input.observations.map(
      (o, idx) => `[ID: ${o.id}] Tiêu đề: ${sanitizeContext(o.title)}, Hỗ trợ: ${o.support}, Chi tiết: ${sanitizeContext(o.detail)}`,
    );

    const instructions = [
      "Bạn là trợ lý đánh giá năng lực học sinh sau buổi học.",
      "Nhiệm vụ: Tổng hợp các minh chứng quan sát thực tế thành 1 đến 2 nhận định năng lực dạng dự thảo (pending).",
      "Quy tắc nghiêm ngặt:",
      "1. Mỗi nhận định BẮT BUỘC phải trích dẫn đúng ID của ít nhất một minh chứng cung cấp bên dưới.",
      "2. Không tạo nhận định mà không có ID minh chứng đính kèm.",
      "3. Trả lời định dạng JSON với cấu trúc: {\"claims\": [{\"text\": \"...\", \"evidenceIds\": [\"id1\", \"id2\"]}]}",
      `Dữ liệu minh chứng quan sát:\n${obsDescriptions.join("\n")}`,
    ].join("\n");

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: instructions,
        config: {
          abortSignal: AbortSignal.timeout(this.timeoutMs),
          maxOutputTokens: 600,
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      });

      const rawJson = response.text?.trim() || "{}";
      let parsed: { claims?: Array<{ text?: string; evidenceIds?: string[] }> };
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        parsed = {};
      }

      const validEvidenceIdSet = new Set(input.observations.map((o) => o.id));
      const validClaims: ClaimDraftResult["claims"] = [];

      for (const item of parsed.claims || []) {
        if (!item.text || typeof item.text !== "string") continue;
        const validIds = (item.evidenceIds || []).filter((id) =>
          validEvidenceIdSet.has(id),
        );
        if (validIds.length > 0) {
          validClaims.push({
            text: item.text.trim(),
            evidenceIds: validIds,
          });
        }
      }

      this.recordSuccess();
      return {
        claims: validClaims,
        summary: `Tạo được ${validClaims.length} nhận định dự thảo từ Gemini.`,
        provider: this.provider,
        model: this.model,
        modelVersion: response.modelVersion || this.model,
        contextSummary: `${input.observations.length} observations analyzed`,
        promptUsed: sanitizeContext(input.extraPrompt || ""),
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

    const cleanClaims = input.eligibleClaims.map((c) => sanitizeContext(c));
    const prompt = [
      "Đề xuất một hoạt động ngắn cho giáo viên. Không đưa tên riêng, thông tin cá nhân hoặc kết luận mới. Trả lời ngắn bằng tiếng Việt.",
      input.subject && input.grade ? `Môn: ${sanitizeContext(input.subject)}; lớp: ${sanitizeContext(input.grade)}.` : "",
      ...cleanClaims.map((c) => `Nhận định đã duyệt: ${c}`),
    ].filter(Boolean).join("\n");

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          abortSignal: AbortSignal.timeout(this.timeoutMs),
          maxOutputTokens: 400,
          temperature: 0.3,
        },
      });

      const text = response.text?.trim();
      if (!text) {
        this.recordFailure();
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
