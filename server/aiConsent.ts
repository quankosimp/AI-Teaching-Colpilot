/** Trường đồng ý dùng AI ở mức học sinh (gia sư ghi nhận một lần, có thể thu hồi). */
export type StudentAiConsent = { aiConsentAt: Date | null; aiConsentRevokedAt: Date | null } | null | undefined;

/**
 * Em này có được dùng AI không.
 * - Gia sư đã thu hồi (sau lần ghi nhận gần nhất): không.
 * - Gia sư đã ghi nhận đồng ý: có, kể cả buổi em chưa vào (để gợi ý soạn bài trước giờ).
 * - Chưa có quyết định ở mức học sinh: dùng đồng ý khi em vào buổi đó, như trước.
 */
export function aiAllowed(memberConsent: boolean, student: StudentAiConsent): boolean {
  if (student?.aiConsentRevokedAt && (!student.aiConsentAt || student.aiConsentRevokedAt >= student.aiConsentAt)) return false;
  if (student?.aiConsentAt) return true;
  return memberConsent;
}

export function aiConsentState(student: StudentAiConsent): "granted" | "revoked" | "unset" {
  if (student?.aiConsentRevokedAt && (!student.aiConsentAt || student.aiConsentRevokedAt >= student.aiConsentAt)) return "revoked";
  if (student?.aiConsentAt) return "granted";
  return "unset";
}
