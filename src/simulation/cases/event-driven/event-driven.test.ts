import { describe, expect, it } from "vitest";

import { compileKafka, compileRabbit } from "./compile";
import {
  assignPartitions,
  consume,
  dispatchTasks,
  emptyTopic,
  lag,
  orderEvents,
  partitionFor,
  publish,
  startOffsets,
} from "./model";

describe("RabbitMQ queue", () => {
  it("gives every message to exactly one worker", () => {
    const report = dispatchTasks({ tasks: 6, workers: 3, crash: false });
    const tasks = report.deliveries.map((delivery) => delivery.task).sort();
    expect(tasks).toEqual([1, 2, 3, 4, 5, 6]);
    expect(report.tasksPerWorker.reduce((sum, count) => sum + count, 0)).toBe(
      6,
    );
  });

  it("finishes faster with competing workers than with one", () => {
    const one = dispatchTasks({ tasks: 6, workers: 1, crash: false });
    const three = dispatchTasks({ tasks: 6, workers: 3, crash: false });
    expect(one.makespan).toBe(one.sequentialMakespan);
    expect(three.makespan).toBeLessThan(one.makespan / 2);
  });

  it("redelivers the message a crashed worker never acknowledged", () => {
    const report = dispatchTasks({ tasks: 6, workers: 3, crash: true });
    const unacked = report.deliveries.filter((delivery) => !delivery.acked);
    expect(unacked).toHaveLength(1);
    expect(unacked[0]?.worker).toBe(2);
    const again = report.deliveries.find(
      (delivery) => delivery.redelivered && delivery.task === unacked[0]?.task,
    );
    expect(again?.worker).not.toBe(2);
    expect(report.tasksPerWorker[1]).toBe(0);
    expect(report.deliveries.filter((delivery) => delivery.acked)).toHaveLength(
      6,
    );
  });
});

describe("Kafka log", () => {
  it("keeps one key in one partition, in publishing order", () => {
    const { topic } = publish(emptyTopic(), orderEvents(0));
    const partition = topic[partitionFor("order-1")]!;
    expect(
      partition
        .filter((record) => record.key === "order-1")
        .map((record) => record.value),
    ).toEqual(["created", "paid", "shipped"]);
    for (const records of topic) {
      expect(records.length, "every partition gets events").toBeGreaterThan(0);
      records.forEach((record, index) => expect(record.offset).toBe(index));
    }
  });

  it("assigns every partition to exactly one consumer of a group", () => {
    for (const consumers of [1, 2, 3]) {
      const assignment = assignPartitions(consumers);
      expect(assignment.flat().sort()).toEqual([0, 1, 2]);
    }
    expect(assignPartitions(2)).toEqual([[0, 1], [2]]);
  });

  it("lets another group read the same events and replay them", () => {
    const { topic } = publish(emptyTopic(), orderEvents(0));
    const billing = consume(topic, 2, startOffsets());
    expect(billing.reads.flat()).toHaveLength(7);
    expect(lag(topic, billing.offsets)).toBe(0);
    // Reading does not remove anything: analytics still sees all seven, and again after a reset.
    const analytics = consume(topic, 1, startOffsets());
    expect(analytics.reads.flat()).toHaveLength(7);
    expect(consume(topic, 1, analytics.offsets).reads.flat()).toHaveLength(0);
    expect(consume(topic, 1, startOffsets()).reads.flat()).toHaveLength(7);
  });
});

describe("event-driven runs", () => {
  it("compiles the queue with and without a crash", () => {
    for (const crash of [false, true]) {
      const run = compileRabbit(
        dispatchTasks({ tasks: 6, workers: 3, crash }),
        {
          startAt: 0,
          sequence: 1,
        },
      );
      const keys = run.captions.map((caption) => caption.key);
      expect(keys.includes("rabbitCrash")).toBe(crash);
      expect(keys.at(-1)).toBe("rabbitDone");
    }
  });

  it("compiles publishing, consuming, a rebalance and a replay", () => {
    const { topic, records } = publish(emptyTopic(), orderEvents(0));
    const run = compileKafka(
      {
        published: records,
        billing: consume(topic, 3, startOffsets()),
        assignment: "…",
        rebalanced: true,
        analytics: consume(topic, 1, startOffsets()),
        replay: true,
        totalEvents: 7,
        billingLag: 0,
      },
      { startAt: 0, sequence: 2 },
    );
    expect(run.captions.map((caption) => caption.key)).toEqual([
      "kafkaPublish",
      "kafkaRebalance",
      "kafkaReplay",
      "kafkaDone",
    ]);
  });
});
