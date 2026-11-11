import Link from "next/link";

import { ArrowRightIcon } from "@/components/ui/icons";
import { hirePage } from "@/content/hire";
import { caseNumber, type CaseStudy } from "@/content/projects";
import type { Service } from "@/content/services";
import type { Locale } from "@/i18n/config";
import { localizePath } from "@/i18n/paths";

interface ServiceCardProps {
  readonly service: Service;
  /** The service's case studies that are visible on this build. */
  readonly cases: readonly CaseStudy[];
  readonly locale: Locale;
}

/** One service on /hire: the client's problem, the outcome, technologies and proof (case studies). */
export function ServiceCard({ service, cases, locale }: ServiceCardProps) {
  return (
    <article
      aria-labelledby={`service-${service.slug}`}
      className="flex h-full flex-col rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8"
    >
      <h3
        id={`service-${service.slug}`}
        className="scroll-mt-28 text-2xl font-bold tracking-[-0.02em] text-ink"
      >
        {service.title}
      </h3>
      <p className="mt-2 text-ink-2">{service.summary}</p>

      <dl className="mt-6 space-y-4">
        <div>
          <dt className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">
            {hirePage.problem}
          </dt>
          <dd className="mt-1 text-ink-2">{service.problem}</dd>
        </div>
        <div>
          <dt className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">
            {hirePage.outcome}
          </dt>
          <dd className="mt-1 text-ink-2">{service.outcome}</dd>
        </div>
      </dl>

      <p className="mt-5 font-mono text-[13px] text-ink-3">
        {service.technologies.join(" · ")}
      </p>

      {cases.length > 0 ? (
        <div className="mt-6">
          <p className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">
            {hirePage.relatedCases}
          </p>
          <ul className="mt-2 space-y-1">
            {cases.map((project) => (
              <li key={project.slug}>
                <Link
                  href={localizePath(locale, `/projects/${project.slug}`)}
                  className="inline-flex min-h-9 items-center gap-2 font-semibold text-ink transition-colors hover:text-brand"
                >
                  <span className="font-mono text-xs text-ink-3">
                    {caseNumber(project)}
                  </span>
                  {project.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {service.landing ? (
        <Link
          href={localizePath(locale, `/services/${service.slug}`)}
          className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-brand"
        >
          {hirePage.more} {service.title}
          <ArrowRightIcon className="size-4" />
        </Link>
      ) : null}
    </article>
  );
}
