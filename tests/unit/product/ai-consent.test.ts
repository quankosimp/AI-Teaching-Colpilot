import { test } from "node:test";
import assert from "node:assert/strict";
import { aiAllowed, aiConsentState } from "../../../server/aiConsent.js";

const t = (iso: string) => new Date(iso);

test("chưa ghi nhận ở mức học sinh thì theo đồng ý khi vào buổi", () => {
  assert.equal(aiAllowed(true, { aiConsentAt: null, aiConsentRevokedAt: null }), true);
  assert.equal(aiAllowed(false, { aiConsentAt: null, aiConsentRevokedAt: null }), false);
  assert.equal(aiAllowed(true, null), true);
  assert.equal(aiConsentState(undefined), "unset");
});

test("gia sư ghi nhận đồng ý thì dùng được cả khi em chưa vào buổi", () => {
  const st = { aiConsentAt: t("2026-11-01T00:00:00Z"), aiConsentRevokedAt: null };
  assert.equal(aiAllowed(false, st), true);
  assert.equal(aiConsentState(st), "granted");
});

test("thu hồi sau lần ghi nhận gần nhất thì chặn, kể cả em đã bấm đồng ý trong buổi", () => {
  const st = { aiConsentAt: t("2026-11-01T00:00:00Z"), aiConsentRevokedAt: t("2026-11-02T00:00:00Z") };
  assert.equal(aiAllowed(true, st), false);
  assert.equal(aiConsentState(st), "revoked");
  assert.equal(aiAllowed(true, { aiConsentAt: null, aiConsentRevokedAt: t("2026-11-02T00:00:00Z") }), false);
});

test("ghi nhận lại sau khi thu hồi thì dùng lại được", () => {
  const st = { aiConsentAt: t("2026-11-03T00:00:00Z"), aiConsentRevokedAt: t("2026-11-02T00:00:00Z") };
  assert.equal(aiAllowed(false, st), true);
  assert.equal(aiConsentState(st), "granted");
});
