import { describe, expect, it } from "vitest";

import { compileClientRejection, compileSubmission } from "./compile";
import {
  hasErrors,
  initialBookingState,
  submitBooking,
  validateBooking,
} from "./model";

const valid = { name: "Anna", email: "anna@example.com", slot: "12:00" };

describe("booking rules", () => {
  it("validates every field with the same rules on both sides", () => {
    expect(hasErrors(validateBooking(valid))).toBe(false);
    expect(validateBooking({ name: " ", email: "nope", slot: "" })).toEqual({
      name: "nameRequired",
      email: "emailInvalid",
      slot: "slotRequired",
    });
  });

  it("books a free slot once and refuses it the second time", () => {
    const first = submitBooking(initialBookingState(), valid);
    expect(first.status).toBe(201);
    const second = submitBooking(first.state, { ...valid, name: "Ivan" });
    expect(second.status).toBe(409);
    expect(second.state.bookings).toHaveLength(1);
  });

  it("refuses a slot someone else took, even if the browser shows it as free", () => {
    expect(
      submitBooking(initialBookingState(), { ...valid, slot: "11:00" }).status,
    ).toBe(409);
  });

  it("validates again on the server when the browser did not", () => {
    const outcome = submitBooking(initialBookingState(), {
      ...valid,
      email: "x",
    });
    expect(outcome.status).toBe(422);
  });
});

describe("booking runs", () => {
  it("compiles every outcome", () => {
    const state = initialBookingState();
    const keys = (run: ReturnType<typeof compileSubmission>) =>
      run.captions.map((caption) => caption.key).at(-1);
    const next = { startAt: 0, sequence: 1 };
    expect(keys(compileSubmission(submitBooking(state, valid), next))).toBe(
      "created",
    );
    expect(
      keys(
        compileSubmission(
          submitBooking(state, { ...valid, slot: "15:00" }),
          next,
        ),
      ),
    ).toBe("conflict");
    expect(
      keys(
        compileSubmission(submitBooking(state, { ...valid, email: "" }), next),
      ),
    ).toBe("serverInvalid");
    expect(
      compileClientRejection(2, next).run.events.some(
        (event) => event.type === "packet.hop",
      ),
    ).toBe(false);
  });
});
