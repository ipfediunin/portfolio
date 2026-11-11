"use client";

import { useState } from "react";

import type { EventDrivenDemoContent } from "@/content/cases/event-driven";
import { Segmented, Switch } from "@/features/playground/controls";
import { cn } from "@/lib/cn";
import {
  compileKafka,
  compileRabbit,
  type EventDrivenCaption,
} from "@/simulation/cases/event-driven/compile";
import {
  assignPartitions,
  consume,
  dispatchTasks,
  emptyTopic,
  lag,
  orderEvents,
  publish,
  startOffsets,
  type GroupOffsets,
  type RabbitReport,
  type TopicLog,
} from "@/simulation/cases/event-driven/model";

import { CaseStage, useCaseDemo, type CaseStageInput } from "./case-stage";
import { DemoButton, DemoPanel, DemoValue } from "./demo-ui";
import { formatTemplate } from "./format";

type Mode = "rabbitmq" | "kafka";
const TASKS = 6;
const keyTones = [
  "border-brand/40 bg-brand/10 text-brand",
  "border-flow-async/40 bg-flow-async/10 text-flow-async",
  "border-status-success/40 bg-status-success/10 text-status-success",
  "border-status-retry/40 bg-status-retry/10 text-status-retry",
] as const;
const keyTone = (key: string) =>
  keyTones[(Number(key.replace(/\D/g, "")) - 1) % keyTones.length];

const describeAssignment = (consumers: number) =>
  assignPartitions(consumers)
    .map(
      (partitions, index) =>
        `Billing ${index + 1}: ${partitions.map((p) => `p${p}`).join(", ") || "—"}`,
    )
    .join(" · ");

/** Case 05: the same idea of "work outside the request" on a queue and on a log, side by side. */
export function EventDrivenDemo({
  input,
  content,
}: {
  readonly input: CaseStageInput;
  readonly content: EventDrivenDemoContent;
}) {
  const demo = useCaseDemo<EventDrivenCaption>();
  const [mode, setMode] = useState<Mode>("rabbitmq");
  const [workers, setWorkers] = useState(3);
  const [crash, setCrash] = useState(true);
  const [rabbit, setRabbit] = useState<RabbitReport | null>(null);
  const [topic, setTopic] = useState<TopicLog>(emptyTopic);
  const [consumers, setConsumers] = useState(2);
  const [assignedTo, setAssignedTo] = useState(2);
  const [billingOffsets, setBillingOffsets] =
    useState<GroupOffsets>(startOffsets);
  const [analyticsOffsets, setAnalyticsOffsets] =
    useState<GroupOffsets>(startOffsets);
  const [round, setRound] = useState(0);
  const { labels } = content;
  const { locale } = input;
  const units = (value: number) =>
    formatTemplate(labels.units, { value }, locale);
  const total = topic.reduce((sum, partition) => sum + partition.length, 0);

  function sendTasks() {
    const report = dispatchTasks({
      tasks: TASKS,
      workers,
      crash: crash && workers >= 2,
    });
    setRabbit(report);
    demo.play((next) => compileRabbit(report, next));
  }

  function runKafka({
    events,
    replay,
  }: {
    readonly events: boolean;
    readonly replay: boolean;
  }) {
    const published = events
      ? publish(topic, orderEvents(round))
      : { topic, records: [] };
    const billing = consume(published.topic, consumers, billingOffsets);
    const analytics = consume(
      published.topic,
      1,
      replay ? startOffsets() : analyticsOffsets,
    );
    demo.play((next) =>
      compileKafka(
        {
          published: published.records,
          billing,
          assignment: describeAssignment(consumers),
          rebalanced: consumers !== assignedTo,
          analytics,
          replay,
          totalEvents: published.topic.reduce(
            (sum, partition) => sum + partition.length,
            0,
          ),
          billingLag: lag(published.topic, billing.offsets),
        },
        next,
      ),
    );
    setTopic(published.topic);
    setBillingOffsets(billing.offsets);
    setAnalyticsOffsets(analytics.offsets);
    setAssignedTo(consumers);
    if (events) setRound(round + 1);
  }

  const redelivery = rabbit?.deliveries.find(
    (delivery) => delivery.redelivered,
  );

  return (
    <CaseStage
      demo={demo}
      input={{ ...input, scene: { world: "event-driven", view: mode } }}
      captions={content.captions}
      idleCaption={content.idle}
      entry={
        mode === "rabbitmq"
          ? {
              kind: "action",
              nodeId: "ed.api",
              actionLabel: labels.sendTasks,
              onAction: sendTasks,
            }
          : {
              kind: "action",
              nodeId: "ed.producer",
              actionLabel: labels.publish,
              onAction: () => runKafka({ events: true, replay: false }),
            }
      }
    >
      <DemoPanel title={labels.mode}>
        <Segmented
          label={labels.mode}
          value={mode}
          options={[
            { value: "rabbitmq", label: "RabbitMQ" },
            { value: "kafka", label: "Kafka" },
          ]}
          onChange={setMode}
        />
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          {labels.difference}
        </p>
      </DemoPanel>

      {mode === "rabbitmq" ? (
        <DemoPanel title={labels.rabbitTitle}>
          <p className="mb-2 text-sm font-medium text-ink">{labels.workers}</p>
          <Segmented
            label={labels.workers}
            value={workers}
            options={[1, 2, 3].map((value) => ({
              value,
              label: String(value),
            }))}
            onChange={setWorkers}
          />
          <div className="mt-3">
            <Switch
              label={labels.crash}
              checked={crash && workers >= 2}
              onChange={setCrash}
            />
          </div>
          <DemoButton tone="primary" className="mt-3" onClick={sendTasks}>
            {labels.sendTasks}
          </DemoButton>
          {rabbit ? (
            <div className="mt-4">
              {rabbit.tasksPerWorker.map((count, index) => (
                <DemoValue
                  key={index}
                  label={`Worker ${index + 1} · ${labels.perWorker}`}
                  value={count}
                  tone={rabbit.crashedWorker === index + 1 ? "bad" : "neutral"}
                />
              ))}
              <DemoValue
                label={labels.makespan}
                value={units(rabbit.makespan)}
                tone="good"
              />
              <DemoValue
                label={labels.sequential}
                value={units(rabbit.sequentialMakespan)}
              />
              {redelivery ? (
                <p className="mt-2 text-xs text-status-retry">
                  {formatTemplate(
                    labels.redelivered,
                    {
                      task: redelivery.task,
                      worker: `Worker ${redelivery.worker}`,
                    },
                    locale,
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
        </DemoPanel>
      ) : (
        <DemoPanel title={labels.kafkaTitle}>
          <p className="mb-2 text-sm font-medium text-ink">
            {labels.consumers}
          </p>
          <Segmented
            label={labels.consumers}
            value={consumers}
            options={[1, 2, 3].map((value) => ({
              value,
              label: String(value),
            }))}
            onChange={setConsumers}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <DemoButton
              tone="primary"
              onClick={() => runKafka({ events: true, replay: false })}
            >
              {labels.publish}
            </DemoButton>
            <DemoButton
              disabled={total === 0}
              onClick={() => runKafka({ events: false, replay: true })}
            >
              {labels.replay}
            </DemoButton>
          </div>

          <h4 className="mt-5 text-xs font-medium text-ink-3">
            {labels.partitions}
          </h4>
          <ol className="mt-2 space-y-2">
            {topic.map((records, partition) => (
              <li key={partition} className="flex items-start gap-2">
                <span className="mt-1 w-6 shrink-0 font-mono text-xs font-semibold text-ink-2">
                  p{partition}
                </span>
                <span className="flex min-w-0 flex-wrap gap-1">
                  {records.length === 0 ? (
                    <span className="text-xs text-ink-3">{labels.empty}</span>
                  ) : (
                    records.map((record) => (
                      <span
                        key={record.offset}
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 font-mono text-[11px]",
                          keyTone(record.key),
                        )}
                      >
                        {record.offset}·{record.key.replace("order-", "#")}{" "}
                        {record.value}
                      </span>
                    ))
                  )}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-4">
            {assignPartitions(consumers).map((partitions, index) => (
              <DemoValue
                key={index}
                label={`${labels.assignment} · Billing ${index + 1}`}
                value={`${partitions.map((p) => `p${p}`).join(", ") || "—"} · ${formatTemplate(
                  labels.lag,
                  {
                    value: partitions.reduce(
                      (sum, p) =>
                        sum + topic[p]!.length - (billingOffsets[p] ?? 0),
                      0,
                    ),
                  },
                  locale,
                )}`}
              />
            ))}
            <DemoValue
              label="Analytics"
              value={formatTemplate(
                labels.analytics,
                {
                  read: analyticsOffsets.reduce(
                    (sum, offset) => sum + offset,
                    0,
                  ),
                  total,
                },
                locale,
              )}
            />
          </div>
        </DemoPanel>
      )}
    </CaseStage>
  );
}
