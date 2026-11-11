import { describe, expect, it } from "vitest";

import { compileBatch } from "./compile";
import { processBatch, sampleBatch, validateRecord } from "./model";

describe("automation rules", () => {
  it("rejects records with the reason, not with a generic error", () => {
    const base = {
      id: "x",
      source: "api",
      email: "a@b.co",
      amount: 1,
    } as const;
    expect(validateRecord(base)).toBeNull();
    expect(validateRecord({ ...base, amount: null })).toBe("missingAmount");
    expect(validateRecord({ ...base, amount: -5 })).toBe("negativeAmount");
    expect(validateRecord({ ...base, email: "nope" })).toBe("invalidEmail");
  });

  it("stores valid records in a normalised form", () => {
    const report = processBatch(sampleBatch(false), {
      notificationsDown: false,
    });
    expect(report.rejected).toBe(0);
    expect(report.notified).toBe(4);
    const first = report.outcomes[0];
    expect(first?.status).toBe("done");
    if (first?.status === "done")
      expect(first.stored).toEqual({
        email: "anna@example.com",
        amountCents: 12050,
      });
  });

  it("keeps going when notifications fail and reports every failed task", () => {
    const report = processBatch(sampleBatch(true), { notificationsDown: true });
    expect(report.received).toBe(6);
    expect(report.rejected).toBe(2);
    expect(report.stored).toBe(4);
    expect(report.failed).toBe(4);
    expect(report.log.filter((entry) => entry.level === "error")).toHaveLength(
      4,
    );
  });
});

describe("automation runs", () => {
  it("compiles batches with and without failures", () => {
    for (const withErrors of [false, true])
      for (const notificationsDown of [false, true]) {
        const report = processBatch(sampleBatch(withErrors), {
          notificationsDown,
        });
        const run = compileBatch(report, { startAt: 0, sequence: 1 });
        const keys = run.captions.map((caption) => caption.key);
        expect(keys.at(-1)).toBe("done");
        expect(keys.includes("rejected")).toBe(withErrors);
        expect(keys.includes("notifyFailed")).toBe(notificationsDown);
      }
  });
});
