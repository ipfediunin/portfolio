# messaging

The RabbitMQ topology as code, declared the same way by every service that touches it (declaring
is idempotent; different arguments would be refused by the broker, so they live in one place).

```
                        ┌──────────── jobs.payments ────────────┐ quorum, max 1000, reject-publish
POST /api/orders/42/pay │                                        │
  → exchange "jobs" ────┤ key "payments"            consumer: order-worker (prefetch 4)
                        │                                        │ attempt failed
                        │   jobs.payments.retry.1000ms  ◀────────┤ TTL 1 s → back to jobs.payments
                        │   jobs.payments.retry.2000ms  ◀────────┤ TTL 2 s → back to jobs.payments
                        │   jobs.payments.dlq           ◀────────┘ after the 3rd attempt
                        └─ jobs.reports (same shape)
```

- **Backpressure:** a full work queue nacks new publishes (`x-overflow: reject-publish`); the API
  answers 503 with `Retry-After` instead of piling up work it cannot finish. A quorum queue's limit
  is soft: it refuses once its length is *over* `max_queued`, so in-flight publishes may take it a
  little past the limit.
- **Delayed retries without plugins:** one queue per delay; an expired message is dead-lettered
  back to its work queue (at-least-once dead-lettering, so a full work queue holds it back rather
  than dropping it).
- **Poison messages:** `x-delivery-limit` moves a message that keeps crashing workers to the DLQ.
- **Nothing lingers:** queued jobs and dead letters expire with the sandbox (30 minutes).
- Every publish waits for the broker's confirm (`publisher_confirms`), so "queued" means queued.

## Kafka (`messaging.kafka`)

Events — what has happened — go to Kafka; jobs and commands stay on RabbitMQ.

```
orders.outbox ──▶ outbox-relay ──▶ orders.events  p0 · p1 · p2   (key = order id)
                                       ├─▶ group inventory      reserve stock      (PostgreSQL)
                                       ├─▶ group analytics      count the sale     (PostgreSQL)
                                       └─▶ group notifications  queue a message    (Redis)
```

- `ensure_topic` creates a topic with its partitions on purpose: automatic topic creation is off.
- `EventProducer` — `acks=all` and an idempotent producer: a resend after a lost acknowledgement
  does not duplicate the event in the log.
- `EventConsumer` — one member of a consumer group, `enable_auto_commit=False`: the service commits
  after handling, so a crash in between redelivers the event (handlers recognise a repeat by its
  `event_id`).
- aiokafka ships no type information; this module is the only place that touches it.

## Notifications for the page (`messaging.notifications`)

`Notifier.notify(owner, notification, once=…)` runs one Lua script: a once-marker (`SET NX`), the
sandbox's inbox (`RPUSH`, the last 20, expiring with the sandbox) and `PUBLISH events:<client>` for
the realtime hub. A redelivered job or event finds its marker and changes nothing; work without a
sandbox (filed under a hashed IP) notifies nobody.
