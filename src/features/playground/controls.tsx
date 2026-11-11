"use client";

import { cn } from "@/lib/cn";

interface SwitchProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

export function Switch({ label, checked, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 items-center justify-between gap-4 rounded-xl text-left text-sm font-medium text-ink"
    >
      {label}
      <span
        aria-hidden="true"
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-brand" : "bg-ink-3/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ease-ui",
            checked && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}

interface SegmentedProps<T extends string | number> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
}

/** A single-choice group of buttons (radio semantics), keyboard-accessible by tab + space/enter. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-xl border border-line bg-bg p-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-9 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors duration-200",
              selected
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-3 hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** HTTP status → semantic color for pills and chips. */
export function statusTone(status: number | null): string {
  if (status === null) return "border-line bg-bg text-ink-3";
  if (status < 300)
    return "border-status-success/30 bg-status-success/10 text-status-success";
  if (status < 400)
    return "border-status-processing/30 bg-status-processing/10 text-status-processing";
  if (status === 429)
    return "border-status-retry/30 bg-status-retry/10 text-status-retry";
  return "border-status-failed/30 bg-status-failed/10 text-status-failed";
}
