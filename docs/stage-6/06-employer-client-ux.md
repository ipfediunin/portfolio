# 06 · Две аудитории: работодатели и заказчики

## Проверенные факты: пути, проверенные e2e

- **Работодатель**: главная → «Hiring for a role? See my engineering profile» или меню Work with me → For employers → `/for-employers` → кейсы → «Get in touch about a role» → `/contact?topic=role` (тема «A role» выбрана заранее).
- **Заказчик**: главная → «Work with me» → `/hire` → услуга → посадочная → кейсы → «Discuss your project» → `/contact?topic=project`.
- **Из кейса** обе аудитории: «Discuss your project» и «Hiring? See my engineering profile».

## /for-employers

Разделы: Roles I'm a fit for · Core expertise · Selected technical projects (4 кейса) · Technical stack (тот же источник, что About) · Engineering approach · Professional links (только заданные) · Recruitment contact. Кнопки CV нет, пока не задан `NEXT_PUBLIC_RESUME_URL`. Роли — из подтверждённого профиля (Full-Stack Developer · Python Backend Engineer · AI Systems Developer); без лет опыта, компаний, уровней и сертификатов.

## /hire и посадочные

- Шесть услуг; у каждой: проблема заказчика, что он получает, технологии, связанные кейсы, ссылка на посадочную (если есть).
- How I work: Discovery → Solution design → Development → Validation → Delivery. Без сроков, цен и гарантий (юнит-тест ищет «guarantee», «price», «week», «$», «€»).
- How to start: что написать в первом сообщении.

## Контакт

- Тема обращения: A project / A role / Something else; предвыбор из `?topic=` (проверяется Zod, мусор → «A project»). Тема уходит в Telegram-сообщение, в аналитику — только название темы.
- Каналы показываются, только если заданы: форма (Telegram настроен при сборке), «Book a call», email, профили. Если не задано ничего — честное сообщение «Contact details are still being set up».
- Форма никогда не изображает успешную отправку: без канала доставки — ошибка `deliveryFailed`. «Отправлено» без доставки получают только боты (honeypot, слишком быстрое заполнение).

## Предположения

- Работодателю важнее всего быстро проверить соответствие роли и глубину кейсов, поэтому кейсы на странице профиля — полные карточки с превью модели.

## Реализованные изменения

- `src/app/for-employers`, `src/app/hire`, `src/app/services/[slug]`, `src/content/{employers,hire,services}.ts`, `features/services/*`, тема в `features/contact/*`, `ContactCta` с темой и записью на созвон.

## Нерешённые вопросы

- **EXTERNAL CONFIG REQUIRED**: email, LinkedIn/GitHub/Telegram, CV, ссылка на запись, токен Telegram-бота — без них на production не будет ни формы, ни каналов.

## Следующие действия

- Заполнить env; проверить на production, что форма доставляет сообщение (одно тестовое сообщение владельцем).
