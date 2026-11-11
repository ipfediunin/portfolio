import { describe, expect, it } from "vitest";

import { compileIndexing, compileQuestion, vectorStores } from "./compile";
import {
  cacheKey,
  chunkDocument,
  composeAnswer,
  MIN_RELEVANCE,
  selectContext,
  TfIdfIndex,
  tokenize,
  type KnowledgeDoc,
} from "./model";

const docs: KnowledgeDoc[] = [
  {
    id: "vacation",
    title: "Отпуск",
    text: "Заявление на отпуск подаётся в портале за две недели. Ежегодный отпуск — 28 календарных дней. Его можно делить на части.",
  },
  {
    id: "vpn",
    title: "VPN",
    text: "Доступ к сети открывается через VPN-клиент после второго фактора. Новому сотруднику доступ запрашивает руководитель.",
  },
  {
    id: "deploy",
    title: "Deploy",
    text: "Releases go to production through the pipeline after green tests. Nobody deploys on Friday evening without the on-call engineer.",
  },
];

const chunks = docs.flatMap((doc) => chunkDocument(doc));
const index = new TfIdfIndex(chunks);

describe("knowledge base retrieval", () => {
  it("packs sentences into bounded chunks that overlap by one sentence", () => {
    const long: KnowledgeDoc = {
      id: "long",
      title: "Long",
      text: "First sentence is here. Second sentence follows it. Third one closes the thought. Fourth starts another.",
    };
    const parts = chunkDocument(long, 60);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.text.length).toBeLessThanOrEqual(60);
    const [first, second] = parts;
    const lastOfFirst = first!.text.split(". ").at(-1)!.replace(/\.$/, "");
    expect(second!.text).toContain(lastOfFirst);
  });

  it("matches inflected words by their stem", () => {
    expect(tokenize("отпуска")).toEqual(tokenize("отпуск"));
    expect(tokenize("deployment")).toEqual(tokenize("deploys"));
    expect(tokenize("как и что")).toEqual([]);
  });

  it("finds the document that answers the question first", () => {
    const [best] = index.search("Сколько дней ежегодного отпуска?");
    expect(best?.chunk.docId).toBe("vacation");
    const [deploy] = index.search("Can we deploy on Friday evening?");
    expect(deploy?.chunk.docId).toBe("deploy");
  });

  it("keeps unrelated questions out of the context", () => {
    const hits = index.search("рецепт борща со сметаной");
    expect(selectContext(hits)).toEqual([]);
    expect(MIN_RELEVANCE).toBeGreaterThan(0);
  });

  it("answers from the context and cites the source", () => {
    const context = selectContext(
      index.search("Сколько дней ежегодного отпуска?"),
    );
    const answer = composeAnswer("Сколько дней ежегодного отпуска?", context);
    expect(answer[0]?.text).toContain("28");
    expect(answer[0]?.source).toBe(1);
  });

  it("caches questions by their terms, not their spelling", () => {
    expect(cacheKey("VPN access?")).toBe(cacheKey("vpn  ACCESS"));
  });
});

describe("knowledge base runs", () => {
  const next = { startAt: 0, sequence: 1 };

  it("compiles every path through the world's own links", () => {
    for (const store of vectorStores) {
      for (const plan of [
        { cached: false, useRag: true, contextSize: 2 },
        { cached: false, useRag: true, contextSize: 0 },
        { cached: false, useRag: false, contextSize: 0 },
        { cached: true, useRag: true, contextSize: 0 },
      ]) {
        const run = compileQuestion({ ...plan, store, topScore: 0.4 }, next);
        expect(run.run.events.length).toBeGreaterThan(0);
        expect(run.captions.length).toBeGreaterThan(0);
      }
      const indexing = compileIndexing(
        { store, documents: 3, chunks: 4, terms: 30 },
        next,
      );
      expect(indexing.captions.map((caption) => caption.key)).toEqual([
        "ingest",
        "chunk",
        "embedChunks",
        "stored",
      ]);
    }
  });

  it("answers from the cache much faster than the full pipeline", () => {
    const base = {
      store: "pgvector",
      useRag: true,
      contextSize: 2,
      topScore: 0.4,
    } as const;
    const full = compileQuestion({ ...base, cached: false }, next);
    const cached = compileQuestion({ ...base, cached: true }, next);
    expect(cached.reportedMs * 20).toBeLessThan(full.reportedMs);
    expect(full.captions.at(-1)?.key).toBe("answer");
    expect(cached.captions.at(-1)?.key).toBe("cacheHit");
  });
});
