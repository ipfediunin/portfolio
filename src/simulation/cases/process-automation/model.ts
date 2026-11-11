/**
 * The processing rules of the automation demo: incoming records are validated, valid ones become
 * queued tasks, a worker transforms and stores each one and sends a notification. A failure stays
 * with its task — logged and visible in monitoring — and never stops the rest of the batch.
 */

export type RecordSource = "api" | "webhook";

export interface IncomingRecord {
  readonly id: string;
  readonly source: RecordSource;
  readonly email: string;
  /** Amount in currency units as received; null when the field is missing. */
  readonly amount: number | null;
}

export const rejectionReasons = [
  "missingAmount",
  "negativeAmount",
  "invalidEmail",
] as const;
export type RejectionReason = (typeof rejectionReasons)[number];

export type RecordOutcome =
  | {
      readonly record: IncomingRecord;
      readonly status: "rejected";
      readonly reason: RejectionReason;
    }
  | {
      readonly record: IncomingRecord;
      readonly status: "done";
      /** The stored form: normalised e-mail and the amount in cents. */
      readonly stored: { readonly email: string; readonly amountCents: number };
    }
  | {
      readonly record: IncomingRecord;
      readonly status: "notifyFailed";
      readonly stored: { readonly email: string; readonly amountCents: number };
    };

export interface BatchReport {
  readonly outcomes: readonly RecordOutcome[];
  readonly received: number;
  readonly rejected: number;
  readonly stored: number;
  readonly notified: number;
  readonly failed: number;
  /** Monitoring entries, in the order they happen. */
  readonly log: readonly {
    readonly level: "info" | "warn" | "error";
    readonly recordId: string;
    readonly event: "rejected" | "stored" | "notified" | "notifyFailed";
    readonly detail: string;
  }[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRecord(record: IncomingRecord): RejectionReason | null {
  if (record.amount === null) return "missingAmount";
  if (record.amount < 0) return "negativeAmount";
  if (!EMAIL.test(record.email.trim())) return "invalidEmail";
  return null;
}

/** A demo batch; with `withErrors`, two records fail validation for different reasons. */
export function sampleBatch(withErrors: boolean): IncomingRecord[] {
  const records: IncomingRecord[] = [
    { id: "R-101", source: "api", email: "Anna@Example.com", amount: 120.5 },
    { id: "R-102", source: "webhook", email: "ops@example.com", amount: 42 },
    {
      id: "R-103",
      source: "api",
      email: "billing@example.com",
      amount: 999.99,
    },
    { id: "R-104", source: "webhook", email: "team@example.com", amount: 15 },
  ];
  if (withErrors)
    records.splice(
      2,
      0,
      {
        id: "R-105",
        source: "webhook",
        email: "no-at-sign.example.com",
        amount: 10,
      },
      { id: "R-106", source: "api", email: "sales@example.com", amount: null },
    );
  return records;
}

export function processBatch(
  records: readonly IncomingRecord[],
  { notificationsDown }: { readonly notificationsDown: boolean },
): BatchReport {
  const log: BatchReport["log"][number][] = [];
  const outcomes = records.map((record): RecordOutcome => {
    const reason = validateRecord(record);
    if (reason) {
      log.push({
        level: "warn",
        recordId: record.id,
        event: "rejected",
        detail: reason,
      });
      return { record, status: "rejected", reason };
    }
    const stored = {
      email: record.email.trim().toLowerCase(),
      amountCents: Math.round((record.amount ?? 0) * 100),
    };
    log.push({
      level: "info",
      recordId: record.id,
      event: "stored",
      detail: `${stored.amountCents}`,
    });
    if (notificationsDown) {
      log.push({
        level: "error",
        recordId: record.id,
        event: "notifyFailed",
        detail: "503",
      });
      return { record, status: "notifyFailed", stored };
    }
    log.push({
      level: "info",
      recordId: record.id,
      event: "notified",
      detail: stored.email,
    });
    return { record, status: "done", stored };
  });
  const count = (status: RecordOutcome["status"]) =>
    outcomes.filter((outcome) => outcome.status === status).length;
  return {
    outcomes,
    received: records.length,
    rejected: count("rejected"),
    stored: count("done") + count("notifyFailed"),
    notified: count("done"),
    failed: count("notifyFailed"),
    log,
  };
}
