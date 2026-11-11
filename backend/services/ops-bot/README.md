# ops-bot

The owner's Telegram bot, on Flask: what the system is doing, its dead letters and their replay,
and alerts when something really breaks. It answers only the user ids in `OPS_BOT_OWNER_IDS`, in
a private chat; anyone else gets no answer at all.

| Command | What it shows or does |
|---|---|
| `/status` | Orders API, Payments API and realtime hub health; work queues (waiting, consumers) and dead-letter queues; unpublished outbox events; each consumer group's lag |
| `/dlq` | Dead letters per queue and the tasks that failed in the last 30 minutes (fault injection or a real failure), with a **Replay** button per queue |
| `/alerts` | Problems open right now |

**Replay** moves a queue's dead letters back to its work queue as first attempts. Per message: the
task row is reset from `failed` to `queued` in a transaction that stays open until the broker
confirms the job (a worker that takes it at once waits on the row lock, then finds the task
queued); the dead letter is acknowledged only after the commit. A dead letter whose task is gone
(the sandbox expired) is removed. The button carries a one-time nonce (Redis, five minutes), so an
old message cannot replay twice.

**Alerts** — every 30 s `ops-bot run` reads the same report as `/status` and tells the owner what
is new and what cleared (edge-triggered; open problems are kept in Redis, so a restart neither
repeats nor forgets them): a service not ready, a part that cannot be read, a work queue without
consumers or close to its limit, an event stuck in the outbox, a consumer group far behind, a
task that died without fault injection. The failures visitors ask for in the playground never
alert.

## Two processes, one image

- `ops-bot serve` (the default) — gunicorn with the Flask app: `POST /telegram/webhook` (through
  the edge; refused without the `X-Telegram-Bot-Api-Secret-Token` registered with the webhook) and
  `GET /healthz`.
- `ops-bot run` — the checks and alerts; at start it registers the commands and the transport.

Transports: `webhook` on the server (needs the site's public HTTPS address, `OPS_BOT_PUBLIC_URL`,
and `OPS_BOT_WEBHOOK_SECRET`); `polling` locally — `ops-bot run` asks Telegram for updates itself
and nothing is exposed. Without a token the bot runs and only logs the alerts it would send.

## Set it up

1. Create a bot with @BotFather (a bot of its own, not the contact form's) and put its token in
   `backend/.env` as `OPS_BOT_TELEGRAM_TOKEN`.
2. Put your Telegram user id in `OPS_BOT_OWNER_IDS=[…]` (for example from @userinfobot).
3. `docker compose up -d` — locally the bot polls; send it `/status`.
4. On the server: `OPS_BOT_TRANSPORT=webhook`, `OPS_BOT_PUBLIC_URL=https://<site>`,
   `OPS_BOT_WEBHOOK_SECRET=<32+ random characters>`.

The token is part of the Bot API's request path: the bot never logs URLs, and telemetry keeps
httpx's request log off for every service.
