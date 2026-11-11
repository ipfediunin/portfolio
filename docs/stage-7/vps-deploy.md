# Выкладка сайта и живого бэкенда на VPS

Runbook для одного сервера: сайт (Next.js) и живой бэкенд работают в одном `docker compose` за одним Caddy. Выкладка — только с согласия владельца и на его сервере: сервер, домен и аккаунты создаёт владелец.

Схема:

- `https://<домен>` — сайт (сервис `site`, образ из `Dockerfile` в корне репозитория); `https://www.<домен>` перенаправляет туда;
- `https://api.<домен>` — живой бэкенд (Orders API, Payments API, WebSocket, вебхук бота);
- наружу открыты только 80 и 443 (Caddy, сервис `edge`), сертификаты Let's Encrypt Caddy получает и продлевает сам.

## Что нужно от владельца

- Согласие на выкладку.
- VPS: Ubuntu 24.04 LTS, доступ по SSH-ключу.
- DNS у регистратора домена — три A-записи (и AAAA, если у сервера есть IPv6) на IP сервера: `<домен>`, `www.<домен>`, `api.<домен>`. Если DNS в Cloudflare (как у `fediunin.com`), записи ставятся в режиме «DNS only» (серое облако): сертификаты выпускает и продлевает Caddy на сервере. Проксирование Cloudflare (оранжевое облако) можно включить позже, только с SSL/TLS в режиме «Full (strict)» — в режиме «Flexible» сайт уйдёт в бесконечный редирект.
- Email для Let's Encrypt (`ACME_EMAIL`): на него приходят письма об истекающих сертификатах.
- Публичные данные для сайта: email, профили (GitHub, LinkedIn, Telegram), по желанию — фото, CV, ссылка на запись.
- Форма контакта (по желанию): бот от @BotFather и свой Telegram user id.
- Ops-бот (по желанию): ещё один бот от @BotFather.

## Размер сервера

Лимиты контейнеров в `compose.yaml` в сумме дают около 3,2 ГБ памяти (Kafka 768 МБ, RabbitMQ 512 МБ, два воркера по 192 МБ, Orders API и Payments API по 256 МБ, остальное по 128 МБ), плюс PostgreSQL, Redis и сайт (512 МБ). По замерам (страница `/architecture/report`) под нагрузкой 60 посетителей пики памяти заметно ниже лимитов, по CPU больше всего берут Kafka и RabbitMQ.

- Минимум: 2 vCPU, 4 ГБ RAM, 40 ГБ диска. Сборке сайта (`next build`) на 4 ГБ тесно рядом с работающим стеком — добавьте swap 2–4 ГБ.
- С запасом (сборка образов на сервере, всплески Kafka): 4 vCPU, 8 ГБ RAM.

## Подготовка сервера

1. Пользователь для выкладки с SSH-ключом; в `/etc/ssh/sshd_config` — `PasswordAuthentication no`, `PermitRootLogin no`.
2. Файрвол: открыты только SSH, 80 и 443.
   ```bash
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow 443/udp
   sudo ufw enable
   ```
   Docker публикует порты в обход ufw, поэтому важно, что `compose.prod.yaml` публикует наружу только 80 и 443 (edge), а админку Django — только на 127.0.0.1.
3. Автоматические обновления безопасности: `sudo apt install unattended-upgrades`.
4. Docker Engine из официального репозитория Docker (не snap), плагин compose.
5. Ротация логов контейнеров — `/etc/docker/daemon.json`:
   ```json
   {
     "log-driver": "json-file",
     "log-opts": { "max-size": "10m", "max-file": "3" }
   }
   ```
   затем `sudo systemctl restart docker`.

## Выкладка

1. Код на сервер: `git clone` репозитория (или копия папки проекта без `node_modules`, `.next`, `.venv`).
2. `backend/.env` — из шаблона `backend/.env.production.example`, со случайными секретами:
   ```bash
   sh backend/scripts/init-prod-env.sh
   ```
   Затем вписать в `backend/.env`: `SITE_DOMAIN` (домен без `https://` и `www`), `API_DOMAIN` (`api.<домен>`), `ACME_EMAIL` и публичные данные сайта (`NEXT_PUBLIC_*`: имя, возраст, email, профили, фото, CV). Без обязательной переменной compose откажется запускаться и назовёт её.
3. Запуск (образы собираются на сервере, первый раз — несколько минут):
   ```bash
   cd backend
   docker compose -f compose.yaml -f compose.prod.yaml up -d --build
   ```
   Миграции (Alembic и Django) выполняются сами, до старта сервисов. Caddy получает сертификаты при первом запросе на каждый домен — DNS к этому моменту уже должен указывать на сервер.
4. Проверка:
   ```bash
   curl -fsSI https://<домен>/
   curl -fsS https://<домен>/robots.txt
   curl -fsS https://api.<домен>/healthz
   curl -fsS https://api.<домен>/readyz
   docker compose -f compose.yaml -f compose.prod.yaml ps
   ```
   В браузере: главная, `/architecture` → режим Live API и отправка запроса, `/privacy` с разделом Live API.

Сайт собирается из корня репозитория (`Dockerfile`). `NEXT_PUBLIC_*` вшиваются при сборке, поэтому после правки данных в `backend/.env` — снова `up -d --build`. Адреса сайта и API (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_LIVE_API_URL`) и индексацию (`NEXT_PUBLIC_SITE_INDEXABLE=true`) compose выводит из доменов сам. Токен бота формы уходит в сборку как build secret и в слои образа не попадает.

Фото и CV — файлы в `public/` репозитория (например `public/owner.jpg`, `public/cv.pdf`), в `.env` — путь к ним (`NEXT_PUBLIC_OWNER_PHOTO=/owner.jpg`).

## Админка Django

Админка слушает только 127.0.0.1 сервера; владелец открывает её через SSH-туннель:

```bash
ssh -L 8001:127.0.0.1:8001 <пользователь>@<сервер>
```

и `http://127.0.0.1:8001/admin/` у себя. Учётная запись владельца — один раз:

```bash
docker compose -f compose.yaml -f compose.prod.yaml exec payments backoffice-manage createsuperuser
```

## Telegram-боты

Боты от @BotFather (бесплатно). Форме и ops-боту хватает одного бота (у `fediunin.com` — @fediunin_bot): форма только отправляет сообщения, а webhook Telegram забирает ops-бот. Отдельный бот нужен, только если сообщения формы и оповещения должны приходить в разные чаты.

- Форма контакта: `CONTACT_TELEGRAM_BOT_TOKEN` и `CONTACT_TELEGRAM_CHAT_ID` (свой числовой user id, узнать у @userinfobot; боту нужно один раз написать `/start`, иначе он не сможет прислать сообщение). Форма появится на `/contact` после пересборки сайта.
- Ops-бот: `OPS_BOT_TELEGRAM_TOKEN` (тот же токен или другой бот), `OPS_BOT_OWNER_IDS=[<user id>]`; `OPS_BOT_WEBHOOK_SECRET` уже сгенерирован скриптом. Режим webhook и адрес `https://$API_DOMAIN` задаёт `compose.prod.yaml`; `ops-bot-run` сам регистрирует webhook при старте.

## Обновление и откат

```bash
git pull
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
```

Откат — `git checkout <предыдущий тег или коммит>` и та же команда. Схема БД меняется только вперёд; при откате через миграцию сначала проверить её `downgrade`.

## Данные и резервные копии

Песочницы, заказы, задачи, события и трассы живут не дольше 30 минут (Redis — без persistence, очереди и Kafka держат только демо-данные). Ценное — только учётная запись владельца в админке. Достаточно ежедневной копии схемы `backoffice`:

```bash
docker compose -f compose.yaml -f compose.prod.yaml exec -T postgres pg_dump -U runtime -n backoffice runtime_city > backoffice-$(date +%F).sql
```

## Наблюдение

- Бот пишет владельцу о настоящих проблемах: сервис не готов, очередь без воркеров или у предела, outbox застрял, consumer group отстаёт, задача упала в DLQ без внедрённого сбоя.
- `docker compose ... ps` — состояние и healthcheck'и; `docker compose ... logs -f --tail 100 <сервис>` — логи (JSON, без IP посетителей).

## Замеры на сервере

Отчёт на сайте сейчас снят на машине разработчика. На сервере:

```bash
cd backend
uv sync --group load
uv run --group load python scripts/run_load.py --host https://api.<домен>
uv run python scripts/run_chaos.py --host https://api.<домен>
```

Chaos-эксперименты по-настоящему останавливают Kafka, RabbitMQ, Redis и убивают воркер — запускать до анонса или в тихие часы. Скрипты пишут `src/content/reports/*.json`; их коммитят, и сайт пересобирается с новыми цифрами. Нагрузка с того же сервера отнимает у сервисов CPU; это надо указать в подписи.

## Чек-лист безопасности

- [ ] Все секреты в `.env` сгенерированы на сервере, `.env` не в git.
- [ ] Наружу открыты только 22, 80, 443; админка только через SSH-туннель.
- [ ] `SITE_DOMAIN` — точный домен сайта: из него собираются CORS, проверка Origin у WebSocket и адреса сайта.
- [ ] `compose.load.yaml` на сервере не используется (он снимает rate limits).
- [ ] Сертификаты выданы: `curl -vI https://<домен>` и `curl -vI https://api.<домен>` без ошибок TLS.
- [ ] В логах нет IP посетителей и токенов (access log выключен, лог httpx приглушён).
