import { SeededRng } from "../../runtime/seeded-rng";
import { mean, type ImpactMeasure } from "../impact";
import {
  advanceClock,
  averageOrderRead,
  initialDataState,
  latencyMs,
  runQuery,
} from "./model";

/** Synthetic traffic: order reads over a quarter of an hour, popular orders read more often. */
const READS = 60;
const MINUTES_BETWEEN_READS = 0.25;
const ORDER_POPULARITY = [8, 5, 3, 2, 1, 1, 1, 1] as const;
const FIRST_ORDER_ID = 1001;

function sampleOrderIds(): number[] {
  const rng = new SeededRng(4242);
  const total = ORDER_POPULARITY.reduce((sum, weight) => sum + weight, 0);
  return Array.from({ length: READS }, () => {
    let pick = rng.next() * total;
    const index = ORDER_POPULARITY.findIndex((weight) => (pick -= weight) < 0);
    return FIRST_ORDER_ID + Math.max(index, 0);
  });
}

/**
 * The same order reads without a cache (every read is a PostgreSQL query by key) and cache-aside
 * with the demo's TTL, where entries expire and are filled again.
 */
export function measureDataInfrastructureImpact(): {
  readonly databaseReads: ImpactMeasure;
  readonly readTime: ImpactMeasure;
} {
  let state = initialDataState();
  for (const id of sampleOrderIds()) {
    state = runQuery(state, { kind: "order", id }).state;
    state = advanceClock(state, MINUTES_BETWEEN_READS).state;
  }
  const reads = state.hits + state.misses;
  return {
    databaseReads: {
      id: "database-reads",
      unit: "percent",
      better: "lower",
      bars: [
        { id: "no-cache", value: 100 },
        { id: "cache", value: (state.misses / reads) * 100 },
      ],
    },
    readTime: {
      id: "read-time",
      unit: "ms",
      better: "lower",
      bars: [
        {
          id: "no-cache",
          value: mean(
            Array.from({ length: reads }, () => latencyMs.postgresByKey),
          ),
        },
        { id: "cache", value: averageOrderRead(state) ?? 0 },
      ],
    },
  };
}
