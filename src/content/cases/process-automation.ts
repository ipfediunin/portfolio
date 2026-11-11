import type { Locale } from "@/i18n/config";
import type { ProcessAutomationCaption } from "@/simulation/cases/process-automation/compile";
import type {
  RecordOutcome,
  RecordSource,
  RejectionReason,
} from "@/simulation/cases/process-automation/model";
import { measureProcessAutomationImpact } from "@/simulation/cases/process-automation/impact";

import type { CaseGlanceInput, CaseRecordInput } from "../schema";

export const processAutomationProject = {
  slug: "process-automation",
  published: true,
  basis: "practice",
  order: 3,
  title: "Business Process Automation",
  subtitle: {
    ru: "Платформа автоматизации бизнес-процессов и интеграций",
    en: "A platform for business process automation and integrations",
  },
  direction: "Backend / Automation / Systems Integration",
  summary: {
    ru: "Программные решения, которые убирают ручные действия: принимают данные из нескольких источников, проверяют и обрабатывают их, запускают задачи и передают результаты другим сервисам.",
    en: "Software that removes manual work: it takes data from several sources, checks and processes it, runs tasks and hands the results to other services.",
  },
  scene: { world: "process-automation", view: "system" },
  stack: ["Python", "Django", "RabbitMQ", "REST API"],
  technologies: [
    "django",
    "rest-api",
    "message-brokers",
    "background-jobs",
    "integrations",
    "python-automation",
    "monitoring",
  ],
} satisfies CaseRecordInput;

export interface ProcessAutomationDemoContent {
  readonly idle: string;
  readonly captions: Readonly<Record<ProcessAutomationCaption, string>>;
  readonly labels: {
    readonly controls: string;
    readonly withErrors: string;
    readonly notificationsDown: string;
    readonly run: string;
    readonly records: string;
    readonly id: string;
    readonly source: string;
    readonly status: string;
    readonly summary: string;
    readonly monitoring: string;
    readonly monitoringEmpty: string;
  };
  readonly sources: Readonly<Record<RecordSource, string>>;
  readonly statuses: Readonly<
    Record<RecordOutcome["status"] | "pending", string>
  >;
  readonly reasons: Readonly<Record<RejectionReason, string>>;
  readonly events: Readonly<
    Record<"rejected" | "stored" | "notified" | "notifyFailed", string>
  >;
}

export const processAutomationDemo: Readonly<
  Record<Locale, ProcessAutomationDemoContent>
> = {
  ru: {
    idle: "Запустите обработку пакета. Можно добавить ошибки во входные данные или отключить сервис уведомлений.",
    captions: {
      receive:
        "В систему приходит пакет из {count} записей: часть по API, часть вебхуками.",
      validate:
        "Django проверяет каждую запись: принято {valid}, отклонено {rejected}. Источник сразу получает 202 — дальше обработка идёт без него.",
      rejected:
        "Отклонённые записи ({rejected}) уходят в мониторинг вместе с причиной — они видны, а не теряются.",
      queue: "{queued} задач встают в очередь RabbitMQ.",
      process:
        "Воркер забирает задачи: обрабатывает запись, сохраняет результат в базу и отправляет уведомление.",
      notifyFailed:
        "Сервис уведомлений недоступен: {failed} задач завершились ошибкой. Данные уже сохранены, ошибка записана в лог и видна в мониторинге.",
      done: "Пакет обработан: сохранено {stored}, уведомлено {notified}, ошибок {failed}, отклонено {rejected}.",
    },
    labels: {
      controls: "Пакет данных",
      withErrors: "Ошибки во входных данных",
      notificationsDown: "Сервис уведомлений недоступен",
      run: "Запустить обработку",
      records: "Записи пакета",
      id: "ID",
      source: "Источник",
      status: "Статус",
      summary:
        "Принято {received} · отклонено {rejected} · сохранено {stored} · ошибок {failed}",
      monitoring: "Мониторинг",
      monitoringEmpty: "Записи появятся после обработки.",
    },
    sources: { api: "API", webhook: "Вебхук" },
    statuses: {
      pending: "ждёт обработки",
      rejected: "отклонена",
      done: "сохранена, уведомление отправлено",
      notifyFailed: "сохранена, уведомление не доставлено",
    },
    reasons: {
      missingAmount: "нет суммы",
      negativeAmount: "отрицательная сумма",
      invalidEmail: "некорректный email",
    },
    events: {
      rejected: "отклонена: {detail}",
      stored: "сохранена",
      notified: "уведомление отправлено",
      notifyFailed: "уведомление не доставлено: {detail}",
    },
  },
  en: {
    idle: "Run the batch. You can add errors to the input data or take the notification service down.",
    captions: {
      receive:
        "A batch of {count} records arrives: some over the API, some as webhooks.",
      validate:
        "Django checks every record: {valid} accepted, {rejected} rejected. The source gets 202 at once — processing goes on without it.",
      rejected:
        "Rejected records ({rejected}) go to monitoring with their reason — they are visible, not lost.",
      queue: "{queued} tasks are queued in RabbitMQ.",
      process:
        "The worker takes the tasks: processes the record, stores the result and sends a notification.",
      notifyFailed:
        "The notification service is down: {failed} tasks ended with an error. The data is already stored; the error is logged and shows in monitoring.",
      done: "Batch done: {stored} stored, {notified} notified, {failed} errors, {rejected} rejected.",
    },
    labels: {
      controls: "Data batch",
      withErrors: "Errors in the input data",
      notificationsDown: "Notification service is down",
      run: "Process the batch",
      records: "Records in the batch",
      id: "ID",
      source: "Source",
      status: "Status",
      summary:
        "{received} received · {rejected} rejected · {stored} stored · {failed} errors",
      monitoring: "Monitoring",
      monitoringEmpty: "Entries appear after processing.",
    },
    sources: { api: "API", webhook: "Webhook" },
    statuses: {
      pending: "waiting",
      rejected: "rejected",
      done: "stored, notification sent",
      notifyFailed: "stored, notification not delivered",
    },
    reasons: {
      missingAmount: "no amount",
      negativeAmount: "negative amount",
      invalidEmail: "invalid email",
    },
    events: {
      rejected: "rejected: {detail}",
      stored: "stored",
      notified: "notification sent",
      notifyFailed: "notification not delivered: {detail}",
    },
  },
};

const measures = measureProcessAutomationImpact();

/** The case at a glance: before and after, what the approach changes in the model, what I did. */
export const processAutomationGlance = {
  before: [
    "The same manual steps for every record",
    "Mistakes surface late",
    "Only the person running the process sees its state",
  ],
  after: [
    "Records are checked at the entrance and processed automatically",
    "A failed task never stops the others",
    "Rejections and errors show up in monitoring, with reasons",
  ],
  did: [
    "Automation services in Python and Django",
    "External API and event integrations",
    "Task queue on RabbitMQ",
    "Validation, error handling, logging",
    "Monitoring and management interfaces",
  ],
  charts: [
    {
      measure: measures.brokenRecords,
      title: "Broken records stored",
      figure: "after",
      caption: "of broken records reach the database",
      bars: {
        unchecked: "Without checks at the entrance",
        checked: "Checked before the queue",
      },
      method:
        "The demo batch of six records, two of them broken: a missing amount and a malformed e-mail.",
    },
  ],
} satisfies CaseGlanceInput;
