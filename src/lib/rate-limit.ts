/**
 * Sliding-window limit per key (e.g. per IP): at most `limit` hits within `windowMs`.
 * In memory, so it is per server instance — a best-effort brake against floods, not a quota.
 */
export class KeyedRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    /** Keys kept at most; the stalest are dropped first, so memory stays bounded. */
    private readonly maxKeys = 5000,
  ) {}

  /** Records a hit at `now` (ms); false means the key is over the limit. */
  take(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter(
      (at) => now - at < this.windowMs,
    );
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.delete(key);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) this.hits.delete(oldest);
    }
    return true;
  }
}
