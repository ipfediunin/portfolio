import { describe, expect, it } from "vitest";

import { systemGraphSchema } from "../model/graph";
import { SeededRng } from "../runtime/seeded-rng";
import { cityGraph } from "./city";

describe("city graph", () => {
  it("passes every layout rule", () => {
    expect(systemGraphSchema.safeParse(cityGraph).success).toBe(true);
  });

  it("rejects overlapping buildings", () => {
    const [first] = cityGraph.nodes;
    if (!first) throw new Error("Expected nodes");
    const clone = { ...first, id: "clone" };
    expect(
      systemGraphSchema.safeParse({
        ...cityGraph,
        nodes: [...cityGraph.nodes, clone],
      }).success,
    ).toBe(false);
  });

  it("rejects buildings that touch a road", () => {
    const onRoad = {
      ...cityGraph.nodes[0]!,
      id: "on-road",
      tile: { x: 4.9, y: 5.5 },
    };
    const result = systemGraphSchema.safeParse({
      ...cityGraph,
      nodes: [...cityGraph.nodes, onRoad],
    });
    expect(result.success).toBe(false);
  });

  it("rejects elongated footprints that would break depth sorting", () => {
    const elongated = {
      ...cityGraph.nodes[0]!,
      id: "elongated",
      tile: { x: 12.5, y: 14 },
      footprint: { width: 3, depth: 1 },
    };
    expect(
      systemGraphSchema.safeParse({
        ...cityGraph,
        nodes: [...cityGraph.nodes, elongated],
      }).success,
    ).toBe(false);
  });

  it("rejects diagonal link segments and unknown endpoints", () => {
    const diagonal = {
      id: "l.diagonal",
      from: "gateway",
      to: "nowhere",
      protocol: "http",
      flow: "sync",
      route: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    };
    const result = systemGraphSchema.safeParse({
      ...cityGraph,
      links: [...cityGraph.links, diagonal],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("nowhere"),
        expect.stringContaining("axis-aligned"),
      ]),
    );
  });
});

describe("hero journey", () => {
  it("rejects hops that do not chain", () => {
    const broken = {
      ...cityGraph,
      heroJourney: {
        label: "GET /broken",
        hops: [{ link: "l.web-gateway" }, { link: "l.orders-db" }],
        resultNode: "gateway",
        status: "200 OK",
        intervalMs: 1000,
      },
    };
    const result = systemGraphSchema.safeParse(broken);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("expected");
  });
});

describe("SeededRng", () => {
  it("is deterministic per seed", () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    const sequenceA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(sequenceA);
    expect(new SeededRng(7).next()).not.toBe(sequenceA[0]);
  });

  it("stays within range", () => {
    const rng = new SeededRng(1);
    for (let index = 0; index < 1000; index++) {
      const value = rng.range(2, 5);
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThan(5);
    }
  });
});
