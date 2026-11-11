import type { ComponentType } from "react";

import { Container } from "@/components/ui/container";
import {
  CalendarIcon,
  CodeIcon,
  ServerStackIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import type { Dictionary } from "@/i18n/dictionaries/en";

const factIcons: readonly ComponentType<{ className?: string }>[] = [
  ServerStackIcon,
  ShieldCheckIcon,
  CodeIcon,
  CalendarIcon,
];

export function FactsStrip({
  facts,
}: {
  readonly facts: Dictionary["home"]["facts"];
}) {
  return (
    <div className="border-y border-line bg-surface/60">
      <Container>
        <ul className="grid grid-cols-1 divide-line sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
          {facts.map((fact, index) => {
            const Icon = factIcons[index % factIcons.length] ?? ServerStackIcon;
            return (
              <li
                key={fact.title}
                className="flex items-center gap-4 py-6 lg:px-8 lg:first:pl-0 lg:last:pr-0"
              >
                <Icon className="size-8 shrink-0 text-ink-2" />
                <div>
                  <p className="font-mono text-xs font-semibold tracking-[0.12em] text-ink uppercase">
                    {fact.title}
                  </p>
                  <p className="mt-1 text-sm text-ink-3">{fact.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Container>
    </div>
  );
}
