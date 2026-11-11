import { z } from "zod";

/**
 * Request bodies the demo API accepts, mirroring the Pydantic models of the FastAPI service. The
 * order body is the live Orders API's `OrderIn` (backend/services/orders-api): same fields, same
 * messages — and, like it, nothing personal.
 */
export const payloadSchemas = {
  order: z.object({
    product_id: z
      .string()
      .min(1, "String should have at least 1 character")
      .max(32, "String should have at most 32 characters")
      .regex(/^[a-z0-9-]+$/, "String should match pattern '^[a-z0-9-]+$'"),
    quantity: z
      .number()
      .int("Input should be a valid integer")
      .min(1, "Input should be greater than or equal to 1")
      .max(10, "Input should be less than or equal to 10"),
    delivery: z.enum(
      ["standard", "express"],
      "Input should be 'standard' or 'express'",
    ),
  }),
  report: z.object({
    period: z
      .string()
      .regex(
        /^\d{4}-(0[1-9]|1[0-2])$/,
        "String should match pattern '^YYYY-MM$'",
      ),
  }),
  webhook: z.object({
    id: z
      .string()
      .regex(
        /^evt_[a-z0-9]{3,24}$/,
        "String should match pattern '^evt_[a-z0-9]+$'",
      ),
    type: z.enum(
      ["payment.succeeded", "payment.failed"],
      "Input should be 'payment.succeeded' or 'payment.failed'",
    ),
    data: z.object({
      order_id: z.number().int().positive("Input should be greater than 0"),
    }),
  }),
  import: z.object({
    rows: z
      .number()
      .int("Input should be a valid integer")
      .min(1, "Input should be greater than or equal to 1")
      .max(12, "Input should be less than or equal to 12"),
  }),
  payment: z.object({
    order_id: z.number().int().positive("Input should be greater than 0"),
    amount: z.number().positive("Input should be greater than 0"),
    currency: z.enum(
      ["EUR", "USD", "RUB"],
      "Input should be 'EUR', 'USD' or 'RUB'",
    ),
  }),
} as const;

export type PayloadSchemaId = keyof typeof payloadSchemas;

/** FastAPI's 422 error item. */
export interface ValidationErrorDetail {
  readonly loc: readonly (string | number)[];
  readonly msg: string;
  readonly type: string;
}

export type PayloadCheck =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly detail: readonly ValidationErrorDetail[] };

/** Parses and validates a raw JSON body the way FastAPI would, returning its 422 error format on failure. */
export function checkPayload(
  schemaId: PayloadSchemaId,
  rawBody: string | null,
): PayloadCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody ?? "");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    return {
      ok: false,
      detail: [
        {
          loc: ["body"],
          msg: `JSON decode error: ${message}`,
          type: "json_invalid",
        },
      ],
    };
  }

  const result = payloadSchemas[schemaId].safeParse(parsed);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    detail: result.error.issues.map((issue) => {
      const path = issue.path.map((part) =>
        typeof part === "symbol" ? String(part) : part,
      );
      const missing =
        issue.code === "invalid_type" && valueAt(parsed, path) === undefined;
      return missing
        ? { loc: ["body", ...path], msg: "Field required", type: "missing" }
        : {
            loc: ["body", ...path],
            msg: issue.message,
            type: pydanticType(issue),
          };
    }),
  };
}

/** Pydantic's error type for a Zod issue, so simulated 422s read like the live service's. */
function pydanticType(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "too_small":
      return issue.origin === "string"
        ? "string_too_short"
        : "greater_than_equal";
    case "too_big":
      return issue.origin === "string" ? "string_too_long" : "less_than_equal";
    case "invalid_value":
      return "literal_error";
    case "invalid_format":
      return issue.format === "regex" ? "string_pattern_mismatch" : issue.code;
    default:
      return issue.code;
  }
}

function valueAt(value: unknown, path: readonly (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}
