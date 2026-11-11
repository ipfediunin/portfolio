import { describe, expect, it } from "vitest";

import { measureBotsIntegrationsImpact } from "./bots-integrations/impact";
import { measureCorporateMessengerImpact } from "./corporate-messenger/impact";
import { measureDataInfrastructureImpact } from "./data-infrastructure/impact";
import { dispatchTasks } from "./event-driven/model";
import { measureEventDrivenImpact } from "./event-driven/impact";
import { compareImpact, improves, mean, type ImpactMeasure } from "./impact";
import { measureKnowledgeBaseImpact } from "./knowledge-base/impact";
import { measureProcessAutomationImpact } from "./process-automation/impact";
import { measureScientificDataImpact } from "./scientific-data/impact";
import { measureWebApplicationsImpact } from "./web-applications/impact";

const measure = (
  better: ImpactMeasure["better"],
  values: readonly number[],
): ImpactMeasure => ({
  id: "test",
  unit: "ms",
  better,
  bars: values.map((value, index) => ({ id: `bar-${index}`, value })),
});

describe("compareImpact", () => {
  it("compares the first bar with the last one", () => {
    expect(compareImpact(measure("lower", [200, 120, 50]))).toEqual({
      baseline: 200,
      result: 50,
      ratio: 4,
      reduction: 0.75,
    });
    expect(compareImpact(measure("higher", [20, 80]))).toEqual({
      baseline: 20,
      result: 80,
      ratio: 4,
      reduction: null,
    });
  });

  it("has no ratio when either side is zero", () => {
    expect(compareImpact(measure("lower", [30, 0])).ratio).toBeNull();
    expect(compareImpact(measure("lower", [30, 0])).reduction).toBe(1);
    expect(compareImpact(measure("higher", [0, 100])).ratio).toBeNull();
  });

  it("tells an improvement from a regression", () => {
    expect(improves(measure("lower", [10, 4]))).toBe(true);
    expect(improves(measure("lower", [4, 10]))).toBe(false);
    expect(improves(measure("higher", [4, 10]))).toBe(true);
    expect(improves(measure("higher", [10, 10]))).toBe(false);
  });

  it("needs two bars", () => {
    expect(() => compareImpact(measure("lower", [10]))).toThrow();
    expect(() => mean([])).toThrow();
  });
});

const handbook = [
  {
    id: "leave",
    title: "Leave",
    text: "Annual leave is 28 calendar days. A leave request is filed in the HR portal two weeks ahead.",
  },
  {
    id: "vpn",
    title: "VPN",
    text: "Access to the corporate network goes through the VPN client. The manager requests VPN access in the service desk.",
  },
];

describe("case impact measured by the case models", () => {
  const all = {
    ...measureKnowledgeBaseImpact(handbook, [
      "How many days of annual leave?",
      "How do I get VPN access?",
    ]),
    ...measureScientificDataImpact(),
    ...measureProcessAutomationImpact(),
    ...measureCorporateMessengerImpact(),
    ...measureEventDrivenImpact(),
    ...measureWebApplicationsImpact(),
    ...measureDataInfrastructureImpact(),
    ...measureBotsIntegrationsImpact(),
  };

  it("always shows the idea improving on the approach without it", () => {
    for (const [name, value] of Object.entries(all))
      expect(improves(value), name).toBe(true);
  });

  it("is deterministic", () => {
    expect(measureScientificDataImpact()).toEqual(
      measureScientificDataImpact(),
    );
    expect(measureCorporateMessengerImpact()).toEqual(
      measureCorporateMessengerImpact(),
    );
    expect(measureDataInfrastructureImpact()).toEqual(
      measureDataInfrastructureImpact(),
    );
  });

  it("answers from the cache much faster and cites sources only with retrieval", () => {
    const [full, cache] = all.answerTime.bars;
    expect(cache!.value).toBeLessThan(full!.value / 10);
    expect(all.grounded.bars.map((bar) => bar.value)).toEqual([0, 100]);
  });

  it("stores no broken record once the entrance checks them", () => {
    expect(all.brokenRecords.bars.map((bar) => bar.value)).toEqual([
      (2 / 6) * 100,
      0,
    ]);
  });

  it("delivers every message intact over TCP and loses some over UDP", () => {
    const [udp, tcp] = all.delivery.bars;
    expect(tcp!.value).toBe(100);
    expect(udp!.value).toBeGreaterThan(0);
    expect(udp!.value).toBeLessThan(100);
  });

  it("runs the batch on one worker in the sequential time", () => {
    const [one, , three] = all.batchTime.bars;
    expect(one!.value).toBe(
      dispatchTasks({ tasks: 12, workers: 1, crash: false }).sequentialMakespan,
    );
    expect(three!.value).toBeLessThan(one!.value / 2);
  });

  it("sends no invalid form to the server once the browser checks it", () => {
    expect(all.wastedRequests.bars.map((bar) => bar.value)).toEqual([50, 0]);
  });

  it("keeps most order reads away from PostgreSQL with the cache", () => {
    const [none, cache] = all.databaseReads.bars;
    expect(none!.value).toBe(100);
    expect(cache!.value).toBeGreaterThan(0);
    expect(cache!.value).toBeLessThan(50);
  });

  it("finishes report dialogs only with the dialog state kept", () => {
    expect(all.reports.bars.map((bar) => bar.value)).toEqual([0, 100]);
  });
});
