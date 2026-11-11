import { ArrowRightIcon, CheckIcon, CloseIcon } from "@/components/ui/icons";
import type { CaseGlance, GlanceChart } from "@/content/schema";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { cn } from "@/lib/cn";

import { CountUp, Reveal } from "./glance-motion";
import {
  barShare,
  formatNumber,
  impactFigure,
  impactValue,
} from "./impact-format";

type GlanceCopy = Dictionary["projects"]["glance"];

const label =
  "font-mono text-[10.5px] font-semibold tracking-[0.14em] text-ink-3 uppercase";
/** While a `Reveal` is armed its parts wait hidden, without a transition, for the scroll. */
const waiting =
  "group-data-[reveal=armed]/reveal:opacity-0 group-data-[reveal=armed]/reveal:duration-0 group-data-[reveal=armed]/reveal:delay-0";
const rise = cn(
  "animate-rise-in transition-[opacity,translate] duration-500 ease-ui group-data-[reveal=armed]/reveal:translate-y-3",
  waiting,
);
/** A glass card on the world (desktops), a plain card in the page (phones). */
const card =
  "h-full rounded-2xl border border-line bg-surface p-4 lg:border-white/60 lg:bg-surface/80 lg:shadow-card lg:backdrop-blur-xl";
/**
 * One delay for both ways a part comes in: the load animation (what is on screen when the page
 * opens) and the scroll reveal (what the visitor scrolls to).
 */
const delay = (ms: number) => ({
  transitionDelay: `${ms}ms`,
  animationDelay: `${ms}ms`,
});

/**
 * The case in a glance, for anyone who will not read the full story: before and after in a few
 * words and what the approach changes in numbers (measured by the case's own model). On desktops
 * it is a strip of glass cards over the bottom of the world; the cards pop in one after another.
 */
export function CaseGlanceStrip({
  glance,
  copy,
}: {
  readonly glance: CaseGlance;
  readonly copy: GlanceCopy;
}) {
  return (
    <section
      aria-label={copy.title}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]"
    >
      <Reveal>
        <ChangeCard
          tone="before"
          title={copy.before}
          items={glance.before}
          ms={200}
        />
      </Reveal>
      <Reveal>
        <ChangeCard
          tone="after"
          title={copy.after}
          items={glance.after}
          ms={320}
        />
      </Reveal>
      {glance.charts.map((chart, index) => (
        <Reveal key={chart.measure.id}>
          <ImpactChart chart={chart} copy={copy} ms={440 + index * 120} />
        </Reveal>
      ))}
    </section>
  );
}

function ChangeCard({
  tone,
  title,
  items,
  ms,
}: {
  readonly tone: "before" | "after";
  readonly title: string;
  readonly items: readonly string[];
  readonly ms: number;
}) {
  const after = tone === "after";
  return (
    <div
      className={cn(
        card,
        "relative",
        after &&
          "border-brand/25 bg-[linear-gradient(160deg,rgb(79_70_229/0.09),var(--color-surface)_60%)] lg:border-brand/25 lg:bg-[linear-gradient(160deg,rgb(79_70_229/0.12),rgb(255_255_255/0.85)_60%)]",
        rise,
      )}
      style={delay(ms)}
    >
      {after ? (
        <span
          aria-hidden="true"
          className="absolute -top-[1.125rem] left-1/2 grid size-7 -translate-x-1/2 rotate-90 place-items-center rounded-full bg-brand text-white shadow-brand ring-4 ring-bg sm:top-1/2 sm:-left-[1.125rem] sm:translate-x-0 sm:-translate-y-1/2 sm:rotate-0 lg:ring-white/70"
        >
          <ArrowRightIcon className="size-3.5" strokeWidth={2.5} />
        </span>
      ) : null}
      <h3
        className={cn(
          "inline-flex h-6 items-center rounded-full px-2.5 font-mono text-[10.5px] font-semibold tracking-[0.14em] uppercase",
          after ? "bg-brand text-white" : "bg-ink/[0.06] text-ink-2",
        )}
      >
        {title}
      </h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[13px] leading-snug">
            <span
              aria-hidden="true"
              className={cn(
                "mt-px grid size-4 shrink-0 place-items-center rounded-full",
                after ? "bg-brand/10 text-brand" : "bg-ink/[0.06] text-ink-3",
              )}
            >
              {after ? (
                <CheckIcon className="size-3" strokeWidth={2.75} />
              ) : (
                <CloseIcon className="size-2.5" strokeWidth={2.75} />
              )}
            </span>
            <span className={after ? "font-medium text-ink" : "text-ink-2"}>
              {item}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One measure as horizontal bars: the approach without the idea in grey, the one the case uses in
 * the brand colour, every value printed, so the bars need no axis or tooltip.
 */
function ImpactChart({
  chart,
  copy,
  ms,
}: {
  readonly chart: GlanceChart;
  readonly copy: GlanceCopy;
  readonly ms: number;
}) {
  const { measure } = chart;
  const titleId = `glance-${measure.id}`;
  const last = measure.bars.length - 1;
  return (
    <figure
      aria-labelledby={titleId}
      className={cn(card, "flex flex-col", rise)}
      style={delay(ms)}
    >
      <h3 id={titleId} className={label}>
        {chart.title}
      </h3>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <CountUp
          number={impactFigure(measure, chart.figure, copy.timeUnits)}
          className="text-3xl leading-none font-bold tracking-[-0.03em] text-ink"
        />
        <span className="text-xs leading-snug font-medium text-ink-2">
          {chart.caption}
        </span>
      </p>
      <ul className="mt-3 space-y-2">
        {measure.bars.map((bar, index) => {
          const result = index === last;
          const share = barShare(bar.value, measure.bars);
          return (
            <li key={bar.id}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span
                  className={result ? "font-semibold text-ink" : "text-ink-2"}
                >
                  {chart.bars[bar.id]}
                </span>
                <span className="shrink-0 font-mono text-[11.5px] font-semibold text-ink tabular-nums">
                  {formatNumber(
                    impactValue(bar.value, measure.unit, copy.timeUnits),
                  )}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="mt-1 h-2.5 rounded-r-[4px] bg-ink/[0.05]"
              >
                {share > 0 ? (
                  <div
                    className={cn(
                      "h-full min-w-1 animate-bar-grow rounded-r-[4px] transition-[clip-path] duration-1000 ease-ui [clip-path:inset(0)]",
                      "group-data-[reveal=armed]/reveal:delay-0 group-data-[reveal=armed]/reveal:duration-0 group-data-[reveal=armed]/reveal:[clip-path:inset(0_100%_0_0)]",
                      result ? "bg-brand" : "bg-ink-3/35",
                    )}
                    style={{
                      width: `${share}%`,
                      ...delay(ms + 250 + index * 160),
                    }}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <figcaption className="mt-auto pt-2.5 text-[11px] leading-snug text-ink-3">
        {chart.method}
      </figcaption>
    </figure>
  );
}

/** What I did, as numbered steps (under the world on desktops, in the intro on phones). */
export function GlanceSteps({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  return (
    <div>
      <h2 className={label}>{title}</h2>
      <ol className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {items.map((item, index) => (
          <li
            key={item}
            className="flex items-start gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3"
          >
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/10 font-mono text-xs font-bold text-brand"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="pt-1 text-sm leading-snug font-semibold text-ink">
              {item}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
