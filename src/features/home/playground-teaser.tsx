import { Fragment } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { ArrowRightIcon } from "@/components/ui/icons";
import { SectionHeading } from "@/components/ui/typography";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localizePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";

/** The request path the playground animates, in the same colors as the scene's data flows. */
const pipeline = [
  { label: "client", flow: "sync" },
  { label: "gateway", flow: "sync" },
  { label: "api", flow: "sync" },
  { label: "queue", flow: "async" },
  { label: "worker", flow: "async" },
  { label: "postgres", flow: "async" },
] as const;

interface PlaygroundTeaserProps {
  readonly locale: Locale;
  readonly content: Dictionary["home"]["playground"];
}

export function PlaygroundTeaser({ locale, content }: PlaygroundTeaserProps) {
  return (
    <section className="py-20 lg:py-28">
      <Container>
        <div className="grid items-center gap-10 rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-10 lg:grid-cols-2 lg:p-14">
          <div>
            <SectionHeading
              eyebrow={content.eyebrow}
              title={content.title}
              lead={content.lead}
            />
            <ButtonLink
              href={localizePath(locale, "/architecture")}
              size="lg"
              className="mt-8"
            >
              {content.cta}
              <ArrowRightIcon className="size-5" />
            </ButtonLink>
          </div>

          <div
            aria-hidden="true"
            className="flex flex-wrap items-center gap-2 rounded-2xl bg-bg p-5 font-mono text-[13px] sm:p-8"
          >
            {pipeline.map((step, index) => (
              <Fragment key={step.label}>
                {index > 0 ? (
                  <span
                    className={cn(
                      "h-0.5 w-5 rounded-full",
                      step.flow === "sync" ? "bg-flow-sync" : "bg-flow-async",
                    )}
                  />
                ) : null}
                <span
                  className={cn(
                    "rounded-lg border bg-surface px-3 py-2 text-ink",
                    step.flow === "sync"
                      ? "border-flow-sync/40"
                      : "border-flow-async/40",
                  )}
                >
                  {step.label}
                </span>
              </Fragment>
            ))}
            <span className="mt-3 w-full text-ink-3">
              <span className="text-status-success">202 Accepted</span> ·
              task_id=7f3a…
            </span>
          </div>
        </div>
      </Container>
    </section>
  );
}
