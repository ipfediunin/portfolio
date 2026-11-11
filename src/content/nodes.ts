import { nodeProfilesSchema, type NodeProfile } from "./schema";
import { stackAreas } from "./stack";

const technologyIds = new Set(
  stackAreas.flatMap((area) => area.technologies.map((tech) => tech.id)),
);

/** What the node inspector says about each component of the city. */
export const nodeProfiles: readonly NodeProfile[] = nodeProfilesSchema(
  technologyIds,
).parse([
  {
    nodes: ["client.web"],
    role: {
      ru: "Веб-клиент на Next.js: отправляет запросы к API и получает push-уведомление, когда фоновая задача готова.",
      en: "The Next.js web client: calls the API and receives a push when a background job is done.",
    },
    practices: [
      {
        ru: "Серверный рендеринг и стриминг: контент виден до загрузки JavaScript.",
        en: "Server rendering and streaming: content is visible before JavaScript loads.",
      },
      {
        ru: "Типизированный API-клиент, ответы проверяются через Zod.",
        en: "A typed API client; responses are validated with Zod.",
      },
      {
        ru: "Оптимистичные обновления и понятные состояния ошибок.",
        en: "Optimistic updates and clear error states.",
      },
    ],
    technologies: [
      "react",
      "nextjs",
      "typescript",
      "forms",
      "state-management",
      "dashboards",
      "pixijs",
    ],
  },
  {
    nodes: ["client.mobile"],
    role: {
      ru: "Мобильный клиент: тот же API, но медленная сеть и обрывы связи здесь — норма, а не исключение.",
      en: "The mobile client: the same API, but slow networks and dropped connections are the norm here.",
    },
    practices: [
      {
        ru: "Ключи идемпотентности: повтор после обрыва не создаёт второй заказ.",
        en: "Idempotency keys: a retry after a dropped connection never creates a second order.",
      },
      {
        ru: "Пагинация курсором и компактные ответы.",
        en: "Cursor pagination and compact responses.",
      },
      {
        ru: "Версионирование API: старые версии приложения продолжают работать.",
        en: "API versioning, so older app versions keep working.",
      },
    ],
    technologies: ["rest-api"],
  },
  {
    nodes: ["gateway"],
    role: {
      ru: "Единая точка входа: TLS, маршрутизация, проверка токена и rate limit — до того как запрос дойдёт до сервисов.",
      en: "The single entry point: TLS, routing, token checks and rate limiting before a request reaches any service.",
    },
    practices: [
      {
        ru: "Rate limit по token bucket: всплески сглаживаются, злоупотребления получают 429.",
        en: "Token-bucket rate limiting: bursts are smoothed out, abuse gets a 429.",
      },
      {
        ru: "Таймауты и лимит размера тела запроса на входе.",
        en: "Timeouts and request body limits at the edge.",
      },
      {
        ru: "Request ID и trace ID присваиваются здесь и проходят через всю систему.",
        en: "Request and trace IDs are assigned here and travel through the whole system.",
      },
    ],
    technologies: ["rest-api", "async-python"],
  },
  {
    nodes: ["scheduler"],
    role: {
      ru: "Запускает задачи по расписанию: отчёты, синхронизации, очистку устаревших данных.",
      en: "Starts jobs on a schedule: reports, syncs, cleanup of stale data.",
    },
    practices: [
      {
        ru: "Один экземпляр планировщика и блокировка: задача не запустится дважды.",
        en: "One scheduler instance plus a lock, so a job never starts twice.",
      },
      {
        ru: "Задачи идемпотентны: пропущенный или повторный запуск безопасен.",
        en: "Jobs are idempotent: a missed or repeated run is safe.",
      },
    ],
    technologies: ["background-jobs"],
  },
  {
    nodes: ["api.orders"],
    role: {
      ru: "Сервис заказов на FastAPI: проверяет запросы, читает и пишет в PostgreSQL, тяжёлую работу отдаёт в очередь.",
      en: "The FastAPI orders service: validates requests, reads and writes PostgreSQL and hands heavy work to the queue.",
    },
    practices: [
      {
        ru: "Контракты на Pydantic: некорректный запрос получает 422 с указанием поля.",
        en: "Pydantic contracts: an invalid request gets a 422 that names the field.",
      },
      {
        ru: "Пул соединений с базой и транзакция на границе запроса.",
        en: "A database connection pool and one transaction per request.",
      },
      {
        ru: "Read-through кэш для горячих чтений с инвалидацией при записи.",
        en: "A read-through cache for hot reads, invalidated on writes.",
      },
    ],
    technologies: ["fastapi", "rest-api", "postgresql"],
  },
  {
    nodes: ["api.payments"],
    role: {
      ru: "Платёжный сервис на Django: статусы платежей, возвраты и вебхуки провайдера.",
      en: "The Django payments service: payment states, refunds and provider webhooks.",
    },
    practices: [
      {
        ru: "Статусы платежа — конечный автомат: недопустимый переход невозможен.",
        en: "Payment states form a state machine: an invalid transition cannot happen.",
      },
      {
        ru: "Вебхуки обрабатываются идемпотентно, дубли от провайдера отбрасываются.",
        en: "Webhooks are handled idempotently; provider duplicates are dropped.",
      },
      {
        ru: "Миграции без простоя: сначала расширяем схему, потом переключаем код.",
        en: "Zero-downtime migrations: expand the schema first, then switch the code.",
      },
    ],
    technologies: ["django", "integrations"],
  },
  {
    nodes: ["cache.redis"],
    role: {
      ru: "Кэш горячих данных: повторное чтение занимает миллисекунды и не нагружает базу.",
      en: "A cache for hot data: a repeated read takes milliseconds and spares the database.",
    },
    practices: [
      {
        ru: "TTL на каждом ключе и явная инвалидация при изменении данных.",
        en: "A TTL on every key and explicit invalidation when the data changes.",
      },
      {
        ru: "Защита от лавины промахов: в базу идёт один запрос, остальные ждут его результат.",
        en: "Stampede protection: one request goes to the database, the rest wait for its result.",
      },
      {
        ru: "Здесь же — счётчики rate limit и короткие блокировки.",
        en: "Rate-limit counters and short-lived locks live here too.",
      },
    ],
    technologies: ["redis"],
  },
  {
    nodes: ["api.auth"],
    role: {
      ru: "Сервис авторизации на Flask: выдаёт токены и проверяет их по запросу gateway.",
      en: "The Flask auth service: issues tokens and verifies them for the gateway.",
    },
    practices: [
      {
        ru: "Короткоживущие access-токены и ротация refresh-токенов.",
        en: "Short-lived access tokens and rotating refresh tokens.",
      },
      {
        ru: "Пароли хранятся только как хэши, секреты — только в окружении.",
        en: "Passwords are stored only as hashes, secrets only in the environment.",
      },
    ],
    technologies: ["flask"],
  },
  {
    nodes: ["notifications"],
    role: {
      ru: "Хаб уведомлений: держит открытые соединения с клиентами и сообщает, что фоновая задача завершилась.",
      en: "The notification hub: keeps connections to clients open and tells them when a background job has finished.",
    },
    practices: [
      {
        ru: "Клиент не опрашивает сервер — событие приходит само.",
        en: "No polling: the event reaches the client by itself.",
      },
      {
        ru: "Переподключение с backoff; после него клиент заново спрашивает о том, чего ждёт, и ничего не теряет.",
        en: "Reconnects with backoff, then asks again for what it waits for: nothing is lost while offline.",
      },
      {
        ru: "Токен — первым сообщением, не в URL; соединение закрывается вместе с сессией.",
        en: "The token goes in the first message, never in the URL; the socket closes with its session.",
      },
    ],
    technologies: ["async-python"],
  },
  {
    nodes: ["broker.rabbit"],
    role: {
      ru: "Брокер сообщений: принимает задачи от API и раздаёт их воркерам, сглаживая пики нагрузки.",
      en: "The message broker: takes jobs from the API and hands them to workers, smoothing out load spikes.",
    },
    practices: [
      {
        ru: "Подтверждение после обработки (ack): задача не теряется, если воркер упал.",
        en: "Acknowledge after processing: a job survives a worker crash.",
      },
      {
        ru: "Отдельные очереди под типы задач, prefetch под их длительность.",
        en: "Separate queues per job type, prefetch tuned to how long they run.",
      },
      {
        ru: "Неудачные сообщения уходят в dead letter queue, а не в бесконечный цикл.",
        en: "Failed messages go to a dead letter queue instead of looping forever.",
      },
    ],
    technologies: ["message-brokers"],
  },
  {
    nodes: ["broker.kafka"],
    role: {
      ru: "Журнал событий: что уже произошло (заказ создан). Его независимо читают несколько групп потребителей — каждая со своей скоростью и своим смещением.",
      en: "The event log: what has already happened (an order was created). Several consumer groups read it independently, each at its own pace and offset.",
    },
    practices: [
      {
        ru: "Событие пишется в одной транзакции с данными (transactional outbox) и потом публикуется: ни потерянных, ни лишних событий.",
        en: "The event is written in the same transaction as the data (a transactional outbox) and published afterwards: no lost and no phantom events.",
      },
      {
        ru: "Ключ — id заказа: события одного заказа попадают в одну партицию и читаются по порядку.",
        en: "The order id is the key: one order's events land in one partition and are read in order.",
      },
      {
        ru: "Потребители идемпотентны: событие, доставленное дважды, узнаётся по его id.",
        en: "Consumers are idempotent: an event delivered twice is recognised by its id.",
      },
    ],
    technologies: ["message-brokers"],
  },
  {
    nodes: ["worker.celery", "worker.celery-2"],
    role: {
      ru: "Воркеры выполняют фоновые задачи: платежи, отчёты, интеграции. Два экземпляра делят очередь и масштабируются отдельно от API.",
      en: "Workers run background jobs: payments, reports, integrations. Two instances share the queue and scale separately from the API.",
    },
    practices: [
      {
        ru: "Ретраи с экспоненциальным backoff и jitter для временных ошибок.",
        en: "Retries with exponential backoff and jitter for transient errors.",
      },
      {
        ru: "Таймаут на каждый внешний вызов и лимит на число попыток.",
        en: "A timeout on every external call and a cap on attempts.",
      },
      {
        ru: "Задачи идемпотентны: повторное выполнение не спишет деньги дважды.",
        en: "Jobs are idempotent: running one twice never charges twice.",
      },
    ],
    technologies: ["background-jobs", "integrations"],
  },
  {
    nodes: ["db.postgres"],
    role: {
      ru: "Основное хранилище: заказы, платежи, пользователи. Источник правды для всей системы.",
      en: "The primary store: orders, payments, users. The source of truth for the whole system.",
    },
    practices: [
      {
        ru: "Индексы под реальные запросы, планы проверяются через EXPLAIN.",
        en: "Indexes for the real queries, plans checked with EXPLAIN.",
      },
      {
        ru: "Ограничения целостности в самой базе, а не только в коде.",
        en: "Integrity constraints in the database itself, not only in code.",
      },
      {
        ru: "Миграции под контролем версий, бэкапы с проверкой восстановления.",
        en: "Versioned migrations, backups with tested restores.",
      },
    ],
    technologies: ["postgresql"],
  },
  {
    nodes: ["db.replica"],
    role: {
      ru: "Реплика для чтения: тяжёлые отчёты и аналитика не мешают основной базе.",
      en: "A read replica: heavy reports and analytics stay off the primary database.",
    },
    practices: [
      {
        ru: "На реплику — чтения, которые терпят задержку репликации; критичные — на основную базу.",
        en: "Reads that tolerate replication lag go to the replica; critical ones go to the primary.",
      },
      {
        ru: "Отставание реплики под мониторингом.",
        en: "Replication lag is monitored.",
      },
    ],
    technologies: ["postgresql"],
  },
  {
    nodes: ["monitoring"],
    role: {
      ru: "Метрики, логи и алерты: система сообщает о проблеме раньше пользователей.",
      en: "Metrics, logs and alerts: the system reports a problem before users do.",
    },
    practices: [
      {
        ru: "Структурированные логи с trace ID: запрос видно через все сервисы.",
        en: "Structured logs with trace IDs: a request can be followed across services.",
      },
      {
        ru: "Алерты на симптомы: ошибки, задержки, рост DLQ.",
        en: "Alerts on symptoms: errors, latency, a growing DLQ.",
      },
    ],
    technologies: ["monitoring"],
  },
  {
    nodes: ["dlq"],
    role: {
      ru: "Очередь «мёртвых» сообщений: сюда попадают задачи, исчерпавшие попытки, — чтобы их разобрать, а не потерять.",
      en: "The dead letter queue: jobs that ran out of retries land here to be inspected instead of lost.",
    },
    practices: [
      {
        ru: "Каждое сообщение хранит причину отказа и число попыток.",
        en: "Every message keeps its failure reason and attempt count.",
      },
      {
        ru: "Алерт на рост очереди и повторная отправка после исправления.",
        en: "An alert when the queue grows, and a replay once the cause is fixed.",
      },
    ],
    technologies: ["message-brokers"],
  },
  {
    nodes: ["provider.payments"],
    role: {
      ru: "Внешний платёжный API за границей доверия: он может тормозить, падать и присылать дубли.",
      en: "An external payment API beyond the trust boundary: it can be slow, fail and send duplicates.",
    },
    practices: [
      {
        ru: "Вызывается только из воркеров, с таймаутом и ретраями — никогда внутри запроса пользователя.",
        en: "Called only from workers, with timeouts and retries — never inside a user's request.",
      },
      {
        ru: "Ключ идемпотентности на каждый платёж.",
        en: "An idempotency key on every charge.",
      },
    ],
    technologies: ["integrations"],
  },
  {
    nodes: ["web.cdn"],
    role: {
      ru: "CDN раздаёт статику — скрипты, стили, шрифты и картинки — с ближайшего к посетителю узла, не трогая сервер приложения.",
      en: "The CDN serves static assets — scripts, styles, fonts and images — from the edge closest to the visitor, without touching the app server.",
    },
    practices: [
      {
        ru: "Хэш в имени файла и долгий кэш: новая сборка не ломает открытые страницы.",
        en: "Content hashes in file names and long cache lifetimes: a new build never breaks open pages.",
      },
      {
        ru: "Изображения в современных форматах и нужных размерах.",
        en: "Images in modern formats and the sizes actually needed.",
      },
    ],
    technologies: ["nextjs"],
  },
  {
    nodes: ["web.next"],
    role: {
      ru: "Next.js-сервер рендерит страницы и стримит их по частям; серверные компоненты ходят в API через gateway, а в браузер уходит минимум JavaScript.",
      en: "The Next.js server renders pages and streams them in chunks; server components call the API through the gateway, and the browser gets as little JavaScript as possible.",
    },
    practices: [
      {
        ru: "Server Components по умолчанию, клиентские — только там, где нужна интерактивность.",
        en: "Server Components by default, client components only where interactivity needs them.",
      },
      {
        ru: "Стриминг через Suspense: медленный блок не задерживает всю страницу.",
        en: "Streaming with Suspense: one slow block does not hold up the whole page.",
      },
      {
        ru: "Мутации через Server Actions с проверкой данных на сервере.",
        en: "Mutations through Server Actions, with data validated on the server.",
      },
    ],
    technologies: ["nextjs", "ssr", "react", "typescript"],
  },
  {
    nodes: ["ops.ci"],
    role: {
      ru: "Сборка Docker-образа: сервис упаковывается вместе с зависимостями и окружением, в котором он работает.",
      en: "The Docker build: the service is packaged with its dependencies and the environment it runs in.",
    },
    practices: [
      {
        ru: "Зависимости зафиксированы, поэтому образ собирается одинаково на любой машине.",
        en: "Dependencies are pinned, so the image builds the same way on any machine.",
      },
      {
        ru: "В образе только то, что нужно для запуска сервиса.",
        en: "The image holds only what the service needs to run.",
      },
    ],
    technologies: ["docker"],
  },
  {
    nodes: ["ops.registry"],
    role: {
      ru: "Хранилище Docker-образов: собранный образ запускается в любом окружении без пересборки.",
      en: "The Docker image registry: a built image runs in any environment without a rebuild.",
    },
    practices: [
      {
        ru: "Образы помечены версией: всегда понятно, что именно запущено.",
        en: "Images are tagged with a version, so it is always clear what is running.",
      },
      {
        ru: "Один и тот же образ используется везде, где запускается сервис.",
        en: "The same image is used wherever the service runs.",
      },
    ],
    technologies: ["docker"],
  },
  {
    nodes: ["ops.parser"],
    role: {
      ru: "Задача синхронизации на Python: забирает данные из внешнего API, проверяет их и сохраняет в базу.",
      en: "A Python sync job: fetches data from an external API, checks it and stores it in the database.",
    },
    practices: [
      {
        ru: "Каждая запись проверяется схемой: некорректные данные не попадают в базу.",
        en: "A schema checks every record, so invalid data never reaches the database.",
      },
      {
        ru: "Ошибки внешнего API пишутся в лог и видны команде, а не теряются.",
        en: "External API errors are logged and visible to the team instead of getting lost.",
      },
      {
        ru: "Повторный запуск не создаёт дублей — запись идёт через upsert.",
        en: "Re-running creates no duplicates: records are written with upserts.",
      },
    ],
    technologies: ["python-automation", "integrations"],
  },
  {
    nodes: ["ops.bot"],
    role: {
      ru: "Чат-бот: принимает команды пользователей, запускает задачи и сообщает о результате и сбоях.",
      en: "A chat bot: takes users' commands, starts jobs and reports results and failures.",
    },
    practices: [
      {
        ru: "Вебхуки вместо long polling: сообщения приходят сразу.",
        en: "Webhooks instead of long polling: messages arrive at once.",
      },
      {
        ru: "Диалоги как конечный автомат: бот всегда знает, на каком шаге пользователь.",
        en: "Conversations as a state machine: the bot always knows which step the user is on.",
      },
    ],
    technologies: ["bots"],
  },
  {
    nodes: ["ext.site"],
    role: {
      ru: "Внешний API за границей доверия: источник данных, который мы не контролируем.",
      en: "An external API beyond the trust boundary: a data source we do not control.",
    },
    practices: [
      {
        ru: "Любой ответ считается недоверенным и проходит проверку.",
        en: "Every response is untrusted and gets checked.",
      },
      {
        ru: "Сбой или новый формат ответа фиксируется в логе, а не ломает задачу молча.",
        en: "A failure or a changed response format is logged instead of silently breaking the job.",
      },
    ],
    technologies: ["integrations"],
  },
]);

export function findNodeProfile(nodeId: string): NodeProfile | undefined {
  return nodeProfiles.find((profile) => profile.nodes.includes(nodeId));
}
