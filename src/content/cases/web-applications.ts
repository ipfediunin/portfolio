import type { Locale } from "@/i18n/config";
import type { WebApplicationsCaption } from "@/simulation/cases/web-applications/compile";
import type {
  BookingError,
  BookingField,
} from "@/simulation/cases/web-applications/model";
import { measureWebApplicationsImpact } from "@/simulation/cases/web-applications/impact";

import type { CaseGlanceInput, CaseRecordInput } from "../schema";

export const webApplicationsProject = {
  slug: "web-applications",
  published: true,
  basis: "practice",
  order: 6,
  title: "Full-Stack Web Applications",
  subtitle: {
    ru: "Разработка полноценных веб-приложений и сайтов под заказ",
    en: "Complete web applications and websites built to order",
  },
  direction: "Full-Stack Development / Commercial Web",
  summary: {
    ru: "Клиентские веб-решения целиком: интерфейс, серверная логика, интеграции и база данных — законченный продукт, а не отдельный API.",
    en: "Client web solutions end to end: the interface, server-side logic, integrations and the database — a finished product rather than a standalone API.",
  },
  note: {
    ru: "Направление объединяет несколько проектов под заказ, и связка технологий в каждом своя. Демо показывает общий путь пользовательского действия.",
    en: "This direction covers several projects built to order, each with its own combination of technologies. The demo shows the common path of a user action.",
  },
  scene: { world: "web-applications", view: "system" },
  stack: [
    "React",
    "Next.js",
    "Python",
    "Django",
    "FastAPI",
    "Flask",
    "PostgreSQL",
  ],
  technologies: [
    "react",
    "nextjs",
    "forms",
    "django",
    "fastapi",
    "flask",
    "postgresql",
    "rest-api",
  ],
} satisfies CaseRecordInput;

export interface WebApplicationsDemoContent {
  readonly idle: string;
  readonly captions: Readonly<Record<WebApplicationsCaption, string>>;
  readonly fields: Readonly<Record<BookingField, string>>;
  readonly errors: Readonly<Record<BookingError, string>>;
  readonly labels: {
    readonly form: string;
    readonly namePlaceholder: string;
    readonly emailPlaceholder: string;
    readonly clientChecks: string;
    readonly submit: string;
    readonly response: string;
    readonly responseEmpty: string;
    readonly notSent: string;
    readonly conflict: string;
    readonly created: string;
    readonly server: string;
    readonly serverEmpty: string;
    readonly hint: string;
  };
}

export const webApplicationsDemo: Readonly<
  Record<Locale, WebApplicationsDemoContent>
> = {
  ru: {
    idle: "Заполните форму записи и отправьте. Попробуйте ошибку в email, выключенную проверку в браузере и время 11:00 или 15:00.",
    captions: {
      clientCheck:
        "Браузер проверяет форму теми же правилами, что и сервер: ошибок — {fields}.",
      clientSaved:
        "Запрос не отправлялся: ошибка поймана сразу, без обращения к серверу.",
      request:
        "Форма корректна — запрос уходит на сервер Next.js и дальше в backend API.",
      serverValidate:
        "Backend проверяет данные снова: клиенту доверять нельзя — запрос можно отправить и в обход формы.",
      serverInvalid:
        "Сервер вернул 422 с ошибками по полям — интерфейс показывает их у нужных полей.",
      logic: "Бизнес-логика проверяет правило: свободно ли выбранное время.",
      conflict:
        "Время уже занял другой пользователь — интерфейс об этом не знал. Сервер — источник правды и возвращает 409.",
      transaction: "Запись сохраняется в PostgreSQL в транзакции.",
      created:
        "Ответ 201 вернулся в интерфейс за {ms} мс, запись появилась в списке.",
    },
    fields: { name: "Имя", email: "Email", slot: "Время" },
    errors: {
      nameRequired: "Укажите имя",
      emailInvalid: "Нужен корректный email",
      slotRequired: "Выберите время",
    },
    labels: {
      form: "Запись на консультацию",
      namePlaceholder: "Как к вам обращаться",
      emailPlaceholder: "name@example.com",
      clientChecks: "Проверять форму в браузере",
      submit: "Записаться",
      response: "Ответ сервера",
      responseEmpty: "Ответ появится после отправки формы.",
      notSent: "Запрос не отправлен — ошибки исправляются прямо в форме.",
      conflict: "Это время уже занято. Выберите другое.",
      created: "Готово: вы записаны на {slot}.",
      server: "Записи на сервере",
      serverEmpty: "Пока нет записей из этой сессии.",
      hint: "В реальном интерфейсе свободное время подгружается с сервера, но к моменту отправки может устареть — демо разыгрывает именно этот случай.",
    },
  },
  en: {
    idle: "Fill in the booking form and submit it. Try a broken email, turning the browser check off and the 11:00 or 15:00 slot.",
    captions: {
      clientCheck:
        "The browser checks the form with the same rules as the server: {fields} errors.",
      clientSaved:
        "No request was sent: the error was caught at once, without asking the server.",
      request:
        "The form is valid — the request goes to the Next.js server and on to the backend API.",
      serverValidate:
        "The backend checks the data again: the client cannot be trusted — a request can bypass the form.",
      serverInvalid:
        "The server answered 422 with per-field errors, and the interface shows them next to the fields.",
      logic:
        "The business logic checks the rule: is the chosen time still free?",
      conflict:
        "Someone else took this time, and the interface did not know. The server is the source of truth and answers 409.",
      transaction: "The booking is stored in PostgreSQL in a transaction.",
      created:
        "The 201 answer reached the interface in {ms} ms, and the booking is in the list.",
    },
    fields: { name: "Name", email: "Email", slot: "Time" },
    errors: {
      nameRequired: "Enter your name",
      emailInvalid: "Enter a valid email",
      slotRequired: "Choose a time",
    },
    labels: {
      form: "Book a consultation",
      namePlaceholder: "Your name",
      emailPlaceholder: "name@example.com",
      clientChecks: "Check the form in the browser",
      submit: "Book",
      response: "Server response",
      responseEmpty: "The response appears after the form is sent.",
      notSent: "No request sent — the errors are fixed right in the form.",
      conflict: "This time is already taken. Please choose another.",
      created: "Done: you are booked for {slot}.",
      server: "Bookings on the server",
      serverEmpty: "No bookings from this session yet.",
      hint: "In a real interface free times are loaded from the server, but by the moment of sending they can be out of date — the demo plays that case.",
    },
  },
};

const measures = measureWebApplicationsImpact();

/** The case at a glance: before and after, what the approach changes in the model, what I did. */
export const webApplicationsGlance = {
  before: [
    "A bare API or a set of pages is not a working product",
    "Wrong input is found only after a server round trip",
    "Interface state goes stale and leads to conflicts",
  ],
  after: [
    "Interface, server logic and data work as one product",
    "Input is checked in the browser and again on the server",
    "Conflicts such as a taken slot get a clear answer",
  ],
  did: [
    "Application structure",
    "Frontend with React and Next.js",
    "APIs in Django, FastAPI or Flask",
    "Forms and data validation",
    "Database integration",
  ],
  charts: [
    {
      measure: measures.wastedRequests,
      title: "Wasted server round trips",
      figure: "after",
      caption: "of form attempts send invalid data to the server",
      bars: {
        "server-only": "Checked on the server only",
        "both-sides": "Same rules in the browser and on the server",
      },
      method:
        "Six synthetic booking attempts: an empty name, a bad e-mail, no slot, a taken slot and two good ones.",
    },
  ],
} satisfies CaseGlanceInput;
