"use client";

import { useState } from "react";

import type { DataInfrastructureDemoContent } from "@/content/cases/data-infrastructure";
import { Segmented } from "@/features/playground/controls";
import {
  compileExpiry,
  compileQuery,
  compileStartup,
  type DataInfrastructureCaption,
} from "@/simulation/cases/data-infrastructure/compile";
import {
  advanceClock,
  averageOrderRead,
  hitRatio,
  initialDataState,
  restart,
  runQuery,
  type DataLayerState,
  type DataQuery,
  type QueryResult,
  type VectorStore,
} from "@/simulation/cases/data-infrastructure/model";

import { CaseStage, useCaseDemo, type CaseStageInput } from "./case-stage";
import { DemoButton, DemoPanel, DemoValue } from "./demo-ui";
import { formatTemplate } from "./format";

const ORDERS = [42, 17] as const;
/** The order the send-point bubble on the web client reads. */
const ENTRY_ORDER = ORDERS[0];

/** Case 07: each query goes to the store that fits it; the cache shows its value in numbers. */
export function DataInfrastructureDemo({
  input,
  content,
}: {
  readonly input: CaseStageInput;
  readonly content: DataInfrastructureDemoContent;
}) {
  const demo = useCaseDemo<DataInfrastructureCaption>();
  const [state, setState] = useState<DataLayerState>(initialDataState);
  const [store, setStore] = useState<VectorStore>("pgvector");
  const [last, setLast] = useState<QueryResult | null>(null);
  const { labels } = content;
  const { locale } = input;
  const percent = new Intl.NumberFormat(locale, { style: "percent" });
  const ratio = hitRatio(state);
  const average = averageOrderRead(state);

  function query(next: DataQuery) {
    const step = runQuery(state, next);
    setState(step.state);
    setLast(step.result);
    demo.play((timing) => compileQuery(step.result, timing));
  }

  function passTime() {
    const step = advanceClock(state, 5);
    setState(step.state);
    demo.play((timing) => compileExpiry(step.expired, timing));
  }

  function startService() {
    setState(restart(state));
    setLast(null);
    demo.play((timing) => compileStartup(timing));
  }

  return (
    <CaseStage
      demo={demo}
      input={input}
      captions={content.captions}
      idleCaption={content.idle}
      entry={{
        kind: "action",
        nodeId: "di.client",
        actionLabel: formatTemplate(labels.order, { id: ENTRY_ORDER }, locale),
        onAction: () => query({ kind: "order", id: ENTRY_ORDER }),
      }}
    >
      <DemoPanel title={labels.queries}>
        <div className="flex flex-wrap gap-2">
          {ORDERS.map((id) => (
            <DemoButton
              key={id}
              tone="primary"
              onClick={() => query({ kind: "order", id })}
            >
              {formatTemplate(labels.order, { id }, locale)}
            </DemoButton>
          ))}
          <DemoButton onClick={() => query({ kind: "orders" })}>
            {labels.orders}
          </DemoButton>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="mb-2 text-sm font-medium text-ink">{labels.store}</p>
            <Segmented
              label={labels.store}
              value={store}
              options={[
                { value: "pgvector", label: "pgvector" },
                { value: "milvus", label: "Milvus" },
              ]}
              onChange={setStore}
            />
          </div>
          <DemoButton onClick={() => query({ kind: "similar", store })}>
            {labels.similar}
          </DemoButton>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line/70 pt-4">
          <DemoButton onClick={passTime}>{labels.time}</DemoButton>
          <DemoButton onClick={startService}>{labels.restart}</DemoButton>
        </div>
      </DemoPanel>

      <DemoPanel title={labels.stats}>
        <DemoValue label={labels.hits} value={state.hits} tone="good" />
        <DemoValue label={labels.misses} value={state.misses} />
        <DemoValue
          label={labels.ratio}
          value={ratio === null ? "—" : percent.format(ratio)}
          tone="good"
        />
        <DemoValue
          label={labels.average}
          value={average === null ? "—" : `${average} ms`}
        />
        {last ? (
          <DemoValue
            label={labels.lastQuery}
            value={`${content.paths[last.path]} · ${last.latencyMs} ms`}
          />
        ) : null}
        <h4 className="mt-4 text-xs font-medium text-ink-3">{labels.cache}</h4>
        {state.cache.size > 0 ? (
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-ink-2">
            {[...state.cache].map(([key, expiresAt]) => (
              <li key={key}>
                {key} ·{" "}
                {formatTemplate(
                  labels.ttlLeft,
                  { min: expiresAt - state.clockMin },
                  locale,
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-ink-3">{labels.cacheEmpty}</p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          {labels.illustrative}
        </p>
      </DemoPanel>

      <DemoPanel title={labels.where}>
        <ul className="space-y-1.5 text-sm">
          {labels.roles.map((entry) => (
            <li key={entry.store}>
              <span className="font-semibold text-ink">{entry.store}</span>{" "}
              <span className="text-ink-2">— {entry.role}</span>
            </li>
          ))}
        </ul>
      </DemoPanel>
    </CaseStage>
  );
}
