"use client";

import { useState } from "react";
import { useStore } from "zustand";

import type { ProcessAutomationDemoContent } from "@/content/cases/process-automation";
import { Switch } from "@/features/playground/controls";
import { cn } from "@/lib/cn";
import {
  compileBatch,
  type ProcessAutomationCaption,
} from "@/simulation/cases/process-automation/compile";
import {
  processBatch,
  sampleBatch,
  type BatchReport,
  type RecordOutcome,
} from "@/simulation/cases/process-automation/model";

import { CaseStage, useCaseDemo, type CaseStageInput } from "./case-stage";
import { DemoButton, DemoPanel } from "./demo-ui";
import { formatTemplate } from "./format";

const statusTone: Readonly<
  Record<RecordOutcome["status"] | "pending", string>
> = {
  pending: "text-ink-3",
  rejected: "text-status-retry",
  done: "text-status-success",
  notifyFailed: "text-status-failed",
};

/** Case 03: a batch through validation, the queue and the worker; failures stay visible. */
export function ProcessAutomationDemo({
  input,
  content,
}: {
  readonly input: CaseStageInput;
  readonly content: ProcessAutomationDemoContent;
}) {
  const demo = useCaseDemo<ProcessAutomationCaption>();
  const running = useStore(demo.controller.store, (state) => state.running);
  const [withErrors, setWithErrors] = useState(true);
  const [notificationsDown, setNotificationsDown] = useState(false);
  const [report, setReport] = useState<BatchReport | null>(null);
  const { labels } = content;
  const { locale } = input;
  const records = sampleBatch(withErrors);
  // Results show once the scene has played them; until then the batch is waiting.
  const settled = report !== null && !running;

  function run() {
    const next = processBatch(records, { notificationsDown });
    setReport(next);
    demo.play((timing) => compileBatch(next, timing));
  }

  function statusOf(id: string): RecordOutcome | null {
    if (!settled) return null;
    return report.outcomes.find((outcome) => outcome.record.id === id) ?? null;
  }

  return (
    <CaseStage
      demo={demo}
      input={input}
      captions={content.captions}
      idleCaption={content.idle}
      entry={{
        kind: "action",
        nodeId: "pa.api",
        actionLabel: labels.run,
        onAction: run,
      }}
    >
      <DemoPanel title={labels.controls}>
        <div className="space-y-1">
          <Switch
            label={labels.withErrors}
            checked={withErrors}
            onChange={(value) => {
              setWithErrors(value);
              setReport(null);
            }}
          />
          <Switch
            label={labels.notificationsDown}
            checked={notificationsDown}
            onChange={setNotificationsDown}
          />
        </div>
        <DemoButton tone="primary" className="mt-4" onClick={run}>
          {labels.run}
        </DemoButton>
      </DemoPanel>

      <DemoPanel title={labels.records}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th scope="col" className="pb-2 font-medium">
                {labels.id}
              </th>
              <th scope="col" className="pb-2 font-medium">
                {labels.source}
              </th>
              <th scope="col" className="pb-2 font-medium">
                {labels.status}
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const outcome = statusOf(record.id);
              const status = outcome?.status ?? "pending";
              return (
                <tr
                  key={record.id}
                  className="border-t border-line/70 align-top"
                >
                  <th
                    scope="row"
                    className="py-2 pr-3 text-left font-mono text-xs font-semibold text-ink"
                  >
                    {record.id}
                  </th>
                  <td className="py-2 pr-3 text-xs text-ink-2">
                    {content.sources[record.source]}
                  </td>
                  <td
                    className={cn(
                      "py-2 text-xs font-medium",
                      statusTone[status],
                    )}
                  >
                    {content.statuses[status]}
                    {outcome?.status === "rejected"
                      ? ` — ${content.reasons[outcome.reason]}`
                      : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {settled ? (
          <p className="mt-3 font-mono text-xs text-ink-2">
            {formatTemplate(
              labels.summary,
              {
                received: report.received,
                rejected: report.rejected,
                stored: report.stored,
                failed: report.failed,
              },
              locale,
            )}
          </p>
        ) : null}
      </DemoPanel>

      <DemoPanel title={labels.monitoring}>
        {settled ? (
          <ol className="space-y-1 font-mono text-xs">
            {report.log.map((entry, index) => (
              <li
                key={`${entry.recordId}-${entry.event}-${index}`}
                className={cn(
                  entry.level === "error" && "text-status-failed",
                  entry.level === "warn" && "text-status-retry",
                  entry.level === "info" && "text-ink-2",
                )}
              >
                {entry.level.toUpperCase()} {entry.recordId}{" "}
                {formatTemplate(
                  content.events[entry.event],
                  {
                    detail:
                      entry.event === "rejected" &&
                      isReason(entry.detail, content)
                        ? content.reasons[entry.detail]
                        : entry.detail,
                  },
                  locale,
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-3">{labels.monitoringEmpty}</p>
        )}
      </DemoPanel>
    </CaseStage>
  );
}

function isReason(
  value: string,
  content: ProcessAutomationDemoContent,
): value is keyof ProcessAutomationDemoContent["reasons"] {
  return Object.hasOwn(content.reasons, value);
}
