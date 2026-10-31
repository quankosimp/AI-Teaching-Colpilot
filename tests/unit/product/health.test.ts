import { test } from "node:test";
import { strict as assert } from "node:assert";
import { once } from "node:events";
import { createApp } from "../../../server/app";

test("liveness endpoint responds without reporting dependency readiness", async () => {
  const server = createApp().listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/health/live`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
    assert.equal(response.headers.get("x-powered-by"), null);
  } finally {
    server.close();
    await once(server, "close");
  }
});
