"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { trackEvent } from "@/features/analytics/analytics";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { cn } from "@/lib/cn";

import { sendContactMessage } from "./actions";
import {
  checkContactFields,
  contactTopics,
  parseContactTopic,
  type ContactFieldErrors,
  type ContactFieldName,
  type ContactState,
  type ContactTopic,
} from "./contact-schema";
import { HONEYPOT_FIELD, STARTED_AT_FIELD, TOPIC_FIELD } from "./submission";

type FormCopy = Dictionary["contact"]["form"];

const empty: Record<ContactFieldName, string> = {
  name: "",
  contact: "",
  message: "",
};

const inputClassName =
  "w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-base text-ink outline-none transition-colors focus-visible:border-brand aria-invalid:border-status-failed/60";

interface ContactFormProps {
  readonly copy: FormCopy;
}

const noSubscription = () => () => undefined;

/**
 * The topic a link asked for (/contact?topic=role). The page is static, so the parameter is read in
 * the browser; on the server and during hydration there is none.
 */
function useTopicFromUrl(): ContactTopic | null {
  const search = useSyncExternalStore(
    noSubscription,
    () => window.location.search,
    () => "",
  );
  return parseContactTopic(new URLSearchParams(search).get("topic"));
}

/**
 * Contact form backed by a Server Action. Fields are checked in the browser with the same schema
 * as on the server (no round trip for typos); the server checks everything again. "Write another"
 * mounts a fresh form, so the action state starts over.
 */
export function ContactForm(props: ContactFormProps) {
  const [round, setRound] = useState(0);
  return (
    <ContactFormRound
      key={round}
      {...props}
      onWriteAnother={() => setRound((current) => current + 1)}
    />
  );
}

function ContactFormRound({
  copy,
  onWriteAnother,
}: ContactFormProps & { readonly onWriteAnother: () => void }) {
  const [state, formAction, pending] = useActionState<ContactState, FormData>(
    sendContactMessage,
    { status: "idle" },
  );
  const [values, setValues] = useState(empty);
  const urlTopic = useTopicFromUrl();
  const [chosenTopic, setChosenTopic] = useState<ContactTopic | null>(null);
  const topic = chosenTopic ?? urlTopic ?? "project";
  const [clientErrors, setClientErrors] = useState<ContactFieldErrors>({});
  const startedAtRef = useRef<HTMLInputElement>(null);
  const ids = { name: useId(), contact: useId(), message: useId() };

  // Set once after mount, not during render (the server's and the browser's clocks would disagree)
  // and not after every answer (a quick retry after a failure is a person, not a bot).
  useEffect(() => {
    if (startedAtRef.current) startedAtRef.current.value = String(Date.now());
  }, []);

  // Counts a delivered message by topic only: nothing the visitor typed goes to analytics.
  const sent = state.status === "sent";
  const sentTopicRef = useRef(topic);
  useEffect(() => {
    if (sent) trackEvent("Contact form sent", { topic: sentTopicRef.current });
  }, [sent]);

  const serverErrors = state.status === "invalid" ? state.errors : {};
  const errors: ContactFieldErrors = { ...serverErrors, ...clientErrors };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const check = checkContactFields(values);
    if (!check.ok) {
      event.preventDefault();
      setClientErrors(check.errors);
      return;
    }
    sentTopicRef.current = topic;
  }

  function update(name: ContactFieldName, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setClientErrors((current) => ({ ...current, [name]: undefined }));
  }

  if (state.status === "sent") {
    return (
      <div
        role="status"
        className="rounded-2xl border border-status-success/30 bg-status-success/5 p-6"
      >
        <p className="font-semibold text-ink">{copy.sent}</p>
        <button
          type="button"
          onClick={onWriteAnother}
          className="mt-3 text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline"
        >
          {copy.sendAnother}
        </button>
      </div>
    );
  }

  const field = (
    name: ContactFieldName,
    label: string,
    control: (props: {
      id: string;
      "aria-invalid": boolean;
      "aria-describedby": string | undefined;
    }) => ReactNode,
    hint?: string,
  ) => {
    const error = errors[name];
    const hintId = `${ids[name]}-hint`;
    return (
      <div>
        <label
          htmlFor={ids[name]}
          className="mb-2 block text-sm font-medium text-ink"
        >
          {label}
        </label>
        {control({
          id: ids[name],
          "aria-invalid": error !== undefined,
          "aria-describedby": error || hint ? hintId : undefined,
        })}
        {error || hint ? (
          <p
            id={hintId}
            className={cn(
              "mt-1.5 text-sm",
              error ? "text-status-failed" : "text-ink-3",
            )}
          >
            {error ? copy.errors[error] : hint}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      noValidate
      className="space-y-5"
    >
      <input ref={startedAtRef} type="hidden" name={STARTED_AT_FIELD} />
      {/* Off screen and out of the tab order: only bots fill it in. */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] h-px w-px overflow-hidden"
      >
        <label>
          {copy.honeypot}
          <input
            type="text"
            name={HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-ink">
          {copy.topic}
        </legend>
        <div className="flex flex-wrap gap-2">
          {contactTopics.map((option) => (
            <label
              key={option}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-bg px-4 text-sm font-medium text-ink-2 transition-colors has-checked:border-brand/50 has-checked:bg-brand/5 has-checked:text-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand"
            >
              <input
                type="radio"
                name={TOPIC_FIELD}
                value={option}
                checked={topic === option}
                onChange={() => setChosenTopic(option)}
                className="size-4 accent-brand outline-none"
              />
              {copy.topics[option]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        {field("name", copy.name, (props) => (
          <input
            {...props}
            name="name"
            autoComplete="name"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            className={inputClassName}
          />
        ))}
        {field(
          "contact",
          copy.contact,
          (props) => (
            <input
              {...props}
              name="contact"
              autoComplete="email"
              value={values.contact}
              onChange={(event) => update("contact", event.target.value)}
              className={inputClassName}
            />
          ),
          copy.contactHint,
        )}
      </div>
      {field(
        "message",
        copy.message,
        (props) => (
          <textarea
            {...props}
            name="message"
            rows={6}
            value={values.message}
            onChange={(event) => update("message", event.target.value)}
            className={cn(inputClassName, "resize-y leading-relaxed")}
          />
        ),
        copy.messageHint,
      )}

      {state.status === "failed" ? (
        <p role="alert" className="text-sm font-medium text-status-failed">
          {copy.errors[state.reason]}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? copy.sending : copy.submit}
      </Button>
    </form>
  );
}
