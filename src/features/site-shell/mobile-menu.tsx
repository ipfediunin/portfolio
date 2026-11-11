"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { CloseIcon, MenuIcon } from "@/components/ui/icons";

import { NavLinks } from "./nav-links";
import type { NavigationEntry } from "./navigation";

interface MobileMenuProps {
  readonly items: readonly NavigationEntry[];
  readonly navigationLabel: string;
  readonly openLabel: string;
  readonly closeLabel: string;
  /** The call to action rendered under the links. */
  readonly footer: ReactNode;
}

export function MobileMenu({
  items,
  navigationLabel,
  openLabel,
  closeLabel,
  footer,
}: MobileMenuProps) {
  const pathname = usePathname();
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  // The menu belongs to the page it was opened on, so any navigation closes it without an effect.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenedOn(null);
      toggleRef.current?.focus();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? closeLabel : openLabel}
        onClick={() => setOpenedOn(open ? null : pathname)}
        className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface text-ink transition-colors hover:border-ink-3/50"
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-line bg-surface shadow-card"
      >
        <nav
          aria-label={navigationLabel}
          className="mx-auto max-w-7xl px-4 pt-3 pb-6 sm:px-6"
        >
          <NavLinks
            items={items}
            orientation="vertical"
            onNavigate={() => setOpenedOn(null)}
          />
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
            {footer}
          </div>
        </nav>
      </div>
    </div>
  );
}
