# G4 targeted recheck — 26318dc

Exact source: `26318dcce1f9121a4534ed4778a7923c2092bf81`. Supervisor verdict: **NEEDS_FIXES**, independent review of the broader changes is pending.

- **SG4-06 HIGH — Applied migration rewritten.** Candidate23e5fd7's008 migration adds two AIRequest columns and has SHA-256 `352e6ae7428c7f7e59b44705a74d2060baa1b748903414b274b2be06d235604d`. A supervisor read-only query of recovery `_prisma_migrations` confirms that exact008 checksum is already applied. Candidate26318dc prepends four AIKind enum additions to the same008 file, changing its checksum to `e8cf24efc9f06785a2e2c7490881930c05c58c871f8319d4e6a6128e07a538f6`. Existing databases will not receive those additions by deploying an already-applied migration. Restore008 exactly and add009; verify staged upgrade and fresh deploy without resetting data or modifying migration metadata.
- **Remaining source boundary:** The draft route's final candidate predicate checks live evidence IDs but must also require every ID to belong to the pre-provider eligible snapshot and remain source-current. Newly added or previously excluded evidence was never shown to the model. The in-flight coordinator also needs a failed-first-attempt/multiple-waiter regression so the next owner is acquired atomically.

The producer received these concrete findings. No runtime acceptance, source integration or real Gemini verification is implied by its remediation report. The accepted Docker application remains55c05e1.
