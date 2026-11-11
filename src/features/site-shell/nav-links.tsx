"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { ChevronDownIcon } from "@/components/ui/icons";
import { isActivePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";

import type { NavigationEntry, NavigationGroup } from "./navigation";

interface NavLinksProps {
  readonly items: readonly NavigationEntry[];
  readonly orientation?: "horizontal" | "vertical";
  readonly onNavigate?: () => void;
}

const linkClass = (orientation: "horizontal" | "vertical", active: boolean) =>
  cn(
    "relative flex items-center rounded-lg font-medium transition-colors duration-200",
    orientation === "horizontal"
      ? "h-10 px-3.5 text-[15px]"
      : "h-12 px-3 text-lg",
    active ? "text-ink" : "text-ink-2 hover:text-ink",
  );

const ActiveBar = () => (
  <span
    aria-hidden="true"
    className="absolute inset-x-3.5 -bottom-0.5 h-0.5 rounded-full bg-linear-to-r from-brand to-brand-2"
  />
);

export function NavLinks({
  items,
  orientation = "horizontal",
  onNavigate,
}: NavLinksProps) {
  const pathname = usePathname();

  return (
    <ul
      className={cn(
        "flex",
        orientation === "horizontal" ? "items-center gap-1" : "flex-col gap-1",
      )}
    >
      {items.map((item) => {
        if (item.kind === "group") {
          return orientation === "horizontal" ? (
            <li key={item.label}>
              <MenuGroup group={item} pathname={pathname} />
            </li>
          ) : (
            <li key={item.label}>
              <p className="px-3 pt-3 pb-1 font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">
                {item.label}
              </p>
              <ul className="flex flex-col gap-1">
                {item.items.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={
                        isActivePath(pathname, link.href) ? "page" : undefined
                      }
                      onClick={onNavigate}
                      className={linkClass(
                        "vertical",
                        isActivePath(pathname, link.href),
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        }
        const active = isActivePath(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={linkClass(orientation, active)}
            >
              {item.label}
              {active && orientation === "horizontal" ? <ActiveBar /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A disclosure menu: the button toggles a short list of links. Escape and a click outside close
 * it (Escape returns focus to the button); following a link closes it too.
 */
function MenuGroup({
  group,
  pathname,
}: {
  readonly group: NavigationGroup;
  readonly pathname: string;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // The menu belongs to the page it was opened on, so a navigation closes it.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const active = group.items.some((item) => isActivePath(pathname, item.href));

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenedOn(null);
      buttonRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      )
        setOpenedOn(null);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpenedOn(open ? null : pathname)}
        className={cn(linkClass("horizontal", active), "gap-1")}
      >
        {group.label}
        <ChevronDownIcon
          className={cn(
            "size-4 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
        {active ? <ActiveBar /> : null}
      </button>
      <ul
        id={menuId}
        hidden={!open}
        className="absolute top-full left-0 mt-2 w-72 rounded-2xl border border-line bg-surface p-2 shadow-card"
      >
        {group.items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={
                isActivePath(pathname, item.href) ? "page" : undefined
              }
              onClick={() => setOpenedOn(null)}
              className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-bg focus-visible:bg-bg"
            >
              <span className="block text-sm font-semibold text-ink">
                {item.label}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">
                {item.hint}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
