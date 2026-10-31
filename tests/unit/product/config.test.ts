import { test } from "node:test";
import { strict as assert } from "node:assert";
import { loadConfig } from "../../../server/context";

test("mock mode cannot be enabled when NODE_ENV is production or staging", () => {
  const old = { ...process.env };
  try {
    process.env.APP_MODE = "local_mock";
    process.env.JWT_SECRET = "local-test-only-012345678901234567890123456789";
    process.env.APP_ORIGIN = "http://localhost:3000";
    process.env.NODE_ENV = "production";
    assert.throws(() => loadConfig(), /Mock mode is forbidden/);
    process.env.NODE_ENV = "staging";
    assert.throws(() => loadConfig(), /Mock mode is forbidden/);
    process.env.NODE_ENV = "development";
    assert.equal(loadConfig().mode, "local_mock");
  } finally {
    process.env = old;
  }
});
