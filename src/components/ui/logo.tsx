import { cn } from "@/lib/cn";

interface LogoProps {
  readonly name: string;
  readonly tagline?: string;
  readonly className?: string;
}

/** Isometric cube mark + wordmark. The mark mirrors the building faces used in the scene. */
export function Logo({ name, tagline, className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 32 32"
        className="size-8 shrink-0"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M16 3 28 10 16 17 4 10Z"
          fill="var(--color-building-top)"
          stroke="var(--color-line)"
        />
        <path d="M4 10 16 17v12L4 22Z" fill="var(--color-building-left)" />
        <path d="M28 10 16 17v12l12-7Z" fill="var(--color-building-right)" />
        <path
          d="M9 15.5 13 18M9 19l4 2.5"
          stroke="var(--color-glass)"
          strokeWidth="1.6"
        />
        <circle cx="16" cy="10" r="2.2" fill="var(--color-flow-sync)" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="text-[17px] font-bold tracking-[-0.02em] text-ink">
          {name}
        </span>
        {tagline ? (
          <span className="mt-1 font-mono text-[10px] tracking-[0.16em] text-ink-3 uppercase">
            {tagline}
          </span>
        ) : null}
      </span>
    </span>
  );
}
