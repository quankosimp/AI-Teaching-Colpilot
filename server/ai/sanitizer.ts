/**
 * Privacy and minimization sanitizer (AI 006).
 * Strips URLs, tokens, credentials, emails, phone numbers, and student names
 * before provider dispatch, ensuring no peer data or secrets leak to AI models or logs.
 */
export function sanitizeContext(
  value: string,
  studentNames: string[] = [],
  maxLength = 1500,
): string {
  if (!value) return "";
  let result = value;

  // Anonymize student personal names
  for (const name of studentNames) {
    if (name && name.trim().length > 1) {
      const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(escaped, "giu"), "[học sinh]");
    }
  }

  return result
    // URLs and S3 / storage presigned links
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[link removed]")
    // Credentials and tokens
    .replace(/\bBearer\s+[A-Za-z0-9_.-]+/gi, "[credential removed]")
    .replace(/\b(?:eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]+)\b/g, "[token removed]")
    .replace(/\b[A-Za-z0-9_=-]{32,}\b/g, "[token removed]")
    // Contact info
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[email removed]")
    .replace(/(?<!\w)(?:\+?\d[\d .()-]{8,}\d)(?!\w)/g, "[phone removed]")
    // Truncate bounded length
    .slice(0, maxLength);
}

/**
 * Sanitizes provider and operational error messages before presenting to users or logs.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (!error) return "AI service error";
  let msg = typeof error === "string" ? error : error instanceof Error ? error.message : String(error);

  // Strip potential keys or credentials embedded in error strings
  msg = msg
    .replace(/AIza[0-9A-Za-z-_]+/g, "[redacted key]")
    .replace(/https?:\/\/[^\s"'<>]+/g, "[url]")
    .replace(/\bBearer\s+\S+/gi, "[credential]")
    .replace(/\b[a-f0-9]{32,64}\b/gi, "[hash]");

  return msg.slice(0, 300);
}
