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
  kind: z.enum(["review", "good"]).optional(),
});

const ClaimsDraftOutputSchema = z.strictObject({
  claims: z.array(ClaimCandidateOutputSchema).max(10),
  summary: z.string().max(1000).optional(),
});

export interface OpenAIAdapterConfig {
  apiKey: string;
  model: string;
  /** none | low | medium | high — chỉ gửi cho model có suy luận (gpt-5 trở lên, o-series). */
  reasoningEffort?: string;
  baseUrl?: string;
  timeoutMs?: number;
  circuitConfig?: CircuitBreakerConfig;
}

type ChatResult = { text: string; modelVersion: string };

/** App hiện gợi ý dạng chữ thường, nên không để model dùng Markdown hay LaTeX. */
const PLAIN_TEXT_RULE =
  "Định dạng: văn bản thuần (plain text), viết hoa đúng chính tả, không dùng Markdown (không **, #, bảng), không dùng LaTeX; viết công thức trực tiếp như 2x + 3 = 7. Mỗi ý một dòng, bắt đầu bằng dấu gạch ngang nếu cần liệt kê.";

/** Gọi OpenAI Chat Completions bằng fetch; prompt và luật kiểm tra kết quả giữ như trước. */
export class RealOpenAIAdapter implements AIAdapter {
  readonly provider = "openai" as const;
  readonly model: string;
  private apiKey: string;
  private baseUrl: string;
  private reasoningEffort: string;
  private breaker: CircuitBreaker;
  private timeoutMs: number;

  constructor(config: OpenAIAdapterConfig) {
    if (!config.apiKey || !config.model) {
      throw new Error("OPENAI_API_KEY and OPENAI_MODEL are required for RealOpenAIAdapter");
    }
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    this.reasoningEffort = config.reasoningEffort || "low";
    this.timeoutMs = config.timeoutMs ?? 20_000;
    this.breaker = new CircuitBreaker(config.circuitConfig);
  }

  private get reasons() {
    // GPT-5 trở lên và o-series chỉ nhận reasoning_effort, không nhận temperature khác 1.
    return /^(gpt-([5-9]|\d{2,})|o\d)/.test(this.model);
  }

  private async chat(prompt: string, opts: { temperature: number; json?: boolean }): Promise<ChatResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: this.reasons ? 4096 : 1024,
    };
    if (this.reasons) body.reasoning_effort = this.reasoningEffort;
    else body.temperature = opts.temperature;
    if (opts.json) body.response_format = { type: "json_object" };
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const data = (await response.json().catch(() => null)) as {
      model?: string;
      error?: { message?: string };
      choices?: { message?: { content?: string | null } }[];
    } | null;
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${data?.error?.message || "lỗi không rõ"}`);
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    return { text, modelVersion: data?.model || this.model };
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
      PLAIN_TEXT_RULE,
    ].filter(Boolean).join("\n");

    try {
      const response = await this.chat(instructions, { temperature: 0.3 });

      const text = response.text;
      if (!text) {
        throw new Error("OpenAI không trả gợi ý nội dung");
      }

      this.recordSuccess();
      return {
        text,
        provider: this.provider,
        model: this.model,
        modelVersion: response.modelVersion,
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
      "Nhiệm vụ: Tổng hợp các minh chứng quan sát thực tế thành 1 nhận định ngắn (tối đa khoảng 120 ký tự) dạng dự thảo để giáo viên duyệt. Chỉ viết 2 nhận định nếu có hai điều thật sự khác nhau.",
      "Mỗi nhận định có loại ghi riêng ở trường kind: \"review\" nếu học sinh cần ôn lại hoặc còn vướng, \"good\" nếu học sinh làm tốt. Trường text chỉ là câu nhận định bằng tiếng Việt, không chứa chữ review hay good, không chứa ID minh chứng (ID chỉ ghi ở evidenceIds).",
      PLAIN_TEXT_RULE,
      "Quy tắc nghiêm ngặt:",
      "1. Mỗi nhận định BẮT BUỘC phải trích dẫn đúng ID của ít nhất một minh chứng cung cấp bên dưới.",
      "2. Không tạo nhận định mà không có ID minh chứng đính kèm. Không bịa đặt ID.",
      "3. Trả lời định dạng JSON với cấu trúc: {\"claims\": [{\"text\": \"...\", \"kind\": \"review\", \"evidenceIds\": [\"uuid\"]}]}",
      `Dữ liệu minh chứng quan sát:\n${obsDescriptions.join("\n")}`,
    ].filter(Boolean).join("\n");

    try {
      const response = await this.chat(instructions, { temperature: 0.2, json: true });

      const rawJson = response.text || "{}";
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawJson);
      } catch {
        parsedJson = { claims: [] };
      }

      const parsed = ClaimsDraftOutputSchema.safeParse(parsedJson);
      if (!parsed.success) {
        throw new Error("Dữ liệu nhận định từ OpenAI không đúng định dạng yêu cầu");
      }

      const validEvidenceIdSet = new Set(input.observations.map((o) => o.id));
      const validClaims: ClaimDraftResult["claims"] = [];

      for (const item of parsed.data.claims) {
        // Model đôi khi chèn loại vào đầu câu ("review: …"): bỏ đi, và dùng nó làm loại nếu thiếu.
        const prefix = item.text.match(/^\s*(review|good)\s*[:\-–]\s*/i);
        const kind = item.kind ?? (prefix ? (prefix[1].toLowerCase() as "review" | "good") : undefined);
        const text = item.text
          .replace(/^\s*(review|good)\s*[:\-–]\s*/i, "")
          .replace(/\s*\((pending|dự thảo)\)\s*\.?$/i, "")
          // Model nhỏ đôi khi chép ID minh chứng vào câu: "(uuid)" hoặc "[ID: uuid]".
          .replace(/\s*[([]\s*(?:ID\s*:\s*)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\s*,\s*[0-9a-f-]{36})*\s*[)\]]/gi, "")
          .replace(/\s+([.,;])/g, "$1")
          .trim();
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
          kind,
        });
      }

      this.recordSuccess();
      return {
        claims: validClaims,
        summary: `Tạo được ${validClaims.length} nhận định dự thảo từ OpenAI.`,
        provider: this.provider,
        model: this.model,
        modelVersion: response.modelVersion,
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
      PLAIN_TEXT_RULE,
      cleanSubject && cleanGrade ? `Môn: ${cleanSubject}; lớp: ${cleanGrade}.` : "",
      cleanGoal ? `Mục tiêu học tập: ${cleanGoal}.` : "",
      ...cleanClaims.map((c) => `Nhận định đã duyệt: ${c}`),
    ].filter(Boolean).join("\n");

    try {
      const response = await this.chat(prompt, { temperature: 0.3 });

      const text = response.text;
      if (!text) {
        throw new Error("OpenAI không trả gợi ý; có thể thử lại");
      }

      this.recordSuccess();
      return {
        text,
        provider: this.provider,
        model: this.model,
        modelVersion: response.modelVersion,
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
