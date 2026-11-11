import { describe, expect, it } from "vitest";

import { cityGraph } from "../graphs/city";
import { scenarioFootprints, scenariosThroughNode } from "./footprint";

describe("scenario footprints", () => {
  const footprints = scenarioFootprints(cityGraph);

  it("follows the synchronous path of a read", () => {
    const read = footprints.get("sync-read");
    for (const nodeId of [
      "client.web",
      "gateway",
      "api.auth",
      "api.orders",
      "db.postgres",
    ])
      expect(read?.has(nodeId)).toBe(true);
    expect(read?.has("broker.rabbit")).toBe(false);
  });

  it("stops a rejected request where it was rejected", () => {
    // The sample body is invalid: the API answers 422 and the database is never reached.
    expect(footprints.get("validation")?.has("api.orders")).toBe(true);
    expect(footprints.get("validation")?.has("db.postgres")).toBe(false);
  });

  it("includes side effects such as the DLQ alert", () => {
    expect(scenariosThroughNode(footprints, "dlq")).toEqual(["dead-letter"]);
    expect(scenariosThroughNode(footprints, "monitoring")).toEqual([
      "dead-letter",
    ]);
  });

  it("lists every scenario through the gateway, in catalog order", () => {
    expect(scenariosThroughNode(footprints, "gateway")).toEqual([
      "sync-read",
      "cache",
      "validation",
      "auth",
      "rate-limit",
      "async-job",
      "retry",
      "dead-letter",
      "circuit-breaker",
      "fan-out",
      "chaos",
    ]);
  });
});
