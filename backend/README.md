# Runtime City · live backend

The services behind the website's **Live API** mode: the playground sends a real request, the
services record what they did, and the city replays the actual trace — real status, headers,
body, SQL, Redis, RabbitMQ and Kafka operations, measured in milliseconds — and pushes the
outcome of queued work back to the page over a WebSocket.

```
Browser (Next.js) ──HTTPS──▶ edge (Caddy) ─┬─ /webhooks/* ──▶ Payments API (Django) ──▶ provider-stub
                                           │                    ▲   │  circuit breaker, signed webhooks,
                                           │       /internal/   │   │  payment state machine, admin
                                           ├─ /ws (WebSocket) ──▶ realtime-hub ×2 ◀── Redis pub/sub ◀── workers
                                           ├─ /telegram/* ──▶ ops-bot (Flask) ◀── the owner, in Telegram
                                           └─ everything else ──▶ Orders API (FastAPI)
                                                                 │   │
     Redis       sandboxes · token buckets · cache · traces · breakers ◀───┤
     PostgreSQL  schema "orders" (Alembic) · schema "backoffice" (Django) ◀┤
     RabbitMQ    jobs.reports · jobs.payments (+ retry, DLQ) ◀── publish ──┤
                      └──▶ order-worker ×2 ──▶ provider-stub                │ order + event, one statement
     PostgreSQL  orders.outbox ──▶ outbox-relay ──▶ Kafka orders.events (3 partitions) ◀┘
                      └──▶ consumer groups inventory · analytics · notifications (in order-worker ×2)
Every service appends its spans to the request's trace in Redis; GET /api/traces/{id} puts it together.
```

| Stage | Service | Status |
|---|---|---|
| 1 | `services/orders-api` — FastAPI: sandbox, rate limit, auth, validation, cache, SQL, traces | done |
| 2 | `services/order-worker` — RabbitMQ consumers, retries with backoff, dead letters; `services/provider-stub` | done |
| 3a | `services/backoffice` — Django: Payments API (checkout behind a circuit breaker, signed idempotent webhooks, payment state machine), admin; the `edge` proxy | done |
| 3b | transactional outbox (`orders-api-relay`) → Kafka; three consumer groups in `order-worker` | done |
| 3c | `services/realtime-hub` — FastAPI WebSocket: pushes a sandbox's notifications and finished traces to the page | done |
| 4 | `services/ops-bot` — Flask: the owner's Telegram bot (status, dead letters and their replay, alerts) | done |

Shared libraries:

- `libs/contracts` — the formats shared between services and with the website: `Trace` (with the
  workers' background part), job messages (`ReportJob`, `ChargeJob`), Redis keys of traces.
- `libs/telemetry` — `span(kind, name)`, the request and worker recorders, JSON logs.
- `libs/messaging` — the RabbitMQ topology as code and confirmed publishing; the Kafka adapter
  (topic setup, idempotent producer, consumers that commit after handling); the `Notifier` that
  files a notification for a sandbox and publishes it to the realtime hub
  ([details](libs/messaging/README.md)).

## Run it

Requirements: Docker, Python 3.12, [uv](https://docs.astral.sh/uv/).

```bash
uv sync --all-packages --all-groups   # one .venv for every service and the tools
docker compose up -d --build          # everything; the edge answers on 127.0.0.1:8000
docker compose exec payments backoffice-manage createsuperuser   # the owner's admin account
```

The Django admin is on http://127.0.0.1:8001/admin/ — on the host only, never through the edge.

The website talks to it when `NEXT_PUBLIC_LIVE_API_URL=http://localhost:8000` is set in the
Next.js project's `.env.development.local`. OpenAPI docs: http://127.0.0.1:8000/docs. RabbitMQ's
management UI: http://127.0.0.1:15673 (user `runtime`). Kafka for tools on the host:
`127.0.0.1:9094`.

Every Python service is built from one `Dockerfile` with `--build-arg SERVICE=<name>`; a new
workspace member's `pyproject.toml` has to be listed there too (uv reads the whole workspace).

Run a service on the host instead (data stores and broker in Docker):

```bash
docker compose up -d postgres redis rabbitmq kafka
cp .env.example .env        # then set the variables in your shell, or use an env loader
uv run orders-api-migrate
uv run orders-api           # and/or: uv run orders-api-relay, uv run provider-stub,
                            #         uv run order-worker
```

## Load, chaos and production

- `scripts/locustfile.py` — a playground visitor with a sandbox of their own; `scripts/run_load.py`
  runs it at several levels and writes `src/content/reports/load.json`, `scripts/run_chaos.py` runs
  the chaos experiments (a worker killed mid-job, Kafka, RabbitMQ and Redis down) and writes
  `chaos.json`. The website shows both on `/architecture/report`. For the runs `compose.load.yaml`
  lifts the per-visitor rate limits (one machine plays every visitor); never deploy with it.
- Production on one VPS: `docker compose -f compose.yaml -f compose.prod.yaml up -d --build` —
  HTTPS by Caddy (`infra/edge/Caddyfile.prod`), only 80/443 published, no default for any secret.
  Runbook: [docs/stage-7/vps-deploy.md](../docs/stage-7/vps-deploy.md).

```bash
uv run --group load python scripts/run_load.py   # needs the compose stack running
uv run python scripts/run_chaos.py               # stops and kills containers on purpose
```

## Checks

```bash
uv run ruff format --check . && uv run ruff check .
uv run mypy                      # strict
uv run pytest                    # unit + integration (integration needs the compose stores)
uv run pytest -m "not integration"
uv run pytest -m broker          # jobs and events end to end: API, worker, relay, stub in one process
```

Integration tests use a separate database (`runtime_city_test`), Redis database 15, and queues,
a topic and consumer groups prefixed `test.` on the same brokers (Kafka on `127.0.0.1:9094`). Without the stores they are skipped; `REQUIRE_INTEGRATION=1`
makes them fail instead (for CI).

## How a live request is traced

1. The browser sends a W3C `traceparent`; the service continues that trace id.
2. Every step runs inside `span(kind, name)`: `rate_limit`, `auth`, `validate`, `handle`,
   `cache_get`, `cache_set`, `db`, `publish`, `breaker`, `external`, `notify`, `push`. Names are
   the real operations
   (the SQL that ran, the Redis command, the queue) without values. A service the request calls
   (the Payments API behind checkout) gets the trace context (`traceparent`,
   `X-Trace-Started-At`) and appends its spans to the request's trace; in Django every ORM
   statement becomes a span through `connection.execute_wrapper`.
3. When the response starts, the trace is stored in Redis for five minutes and the response gets
   `X-Trace-Id` and `Server-Timing` (visible in the browser's DevTools → Network → Timing).
4. A request that queued a job answers 202 with `Location: /api/tasks/{id}`. The job carries the
   trace id; the worker records `consume`, `external`, `retry`, `dead_letter` and `db` spans on the
   request's clock and appends them to the trace, then marks it done. A created order's event
   carries the trace id too: the relay appends its `publish`, each consumer group its `consume`
   and its work (tagged with `group`), and the trace is done when all four have.
5. When the work ends, the worker (or the notifications group) files a notification for the
   sandbox and publishes it (`notify`); the realtime hub pushes it to the page's socket and records
   `push`. Marking the trace done publishes `traces:done`; the hub tells the page that watches the
   trace (see [the hub's README](services/realtime-hub/README.md) for why the order is reliable).
6. The website fetches `GET /api/traces/{id}` and compiles it with the same compiler as the
   simulation (`src/simulation/runtime/session.ts`): the scenario gives the path through the city,
   the trace gives the decisions and the milliseconds. For queued work it fetches the trace again
   when the hub says it is done (without a socket it polls) and replays the background part as the
   continuation of the same run.

`libs/contracts/fixtures` holds exchanges recorded from the running stack
(`uv run python scripts/record_fixtures.py`); the backend tests check they still match the
services' behaviour, and the website tests check they replay correctly.

## Jobs, retries and the dead-letter queue

- **Report** (`POST /api/reports`) — the worker sums a month of the orders the client can see.
- **Payment** (`POST /api/orders/{id}/pay`, sandbox token required) — the amount must match the
  order (checked in the same SQL statement that records the task); the worker charges it through
  the provider stub. `X-Fault-Fail-Attempts: N` makes the stub fail the first N calls, so the
  playground can show retries (1 s, 2 s) and, after the third failure, the dead-letter queue.
- **At-least-once, idempotent.** A message is acknowledged only after its next step is stored.
  A redelivered job does no harm: the provider gets the task id as `Idempotency-Key`, and a task
  is finished only from `queued`.

## Order events: outbox, Kafka, consumer groups

- **Transactional outbox.** `POST /api/orders` writes the order and its `order.created` event
  (`contracts.OrderCreated`) in one SQL statement: there is no order without its event and no
  event without its order, and the request never waits for Kafka — it answers 201 even when Kafka
  is down. `outbox-relay` (`orders-api-relay`, same image as the API) claims unpublished rows with
  `FOR UPDATE SKIP LOCKED`, publishes them (`acks=all`, idempotent producer) and marks them in the
  same transaction; if Kafka refuses mid-batch, the batch rolls back and goes out again.
- **One topic, three groups.** `orders.events` has three partitions, keyed by the order id (one
  order's events stay in order). `inventory` reserves stock and `analytics` counts the day's sales
  (PostgreSQL), `notifications` queues a message for the sandbox (Redis). Each group reads the
  whole topic at its own pace; both worker replicas run a member of every group, so Kafka spreads
  the partitions and rebalances when one stops. Jobs and commands stay on RabbitMQ.
- **At-least-once, idempotent.** The offset is committed after the work. Marking the event as
  handled (`orders.processed_events`, a Redis `SET NX` for notifications) and doing the work are
  one statement or one script, so a redelivered event changes nothing. A group that cannot reach
  its database retries the same event (the partition waits, so order is kept).

## The owner's bot (ops-bot)

A Telegram bot on Flask, for the owner only: `/status` (services, queues, outbox, consumer lag),
`/dlq` with a button that replays a queue's dead letters, `/alerts`; it alerts by itself when
something really breaks, never for the failures visitors ask for in the playground. Webhook
through the edge on the server, long polling locally; without a token it only logs its alerts.
Details and setup: [services/ops-bot](services/ops-bot/README.md).

## Pushes to the page (realtime hub)

- **One socket per page, authenticated by the sandbox token in the first message** (never in the
  URL); an allowed `Origin` only; closed when the sandbox expires or is deleted.
- **Redis pub/sub between producers and the hub:** every replica listens to every sandbox channel
  and pushes to the sockets it holds, so the sockets can be spread over replicas.
- **Pub/sub keeps nothing:** a notification published while the page's socket is not open is
  filed in the sandbox's inbox but pushed to nobody, and the trace says so (`notify` without
  `push`). The page waits for its socket before the first request of a new sandbox; after a
  reconnect it asks again for the traces it waits for.
- **Bounded:** a slow page is closed rather than buffered for; a few sockets per sandbox; message
  size, rate and watched traces are capped.

## Troubleshooting on Windows

- **A pull hangs at "Pulling fs layer" or "Download complete".** Pull the official image from
  Google's Docker Hub mirror and tag it, compose then uses it as is:
  `docker pull mirror.gcr.io/library/rabbitmq:4-management-alpine && docker tag mirror.gcr.io/library/rabbitmq:4-management-alpine rabbitmq:4-management-alpine`
  (the same for `postgres:17-alpine` and `python:3.12-slim`; Kafka is
  `mirror.gcr.io/apache/kafka:4.1.0` → `apache/kafka:4.1.0`). If even a tiny image does not pull,
  Docker Desktop's pull pipeline is stuck: restart Docker Desktop.
- **Docker Desktop does not start again ("backend crashed … remove …\dockerInference: The file
  cannot be accessed by the system").** With a non-ASCII user profile path, Windows leaves AF_UNIX
  socket files that cannot be removed. Quit Docker Desktop, rename
  `%LOCALAPPDATA%\Docker\run` and `%LOCALAPPDATA%\docker-secrets-engine` (any new name), start it
  again; the renamed folders can be deleted after a reboot.
- **`listen EACCES` on port 3100 in the e2e tests.** Windows reserved the port range
  (`netsh interface ipv4 show excludedportrange protocol=tcp`): run `E2E_PORT=3200 npm run test:e2e`.

## Privacy by design

- **No accounts.** A sandbox is a random 256-bit token kept in the page's memory; the service
  stores only its SHA-256 hash, for 30 minutes. The realtime hub reads the token once, from the
  socket's first message, to find the sandbox; open sockets live only in its memory.
- **No raw IPs.** Rate limits use an HMAC of the IP keyed by a secret that changes every day.
  Uvicorn's access log is off; logs carry trace ids, not addresses.
- **Nothing personal to store.** The order body is product, quantity and delivery type; a job holds
  the task id, demo fields and the hashed client key; a webhook event its id, type and order number;
  an order event the order's demo fields and the hashed client key.
  Sandbox orders, tasks, payments and webhook events are deleted when the sandbox expires (sweepers
  run every minute) or on request.
- **Nothing lingers.** Redis keeps nothing on disk and every key has a TTL. RabbitMQ keeps queued
  jobs on disk (that is what makes "queued" survive a restart), and they — dead letters included —
  expire after 30 minutes. Kafka keeps events for an hour, in the container only; published
  outbox rows are deleted after 10 minutes, the groups' bookkeeping after a day, the day's sales
  counters (aggregates without an owner) after 30 days.

## Protection of the public API

- Token buckets per client and per IP, checked atomically in one Lua script (time from the Redis
  server, so replicas agree); separate budgets for sandbox creation and trace reads.
- **Backpressure:** work queues are bounded; when one is full the broker refuses the publish and
  the API answers 503 with `Retry-After` instead of accepting work it cannot finish.
- Bodies over 4 KB are rejected; strict validation; parameterised SQL only.
- Webhooks: a valid sandbox, an HMAC signature over the exact body, five minutes of tolerance
  against replays, a per-sandbox budget; the Payments API's /internal/ endpoints need a shared
  token and are not routed by the edge; the admin listens on 127.0.0.1 only.
- CORS limited to the website's origins; containers run as a non-root user on a read-only
  filesystem with CPU and memory limits; only the edge (and the owner's admin) has a host port.
