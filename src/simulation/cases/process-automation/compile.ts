import { CaseScript, type CaseRun } from "../case-script";
import { processAutomationGraph } from "./graph";
import type { BatchReport } from "./model";

export type ProcessAutomationCaption =
  | "receive"
  | "validate"
  | "rejected"
  | "queue"
  | "process"
  | "notifyFailed"
  | "done";

const sourceLink = {
  api: "pa.l.api-django",
  webhook: "pa.l.hooks-django",
} as const;

/** One batch through the system, following what the model decided for each record. */
export function compileBatch(
  report: BatchReport,
  next: { readonly startAt: number; readonly sequence: number },
): CaseRun<ProcessAutomationCaption> {
  const s = new CaseScript<ProcessAutomationCaption>(
    processAutomationGraph,
    "pa-batch",
    next,
  );
  const accepted = report.outcomes.filter(
    (outcome) => outcome.status !== "rejected",
  );

  s.caption("receive", { count: report.received })
    .parallel(
      report.outcomes.map(
        ({ record }) =>
          (branch) =>
            branch.hop(sourceLink[record.source]),
      ),
      260,
    )
    .work("pa.django", "validate(batch)", [3, 8])
    .status("pa.django", "success", `202 · ${accepted.length} queued`)
    .caption("validate", { valid: accepted.length, rejected: report.rejected });

  if (report.rejected > 0)
    s.hop("pa.l.django-monitor", { kind: "event", tone: "failed" })
      .status("pa.monitor", "failed", `${report.rejected} rejected`)
      .log(
        "pa.django",
        "warn",
        `${report.rejected} records rejected by validation`,
      )
      .caption("rejected", { rejected: report.rejected });

  s.caption("queue", { queued: accepted.length })
    .parallel(
      accepted.map(
        () => (branch) => branch.hop("pa.l.django-rabbit", { kind: "job" }),
      ),
      220,
    )
    .status("pa.rabbit", "queued", `${accepted.length} tasks`)
    .caption("process");

  s.parallel(
    accepted.map((outcome) => (branch) => {
      branch
        .hop("pa.l.rabbit-worker", { kind: "job" })
        .work("pa.worker", `process ${outcome.record.id}`, [20, 60])
        .hop("pa.l.worker-db", { kind: "job" })
        .work("pa.db", "INSERT INTO records", [2, 6])
        .hop("pa.l.worker-notify", {
          kind: "event",
          tone: outcome.status === "done" ? "success" : "failed",
        });
      if (outcome.status === "done")
        branch.status("pa.notify", "success", "Sent");
      else
        branch
          .status("pa.notify", "failed", "503 Unavailable")
          .log(
            "pa.worker",
            "error",
            `${outcome.record.id}: notification failed`,
          )
          .hop("pa.l.worker-monitor", { kind: "event", tone: "failed" })
          .status("pa.monitor", "failed", "Task failed");
    }),
    700,
  );

  if (report.failed > 0) s.caption("notifyFailed", { failed: report.failed });
  s.status(
    "pa.worker",
    report.failed > 0 ? "retry" : "success",
    `${report.stored} stored`,
  ).caption("done", {
    stored: report.stored,
    notified: report.notified,
    failed: report.failed,
    rejected: report.rejected,
  });
  return s.build();
}
