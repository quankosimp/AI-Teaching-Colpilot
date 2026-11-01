export interface CircuitBreakerConfig {
  failureThreshold?: number;
  cooldownMs?: number;
}

export class CircuitBreaker {
  private failures = 0;
  private isOpen = false;
  private lastFailureTime = 0;
  private halfOpenInFlight = false;
  readonly failureThreshold: number;
  readonly cooldownMs: number;

  constructor(config: CircuitBreakerConfig = {}) {
    this.failureThreshold = config.failureThreshold ?? 3;
    this.cooldownMs = config.cooldownMs ?? 20_000;
  }

  canExecute(): boolean {
    if (!this.isOpen) return true;
    const now = Date.now();
    if (now - this.lastFailureTime >= this.cooldownMs) {
      // Exclusive half-open: allow exactly one trial request
      if (!this.halfOpenInFlight) {
        this.halfOpenInFlight = true;
        return true;
      }
      return false;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.isOpen = false;
    this.lastFailureTime = 0;
    this.halfOpenInFlight = false;
  }

  recordFailure(): void {
    this.halfOpenInFlight = false;
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
      cooldownMs: this.cooldownMs,
    };
  }

  reset(): void {
    this.failures = 0;
    this.isOpen = false;
    this.lastFailureTime = 0;
    this.halfOpenInFlight = false;
  }
}
