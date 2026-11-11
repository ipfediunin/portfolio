# 07 · Technical SEO

## Проверенные факты (HTML production-сборки, 2026-11-04)

| Что            | Как устроено                                                                                                                                                                                                                                  | Проверка                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Язык           | `<html lang="en">`, нет hreflang и языковых префиксов                                                                                                                                                                                         | e2e «one English site»                                      |
| Title          | шаблон `%s · Runtime City`; главная, `/hire`, `/for-employers` и посадочные — абсолютные, ≤ 60 символов                                                                                                                                       | юнит-тест уникальности и длины (схема Zod)                  |
| Description    | уникальное на каждую страницу; посадочные ≤ 160                                                                                                                                                                                               | схема Zod                                                   |
| Canonical      | абсолютный, от `metadataBase` (`NEXT_PUBLIC_SITE_URL`); главная — origin без слэша                                                                                                                                                            | e2e на 4 типах страниц                                      |
| Open Graph / X | `og:title/description/url/locale=en_US/site_name`, `summary_large_image`; картинка — карточка сайта или своя у кейса                                                                                                                          | e2e: `og:image` есть на `/`, `/hire`, посадочной и кейсе    |
| OG-картинки    | `app/opengraph-image.tsx` и `app/projects/[slug]/opengraph-image.tsx` (статически, 9 шт.) из общего `lib/og-card.tsx`                                                                                                                         | build: ● SSG                                                |
| Sitemap        | `app/sitemap.ts`: только реальные публичные маршруты, без черновиков и локалей, 25 URL                                                                                                                                                        | юнит-тест сверяет каждый URL с файлом страницы              |
| Robots         | production (`NEXT_PUBLIC_SITE_INDEXABLE=true`): allow + sitemap; любая другая сборка: `Disallow: /` и `<meta name="robots" content="noindex, nofollow">`                                                                                      | юнит + e2e                                                  |
| Дубли URL      | trailing slash → 308 на форму без слэша; `/services` → 308 `/hire`; query-параметры (`?topic`, `?scenario`) не меняют canonical                                                                                                               | e2e                                                         |
| JSON-LD        | WebSite (главная); Person (главная, `/for-employers`) — **только если задано имя владельца**; BreadcrumbList (кейсы, `/hire`, `/for-employers`, посадочные); Service (посадочные, provider — Person при заданном имени); CreativeWork (кейсы) | e2e: каждый блок парсится как JSON со `@context` schema.org |
| SSR            | тексты услуг, профиля, кейсов, политики — в серверном HTML без JS                                                                                                                                                                             | `curl` по 6 страницам                                       |

Не используются: Organization, ProfessionalService, Review, AggregateRating, FAQPage (rich results для FAQ Google показывает ограниченно, а данных организации нет).

## Предположения

- www/non-www и http→https решаются на уровне хостинга (Vercel или reverse proxy) — в коде нечего настраивать.

## Реализованные изменения

- `lib/metadata.ts` (canonical, OG и X с картинкой, `absoluteTitle`), `lib/structured-data.ts`, `lib/og-card.tsx`, `app/robots.ts`, `app/sitemap.ts`, `app/layout.tsx` (robots по `indexable`), редирект в `next.config.ts`.
- Исправлен баг: вложенные страницы теряли `og:image` и `twitter:image`.

## Нерешённые вопросы

- **EXTERNAL CONFIG REQUIRED**: реальный домен (`NEXT_PUBLIC_SITE_URL`) — сейчас canonical и sitemap указывают на `http://localhost:3000`.
- **EXTERNAL CONFIG REQUIRED**: проверка JSON-LD в Rich Results Test / Schema Markup Validator требует публичного URL. Локально проверена только синтаксическая валидность.
- **EXTERNAL CONFIG REQUIRED**: имя владельца (`NEXT_PUBLIC_OWNER_NAME`) — без него Person не выводится.

## Следующие действия

- После выкладки: Search Console (домен-ресурс), отправить sitemap, проверить индексацию; прогнать URL через Rich Results Test.
