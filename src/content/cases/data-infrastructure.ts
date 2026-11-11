import type { Locale } from "@/i18n/config";
import type { DataInfrastructureCaption } from "@/simulation/cases/data-infrastructure/compile";
import { measureDataInfrastructureImpact } from "@/simulation/cases/data-infrastructure/impact";

import type { CaseGlanceInput, CaseRecordInput } from "../schema";

export const dataInfrastructureProject = {
  slug: "data-infrastructure",
  published: true,
  basis: "practice",
  order: 7,
  title: "Cloud & Data Infrastructure",
  subtitle: {
    ru: "Облачная инфраструктура и системы хранения данных",
    en: "Cloud infrastructure and data storage systems",
  },
  direction: "Cloud / Database Engineering / Backend",
  summary: {
    ru: "Работа с облачными базами данных и хранилищами: структура данных, подключение backend-приложений, реляционные данные, векторный поиск и кэширование — каждое в подходящем хранилище.",
    en: "Working with cloud databases and storage: data structure, connecting backend applications, relational data, vector search and caching — each in the store that fits it.",
  },
  scene: { world: "data-infrastructure", view: "system" },
  stack: [
    "Python",
    "PostgreSQL",
    "Redis",
    "pgvector",
    "Milvus",
    "Cloud databases",
  ],
  technologies: ["postgresql", "redis", "vector-search", "cloud"],
} satisfies CaseRecordInput;

export interface DataInfrastructureDemoContent {
  readonly idle: string;
  readonly captions: Readonly<Record<DataInfrastructureCaption, string>>;
  readonly labels: {
    readonly queries: string;
    readonly order: string;
    readonly orders: string;
    readonly similar: string;
    readonly store: string;
    readonly time: string;
    readonly restart: string;
    readonly stats: string;
    readonly hits: string;
    readonly misses: string;
    readonly ratio: string;
    readonly average: string;
    readonly lastQuery: string;
    readonly cache: string;
    readonly cacheEmpty: string;
    readonly ttlLeft: string;
    readonly where: string;
    readonly roles: readonly {
      readonly store: string;
      readonly role: string;
    }[];
    readonly illustrative: string;
  };
  readonly paths: Readonly<
    Record<"cacheHit" | "cacheMiss" | "relational" | "vector", string>
  >;
}

export const dataInfrastructureDemo: Readonly<
  Record<Locale, DataInfrastructureDemoContent>
> = {
  ru: {
    idle: "Запросите заказ дважды — второй раз ответит кэш. Затем список, похожие документы и истечение TTL.",
    captions: {
      cacheCheck: "Backend сначала ищет {key} в Redis.",
      cacheHit:
        "Попадание в кэш: ответ за {ms} мс без обращения к базе. Запись живёт ещё {ttl} мин.",
      cacheMiss:
        "В кэше этого заказа нет — читаем из PostgreSQL по первичному ключу.",
      cacheSet:
        "Результат кладётся в Redis на {ttl} мин (cache-aside). Ответ за {ms} мс — следующий будет быстрее.",
      relational:
        "Список с сортировкой — работа для PostgreSQL и индекса. Часто меняющиеся списки не кэшируются. {ms} мс.",
      vector:
        "Поиск по смыслу уходит в векторное хранилище {store}: ближайшие соседи за {ms} мс.",
      expired:
        "Прошло время: записей с истёкшим TTL ({ttl} мин) — {count}. Следующее чтение снова пойдёт в базу.",
      config:
        "Сервис стартует: адреса и параметры хранилищ читаются из окружения, а не из кода.",
      connect: "Backend подключается к каждому хранилищу.",
      ready: "Все подключения готовы — сервис принимает запросы.",
    },
    labels: {
      queries: "Запросы",
      order: "Заказ #{id}",
      orders: "Список заказов",
      similar: "Похожие документы",
      store: "Векторное хранилище",
      time: "Прошло 5 минут",
      restart: "Запустить сервис заново",
      stats: "Кэш в цифрах",
      hits: "Попаданий",
      misses: "Промахов",
      ratio: "Доля попаданий",
      average: "Среднее чтение заказа",
      lastQuery: "Последний запрос",
      cache: "Ключи в Redis",
      cacheEmpty: "Кэш пуст.",
      ttlLeft: "ещё {min} мин",
      where: "Где что хранится",
      roles: [
        {
          store: "PostgreSQL",
          role: "заказы, пользователи, связи и транзакции",
        },
        { store: "pgvector", role: "векторы рядом с реляционными данными" },
        { store: "Milvus", role: "большие коллекции векторов" },
        {
          store: "Redis",
          role: "горячие данные с ограниченным временем жизни",
        },
      ],
      illustrative:
        "Задержки условные и одинаковые от запуска к запуску — важна разница между путями.",
    },
    paths: {
      cacheHit: "Redis · попадание",
      cacheMiss: "Redis → PostgreSQL → Redis",
      relational: "PostgreSQL · индекс",
      vector: "векторное хранилище",
    },
  },
  en: {
    idle: "Request an order twice — the second time the cache answers. Then a list, similar documents and an expiring TTL.",
    captions: {
      cacheCheck: "The backend looks for {key} in Redis first.",
      cacheHit:
        "Cache hit: answered in {ms} ms without touching the database. The entry lives {ttl} more min.",
      cacheMiss:
        "The order is not cached — read it from PostgreSQL by primary key.",
      cacheSet:
        "The result goes into Redis for {ttl} min (cache-aside). Answered in {ms} ms — the next read will be faster.",
      relational:
        "A sorted list is a job for PostgreSQL and an index. Lists that change often are not cached. {ms} ms.",
      vector:
        "Search by meaning goes to the {store} vector store: nearest neighbours in {ms} ms.",
      expired:
        "Time has passed: {count} entries outlived their TTL ({ttl} min). The next read goes to the database again.",
      config:
        "The service starts: store addresses and settings are read from the environment, not from the code.",
      connect: "The backend connects to every store.",
      ready: "All connections are ready — the service accepts requests.",
    },
    labels: {
      queries: "Queries",
      order: "Order #{id}",
      orders: "List of orders",
      similar: "Similar documents",
      store: "Vector store",
      time: "5 minutes pass",
      restart: "Start the service again",
      stats: "The cache in numbers",
      hits: "Hits",
      misses: "Misses",
      ratio: "Hit ratio",
      average: "Average order read",
      lastQuery: "Last query",
      cache: "Keys in Redis",
      cacheEmpty: "The cache is empty.",
      ttlLeft: "{min} min left",
      where: "What lives where",
      roles: [
        {
          store: "PostgreSQL",
          role: "orders, users, relations and transactions",
        },
        { store: "pgvector", role: "vectors next to relational data" },
        { store: "Milvus", role: "large vector collections" },
        { store: "Redis", role: "hot data with a limited lifetime" },
      ],
      illustrative:
        "Latencies are illustrative and the same on every run — the difference between the paths is what matters.",
    },
    paths: {
      cacheHit: "Redis · hit",
      cacheMiss: "Redis → PostgreSQL → Redis",
      relational: "PostgreSQL · index",
      vector: "vector store",
    },
  },
};

const measures = measureDataInfrastructureImpact();

/** The case at a glance: before and after, what the approach changes in the model, what I did. */
export const dataInfrastructureGlance = {
  before: [
    "Mixed data: relations, search by meaning, hot reads",
    "No single store fits all of it",
    "Going to the database for every read is expensive",
  ],
  after: [
    "A store for each kind of data",
    "Hot data served from Redis, with a limited lifetime",
    "Connections managed through configuration, not code",
  ],
  did: [
    "Designed the data structure",
    "Backends connected to cloud databases",
    "PostgreSQL, pgvector and Milvus",
    "Redis as the cache",
    "Connection configuration",
  ],
  charts: [
    {
      measure: measures.databaseReads,
      title: "Load on PostgreSQL",
      figure: "reduction",
      caption: "fewer order reads reach the database",
      bars: {
        "no-cache": "Every read from PostgreSQL",
        cache: "Cache-aside in Redis, 5-minute TTL",
      },
      method:
        "60 synthetic order reads over 15 minutes, popular orders read more often.",
    },
    {
      measure: measures.readTime,
      title: "Average order read",
      figure: "ratio",
      caption: "faster on average with the cache",
      bars: {
        "no-cache": "PostgreSQL by key",
        cache: "Redis first, PostgreSQL on a miss",
      },
      method: "The same traffic, with the demo's illustrative latencies.",
    },
  ],
} satisfies CaseGlanceInput;
