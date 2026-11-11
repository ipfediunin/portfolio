import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

/** A titled panel of a case demo: under the scene on phones, in the glass panel over it on desktops. */
export function DemoPanel({
  title,
  children,
  className,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "rounded-2xl border border-line bg-surface p-4 sm:p-5 lg:bg-surface/85",
        className,
      )}
    >
      <h3 className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">
        {title}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function DemoButton({
  tone = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly tone?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "min-h-10 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        tone === "primary"
          ? "bg-brand text-white hover:bg-brand/90"
          : "border border-line bg-bg text-ink hover:border-ink-3/50",
        className,
      )}
    />
  );
}

/** A label and a value on one line (metrics of a run). */
export function DemoValue({
  label,
  value,
  tone = "neutral",
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2 text-sm last:border-b-0">
      <span className="text-ink-2">{label}</span>
      <span
        className={cn(
          "text-right font-mono font-semibold",
          tone === "good" && "text-status-success",
          tone === "warn" && "text-status-retry",
          tone === "bad" && "text-status-failed",
          tone === "neutral" && "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}
