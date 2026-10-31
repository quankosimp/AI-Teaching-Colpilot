# Evidence submissions

QA/reviewers submit evidence rows to supervisor. Do not mark canonical RTM accepted themselves.

Required: TestID, SRS_ID, testedCommitSHA, contractVersion, environment (CI-Mock/Real-HTTPS), state, command/scenario, outcome, artifact URI/hash, timestamp, limitations. Scenario states: planned/running/passed/failed/blocked/skipped. Positive/negative cases may share table-driven code. Real Google OAuth/Zoom/Gemini requires actual HTTPS/provider evidence. Never attach raw tokens, secrets, private file contents or unnecessary student data. /tmp screenshots are transient; publish repeatable CI artifacts or a durable sanitized report for release acceptance.
