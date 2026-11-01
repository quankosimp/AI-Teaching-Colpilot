export interface CircuitBreakerConfig {
  failureThreshold?: number;
  cooldownMs?: number;
}

export class CircuitBreaker {
  private failures = 0;
  private isOpen = false;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(config: CircuitBreakerConfig = {}) {
    this.failureThreshold = config.failureThreshold ?? 3;
    this.cooldownMs = config.cooldownMs ?? 20_000;
  }

  canExecute(): boolean {
    if (!this.isOpen) return true;
    const now = Date.now();
    if (now - this.lastFailureTime >= this.cooldownMs) {
      // Half-open: allow a trial request
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.isOpen = false;
    this.lastFailureTime = 0;
  }

  recordFailure(): void {
    this.failures += 1;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.isOpen = true;
    }
  }

  getStatus() {
    const now = Date.now();
    const effectiveOpen =
      this.isOpen && now - this.lastFailureTime < this.cooldownMs;
    return {
      circuitOpen: effectiveOpen,
      consecutiveFailures: this.failures,
      lastFailureTime: this.lastFailureTime || null,
    };
  }

  reset(): void {
    this.failures = 0;
    this.isOpen = false;
    this.lastFailureTime = 0;
  }
}
