import { z } from "zod";
import { Id, Timestamp } from "./domain.js";

/** Four pedagogical teaching assistance modes (AI 001). */
export const TeachingRequestMode = z.enum([
  "explain",
  "leading_question",
  "example",
  "difficulty",
]);
export type TeachingRequestMode = z.infer<typeof TeachingRequestMode>;

/** Input contract for requesting in-session AI teaching suggestion. */
export const AIRequestInput = z.strictObject({
  studentId: z.uuid(),
  activityId: z.uuid(),
  kind: TeachingRequestMode,
  prompt: z.string().max(4000),
});
export type AIRequestInput = z.infer<typeof AIRequestInput>;

/** Input contract for updating AI suggestion lifecycle status (AI 002 & AI 003). */
export const AIStatusUpdate = z.strictObject({
  status: z.enum(["used", "ignored", "reported"]),
  editedText: z.string().max(4000).optional(),
  saveAsEvidence: z.boolean().optional(),
});
export type AIStatusUpdate = z.infer<typeof AIStatusUpdate>;

/** Input contract for post-session AI claim drafting (AI 004). */
export const AIClaimsDraftInput = z.strictObject({
  studentId: z.uuid().optional(),
  prompt: z.string().max(2000).optional(),
});
export type AIClaimsDraftInput = z.infer<typeof AIClaimsDraftInput>;

/** Representation of an AI suggestion record. */
export const AISuggestionItem = z.strictObject({
  id: Id,
  sessionId: Id,
  studentId: Id,
  activityId: Id.nullable(),
  kind: z.union([TeachingRequestMode, z.literal("suggestion")]),
  prompt: z.string(),
  responseText: z.string(),
  editedText: z.string().nullable().optional(),
  evidenceId: Id.nullable().optional(),
  provider: z.enum(["openai", "gemini", "mock"]),
  model: z.string(),
  modelVersion: z.string(),
  status: z.enum(["ready", "used", "ignored", "reported", "error"]),
  actorId: z.string(),
  createdAt: Timestamp,
});
export type AISuggestionItem = z.infer<typeof AISuggestionItem>;

export const AISuggestionResponse = z.strictObject({
  suggestion: AISuggestionItem,
});
export type AISuggestionResponse = z.infer<typeof AISuggestionResponse>;

export const AIStatusUpdateResponse = z.strictObject({
  id: Id,
  status: z.enum(["used", "ignored", "reported"]),
  editedText: z.string().nullable().optional(),
  evidenceId: Id.nullable().optional(),
  evidence: z.unknown().optional(),
});
export type AIStatusUpdateResponse = z.infer<typeof AIStatusUpdateResponse>;

export const AIClaimCandidate = z.strictObject({
  id: Id,
  studentId: Id,
  text: z.string(),
  evidenceIds: z.array(Id),
  status: z.literal("pending"),
  revision: z.number().int().positive(),
});
export type AIClaimCandidate = z.infer<typeof AIClaimCandidate>;

export const AIClaimsDraftResponse = z.strictObject({
  claims: z.array(AIClaimCandidate),
  summary: z.string(),
});
export type AIClaimsDraftResponse = z.infer<typeof AIClaimsDraftResponse>;

export const AIPlanSources = z.array(z.strictObject({
  claimId: z.uuid(), revision: z.number().int().positive(), evidenceIds: z.array(z.uuid()).min(1),
})).min(1);
export const AIPlanSuggestionResponse = z.strictObject({
  suggestion: z.strictObject({
    id: Id, text: z.string(), status: z.string(), provider: z.enum(["openai", "gemini", "mock"]),
    model: z.string(), sources: AIPlanSources,
  }),
});
export type AIPlanSuggestionResponse = z.infer<typeof AIPlanSuggestionResponse>;

export const AICircuitStatusResponse = z.strictObject({
  enabled: z.boolean(),
  configured: z.boolean(),
  provider: z.enum(["openai", "gemini", "mock"]),
  model: z.string(),
  circuitOpen: z.boolean(),
  consecutiveFailures: z.number().int().nonnegative(),
});
export type AICircuitStatusResponse = z.infer<typeof AICircuitStatusResponse>;
