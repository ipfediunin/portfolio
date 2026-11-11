import Link from "next/link";

import { ArrowRightIcon } from "@/components/ui/icons";
import { stackAreas } from "@/content/stack";
import type { Locale } from "@/i18n/config";
import { localizePath } from "@/i18n/paths";

interface StackAreaCardsProps {
  readonly locale: Locale;
  readonly moreLabel: string;
}

/** One card per stack area: tagline, lead and the first technologies as a preview. */
export function StackAreaCards({ locale, moreLabel }: StackAreaCardsProps) {
  return (
    <ul className="grid gap-5 md:grid-cols-3">
      {stackAreas.map((area) => (
        <li key={area.id}>
          <Link
            href={localizePath(locale, `/expertise/${area.id}`)}
            className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-6 shadow-card transition-[border-color,transform] duration-300 ease-ui hover:-translate-y-0.5 hover:border-brand/30"
          >
            <p className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">
              {area.tagline[locale]}
            </p>
            <h3 className="mt-3 text-2xl font-bold tracking-[-0.02em] text-ink">
              {area.title[locale]}
            </h3>
            <p className="mt-3 text-ink-2">{area.lead[locale]}</p>
            <p className="mt-5 font-mono text-[13px] text-ink-3">
              {area.technologies
                .slice(0, 5)
                .map((technology) => technology.name)
                .join(" · ")}
            </p>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-brand">
              {moreLabel}
              <ArrowRightIcon className="size-4 transition-transform duration-300 ease-ui group-hover:translate-x-0.5" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
