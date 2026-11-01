import { test } from "node:test";
import { strict as assert } from "node:assert";
import { BoundedReconnectQueue } from "../../../src/product/reconnectQueue";

test("queue preserves rejected drafts and respects count, byte, expiry and ended limits", async () => {
  const queue = new BoundedReconnectQueue();
  const draft = { text: "keep this draft" };
  const input = {
    sessionId: "session",
    path: "/board",
    method: "PUT" as const,
    idempotencyKey: "key",
    idempotent: true,
    payload: draft,
    now: 1000,
  };
  for (let i = 0; i < 50; i++)
    assert.equal(
      queue.enqueue({ ...input, idempotencyKey: String(i) }).accepted,
      true,
    );
  const full = queue.enqueue({ ...input, draft });
  assert.equal(full.accepted, false);
  if (!full.accepted) {
    assert.equal(full.reason, "queue_full");
    assert.deepEqual(full.preservedDraft, draft);
  }
  const after = await queue.flush(
    "ended",
    async () => {
      throw Error("must not replay");
    },
    1001,
  );
  assert.equal(after.droppedAfterEnd, 50);
  assert.equal(queue.size, 0);
  const tooBig = queue.enqueue({
    ...input,
    payload: { text: "a".repeat(1024 * 1024) },
    draft,
  });
  assert.equal(tooBig.accepted, false);
  if (!tooBig.accepted) {
    assert.equal(tooBig.reason, "payload_too_large");
    assert.deepEqual(tooBig.preservedDraft, draft);
  }
  queue.enqueue(input);
  assert.equal(queue.pruneExpired(301001), 1);
});
