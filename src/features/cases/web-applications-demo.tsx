"use client";

import { useId, useState } from "react";
import { useStore } from "zustand";

import type { WebApplicationsDemoContent } from "@/content/cases/web-applications";
import { Switch } from "@/features/playground/controls";
import { cn } from "@/lib/cn";
import {
  compileClientRejection,
  compileSubmission,
  type WebApplicationsCaption,
} from "@/simulation/cases/web-applications/compile";
import {
  hasErrors,
  initialBookingState,
  slots,
  submitBooking,
  validateBooking,
  type BookingErrors,
  type BookingOutcome,
  type BookingState,
} from "@/simulation/cases/web-applications/model";

import { CaseStage, useCaseDemo, type CaseStageInput } from "./case-stage";
import { DemoButton, DemoPanel } from "./demo-ui";
import { formatTemplate } from "./format";

const inputClassName =
  "min-h-10 w-full rounded-xl border border-line bg-bg px-3.5 text-sm text-ink outline-none focus-visible:border-brand aria-invalid:border-status-failed/60";

type Result =
  | { readonly kind: "client" }
  | { readonly kind: "server"; readonly outcome: BookingOutcome };

/** Case 06: one form, the whole path — browser, Next.js, backend, business rule, database, back. */
export function WebApplicationsDemo({
  input,
  content,
}: {
  readonly input: CaseStageInput;
  readonly content: WebApplicationsDemoContent;
}) {
  const demo = useCaseDemo<WebApplicationsCaption>();
  const running = useStore(demo.controller.store, (state) => state.running);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [slot, setSlot] = useState("");
  const [clientChecks, setClientChecks] = useState(true);
  const [errors, setErrors] = useState<BookingErrors>({});
  const [server, setServer] = useState<BookingState>(initialBookingState);
  const [result, setResult] = useState<Result | null>(null);
  const ids = { name: useId(), email: useId() };
  const { labels } = content;
  const { locale } = input;
  const settled = result !== null && !running;
  const booked = new Set(server.bookings.map((booking) => booking.slot));

  function submit() {
    const form = { name, email, slot };
    const local = validateBooking(form);
    if (clientChecks && hasErrors(local)) {
      setErrors(local);
      setResult({ kind: "client" });
      demo.play((next) =>
        compileClientRejection(Object.keys(local).length, next),
      );
      return;
    }
    const outcome = submitBooking(server, form);
    setErrors(outcome.status === 422 ? outcome.errors : {});
    setServer(outcome.state);
    setResult({ kind: "server", outcome });
    demo.play((next) => compileSubmission(outcome, next));
  }

  const fieldError = (field: keyof BookingErrors) => {
    const error = errors[field];
    return error ? content.errors[error] : null;
  };

  return (
    <CaseStage
      demo={demo}
      input={input}
      captions={content.captions}
      idleCaption={content.idle}
      entry={{
        kind: "action",
        nodeId: "wa.browser",
        actionLabel: labels.submit,
        onAction: submit,
      }}
    >
      <DemoPanel title={labels.form}>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          {(["name", "email"] as const).map((field) => (
            <div key={field}>
              <label
                htmlFor={ids[field]}
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                {content.fields[field]}
              </label>
              <input
                id={ids[field]}
                type={field === "email" ? "email" : "text"}
                value={field === "name" ? name : email}
                placeholder={
                  field === "name"
                    ? labels.namePlaceholder
                    : labels.emailPlaceholder
                }
                aria-invalid={errors[field] !== undefined}
                aria-describedby={
                  errors[field] ? `${ids[field]}-error` : undefined
                }
                onChange={(event) =>
                  (field === "name" ? setName : setEmail)(event.target.value)
                }
                className={inputClassName}
              />
              {fieldError(field) ? (
                <p
                  id={`${ids[field]}-error`}
                  className="mt-1 text-xs text-status-failed"
                >
                  {fieldError(field)}
                </p>
              ) : null}
            </div>
          ))}
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">
              {content.fields.slot}
            </legend>
            <div className="flex flex-wrap gap-2">
              {slots.map((option) => (
                <label
                  key={option}
                  className={cn(
                    "flex min-h-9 cursor-pointer items-center rounded-full border px-3 font-mono text-xs transition-colors has-[:focus-visible]:border-brand",
                    slot === option
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-line bg-bg text-ink-2",
                    booked.has(option) && "line-through opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="slot"
                    value={option}
                    checked={slot === option}
                    onChange={() => setSlot(option)}
                    className="sr-only"
                  />
                  {option}
                </label>
              ))}
            </div>
            {fieldError("slot") ? (
              <p className="mt-1 text-xs text-status-failed">
                {fieldError("slot")}
              </p>
            ) : null}
          </fieldset>
          <Switch
            label={labels.clientChecks}
            checked={clientChecks}
            onChange={setClientChecks}
          />
          <DemoButton type="submit" tone="primary">
            {labels.submit}
          </DemoButton>
        </form>
      </DemoPanel>

      <DemoPanel title={labels.response}>
        {settled ? (
          result.kind === "client" ? (
            <p className="text-sm text-status-retry">{labels.notSent}</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p
                className={cn(
                  "font-mono font-semibold",
                  result.outcome.status === 201
                    ? "text-status-success"
                    : "text-status-failed",
                )}
              >
                {result.outcome.status}{" "}
                {result.outcome.status === 201
                  ? "Created"
                  : result.outcome.status === 409
                    ? "Conflict"
                    : "Unprocessable Entity"}
              </p>
              <p className="text-ink-2">
                {result.outcome.status === 201
                  ? formatTemplate(
                      labels.created,
                      { slot: result.outcome.booking.slot },
                      locale,
                    )
                  : result.outcome.status === 409
                    ? labels.conflict
                    : Object.values(result.outcome.errors)
                        .map((error) => content.errors[error])
                        .join(" · ")}
              </p>
            </div>
          )
        ) : (
          <p className="text-sm text-ink-3">{labels.responseEmpty}</p>
        )}
      </DemoPanel>

      <DemoPanel title={labels.server}>
        {server.bookings.length > 0 ? (
          <ul className="space-y-1 font-mono text-xs text-ink-2">
            {server.bookings.map((booking) => (
              <li key={booking.id}>
                #{booking.id} · {booking.slot} · {booking.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">{labels.serverEmpty}</p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-3">{labels.hint}</p>
      </DemoPanel>
    </CaseStage>
  );
}
