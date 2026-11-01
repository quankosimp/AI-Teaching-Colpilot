# Binding supervisor decisions

- D01: server/**, contracts/** and prisma/** are canonical. ARCH designs, PRODUCT authors runtime. UI only owns ui.tsx/CSS/presentation. QA test namespaces exclude tests/unit/product/**. Only PRODUCT edits package/lock/release workflow; QA owns test.yml. Supervisor owns planning/RTM.
- D02: ARCH spec -> Product compiled contracts -> independent audit/freeze -> UI/QA consumers. No circular wait for code before its author may create it.
- D03: Session draft or scheduled may start live; ended/reviewed never returns live. Correction may reopen reviewed -> ended with audit, preserving endedAt and disabled live tools.
- D04: AI aids are stored with isObservation=false and cannot alone substantiate competence. Claims validate real observation sources for same teacher/student/session and current revisions.
- D05: Live board is mutable under author policy. Captured BoardAttempt/source snapshots and revisions are immutable.
- D06: Archive blocks adding a student to a new session and preserves history; it does not silently eject an active student or mass-revoke invitations. Explicit revoke is distinct.
- D07: Rotate invite revokes old link, preserves joined membership; explicit revoke invalidates membership/socket access. Tokens are CSPRNG generated only in write commands, hashed in DB and excluded from audit/plaintext response caches.
- D08: No raw AppData to students; private goals/reviews/source references never enter shared group goals/activity descriptions.
- D09: Basic existing chat has server allow/deny and rate limit for ROOM 004; formal TOOL 006 remains P1. Do not make chat permanently denied to claim the toggle works.
- D10: Reconnect queue: max 50 commands/1 MiB/5-minute TTL; idempotent replay only after server revalidation. Never auto-send after ended or discard the user draft on queue full.
- D11: Google/Zoom/Gemini real staging requires actual providers. Auth/video mocks only local/CI. Provider failures cannot fabricate success or block manual teaching/evidence.
- D12: PDF/JPG/PNG max 10 MiB; private/versioned uploads validated at finalization, short-lived authorized signed URLs. Annotation coordinates are normalized.
- D13: Runtime Node22 and pnpm committed lockfile, strict compatible peers; no legacy-peer-deps as the delivery installation path.
- D14: Existing local demo storage is not silently uploaded/imported into online data. Preserve user storage; server demo fixtures are separate and synthetic.
- D15: G1 local is accepted independently of absent real-provider credentials. Global SRS provider/HTTPS acceptance remains blocked. Local code gates can proceed to G2 with exact-commit PostgreSQL/MinIO/HTTP/browser evidence.
- D16: When preferred Codex PRODUCT quota is exhausted, use a discovered available Antigravity-1/Gemini4 Argon High executor for the same PRODUCT role and worktree. The failed writer does not continue; runtime file ownership stays unchanged and a separate agent performs independent review. Provider availability does not imply available model quota.

- D17: Session tool flags are hard limits. Effective tool permission is parsed global flag exactly true AND member override not false; malformed global flags deny. canWrite affects board only. Applied consistently in request guard, locked transaction and student projection.
- D18: G3 and G4 executors consume supervisor55c05e1 in separate worktrees. G3 owns the media frontend/adapter, dedicated media CSS, package/lock and only the classroom video-token handler. G4 owns AI server routes/adapters/contracts/migrations and does not edit classroom.ts/app.ts/package/lock/src. Existing UI owner is idle; supervisor authored final integrated stage/dock CSS55. Contract additions require review before consumer acceptance.

- D19: When all existing writer pools report actual quota, supervisor may integrate and fix locally; writers stay idle and their clean checkpoints are retained. Independent review uses immutable commits. No writer resumes concurrently on supervisor-owned files.
- D20: Real Zoom controls use Toolkit native preview/footer. Opening preview is not joining; ordinary navigation/retry calls leaveSession followed by destroy, never closeSession/end-for-all. Real provider-enforced termination/device behavior still requires credentialed verification.
- D21: Applied migration008 stays byte-for-byte unchanged. Additive009 adds AI modes;010 stores plan provenance. Draft/plan retries use durable receipts and never synthesize approved claims or silently drop source references.
- D22: Only standalone teacher notes default to source version1 without a resource ID. Resource sources must exist for the same student/session at the current version, including when reading history, planning, AI drafting and approving. Historical AI context/consent is rechecked under ordered session locks after provider execution.
