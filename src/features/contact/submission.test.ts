import { describe, expect, it, vi } from "vitest";

import { KeyedRateLimiter } from "@/lib/rate-limit";

import { checkContactFields } from "./contact-schema";
import {
  handleContactSubmission,
  HONEYPOT_FIELD,
  MIN_FILL_MS,
  STARTED_AT_FIELD,
  TOPIC_FIELD,
  type SubmissionDeps,
} from "./submission";

const NOW = 1_000_000;

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const values = {
    name: "Anna",
    contact: "anna@example.com",
    message: "We need a payment service with webhooks and retries.",
    [TOPIC_FIELD]: "project",
    [HONEYPOT_FIELD]: "",
    [STARTED_AT_FIELD]: String(NOW - 10_000),
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function deps(overrides: Partial<SubmissionDeps> = {}): SubmissionDeps {
  return {
    now: NOW,
    sender: "203.0.113.7",
    limiter: new KeyedRateLimiter(3, 600_000),
    deliver: vi.fn(async () => undefined),
    reportError: vi.fn(),
    ...overrides,
  };
}

describe("contact fields", () => {
  it("accepts an email or a Telegram handle as the contact", () => {
    for (const contact of ["anna@example.com", "@anna_dev", "anna_dev"]) {
      const check = checkContactFields({
        name: "Anna",
        contact,
        message: "x".repeat(20),
      });
      expect(check.ok, contact).toBe(true);
    }
  });

  it("returns one error code per invalid field", () => {
    const check = checkContactFields({
      name: "  ",
      contact: "not a contact",
      message: "short",
    });
    expect(check).toEqual({
      ok: false,
      errors: {
        name: "nameRequired",
        contact: "contactInvalid",
        message: "messageShort",
      },
    });
  });
});

describe("handleContactSubmission", () => {
  it("delivers a valid message with the sender's details", async () => {
    const context = deps();
    expect(await handleContactSubmission(form(), context)).toEqual({
      status: "sent",
    });
    expect(context.deliver).toHaveBeenCalledWith(
      expect.stringContaining("Reply to: anna@example.com"),
    );
    expect(context.deliver).toHaveBeenCalledWith(
      expect.stringContaining("Topic: Project enquiry"),
    );
  });

  it("files a message with an unknown topic under Other", async () => {
    const context = deps();
    await handleContactSubmission(form({ [TOPIC_FIELD]: "<script>" }), context);
    expect(context.deliver).toHaveBeenCalledWith(
      expect.stringContaining("Topic: Other"),
    );
  });

  it("answers bots calmly and delivers nothing", async () => {
    for (const bot of [
      form({ [HONEYPOT_FIELD]: "https://spam.example" }),
      form({ [STARTED_AT_FIELD]: String(NOW - MIN_FILL_MS + 500) }),
      form({ [STARTED_AT_FIELD]: "not a time" }),
    ]) {
      const context = deps();
      expect(await handleContactSubmission(bot, context)).toEqual({
        status: "sent",
      });
      expect(context.deliver).not.toHaveBeenCalled();
    }
  });

  it("returns field errors and keeps what the visitor typed", async () => {
    const result = await handleContactSubmission(
      form({ message: "Hello" }),
      deps(),
    );
    expect(result).toMatchObject({
      status: "invalid",
      errors: { message: "messageShort" },
      values: { name: "Anna", message: "Hello" },
    });
  });

  it("limits how often one sender can write", async () => {
    const context = deps({ limiter: new KeyedRateLimiter(1, 600_000) });
    await handleContactSubmission(form(), context);
    expect(await handleContactSubmission(form(), context)).toMatchObject({
      status: "failed",
      reason: "rateLimited",
    });
  });

  it("reports a failed delivery instead of pretending it was sent", async () => {
    const context = deps({
      deliver: vi.fn(async () => {
        throw new Error("Telegram rejected the message: 401");
      }),
    });
    expect(await handleContactSubmission(form(), context)).toMatchObject({
      status: "failed",
      reason: "deliveryFailed",
    });
    expect(context.reportError).toHaveBeenCalled();

    const unconfigured = deps({ deliver: null });
    expect(await handleContactSubmission(form(), unconfigured)).toMatchObject({
      status: "failed",
      reason: "deliveryFailed",
    });
  });
});
