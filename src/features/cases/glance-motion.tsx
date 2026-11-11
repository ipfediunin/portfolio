"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import { formatNumber, type FormattedNumber } from "./impact-format";

/** Set on a `Reveal` root: "armed" hides its parts until it scrolls into view, then "shown". */
const REVEAL_ATTRIBUTE = "data-reveal";
const COUNT_MS = 1100;

/**
 * Animate only what the visitor has not seen yet, and only with motion allowed: the server renders
 * everything in its final state, so without JavaScript, with reduced motion or for a block already
 * on screen when the page came alive, nothing is hidden and nothing jumps.
 */
function belowTheFold(element: Element): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return false;
  return element.getBoundingClientRect().top > window.innerHeight * 0.9;
}

function onceVisible(element: Element, callback: () => void): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      callback();
    },
    { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
  );
  observer.observe(element);
  return () => observer.disconnect();
}

/**
 * Plays its children in when they scroll into view. Children style the hidden state with
 * `group-data-[reveal=armed]/reveal:` and keep their own transitions and delays.
 */
export function Reveal({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !belowTheFold(element)) return;
    element.setAttribute(REVEAL_ATTRIBUTE, "armed");
    const stop = onceVisible(element, () =>
      element.setAttribute(REVEAL_ATTRIBUTE, "shown"),
    );
    return () => {
      stop();
      element.removeAttribute(REVEAL_ATTRIBUTE);
    };
  }, []);
  return (
    <div ref={ref} className={cn("group/reveal", className)}>
      {children}
    </div>
  );
}

const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3;

/**
 * A number that counts up from zero when it scrolls into view. The digits are drawn straight into
 * the DOM on animation frames (no React state per frame); screen readers get the final value.
 */
export function CountUp({
  number,
  className,
}: {
  readonly number: FormattedNumber;
  readonly className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const { value, decimals, prefix, suffix } = number;
  const text = formatNumber(number);

  useEffect(() => {
    const element = ref.current;
    if (!element || !belowTheFold(element)) return;
    const draw = (current: number) => {
      element.textContent = formatNumber({
        value: current,
        decimals,
        prefix,
        suffix,
      });
    };
    let frame = 0;
    draw(0);
    const stop = onceVisible(element, () => {
      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / COUNT_MS);
        draw(value * easeOutCubic(progress));
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    });
    return () => {
      stop();
      cancelAnimationFrame(frame);
      draw(value);
    };
  }, [value, decimals, prefix, suffix]);

  return (
    <span className={className}>
      <span ref={ref} aria-hidden="true">
        {text}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
