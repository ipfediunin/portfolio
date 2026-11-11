import type { KeyedRateLimiter } from "@/lib/rate-limit";

import {
  checkContactFields,
  parseContactTopic,
  type ContactFieldName,
  type ContactFields,
  type ContactState,
  type ContactTopic,
} from "./contact-schema";

/** Humans need at least this long to fill the form; faster submissions are bots. */
export const MIN_FILL_MS = 3000;
/** Name of the hidden field only bots fill in. */
export const HONEYPOT_FIELD = "website";
export const STARTED_AT_FIELD = "startedAt";
export const TOPIC_FIELD = "topic";

export interface SubmissionDeps {
  readonly now: number;
  /** Who is sending (client IP), for the rate limit. */
  readonly sender: string;
  readonly limiter: KeyedRateLimiter;
  /** Delivers the message; null when no channel is configured. */
  readonly deliver: ((text: string) => Promise<void>) | null;
  readonly reportError: (message: string, error: unknown) => void;
}

const field = (formData: FormData, name: string): string => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

const topicLabels: Readonly<Record<ContactTopic, string>> = {
  project: "Project enquiry",
  role: "Role / hiring",
  other: "Other",
};

export function formatMessage(
  fields: ContactFields,
  topic: ContactTopic,
): string {
  return [
    "New message from the website",
    `Topic: ${topicLabels[topic]}`,
    `Name: ${fields.name}`,
    `Reply to: ${fields.contact}`,
    "",
    fields.message,
  ].join("\n");
}

/**
 * The contact form's server logic, free of framework calls so it can be tested: spam filters,
 * validation, rate limit, delivery. Bots get a calm "sent" and nothing is delivered.
 */
export async function handleContactSubmission(
  formData: FormData,
  deps: SubmissionDeps,
): Promise<ContactState> {
  const values: Record<ContactFieldName, string> = {
    name: field(formData, "name"),
    contact: field(formData, "contact"),
    message: field(formData, "message"),
  };

  const startedAt = Number(field(formData, STARTED_AT_FIELD));
  const tooFast =
    !Number.isFinite(startedAt) || deps.now - startedAt < MIN_FILL_MS;
  if (field(formData, HONEYPOT_FIELD) !== "" || tooFast)
    return { status: "sent" };

  const check = checkContactFields(values);
  if (!check.ok) return { status: "invalid", errors: check.errors, values };

  if (!deps.limiter.take(deps.sender, deps.now))
    return { status: "failed", reason: "rateLimited", values };

  if (!deps.deliver) {
    deps.reportError(
      "[contact] No delivery channel is configured (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)",
      null,
    );
    return { status: "failed", reason: "deliveryFailed", values };
  }
  try {
    // A missing or unknown topic is not the visitor's mistake: the message still goes through.
    const topic = parseContactTopic(field(formData, TOPIC_FIELD)) ?? "other";
    await deps.deliver(formatMessage(check.value, topic));
    return { status: "sent" };
  } catch (error) {
    deps.reportError("[contact] Delivery failed", error);
    return { status: "failed", reason: "deliveryFailed", values };
  }
}
