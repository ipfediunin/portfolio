/**
 * The retrieval half of a RAG pipeline, small enough to run in the browser: documents are split
 * into overlapping chunks, chunks and questions become TF-IDF vectors, and the closest chunks by
 * cosine similarity become the context. A production system uses learned embeddings and a vector
 * database instead of TF-IDF in memory; the steps and the relevance threshold work the same way.
 */

export interface KnowledgeDoc {
  readonly id: string;
  readonly title: string;
  readonly text: string;
}

export interface KnowledgeChunk {
  readonly id: string;
  readonly docId: string;
  readonly docTitle: string;
  readonly text: string;
}

export interface SearchHit {
  readonly chunk: KnowledgeChunk;
  readonly score: number;
}

/** Below this cosine similarity a chunk is not context: the system answers "not in the base". */
export const MIN_RELEVANCE = 0.12;
export const TOP_K = 3;
const MAX_CHUNK_CHARS = 240;
/** Inflections mostly change word endings (Russian and English alike), so terms are word prefixes. */
const STEM_LENGTH = 5;

const SENTENCE_BREAK = /(?<=[.!?])\s+/u;

const STOP_WORDS = new Set(
  [
    // Russian
    "как что это для или при над под без его она они все так уже еще ещё был была были быть есть нет если чем тот эти этот мне меня нам вас вам можно нужно сколько какой какие когда где кто ли же до после через между очень только также тоже",
    // English
    "the and for are but not you all any can had was one our out has how its may new now who did get got what when where which with from that this they them then than there their your into about after before over under does should would could many much",
  ].flatMap((words) => words.split(" ")),
);

/** Lower-cased word prefixes without stop words: the terms both chunks and questions are made of. */
export function tokenize(text: string): string[] {
  const words =
    text
      .toLowerCase()
      .replaceAll("ё", "е")
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return words
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .map((word) => word.slice(0, STEM_LENGTH));
}

/**
 * Packs whole sentences into chunks of at most `maxChars`. Each new chunk starts with the previous
 * chunk's last sentence, so a statement that spans the boundary is still found in one piece.
 */
export function chunkDocument(
  doc: KnowledgeDoc,
  maxChars = MAX_CHUNK_CHARS,
): KnowledgeChunk[] {
  const sentences = doc.text
    .split(SENTENCE_BREAK)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
  const groups: string[][] = [];
  let current: string[] = [];
  let fresh = 0;
  const length = () => current.join(" ").length;

  for (const sentence of sentences) {
    if (fresh > 0 && length() + 1 + sentence.length > maxChars) {
      groups.push(current);
      const overlap = current.at(-1)!;
      current =
        overlap.length + 1 + sentence.length <= maxChars ? [overlap] : [];
      fresh = 0;
    }
    current.push(sentence);
    fresh += 1;
  }
  if (fresh > 0) groups.push(current);

  return groups.map((group, index) => ({
    id: `${doc.id}#${index + 1}`,
    docId: doc.id,
    docTitle: doc.title,
    text: group.join(" "),
  }));
}

interface ChunkVector {
  readonly chunk: KnowledgeChunk;
  readonly weights: ReadonlyMap<string, number>;
  readonly norm: number;
}

function termCounts(terms: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  return counts;
}

/** TF-IDF vectors of every chunk; a question is compared with all of them by cosine similarity. */
export class TfIdfIndex {
  private readonly idf = new Map<string, number>();
  private readonly vectors: readonly ChunkVector[];

  constructor(readonly chunks: readonly KnowledgeChunk[]) {
    const counts = chunks.map((chunk) => termCounts(tokenize(chunk.text)));
    const documentFrequency = new Map<string, number>();
    for (const chunkCounts of counts)
      for (const term of chunkCounts.keys())
        documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    for (const [term, frequency] of documentFrequency)
      this.idf.set(term, Math.log((chunks.length + 1) / (frequency + 1)) + 1);

    this.vectors = chunks.map((chunk, index) => {
      const weights = this.weigh(counts[index]!);
      return { chunk, weights, norm: norm(weights) };
    });
  }

  get vocabularySize(): number {
    return this.idf.size;
  }

  /** The `k` closest chunks with a positive similarity, best first. */
  search(question: string, k = TOP_K): SearchHit[] {
    const query = this.weigh(termCounts(tokenize(question)));
    const queryNorm = norm(query);
    if (queryNorm === 0) return [];
    return this.vectors
      .map(({ chunk, weights, norm: chunkNorm }) => {
        let dot = 0;
        for (const [term, weight] of query)
          dot += weight * (weights.get(term) ?? 0);
        return { chunk, score: round(dot / (queryNorm * chunkNorm || 1)) };
      })
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /** Terms unknown to the index carry no weight: they cannot match anything. */
  private weigh(counts: ReadonlyMap<string, number>): Map<string, number> {
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const weights = new Map<string, number>();
    for (const [term, count] of counts) {
      const idf = this.idf.get(term);
      if (idf !== undefined) weights.set(term, (count / total) * idf);
    }
    return weights;
  }
}

function norm(weights: ReadonlyMap<string, number>): number {
  let sum = 0;
  for (const weight of weights.values()) sum += weight * weight;
  return Math.sqrt(sum);
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** Hits that pass the relevance threshold: the context handed to the model. */
export function selectContext(
  hits: readonly SearchHit[],
  minScore = MIN_RELEVANCE,
): SearchHit[] {
  return hits.filter((hit) => hit.score >= minScore);
}

export interface AnswerSentence {
  readonly text: string;
  /** 1-based position of the source in the context, for the "[1]" citation. */
  readonly source: number;
}

/**
 * Stands in for the generation step: the sentences of the context that share the most terms with
 * the question, each with its source. The model in the real pipeline writes the answer from the
 * same context; what it may cite is exactly what retrieval found.
 */
export function composeAnswer(
  question: string,
  context: readonly SearchHit[],
  maxSentences = 2,
): AnswerSentence[] {
  const wanted = new Set(tokenize(question));
  const seen = new Set<string>();
  return context
    .flatMap((hit, index) =>
      hit.chunk.text.split(SENTENCE_BREAK).map((text) => ({
        text: text.trim(),
        source: index + 1,
        overlap: new Set(tokenize(text).filter((term) => wanted.has(term)))
          .size,
      })),
    )
    .filter((sentence) => {
      if (sentence.overlap === 0 || seen.has(sentence.text)) return false;
      seen.add(sentence.text);
      return true;
    })
    .sort((a, b) => b.overlap - a.overlap || a.source - b.source)
    .slice(0, maxSentences)
    .map(({ text, source }) => ({ text, source }));
}

/** Questions are cached by their terms, so "VPN access?" and "vpn access" share an answer. */
export function cacheKey(question: string): string {
  return [...new Set(tokenize(question))].sort().join(" ");
}
