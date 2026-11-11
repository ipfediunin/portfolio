# telemetry

Shared by every service of the backend:

- `span(kind, name)` — times one step into the current recorder (a request in the API, a job
  attempt in a worker); a no-op outside one.
- `RequestRecorder` — the API's recorder: finishes into a `contracts.Trace`.
- `SpanRecorder` — a worker's recorder: placed on the request's clock, drained after each step.
- `trace_id_from` (W3C `traceparent`), `server_timing` (the `Server-Timing` header).
- `configure_logging` — JSON lines on stdout with the trace id, no client data.
