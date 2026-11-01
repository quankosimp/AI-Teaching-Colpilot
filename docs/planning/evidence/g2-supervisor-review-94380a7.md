# Supervisor review of G2 candidate 94380a7

This is a static review of exact commit `94380a7e2fb277c5b268a02217361e59bf524f95`, not a claim of runtime reproduction or gate acceptance. Product reported real HTTP/socket and limited three-context browser checks separately. G2 remains open.

| Finding | Scope and evidence | Required remediation |
|---|---|---|
| SG2-01 | ROOM 004 / TOOL 007: `checkStudentToolAccess` supplies `member.canWrite` for board, check, upload, chat and reactions alike. | Apply the board-write lock to board commands; independently enforce other tool capabilities. Test locked-board chat/submission/check behavior. |
| SG2-02 | ROOM 005 / TOOL 001 / LIVE 006: board PUT reads and computes strokes before its transaction, then overwrites the board without idempotency replay handling. Parallel updates can lose a stroke; repeated add requests can duplicate one. | Serialize board read/modify/write, validate current permissions in transaction and deduplicate retries. Verify concurrent preservation and same-key replay once. |
| SG2-03 | LIVE 001,005 / ROOM 001,003,004 / TOOL 004: lifecycle and tool permission/window checks occur before mutation transactions; start/end transitions lack a shared row lock or conditional transition. | Consistent transaction serialization/revalidation across lifecycle, grants, tool commands and check windows; conditional version updates and explicit race responses. Test end/revoke/disable races and concurrent start/end. |
| SG2-04 | AUTH 003 / ROOM 006: socket principals retain no JWT expiration; revalidation checks the 12-hour grant instead of the 15-minute access JWT, and idle sockets have no expiry timer. | Disconnect expired sockets, refresh/reconnect explicitly and verify short-token idle expiry plus revoke behavior. |
| SG2-05 | EVD 003 / REV 002,004: approval validates sources before its transaction; complete-review counts pending claims outside its transaction. Concurrent correction or claim creation can invalidate those checks. | Validate source revisions, claim changes and review completion under consistent transaction boundaries; reject stale versions. Test approval vs correction and completion vs pending creation/edit. |

All five findings were sent to the sole Product writer. Follow-up `020f8630002735a19c76f88dc86e904d3a8de54d` reports fixes and integration tests for SG2-01/02/04, plus private PDF/image submission UI. Those fixes still require supervisor or independent verification. SG2-03/05 remain open; no G2 gate accepted.
