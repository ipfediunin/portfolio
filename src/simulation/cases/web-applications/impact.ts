import type { ImpactMeasure } from "../impact";
import {
  hasErrors,
  initialBookingState,
  submitBooking,
  validateBooking,
  type BookingInput,
} from "./model";

/** Synthetic attempts at the booking form: an empty field, a typo, a taken slot, good ones. */
export const sampleAttempts: readonly BookingInput[] = [
  { name: "", email: "anna@example.com", slot: "10:00" },
  { name: "Anna", email: "anna@example", slot: "10:00" },
  { name: "Anna", email: "anna@example.com", slot: "" },
  { name: "Anna", email: "anna@example.com", slot: "11:00" },
  { name: "Anna", email: "anna@example.com", slot: "10:00" },
  { name: "Ben", email: "ben@example.com", slot: "14:00" },
];

/**
 * Attempts that make a server round trip only to come back as invalid (422). Without checks in the
 * browser every attempt is sent; with the shared rules only valid ones are, and the server still
 * decides what the browser cannot know, such as a slot taken by someone else (409).
 */
export function measureWebApplicationsImpact(): {
  readonly wastedRequests: ImpactMeasure;
} {
  const wasted = (checkInBrowser: boolean) => {
    let state = initialBookingState();
    let invalid = 0;
    for (const attempt of sampleAttempts) {
      if (checkInBrowser && hasErrors(validateBooking(attempt))) continue;
      const outcome = submitBooking(state, attempt);
      if (outcome.status === 422) invalid += 1;
      state = outcome.state;
    }
    return (invalid / sampleAttempts.length) * 100;
  };
  return {
    wastedRequests: {
      id: "wasted-requests",
      unit: "percent",
      better: "lower",
      bars: [
        { id: "server-only", value: wasted(false) },
        { id: "both-sides", value: wasted(true) },
      ],
    },
  };
}
