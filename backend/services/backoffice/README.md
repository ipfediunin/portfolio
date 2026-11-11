# backoffice — Payments API and back office (Django)

The city's "Payments API · Django" building, live:

| Endpoint | Who calls it | What it does |
|---|---|---|
| `POST /webhooks/payments` | the payment provider (in the demo: the page, signing as the provider), through the edge proxy | verifies the sandbox, the HMAC signature and the event; applies it at most once and only along the payment state machine |
| `GET /internal/orders/{id}/payment-methods` | the Orders API only (`X-Internal-Token`) | asks the provider behind a circuit breaker; while it is open, fails fast with 503 |
| `/admin/` | the owner, on 127.0.0.1:8001 only | read-only views of payments, webhook events and the Orders API's tasks (failed ones are the dead-letter queue's records) |

**Webhooks.** `Webhook-Signature: t=<unix>,v1=HMAC-SHA256(secret, "t.body")` over the exact
bytes, five minutes of tolerance against replays; the secret belongs to the sandbox
(`contracts.webhooks`). The event is recorded under a unique `(sandbox, event id)` constraint —
a repeated delivery changes nothing (`X-Idempotent-Replay: true`). The payment moves only along
`TRANSITIONS` (pending → succeeded/failed, failed → succeeded), applied atomically in SQL; any
other move answers 409 and keeps nothing.

**Circuit breaker.** Shared by the replicas through Redis (Lua scripts, the Redis server's clock):
three failures in a row open it, after eight seconds one trial call decides. Per sandbox, so one
visitor's outage demo does not trip it for others.

**Tracing.** Every SQL statement the ORM runs becomes a span with its real text
(`connection.execute_wrapper`). Called by the Orders API, the spans join its trace; as the entry
point (webhooks) the service stores the trace itself.

```bash
uv run backoffice-migrate                       # creates the "backoffice" schema, applies migrations
uv run backoffice                               # gunicorn on 0.0.0.0:8001
uv run backoffice-manage createsuperuser        # the owner's admin account
uv run backoffice-manage sweep_expired          # deletes expired sandbox payments and events
```

Settings come from `BACKOFFICE_*` (see `backend/.env.example`). The service owns the `backoffice`
schema of the shared database; it reads the Orders API's tasks but never writes another
service's schema.
