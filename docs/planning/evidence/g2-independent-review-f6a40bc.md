Showing 1 of 243 activities (limited to 1)

### Independent Backend Review Report: Candidate `f6a40bcf9d14939e2d61f177b3cdce34b70e1a31`

**Review Verdict**: **NEEDS_FIXES** (1 blocker identified in tool capability override semantics; all 3 other areas PASS).

---

#### 1. Historical Duplicates with Soft-Deletes (`202611010006`) — **PASS**
- **Deleted Records Included**: [prisma/migrations/202611010006_historical_duplicate_sources/migration.sql#L6-L16](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/prisma/migrations/202611010006_historical_duplicate_sources/migration.sql#L6-L16) omits `status <> 'deleted'` filter on the `linked` CTE, ensuring duplicate source groups containing soft-deleted records are evaluated.
- **Repair Invariants**:
  - `ClaimRevision` logged with `reason = 'source_unverified'`, `actorId = 'migration:duplicate_source_corrective'` (lines 25–28).
  - Target `Claim` updated to `status = 'pending'`, `staleReason = 'source_unverified'`, `revision = revision + 1` (lines 30–36).
  - `AuditLog` entry created (`action = 'claim.source_unverified'`) (lines 38–44).
  - Session reopened with `"endedAt" = COALESCE(s."endedAt", CURRENT_TIMESTAMP)` preserving original session termination timestamp (lines 46–52).
- **Migration 0005 Untouched**: Verified via git log; `202611010005_duplicate_source_claims` is unaltered.

---

#### 2. `isAuto` Differentiation & Manual Observation Preservation — **PASS**
- **Schema & Generation**:
  - [prisma/migrations/202611010007_annotation_shared_and_evidence_auto/migration.sql#L2-L3](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/prisma/migrations/202611010007_annotation_shared_and_evidence_auto/migration.sql#L2-L3) introduces `isAuto BOOLEAN DEFAULT false` on `Evidence` and `EvidenceRevision`.
  - [server/reviseSourceEvidence.ts#L18-L20](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/reviseSourceEvidence.ts#L18-L20) partitions `rows.filter(r => r.isAuto)` vs manual observations. Only auto rows receive updated detail, support, and incremented version. Manual observations preserve detail and support unchanged.
  - All claims linked to any source observation (`rows.map(r => r.id)`) are invalidated to `pending` with `staleReason: 'source_corrected'` (lines 63–87). Reopened session preserves `endedAt` (lines 93–100).
- **Stale Manual Observation Revalidation Guard**:
  - Approval check in [server/routes/review.ts#L932-L946](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/review.ts#L932-L946) & [#L1057-L1067](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/review.ts#L1057-L1067) enforces `resolveCurrentSourceVersion(...) === item.sourceVersion`. Because manual observations retain their prior `sourceVersion`, approving dependent claims throws `409 Conflict: VERSION_CONFLICT` until explicit teacher PATCH.
  - No-op check in [server/routes/review.ts#L415-L425](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/review.ts#L415-L425) includes `(currentSourceVer === null || currentSourceVer === evidence.sourceVersion)`. When the underlying source has advanced, no-op does not bypass; the PATCH proceeds to advance `sourceVersion: resolvedVer` (lines 447–453).
- **Canonical Grade Response**: [server/routes/classroom.ts#L2852-L2860](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/classroom.ts#L2852-L2860) & [#L3381-L3395](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/classroom.ts#L3381-L3395) locates `autoRow = linked.find(r => r.isAuto)` deterministically.

---

#### 3. Capability Flags & Global Tool Overrides — **NEEDS_FIXES**
- **Absence / Malformed Deny (PASS)**:
  - [server/routes/classroom.ts#L182-L187](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/classroom.ts#L182-L187) & [#L1941-L1944](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/classroom.ts#L1941-L1944) correctly falls back to `{ board: false, upload: false, check: false, chat: false }` on invalid `session.tools`.
- **Global Tool Disable Override Leak (BLOCKER)**:
  - In [server/routes/classroom.ts#L1957-L1966](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/classroom.ts#L1957-L1966):
    ```typescript
    const toolEffective = (toolKey: "board" | "upload" | "check" | "chat") => {
      if (!isLiveJoinedGranted) return false;
      if (memberOverrides[toolKey] !== undefined) {
        return Boolean(memberOverrides[toolKey]); // BUG: Returns true even if sessionTools[toolKey] === false
      }
      return Boolean(sessionTools[toolKey]);
    };
    ```
    When global `sessionTools[toolKey] === false` (or malformed default-deny), setting `memberOverrides[toolKey] = true` returns `capabilities[toolKey] = true`.
  - Similarly, in [server/routes/classroom.ts#L255-L263](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/classroom.ts#L255-L263) (`lockLiveAccess`):
    ```typescript
    const toolAllowed = tool === "reaction" ? true : overrides?.[tool] !== undefined ? overrides[tool] : tools[tool];
    ```
    and in [server/routes/classroom.ts#L2253-L2254](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/classroom.ts#L2253-L2254):
    ```typescript
    const boardEnabled = overrides?.board !== undefined ? overrides.board : tools.board;
    ```
  - **Required Fix**: Member tool overrides can only restrict an enabled global tool, never enable a globally disabled tool. The rule `sessionTools[toolKey] && (memberOverrides[toolKey] ?? true)` (matching `StudentToolWriteContext` in `contracts/domain.ts#L224-L225`) must be enforced across all three paths.

---

#### 4. Student Annotation Scoping & Privacy — **PASS**
- **Strict Scope & Privacy**: [server/routes/classroom.ts#L1976-L2005](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/server/routes/classroom.ts#L1976-L2005) filters by `activityId`, `materialId`, `materialVersion`, `page: session.materialPage`, and `OR: [{ studentId: actor.studentId }, { sharedWithClass: true }]`.
  - Historical unattributed annotations (`studentId: null, sharedWithClass: false`) remain private to the teacher.
  - Attributed student annotations are hidden from other students.
  - Projections expose only safe marks (`id`, `page`, `x`, `y`, `text`).
- **Attributed Source Class-Share Rejection**: [contracts/api.ts#L79-L88](file:///home/quanan/.paseo/worktrees/2qimpyn4/teaching-demo-verification-20261031/contracts/api.ts#L79-L88) `AnnotationInput.superRefine` rejects payloads with both `sharedWithClass === true` and `studentId` present.

---

*QA worktree state maintained clean at HEAD `1501d80`. Standing by for Supervisor instructions.*
[System Error] Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 32h34m31s.
