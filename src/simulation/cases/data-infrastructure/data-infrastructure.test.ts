import { describe, expect, it } from "vitest";

import { compileExpiry, compileQuery, compileStartup } from "./compile";
import {
  advanceClock,
  averageOrderRead,
  CACHE_TTL_MIN,
  hitRatio,
  initialDataState,
  runQuery,
} from "./model";

describe("data layer", () => {
  it("reads an order cache-aside: a miss fills the cache, the next read hits", () => {
    const first = runQuery(initialDataState(), { kind: "order", id: 42 });
    expect(first.result.path).toBe("cacheMiss");
    const second = runQuery(first.state, { kind: "order", id: 42 });
    expect(second.result.path).toBe("cacheHit");
    expect(second.result.latencyMs * 10).toBeLessThan(first.result.latencyMs);
    expect(hitRatio(second.state)).toBe(0.5);
  });

  it("expires cached entries after their TTL", () => {
    const cached = runQuery(initialDataState(), { kind: "order", id: 7 }).state;
    const later = advanceClock(cached, CACHE_TTL_MIN);
    expect(later.expired).toBe(1);
    expect(runQuery(later.state, { kind: "order", id: 7 }).result.path).toBe(
      "cacheMiss",
    );
  });

  it("sends lists to PostgreSQL and similarity search to a vector store", () => {
    const state = initialDataState();
    expect(runQuery(state, { kind: "orders" }).result.path).toBe("relational");
    const vector = runQuery(state, { kind: "similar", store: "milvus" }).result;
    expect(vector.path).toBe("vector");
  });

  it("lowers the average order read as the cache warms up", () => {
    let state = initialDataState();
    for (let read = 0; read < 5; read++)
      state = runQuery(state, { kind: "order", id: 1 }).state;
    expect(averageOrderRead(state)).toBeLessThan(3);
    expect(hitRatio(state)).toBe(0.8);
  });
});

describe("data layer runs", () => {
  it("compiles every query path, expiry and startup", () => {
    let state = initialDataState();
    const next = { startAt: 0, sequence: 1 };
    for (const query of [
      { kind: "order", id: 1 },
      { kind: "order", id: 1 },
      { kind: "orders" },
      { kind: "similar", store: "pgvector" },
      { kind: "similar", store: "milvus" },
    ] as const) {
      const step = runQuery(state, query);
      state = step.state;
      expect(compileQuery(step.result, next).captions.length).toBeGreaterThan(
        0,
      );
    }
    expect(compileExpiry(1, next).captions[0]?.key).toBe("expired");
    expect(compileStartup(next).captions.map((caption) => caption.key)).toEqual(
      ["config", "connect", "ready"],
    );
  });
});
