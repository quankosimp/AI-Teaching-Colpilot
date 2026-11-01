import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCurrentSourceVersion } from "../../../server/routes/review.js";

test("only a teacher note may have a current source version without a resource ID", async () => {
  for (const type of ["board_attempt", "check_response", "annotation", "submission", "ai_suggestion", "unknown"]) {
    for (const id of [null, "not-a-uuid"]) assert.equal(await resolveCurrentSourceVersion(type, id, "session"), 0, `${type}/${id}`);
  }
  assert.equal(await resolveCurrentSourceVersion("note", null, "session"), 1);
});
