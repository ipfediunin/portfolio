/**
 * The data layer of the infrastructure demo: every kind of query goes to the store that fits it.
 * A single order is read cache-aside (Redis first; on a miss PostgreSQL, then the cache is filled
 * with a TTL); lists go to PostgreSQL by index; similarity search goes to a vector store. The
 * latencies are illustrative constants, the same on every run, so the comparison stays readable.
 */

export type VectorStore = "pgvector" | "milvus";

export type DataQuery =
  | { readonly kind: "order"; readonly id: number }
  | { readonly kind: "orders" }
  | { readonly kind: "similar"; readonly store: VectorStore };

export const CACHE_TTL_MIN = 5;

/** Illustrative latencies in milliseconds. */
export const latencyMs = {
  cacheHit: 0.6,
  cacheMiss: 0.5,
  postgresByKey: 7,
  cacheWrite: 0.4,
  postgresList: 18,
  pgvector: 14,
  milvus: 6,
} as const;

export interface DataLayerState {
  /** Simulated minutes since the service started. */
  readonly clockMin: number;
  /** Cache key → minute at which it expires. */
  readonly cache: ReadonlyMap<string, number>;
  readonly hits: number;
  readonly misses: number;
  readonly orderReads: number;
  readonly orderReadMs: number;
}

export const initialDataState = (): DataLayerState => ({
  clockMin: 0,
  cache: new Map(),
  hits: 0,
  misses: 0,
  orderReads: 0,
  orderReadMs: 0,
});

export type QueryResult =
  | {
      readonly path: "cacheHit";
      readonly key: string;
      readonly latencyMs: number;
      readonly ttlLeftMin: number;
    }
  | {
      readonly path: "cacheMiss";
      readonly key: string;
      readonly latencyMs: number;
    }
  | { readonly path: "relational"; readonly latencyMs: number }
  | {
      readonly path: "vector";
      readonly store: VectorStore;
      readonly latencyMs: number;
    };

const round = (value: number) => Math.round(value * 10) / 10;

export function runQuery(
  state: DataLayerState,
  query: DataQuery,
): { readonly result: QueryResult; readonly state: DataLayerState } {
  if (query.kind === "orders")
    return {
      result: { path: "relational", latencyMs: latencyMs.postgresList },
      state,
    };
  if (query.kind === "similar")
    return {
      result: {
        path: "vector",
        store: query.store,
        latencyMs: latencyMs[query.store],
      },
      state,
    };

  const key = `order:${query.id}`;
  const expiresAt = state.cache.get(key);
  if (expiresAt !== undefined && expiresAt > state.clockMin) {
    const latency = latencyMs.cacheHit;
    return {
      result: {
        path: "cacheHit",
        key,
        latencyMs: latency,
        ttlLeftMin: expiresAt - state.clockMin,
      },
      state: {
        ...state,
        hits: state.hits + 1,
        orderReads: state.orderReads + 1,
        orderReadMs: round(state.orderReadMs + latency),
      },
    };
  }
  const latency = round(
    latencyMs.cacheMiss + latencyMs.postgresByKey + latencyMs.cacheWrite,
  );
  return {
    result: { path: "cacheMiss", key, latencyMs: latency },
    state: {
      ...state,
      cache: new Map(state.cache).set(key, state.clockMin + CACHE_TTL_MIN),
      misses: state.misses + 1,
      orderReads: state.orderReads + 1,
      orderReadMs: round(state.orderReadMs + latency),
    },
  };
}

/** Time passes: entries past their TTL leave the cache. */
export function advanceClock(
  state: DataLayerState,
  minutes: number,
): { readonly state: DataLayerState; readonly expired: number } {
  const clockMin = state.clockMin + minutes;
  const cache = new Map(
    [...state.cache].filter(([, expiresAt]) => expiresAt > clockMin),
  );
  return {
    state: { ...state, clockMin, cache },
    expired: state.cache.size - cache.size,
  };
}

/** A restart empties the in-memory picture of the cache; Redis itself would keep its keys. */
export function restart(state: DataLayerState): DataLayerState {
  return {
    ...initialDataState(),
    cache: state.cache,
    clockMin: state.clockMin,
  };
}

export function hitRatio(state: DataLayerState): number | null {
  const total = state.hits + state.misses;
  return total === 0 ? null : state.hits / total;
}

export function averageOrderRead(state: DataLayerState): number | null {
  return state.orderReads === 0
    ? null
    : round(state.orderReadMs / state.orderReads);
}
