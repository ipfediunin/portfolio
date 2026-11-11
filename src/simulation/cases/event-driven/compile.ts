import { CaseScript, type CaseRun } from "../case-script";
import {
  billingNode,
  consumerLink,
  eventDrivenGraph,
  partitionNode,
  publishLink,
  workerDbLink,
  workerLink,
  workerNode,
} from "./graph";
import type { ConsumeResult, KafkaRecord, RabbitReport } from "./model";

export type EventDrivenCaption =
  | "rabbitPublish"
  | "rabbitDispatch"
  | "rabbitCrash"
  | "rabbitDone"
  | "kafkaPublish"
  | "kafkaConsume"
  | "kafkaRebalance"
  | "kafkaAnalytics"
  | "kafkaReplay"
  | "kafkaDone";

type Next = { readonly startAt: number; readonly sequence: number };

/** Playback ms per model unit of work: the timeline of the model, slowed down to watch. */
const UNIT_MS = 520;

export function compileRabbit(
  report: RabbitReport,
  next: Next,
): CaseRun<EventDrivenCaption> {
  const s = new CaseScript<EventDrivenCaption>(
    eventDrivenGraph,
    "ed-rabbit",
    next,
  );
  const tasks = report.deliveries.filter(
    (delivery) => !delivery.redelivered,
  ).length;
  s.caption("rabbitPublish", { tasks })
    .parallel(
      Array.from(
        { length: tasks },
        () => (branch) => branch.hop("ed.l.api-rabbit", { kind: "job" }),
      ),
      160,
    )
    .status("ed.rabbit", "queued", `Ready: ${tasks}`)
    .caption("rabbitDispatch", { workers: report.tasksPerWorker.length });

  s.parallel(
    report.deliveries.map((delivery) => (branch) => {
      branch
        .pause(delivery.start * UNIT_MS)
        .hop(workerLink(delivery.worker), {
          kind: "job",
          tone: delivery.redelivered ? "retry" : "neutral",
        })
        .status(
          workerNode(delivery.worker),
          "processing",
          `task ${delivery.task}${delivery.redelivered ? " · redelivered" : ""}`,
        )
        .pause((delivery.end - delivery.start) * UNIT_MS);
      if (!delivery.acked) {
        branch
          .status(workerNode(delivery.worker), "failed", "Crashed · no ack")
          .hop(workerLink(delivery.worker), {
            kind: "job",
            tone: "retry",
            reverse: true,
          })
          .status("ed.rabbit", "retry", `Requeued: task ${delivery.task}`);
        return;
      }
      branch
        .hop(workerDbLink(delivery.worker), { kind: "job", tone: "success" })
        .status(
          workerNode(delivery.worker),
          "success",
          `ack · task ${delivery.task}`,
        );
    }),
  );

  if (report.crashedWorker !== null) {
    const lost = report.deliveries.find((delivery) => !delivery.acked);
    s.caption("rabbitCrash", {
      worker: `Worker ${report.crashedWorker}`,
      task: lost?.task ?? 0,
    });
  }
  s.status("ed.rabbit", "success", "Ready: 0").caption("rabbitDone", {
    tasks,
    makespan: report.makespan,
    sequential: report.sequentialMakespan,
    workers: report.tasksPerWorker.filter((count) => count > 0).length,
  });
  return s.build();
}

export interface KafkaPlan {
  /** Records published this round (empty when only consuming). */
  readonly published: readonly KafkaRecord[];
  readonly billing: ConsumeResult;
  /** Assignment in words, e.g. "Billing 1: p0, p1 · Billing 2: p2". */
  readonly assignment: string;
  readonly rebalanced: boolean;
  readonly analytics: ConsumeResult;
  /** Analytics went back to offset 0 and reads everything again. */
  readonly replay: boolean;
  readonly totalEvents: number;
  readonly billingLag: number;
}

function readAll(
  s: CaseScript<EventDrivenCaption>,
  reads: readonly (readonly KafkaRecord[])[],
  consumerOf: (index: number) => {
    readonly node: string;
    readonly link: string;
  },
): void {
  s.parallel(
    reads.map((records, index) => (branch) => {
      const consumer = consumerOf(index);
      for (const record of records)
        branch
          .hop(consumerLink(record.partition, consumer.link), { kind: "event" })
          .status(consumer.node, "success", `${record.key} · ${record.value}`);
    }),
    200,
  );
}

export function compileKafka(
  plan: KafkaPlan,
  next: Next,
): CaseRun<EventDrivenCaption> {
  const s = new CaseScript<EventDrivenCaption>(
    eventDrivenGraph,
    "ed-kafka",
    next,
  );
  if (plan.published.length > 0) {
    s.caption("kafkaPublish", { events: plan.published.length }).parallel(
      plan.published.map(
        (record) => (branch) =>
          branch
            .hop(publishLink(record.partition), { kind: "event" })
            .status(
              partitionNode(record.partition),
              "queued",
              `offset ${record.offset} · ${record.key}`,
            ),
      ),
      240,
    );
  }
  s.caption(plan.rebalanced ? "kafkaRebalance" : "kafkaConsume", {
    assignment: plan.assignment,
  });
  readAll(s, plan.billing.reads, (index) => ({
    node: billingNode(index),
    link: `billing-${index + 1}`,
  }));
  s.caption(plan.replay ? "kafkaReplay" : "kafkaAnalytics", {
    events: plan.totalEvents,
  });
  readAll(s, plan.analytics.reads, () => ({
    node: "ed.analytics",
    link: "analytics",
  }));
  s.caption("kafkaDone", { lag: plan.billingLag });
  return s.build();
}
