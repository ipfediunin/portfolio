import type { Locale } from "@/i18n/config";
import type { EventDrivenCaption } from "@/simulation/cases/event-driven/compile";
import { measureEventDrivenImpact } from "@/simulation/cases/event-driven/impact";

import type { CaseGlanceInput, CaseRecordInput } from "../schema";

export const eventDrivenProject = {
  slug: "event-driven",
  published: true,
  basis: "practice",
  order: 5,
  title: "Event-Driven Backend Architecture",
  subtitle: {
    ru: "Асинхронная обработка событий и межсервисное взаимодействие",
    en: "Asynchronous event processing and service-to-service communication",
  },
  direction: "Distributed Systems / Backend Architecture",
  summary: {
    ru: "Серверные архитектуры, в которых компоненты общаются через брокеры сообщений, а работа выполняется не в рамках одного HTTP-запроса, а асинхронно — фоновыми обработчиками и потребителями событий.",
    en: "Server-side architectures where components talk through message brokers and work is done asynchronously, by background handlers and event consumers, rather than inside one HTTP request.",
  },
  note: {
    ru: "Кейс обобщает опыт с несколькими системами: RabbitMQ и Apache Kafka применялись в разных проектах, поэтому и в демо они показаны раздельно.",
    en: "This case sums up work on several systems: RabbitMQ and Apache Kafka were used in different projects, so the demo shows them separately too.",
  },
  scene: { world: "event-driven", view: "rabbitmq" },
  stack: [
    "Python",
    "FastAPI",
    "RabbitMQ",
    "Apache Kafka",
    "Redis",
    "PostgreSQL",
  ],
  technologies: [
    "fastapi",
    "async-python",
    "message-brokers",
    "background-jobs",
    "redis",
    "postgresql",
  ],
} satisfies CaseRecordInput;

export interface EventDrivenDemoContent {
  readonly idle: string;
  readonly captions: Readonly<Record<EventDrivenCaption, string>>;
  readonly labels: {
    readonly mode: string;
    readonly rabbitTitle: string;
    readonly workers: string;
    readonly crash: string;
    readonly sendTasks: string;
    readonly perWorker: string;
    readonly makespan: string;
    readonly sequential: string;
    readonly units: string;
    readonly redelivered: string;
    readonly kafkaTitle: string;
    readonly consumers: string;
    readonly publish: string;
    readonly replay: string;
    readonly partitions: string;
    readonly empty: string;
    readonly assignment: string;
    readonly lag: string;
    readonly analytics: string;
    readonly difference: string;
  };
}

export const eventDrivenDemo: Readonly<Record<Locale, EventDrivenDemoContent>> =
  {
    ru: {
      idle: "Переключайтесь между RabbitMQ и Kafka — камера перелетит в нужный район. Это два разных принципа: очередь задач и журнал событий.",
      captions: {
        rabbitPublish:
          "API публикует {tasks} задач в очередь RabbitMQ и сразу свободен.",
        rabbitDispatch:
          "Воркеры ({workers}) конкурируют за сообщения: каждое получает ровно один, следующее — тот, кто освободился (prefetch = 1).",
        rabbitCrash:
          "{worker} упал, не подтвердив задачу {task}. Без ack сообщение не потеряно: RabbitMQ вернул его в очередь и отдал другому воркеру.",
        rabbitDone:
          "{tasks} задач выполнено за {makespan} ед. времени, один воркер потратил бы {sequential}. После ack сообщения удалены из очереди.",
        kafkaPublish:
          "Producer публикует {events} событий в topic orders. Партиция выбирается по ключу заказа: события одного заказа попадают в одну партицию и сохраняют порядок.",
        kafkaConsume:
          "Группа billing читает новые события. Каждая партиция закреплена ровно за одним consumer: {assignment}.",
        kafkaRebalance:
          "Состав группы billing изменился — партиции перераспределены (rebalance): {assignment}.",
        kafkaAnalytics:
          "Группа analytics читает те же события независимо: у неё свои offset'ы.",
        kafkaReplay:
          "Analytics сбросила offset на 0 и перечитывает все {events} событий: в Kafka события после чтения не удаляются.",
        kafkaDone: "Billing дочитала до конца — lag {lag}.",
      },
      labels: {
        mode: "Брокер",
        rabbitTitle: "Очередь задач RabbitMQ",
        workers: "Воркеров",
        crash: "Worker 2 упадёт во время задачи",
        sendTasks: "Отправить 6 задач",
        perWorker: "Задач выполнил",
        makespan: "Время пакета",
        sequential: "Один воркер",
        units: "{value} ед.",
        redelivered: "Задача {task} доставлена повторно: {worker}",
        kafkaTitle: "Topic orders в Kafka",
        consumers: "Consumers в группе billing",
        publish: "Опубликовать события",
        replay: "Перечитать analytics с начала",
        partitions: "Партиции",
        empty: "пусто",
        assignment: "Группа billing",
        lag: "lag {value}",
        analytics: "Группа analytics: прочитано {read} из {total}",
        difference:
          "Очередь распределяет работу: сообщение достаётся одному обработчику и исчезает после подтверждения. Журнал хранит события: каждая группа читает их со своей позиции и может перечитать.",
      },
    },
    en: {
      idle: "Switch between RabbitMQ and Kafka — the camera flies to that district. These are two different ideas: a task queue and an event log.",
      captions: {
        rabbitPublish:
          "The API publishes {tasks} tasks to the RabbitMQ queue and is free at once.",
        rabbitDispatch:
          "The workers ({workers}) compete for messages: each one goes to exactly one worker, the next to whoever is free (prefetch = 1).",
        rabbitCrash:
          "{worker} died before acknowledging task {task}. Without an ack the message is not lost: RabbitMQ put it back in the queue and gave it to another worker.",
        rabbitDone:
          "{tasks} tasks done in {makespan} time units; one worker would need {sequential}. Once acknowledged, the messages are gone from the queue.",
        kafkaPublish:
          "The producer publishes {events} events to the orders topic. The partition is chosen by the order key: one order's events land in one partition and keep their order.",
        kafkaConsume:
          "The billing group reads the new events. Each partition belongs to exactly one consumer: {assignment}.",
        kafkaRebalance:
          "The billing group changed — its partitions were reassigned (rebalance): {assignment}.",
        kafkaAnalytics:
          "The analytics group reads the same events independently: it has its own offsets.",
        kafkaReplay:
          "Analytics reset its offsets to 0 and reads all {events} events again: Kafka does not delete events once they are read.",
        kafkaDone: "Billing has read everything — lag {lag}.",
      },
      labels: {
        mode: "Broker",
        rabbitTitle: "RabbitMQ task queue",
        workers: "Workers",
        crash: "Worker 2 dies in the middle of a task",
        sendTasks: "Send 6 tasks",
        perWorker: "Tasks done",
        makespan: "Batch time",
        sequential: "One worker",
        units: "{value} units",
        redelivered: "Task {task} redelivered: {worker}",
        kafkaTitle: "The orders topic in Kafka",
        consumers: "Consumers in the billing group",
        publish: "Publish events",
        replay: "Replay analytics from the start",
        partitions: "Partitions",
        empty: "empty",
        assignment: "Billing group",
        lag: "lag {value}",
        analytics: "Analytics group: read {read} of {total}",
        difference:
          "A queue shares out work: a message goes to one handler and disappears once acknowledged. A log keeps events: every group reads them from its own position and can read them again.",
      },
    },
  };

const measures = measureEventDrivenImpact();

/** The case at a glance: before and after, what the approach changes in the model, what I did. */
export const eventDrivenGlance = {
  before: [
    "Clients wait while slow work finishes",
    "One slow or unavailable component holds up the chain",
    "Work depends on external systems and several services",
  ],
  after: [
    "The API answers at once, the work runs in the background",
    "Handlers scale independently of the API",
    "Every service that needs an event gets it",
  ],
  did: [
    "Service interaction through brokers",
    "Messaging on RabbitMQ and Kafka",
    "Background task processing",
    "Redis and PostgreSQL in the system",
    "Analysis of delivery failures",
  ],
  charts: [
    {
      measure: measures.batchTime,
      title: "Time to finish 12 tasks",
      figure: "ratio",
      caption: "faster with three competing workers instead of one",
      bars: {
        "workers-1": "1 worker",
        "workers-2": "2 workers",
        "workers-3": "3 workers",
      },
      method:
        "The demo queue: tasks of 2–4 time units, prefetch 1, every task acknowledged when done.",
    },
  ],
} satisfies CaseGlanceInput;
