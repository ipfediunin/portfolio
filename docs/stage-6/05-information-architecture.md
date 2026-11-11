# 05 · Информационная архитектура

## Проверенные факты: маршруты production-сборки (2026-11-04)

```text
/                              главная: позиционирование, город, маршруты для двух аудиторий
/projects                      9 кейсов + AI Workflow
/projects/[slug]               кейс (9 страниц, свой OG-image у каждого)
/expertise                     три района стека
/expertise/[area]              backend · frontend · automation
/architecture                  system playground (12 сценариев)
/for-employers                 инженерный профиль
/hire                          обзор шести услуг, процесс, как начать
/services/[slug]               python-backend · ai-rag · full-stack · automation
/about                         профиль, стек, ссылки на маршруты
/contact                       форма (если настроена доставка) и каналы из env
/privacy                       уведомление о данных
/services  → 308 → /hire       (нет второго обзора)
/projects/ → 308 → /projects   (одна форма URL, без trailing slash)
```

Sitemap — 25 URL: 9 статических страниц, 3 района, 4 посадочные, 9 кейсов (черновики исключаются).

## Навигация

- Шапка: Projects · Expertise · About · **Work with me ▾** (For employers / For clients с подсказками) · кнопка «Get in touch» → `/contact`.
- Мобильное меню: те же пункты, группа раскрыта списком, CTA внизу.
- Подвал: Navigation (Projects, Expertise, About, System playground) · Work with me (For employers, For clients) · Contact (email и профили — только если заданы, Contact, Privacy).
- «Contact» не дублируется в основном меню — это CTA шапки.

## Внутренние ссылки (обычные индексируемые `<a>`)

| Откуда             | Куда                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Главная            | Projects, `/hire` (Work with me), `/for-employers`, районы стека, playground, `/contact?topic=project`                            |
| `/hire`            | каждая услуга → её кейсы; 4 услуги → посадочные; кейсы, `/contact?topic=project`                                                  |
| `/services/[slug]` | хлебные крошки (Home / For clients), кейсы услуги, другие посадочные, `/hire`                                                     |
| `/projects/[slug]` | связанные услуги (посадочная или якорь на `/hire`), районы стека, сценарии playground, `/contact?topic=project`, `/for-employers` |
| `/for-employers`   | 4 избранных кейса, все кейсы, `/contact?topic=role`, CV и профили — если заданы                                                   |
| `/about`           | Projects, For employers, For clients                                                                                              |
| Инспектор узла     | кейсы с этим компонентом, сценарии playground                                                                                     |

Юнит-тест гарантирует, что каждый опубликованный кейс связан хотя бы с одной услугой.

## Предположения

- Пункт «Work with me» в виде раскрывающегося меню понятнее двух отдельных пунктов: шапка остаётся короткой, а обе аудитории видят свой маршрут в одно касание.

## Реализованные изменения

- Маршруты в корне, `/stack` → `/expertise`, новые страницы и меню (`features/site-shell/navigation.ts`, `nav-links.tsx`).
- `next.config.ts`: редирект `/services` → `/hire`.

## Нерешённые вопросы

- Нет.

## Следующие действия

- Если появятся статьи — раздел `/notes` со ссылками из кейсов на статьи и обратно.
