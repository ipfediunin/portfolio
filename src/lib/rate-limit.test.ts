import { describe, expect, it } from "vitest";

import { KeyedRateLimiter } from "./rate-limit";

describe("KeyedRateLimiter", () => {
  it("allows up to the limit per window, per key", () => {
    const limiter = new KeyedRateLimiter(2, 1000);
    expect(limiter.take("a", 0)).toBe(true);
    expect(limiter.take("a", 100)).toBe(true);
    expect(limiter.take("a", 200)).toBe(false);
    expect(limiter.take("b", 200)).toBe(true);
  });

  it("frees capacity as old hits leave the window", () => {
    const limiter = new KeyedRateLimiter(2, 1000);
    limiter.take("a", 0);
    limiter.take("a", 500);
    expect(limiter.take("a", 999)).toBe(false);
    expect(limiter.take("a", 1000)).toBe(true);
  });

  it("keeps memory bounded by dropping the stalest keys", () => {
    const limiter = new KeyedRateLimiter(1, 10_000, 2);
    limiter.take("a", 0);
    limiter.take("b", 1);
    limiter.take("c", 2);
    // "a" was evicted, so it starts afresh.
    expect(limiter.take("a", 3)).toBe(true);
  });
});
