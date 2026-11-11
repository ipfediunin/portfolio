/**
 * A booking form, end to end. The browser and the server validate the input with the same rules;
 * the server then applies the business rule (a slot can be booked once) and stores the booking in
 * a transaction. The browser's idea of free slots may be stale — the server is the source of truth.
 */

export interface BookingInput {
  readonly name: string;
  readonly email: string;
  readonly slot: string;
}

export const bookingFields = ["name", "email", "slot"] as const;
export type BookingField = (typeof bookingFields)[number];
export type BookingError = "nameRequired" | "emailInvalid" | "slotRequired";
export type BookingErrors = Readonly<
  Partial<Record<BookingField, BookingError>>
>;

export const slots = [
  "10:00",
  "11:00",
  "12:00",
  "14:00",
  "15:00",
  "16:00",
] as const;

export interface Booking {
  readonly id: number;
  readonly name: string;
  readonly slot: string;
}

export interface BookingState {
  /** Slots taken on the server, including by other people the browser does not know about. */
  readonly taken: ReadonlySet<string>;
  readonly bookings: readonly Booking[];
}

export const initialBookingState = (): BookingState => ({
  taken: new Set(["11:00", "15:00"]),
  bookings: [],
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The rules both sides apply: the browser for instant feedback, the server because it must. */
export function validateBooking(input: BookingInput): BookingErrors {
  const errors: Partial<Record<BookingField, BookingError>> = {};
  if (input.name.trim().length === 0) errors.name = "nameRequired";
  if (!EMAIL.test(input.email.trim())) errors.email = "emailInvalid";
  if (!slots.some((slot) => slot === input.slot)) errors.slot = "slotRequired";
  return errors;
}

export const hasErrors = (errors: BookingErrors) =>
  Object.keys(errors).length > 0;

export type BookingOutcome =
  | {
      readonly status: 422;
      readonly errors: BookingErrors;
      readonly state: BookingState;
    }
  | { readonly status: 409; readonly state: BookingState }
  | {
      readonly status: 201;
      readonly booking: Booking;
      readonly state: BookingState;
    };

/** The server's handling of POST /bookings: validate, check the rule, insert in a transaction. */
export function submitBooking(
  state: BookingState,
  input: BookingInput,
): BookingOutcome {
  const errors = validateBooking(input);
  if (hasErrors(errors)) return { status: 422, errors, state };
  if (state.taken.has(input.slot)) return { status: 409, state };
  const booking = {
    id: state.bookings.length + 1,
    name: input.name.trim(),
    slot: input.slot,
  };
  return {
    status: 201,
    booking,
    state: {
      taken: new Set([...state.taken, input.slot]),
      bookings: [...state.bookings, booking],
    },
  };
}
