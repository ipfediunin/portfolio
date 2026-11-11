"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

/**
 * The logo: a link home that, on the home page itself, scrolls back to the top instead of doing
 * nothing (a link to the current page does not move it).
 */
export function HomeLink({
  href,
  className,
  children,
}: {
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    // A new tab, a modifier click or a different page keeps the browser's default behaviour.
    if (
      pathname !== href ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
