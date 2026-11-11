"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import type { ScientificDataDemoContent } from "@/content/cases/scientific-data";
import { Segmented } from "@/features/playground/controls";
import { cn } from "@/lib/cn";
import {
  compilePipeline,
  type ScientificDataCaption,
} from "@/simulation/cases/scientific-data/compile";
import {
  cleanSamples,
  datasetIds,
  datasets,
  errorAgainstTruth,
  grid,
  interpolate,
  interpolationMethods,
  leaveOneOutError,
  sampleDataset,
  type DatasetId,
  type InterpolationMethod,
  type Point,
} from "@/simulation/cases/scientific-data/model";

import { CaseStage, useCaseDemo, type CaseStageInput } from "./case-stage";
import { DemoButton, DemoPanel } from "./demo-ui";
import { formatTemplate } from "./format";

const WIDTH = 640;
const HEIGHT = 320;
const PAD = { left: 48, right: 16, top: 16, bottom: 20 };
const MIN_POINTS = 5;
const MAX_POINTS = 15;

/** Case 02: interpolation you can poke at; the scene runs the same data through the pipeline. */
export function ScientificDataDemo({
  input,
  content,
}: {
  readonly input: CaseStageInput;
  readonly content: ScientificDataDemoContent;
}) {
  const demo = useCaseDemo<ScientificDataCaption>();
  const [datasetId, setDatasetId] = useState<DatasetId>("runge");
  const [count, setCount] = useState(11);
  const [method, setMethod] = useState<InterpolationMethod>("lagrange");
  const [edits, setEdits] = useState<ReadonlyMap<number, number>>(new Map());
  const svgRef = useRef<SVGSVGElement>(null);
  const countId = useId();
  const clipId = useId();
  const { labels } = content;
  const { locale } = input;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });

  const dataset = datasets[datasetId];
  const raw = sampleDataset(datasetId, count);
  const cleaning = dataset.noisy
    ? cleanSamples(raw)
    : {
        points: raw.filter((sample): sample is Point => sample.y !== null),
        missing: 0,
        outliers: 0,
      };
  const removed = raw.filter(
    (sample): sample is Point =>
      sample.y !== null &&
      !cleaning.points.some((point) => point.x === sample.x),
  );
  const points = cleaning.points.map((point, index) => ({
    x: point.x,
    y: edits.get(index) ?? point.y,
  }));
  const edited = edits.size > 0;

  const comparison = interpolationMethods.map((candidate) => ({
    method: candidate,
    truth: edited ? null : errorAgainstTruth(candidate, points, dataset.truth),
    loo: leaveOneOutError(candidate, points),
  }));

  // The vertical scale follows the unedited data, so it stays still while a point is dragged.
  const xs = grid(points);
  const truthValues = xs.map(dataset.truth);
  const baseValues = [
    ...cleaning.points.map((point) => point.y),
    ...truthValues,
    ...removed.map((point) => point.y),
  ];
  const low = Math.min(...baseValues);
  const high = Math.max(...baseValues);
  const margin = (high - low) * 0.25 || 1;
  const yMin = low - margin;
  const yMax = high + margin;
  const [xMin, xMax] = [points[0]!.x, points.at(-1)!.x];
  const toX = (x: number) =>
    PAD.left + ((x - xMin) / (xMax - xMin)) * (WIDTH - PAD.left - PAD.right);
  const toY = (y: number) =>
    PAD.top + ((yMax - y) / (yMax - yMin)) * (HEIGHT - PAD.top - PAD.bottom);
  const path = (values: readonly number[]) =>
    values
      .map((value, index) => {
        const y = Math.max(-HEIGHT, Math.min(2 * HEIGHT, toY(value)));
        return `${index === 0 ? "M" : "L"}${toX(xs[index]!).toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  const curve = interpolate(method, points);

  function moveTo(index: number, y: number) {
    const clamped = Math.max(yMin, Math.min(yMax, y));
    setEdits((current) => new Map(current).set(index, clamped));
  }

  function dragPoint(index: number, event: PointerEvent<SVGCircleElement>) {
    const svg = svgRef.current;
    if (!svg || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = svg.getBoundingClientRect();
    const viewY = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    const value =
      yMax -
      ((viewY - PAD.top) / (HEIGHT - PAD.top - PAD.bottom)) * (yMax - yMin);
    moveTo(index, value);
  }

  function nudgePoint(index: number, event: KeyboardEvent<SVGCircleElement>) {
    const step = (yMax - yMin) / 40;
    const current = points[index]!.y;
    if (event.key === "ArrowUp") moveTo(index, current + step);
    else if (event.key === "ArrowDown") moveTo(index, current - step);
    else return;
    event.preventDefault();
  }

  function runPipeline() {
    const selected = comparison.find((row) => row.method === method);
    demo.play((next) =>
      compilePipeline(
        {
          rows: raw.length,
          missing: cleaning.missing,
          outliers: cleaning.outliers,
          points: points.length,
          method,
          maxError: selected?.truth?.max ?? null,
          looError: selected?.loo?.rmse ?? null,
        },
        next,
      ),
    );
  }

  return (
    <CaseStage
      demo={demo}
      input={input}
      captions={content.captions}
      idleCaption={content.idle}
      entry={{
        kind: "action",
        nodeId: "sd.data",
        actionLabel: labels.run,
        onAction: runPipeline,
      }}
    >
      <DemoPanel title={labels.controls}>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-ink">
              {labels.dataset}
            </p>
            <Segmented
              label={labels.dataset}
              value={datasetId}
              options={datasetIds.map((id) => ({
                value: id,
                label: content.datasets[id].name,
              }))}
              onChange={(id) => {
                setDatasetId(id);
                setEdits(new Map());
              }}
            />
            <p className="mt-2 text-xs leading-relaxed text-ink-3">
              {content.datasets[datasetId].hint}
            </p>
          </div>
          {dataset.readings ? (
            <p className="text-sm text-ink-2">
              {formatTemplate(
                labels.fixedReadings,
                { count: dataset.readings },
                locale,
              )}
            </p>
          ) : (
            <div>
              <label
                htmlFor={countId}
                className="mb-2 block text-sm font-medium text-ink"
              >
                {formatTemplate(labels.points, { count }, locale)}
              </label>
              <input
                id={countId}
                type="range"
                min={MIN_POINTS}
                max={MAX_POINTS}
                value={count}
                onChange={(event) => {
                  setCount(Number(event.target.value));
                  setEdits(new Map());
                }}
                className="w-full accent-brand"
              />
            </div>
          )}
          <div>
            <p className="mb-2 text-sm font-medium text-ink">{labels.method}</p>
            <Segmented
              label={labels.method}
              value={method}
              options={interpolationMethods.map((id) => ({
                value: id,
                label: content.methods[id],
              }))}
              onChange={setMethod}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <DemoButton tone="primary" onClick={runPipeline}>
              {labels.run}
            </DemoButton>
            <DemoButton disabled={!edited} onClick={() => setEdits(new Map())}>
              {labels.reset}
            </DemoButton>
          </div>
        </div>
      </DemoPanel>

      <DemoPanel title={labels.chart}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="group"
          aria-label={formatTemplate(
            labels.chartLabel,
            { method: content.methods[method] },
            locale,
          )}
          className="w-full touch-none select-none"
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={PAD.left}
                y={PAD.top}
                width={WIDTH - PAD.left - PAD.right}
                height={HEIGHT - PAD.top - PAD.bottom}
              />
            </clipPath>
          </defs>
          <rect
            x={PAD.left}
            y={PAD.top}
            width={WIDTH - PAD.left - PAD.right}
            height={HEIGHT - PAD.top - PAD.bottom}
            fill="var(--color-bg)"
            stroke="var(--color-line)"
          />
          {[yMin + margin, (yMin + yMax) / 2, yMax - margin].map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={toY(tick)}
                y2={toY(tick)}
                stroke="var(--color-line)"
                strokeDasharray="3 4"
              />
              <text
                x={PAD.left - 6}
                y={toY(tick) + 4}
                textAnchor="end"
                className="fill-ink-3 font-mono text-[10px]"
              >
                {number.format(Number(tick.toFixed(2)))}
              </text>
            </g>
          ))}
          <g clipPath={`url(#${clipId})`}>
            {edited ? null : (
              <path
                d={path(truthValues)}
                fill="none"
                stroke="var(--color-ink-3)"
                strokeWidth={1.5}
                strokeDasharray="5 5"
              />
            )}
            <path
              d={path(xs.map(curve))}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth={2.5}
            />
          </g>
          {removed.map((point) => (
            <g
              key={`removed-${point.x}`}
              transform={`translate(${toX(point.x)},${toY(point.y)})`}
              stroke="var(--color-status-failed)"
              strokeWidth={2}
            >
              <line x1={-5} y1={-5} x2={5} y2={5} />
              <line x1={-5} y1={5} x2={5} y2={-5} />
            </g>
          ))}
          {points.map((point, index) => (
            <circle
              key={point.x}
              cx={toX(point.x)}
              cy={toY(point.y)}
              r={7}
              tabIndex={0}
              role="slider"
              aria-orientation="vertical"
              aria-valuemin={Number(yMin.toFixed(3))}
              aria-valuemax={Number(yMax.toFixed(3))}
              aria-valuenow={Number(point.y.toFixed(3))}
              aria-label={formatTemplate(
                labels.point,
                {
                  index: index + 1,
                  x: Number(point.x.toFixed(2)),
                  y: Number(point.y.toFixed(2)),
                },
                locale,
              )}
              onPointerDown={(event) =>
                event.currentTarget.setPointerCapture(event.pointerId)
              }
              onPointerMove={(event) => dragPoint(index, event)}
              onKeyDown={(event) => nudgePoint(index, event)}
              className={cn(
                "cursor-ns-resize fill-surface stroke-[2.5] outline-none focus-visible:stroke-[4]",
                edits.has(index) ? "stroke-status-retry" : "stroke-ink",
              )}
            />
          ))}
        </svg>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
          {edited ? null : (
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-0 w-5 border-t-2 border-dashed border-ink-3"
              />
              {labels.truth}
            </li>
          )}
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-5 bg-brand" />
            {content.methods[method]}
          </li>
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full border-2 border-ink"
            />
            {labels.data}
          </li>
          {removed.length > 0 ? (
            <li className="flex items-center gap-2 text-status-failed">
              ✕ {labels.removed}
            </li>
          ) : null}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          {labels.editHint}
        </p>
        {dataset.noisy ? (
          <p className="mt-1 text-xs text-ink-3">
            {formatTemplate(
              labels.cleaned,
              { missing: cleaning.missing, outliers: cleaning.outliers },
              locale,
            )}
          </p>
        ) : null}
      </DemoPanel>

      <DemoPanel title={labels.compare}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th className="pb-2 font-medium" scope="col">
                {labels.method}
              </th>
              <th className="pb-2 text-right font-medium" scope="col">
                {labels.maxError}
              </th>
              <th className="pb-2 text-right font-medium" scope="col">
                {labels.loo}
              </th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((row) => {
              const best =
                !edited &&
                row.truth !== null &&
                comparison.every(
                  (other) => (other.truth?.max ?? Infinity) >= row.truth!.max,
                );
              return (
                <tr key={row.method} className="border-t border-line/70">
                  <th scope="row" className="py-2 text-left font-semibold">
                    <button
                      type="button"
                      aria-pressed={row.method === method}
                      onClick={() => setMethod(row.method)}
                      className={cn(
                        "rounded-md px-1.5 py-0.5 transition-colors",
                        row.method === method
                          ? "bg-brand/10 text-brand"
                          : "text-ink hover:text-brand",
                      )}
                    >
                      {content.methods[row.method]}
                    </button>
                  </th>
                  <td
                    className={cn(
                      "py-2 text-right font-mono",
                      best ? "text-status-success" : "text-ink-2",
                    )}
                  >
                    {row.truth
                      ? number.format(Number(row.truth.max.toPrecision(2)))
                      : "—"}
                  </td>
                  <td className="py-2 text-right font-mono text-ink-2">
                    {row.loo
                      ? number.format(Number(row.loo.rmse.toPrecision(2)))
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          {edited ? labels.edited : labels.synthetic}
        </p>
      </DemoPanel>
    </CaseStage>
  );
}
