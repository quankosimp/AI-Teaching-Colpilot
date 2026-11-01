import { test } from "node:test";
import assert from "node:assert/strict";
import { MediaLifecycle } from "../../../src/product/media/lifecycle";
import type { MediaSessionHandle } from "../../../src/product/media/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("media cancels delayed creation and serializes old teardown before a new room joins", async () => {
  const oldRoom = new MediaLifecycle();
  const newRoom = new MediaLifecycle();
  const created = deferred<MediaSessionHandle>();
  const destroyed = deferred<void>();
  const events: string[] = [];
  const first = oldRoom.start(async (signal) => {
    events.push("old-start");
    signal.addEventListener("abort", () => events.push("old-cancel"));
    return created.promise;
  }, () => events.push("stale-ready"), () => events.push("stale-error"));
  await tick();
  const stopped = oldRoom.stop();
  const next = newRoom.start(async () => {
    events.push("new-start");
    return { destroy: async () => { events.push("new-destroy"); } } as MediaSessionHandle;
  }, () => events.push("new-ready"), (error) => assert.fail(String(error)));
  created.resolve({ destroy: async () => { events.push("old-destroy"); await destroyed.promise; } } as MediaSessionHandle);
  await tick();
  assert.deepEqual(events, ["old-start", "old-cancel", "old-destroy"]);
  destroyed.resolve();
  await Promise.all([first, stopped, next]);
  assert.deepEqual(events, ["old-start", "old-cancel", "old-destroy", "new-start", "new-ready"]);
  await newRoom.stop(); await newRoom.stop();
  assert.equal(events.filter((event) => event === "new-destroy").length, 1);
});

test("an aborted provider error never notifies the unmounted room and does not block retry", async () => {
  const lifecycle = new MediaLifecycle();
  let failed = 0, ready = 0;
  const started = deferred<void>();
  const pending = lifecycle.start(async (signal) => {
    started.resolve();
    await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    throw new Error("unreachable");
  }, assert.fail, () => { failed++; });
  await started.promise;
  await lifecycle.stop(); await pending;
  assert.equal(failed, 0);
  await lifecycle.start(async () => ({ destroy: async () => {} }) as MediaSessionHandle, () => { ready++; }, (error) => assert.fail(String(error)));
  assert.equal(ready, 1);
  await lifecycle.stop();
});
