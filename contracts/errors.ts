import { z } from "zod";
export const ErrorCode = z.enum([
  "INVITE_INVALID",
  "SESSION_NOT_LIVE",
  "PERMISSION_DENIED",
  "VERSION_CONFLICT",
  "MEDIA_UNAVAILABLE",
  "AI_UNAVAILABLE",
  "UPLOAD_FAILED",
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "SESSION_STATE_INVALID",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;
export const ErrorEnvelope = z.strictObject({
  error: z.strictObject({
    code: ErrorCode,
    message: z.string(),
    requestId: z.string().min(1),
    details: z.unknown().optional(),
    latestVersion: z.number().int().positive().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;
