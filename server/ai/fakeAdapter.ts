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
import { sanitizeContext } from "./sanitizer.js";

export class FakeAIAdapter implements AIAdapter {
  readonly provider = "mock" as const;
  readonly model = "mock-gemini-2.5-flash";
  readonly modelVersion = "mock-v1";
  private breaker = new CircuitBreaker();

  // Test hooks for fault injection
  simulateTimeout = false;
  simulateError = false;

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
    if (this.simulateTimeout) {
      this.recordFailure();
      throw new Error("AI_TIMEOUT: Quá thời gian phản hồi từ nhà cung cấp mô hình.");
    }
    if (this.simulateError) {
      this.recordFailure();
      throw new Error("AI_PROVIDER_ERROR: Lỗi xử lý từ mô hình học tập.");
    }
  }

  async generateTeachingSuggestion(
    input: TeachingRequestInput,
  ): Promise<TeachingSuggestionResult> {
    this.checkCircuit();

    const cleanPrompt = sanitizeContext(input.prompt);
    const cleanActivity = sanitizeContext(input.activity.title);
    const mode = input.mode;

    let responseText = "";
    switch (mode) {
      case "explain":
        responseText = `[Gợi ý giải thích lại - ${cleanActivity}]: Hãy chia nhỏ nội dung thành 2 bước trực quan. Bắt đầu bằng tình huống thực tế quen thuộc, sau đó liên hệ trực tiếp với yêu cầu của hoạt động. ${cleanPrompt ? `Lưu ý thêm: ${cleanPrompt}` : ""}`.trim();
        break;
      case "leading_question":
        responseText = `[Câu hỏi dẫn dắt - ${cleanActivity}]: 1) Em hãy quan sát bước đầu tiên và cho biết đâu là thông tin trọng tâm? 2) Điểm tương đồng giữa ví dụ này và bài học trước là gì? ${cleanPrompt ? `Định hướng: ${cleanPrompt}` : ""}`.trim();
        break;
      case "example":
        responseText = `[Ví dụ tương tự - ${cleanActivity}]: Đưa ra một ví dụ đơn giản với các số liệu hoặc cấu trúc nhỏ gọn tương đương để học sinh đối chiếu từng bước thực hiện trước khi tự giải bài chính.`.trim();
        break;
      case "difficulty":
        responseText = `[Điều chỉnh độ khó - ${cleanActivity}]: Giảm bớt các yêu cầu phức tạp ở bước đầu, cung cấp khung mẫu hoặc gợi ý trung gian. Khi học sinh đã tự tin hoàn thành phần cơ bản, mới mở rộng sang yêu cầu đầy đủ.`.trim();
        break;
      default:
        responseText = `[Hỗ trợ sư phạm - ${cleanActivity}]: Gợi ý giáo viên tạo điều kiện để học sinh tự trình bày suy nghĩ và phản hồi từng phần.`;
    }

    this.recordSuccess();
    return {
      text: responseText,
      provider: this.provider,
      model: this.model,
      modelVersion: this.modelVersion,
      contextSummary: `Mode=${mode}; Activity=${cleanActivity}; Grade=${input.student.grade || "default"}`,
      promptUsed: cleanPrompt,
      promptVersion: `teach-${mode}-v1`,
    };
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
        modelVersion: this.modelVersion,
        contextSummary: "0 observations",
        promptUsed: sanitizeContext(input.extraPrompt || ""),
        promptVersion: "claim-draft-v1",
      };
    }

    const independentObs = input.observations.filter((o) => o.support === "DocLap");
    const guidedObs = input.observations.filter((o) => o.support !== "DocLap");

    const claims: ClaimDraftResult["claims"] = [];

    if (independentObs.length > 0) {
      claims.push({
        text: `Học sinh thể hiện khả năng thực hiện độc lập trong các nhiệm vụ: ${independentObs.map((o) => o.title).join(", ")}.`,
        evidenceIds: independentObs.map((o) => o.id),
        reasoning: "Dựa trên các minh chứng độc lập thu nhận trong buổi học.",
      });
    }

    if (guidedObs.length > 0) {
      claims.push({
        text: `Học sinh hoàn thành các nhiệm vụ với sự hướng dẫn của giáo viên: ${guidedObs.map((o) => o.title).join(", ")}.`,
        evidenceIds: guidedObs.map((o) => o.id),
        reasoning: "Dựa trên các minh chứng cần sự trợ giúp trong buổi học.",
      });
    }

    this.recordSuccess();
    return {
      claims,
      summary: `Tạo được ${claims.length} nhận định dự thảo từ ${input.observations.length} minh chứng thực tế.`,
      provider: this.provider,
      model: this.model,
      modelVersion: this.modelVersion,
      contextSummary: `${input.observations.length} observations evaluated`,
      promptUsed: sanitizeContext(input.extraPrompt || ""),
      promptVersion: "claim-draft-v1",
    };
  }

  async generatePlanSuggestion(
    input: PlanSuggestionInput,
  ): Promise<PlanSuggestionResult> {
    this.checkCircuit();

    const cleanClaims = input.eligibleClaims.map((c) => sanitizeContext(c));
    const text = cleanClaims.length > 0
      ? `Đề xuất hoạt động củng cố trọng tâm dựa trên ${cleanClaims.length} nhận định đã duyệt: Ôn tập kỹ năng thông qua bài tập thực hành theo nhóm và phiếu học tập tự đánh giá.`
      : "Đề xuất hoạt động củng cố cơ bản: Khởi động với câu hỏi tương tác ngắn và bài tập khởi động.";

    this.recordSuccess();
    return {
      text,
      provider: this.provider,
      model: this.model,
      modelVersion: this.modelVersion,
      contextSummary: `${cleanClaims.length} eligible claims`,
      promptUsed: cleanClaims.join("; "),
      promptVersion: "plan-v1",
    };
  }
}
