import type { ImpactMeasure } from "../impact";
import { dispatchTasks } from "./model";

/** The demo's batch of tasks. */
const TASKS = 12;

/** Time until the whole batch is acknowledged, with one, two and three competing workers. */
export function measureEventDrivenImpact(): {
  readonly batchTime: ImpactMeasure;
} {
  return {
    batchTime: {
      id: "batch-time",
      unit: "units",
      better: "lower",
      bars: [1, 2, 3].map((workers) => ({
        id: `workers-${workers}`,
        value: dispatchTasks({ tasks: TASKS, workers, crash: false }).makespan,
      })),
    },
  };
}
