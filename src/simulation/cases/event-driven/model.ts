/**
 * Two messaging models that are easy to confuse, kept apart on purpose.
 *
 * RabbitMQ (a queue): every message goes to exactly one of the competing workers; with prefetch 1
 * a worker gets the next message when it has acknowledged the previous one. A message that was
 * never acknowledged (the worker died) goes back to the queue and to another worker. Once
 * acknowledged, it is gone.
 *
 * Kafka (a log): events are appended to partitions chosen by key, so events with one key keep
 * their order. A consumer group splits the partitions among its consumers; another group reads
 * the same events with its own offsets, and can read them again from the start.
 */

// RabbitMQ

export interface RabbitDelivery {
  readonly task: number;
  /** 1-based worker number. */
  readonly worker: number;
  readonly start: number;
  readonly end: number;
  /** Delivered again after the first worker died without acknowledging it. */
  readonly redelivered: boolean;
  /** False for the delivery the crashed worker never finished. */
  readonly acked: boolean;
}

export interface RabbitReport {
  readonly deliveries: readonly RabbitDelivery[];
  readonly tasksPerWorker: readonly number[];
  /** Time until the last task is acknowledged, in model units. */
  readonly makespan: number;
  /** The same tasks on one worker, for comparison. */
  readonly sequentialMakespan: number;
  readonly crashedWorker: number | null;
}

/** Work units per task: a little uneven, like real jobs. */
export const taskCost = (task: number) => 2 + (task % 3);

export function dispatchTasks({
  tasks,
  workers,
  crash,
}: {
  readonly tasks: number;
  readonly workers: number;
  /** Worker 2 dies halfway through its first task (needs at least two workers). */
  readonly crash: boolean;
}): RabbitReport {
  const queue = Array.from({ length: tasks }, (_, index) => ({
    task: index + 1,
    redelivered: false,
  }));
  const freeAt = Array.from({ length: workers }, () => 0);
  const alive = Array.from({ length: workers }, () => true);
  const deliveries: RabbitDelivery[] = [];
  const crashing = crash && workers >= 2 ? 2 : null;
  let crashed = false;

  while (queue.length > 0) {
    // The next message goes to the worker that is free first (prefetch 1).
    let worker = -1;
    for (let index = 0; index < workers; index++)
      if (alive[index] && (worker === -1 || freeAt[index]! < freeAt[worker]!))
        worker = index;
    const message = queue.shift()!;
    const start = freeAt[worker]!;
    const cost = taskCost(message.task);
    if (crashing === worker + 1 && !crashed) {
      // Dies halfway, without an ack: the message is back at the head of the queue.
      crashed = true;
      alive[worker] = false;
      deliveries.push({
        ...message,
        worker: worker + 1,
        start,
        end: start + cost / 2,
        acked: false,
      });
      queue.unshift({ task: message.task, redelivered: true });
      freeAt[worker] = Number.POSITIVE_INFINITY;
      continue;
    }
    deliveries.push({
      ...message,
      worker: worker + 1,
      start,
      end: start + cost,
      acked: true,
    });
    freeAt[worker] = start + cost;
  }

  const acked = deliveries.filter((delivery) => delivery.acked);
  return {
    deliveries,
    tasksPerWorker: Array.from(
      { length: workers },
      (_, index) =>
        acked.filter((delivery) => delivery.worker === index + 1).length,
    ),
    makespan: Math.max(...acked.map((delivery) => delivery.end)),
    sequentialMakespan: Array.from({ length: tasks }, (_, index) =>
      taskCost(index + 1),
    ).reduce((sum, cost) => sum + cost, 0),
    crashedWorker: crashing,
  };
}

// Kafka

export const PARTITIONS = 3;

export interface KafkaEvent {
  readonly key: string;
  readonly value: string;
}

export interface KafkaRecord extends KafkaEvent {
  readonly partition: number;
  readonly offset: number;
}

/** The topic: one append-only log per partition. */
export type TopicLog = readonly (readonly KafkaRecord[])[];

export const emptyTopic = (): TopicLog =>
  Array.from({ length: PARTITIONS }, () => []);

/** Same key, same partition (a stable hash, like Kafka's default partitioner). */
export function partitionFor(key: string): number {
  let hash = 2166136261;
  for (const char of key) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % PARTITIONS;
}

export function publish(
  topic: TopicLog,
  events: readonly KafkaEvent[],
): { readonly topic: TopicLog; readonly records: readonly KafkaRecord[] } {
  const next = topic.map((partition) => [...partition]);
  const records = events.map((event) => {
    const partition = partitionFor(event.key);
    const record = { ...event, partition, offset: next[partition]!.length };
    next[partition]!.push(record);
    return record;
  });
  return { topic: next, records };
}

/** Range assignment: partitions in order, split as evenly as possible among the consumers. */
export function assignPartitions(consumers: number): number[][] {
  const assignment: number[][] = Array.from({ length: consumers }, () => []);
  const base = Math.floor(PARTITIONS / consumers);
  const extra = PARTITIONS % consumers;
  let partition = 0;
  for (let consumer = 0; consumer < consumers; consumer++) {
    const count = base + (consumer < extra ? 1 : 0);
    for (let index = 0; index < count; index++)
      assignment[consumer]!.push(partition++);
  }
  return assignment;
}

/** Committed offset per partition: the next record a group will read there. */
export type GroupOffsets = readonly number[];

export const startOffsets = (): GroupOffsets =>
  Array.from({ length: PARTITIONS }, () => 0);

export interface ConsumeResult {
  /** Records each consumer reads, in order (consumer index → records). */
  readonly reads: readonly (readonly KafkaRecord[])[];
  readonly offsets: GroupOffsets;
}

/** A group reads everything after its committed offsets; each partition by its one consumer. */
export function consume(
  topic: TopicLog,
  consumers: number,
  offsets: GroupOffsets,
): ConsumeResult {
  const assignment = assignPartitions(consumers);
  const reads = assignment.map((partitions) =>
    partitions.flatMap((partition) =>
      topic[partition]!.slice(offsets[partition]),
    ),
  );
  return { reads, offsets: topic.map((partition) => partition.length) };
}

/** Records not yet read by a group, summed over partitions. */
export function lag(topic: TopicLog, offsets: GroupOffsets): number {
  return topic.reduce(
    (sum, partition, index) => sum + partition.length - (offsets[index] ?? 0),
    0,
  );
}

/**
 * The demo's events: four orders, each going through its own lifecycle. The first three orders of a
 * round land in different partitions, so every round touches the whole topic.
 */
export function orderEvents(round: number): KafkaEvent[] {
  const keys: string[] = [];
  const covered = new Set<number>();
  for (let order = round * 10 + 1; keys.length < 4; order++) {
    const key = `order-${order}`;
    const partition = partitionFor(key);
    if (keys.length < PARTITIONS && covered.has(partition)) continue;
    keys.push(key);
    covered.add(partition);
  }
  const [first, second, third, fourth] = keys as [
    string,
    string,
    string,
    string,
  ];
  return [
    { key: first, value: "created" },
    { key: second, value: "created" },
    { key: first, value: "paid" },
    { key: third, value: "created" },
    { key: second, value: "paid" },
    { key: first, value: "shipped" },
    { key: fourth, value: "created" },
  ];
}
