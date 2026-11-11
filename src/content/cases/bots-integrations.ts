import type { Locale } from "@/i18n/config";
import type { BotsCaption } from "@/simulation/cases/bots-integrations/compile";
import type { ReplyKey } from "@/simulation/cases/bots-integrations/model";
import { measureBotsIntegrationsImpact } from "@/simulation/cases/bots-integrations/impact";

import type { CaseGlanceInput, CaseRecordInput } from "../schema";

export const botsIntegrationsProject = {
  slug: "bots-integrations",
  published: true,
  basis: "practice",
  order: 8,
  title: "Bots & API Integrations",
  subtitle: {
    ru: "Интеллектуальные боты и автоматизированные сервисы",
    en: "Smart bots and automated services",
  },
  direction: "Automation / Backend / Integrations",
  summary: {
    ru: "Боты и автоматизированные программы, которые общаются с пользователями, внешними API и внутренними системами. Бот здесь — не окно сообщений, а программная система с бизнес-логикой, состоянием и интеграциями.",
    en: "Bots and automated programs that talk to users, external APIs and internal systems. A bot here is not a message window but a software system with business logic, state and integrations.",
  },
  scene: { world: "bots-integrations", view: "system" },
  stack: ["Python", "Flask", "REST API", "PostgreSQL", "Redis", "LLM API"],
  technologies: [
    "flask",
    "bots",
    "integrations",
    "rest-api",
    "postgresql",
    "redis",
    "rag-llm",
  ],
} satisfies CaseRecordInput;

export interface BotsIntegrationsDemoContent {
  readonly idle: string;
  readonly captions: Readonly<Record<BotsCaption, string>>;
  readonly replies: Readonly<Record<ReplyKey, string>>;
  readonly quick: readonly string[];
  readonly labels: {
    readonly chat: string;
    readonly placeholder: string;
    readonly send: string;
    readonly quick: string;
    readonly externalDown: string;
    readonly state: string;
    readonly reports: string;
    readonly reportsEmpty: string;
    readonly you: string;
    readonly bot: string;
    readonly typing: string;
  };
}

export const botsIntegrationsDemo: Readonly<
  Record<Locale, BotsIntegrationsDemoContent>
> = {
  ru: {
    idle: "Напишите боту: /start, /status 42, /report — или просто вопрос. Каждое сообщение пройдёт webhook, Redis и нужную интеграцию.",
    captions: {
      receive:
        "Платформа мессенджера доставляет сообщение на webhook бота. Маршрут: {route}.",
      loadState:
        "Обработчик не помнит прошлых сообщений: состояние диалога ({state}) читается из Redis.",
      external: "Бот запрашивает данные во внешнем API.",
      externalDown:
        "Внешний API не отвечает — бот сообщает об этом пользователю, а не молчит.",
      llm: "Свободный текст уходит в LLM API.",
      save: "Отчёт сохраняется в PostgreSQL.",
      storeState:
        "Новое состояние диалога ({state}) записано в Redis — следующее сообщение продолжит сценарий.",
      reply: "Ответ ушёл пользователю за {ms} мс.",
    },
    replies: {
      start:
        "Привет! Команды: /status <номер> — статус заказа, /report — отправить отчёт, /cancel — отменить. Можно просто задать вопрос.",
      statusAccepted: "Заказ №{id}: принят.",
      statusInProgress: "Заказ №{id}: в работе.",
      statusDone: "Заказ №{id}: выполнен.",
      statusUsage: "Укажите номер заказа: /status 42",
      statusUnavailable:
        "Не удалось получить статус заказа №{id}: сервис временно недоступен. Попробуйте позже.",
      reportAskDate:
        "За какую дату отчёт? Например, 2026-11-04 или 04.11.2026.",
      reportBadDate:
        "Не понял дату. Формат: 2026-11-04 или 04.11.2026. /cancel — отменить.",
      reportConfirm: "Отправить отчёт за {date}? Ответьте «да» или «нет».",
      reportConfirmAgain: "Ответьте «да» или «нет»: отправить отчёт за {date}?",
      reportSaved: "Отчёт за {date} сохранён.",
      reportCancelled: "Отправка отчёта отменена.",
      cancelled: "Отменено.",
      llm: "Демо: здесь бот вернул бы ответ языковой модели на «{question}». В демо модель не вызывается.",
      unknown: "Не знаю команду {command}. /start — список команд.",
    },
    quick: [
      "/start",
      "/status 42",
      "/report",
      "2026-11-04",
      "да",
      "Как сбросить пароль?",
    ],
    labels: {
      chat: "Чат с ботом",
      placeholder: "Сообщение или команда",
      send: "Отправить",
      quick: "Быстрые сообщения",
      externalDown: "Внешний API недоступен",
      state: "Состояние диалога в Redis",
      reports: "Отчёты в PostgreSQL",
      reportsEmpty: "Пока нет — отправьте /report.",
      you: "Вы",
      bot: "Бот",
      typing: "…",
    },
  },
  en: {
    idle: "Write to the bot: /start, /status 42, /report — or just a question. Every message goes through the webhook, Redis and the integration it needs.",
    captions: {
      receive:
        "The messenger platform delivers the message to the bot's webhook. Route: {route}.",
      loadState:
        "The handler does not remember earlier messages: the dialog state ({state}) is read from Redis.",
      external: "The bot asks the external API for data.",
      externalDown:
        "The external API does not answer — the bot tells the user so instead of staying silent.",
      llm: "Free text goes to the LLM API.",
      save: "The report is saved to PostgreSQL.",
      storeState:
        "The new dialog state ({state}) is written to Redis — the next message continues the scenario.",
      reply: "The answer reached the user in {ms} ms.",
    },
    replies: {
      start:
        "Hi! Commands: /status <number> — order status, /report — send a report, /cancel — cancel. You can also just ask a question.",
      statusAccepted: "Order #{id}: accepted.",
      statusInProgress: "Order #{id}: in progress.",
      statusDone: "Order #{id}: done.",
      statusUsage: "Give the order number: /status 42",
      statusUnavailable:
        "Could not get the status of order #{id}: the service is temporarily unavailable. Please try later.",
      reportAskDate:
        "Which date is the report for? For example, 2026-11-04 or 04.11.2026.",
      reportBadDate:
        "I did not get the date. Format: 2026-11-04 or 04.11.2026. /cancel to stop.",
      reportConfirm: "Send the report for {date}? Answer “yes” or “no”.",
      reportConfirmAgain: "Answer “yes” or “no”: send the report for {date}?",
      reportSaved: "The report for {date} is saved.",
      reportCancelled: "The report was not sent.",
      cancelled: "Cancelled.",
      llm: "Demo: here the bot would return the language model's answer to “{question}”. The demo does not call a model.",
      unknown: "I don't know the command {command}. /start lists the commands.",
    },
    quick: [
      "/start",
      "/status 42",
      "/report",
      "2026-11-04",
      "yes",
      "How do I reset my password?",
    ],
    labels: {
      chat: "Chat with the bot",
      placeholder: "A message or a command",
      send: "Send",
      quick: "Quick messages",
      externalDown: "External API is down",
      state: "Dialog state in Redis",
      reports: "Reports in PostgreSQL",
      reportsEmpty: "None yet — send /report.",
      you: "You",
      bot: "Bot",
      typing: "…",
    },
  },
};

const measures = measureBotsIntegrationsImpact();

/** The case at a glance: before and after, what the approach changes in the model, what I did. */
export const botsIntegrationsGlance = {
  before: [
    "Simple tasks need a separate application",
    "Multi-step scenarios need a dialog that remembers",
    "External services can fail in the middle of a request",
  ],
  after: [
    "Status checks, reports and questions right in the messenger",
    "Multi-step scenarios guided step by step",
    "Results stored in the database, not only in the chat",
  ],
  did: [
    "Bot logic and command handling",
    "Backend handlers with Flask",
    "Third-party API integrations",
    "Dialog state in Redis, data in PostgreSQL",
    "AI features through an LLM API",
  ],
  charts: [
    {
      measure: measures.reports,
      title: "Multi-step reports completed",
      figure: "after",
      caption: "of report dialogs end with the report saved, typos included",
      bars: {
        stateless: "A handler that forgets the dialog",
        "state-machine": "State machine, state in Redis",
      },
      method:
        "Four synthetic /report dialogs with an impossible date, a vague answer and a second thought.",
    },
  ],
} satisfies CaseGlanceInput;
