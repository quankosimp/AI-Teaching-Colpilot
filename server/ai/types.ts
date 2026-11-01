import type { TeachingRequestMode } from "../../contracts/ai.js";

export type { TeachingRequestMode };

export interface TeachingRequestInput {
  mode: TeachingRequestMode;
  prompt: string;
  student: {
    id: string;
    subject?: string;
    grade?: string;
  };
  activity: {
    id: string;
    title: string;
    description?: string;
    type?: string;
  };
  priorApprovedClaims?: string[];
}

export interface TeachingSuggestionResult {
  text: string;
  provider: "gemini" | "mock";
  model: string;
  modelVersion: string;
  contextSummary: string;
  promptUsed: string;
  promptVersion: string;
}

export interface ObservationEvidenceItem {
  id: string;
  studentId: string;
  title: string;
  detail: string;
  support: string;
  kind: string;
  sourceType: string;
  sourceVersion: number | null;
}

export interface ClaimDraftRequestInput {
  student: {
    id: string;
    subject?: string;
    grade?: string;
  };
  observations: ObservationEvidenceItem[];
  extraPrompt?: string;
}

export interface ClaimDraftCandidate {
  text: string;
  evidenceIds: string[];
  reasoning?: string;
}

export interface ClaimDraftResult {
  claims: ClaimDraftCandidate[];
  summary: string;
  provider: "gemini" | "mock";
  model: string;
  modelVersion: string;
  contextSummary: string;
  promptUsed: string;
  promptVersion: string;
}

export interface PlanSuggestionInput {
  studentId: string;
  subject?: string;
  grade?: string;
  eligibleClaims: string[];
}

export interface PlanSuggestionResult {
  text: string;
  provider: "gemini" | "mock";
  model: string;
  modelVersion: string;
  contextSummary: string;
  promptUsed: string;
  promptVersion: string;
}

export interface CircuitStatus {
  enabled: boolean;
  configured: boolean;
  provider: "gemini" | "mock";
  model: string;
  circuitOpen: boolean;
  consecutiveFailures: number;
}

export interface AIAdapter {
  generateTeachingSuggestion(input: TeachingRequestInput): Promise<TeachingSuggestionResult>;
  generateClaimDrafts(input: ClaimDraftRequestInput): Promise<ClaimDraftResult>;
  generatePlanSuggestion(input: PlanSuggestionInput): Promise<PlanSuggestionResult>;
  getCircuitStatus(): CircuitStatus;
  recordSuccess(): void;
  recordFailure(): void;
}
