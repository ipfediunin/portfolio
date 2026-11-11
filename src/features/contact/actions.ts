"use server";

import { headers } from "next/headers";

import { KeyedRateLimiter } from "@/lib/rate-limit";
import { readTelegramConfig } from "@/lib/server-env";
import { sendTelegramMessage } from "@/lib/telegram";

import type { ContactState } from "./contact-schema";
import { handleContactSubmission } from "./submission";

/** Five messages per sender per ten minutes is plenty for a person and useless for a flood. */
const limiter = new KeyedRateLimiter(5, 10 * 60_000);

export async function sendContactMessage(
  _previous: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const requestHeaders = await headers();
  const sender =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    "unknown";
  const telegram = readTelegramConfig();

  return handleContactSubmission(formData, {
    now: Date.now(),
    sender,
    limiter,
    deliver: telegram ? (text) => sendTelegramMessage(telegram, text) : null,
    reportError: (message, error) => console.error(message, error),
  });
}
