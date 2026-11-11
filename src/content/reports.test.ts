import { describe, expect, it } from "vitest";

import { en } from "@/i18n/dictionaries/en";

import { chaosReport, loadReport } from "./reports";

describe("load and chaos reports", () => {
  it("cover every action of the load profile at every level", () => {
    const actions = Object.keys(loadReport.profile.weights);
    for (const run of loadReport.runs) {
      const measured = new Set(run.endpoints.map((endpoint) => endpoint.name));
      for (const action of actions) expect(measured, action).toContain(action);
      expect(run.requests).toBe(
        run.endpoints.reduce((sum, endpoint) => sum + endpoint.requests, 0),
      );
    }
  });

  it("measure queued work end to end for jobs and orders", () => {
    for (const run of loadReport.runs)
      expect(run.background.map((item) => item.name).sort()).toEqual([
        "order → Kafka → 3 groups",
        "payment job → worker → provider",
        "report job → worker",
      ]);
  });

  it("list each chaos experiment once, with what was measured", () => {
    const ids = chaosReport.experiments.map((experiment) => experiment.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "worker-killed",
      "kafka-down",
      "rabbitmq-down",
      "redis-down",
    ]);
  });

  it("tell findings only of experiments that were run", () => {
    const ids = new Set(chaosReport.experiments.map((item) => item.id));
    for (const id of Object.keys(en.report.chaos.findings))
      expect(ids, id).toContain(id);
  });
});
