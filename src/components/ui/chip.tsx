import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface ChipProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function Chip({ children, className }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink-2",
        className,
      )}
    >
      {children}
    </span>
  );
}
