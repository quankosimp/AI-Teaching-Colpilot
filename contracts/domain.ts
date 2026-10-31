import { z } from "zod";

export const CONTRACT_VERSION = "v1" as const;
export const Id = z.string().min(1).max(256);
export const Timestamp = z.iso.datetime({ offset: true });
export const SessionStatus = z.enum([
  "draft",
  "scheduled",
  "live",
  "ended",
  "reviewed",
]);
export type SessionStatus = z.infer<typeof SessionStatus>;
export const MemberState = z.enum([
  "invited",
  "waiting",
  "joined",
  "disconnected",
  "left",
]);
export const SupportLevel = z.enum([
  "DocLap",
  "CoGoiY",
  "DuocHuongDan",
  "ChuaRo",
]);
export const Tools = z.strictObject({
  board: z.boolean(),
  upload: z.boolean(),
  check: z.boolean(),
  chat: z.boolean(),
});
export const Actor = z.discriminatedUnion("role", [
  z.strictObject({
    role: z.literal("teacher"),
    teacherId: Id,
    workspaceId: Id,
  }),
  z.strictObject({
    role: z.literal("student"),
    teacherId: Id,
    sessionId: Id,
    studentId: Id,
    memberId: Id,
  }),
  z.strictObject({ role: z.literal("system"), actorId: Id }),
]);
export type Actor = z.infer<typeof Actor>;
export const Stroke = z.strictObject({
  id: Id,
  authorId: Id,
  color: z.string(),
  points: z.array(z.strictObject({ x: z.number(), y: z.number() })),
  width: z.number().positive().optional(),
  kind: z.enum(["pen", "line", "rect", "circle", "axes"]).optional(),
});
export const SourceRef = z.strictObject({
  type: z.enum([
    "note",
    "submission",
    "board_attempt",
    "check_response",
    "annotation",
    "ai_suggestion",
  ]),
  id: Id,
  version: z.number().int().positive(),
});
export type SourceRef = z.infer<typeof SourceRef>;
export const ClaimRef = z.strictObject({
  claimId: Id,
  revision: z.number().int().positive(),
});
export const EvidenceKind = z.enum([
  "GhiChu",
  "BaiLam",
  "MucHoTro",
  "GoiYGiangDay",
  "TrangNhap",
  "KiemTraDocLap",
  "ChuThichDe",
]);
export const EvidenceStatus = z.enum(["active", "corrected", "deleted"]);
export const ClaimStatus = z.enum(["pending", "approved", "rejected"]);
export const EvidenceForApproval = z
  .strictObject({
    id: Id,
    teacherId: Id,
    studentId: Id,
    sessionId: Id,
    kind: EvidenceKind,
    status: EvidenceStatus,
    isObservation: z.boolean(),
    version: z.number().int().positive(),
    currentEvidenceVersion: z.number().int().positive(),
    source: SourceRef,
    currentSourceVersion: z.number().int().positive(),
  })
  .superRefine((value, context) => {
    if (
      (value.kind === "GoiYGiangDay" ||
        value.source.type === "ai_suggestion") &&
      value.isObservation
    )
      context.addIssue({
        code: "custom",
        message: "AI teaching aids are not observations",
      });
  });
export type EvidenceForApproval = z.infer<typeof EvidenceForApproval>;
export const ApprovalContext = z
  .strictObject({
    teacherId: Id,
    studentId: Id,
    sessionId: Id,
    evidenceIds: z.array(Id).min(1),
    evidence: z.array(EvidenceForApproval).min(1),
  })
  .superRefine((input, ctx) => {
    const ids = new Set(input.evidenceIds);
    if (
      ids.size !== input.evidenceIds.length ||
      input.evidence.length !== ids.size ||
      new Set(input.evidence.map((e) => e.id)).size !== ids.size
    )
      ctx.addIssue({
        code: "custom",
        message: "Evidence IDs must match unique supplied records",
      });
    for (const e of input.evidence) {
      if (
        !ids.has(e.id) ||
        e.teacherId !== input.teacherId ||
        e.studentId !== input.studentId ||
        e.sessionId !== input.sessionId ||
        e.status !== "active" ||
        e.version !== e.currentEvidenceVersion ||
        e.source.version !== e.currentSourceVersion
      )
        ctx.addIssue({
          code: "custom",
          message: "Evidence must be owned, active and current",
        });
    }
    if (
      !input.evidence.some(
        (e) =>
          e.isObservation &&
          e.kind !== "GoiYGiangDay" &&
          e.source.type !== "ai_suggestion",
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Approval requires observation evidence",
      });
  });
export const SessionTransition = z.enum([
  "start",
  "end",
  "complete_review",
  "review_reopened",
]);
export type SessionTransition = z.infer<typeof SessionTransition>;
export function nextSessionStatus(
  status: SessionStatus,
  action: SessionTransition,
): SessionStatus | null {
  if (action === "start" && (status === "draft" || status === "scheduled"))
    return "live";
  if (action === "end" && status === "live") return "ended";
  if (action === "complete_review" && status === "ended") return "reviewed";
  if (action === "review_reopened" && status === "reviewed") return "ended";
  return null;
}
export const RECONNECT_QUEUE_LIMITS = Object.freeze({
  maxCommands: 50,
  maxBytes: 1024 * 1024,
  ttlMs: 5 * 60 * 1000,
});

export const ReviewCompletionContext = z
  .strictObject({
    status: SessionStatus,
    pendingClaims: z.number().int().nonnegative(),
    totalClaims: z.number().int().nonnegative(),
    reviewNote: z.string().trim().optional(),
  })
  .superRefine((input, ctx) => {
    if (
      input.status !== "ended" ||
      input.pendingClaims > 0 ||
      input.pendingClaims > input.totalClaims
    )
      ctx.addIssue({
        code: "custom",
        message: "Review requires an ended session without pending claims",
      });
    if (input.totalClaims === 0 && !input.reviewNote)
      ctx.addIssue({
        code: "custom",
        message: "An empty review requires a note",
      });
  });

export const StudentToolWriteContext = z
  .strictObject({
    status: SessionStatus,
    memberState: MemberState,
    memberBelongsToSession: z.boolean(),
    inviteValid: z.boolean(),
    toolEnabled: z.boolean(),
    memberToolEnabled: z.boolean(),
  })
  .refine(
    (input) =>
      input.status === "live" &&
      input.memberState === "joined" &&
      input.memberBelongsToSession &&
      input.inviteValid &&
      input.toolEnabled &&
      input.memberToolEnabled,
    { message: "Student tool action is not permitted" },
  );
