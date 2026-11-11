import { mean, type ImpactMeasure } from "../impact";
import { compileQuestion } from "./compile";
import {
  chunkDocument,
  composeAnswer,
  selectContext,
  TfIdfIndex,
  type KnowledgeDoc,
} from "./model";

const share = (flags: readonly boolean[]) =>
  (flags.filter(Boolean).length / flags.length) * 100;

/**
 * The demo questions asked against the demo handbook, the way the demo asks them: once on the full
 * path, once again from the cache, and once with retrieval off (no context reaches the model).
 */
export function measureKnowledgeBaseImpact(
  docs: readonly KnowledgeDoc[],
  questions: readonly string[],
): {
  readonly answerTime: ImpactMeasure;
  readonly grounded: ImpactMeasure;
} {
  const index = new TfIdfIndex(docs.flatMap((doc) => chunkDocument(doc)));
  const asked = questions.map((question, sequence) => {
    const hits = index.search(question);
    const context = selectContext(hits);
    const plan = {
      store: "pgvector",
      useRag: true,
      contextSize: context.length,
      topScore: hits[0]?.score ?? 0,
    } as const;
    const next = { startAt: 0, sequence };
    return {
      firstMs: compileQuestion({ ...plan, cached: false }, next).reportedMs,
      againMs: compileQuestion({ ...plan, cached: true }, next).reportedMs,
      grounded: composeAnswer(question, context).length > 0,
      // Retrieval off: the model gets the question alone, so there is nothing it could cite.
      groundedWithoutRag: composeAnswer(question, selectContext([])).length > 0,
    };
  });
  return {
    answerTime: {
      id: "answer-time",
      unit: "ms",
      better: "lower",
      bars: [
        { id: "full", value: mean(asked.map((entry) => entry.firstMs)) },
        { id: "cache", value: mean(asked.map((entry) => entry.againMs)) },
      ],
    },
    grounded: {
      id: "grounded",
      unit: "percent",
      better: "higher",
      bars: [
        {
          id: "llm",
          value: share(asked.map((entry) => entry.groundedWithoutRag)),
        },
        { id: "rag", value: share(asked.map((entry) => entry.grounded)) },
      ],
    },
  };
}
