/** Classic token bucket: `capacity` requests at once, refilled continuously at `refillPerSecond`. */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number | null = null;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
  }

  /** Takes one token at wall time `now` (ms); false means the request must be rejected. */
  take(now: number): boolean {
    if (this.lastRefill !== null) {
      const elapsedSeconds = Math.max(0, now - this.lastRefill) / 1000;
      this.tokens = Math.min(
        this.capacity,
        this.tokens + elapsedSeconds * this.refillPerSecond,
      );
    }
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = null;
  }
}
