# Supervisor execution status

## Current

- Root baseline c0c7841 now includes reviewed G0 via merge 8b7063e; QA contract tests and UI presentations integrated through 426e971, test CI/harness through 653f3a0.
- PRODUCT baseline G0: 8ed8998 (includes earlier Product/UI candidates). Node22/pnpm strict frozen install, tests6/6, frontend/server typechecks/builds reported passed; independent verification pending.
- UI fixes 72f914a and presentation exports f4a55a9 integrated; worker fixture checks cover 360/375/1440px light/dark and modal keyboard. Product G1 wiring still pending; UI task completion not accepted.
- ARCH G0 design delivered and supervisor-normalized in g0-contract-spec.md. Runtime contracts v1 and PostgreSQL migration are implemented at d8d98a3 and corrected at 378b634.
- Initial independent G0 audit at d8d98a3: NEEDS_FIXES. MF-01 room-session grants/canWrite, MF-02 upload cap/AI source classification and MF-03 own-submission feedback/shared-board selection are fixed at 378b634. Re-audit PASS, 15/15 domain/contract regressions plus frontend/server typechecks. Supervisor freezes G0 contract v1 and authorizes G1. Original review: evidence/g0-review-d8d98a3.md.
- Independent QA ebfe687/608fcc7 integrated. Supervisor ran 22/22 tests successfully on integrated source 426e971 with authorized local HTTP permissions; frontend/server typechecks and builds pass. Evidence: evidence/g0-integrated.json. This closes G0 only, not functional SRS acceptance. QA readiness correction a7a18df integrated as c78d241; supervisor verified 23 passed / 6 explicitly blocked-skipped / 0 failed. Missing G1 endpoints are not counted as functionality passed. QA is preparing independent black-box G1 tests for the forthcoming Docker API.
- G1 candidate 497377e delivers teacher API, PostgreSQL/MinIO local fixtures and online frontend wiring. Product reported 17/17 checks with dedicated integration storage, two independent browser contexts and persistence across API restart; supervisor has not accepted G1 yet.
- Independent G1 review: NEEDS_FIXES MF-G1-01 eligible history/per-activity sources, MF-G1-02 entered activity values/material version, MF-G1-03 failed-upload cleanup/race and scoped logout, MF-G1-04 real-page annotation rendering. Product is remediating. Review evidence: evidence/g1-review-497377e.md.
- UI 681416f supplies pure AnnotationLayer plus G1 management layout fixes. Product is integrating real PDF/page rendering. QA is adapting black-box tests to published typed API (accessToken, wrappers, version/idempotency headers and real signed upload) and running a dedicated test app/database/bucket. Existing UI fixtures do not establish integrated MAT 005 acceptance.
- User confirmed no VPS/domain/provider credentials yet; continue full local Docker implementation and verification. External provider/HTTPS evidence remains blocked, not inferred from local mocks.
- Docker29.6.1 available with approved local execution permissions.
- Real Google OAuth/Zoom/Gemini/domain configuration absent; G3/G4/real-release evidence blocked until configured. No provider-real acceptance inferred from mock tests.
- No online SRS P0 accepted yet. Every RTM row remains planned until exact-commit test evidence and supervisor acceptance.

## External blockers

| ID | Missing prerequisite | Blocks | Does not block |
|---|---|---|---|
| EXT-01 | Google OAuth client/secret and authorized callback | Real auth verification | Local/CI auth mock contracts/tests |
| EXT-02 | Zoom Video SDK account/key/secret | Real media HTTPS/device verification | Mock adapter/runtime implementation |
| EXT-03 | Gemini API key/quota | Real AI verification | Context validation/schema/provider-error tests |
| EXT-04 | VPS target/domain/DNS/TLS | Public HTTPS release | Local Docker/integration/E2E |

Do not print or commit secret values. Update status only with concrete commits/checks, not completion estimates.
