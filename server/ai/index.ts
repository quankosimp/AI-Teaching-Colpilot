import type { AIAdapter, CircuitStatus } from "./types.js";
import { FakeAIAdapter } from "./fakeAdapter.js";
import { RealGeminiAdapter } from "./geminiAdapter.js";

export * from "./types.js";
export * from "./sanitizer.js";
export * from "./circuitBreaker.js";
export { FakeAIAdapter } from "./fakeAdapter.js";
export { RealGeminiAdapter } from "./geminiAdapter.js";

let testAdapterOverride: AIAdapter | null = null;
let defaultFakeAdapter: FakeAIAdapter | null = null;
let defaultRealAdapter: RealGeminiAdapter | null = null;

export function getAIAdapter(): AIAdapter {
  if (testAdapterOverride) {
    return testAdapterOverride;
  }

  const enabled = process.env.ENABLE_AI === "true";
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  const appMode = process.env.APP_MODE || "local_mock";

  // Real Gemini requires explicit enable, valid credentials, and non-mock environment
  if (enabled && apiKey && model && appMode !== "local_mock" && appMode !== "test") {
    if (!defaultRealAdapter || defaultRealAdapter.model !== model) {
      defaultRealAdapter = new RealGeminiAdapter({ apiKey, model });
    }
    return defaultRealAdapter;
  }

  // Guarded local/test fake adapter with honest mock labeling
  if (!defaultFakeAdapter) {
    defaultFakeAdapter = new FakeAIAdapter();
  }
  return defaultFakeAdapter;
}

export function setAIAdapterForTesting(adapter: AIAdapter | null): void {
  testAdapterOverride = adapter;
}

export function resetAIAdapterForTesting(): void {
  testAdapterOverride = null;
  defaultFakeAdapter = null;
  defaultRealAdapter = null;
}

export function getCircuitStatus(): CircuitStatus {
  return getAIAdapter().getCircuitStatus();
}
