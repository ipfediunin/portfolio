# order-worker

Consumes the Orders API's jobs from RabbitMQ (`jobs.reports`, `jobs.payments`). Runs as two
replicas in compose: competing consumers, each with `prefetch 4`.

| Job | Work | Spans in the trace |
|---|---|---|
| `report` | sales of a month over the orders the owner can see | `consume` → `db` (aggregate) → `db` (finish task) |
| `charge` | charge the order through the payment provider | `consume` → `external` → `db`, or `retry` / `dead_letter` |

**Failures.** A failed attempt is classified: *transient* (provider 5xx or timeout, database
unavailable) goes to a retry queue with exponential backoff (1 s, 2 s); after the third attempt —
or right away for a *permanent* failure (provider 4xx, a bug) — the job goes to the dead-letter
queue with the reason in `x-last-error`, and the task is marked failed.

**At-least-once, idempotent.** A message is acknowledged only after its next step is stored (task
outcome, confirmed retry copy, confirmed dead letter). A redelivered job is harmless: the
provider gets the task id as `Idempotency-Key`, and finishing a task changes only a queued one.

**Tracing.** Each attempt records spans on the request's clock and appends them to the request's
trace in Redis; the website replays them on the city after the synchronous part.

**Shutdown.** On SIGTERM the worker stops taking jobs, gives running attempts
`ORDER_WORKER_SHUTDOWN_GRACE_SECONDS` to finish, and exits; anything unacknowledged is redelivered
to the other replica.
