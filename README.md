# Runtime City

Интерактивное портфолио fullstack/backend-разработчика: архитектура backend-систем показана как живой изометрический город, где здания — сервисы, а машины — запросы, задачи и события.

Концепция и план по этапам — [docs/CONCEPT.md](docs/CONCEPT.md).

## Стек

Next.js 16 (App Router, Cache Components), React 19, TypeScript strict, Tailwind CSS 4, PixiJS 8, Zod, Vitest, Playwright.

## Запуск

```bash
npm install
cp .env.example .env.local
npm run dev
```

Сайт откроется на http://localhost:3000 (один английский сайт, маршруты в корне). Контакты, имя, CV, запись на созвон и аналитика задаются в `.env.local` — незаданное на сайте не показывается.

## Проверки

```bash
npm run check      # типы, ESLint, Prettier, юнит-тесты
npm run build      # production-сборка
npm run test:e2e   # e2e-смоук в Chromium (первый раз: npx playwright install chromium)
```

## Структура

```
src/
  app/          страницы, root layout, sitemap, robots, OG-картинки
  i18n/         английский UI-словарь
  content/      данные сайта, кейсы, услуги и конфигурация владельца (Zod)
  components/   UI-кит
  features/     секции страниц, шапка/подвал, мост React ↔ сцена
  simulation/   граф системы, сценарии и симуляция (чистый TypeScript)
  engine/       PixiJS-движок сцены (только клиент)
```
