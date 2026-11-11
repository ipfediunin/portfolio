import type { ImpactMeasure } from "../impact";
import { processBatch, sampleBatch, validateRecord } from "./model";

/**
 * The demo batch with its two broken records. Without checks at the entrance every record would
 * be stored as received; with them, `processBatch` stores only the records that pass.
 */
export function measureProcessAutomationImpact(): {
  readonly brokenRecords: ImpactMeasure;
} {
  const batch = sampleBatch(true);
  const broken = batch.filter((record) => validateRecord(record) !== null);
  const report = processBatch(batch, { notificationsDown: false });
  const storedBroken = report.outcomes.filter(
    (outcome) =>
      outcome.status !== "rejected" && validateRecord(outcome.record) !== null,
  );
  return {
    brokenRecords: {
      id: "broken-records",
      unit: "percent",
      better: "lower",
      bars: [
        { id: "unchecked", value: (broken.length / batch.length) * 100 },
        { id: "checked", value: (storedBroken.length / batch.length) * 100 },
      ],
    },
  };
}
