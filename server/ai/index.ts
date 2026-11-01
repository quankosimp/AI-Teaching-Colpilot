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

export function isAIEnabled(): boolean {
  return process.env.ENABLE_AI === "true";
}

export function isProductionOrStaging(): boolean {
  const appMode = process.env.APP_MODE;
  const nodeEnv = process.env.NODE_ENV;
  return (
    appMode === "production" ||
    appMode === "staging" ||
    nodeEnv === "production" ||
    nodeEnv === "staging"
  );
}

export function isMockEnvironmentAllowed(): boolean {
  const appMode = process.env.APP_MODE;
  const nodeEnv = process.env.NODE_ENV;
  const nonProd = nodeEnv !== "production" && nodeEnv !== "staging";
  return nonProd && (appMode === "local_mock" || appMode === "test");
}

export function getAIAdapter(): AIAdapter | null {
  if (testAdapterOverride && process.env.APP_MODE === "test" && !isProductionOrStaging()) {
    return testAdapterOverride;
  }

  if (!isAIEnabled()) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;

  // Real Gemini: if credentials and model are configured, can run in any environment (including local/test if developer provided keys)
  if (apiKey && model) {
    if (!defaultRealAdapter || defaultRealAdapter.model !== model) {
      defaultRealAdapter = new RealGeminiAdapter({ apiKey, model });
    }
    return defaultRealAdapter;
  }

  // If credentials are NOT configured:
  // In production or staging, NEVER silently fall back to mock! It is misconfiguration.
  if (isProductionOrStaging()) {
    return null;
  }

  // Only explicit local_mock or test mode in non-production may use FakeAIAdapter
  if (isMockEnvironmentAllowed()) {
    if (!defaultFakeAdapter) {
      defaultFakeAdapter = new FakeAIAdapter();
    }
    return defaultFakeAdapter;
  }

  return null;
}

export function setAIAdapterForTesting(adapter: AIAdapter | null): void {
  const appMode = process.env.APP_MODE;
  const nodeEnv = process.env.NODE_ENV;
  if (appMode !== "test" || nodeEnv === "production" || nodeEnv === "staging") {
    throw new Error(
      "Test adapter override is only permitted when APP_MODE=test and NODE_ENV is non-production",
    );
  }
  testAdapterOverride = adapter;
}

export function resetAIAdapterForTesting(): void {
  testAdapterOverride = null;
  defaultFakeAdapter = null;
  defaultRealAdapter = null;
}

export function getCircuitStatus(): CircuitStatus {
  const enabled = isAIEnabled();
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const configured = Boolean(apiKey && process.env.GEMINI_MODEL);
  const mockAllowed = isMockEnvironmentAllowed();
  const prod = isProductionOrStaging();

  if (testAdapterOverride && process.env.APP_MODE === "test" && !isProductionOrStaging()) {
    return testAdapterOverride.getCircuitStatus();
  }

  if (!enabled) {
    return {
      enabled: false,
      configured,
      provider: configured ? "gemini" : mockAllowed ? "mock" : "gemini",
      model,
      circuitOpen: true,
      consecutiveFailures: 0,
    };
  }

  if (configured) {
    const adapter = getAIAdapter();
    if (adapter) return adapter.getCircuitStatus();
    return {
      enabled: true,
      configured: true,
      provider: "gemini",
      model,
      circuitOpen: false,
      consecutiveFailures: 0,
    };
  }

  if (prod || !mockAllowed) {
    // Production/staging misconfigured
    return {
      enabled: true,
      configured: false,
      provider: "gemini",
      model,
      circuitOpen: true,
      consecutiveFailures: 0,
    };
  }

  // Local/test mock fallback
  const fake = defaultFakeAdapter || new FakeAIAdapter();
  defaultFakeAdapter = fake;
  return fake.getCircuitStatus();
}
