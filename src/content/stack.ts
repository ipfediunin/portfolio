import { stackAreasSchema, type StackArea, type StackAreaId } from "./schema";

/**
 * The stack, as confirmed in the owner's technical profile. Every technology runs in a building of
 * its district, links to the case studies that used it, or to the section of the site that shows it.
 */
export const stackAreas: readonly StackArea[] = stackAreasSchema.parse([
  {
    id: "backend",
    title: { ru: "Backend", en: "Backend" },
    tagline: { ru: "API, данные, сообщения", en: "APIs, data, messaging" },
    lead: {
      ru: "Серверная логика: принимает запросы, хранит данные, выносит долгую работу в фон и обменивается сообщениями с другими сервисами и внешними системами.",
      en: "Server logic that accepts requests, stores data, moves long-running work to the background and exchanges messages with other services and external systems.",
    },
    snippet: {
      file: "api/routers/reports.py",
      code: `@router.post("/reports", status_code=202)
async def create_report(body: ReportIn) -> TaskOut:
    task = await tasks.create(kind="report", params=body.model_dump())
    await queue.publish("reports", {"task_id": task.id})
    return TaskOut(task_id=task.id, status="queued")`,
      caption: {
        ru: "FastAPI-эндпоинт: данные проверяет Pydantic, долгая работа уходит в очередь, клиент сразу получает 202.",
        en: "A FastAPI endpoint: Pydantic checks the input, the long-running work goes to a queue and the client gets a 202 at once.",
      },
    },
    technologies: [
      {
        id: "fastapi",
        name: "FastAPI",
        summary: {
          ru: "Асинхронные API с типизированными контрактами на Pydantic и автодокументацией.",
          en: "Async APIs with typed Pydantic contracts and generated docs.",
        },
      },
      {
        id: "django",
        name: "Django",
        summary: {
          ru: "Веб-приложения и сервисы с ORM, миграциями и админкой.",
          en: "Web applications and services with the ORM, migrations and the admin.",
        },
      },
      {
        id: "flask",
        name: "Flask",
        summary: {
          ru: "Лёгкие сервисы, backend ботов и интеграционные прослойки.",
          en: "Lightweight services, bot backends and integration layers.",
        },
      },
      {
        id: "rest-api",
        name: "REST API",
        summary: {
          ru: "Ресурсный дизайн, понятные коды ответов и ошибки по полям.",
          en: "Resource design, clear response codes and per-field errors.",
        },
      },
      {
        id: "async-python",
        name: "Async Python",
        summary: {
          ru: "Асинхронное программирование: много одновременных операций ввода-вывода в одном процессе.",
          en: "Asynchronous programming: many concurrent I/O operations in one process.",
        },
      },
      {
        id: "postgresql",
        name: "PostgreSQL",
        summary: {
          ru: "Схемы, индексы и транзакции — основное хранилище структурированных данных.",
          en: "Schemas, indexes and transactions — the main store for structured data.",
        },
      },
      {
        id: "redis",
        name: "Redis",
        summary: {
          ru: "Кэширование и хранение быстро меняющегося состояния.",
          en: "Caching and keeping fast-changing state.",
        },
      },
      {
        id: "background-jobs",
        name: "Background jobs",
        summary: {
          ru: "Асинхронная обработка задач вне HTTP-запроса: API отвечает сразу, работа идёт в фоне.",
          en: "Asynchronous task processing outside the HTTP request: the API answers at once, the work runs in the background.",
        },
      },
      {
        id: "message-brokers",
        name: "RabbitMQ / Kafka",
        summary: {
          ru: "Обмен сообщениями между сервисами и событийно-ориентированная архитектура.",
          en: "Messaging between services and event-driven architecture.",
        },
      },
      {
        id: "vector-search",
        name: "pgvector / Milvus",
        summary: {
          ru: "Векторный поиск: хранение эмбеддингов и поиск ближайших по смыслу.",
          en: "Vector search: storing embeddings and finding the closest by meaning.",
        },
      },
      {
        id: "sockets",
        name: "Sockets · TCP / UDP",
        summary: {
          ru: "Клиент-серверные приложения на Python sockets: соединения, обмен данными, сетевые ошибки.",
          en: "Client-server applications on Python sockets: connections, data exchange, network errors.",
        },
      },
      {
        id: "integrations",
        name: "Integrations",
        summary: {
          ru: "Интеграция программных систем и внешних API.",
          en: "Integrating software systems and external APIs.",
        },
      },
    ],
  },
  {
    id: "frontend",
    title: { ru: "Frontend", en: "Frontend" },
    tagline: { ru: "Интерфейсы и сайты", en: "Interfaces and websites" },
    lead: {
      ru: "Многостраничные сайты и интерфейсы, через которые пользователи работают с backend: быстро открываются, понятно ведут и честно показывают состояние системы.",
      en: "Multi-page websites and interfaces that users work with the backend through: they load fast, guide clearly and honestly show the state of the system.",
    },
    snippet: {
      file: "app/orders/[id]/page.tsx",
      code: `export default function OrderPage({ params }: PageProps<"/orders/[id]">) {
  return (
    <OrderShell>
      <Suspense fallback={<OrderSkeleton />}>
        <OrderDetails params={params} />
      </Suspense>
      <Suspense fallback={<ReviewsSkeleton />}>
        <Reviews params={params} />
      </Suspense>
    </OrderShell>
  );
}`,
      caption: {
        ru: "Страница заказа в Next.js: оболочка отдаётся сразу, каждый блок данных стримится за своей границей Suspense.",
        en: "An order page in Next.js: the shell goes out at once, and each data block streams in behind its own Suspense boundary.",
      },
    },
    technologies: [
      {
        id: "react",
        name: "React",
        summary: {
          ru: "Компонентная архитектура и интерфейсы взаимодействия с backend.",
          en: "Component architecture and interfaces that work with the backend.",
        },
      },
      {
        id: "nextjs",
        name: "Next.js",
        summary: {
          ru: "Многостраничные сайты и приложения: серверный рендеринг, маршрутизация, SEO.",
          en: "Multi-page websites and applications: server rendering, routing, SEO.",
        },
      },
      {
        id: "typescript",
        name: "JavaScript / TypeScript",
        summary: {
          ru: "Типизированный код от API-контрактов до интерфейса.",
          en: "Typed code from API contracts to the interface.",
        },
      },
      {
        id: "ssr",
        name: "SSR / Streaming",
        summary: {
          ru: "Серверный рендеринг и стриминг для быстрого первого экрана.",
          en: "Server rendering and streaming for a fast first screen.",
        },
      },
      {
        id: "state-management",
        name: "State management",
        summary: {
          ru: "Серверное и клиентское состояние раздельно, подписки только на нужные данные.",
          en: "Server and client state kept apart, subscriptions only to the data that matters.",
        },
      },
      {
        id: "forms",
        name: "Forms",
        summary: {
          ru: "Пользовательские формы и валидация данных на клиенте и сервере.",
          en: "User forms and data validation on the client and the server.",
        },
      },
      {
        id: "dashboards",
        name: "Admin panels",
        summary: {
          ru: "Клиентские приложения и административные панели.",
          en: "Client applications and admin panels.",
        },
      },
      {
        id: "pixijs",
        name: "PixiJS",
        summary: {
          ru: "Интерактивные WebGL-визуализации — как город на этом сайте.",
          en: "Interactive WebGL visualizations — like the city on this site.",
        },
      },
    ],
  },
  {
    id: "automation",
    title: { ru: "Automation & AI", en: "Automation & AI" },
    tagline: { ru: "Автоматизация, данные, AI", en: "Automation, data, AI" },
    lead: {
      ru: "Сервисы и боты, которые работают без участия человека, обработка данных, RAG и языковые модели — и Docker с облачной инфраструктурой, на которых всё это работает.",
      en: "Services and bots that run without a human in the loop, data processing, RAG and language models — and the Docker and cloud infrastructure they all run on.",
    },
    snippet: {
      file: "rag/retrieval.py",
      code: `async def retrieve(question: str, k: int = 4) -> list[Chunk]:
    vector = await embed(question)
    rows = await db.fetch(
        "SELECT id, text, source, embedding <=> $1 AS distance"
        " FROM chunks ORDER BY distance LIMIT $2",
        vector, k,
    )
    return [Chunk(**row) for row in rows if row["distance"] < MAX_DISTANCE]`,
      caption: {
        ru: "Поиск контекста для RAG в pgvector: ближайшие фрагменты по косинусному расстоянию и порог релевантности — далёкие фрагменты в ответ не попадают.",
        en: "Retrieving RAG context with pgvector: the closest fragments by cosine distance and a relevance threshold — distant fragments never reach the answer.",
      },
    },
    technologies: [
      {
        id: "python-automation",
        name: "Python automation",
        summary: {
          ru: "Скрипты и сервисы, которые убирают ручные действия и связывают системы между собой.",
          en: "Scripts and services that remove manual steps and connect systems with each other.",
        },
      },
      {
        id: "bots",
        name: "Bots",
        summary: {
          ru: "Боты с командами, многошаговыми сценариями и интеграциями, в том числе с AI-функциями.",
          en: "Bots with commands, multi-step scenarios and integrations, AI features included.",
        },
      },
      {
        id: "monitoring",
        name: "Logging & monitoring",
        summary: {
          ru: "Логирование выполнения задач и интерфейсы, где видны отказы и ошибки.",
          en: "Logging of task execution and interfaces that show rejections and errors.",
        },
      },
      {
        id: "docker",
        name: "Docker",
        summary: {
          ru: "Сервисы в контейнерах: одинаковое окружение на любой машине.",
          en: "Services in containers: the same environment on any machine.",
        },
      },
      {
        id: "cloud",
        name: "Cloud",
        summary: {
          ru: "Облачные базы данных и сервисы, настройки подключений вне кода.",
          en: "Cloud databases and services, connection settings kept outside the code.",
        },
      },
      {
        id: "rag-llm",
        name: "RAG & LLM",
        summary: {
          ru: "Поиск по базе знаний и языковые модели: ответы на основе собственных источников.",
          en: "Knowledge-base search and language models: answers grounded in your own sources.",
        },
      },
      {
        id: "data-science",
        name: "NumPy · SciPy · Pandas",
        summary: {
          ru: "Численные методы, интерполяция, обработка данных и графики Matplotlib.",
          en: "Numerical methods, interpolation, data processing and Matplotlib plots.",
        },
      },
      {
        id: "ai-assisted",
        name: "AI-assisted development",
        summary: {
          ru: "OpenAI Codex и Claude в работе: постановка задач, спецификации, ревью и проверка результата.",
          en: "OpenAI Codex and Claude at work: task framing, specifications, review and checking the result.",
        },
        shownAt: {
          path: "/projects#ai-workflow",
          label: { ru: "Как я работаю с AI", en: "How I work with AI" },
        },
      },
    ],
  },
]);

export function findStackArea(id: string): StackArea | undefined {
  return stackAreas.find((area) => area.id === id);
}

const technologies = new Map(
  stackAreas.flatMap((area) =>
    area.technologies.map(
      (technology) => [technology.id, { area, technology }] as const,
    ),
  ),
);

/** A technology and the stack area it belongs to (for links to /stack/[area]). */
export function findTechnology(id: string):
  | {
      readonly area: StackArea;
      readonly technology: StackArea["technologies"][number];
    }
  | undefined {
  return technologies.get(id);
}

export const stackAreaOrder: readonly StackAreaId[] = stackAreas.map(
  (area) => area.id,
);
