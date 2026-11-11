/**
 * Conversion events for privacy-friendly analytics (Plausible). Page visits — employer page, client
 * page, services, case studies — are counted as page views and need no events. Nothing personal
 * is sent: no form contents, no contact details, only the event name and a short category.
 */
export type AnalyticsEvent =
  | "Contact click"
  | "Contact form sent"
  | "Resume download"
  | "Scheduling click";

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { readonly props?: Readonly<Record<string, string>> },
    ) => void;
  }
}

/** A no-op until the analytics script is configured and loaded. */
export function trackEvent(
  event: AnalyticsEvent,
  props?: Readonly<Record<string, string>>,
): void {
  window.plausible?.(event, props ? { props } : undefined);
}
