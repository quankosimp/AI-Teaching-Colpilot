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
import { sanitizeContext } from "./sanitizer.js";

export class FakeAIAdapter implements AIAdapter {
  readonly provider = "mock" as const;
  readonly model = "mock-gemini-2.5-flash";
  readonly modelVersion = "mock-v1";
  private breaker: CircuitBreaker;

  // Test hooks for fault injection and context capture
  simulateTimeout = false;
  simulateError = false;
  callCount = 0;
  lastTeachingInput?: TeachingRequestInput;
  lastClaimInput?: ClaimDraftRequestInput;
  lastPlanInput?: PlanSuggestionInput;
  lastDispatchedPrompt?: string;

  constructor(circuitConfig?: CircuitBreakerConfig) {
    this.breaker = new CircuitBreaker(circuitConfig);
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
    this.callCount += 1;
    this.lastTeachingInput = input;
    this.checkCircuit();

    const names = input.studentNames || [];
    const cleanPrompt = sanitizeContext(input.prompt, names);
    const cleanActivity = sanitizeContext(input.activity.title, names);
    const cleanDesc = sanitizeContext(input.activity.description || "", names);
    const cleanSubject = sanitizeContext(input.student.subject || "", names);
    const cleanGrade = sanitizeContext(input.student.grade || "", names);
    const cleanGoal = sanitizeContext(input.student.goal || "", names);
    const cleanClaims = (input.priorApprovedClaims || []).map((c) => sanitizeContext(c, names));
    const mode = input.mode;

    const fullInstruction = [
      `Chế độ sư phạm: ${mode}.`,
      `Hoạt động: ${cleanActivity}.`,
      cleanDesc ? `Mô tả hoạt động: ${cleanDesc}.` : "",
      cleanSubject ? `Môn học: ${cleanSubject}.` : "",
      cleanGrade ? `Khối lớp: ${cleanGrade}.` : "",
      cleanGoal ? `Mục tiêu học tập: ${cleanGoal}.` : "",
      cleanPrompt ? `Lưu ý từ giáo viên: ${cleanPrompt}.` : "",
      cleanClaims.length > 0 ? `Lịch sử nhận định đã duyệt: ${cleanClaims.join("; ")}.` : "",
    ].filter(Boolean).join("\n");

    this.lastDispatchedPrompt = fullInstruction;

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
      contextSummary: `Mode=${mode}; Activity=${cleanActivity}; Grade=${cleanGrade || "default"}`,
      promptUsed: fullInstruction,
      promptVersion: `teach-${mode}-v1`,
    };
  }

  async generateClaimDrafts(
    input: ClaimDraftRequestInput,
  ): Promise<ClaimDraftResult> {
    this.callCount += 1;
    this.lastClaimInput = input;
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
        modelVersion: this.modelVersion,
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
    const fullInstruction = [
      `Học sinh môn: ${sanitizeContext(input.student.subject || "", names)}, khối: ${sanitizeContext(input.student.grade || "", names)}.`,
      cleanGoal ? `Mục tiêu học tập: ${cleanGoal}.` : "",
      cleanExtra ? `Yêu cầu thêm từ giáo viên: ${cleanExtra}.` : "",
      "Danh sách minh chứng quan sát:",
      ...cleanObservations.map((o) => `- [${o.id}] (${o.support}): ${o.title}. ${o.detail}`),
    ].filter(Boolean).join("\n");

    this.lastDispatchedPrompt = fullInstruction;

    const independentObs = cleanObservations.filter((o) => o.support === "DocLap");
    const guidedObs = cleanObservations.filter((o) => o.support !== "DocLap");

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
      promptUsed: fullInstruction,
      promptVersion: "claim-draft-v1",
    };
  }

  async generatePlanSuggestion(
    input: PlanSuggestionInput,
  ): Promise<PlanSuggestionResult> {
    this.callCount += 1;
    this.lastPlanInput = input;
    this.checkCircuit();

    const names = input.studentNames || [];
    const cleanClaims = input.eligibleClaims.map((c) => sanitizeContext(c, names));
    const cleanSubject = sanitizeContext(input.subject || "", names);
    const cleanGrade = sanitizeContext(input.grade || "", names);
    const cleanGoal = sanitizeContext(input.goal || "", names);

    const fullInstruction = [
      "Đề xuất một hoạt động ngắn cho giáo viên. Không đưa tên riêng, thông tin cá nhân hoặc kết luận mới. Trả lời ngắn bằng tiếng Việt.",
      cleanSubject && cleanGrade ? `Môn: ${cleanSubject}; lớp: ${cleanGrade}.` : "",
      cleanGoal ? `Mục tiêu học tập: ${cleanGoal}.` : "",
      ...cleanClaims.map((c) => `Nhận định đã duyệt: ${c}`),
    ].filter(Boolean).join("\n");

    this.lastDispatchedPrompt = fullInstruction;

    const text = cleanClaims.length > 0
      ? `Đề xuất hoạt động bổ trợ: Dựa trên nhận định "${cleanClaims[0].slice(0, 80)}...", giáo viên nên mở đầu bằng một bài tập kết nối ngắn để củng cố kỹ năng trước khi giao nhiệm vụ nâng cao.`
      : "Đề xuất hoạt động khởi động: Ôn tập lại kiến thức trọng tâm bài trước thông qua câu hỏi trắc nghiệm tương tác nhanh.";

    this.recordSuccess();
    return {
      text,
      provider: this.provider,
      model: this.model,
      modelVersion: this.modelVersion,
      contextSummary: `EligibleClaims=${cleanClaims.length}`,
      promptUsed: fullInstruction,
      promptVersion: "plan-v1",
    };
  }
}
