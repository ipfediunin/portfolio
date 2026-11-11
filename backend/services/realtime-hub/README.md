# realtime-hub

The city's **Notifications** building: holds the pages' WebSockets (`/ws`, routed by the edge
proxy) and pushes what concerns each page's sandbox.

```
order-worker  ── task ended ──────────┐  Notifier (Lua): inbox + PUBLISH events:<client>
notifications group ── order created ─┤
                                      ▼
Redis pub/sub  events:t:*  ·  traces:done  ──▶ realtime-hub ×2 ──WebSocket──▶ the page
```

Protocol (JSON, `contracts.realtime`, mirrored by Zod on the website):

| Direction | Message | Meaning |
|---|---|---|
| page → hub | `{"type": "auth", "token": …}` | first message, within 5 s; the token never goes in the URL |
| page → hub | `{"type": "watch", "trace_id": …}` | tell me when this trace's background part is done |
| hub → page | `{"type": "ready", "expires_in": …}` | authenticated; the socket closes when the sandbox expires |
| hub → page | `{"type": "notification", "event": …}` | `report.ready`, `payment.succeeded`, `order.created`, … |
| hub → page | `{"type": "trace.done", "trace_id": …}` | fetch the trace now; no polling |

Close codes: 4401 unknown sandbox, 4408 no auth in time, 4410 sandbox expired or deleted, 4429
too many sockets for the sandbox, 1008 malformed message or flooding, 1013 reconnect later (the
page read too slowly, or the hub lost Redis).

- **Order is the contract.** A producer publishes its notification before it marks the trace
  done; each replica handles Redis messages one at a time, so its push span is in the trace
  before it announces `trace.done`.
- **Every replica hears every sandbox** (`PSUBSCRIBE events:t:*`) and pushes to the sockets it
  holds; a sandbox may have sockets on several replicas.
- **Bounded per socket:** an outbox of 64 messages, 20 watched traces, 40 messages per 10 s from
  the page, 3 sockets per sandbox across replicas, 4 KB per message.
- **Nothing stored:** sockets live in memory; the token is hashed for the lookup and forgotten.
