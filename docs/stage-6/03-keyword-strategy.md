# 03 · Ключевые запросы и карта страниц

Дата: 2026-11-04. Объём, сложность, CPC: **Not verified** для всех запросов (нет измерительных инструментов). Оценки шанса — _Qualitative estimate_ на основе состава выдачи (см. [02](02-global-market-research.md)).

## Проверенные факты

- Коммерческие запросы про услуги заняты маркетплейсами (Toptal, Arc, Upwork, Fiverr, Contra, Codementor).
- Информационные запросы по темам демо ведут на документацию и блоги вендоров (RabbitMQ, Zilliz, Instaclustr).

## Карта: страница → намерение → запросы

| Страница                          | Намерение                       | Основная тема                               | Вторичные запросы (гипотезы)                                                                  | Шанс органики                                         | CTA                                               |
| --------------------------------- | ------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| `/`                               | навигационное / профиль         | Full-Stack & AI Engineer                    | python backend ai engineer, full-stack python react engineer                                  | низкий без бренда; страница для переходов из профилей | Explore projects / Work with me                   |
| `/for-employers`                  | навигационное (из отклика)      | engineering profile                         | remote python backend engineer, rag engineer, fastapi backend engineer                        | низкий; работодатели приходят по ссылке               | Get in touch about a role → `/contact?topic=role` |
| `/hire`                           | коммерческое, обзор             | custom python backend, ai & web development | hire python developer, freelance python developer, custom backend development                 | низкий (маркетплейсы)                                 | Discuss your project → `/contact?topic=project`   |
| `/services/python-backend`        | коммерческое                    | python backend development                  | fastapi development services, django development services, rest api development python        | низкий–средний в длинном хвосте                       | Discuss your project                              |
| `/services/ai-rag`                | коммерческое                    | RAG & LLM development                       | rag application development, llm integration developer, pgvector rag, ai integration services | средний в длинном хвосте («pgvector / Milvus»)        | Discuss your project                              |
| `/services/full-stack`            | коммерческое                    | full-stack web development                  | custom web application development, react next.js python developer                            | низкий                                                | Discuss your project                              |
| `/services/automation`            | коммерческое                    | business process automation with python     | python automation services, api integration development, telegram bot python                  | низкий–средний                                        | Discuss your project                              |
| `/projects`                       | навигационное                   | case studies                                | python backend case studies                                                                   | низкий                                                | карточки кейсов                                   |
| `/projects/[slug]`                | информационное / доказательство | тема кейса                                  | rag system architecture, rabbitmq vs kafka, tcp vs udp python sockets, pchip vs cubic spline  | средний для информационного хвоста                    | Discuss your project / профиль для работодателей  |
| `/expertise`, `/expertise/[area]` | информационное                  | стек по районам                             | fastapi vs django vs flask, ssr streaming                                                     | низкий                                                | ссылки на кейсы                                   |
| `/architecture`                   | информационное / демо           | system playground                           | retry backoff, dead letter queue, circuit breaker demo                                        | средний для хвоста «demo / visualized»                | —                                                 |
| `/about`, `/contact`, `/privacy`  | навигационное                   | —                                           | —                                                                                             | —                                                     | —                                                 |

## Почему не создавались другие страницы

- **Data Processing** и **Integrations & Messaging** — без посадочных: по каждой по одному–два кейса, самостоятельный коммерческий спрос не подтверждён; они описаны на `/hire` (якоря `#service-data-processing`, `#service-integrations-messaging`) и ведут на кейсы. Создать посадочную — когда появится контент и подтверждённый спрос.
- Нет гео-страниц («Python developer Germany» и т. п.) — запрет ТЗ и нет уникального содержания.
- `/services` — не отдельная страница, а 308-редирект на `/hire`, чтобы два обзора не конкурировали.

## Правила против каннибализации

- Главная — позиционирование и маршруты, без перечня услуг.
- `/hire` — обзор шести направлений, процесс работы; детали — только на посадочных.
- Посадочная услуги — свой `title` (≤ 60 символов, без суффикса), своё описание (≤ 160), разделы, FAQ и кейсы. Уникальность заголовков и описаний проверяет юнит-тест.
- Кейс — история и модель системы; на услуги ссылается из боковой колонки, а не дублирует их текст.

## Реализованные изменения

- `src/content/services.ts` (6 направлений, 4 посадочные), `src/content/hire.ts`, `src/content/employers.ts`; метаданные этих страниц абсолютные (без « · Runtime City»).

## Нерешённые вопросы

- Реальные объёмы и сложности — после доступа к Keyword Planner / Semrush.

## Следующие действия

- После запуска: проверить в Search Console, по каким запросам показываются кейсы, и решить, какие темы оформить статьями.
- Кандидаты в статьи: «RabbitMQ queue vs Kafka log», «pgvector or Milvus for RAG», «TCP vs UDP with Python sockets», «Choosing an interpolation method: linear, cubic spline, PCHIP».
