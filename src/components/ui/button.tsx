import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "pill" | "ghost";
type ButtonSize = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow,filter] duration-200 ease-ui disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary:
    "rounded-xl bg-linear-to-r from-brand to-brand-2 text-white shadow-brand hover:brightness-110",
  secondary:
    "rounded-xl border border-line bg-surface text-ink hover:border-ink-3/50 hover:bg-white",
  pill: "rounded-full border border-ink/15 bg-surface/70 text-ink backdrop-blur hover:border-ink/40",
  ghost: "rounded-xl text-ink-2 hover:bg-ink/5 hover:text-ink",
};

const sizes: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

interface ButtonStyleProps {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly className?: string;
}

export function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: ButtonStyleProps): string {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ButtonStyleProps &
  Omit<ComponentProps<"button">, "className">;

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, className })}
      {...props}
    />
  );
}

type ButtonLinkProps = ButtonStyleProps & {
  readonly href: string;
  readonly children: ReactNode;
  /** Opens in a new tab with a plain anchor instead of client-side navigation. */
  readonly external?: boolean;
  readonly download?: boolean;
};

export function ButtonLink({
  href,
  children,
  external = false,
  download = false,
  variant,
  size,
  className,
}: ButtonLinkProps) {
  const classes = buttonClassName({ variant, size, className });

  if (external || download) {
    return (
      <a
        href={href}
        className={classes}
        download={download || undefined}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
