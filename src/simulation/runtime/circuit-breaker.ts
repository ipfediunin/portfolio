export type BreakerState = "closed" | "open" | "half-open";

/**
 * Circuit breaker around a flaky dependency. Closed: calls go through and failures are counted;
 * `failureThreshold` failures in a row open it. Open: calls fail fast without touching the
 * dependency. After `cooldownMs` one trial call is let through (half-open): success closes the
 * circuit, failure opens it again. Time is wall time in ms.
 */
export class CircuitBreaker {
  private current: BreakerState = "closed";
  private failures = 0;
  private openedAt = 0;

  constructor(
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
  ) {}

  get state(): BreakerState {
    return this.current;
  }

  /** Failures in a row since the last success. */
  get failureCount(): number {
    return this.failures;
  }

  /**
   * Asks to make a call at `now`. Returns the state the call is made in: "open" means fail fast,
   * "half-open" means this is the single trial call.
   */
  request(now: number): BreakerState {
    if (this.current === "open" && now - this.openedAt >= this.cooldownMs)
      this.current = "half-open";
    else if (this.current === "half-open")
      // The trial is already in flight; everyone else fails fast until it reports back.
      return "open";
    return this.current;
  }

  /** Reports how the call went; returns the state afterwards. */
  record(ok: boolean, now: number): BreakerState {
    if (ok) {
      this.current = "closed";
      this.failures = 0;
      return this.current;
    }
    this.failures += 1;
    if (
      this.current === "half-open" ||
      this.failures >= this.failureThreshold
    ) {
      this.current = "open";
      this.openedAt = now;
    }
    return this.current;
  }

  reset(): void {
    this.current = "closed";
    this.failures = 0;
    this.openedAt = 0;
  }
}
