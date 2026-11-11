import { CaseScript, type CaseRun } from "../case-script";
import { knowledgeBaseGraph } from "./graph";

export const knowledgeBaseCaptions = [
  "ask",
  "cacheMiss",
  "cacheHit",
  "embed",
  "search",
  "notFound",
  "generate",
  "noContext",
  "ungrounded",
  "answer",
  "ingest",
  "chunk",
  "embedChunks",
  "stored",
] as const;
export type KnowledgeBaseCaption = (typeof knowledgeBaseCaptions)[number];

export const vectorStores = ["pgvector", "milvus"] as const;
export type VectorStore = (typeof vectorStores)[number];

const stores = {
  pgvector: {
    label: "pgvector",
    node: "kb.pgvector",
    query: "kb.l.api-pgvector",
    ingest: "kb.l.embedder-pgvector",
    search: "ORDER BY embedding <=> $1",
    latency: [6, 18],
  },
  milvus: {
    label: "Milvus",
    node: "kb.milvus",
    query: "kb.l.api-milvus",
    ingest: "kb.l.embedder-milvus",
    search: "search(top_k=3)",
    latency: [4, 12],
  },
} as const;

export interface QuestionPlan {
  readonly store: VectorStore;
  /** The answer is already in the cache. */
  readonly cached: boolean;
  /** Retrieval on; off sends the question to the model without context. */
  readonly useRag: boolean;
  /** Chunks that passed the relevance threshold. */
  readonly contextSize: number;
  readonly topScore: number;
}

type Next = { readonly startAt: number; readonly sequence: number };
export type KnowledgeBaseRun = CaseRun<KnowledgeBaseCaption> & {
  /** Realistic end-to-end latency, as the response would report it. */
  readonly reportedMs: number;
};

function finish(script: CaseScript<KnowledgeBaseCaption>): KnowledgeBaseRun {
  return { ...script.build(), reportedMs: script.reportedMs };
}

/** One question through the system: cache, then retrieval and generation, or a cache hit. */
export function compileQuestion(
  plan: QuestionPlan,
  next: Next,
): KnowledgeBaseRun {
  const s = new CaseScript<KnowledgeBaseCaption>(
    knowledgeBaseGraph,
    "kb-question",
    next,
  );
  const respond = { kind: "response", reverse: true } as const;

  s.caption("ask")
    .hop("kb.l.client-api")
    .work("kb.api", "POST /ask", [2, 5])
    .hop("kb.l.api-cache")
    .work("kb.cache", "GET answer:{key}", [0.4, 1.2]);

  if (plan.cached) {
    s.status("kb.cache", "cached", "Cache HIT")
      .hop("kb.l.api-cache", { ...respond, tone: "success" })
      .hop("kb.l.client-api", { ...respond, tone: "success" })
      .status("kb.api", "success", "200 OK")
      .caption("cacheHit", { ms: s.reportedMs });
    return finish(s);
  }

  s.status("kb.cache", "processing", "MISS")
    .hop("kb.l.api-cache", respond)
    .caption("cacheMiss");

  if (!plan.useRag) {
    s.caption("noContext")
      .hop("kb.l.api-llm")
      .work("kb.llm", "generate(question)", [600, 1100])
      .status("kb.llm", "retry", "No sources")
      .hop("kb.l.api-llm", { ...respond, tone: "retry" })
      .hop("kb.l.client-api", { ...respond, tone: "retry" })
      .status("kb.api", "retry", "Ungrounded")
      .caption("ungrounded", { ms: s.reportedMs });
    return finish(s);
  }

  const store = stores[plan.store];
  s.caption("embed")
    .hop("kb.l.api-embedder")
    .work("kb.embedder", "embed(question)", [15, 35])
    .hop("kb.l.api-embedder", respond)
    .caption("search", {
      store: store.label,
      hits: plan.contextSize,
      score: plan.topScore,
    })
    .hop(store.query)
    .work(store.node, store.search, store.latency)
    .status(
      store.node,
      plan.contextSize > 0 ? "success" : "retry",
      `top-${plan.contextSize} · ${plan.topScore.toFixed(2)}`,
    )
    .hop(store.query, respond);

  if (plan.contextSize === 0) {
    s.hop("kb.l.client-api", { ...respond, tone: "retry" })
      .status("kb.api", "success", "200 · not found")
      .caption("notFound");
    return finish(s);
  }

  s.caption("generate")
    .hop("kb.l.api-llm")
    .work("kb.llm", "generate(question, context)", [700, 1400])
    .status("kb.llm", "success", "Answer + sources")
    .hop("kb.l.api-llm", { ...respond, tone: "success" })
    .parallel([
      (branch) =>
        branch
          .hop("kb.l.client-api", { ...respond, tone: "success" })
          .status("kb.api", "success", "200 OK"),
      (branch) =>
        branch
          .hop("kb.l.api-cache", { kind: "job" })
          .status("kb.cache", "cached", "SET · TTL 1h"),
    ])
    .caption("answer", { ms: s.reportedMs });
  return finish(s);
}

export interface IndexingPlan {
  readonly store: VectorStore;
  readonly documents: number;
  readonly chunks: number;
  readonly terms: number;
}

/** Indexing the knowledge base: read, split into chunks, embed, store with metadata. */
export function compileIndexing(
  plan: IndexingPlan,
  next: Next,
): KnowledgeBaseRun {
  const s = new CaseScript<KnowledgeBaseCaption>(
    knowledgeBaseGraph,
    "kb-index",
    next,
  );
  const store = stores[plan.store];
  s.caption("ingest", { docs: plan.documents })
    .hop("kb.l.docs-indexer", { kind: "job" })
    .work("kb.indexer", "split into chunks", [20, 60])
    .status("kb.indexer", "processing", `${plan.chunks} chunks`)
    .caption("chunk", { chunks: plan.chunks })
    .hop("kb.l.indexer-embedder", { kind: "job" })
    .work("kb.embedder", "embed(batch)", [120, 260])
    .status("kb.embedder", "success", `${plan.chunks} vectors`)
    .caption("embedChunks", { chunks: plan.chunks, terms: plan.terms })
    .hop(store.ingest, { kind: "job" })
    .work(store.node, "INSERT vectors + metadata", [30, 90])
    .status(store.node, "success", "Indexed")
    .caption("stored", { store: store.label });
  return finish(s);
}
