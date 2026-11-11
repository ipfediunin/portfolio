import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/typography";
import {
  chaosReport,
  loadReport,
  type BenchEnvironment,
  type LoadRun,
} from "@/content/reports";
import { getDictionary, getLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/paths";
import { pageMetadata } from "@/lib/metadata";
import { cn } from "@/lib/cn";

const DESCRIPTION =
  "Load and chaos runs of the live backend behind the system playground: latencies under load, queued work end to end, and what happens when a worker, Kafka, RabbitMQ or Redis goes down.";

/** How many containers the table lists, busiest first. */
const BUSIEST = 6;

export async function generateMetadata(): Promise<Metadata> {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  return pageMetadata({
    locale,
    dictionary,
    path: "/architecture/report",
    title: dictionary.report.title,
    description: DESCRIPTION,
  });
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Milliseconds as measured: whole numbers stay whole, fractions keep one decimal. */
function ms(value: number): string {
  return Number.isInteger(value) || value >= 10
    ? value.toFixed(0)
    : value.toFixed(1);
}

function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(values[key] ?? `{${key}}`),
  );
}

function Table({
  head,
  rows,
  caption,
}: {
  readonly head: readonly string[];
  readonly rows: readonly (readonly ReactNode[])[];
  readonly caption: string;
}) {
  return (
    // Wide tables scroll inside their box on a phone; the page itself never scrolls sideways.
    <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line text-ink-3">
          <tr>
            {head.map((cell, index) => (
              <th
                key={cell}
                scope="col"
                className={cn(
                  "px-4 py-3 font-medium",
                  index > 0 && "text-right",
                )}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) =>
                index === 0 ? (
                  <th
                    key={index}
                    scope="row"
                    className="px-4 py-2.5 font-medium text-ink"
                  >
                    {cell}
                  </th>
                ) : (
                  <td
                    key={index}
                    className="px-4 py-2.5 text-right font-mono text-ink-2 tabular-nums"
                  >
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ReportCopy = Awaited<ReturnType<typeof getDictionary>>["report"];

function LoadLevel({
  run,
  copy,
  limits,
}: {
  readonly run: LoadRun;
  readonly copy: ReportCopy["load"];
  readonly limits: BenchEnvironment["limits"];
}) {
  const busiest = [...run.containers]
    .sort((a, b) => b.cpu_peak_pct - a.cpu_peak_pct)
    .slice(0, BUSIEST);
  const limitOf = (service: string) =>
    limits.find((item) => item.service === service);
  return (
    <section aria-labelledby={`load-${run.users}`} className="mt-10 first:mt-6">
      <h3
        id={`load-${run.users}`}
        className="text-xl font-bold tracking-[-0.02em] text-ink"
      >
        {fill(copy.run, { users: run.users })}
      </h3>
      <p className="mt-2 font-mono text-sm text-ink-2">
        {fill(copy.summary, {
          rps: run.rps,
          p95: ms(run.p95),
          failures: run.failures,
          requests: run.requests,
        })}
      </p>
      <Table
        caption={fill(copy.run, { users: run.users })}
        head={[
          copy.columns.request,
          copy.columns.rps,
          copy.columns.p50,
          copy.columns.p95,
          copy.columns.p99,
          copy.columns.failures,
        ]}
        rows={run.endpoints.map((endpoint) => [
          <span key="name">
            <code className="font-mono text-ink">{endpoint.name}</code>
            <span className="block text-xs font-normal text-ink-3">
              {copy.groups[endpoint.group]}
            </span>
          </span>,
          endpoint.rps,
          ms(endpoint.p50),
          ms(endpoint.p95),
          ms(endpoint.p99),
          endpoint.failures,
        ])}
      />
      {run.background.length > 0 ? (
        <>
          <h4 className="mt-6 font-semibold text-ink">
            {copy.background.title}
          </h4>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            {copy.background.lead}
          </p>
          <Table
            caption={copy.background.title}
            head={[
              copy.columns.request,
              copy.background.count,
              copy.columns.p50,
              copy.columns.p95,
              copy.columns.p99,
              copy.columns.failures,
            ]}
            rows={run.background.map((item) => [
              item.name,
              item.count,
              ms(item.p50),
              ms(item.p95),
              ms(item.p99),
              item.failures,
            ])}
          />
        </>
      ) : null}
      <h4 className="mt-6 font-semibold text-ink">{copy.containers.title}</h4>
      <Table
        caption={copy.containers.title}
        head={[
          copy.containers.service,
          copy.containers.cpu,
          copy.containers.memory,
        ]}
        rows={busiest.map((container) => {
          const limit = limitOf(container.service);
          // docker stats gives percent of one core: shown in cores, next to the limit.
          const cores = (container.cpu_peak_pct / 100).toFixed(2);
          return [
            container.service,
            limit?.cpus
              ? `${cores} ${fill(copy.containers.ofLimit, { limit: `${limit.cpus} CPU` })}`
              : `${cores} CPU`,
            `${container.memory_peak_mb} MB${
              limit?.memory_mb
                ? ` ${fill(copy.containers.ofLimit, { limit: `${limit.memory_mb} MB` })}`
                : ""
            }`,
          ];
        })}
      />
    </section>
  );
}

export default async function ReportPage() {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  const copy = dictionary.report;
  const { environment } = loadReport;

  return (
    <Container className="py-14 lg:py-20">
      <SectionHeading
        as="h1"
        eyebrow={copy.eyebrow}
        title={copy.title}
        lead={copy.lead}
      />
      <p className="mt-6 max-w-3xl border-l-2 border-brand pl-4 text-sm leading-relaxed text-ink-2">
        {copy.caveat}
      </p>
      <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
        <Link
          href={localizePath(locale, "/architecture")}
          className="text-brand underline-offset-4 hover:underline"
        >
          {copy.links.playground}
        </Link>
      </p>

      <section aria-labelledby="report-load" className="mt-14">
        <h2
          id="report-load"
          className="text-2xl font-bold tracking-[-0.02em] text-ink"
        >
          {copy.load.title}
        </h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-ink-2">
          {copy.load.lead}{" "}
          {fill(copy.measuredOn, { date: day(loadReport.measured_at) })}
        </p>
        {loadReport.runs.map((run) => (
          <LoadLevel
            key={run.users}
            run={run}
            copy={copy.load}
            limits={environment.limits}
          />
        ))}
      </section>

      <section aria-labelledby="report-chaos" className="mt-16">
        <h2
          id="report-chaos"
          className="text-2xl font-bold tracking-[-0.02em] text-ink"
        >
          {copy.chaos.title}
        </h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-ink-2">
          {copy.chaos.lead}{" "}
          {fill(copy.measuredOn, { date: day(chaosReport.measured_at) })}
        </p>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {chaosReport.experiments.map((experiment) => {
            const finding = copy.chaos.findings[experiment.id];
            return (
              <article
                key={experiment.id}
                aria-labelledby={`chaos-${experiment.id}`}
                className="rounded-2xl border border-line bg-surface p-5"
              >
                <h3
                  id={`chaos-${experiment.id}`}
                  className="text-lg font-bold text-ink"
                >
                  {experiment.title}
                </h3>
                <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-ink">
                  {/* The text says it; the colour only repeats it (contrast stays with the ink). */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2.5 rounded-full",
                      experiment.passed
                        ? "bg-status-success"
                        : "bg-status-failed",
                    )}
                  />
                  {experiment.passed ? copy.chaos.held : copy.chaos.failed}
                </p>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="font-medium text-ink-3">
                      {copy.chaos.fault}
                    </dt>
                    <dd className="mt-0.5 text-ink-2">{experiment.fault}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink-3">
                      {copy.chaos.hypothesis}
                    </dt>
                    <dd className="mt-0.5 text-ink-2">
                      {experiment.hypothesis}
                    </dd>
                  </div>
                </dl>
                <h4 className="mt-4 text-sm font-medium text-ink-3">
                  {copy.chaos.observed}
                </h4>
                <ul className="mt-1 space-y-1 text-sm">
                  {experiment.observations.map((observation) => (
                    <li key={observation.label} className="text-ink-2">
                      <span className="text-ink">{observation.label}:</span>{" "}
                      <span className="font-mono">{observation.value}</span>
                    </li>
                  ))}
                </ul>
                {finding ? (
                  <p className="mt-4 rounded-xl bg-bg p-3 text-sm leading-relaxed text-ink-2">
                    <span className="font-semibold text-ink">
                      {copy.chaos.finding}.
                    </span>{" "}
                    {finding}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="report-environment" className="mt-16">
        <h2
          id="report-environment"
          className="text-2xl font-bold tracking-[-0.02em] text-ink"
        >
          {copy.environment.title}
        </h2>
        <dl className="mt-4 grid max-w-3xl gap-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="font-medium text-ink-3">{copy.environment.machine}</dt>
          <dd className="text-ink-2">
            {environment.machine.cpu},{" "}
            {fill(copy.environment.cpus, {
              count: environment.machine.logical_cpus,
            })}
            ,{" "}
            {fill(copy.environment.memory, {
              gb: environment.machine.memory_gb,
            })}
            , {environment.machine.os}
          </dd>
          <dt className="font-medium text-ink-3">{copy.environment.docker}</dt>
          <dd className="text-ink-2">
            {environment.docker.engine},{" "}
            {fill(copy.environment.cpus, { count: environment.docker.cpus })},{" "}
            {fill(copy.environment.memory, {
              gb: environment.docker.memory_gb,
            })}
          </dd>
          <dt className="font-medium text-ink-3">
            {copy.environment.generator}
          </dt>
          <dd className="text-ink-2">{environment.load_generator}</dd>
        </dl>
        <h3 className="mt-8 font-semibold text-ink">
          {copy.environment.limits}
        </h3>
        <Table
          caption={copy.environment.limits}
          head={[
            copy.environment.service,
            copy.environment.replicas,
            copy.environment.cpu,
            copy.environment.memoryLimit,
          ]}
          rows={environment.limits.map((limit) => [
            limit.service,
            limit.replicas,
            limit.cpus ?? copy.environment.unlimited,
            limit.memory_mb
              ? `${limit.memory_mb} MB`
              : copy.environment.unlimited,
          ])}
        />
      </section>

      <section aria-labelledby="report-method" className="mt-16 max-w-3xl">
        <h2
          id="report-method"
          className="text-2xl font-bold tracking-[-0.02em] text-ink"
        >
          {copy.method.title}
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-ink-2 marker:text-brand">
          {copy.method.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h3 className="mt-8 font-semibold text-ink">{copy.method.weights}</h3>
        <ul className="mt-2 space-y-1 text-sm text-ink-2">
          {Object.entries(loadReport.profile.weights).map(([name, weight]) => (
            <li key={name}>
              <code className="font-mono text-ink">{name}</code> × {weight}
            </li>
          ))}
        </ul>
        <h3 className="mt-8 font-semibold text-ink">{copy.method.reproduce}</h3>
        <pre className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface p-4 font-mono text-sm text-ink">
          {[
            "cd backend",
            "docker compose up -d --build",
            "uv run --group load python scripts/run_load.py",
            "uv run python scripts/run_chaos.py",
          ].join("\n")}
        </pre>
      </section>
    </Container>
  );
}
