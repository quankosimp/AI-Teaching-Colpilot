# Child plan PRODUCT

Profile: worker-codex-alt (dedicated product instance)

Status: approved plan; task progress and evidence are tracked by supervisor.

## Ownership

- server/**
- contracts/**
- prisma/**
- src/product containers/data/provider wiring (excluding UI-owned paths)
- package.json
- pnpm-lock.yaml
- tests/unit/product/**
- Docker/Caddy/release workflow

## Inputs and dependencies

- ARCH specification and supervisor contract freeze
- UI components and QA findings
- Task prerequisites: ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05

## Tasks

| Task | Work | SRS / gate | Acceptance |
|---|---|---|---|
| PRODUCT-01 | Identity, authorization and foundations | AUTH 001, AUTH 002, AUTH 003, AUTH 004 / G1 | OAuth subject identity, revocable refresh, tenant authorization, local/test-only auth mock; negative authorization checks. |
| PRODUCT-02 | Student profiles and approved history | STU 001, STU 002, STU 004, STU 005, REV 005 / G1 | Create/edit/archive/restore; preserve history/manual goals; expose only approved history with evidence provenance. |
| PRODUCT-03 | Private materials and versioned annotations | MAT 001, MAT 002, MAT 003, MAT 005, TOOL 003 / G1 | Private versioned PDF/JPG/PNG up to 10 MiB, signed uploads/read, MIME/size finalization, material pages and normalized annotations. |
| PRODUCT-04 | Planning and next-session provenance | PLAN 001, PLAN 002, PLAN 003, PLAN 004, REV 006 / G1,G4 | One to five active students, ordered activities/duration warning, approved source links, teacher-accepted suggestions; new next-session identity without old admission/responses/tokens. |
| PRODUCT-05 | Classroom lifecycle | LIVE 001, LIVE 002, LIVE 003, LIVE 004, LIVE 005 / G2 | Idempotent start/end, persistent shared view/current activity/completion, dock by student, student writes stop at ended. |
| PRODUCT-06 | Admission and server permissions | ROOM 001, ROOM 002, ROOM 003, ROOM 004, ROOM 006 / G2 | CSPRNG hashed invite/TTL/rotation/revoke, consent/admit/reject, per-command authorization and role-filtered guest projections. |
| PRODUCT-07 | Ordered realtime and recovery | ROOM 005, LIVE 006 / G2 | Transactional ordered outbox, dedupe/replay/last-event cursor, independent media/realtime recovery; bounded queue 50 commands, 1 MiB, TTL 5 minutes. |
| PRODUCT-08 | Learning tools | TOOL 001, TOOL 002, TOOL 004, TOOL 005, TOOL 007 / G2 | Author-aware live board and private drafts/snapshots, unique quick check response, retry-safe text/image/PDF submissions, four support levels. |
| PRODUCT-09 | Evidence and human review | EVD 001, EVD 002, EVD 003, EVD 004, REV 001, REV 002, REV 003, REV 004 / G2,G4 | Versioned immutable sources and evidence corrections/audit, per-student filtering/stable pagination, claim revisions/approval provenance, explicit review reopen, zero-claim completion. |
| PRODUCT-10 | Gemini server adapter | AI 001, AI 002, AI 003, AI 004, AI 005, AI 006, AI 007 / G4 | Real Gemini configured on server; minimized consent-filtered context, suggestion lifecycle and model/prompt version, sourced pending claims, timeout/retry without blocking teaching. |
| PRODUCT-11 | Zoom media adapter | VID 001, VID 002, VID 003, VID 004, VID 005 / G3 | Authorized JWT signer, persistent Toolkit container, join/leave/mic/camera/share/participants/speaker, local/CI mock and real-device HTTPS evidence. |
| PRODUCT-12 | Operations and release | OPS 001, OPS 002, OPS 003, OPS 004 / G1,G5 | Request IDs/redacted append-only audit, liveness/readiness/degraded/flags, Docker/Caddy, private storage, backup/restore and rollback. |

## Outputs and completion

- Runtime contracts, migrations, APIs, providers and frontend wiring
- Business tests and reproducible release
- Task is complete only after relevant checks pass, evidence records tested commit/contracts/environment, reviewer blockers are resolved and supervisor accepts the gate.
- Only supervisor updates canonical RTM/gate status. Do not claim a mocked provider as real integration.
- Changes to shared contracts require impact review and a recorded decision before consumers change.

- Early G0 Zoom/Gemini spikes may be blocked by credentials without blocking local contracts/mock development.
- Complete technical specification: [g0-contract-spec.md](g0-contract-spec.md); supervisor normalization takes precedence over raw ARCH wording.
