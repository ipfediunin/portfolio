import { worldGraphSchema, type WorldGraph } from "../../model/graph";
import { building, centre, roadTraffic, viaLane } from "../layout";

const docs = building(
  "kb.docs",
  "storage",
  "Documents",
  "Files + metadata",
  { x: 0.8, y: 1.0 },
  1.6,
  40,
);
const indexer = building(
  "kb.indexer",
  "worker",
  "Indexer",
  "Chunking",
  { x: 3.4, y: 1.2 },
  1.5,
  56,
  3,
);
const embedder = building(
  "kb.embedder",
  "worker",
  "Embeddings",
  "Embedding model",
  { x: 8.0, y: 0.9 },
  1.6,
  64,
  4,
);
const milvus = building(
  "kb.milvus",
  "database",
  "Milvus",
  "Vector database",
  { x: 11.0, y: 1.0 },
  1.7,
  60,
);
const client = building(
  "kb.client",
  "client",
  "Client",
  "HTTP",
  { x: 1.0, y: 7.2 },
  1.4,
  24,
);
const api = building(
  "kb.api",
  "service",
  "RAG API",
  "FastAPI",
  { x: 3.6, y: 6.8 },
  1.8,
  120,
  8,
);
const cache = building(
  "kb.cache",
  "cache",
  "Redis Cache",
  "Redis",
  { x: 8.0, y: 7.0 },
  1.4,
  30,
);
const pgvector = building(
  "kb.pgvector",
  "database",
  "pgvector",
  "PostgreSQL",
  { x: 10.4, y: 6.9 },
  1.7,
  64,
);
const llm = building(
  "kb.llm",
  "integration",
  "LLM",
  "LLM API",
  { x: 11.8, y: 8.9 },
  1.4,
  46,
);

/**
 * Case 01 — a question-answering system over internal documents. The top row indexes documents
 * (read → chunk → embed → store), the bottom row answers questions (cache → embed the question →
 * vector search → LLM with the found context). Two vector stores stand side by side: pgvector
 * inside PostgreSQL and a dedicated Milvus.
 */
export const knowledgeBaseGraph: WorldGraph = worldGraphSchema.parse({
  size: { width: 14, height: 11 },
  nameTags: true,
  views: {
    system: { area: { x0: 0.2, y0: 0.4, x1: 13.6, y1: 10.6 } },
  },
  roads: [
    { id: "kb.r.h", axis: "x", line: 5, from: -12, to: 26 },
    { id: "kb.r.v", axis: "y", line: 6, from: -12, to: 23 },
  ],
  nodes: [docs, indexer, embedder, milvus, client, api, cache, pgvector, llm],
  links: [
    {
      id: "kb.l.docs-indexer",
      from: docs.id,
      to: indexer.id,
      protocol: "http",
      flow: "async",
      route: [centre(docs), { x: centre(indexer).x, y: centre(docs).y }],
    },
    {
      id: "kb.l.indexer-embedder",
      from: indexer.id,
      to: embedder.id,
      protocol: "http",
      flow: "async",
      route: [
        { x: centre(indexer).x, y: 1.7 },
        { x: centre(embedder).x, y: 1.7 },
      ],
    },
    {
      id: "kb.l.embedder-milvus",
      from: embedder.id,
      to: milvus.id,
      protocol: "tcp",
      flow: "async",
      route: [
        { x: centre(embedder).x, y: 1.55 },
        { x: centre(milvus).x, y: 1.55 },
      ],
    },
    {
      id: "kb.l.embedder-pgvector",
      from: embedder.id,
      to: pgvector.id,
      protocol: "sql",
      flow: "async",
      route: viaLane({ x: 9.3, y: 1.7 }, centre(pgvector), "x", 6.45),
    },
    {
      id: "kb.l.client-api",
      from: client.id,
      to: api.id,
      protocol: "http",
      flow: "sync",
      route: [centre(client), { x: centre(api).x, y: centre(client).y }],
    },
    {
      id: "kb.l.api-cache",
      from: api.id,
      to: cache.id,
      protocol: "resp",
      flow: "sync",
      route: [
        { x: centre(api).x, y: 7.5 },
        { x: centre(cache).x, y: 7.5 },
      ],
    },
    {
      id: "kb.l.api-embedder",
      from: api.id,
      to: embedder.id,
      protocol: "http",
      flow: "sync",
      route: viaLane({ x: 4.3, y: 7.7 }, { x: 8.6, y: 1.7 }, "x", 4.2),
    },
    {
      id: "kb.l.api-pgvector",
      from: api.id,
      to: pgvector.id,
      protocol: "sql",
      flow: "sync",
      route: viaLane({ x: 4.8, y: 7.7 }, { x: 11.0, y: 7.75 }, "x", 9.3),
    },
    {
      id: "kb.l.api-milvus",
      from: api.id,
      to: milvus.id,
      protocol: "tcp",
      flow: "sync",
      route: viaLane({ x: 5.0, y: 7.2 }, { x: 12.1, y: 1.85 }, "x", 5.35),
    },
    {
      id: "kb.l.api-llm",
      from: api.id,
      to: llm.id,
      protocol: "http",
      flow: "sync",
      shape: "arc",
      route: [centre(api), centre(llm)],
    },
  ],
  vehicleRoutes: [
    ...roadTraffic("kb.v.h", "x", 5, [-9, 23], [2, 2]),
    ...roadTraffic("kb.v.v", "y", 6, [-9, 20], [2, 1]),
  ],
  statusCycles: [
    {
      node: api.id,
      states: [
        { status: "processing", text: "Retrieving", durationMs: 3000 },
        { status: "success", text: "200 OK", durationMs: 5000 },
      ],
    },
    {
      node: indexer.id,
      states: [
        { status: "processing", text: "Indexing", durationMs: 4000 },
        { status: "success", text: "Indexed", durationMs: 4000 },
      ],
    },
    {
      node: cache.id,
      states: [{ status: "cached", text: "Cache HIT", durationMs: 8000 }],
    },
  ],
});
