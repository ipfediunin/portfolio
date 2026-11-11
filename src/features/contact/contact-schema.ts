import { z } from "zod";

/** Error codes, not texts: the form shows them in the visitor's language. */
export const contactErrorCodes = [
  "nameRequired",
  "nameLong",
  "contactInvalid",
  "messageShort",
  "messageLong",
] as const;
export type ContactErrorCode = (typeof contactErrorCodes)[number];

export const contactFieldNames = ["name", "contact", "message"] as const;
export type ContactFieldName = (typeof contactFieldNames)[number];

/** What the message is about; it tells a project enquiry from a role enquiry at a glance. */
export const contactTopics = ["project", "role", "other"] as const;
export type ContactTopic = (typeof contactTopics)[number];

const contactTopicSchema = z.enum(contactTopics);

/** A known topic, or null: the value comes from a form field or a URL parameter. */
export function parseContactTopic(value: unknown): ContactTopic | null {
  const result = contactTopicSchema.safeParse(value);
  return result.success ? result.data : null;
}

const telegramHandle = /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

/** Shared by the browser (instant hints) and the Server Action (the real check). */
export const contactFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "nameRequired" satisfies ContactErrorCode)
    .max(100, "nameLong" satisfies ContactErrorCode),
  contact: z
    .string()
    .trim()
    .refine(
      (value) =>
        z.email().safeParse(value).success || telegramHandle.test(value),
      "contactInvalid" satisfies ContactErrorCode,
    ),
  message: z
    .string()
    .trim()
    .min(20, "messageShort" satisfies ContactErrorCode)
    .max(4000, "messageLong" satisfies ContactErrorCode),
});

export type ContactFields = z.infer<typeof contactFieldsSchema>;

export type ContactFieldErrors = Partial<
  Record<ContactFieldName, ContactErrorCode>
>;

/** Validates the fields; returns either the clean values or one error code per field. */
export function checkContactFields(
  input: Record<ContactFieldName, unknown>,
):
  | { readonly ok: true; readonly value: ContactFields }
  | { readonly ok: false; readonly errors: ContactFieldErrors } {
  const result = contactFieldsSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  const errors: ContactFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    const code = contactErrorCodes.find((known) => known === issue.message);
    if (isContactField(field) && code && !errors[field]) errors[field] = code;
  }
  return { ok: false, errors };
}

function isContactField(value: unknown): value is ContactFieldName {
  return contactFieldNames.some((name) => name === value);
}

/** What the form shows after a submission. */
export type ContactState =
  | { readonly status: "idle" }
  | {
      readonly status: "invalid";
      readonly errors: ContactFieldErrors;
      readonly values: Readonly<Record<ContactFieldName, string>>;
    }
  | { readonly status: "sent" }
  | {
      readonly status: "failed";
      readonly reason: "rateLimited" | "deliveryFailed";
      readonly values: Readonly<Record<ContactFieldName, string>>;
    };
