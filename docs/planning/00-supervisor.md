# Master plan — AI Teaching Copilot online demo

Status: approved for implementation. Supervisor owns this plan, RTM, decisions and gate acceptance.

## Goal and baseline

Online multi-device demo: Google OAuth teacher; invite-scoped students; real Zoom Video SDK UI Toolkit and real Gemini; React/Vite Vietnamese purple light/dark UI. Node 22 Express/TypeScript modular monolith, PostgreSQL/Prisma, Socket.IO, private MinIO, Caddy HTTPS, Docker Compose. 60 P0 mandatory; 13 P1 tracked separately. SRS snapshot/hash: srs-baseline.json. Original user DOCX/generator remain unchanged.

## Gate sequence

| Gate | Deliverable | Closure |
|---|---|---|
| G0 | Baseline, ARCH spec, compiled Product contracts/Prisma and early provider spikes | Independent contract/privacy/state/ownership audit; local provider mock checks never replace real credentials |
| G1 | Auth, ownership, profiles, materials and planning persisted on server | Restart persistence and cross-tenant negative tests |
| G2 | Lobby/admit, ordered realtime, tools and sourced evidence | Three independent browser contexts, no cross-student private data |
| G3 | Real Zoom media | Actual HTTPS devices, admission, mic/camera/share/speaker and persistent media container |
| G4 | Real Gemini, review, approved profile and next-session | Sourced pending claims, human approval, privacy and source invalidation |
| G5 | Integrated release candidate | 60 P0 accepted on exact final commit, NFR/security/failure checks, restore/rollback/runbook |

PRODUCT-12 operations starts in G1 and closes G5. Provider feasibility is checked early. Missing real credentials block real provider gates, not contracts/mock/UI work.

## Worker plans

- [ARCH](01-architecture.md): specifications and contract audit; no runtime ownership.
- [UI](02-ui.md): dedicated presentation worker, separate worktree.
- [PRODUCT](03-product.md): separate worktree, runtime/contracts/business/providers/operations/wiring.
- [QA](04-qa.md): independent evidence and tests.
- [REVIEW](05-review.md): independent findings, no product mutations.

At most three active workers plus supervisor. Never assign the same implementation path to two authors. PRODUCT owns package/lock and business unit tests; QA owns other test namespaces/test CI. Only supervisor closes gates, accepts SRS rows and integrates commits. No self-review substitutes for independent review.

## Traceability and change control

Each SRS row has original criterion, one primary implementation task, UI/QA references, positive/negative scenarios, exact commit/contract/environment/artifact, and supervisor acceptance. Planned coverage is not implementation verification. States: task planned/ready/running/blocked/in_review/done; test planned/running/passed/failed/blocked/skipped. Reopen affected rows when contracts/source revisions change. Store each conflict, decision, impacted task and regression test before merge.

## Release

G5 requires 60/60 P0 accepted, mandatory NFRs met and no known blocking privacy/data-loss/core-flow findings. Handoff includes integrated source, repeatable tests, real HTTPS demo, master/child plans/RTM/conflict log and configuration/backup/restore/rollback instructions. Credentials/host/domain are external blockers if absent. No secret is committed or printed.
