import type { Locale } from "@/i18n/config";
import type { KnowledgeBaseCaption } from "@/simulation/cases/knowledge-base/compile";
import type { KnowledgeDoc } from "@/simulation/cases/knowledge-base/model";
import { measureKnowledgeBaseImpact } from "@/simulation/cases/knowledge-base/impact";

import type { CaseGlanceInput, CaseRecordInput } from "../schema";

export const knowledgeBaseProject = {
  slug: "knowledge-base",
  published: true,
  basis: "project",
  order: 1,
  title: "Intelligent Knowledge Base",
  subtitle: {
    ru: "Интеллектуальная RAG-система поиска по корпоративным знаниям",
    en: "A RAG system for searching corporate knowledge",
  },
  direction: "AI Engineering / Backend / Vector Search",
  summary: {
    ru: "Система отвечает на вопросы на естественном языке по внутренним документам организации: находит релевантные фрагменты векторным поиском и передаёт их языковой модели как контекст.",
    en: "The system answers natural-language questions from an organisation's internal documents: it finds relevant fragments with vector search and hands them to a language model as context.",
  },
  scene: { world: "knowledge-base", view: "system" },
  stack: [
    "Python",
    "FastAPI",
    "PostgreSQL + pgvector",
    "Milvus",
    "Redis",
    "LLM API",
  ],
  technologies: [
    "fastapi",
    "rest-api",
    "postgresql",
    "redis",
    "vector-search",
    "rag-llm",
  ],
} satisfies CaseRecordInput;

export interface KnowledgeBaseDemoContent {
  readonly idle: string;
  readonly captions: Readonly<Record<KnowledgeBaseCaption, string>>;
  /** A made-up company handbook: the demo searches it, the page says it is synthetic. */
  readonly docs: readonly KnowledgeDoc[];
  readonly questions: readonly string[];
  readonly labels: {
    readonly controls: string;
    readonly question: string;
    readonly placeholder: string;
    readonly examples: string;
    readonly ask: string;
    readonly index: string;
    readonly resetCache: string;
    readonly store: string;
    readonly rag: string;
    readonly corpus: string;
    readonly fragments: string;
    readonly fragmentsEmpty: string;
    readonly score: string;
    readonly answer: string;
    readonly answerPending: string;
    readonly answerNote: string;
    readonly notFound: string;
    readonly ungrounded: string;
    readonly latency: string;
    readonly fromCache: string;
    readonly fullPath: string;
  };
}

export const knowledgeBaseDemo: Readonly<
  Record<Locale, KnowledgeBaseDemoContent>
> = {
  ru: {
    idle: "Задайте вопрос: запрос пройдёт кэш, векторный поиск и LLM. Можно начать с индексации документов.",
    captions: {
      ask: "Пользователь отправляет вопрос в RAG API.",
      cacheMiss: "В Redis такого вопроса ещё нет — идём полным путём.",
      cacheHit:
        "Этот вопрос уже задавали: ответ отдан из Redis за {ms} мс, без поиска и LLM.",
      embed:
        "Вопрос превращается в вектор той же моделью, которой индексировались документы.",
      search:
        "{store} ищет ближайшие по косинусу фрагменты: в контекст прошли {hits}, лучшее сходство {score}.",
      notFound:
        "Ни один фрагмент не прошёл порог релевантности. LLM не вызывается — ответ «в базе этого нет».",
      generate:
        "LLM получает вопрос и найденные фрагменты и формулирует ответ со ссылками на источники.",
      noContext: "RAG выключен: вопрос уходит в LLM без контекста из базы.",
      ungrounded:
        "Ответ без источников: внутренних правил модель не знает и может ошибиться. Время {ms} мс.",
      answer:
        "Ответ с источниками вернулся за {ms} мс и сохранён в кэш для повторных вопросов.",
      ingest: "Индексация: читаем {docs} документов вместе с метаданными.",
      chunk:
        "Документы разбиты на {chunks} смысловых фрагментов с перекрытием в одно предложение.",
      embedChunks:
        "Для каждого фрагмента считается вектор. В демо это TF-IDF со словарём из {terms} терминов.",
      stored: "Векторы и метаданные записаны в {store} — база готова к поиску.",
    },
    docs: [
      {
        id: "vacation",
        title: "Отпуск и отгулы",
        text: "Заявление на отпуск подаётся в HR-портале не позднее чем за две недели. Ежегодный отпуск — 28 календарных дней, его можно делить на части, одна из частей — не меньше 14 дней. Отгул за работу в выходной согласуется с руководителем и оформляется в том же портале.",
      },
      {
        id: "vpn",
        title: "Доступ к VPN",
        text: "Доступ к корпоративной сети открывается через VPN-клиент после подтверждения второго фактора. Новому сотруднику доступ запрашивает руководитель в сервис-деске, обычно в течение одного рабочего дня. При потере телефона с кодами сессию нужно сразу заблокировать через сервис-деск.",
      },
      {
        id: "deploy",
        title: "Выкладка сервиса",
        text: "Выкладка в продакшн идёт через пайплайн после зелёных тестов и код-ревью. Релизы не выкладываются в пятницу после 16:00 без согласования с дежурным. Откат выполняется повторным запуском пайплайна с предыдущим тегом образа.",
      },
      {
        id: "incidents",
        title: "Инциденты и дежурства",
        text: "Инцидент заводится в трекере с приоритетом от P1 до P4. На P1 дежурный инженер отвечает в течение 15 минут и собирает созвон. После устранения в течение трёх дней пишется разбор без поиска виноватых.",
      },
      {
        id: "review",
        title: "Код-ревью",
        text: "Каждый pull request смотрит минимум один инженер из команды владельца сервиса. Ревьюер проверяет тесты, обработку ошибок и миграции базы данных. Большие изменения лучше делить на несколько pull request до 400 строк.",
      },
      {
        id: "travel",
        title: "Командировки и расходы",
        text: "Командировка согласуется с руководителем и оформляется в HR-портале до покупки билетов. Чеки загружаются в отчёт о расходах в течение пяти рабочих дней после возвращения. Суточные начисляются автоматически по данным отчёта.",
      },
    ],
    questions: [
      "Сколько дней ежегодного отпуска?",
      "Как новому сотруднику получить доступ к VPN?",
      "Можно ли выкладывать релиз в пятницу вечером?",
      "Сколько времени у дежурного на инцидент P1?",
    ],
    labels: {
      controls: "Вопрос к базе знаний",
      question: "Вопрос",
      placeholder: "Например: как оформить командировку?",
      examples: "Примеры вопросов",
      ask: "Спросить",
      index: "Проиндексировать документы",
      resetCache: "Очистить кэш",
      store: "Векторное хранилище",
      rag: "Искать контекст в базе (RAG)",
      corpus:
        "Демо-база: вымышленный справочник компании — {docs} документов, {chunks} фрагментов.",
      fragments: "Найденные фрагменты",
      fragmentsEmpty: "Фрагменты появятся после вопроса.",
      score: "сходство",
      answer: "Ответ",
      answerPending: "Ответ формируется…",
      answerNote:
        "В демо ответ собран из найденных предложений. В системе его формулирует LLM по этому же контексту.",
      notFound:
        "В базе нет подходящих фрагментов — система отвечает «не знаю», а не придумывает.",
      ungrounded:
        "Без контекста модель отвечает общими словами: внутренних правил компании она не знает.",
      latency: "Время ответа (условное)",
      fromCache: "из кэша",
      fullPath: "полный путь",
    },
  },
  en: {
    idle: "Ask a question: it goes through the cache, vector search and the LLM. You can start by indexing the documents.",
    captions: {
      ask: "The user sends a question to the RAG API.",
      cacheMiss:
        "Redis has not seen this question yet, so it takes the full path.",
      cacheHit:
        "This question was asked before: the answer comes from Redis in {ms} ms, without search or the LLM.",
      embed:
        "The question becomes a vector, made by the same model that indexed the documents.",
      search:
        "{store} looks for the closest fragments by cosine: {hits} passed into the context, best similarity {score}.",
      notFound:
        "No fragment passed the relevance threshold. The LLM is not called; the answer is “not in the knowledge base”.",
      generate:
        "The LLM receives the question and the fragments found and writes an answer that cites its sources.",
      noContext:
        "RAG is off: the question goes to the LLM with no context from the base.",
      ungrounded:
        "An answer without sources: the model does not know internal rules and may be wrong. Time: {ms} ms.",
      answer:
        "The answer with sources came back in {ms} ms and was cached for repeated questions.",
      ingest: "Indexing: reading {docs} documents with their metadata.",
      chunk:
        "The documents are split into {chunks} meaningful fragments that overlap by one sentence.",
      embedChunks:
        "Every fragment gets a vector. In the demo it is TF-IDF with a vocabulary of {terms} terms.",
      stored:
        "Vectors and metadata are written to {store}; the base is ready for search.",
    },
    docs: [
      {
        id: "vacation",
        title: "Leave and days off",
        text: "A leave request is filed in the HR portal at least two weeks ahead. Annual leave is 28 calendar days and can be split into parts, one of them at least 14 days long. A day off for weekend work is agreed with the manager and filed in the same portal.",
      },
      {
        id: "vpn",
        title: "VPN access",
        text: "Access to the corporate network goes through the VPN client after a second-factor check. For a new employee the manager requests access in the service desk, usually within one working day. If a phone with codes is lost, the session must be blocked through the service desk at once.",
      },
      {
        id: "deploy",
        title: "Deploying a service",
        text: "Deploys to production go through the pipeline after green tests and code review. Releases are not deployed on Friday after 16:00 without the on-call engineer's approval. A rollback reruns the pipeline with the previous image tag.",
      },
      {
        id: "incidents",
        title: "Incidents and on-call",
        text: "An incident is opened in the tracker with a priority from P1 to P4. For a P1 the on-call engineer responds within 15 minutes and starts a call. Within three days after the fix a blameless review is written.",
      },
      {
        id: "review",
        title: "Code review",
        text: "Every pull request is reviewed by at least one engineer from the team that owns the service. The reviewer checks tests, error handling and database migrations. Large changes are better split into several pull requests of up to 400 lines.",
      },
      {
        id: "travel",
        title: "Business trips and expenses",
        text: "A business trip is approved by the manager and filed in the HR portal before tickets are bought. Receipts are uploaded to the expense report within five working days after the return. Per diems are paid automatically from the report.",
      },
    ],
    questions: [
      "How many days of annual leave do I get?",
      "How does a new employee get VPN access?",
      "Can we deploy a release on Friday evening?",
      "How fast must on-call respond to a P1 incident?",
    ],
    labels: {
      controls: "Ask the knowledge base",
      question: "Question",
      placeholder: "For example: how do I file a business trip?",
      examples: "Example questions",
      ask: "Ask",
      index: "Index the documents",
      resetCache: "Clear the cache",
      store: "Vector store",
      rag: "Look for context in the base (RAG)",
      corpus:
        "Demo base: a made-up company handbook — {docs} documents, {chunks} fragments.",
      fragments: "Fragments found",
      fragmentsEmpty: "Fragments appear after a question.",
      score: "similarity",
      answer: "Answer",
      answerPending: "Writing the answer…",
      answerNote:
        "In the demo the answer is assembled from the sentences found. In the system the LLM writes it from the same context.",
      notFound:
        "No fitting fragments in the base: the system says “I don't know” instead of making something up.",
      ungrounded:
        "Without context the model answers in general terms: it does not know the company's internal rules.",
      latency: "Response time (simulated)",
      fromCache: "from cache",
      fullPath: "full path",
    },
  },
};

const measures = measureKnowledgeBaseImpact(
  knowledgeBaseDemo.en.docs,
  knowledgeBaseDemo.en.questions,
);

/** The case at a glance: before and after, what the approach changes in the model, what I did. */
export const knowledgeBaseGlance = {
  before: [
    "Knowledge is scattered across policies and instructions",
    "Keyword search misses questions phrased in other words",
    "The file it finds still has to be read through",
  ],
  after: [
    "A question in plain language gets a direct answer",
    "Every answer links to the documents behind it",
    "New knowledge needs indexing, not retraining the model",
  ],
  did: [
    "Designed the RAG pipeline",
    "Built the API with FastAPI",
    "Vector search on pgvector and Milvus",
    "LLM integration with retrieved context",
    "Redis cache for repeated work",
  ],
  charts: [
    {
      measure: measures.answerTime,
      title: "Answer time",
      figure: "ratio",
      caption: "faster when a question is asked again",
      bars: {
        full: "First time: search and the LLM",
        cache: "Asked again: from the Redis cache",
      },
      method:
        "Average over the demo questions, with the latencies the demo reports.",
    },
    {
      measure: measures.grounded,
      title: "Answers backed by sources",
      figure: "after",
      caption: "of answers cite the documents they came from",
      bars: {
        llm: "LLM alone, no retrieval",
        rag: "RAG: answer from the fragments found",
      },
      method:
        "The demo questions against the demo handbook; an answer counts when it cites a fragment it found.",
    },
  ],
} satisfies CaseGlanceInput;
