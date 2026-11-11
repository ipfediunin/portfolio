# provider-stub

A local stand-in for an external payment provider — the "Payment Provider" building of the city.
It is not a payment system and moves no money; it behaves like one where it matters for the
worker's resilience:

- `POST /v1/charges` with an `Idempotency-Key` header: the first successful call creates a charge
  (`201`), every later call with the same key returns the same charge (`200`,
  `Idempotent-Replayed: true`) — a redelivered job never charges twice. The same key with a
  different body is refused (`409`).
- **Fault injection:** `X-Fault-Fail-Attempts: N` makes the first N calls for a key answer `503`.
  The playground's "Provider failures in a row" control sets it, so retries and the dead-letter
  queue can be shown on demand.
- State lives in the stub's own memory (bounded, one hour) — an external system does not share
  our Redis.

Runs only inside the compose network (`http://provider-stub:8100`), no port on the host.
