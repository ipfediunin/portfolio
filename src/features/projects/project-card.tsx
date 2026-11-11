import Image from "next/image";
import Link from "next/link";

import { ArrowRightIcon } from "@/components/ui/icons";
import { caseNumber, casePosterPath, type CaseStudy } from "@/content/projects";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localizePath } from "@/i18n/paths";

interface ProjectCardProps {
  readonly project: CaseStudy;
  readonly locale: Locale;
  readonly copy: Dictionary["projects"];
  /** h2 in the case list; h3 where the cards sit under a section heading. */
  readonly headingLevel?: "h2" | "h3";
  /** The first card of the case list is above the fold: its still frame is the page's LCP. */
  readonly eager?: boolean;
}

/** A case study in the list: its world as a still thumbnail, what it is and what it used. */
export function ProjectCard({
  project,
  locale,
  copy,
  headingLevel: Heading = "h2",
  eager = false,
}: ProjectCardProps) {
  return (
    <Link
      href={localizePath(locale, `/projects/${project.slug}`)}
      className="group grid h-full overflow-hidden rounded-3xl border border-line bg-surface shadow-card transition-[border-color,transform] duration-300 ease-ui hover:-translate-y-0.5 hover:border-brand/30 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
    >
      {/* The still frame is decorative here: the link is named by the title and the text. */}
      <div
        aria-hidden="true"
        className="relative aspect-[16/10] overflow-hidden bg-bg md:aspect-auto md:min-h-64"
      >
        <Image
          src={casePosterPath(project.slug)}
          alt=""
          fill
          sizes="(min-width: 1280px) 560px, (min-width: 768px) 45vw, 100vw"
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          className="object-cover transition-transform duration-500 ease-ui group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-col p-6 sm:p-8">
        <p className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">
          {copy.caseEyebrow} {caseNumber(project)} · {project.direction}
          {project.published ? null : (
            <span className="ml-2 rounded bg-status-retry/15 px-1.5 py-0.5 text-status-retry normal-case">
              draft
            </span>
          )}
        </p>
        <Heading className="mt-3 text-2xl font-bold tracking-[-0.02em] text-ink">
          {project.title}
        </Heading>
        <p className="mt-1 font-semibold text-ink-2">
          {project.subtitle[locale]}
        </p>
        <p className="mt-3 text-ink-2">{project.summary[locale]}</p>
        <p className="mt-5 font-mono text-[13px] text-ink-3">
          {project.stack.join(" · ")}
        </p>
        <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-brand">
          {copy.open}
          <ArrowRightIcon className="size-4 transition-transform duration-300 ease-ui group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
