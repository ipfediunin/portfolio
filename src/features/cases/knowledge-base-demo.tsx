"use client";

import { useId, useState } from "react";
import { useStore } from "zustand";

import type { KnowledgeBaseDemoContent } from "@/content/cases/knowledge-base";
import { Segmented, Switch } from "@/features/playground/controls";
import {
  compileIndexing,
  compileQuestion,
  type KnowledgeBaseCaption,
  type VectorStore,
} from "@/simulation/cases/knowledge-base/compile";
import {
  cacheKey,
  chunkDocument,
  composeAnswer,
  MIN_RELEVANCE,
  selectContext,
  TfIdfIndex,
  type AnswerSentence,
  type SearchHit,
} from "@/simulation/cases/knowledge-base/model";

import { CaseStage, useCaseDemo, type CaseStageInput } from "./case-stage";
import { DemoButton, DemoPanel, DemoValue } from "./demo-ui";
import { formatTemplate } from "./format";

const MAX_QUESTION = 200;

interface Result {
  readonly hits: readonly SearchHit[];
  readonly answer: readonly AnswerSentence[];
  readonly grounded: boolean;
  readonly useRag: boolean;
  readonly cached: boolean;
  readonly reportedMs: number;
}

/** Case 01: ask the made-up company handbook; the scene shows the path, the panel what was found. */
export function KnowledgeBaseDemo({
  input,
  content,
}: {
  readonly input: CaseStageInput;
  readonly content: KnowledgeBaseDemoContent;
}) {
  const demo = useCaseDemo<KnowledgeBaseCaption>();
  const running = useStore(demo.controller.store, (state) => state.running);
  const [index] = useState(
    () => new TfIdfIndex(content.docs.flatMap((doc) => chunkDocument(doc))),
  );
  const [question, setQuestion] = useState(content.questions[0] ?? "");
  const [store, setStore] = useState<VectorStore>("pgvector");
  const [useRag, setUseRag] = useState(true);
  const [cache, setCache] = useState<ReadonlySet<string>>(new Set());
  const [result, setResult] = useState<Result | null>(null);
  const questionId = useId();
  const { labels } = content;
  const { locale } = input;

  function ask(text: string) {
    const query = text.trim().slice(0, MAX_QUESTION);
    if (!query) return;
    const key = cacheKey(query);
    const cached = useRag && cache.has(key);
    const hits = useRag ? index.search(query) : [];
    const context = selectContext(hits);
    let reportedMs = 0;
    demo.play((next) => {
      const run = compileQuestion(
        {
          store,
          cached,
          useRag,
          contextSize: context.length,
          topScore: hits[0]?.score ?? 0,
        },
        next,
      );
      reportedMs = run.reportedMs;
      return run;
    });
    if (useRag && context.length > 0) setCache(new Set([...cache, key]));
    setResult({
      hits,
      answer: composeAnswer(query, context),
      grounded: context.length > 0,
      useRag,
      cached,
      reportedMs,
    });
  }

  function indexDocuments() {
    demo.play((next) =>
      compileIndexing(
        {
          store,
          documents: content.docs.length,
          chunks: index.chunks.length,
          terms: index.vocabularySize,
        },
        next,
      ),
    );
  }

  const answerText = () => {
    if (!result) return null;
    if (running) return labels.answerPending;
    if (!result.useRag) return labels.ungrounded;
    if (!result.grounded) return labels.notFound;
    return null;
  };

  return (
    <CaseStage
      demo={demo}
      input={input}
      captions={content.captions}
      idleCaption={content.idle}
      entry={{
        kind: "text",
        nodeId: "kb.client",
        placeholder: labels.placeholder,
        submitLabel: labels.ask,
        maxLength: MAX_QUESTION,
        onSubmit: (text) => {
          setQuestion(text);
          ask(text);
        },
      }}
    >
      <DemoPanel title={labels.controls}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(question);
          }}
        >
          <label
            htmlFor={questionId}
            className="mb-2 block text-sm font-medium text-ink"
          >
            {labels.question}
          </label>
          <div className="flex gap-2">
            <input
              id={questionId}
              value={question}
              maxLength={MAX_QUESTION}
              placeholder={labels.placeholder}
              onChange={(event) => setQuestion(event.target.value)}
              className="min-h-10 w-full min-w-0 rounded-xl border border-line bg-bg px-3.5 text-sm text-ink outline-none focus-visible:border-brand"
            />
            <DemoButton type="submit" tone="primary">
              {labels.ask}
            </DemoButton>
          </div>
        </form>
        <p className="mt-4 text-xs font-medium text-ink-3">{labels.examples}</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {content.questions.map((example) => (
            <li key={example}>
              <button
                type="button"
                onClick={() => {
                  setQuestion(example);
                  ask(example);
                }}
                className="min-h-9 rounded-full border border-line bg-bg px-3 text-left text-xs font-medium text-ink-2 transition-colors hover:border-brand/40 hover:text-ink"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-5 space-y-3">
          <Segmented
            label={labels.store}
            value={store}
            options={[
              { value: "pgvector", label: "pgvector" },
              { value: "milvus", label: "Milvus" },
            ]}
            onChange={setStore}
          />
          <Switch label={labels.rag} checked={useRag} onChange={setUseRag} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <DemoButton onClick={indexDocuments}>{labels.index}</DemoButton>
          <DemoButton
            disabled={cache.size === 0}
            onClick={() => setCache(new Set())}
          >
            {labels.resetCache}
          </DemoButton>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          {formatTemplate(
            labels.corpus,
            { docs: content.docs.length, chunks: index.chunks.length },
            locale,
          )}
        </p>
      </DemoPanel>

      <DemoPanel title={labels.fragments}>
        {result && result.hits.length > 0 ? (
          <ol className="space-y-3">
            {result.hits.map((hit, position) => {
              const inContext = hit.score >= MIN_RELEVANCE;
              return (
                <li
                  key={hit.chunk.id}
                  className={inContext ? "" : "opacity-55"}
                >
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-semibold text-ink">
                      [{position + 1}] {hit.chunk.docTitle}
                    </span>
                    <span className="font-mono text-ink-3">
                      {labels.score} {hit.score.toFixed(2)}
                    </span>
                  </div>
                  <div
                    aria-hidden="true"
                    className="mt-1.5 h-1.5 rounded-full bg-bg"
                  >
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${Math.min(100, hit.score * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
                    {hit.chunk.text}
                  </p>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-ink-3">{labels.fragmentsEmpty}</p>
        )}
      </DemoPanel>

      {result ? (
        <DemoPanel title={labels.answer}>
          <div aria-live="polite" className="text-sm leading-relaxed text-ink">
            {answerText() ?? (
              <p>
                {result.answer.map((sentence) => (
                  <span key={sentence.text}>
                    {sentence.text}{" "}
                    <sup className="font-mono text-brand">
                      [{sentence.source}]
                    </sup>{" "}
                  </span>
                ))}
              </p>
            )}
          </div>
          {!running && result.useRag && result.grounded ? (
            <p className="mt-3 text-xs leading-relaxed text-ink-3">
              {labels.answerNote}
            </p>
          ) : null}
          <div className="mt-4">
            <DemoValue
              label={labels.latency}
              value={`≈ ${Math.round(result.reportedMs)} ms · ${
                result.cached ? labels.fromCache : labels.fullPath
              }`}
              tone={result.cached ? "good" : "neutral"}
            />
          </div>
        </DemoPanel>
      ) : null}
    </CaseStage>
  );
}
