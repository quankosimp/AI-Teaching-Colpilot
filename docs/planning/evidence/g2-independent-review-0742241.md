Scoped independent QA review. This closes CG2-01 at code-review level and checks selected frontend boundaries; it does not accept all G2 or60P0. Supervisor separately ran the recovery HTTP/socket regression and integrated Docker suite. Worker-generated file links may refer to an older worktree; the reviewed commits are0742241 andda0637f, confirmed through Git.

Showing 1 of 254 activities (limited to 1)

### Independent Read-Only Review: CG2-01 Backend (`0742241`) & Frontend Wiring (`da0637f`)

**Overall Verdict**: **PASS** (Zero remaining blockers identified).

---

### Part 1: Backend CG2-01 Verification (`0742241` vs `f6a40bc`)

Backend commit [`0742241`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031) addresses the blocker from the previous review turn by unifying all tool permission and capability paths under the rule: **`globalTools[tool] === true && overrides[tool] !== false`**, with default-deny on malformed flags, and restricting `canWrite` exclusively to whiteboard operations.

#### 1. Verification of the Three Permission Paths
1. **Path 1 — Student Tool Request Guard (`checkStudentToolAccess`)**:
   - [server/routes/classroom.ts#L189-L198](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/classroom.ts#L189-L198):
     - `toolEnabled`: strictly `parsedTools.success && sessionTools[toolKey] === true`.
     - `memberToolEnabled`: strictly `overrides[toolKey] !== false`.
     - `canWrite`: evaluated only when `toolKey === "board" ? member.canWrite : true` ([#L204](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-product-completion-20261031/server/routes/classroom.ts#L204)).
     - Malformed flags trigger `!parsedTools.success => toolEnabled: false => StudentToolWriteContext` fails with `403 PERMISSION_DENIED`.
2. **Path 2 — Transactional Live Lock Guard (`lockLiveAccess`)**:
   - [server/routes/classroom.ts#L246-L258](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/classroom.ts#L246-L258):
     - `toolAllowed`: `tool === "reaction" ? true : toolsParsed.success && globalTools[tool] === true && overrides[tool] !== false`.
     - `canWrite`: evaluated only for `tool === "board" && !member.canWrite` ([#L269](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/classroom.ts#L269)).
     - Member override `true` cannot override global `false`.
3. **Path 3 — Student Room Capabilities Projection (`toolEffective`)**:
   - [server/routes/classroom.ts#L1956-L1965](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/classroom.ts#L1956-L1965):
     - Returns `false` immediately if `!isLiveJoinedGranted` or `!parsedTools.success`.
     - Returns `sessionTools[toolKey] === true && memberOverrides[toolKey] !== false`.
     - [server/routes/classroom.ts#L1967-L1972](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/classroom.ts#L1967-L1972):
       - `boardWrite`: `toolEffective("board") && member.canWrite`.
       - `upload`: `toolEffective("upload")`.
       - `check`: `toolEffective("check")`.
       - `chat`: `toolEffective("chat")`.
       - Member `canWrite: false` locks board writing only; `upload`, `check`, and `chat` remain active.
4. **Additional Specialized Tool Endpoints**:
   - Whiteboard dispatch ([server/routes/classroom.ts#L2253-L2256](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/classroom.ts#L2253-L2256)): `boardEnabled = toolsParsed.success && tools.board === true && overrides.board !== false`.
   - Chat endpoint ([server/routes/classroom.ts#L3599-L3600](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/classroom.ts#L3599-L3600)): `if (!toolsParsed.success || !toolsParsed.data.chat) return fail(res, 403, ...)`.

#### 2. Review of New Unit & Controlled Race Tests
- [tests/unit/product/g2.classroom.integration.test.ts#L228-L285](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/tests/unit/product/g2.classroom.integration.test.ts#L228-L285):
  - Global `false` + member override `true` => `capabilities` returns `false` for all 4 tools.
  - Malformed session tools + member override `true` => default deny (`boardWrite: false, upload: false, check: false, chat: false`).
  - Global `true` + member override `false` => overridden tool returns `false`.
  - Global `true` + override `true` / `undefined` => returns `true`.
- [tests/unit/product/g2.classroom.integration.test.ts#L666-L750](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/tests/unit/product/g2.classroom.integration.test.ts#L666-L750):
  - API execution across all 4 tools (`/boards/own`, `/submissions`, `/messages`, `/checks/:id/responses`):
    - Global `false` + member `true` => all 4 endpoints return `403`.
    - Malformed tools => all 4 endpoints return `403`.
    - Global `true` + member `true` => all 4 endpoints succeed (`200` / `201`).
    - `canWrite: false` => board write returns `403`, while chat succeeds (`201`).
- [tests/unit/product/g2.classroom.integration.test.ts#L751-L810](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/tests/unit/product/g2.classroom.integration.test.ts#L751-L810):
  - Controlled race under `lockSession`: teacher patches tool disable (`board: false` or `chat: false`) concurrent with student write attempt => teacher PATCH succeeds `200`, student write fails `403`.

---

### Part 2: Frontend Read-Only Inspection (`da0637f`)

Inspected [`da0637f`](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ui-completion-20261031) on branch `workers/classroom-wiring-20261101`:

#### 1. Strict Capabilities Default-Deny
- [src/product/LiveRoom.tsx#L453-L465](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ui-completion-20261031/src/product/LiveRoom.tsx#L453-L465):
  ```typescript
  const chatAllowed = grant
    ? s?.status === "live" && room?.capabilities?.chat === true
    : s?.status === "live" && s?.tools?.chat !== false;

  const checkAllowed = grant
    ? s?.status === "live" && room?.capabilities?.check === true
    : s?.status === "live" && s?.tools?.check !== false;

  const uploadAllowed = grant
    ? s?.status === "live" && room?.capabilities?.upload === true
    : false;
  ```
  - For student sessions (`grant !== null`), permissions strictly require `room?.capabilities?.[tool] === true`.
  - Removed fallback to global `s.tools` for students. If capabilities are absent or undefined, access is denied.
- [src/product/LiveRoom.tsx#L592-L596](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ui-completion-20261031/src/product/LiveRoom.tsx#L592-L596):
  - `canWrite`: `s.status === "live" && !inspectBoard && (!grant || room?.capabilities?.boardWrite === true)`. Strictly gates canvas mutation on `boardWrite === true`.

#### 2. Stage Projection & Dock Sync Boundaries
- [src/product/LiveRoom.tsx#L732-L745](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ui-completion-20261031/src/product/LiveRoom.tsx#L732-L745):
  - Presenting a student board on stage requires `b.ownerId === selected && b.shared && ...`.
  - Private unshared student draft boards cannot be projected onto the shared classroom stage (TOOL 002 constraint preserved).
- [src/product/LiveRoom.tsx#L421-L436](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ui-completion-20261031/src/product/LiveRoom.tsx#L421-L436):
  - `patchClassroom` uses a serialized promise queue (`patchQueue.current`) and fetches fresh session state to retrieve the exact `If-Match-Version`, preventing mutation overwrite races.
- [src/product/LiveRoom.tsx#L312](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ui-completion-20261031/src/product/LiveRoom.tsx#L312):
  - `if (typeof navigator !== "undefined" && !navigator.onLine) return;`: suppresses polling reload when offline, preserving the in-progress draft queue during disconnected state (LIVE 006).

#### 3. Privacy Boundaries
- [src/product/LiveRoom.tsx#L516-L520](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-ui-completion-20261031/src/product/LiveRoom.tsx#L516-L520):
  - Annotations passed to `MaterialViewer` use the backend safe projection (`room?.annotations || []`).
  - `sessionId` and `onSaved` callbacks are omitted for student callers (`grant ? undefined : ...`).
  - Claims, sensitive student goals, and teacher private notes are completely suppressed from the student view. Zero privacy regressions detected.

---

*QA worktree remains clean at commit `1501d80`. Standing by for Supervisor instructions.*

