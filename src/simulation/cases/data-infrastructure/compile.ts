import { CaseScript, type CaseRun } from "../case-script";
import { dataInfrastructureGraph } from "./graph";
import { CACHE_TTL_MIN, type QueryResult } from "./model";

export type DataInfrastructureCaption =
  | "cacheCheck"
  | "cacheHit"
  | "cacheMiss"
  | "cacheSet"
  | "relational"
  | "vector"
  | "expired"
  | "config"
  | "connect"
  | "ready";

type Next = { readonly startAt: number; readonly sequence: number };
type Script = CaseScript<DataInfrastructureCaption>;

const stores = {
  pgvector: {
    node: "di.pgvector",
    link: "di.l.api-pgvector",
    label: "pgvector",
  },
  milvus: { node: "di.milvus", link: "di.l.api-milvus", label: "Milvus" },
} as const;

const ask = (
  s: Script,
  link: string,
  node: string,
  name: string,
  latency: number,
) =>
  s
    .hop(link)
    .work(node, name, [latency * 0.8, latency * 1.2])
    .hop(link, { kind: "response", tone: "success", reverse: true });

export function compileQuery(
  result: QueryResult,
  next: Next,
): CaseRun<DataInfrastructureCaption> {
  const s = new CaseScript<DataInfrastructureCaption>(
    dataInfrastructureGraph,
    "di-query",
    next,
  );
  s.hop("di.l.client-api").work("di.api", "route query", [0.5, 1.5]);

  switch (result.path) {
    case "cacheHit":
      s.caption("cacheCheck", { key: result.key });
      ask(
        s,
        "di.l.api-redis",
        "di.redis",
        `GET ${result.key}`,
        result.latencyMs,
      );
      s.status(
        "di.redis",
        "cached",
        `HIT · TTL ${result.ttlLeftMin} min`,
      ).caption("cacheHit", { ms: result.latencyMs, ttl: result.ttlLeftMin });
      break;
    case "cacheMiss":
      s.caption("cacheCheck", { key: result.key })
        .hop("di.l.api-redis")
        .work("di.redis", `GET ${result.key}`, [0.3, 0.7])
        .status("di.redis", "processing", "MISS")
        .hop("di.l.api-redis", { kind: "response", reverse: true })
        .caption("cacheMiss");
      ask(s, "di.l.api-postgres", "di.postgres", "SELECT … WHERE id = $1", 7);
      s.hop("di.l.api-redis", { kind: "job" })
        .status("di.redis", "cached", `SET · TTL ${CACHE_TTL_MIN} min`)
        .caption("cacheSet", { ms: result.latencyMs, ttl: CACHE_TTL_MIN });
      break;
    case "relational":
      ask(
        s,
        "di.l.api-postgres",
        "di.postgres",
        "SELECT … ORDER BY created_at LIMIT 20",
        result.latencyMs,
      );
      s.status("di.postgres", "success", "20 rows · index scan").caption(
        "relational",
        { ms: result.latencyMs },
      );
      break;
    case "vector": {
      const store = stores[result.store];
      ask(
        s,
        store.link,
        store.node,
        "nearest neighbours (k = 5)",
        result.latencyMs,
      );
      s.status(store.node, "success", "top-5").caption("vector", {
        store: store.label,
        ms: result.latencyMs,
      });
      break;
    }
  }
  s.hop("di.l.client-api", {
    kind: "response",
    tone: "success",
    reverse: true,
  }).status("di.client", "success", `${result.latencyMs} ms`);
  return s.build();
}

export function compileExpiry(
  expired: number,
  next: Next,
): CaseRun<DataInfrastructureCaption> {
  const s = new CaseScript<DataInfrastructureCaption>(
    dataInfrastructureGraph,
    "di-expiry",
    next,
  );
  s.status(
    "di.redis",
    expired > 0 ? "retry" : "success",
    `Expired: ${expired}`,
  ).caption("expired", { count: expired, ttl: CACHE_TTL_MIN });
  return s.build();
}

/** Service start: settings from the environment, then a connection to every store. */
export function compileStartup(next: Next): CaseRun<DataInfrastructureCaption> {
  const s = new CaseScript<DataInfrastructureCaption>(
    dataInfrastructureGraph,
    "di-startup",
    next,
  );
  s.caption("config")
    .hop("di.l.config-api", { kind: "job" })
    .work("di.api", "read DATABASE_URL · REDIS_URL · MILVUS_URI", [2, 5])
    .caption("connect")
    .parallel(
      [
        ["di.l.api-postgres", "di.postgres"],
        ["di.l.api-redis", "di.redis"],
        ["di.l.api-pgvector", "di.pgvector"],
        ["di.l.api-milvus", "di.milvus"],
      ].map(
        ([link, node]) =>
          (branch) =>
            branch
              .hop(link!)
              .hop(link!, { kind: "response", tone: "success", reverse: true })
              .status(node!, "success", "Connected"),
      ),
      200,
    )
    .status("di.api", "success", "Ready")
    .caption("ready");
  return s.build();
}
