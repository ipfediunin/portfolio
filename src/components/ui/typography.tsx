import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface EyebrowProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <p
      className={cn(
        "font-mono text-xs font-medium tracking-[0.14em] text-brand uppercase sm:text-[13px]",
        className,
      )}
    >
      {children}
    </p>
  );
}

interface SectionHeadingProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly lead?: string;
  /** Page-level headings render as h1, section headings as h2. */
  readonly as?: "h1" | "h2";
  /** Lets a surrounding section reference the heading with aria-labelledby. */
  readonly id?: string;
  readonly className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  as: Heading = "h2",
  id,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("max-w-3xl", className)}>
      {eyebrow ? <Eyebrow className="mb-4">{eyebrow}</Eyebrow> : null}
      <Heading
        id={id}
        className={cn(
          "font-bold tracking-[-0.025em] text-ink",
          Heading === "h1"
            ? "text-4xl leading-[1.08] sm:text-5xl lg:text-6xl"
            : "text-3xl leading-tight sm:text-4xl",
        )}
      >
        {title}
      </Heading>
      {lead ? (
        <p className="mt-5 text-lg leading-relaxed text-ink-2">{lead}</p>
      ) : null}
    </div>
  );
}
