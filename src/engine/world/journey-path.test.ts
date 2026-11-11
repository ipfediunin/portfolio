import { describe, expect, it } from "vitest";

import { cityGraph } from "@/simulation/graphs/city";

import { planJourneyPath, reverseJourneyPath } from "./journey-path";

describe("planJourneyPath", () => {
  const journey = cityGraph.heroJourney;
  if (!journey) throw new Error("The city graph defines a hero journey");
  const outbound = planJourneyPath(cityGraph, journey);

  it("arrives at every hop target in order", () => {
    expect(outbound.arrivals.map((arrival) => arrival.nodeId)).toEqual([
      "gateway",
      "api.orders",
      "db.postgres",
    ]);
    const distances = outbound.arrivals.map((arrival) => arrival.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(distances.at(-1)).toBeCloseTo(outbound.length);
  });

  it("never repeats a point", () => {
    outbound.points.slice(1).forEach((point, index) => {
      expect(point).not.toEqual(outbound.points[index]);
    });
  });

  it("returns along the same path back to the origin", () => {
    const inbound = reverseJourneyPath(outbound, "client.web");
    expect(inbound.arrivals.map((arrival) => arrival.nodeId)).toEqual([
      "api.orders",
      "gateway",
      "client.web",
    ]);
    expect(inbound.points[0]).toEqual(outbound.points.at(-1));
    expect(inbound.points.at(-1)).toEqual(outbound.points[0]);
    expect(inbound.arrivals.at(-1)?.distance).toBeCloseTo(outbound.length);
  });

  it("rejects unknown links", () => {
    expect(() =>
      planJourneyPath(cityGraph, {
        ...journey,
        hops: [{ link: "l.nowhere", reverse: false }],
      }),
    ).toThrow();
  });
});
