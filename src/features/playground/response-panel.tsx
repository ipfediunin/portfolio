"use client";

import { cn } from "@/lib/cn";

import { statusTone } from "./controls";
import { usePlayground, type PlaygroundCopy } from "./use-playground";

export function ResponsePanel({ copy }: { readonly copy: PlaygroundCopy }) {
  const response = usePlayground((state) => state.response);
  const activeRunId = usePlayground((state) => state.activeRunId);
  const runs = usePlayground((state) => state.runs);
  const live = usePlayground((state) => state.activeRunLive);

  return (
    <section
      aria-label={copy.response}
      className="rounded-2xl border border-line bg-surface p-4 sm:p-5"
    >
      <h3 className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">
        {copy.response}
      </h3>

      {!activeRunId ? (
        <p className="mt-4 text-sm text-ink-3">{copy.responseEmpty}</p>
      ) : null}
      {activeRunId && !response ? (
        <p className="mt-4 animate-pulse text-sm text-ink-2" role="status">
          {copy.waiting}
        </p>
      ) : null}

      {response ? (
        <div className="mt-4" role="status">
          <p className="flex flex-wrap items-center gap-3">
            <span
              className={cn(
                "rounded-lg border px-2.5 py-1 font-mono text-sm font-bold",
                statusTone(response.status),
              )}
            >
              {response.status} {response.statusText}
            </span>
            <span className="font-mono text-sm text-ink-2">
              {copy.latency}: {response.latencyMs} ms
            </span>
            {live ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-status-success/30 bg-status-success/10 px-2 py-0.5 font-mono text-[11px] font-bold tracking-[0.12em] text-status-success uppercase">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-status-success"
                />
                {copy.live.badge}
              </span>
            ) : null}
          </p>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer font-medium text-ink-2">
              {copy.headers}
            </summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-ink-2">
              {Object.entries(response.headers).map(([name, value]) => (
                <div key={name} className="contents">
                  <dt className="text-ink-3">{name}</dt>
                  <dd className="break-all">{value}</dd>
                </div>
              ))}
            </dl>
          </details>
          <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-bg p-3 font-mono text-[12px] leading-relaxed text-ink">
            {JSON.stringify(response.body, null, 2)}
          </pre>
        </div>
      ) : null}

      {runs.length > 1 ? (
        <div className="mt-4">
          <p className="text-xs font-medium text-ink-3">{copy.runs}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {runs.map((run) => (
              <li
                key={run.runId}
                className={cn(
                  "rounded-md border px-2 py-0.5 font-mono text-[11px]",
                  statusTone(run.status),
                )}
              >
                {run.status ?? "…"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
