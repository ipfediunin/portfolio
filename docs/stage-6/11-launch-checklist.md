# 11 · Чек-лист запуска

## Критерии приёмки Stage 6

| #   | Критерий                                     | Статус                                                                                                           |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Сайт полностью англоязычный                  | готово                                                                                                           |
| 2   | Нет ненужного переключателя языков           | готово                                                                                                           |
| 3   | Главная ясно объясняет специализацию         | готово                                                                                                           |
| 4   | Employers и Clients имеют отдельные маршруты | готово (`/for-employers`, `/hire`)                                                                               |
| 5   | 9 кейсов сохранены                           | готово                                                                                                           |
| 6   | PixiJS-город работает                        | готово (e2e, perf:scene)                                                                                         |
| 7   | Основной SEO-контент в серверном HTML        | готово                                                                                                           |
| 8   | Корректные метаданные индексируемых страниц  | готово; абсолютные URL — **EXTERNAL CONFIG REQUIRED** (домен)                                                    |
| 9   | Sitemap и robots работают                    | готово; production-режим robots — **EXTERNAL CONFIG REQUIRED** (`NEXT_PUBLIC_SITE_INDEXABLE=true` на production) |
| 10  | Canonical URLs корректны                     | логика готова; реальный домен — **EXTERNAL CONFIG REQUIRED**                                                     |
| 11  | Structured data по подтверждённым данным     | готово; Person — **EXTERNAL CONFIG REQUIRED** (имя); проверка валидатором — после выкладки                       |
| 12  | Логичная перелинковка                        | готово                                                                                                           |
| 13  | Нет фиктивных контактов и неработающих CTA   | готово: заглушки удалены, незаданное скрыто. Рабочие каналы — **EXTERNAL CONFIG REQUIRED**                       |
| 14  | Английские тексты отредактированы            | готово (без штампов и обещаний)                                                                                  |
| 15  | Mobile UX проверен                           | готово (375 px, e2e на Pixel 7); реальное устройство — после выкладки                                            |
| 16  | Production build проходит                    | готово                                                                                                           |
| 17  | Проверки выполнены и задокументированы       | готово ([10-validation.md](10-validation.md))                                                                    |
| 18  | Исследование с источниками и ограничениями   | готово ([02](02-global-market-research.md))                                                                      |
| 19  | Разделены цели работодателей и заказчиков    | готово                                                                                                           |
| 20  | Дизайн не разрушен                           | готово; единственная визуальная правка — подписи `ink-3` стали темнее ради контраста                             |

## EXTERNAL CONFIG REQUIRED — что нужно от владельца

Все значения задаются переменными окружения (см. `.env.example`), код менять не нужно.

| Переменная                                                                       | Что это                                | Без неё                                                       |
| -------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                                                           | домен `.com` (https, без слэша)        | canonical, OG и sitemap указывают на localhost                |
| `NEXT_PUBLIC_SITE_INDEXABLE=true`                                                | только в production-окружении          | сайт закрыт от индексации (так и задумано для preview)        |
| `NEXT_PUBLIC_OWNER_NAME`                                                         | настоящее имя                          | нет Person в JSON-LD; в privacy — «the owner of this website» |
| `NEXT_PUBLIC_CONTACT_EMAIL`                                                      | публичный email                        | нет email на сайте                                            |
| `NEXT_PUBLIC_LINKEDIN_URL`, `NEXT_PUBLIC_GITHUB_URL`, `NEXT_PUBLIC_TELEGRAM_URL` | профили (https)                        | нет ссылок и `sameAs`                                         |
| `NEXT_PUBLIC_RESUME_URL`                                                         | `/cv.pdf` в `public/` или https-ссылка | кнопки CV нет                                                 |
| `NEXT_PUBLIC_SCHEDULING_URL`                                                     | Calendly / Cal.com                     | нет «Book a call»                                             |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`                                         | бот для формы                          | формы нет, только каналы                                      |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` (+ `..._SCRIPT_URL` для self-hosted)              | аналитика                              | аналитики нет                                                 |

Также от владельца:

- Проверить текст `/privacy` под свою юрисдикцию (это понятное уведомление, а не юридическая консультация).

## Хостинг (ничего не покупалось и не создавалось)

**Option A — Vercel (рекомендация для старта).** Нативная поддержка Next.js 16 (Cache Components, partial prerendering, OG-картинки), глобальный CDN, HTTPS и редирект www/non-www настраиваются в панели, preview-деплои по умолчанию останутся `noindex` (флаг индексации ставится только в production-окружении). Ограничение: rate limit формы — в памяти инстанса, на serverless это лимит на инстанс (общий — Redis/Upstash, когда появится спам).

**Option B — европейский VPS.** `next start` (Node ≥ 20.9) под process manager, reverse proxy (Caddy или Nginx) с HTTPS, CDN (например, Cloudflare) перед статикой. Имеет смысл, если рядом понадобится Python-сервис — live-бэкенд Stage 7 (FastAPI по WebSocket) с лимитами ресурсов, rate limit и без публичных небезопасных эндпоинтов.

Фронтенду VPS не нужен; страна сервера не используется для таргетинга.

## Перед запуском в production

1. Выбрать домен и хостинг; задать env production-окружения (таблица выше).
2. Положить CV в `public/` или указать ссылку.
3. Собрать и выложить; проверить `/robots.txt` (allow + sitemap), canonical и `og:image` на реальном домене.
4. Отправить тестовое сообщение через форму — убедиться, что пришло в Telegram.
5. Search Console: подтвердить домен, отправить `sitemap.xml`.
6. PageSpeed Insights (mobile) для `/`, `/hire`, одного кейса; Rich Results Test для главной и посадочной.
7. Если включена аналитика — убедиться, что события приходят (Contact click, Contact form sent, Resume download, Scheduling click) и что в них нет содержимого формы.
8. Обновить LinkedIn / GitHub / Upwork / Contra ссылками на конкретные кейсы.
