# API contract v1: additive G1 changes

G1 adds `AuthMockInput`, `AuthResponse`, `TeacherMeResponse`, `StudentRecord`, `StudentResponse`, `StudentListResponse`, `VersionHeader`, and `REPLAY_ROUTES` exports. Existing v1 exports retain their meaning. Mock login accepts only `teacher-a` or `teacher-b` in explicitly permitted local/test mode; it returns `{ accessToken }`, while `GET /auth/me` returns `{ teacher, featureFlags }`.

Student creation accepts `StudentInput` without UI-specific initials/color; the server derives defaults. PATCH student/session and PUT activities require a positive `If-Match-Version`. Idempotent creation routes require `Idempotency-Key` and replay the same resource, never raw credentials or signed URLs. `GET /materials/:id/read-url?version=N` returns a short-lived URL for an authorized ready material version.
