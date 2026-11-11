import { worldGraphSchema, type WorldGraph } from "../../model/graph";
import { building, centre, roadTraffic, viaLane } from "../layout";

const client = building(
  "di.client",
  "client",
  "Web Client",
  "Browser",
  { x: 1.0, y: 7.2 },
  1.4,
  24,
);
const api = building(
  "di.api",
  "service",
  "Backend API",
  "Python",
  { x: 3.5, y: 6.8 },
  1.8,
  112,
  7,
);
const config = building(
  "di.config",
  "storage",
  "Config",
  "Env / secrets",
  { x: 1.0, y: 1.2 },
  1.4,
  34,
);
const redis = building(
  "di.redis",
  "cache",
  "Redis",
  "Cache · TTL",
  { x: 8.0, y: 7.1 },
  1.4,
  30,
);
const postgres = building(
  "di.postgres",
  "database",
  "PostgreSQL",
  "Cloud DB",
  { x: 10.6, y: 6.9 },
  1.8,
  72,
);
const pgvector = building(
  "di.pgvector",
  "database",
  "pgvector",
  "PostgreSQL",
  { x: 8.0, y: 1.0 },
  1.6,
  60,
);
const milvus = building(
  "di.milvus",
  "database",
  "Milvus",
  "Vector DB",
  { x: 10.8, y: 1.2 },
  1.6,
  60,
);

/**
 * Case 07 — the data layer: a backend that sends each kind of query to the store that fits it
 * (Redis, cloud PostgreSQL, pgvector, Milvus), with connection settings kept outside the code.
 */
export const dataInfrastructureGraph: WorldGraph = worldGraphSchema.parse({
  size: { width: 14, height: 11 },
  nameTags: true,
  views: {
    system: { area: { x0: 0.4, y0: 0.5, x1: 13.6, y1: 10.2 } },
  },
  roads: [
    { id: "di.r.h", axis: "x", line: 5, from: -12, to: 26 },
    { id: "di.r.v", axis: "y", line: 6, from: -12, to: 23 },
  ],
  nodes: [client, api, config, redis, postgres, pgvector, milvus],
  links: [
    {
      id: "di.l.client-api",
      from: client.id,
      to: api.id,
      protocol: "http",
      flow: "sync",
      route: [centre(client), { x: centre(api).x, y: centre(client).y }],
    },
    {
      id: "di.l.config-api",
      from: config.id,
      to: api.id,
      protocol: "http",
      flow: "async",
      quiet: true,
      route: viaLane(centre(config), { x: 4.0, y: 7.6 }, "x", 4.4),
    },
    {
      id: "di.l.api-redis",
      from: api.id,
      to: redis.id,
      protocol: "resp",
      flow: "sync",
      route: [
        { x: centre(api).x, y: 7.5 },
        { x: centre(redis).x, y: 7.5 },
      ],
    },
    {
      id: "di.l.api-postgres",
      from: api.id,
      to: postgres.id,
      protocol: "sql",
      flow: "sync",
      route: viaLane({ x: 4.8, y: 7.9 }, { x: 11.5, y: 7.8 }, "x", 9.2),
    },
    {
      id: "di.l.api-pgvector",
      from: api.id,
      to: pgvector.id,
      protocol: "sql",
      flow: "sync",
      route: viaLane({ x: 4.4, y: 7.0 }, { x: 8.6, y: 1.8 }, "x", 4.3),
    },
    {
      id: "di.l.api-milvus",
      from: api.id,
      to: milvus.id,
      protocol: "tcp",
      flow: "sync",
      route: viaLane({ x: 5.0, y: 7.2 }, { x: 11.6, y: 2.0 }, "x", 5.4),
    },
  ],
  vehicleRoutes: [
    ...roadTraffic("di.v.h", "x", 5, [-9, 23], [2, 2]),
    ...roadTraffic("di.v.v", "y", 6, [-9, 20], [2, 1]),
  ],
  statusCycles: [
    {
      node: redis.id,
      states: [
        { status: "cached", text: "HIT · TTL 4 min", durationMs: 4000 },
        { status: "processing", text: "MISS", durationMs: 2400 },
      ],
    },
    {
      node: postgres.id,
      states: [{ status: "success", text: "Connected", durationMs: 8000 }],
    },
  ],
});
