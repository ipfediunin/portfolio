"use client";

import type { AnchorHTMLAttributes } from "react";

import { trackEvent, type AnalyticsEvent } from "./analytics";

/**
 * An outgoing link (email, profile, scheduling, résumé) that counts a conversion event when used.
 * External links open in a new tab; the event carries only where the click happened.
 */
export function TrackedLink({
  event,
  placement,
  external = false,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  readonly href: string;
  readonly event: AnalyticsEvent;
  /** Where on the site the link sits, e.g. "contact" or "for-employers". */
  readonly placement: string;
  readonly external?: boolean;
}) {
  return (
    <a
      {...props}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      onClick={() => trackEvent(event, { placement })}
    />
  );
}
