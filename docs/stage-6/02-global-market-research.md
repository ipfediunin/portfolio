# 02 · Исследование международного рынка

Дата исследования: 2026-11-04. Инструменты: веб-поиск (индекс ориентирован на США, режим standard) и чтение страниц конкурентов. Доступа к Google Keyword Planner, Semrush, Ahrefs нет, поэтому **объёмы, Keyword Difficulty, CPC и уровень конкуренции — Not verified**. Субъективные оценки помечены как _Qualitative estimate_.

## Запросы, которые реально выполнялись

| Категория      | Запрос                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| A — найм       | `remote Python backend developer jobs AI engineer RAG`                                                  |
| A — найм       | `2025 2026 remote software developer hiring demand by country Singapore UAE Germany Netherlands report` |
| B — услуги     | `hire freelance FastAPI developer`                                                                      |
| B — услуги     | `RAG application development services freelance developer`                                              |
| B — услуги     | `LLM integration developer for hire independent consultant`                                             |
| B — услуги     | `Python automation services business process automation developer`                                      |
| B — услуги     | `independent python django fastapi developer consultant website services case studies`                  |
| B — услуги     | `freelance Python developer portfolio site case studies`                                                |
| Информационные | `RabbitMQ vs Kafka difference queue vs log consumer groups explained`                                   |
| Информационные | `pgvector vs Milvus when to use`                                                                        |

## Проверенные факты

### Category A — Hiring / Recruitment

- Выдача по удалённым вакансиям Python backend / AI / RAG состоит из job boards и агрегаторов, а не из личных сайтов: Arc ([AI Backend Engineer, worldwide](https://arc.dev/remote-jobs/details/ai-backend-engineer-part-time-worldwide-mpjpdd7gr3), [Senior Python Back-End Engineer with Gen AI](https://arc.dev/remote-jobs/j/n-ix-senior-python-back-end-engineer-with-gen-ai-experience-ncddujul75)), We Work Remotely ([Toptal — Python backend с RAG и agentic AI](https://weworkremotely.com/remote-jobs/toptal-python-backend-development-talent-with-rag-and-agentic-ai-experience), с ограничением по региону), justjoin.it ([AI Engineer — Gen AI / LLM / RAG, Warsaw, Python](https://justjoin.it/job-offer/emagine-polska-ai-engineer---gen-ai-llm-rag-warsaw-python)), Pyyne через [Norrsken Jobs](https://jobs.norrsken.org/companies/pyyne-digital-2/jobs/76079588-senior-backend-engineer-ai-rag) (Senior / Lead Backend Engineer AI/RAG, удалённо из Бразилии), Virtual Vocations (US remote: [AI Backend Engineer](https://www.virtualvocations.com/job/ai-backend-engineer-3168454-i.html) и др.).
- Сочетание «Python backend + RAG/LLM» встречается в вакансиях как отдельный профиль (Senior Backend Engineer AI/RAG, AI Backend Engineer) — это совпадает с профилем владельца.
- По странам: вторичный источник ([commandlinux.com](https://commandlinux.com/statistics/remote-developer-job-market-by-country/), ссылается на Indeed) сообщает, что на 31.08.2026 у Великобритании самая высокая доля вакансий в разработке с упоминанием remote/hybrid среди семи стран, которые отслеживает Indeed, — 45,83 %, и что доля удалённых вакансий снизилась в шести из семи стран с августа 2024 по август 2026. **Первоисточник Indeed Hiring Lab не проверен.**
- Lemon.io по собственным контрактам: Бразилия — 20 % контрактов. Это данные о предложении разработчиков на одной платформе, а не о спросе работодателей по странам.
- Отдельных данных по Германии, Нидерландам, Сингапуру и ОАЭ поиск не дал.

### Category B — Development Services

- Коммерческая выдача («hire freelance FastAPI developer», «RAG application development services», «LLM integration developer for hire», «Python automation services») занята маркетплейсами и платформами найма: Toptal ([FastAPI](https://www.toptal.com/fastapi), [RAG](https://www.toptal.com/developers/retrieval-augmented-generation)), Arc ([FastAPI](https://arc.dev/en-gb/hire-developers/fastapi), [RAG](https://arc.dev/hire-developers/rag), [AI/LLM integrations](https://arc.dev/hire-developers/ai-llm-integrations)), Upwork (каталог услуг Python/Django/FastAPI), Fiverr (гиги RAG, Django, автоматизация), Contra, Codementor ([FastAPI](https://www.codementor.io/freelance/fastapi)), Freelancer, а также агентства (vocso.com, webcluesinfotech.com, upsilonit.com).
- Личных сайтов разработчиков в первой выдаче по этим запросам почти нет; найденные — см. [04-competitor-analysis.md](04-competitor-analysis.md).
- Информационные запросы, совпадающие с темами демо, ведут на документацию вендоров и их блоги: [RabbitMQ — сравнение с Kafka](https://www.rabbitmq.com/docs/4.3/compare/kafka), [Zilliz — pgvector vs Milvus](https://zilliz.com/blog/beyond-pgvector-when-your-vectordb-need-a-formula-one-upgrade), Instaclustr.

## Предположения и выводы (Qualitative estimate)

- **Работодатели почти не ищут личные портфолио через Google.** Путь работодателя: вакансия → отклик / LinkedIn / GitHub → ссылка на сайт. Поэтому `/for-employers` — страница-доказательство для отклика, а не SEO-посадочная.
- **Коммерческие запросы услуг выиграть органически трудно**: маркетплейсы с высоким доверием домена занимают выдачу. Реалистичная роль сайта — место, куда ведут профиль Upwork/Contra/LinkedIn и прямые обращения: там проверяют глубину кейсов и демо.
- **Органический шанс выше в длинном хвосте**: информационные запросы, на которые у сайта есть уникальный ответ с живой моделью (RabbitMQ vs Kafka, pgvector vs Milvus, TCP vs UDP на Python sockets, PCHIP vs сплайн и феномен Рунге). Это кандидаты в статьи после запуска.
- **Наиболее перспективные рынки по доступным данным** (низкая уверенность, источники вторичные):
  1. Удалённые роли «worldwide / EU-remote» через Arc и We Work Remotely — вакансии прямо совпадают с профилем Python backend + RAG.
  2. Польша и CEE через justjoin.it — есть вакансии AI Engineer (LLM/RAG, Python); формат найма нужно проверять в каждой вакансии.
  3. Великобритания — самая высокая доля remote/hybrid среди отслеживаемых Indeed стран (вторичный источник).
  4. США — объём вакансий большой, но конкуренция высокая и часто требуется резидентство; через агрегаторы.
- Страна сервера не используется как стратегия таргетинга: один английский сайт, один домен, CDN.

## Ограничения

- Индекс поиска ориентирован на США; выдача в UK, DE, NL может отличаться.
- Нет измерительных инструментов: никакие объёмы и сложности не заявляются.
- Использованы сниппеты и вторичные источники; цифры Indeed не сверены с Hiring Lab.

## Реализованные изменения по итогам

- Позиционирование и тексты главной, `/hire`, `/for-employers` и четырёх посадочных услуг (см. [03-keyword-strategy.md](03-keyword-strategy.md), [08-content-strategy.md](08-content-strategy.md)).

## Нерешённые вопросы

- Объёмы запросов по UK/EU — нужен Keyword Planner или Semrush (появится доступ — перепроверить карту ключей).

## Следующие действия

- После запуска: Search Console (запросы, по которым сайт реально показывается) вместо гипотез.
- Первые статьи — по информационным темам демо (см. 03).
