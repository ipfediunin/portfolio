import { describe, expect, it } from "vitest";

import { CircuitBreaker } from "./circuit-breaker";

describe("CircuitBreaker", () => {
  it("opens after the threshold of failures in a row", () => {
    const breaker = new CircuitBreaker(3, 8000);
    for (let call = 0; call < 2; call++) {
      expect(breaker.request(0)).toBe("closed");
      expect(breaker.record(false, 0)).toBe("closed");
    }
    expect(breaker.request(0)).toBe("closed");
    expect(breaker.record(false, 0)).toBe("open");
    expect(breaker.request(100)).toBe("open");
  });

  it("forgets failures after a success", () => {
    const breaker = new CircuitBreaker(3, 8000);
    breaker.record(false, 0);
    breaker.record(false, 0);
    breaker.record(true, 0);
    breaker.record(false, 0);
    expect(breaker.state).toBe("closed");
  });

  it("lets a single trial through after the cooldown and closes on success", () => {
    const breaker = new CircuitBreaker(1, 8000);
    breaker.record(false, 1000);
    expect(breaker.request(8999)).toBe("open");
    expect(breaker.request(9000)).toBe("half-open");
    // Others fail fast while the trial is in flight.
    expect(breaker.request(9000)).toBe("open");
    expect(breaker.record(true, 9100)).toBe("closed");
    expect(breaker.request(9200)).toBe("closed");
  });

  it("opens again when the trial fails, with a fresh cooldown", () => {
    const breaker = new CircuitBreaker(1, 8000);
    breaker.record(false, 0);
    expect(breaker.request(8000)).toBe("half-open");
    expect(breaker.record(false, 8000)).toBe("open");
    expect(breaker.request(15_000)).toBe("open");
    expect(breaker.request(16_000)).toBe("half-open");
  });
});
