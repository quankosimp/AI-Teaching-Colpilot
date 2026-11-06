import type { AIAdapter, CircuitStatus } from "./types.js";
import { FakeAIAdapter } from "./fakeAdapter.js";
import { RealGeminiAdapter } from "./geminiAdapter.js";
import { RealOpenAIAdapter } from "./openaiAdapter.js";

export * from "./types.js";
export * from "./sanitizer.js";
export * from "./circuitBreaker.js";
export { FakeAIAdapter } from "./fakeAdapter.js";
export { RealGeminiAdapter } from "./geminiAdapter.js";
export { RealOpenAIAdapter } from "./openaiAdapter.js";

let testAdapterOverride: AIAdapter | null = null;
let defaultFakeAdapter: FakeAIAdapter | null = null;
let defaultRealAdapter: RealGeminiAdapter | RealOpenAIAdapter | null = null;

type RealProvider = "openai" | "gemini";
/** Nhà cung cấp AI thật đang cấu hình. AI_PROVIDER chọn rõ; nếu không, có khoá OpenAI thì dùng OpenAI. */
export function activeAIProvider(): RealProvider | null {
  const wanted = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  const openai = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL);
  const gemini = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL);
  if (wanted === "openai") return openai ? "openai" : null;
  if (wanted === "gemini") return gemini ? "gemini" : null;
  return openai ? "openai" : gemini ? "gemini" : null;
}
export function isAIConfigured(): boolean {
  return activeAIProvider() !== null;
}
function realModel(provider: RealProvider) {
  return (provider === "openai" ? process.env.OPENAI_MODEL : process.env.GEMINI_MODEL) || "";
}

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

  // Real provider: if credentials and model are configured, can run in any environment (including local/test if developer provided keys)
  const provider = activeAIProvider();
  if (provider) {
    const model = realModel(provider);
    if (!defaultRealAdapter || defaultRealAdapter.provider !== provider || defaultRealAdapter.model !== model) {
      defaultRealAdapter =
        provider === "openai"
          ? new RealOpenAIAdapter({
              apiKey: process.env.OPENAI_API_KEY || "",
              model,
              reasoningEffort: process.env.OPENAI_REASONING_EFFORT || "low",
              baseUrl: process.env.OPENAI_BASE_URL || undefined,
            })
          : new RealGeminiAdapter({ apiKey: process.env.GEMINI_API_KEY || "", model });
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
  const real = activeAIProvider();
  const configured = real !== null;
  const realName: RealProvider = real ?? ((process.env.AI_PROVIDER || "openai").toLowerCase() === "gemini" ? "gemini" : "openai");
  const model = (real ? realModel(real) : "") || (realName === "openai" ? "gpt-5.4-mini" : "gemini-2.5-flash");
  const mockAllowed = isMockEnvironmentAllowed();
  const prod = isProductionOrStaging();

  if (testAdapterOverride && process.env.APP_MODE === "test" && !isProductionOrStaging()) {
    return testAdapterOverride.getCircuitStatus();
  }

  if (!enabled) {
    return {
      enabled: false,
      configured,
      provider: configured ? realName : mockAllowed ? "mock" : realName,
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
      provider: realName,
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
      provider: realName,
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
