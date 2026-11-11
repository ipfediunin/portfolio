import "server-only";

import { z } from "zod";

import type { TelegramConfig } from "./telegram";

const telegramEnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[\w-]{20,}$/),
  TELEGRAM_CHAT_ID: z.string().regex(/^-?\d+$|^@\w{5,}$/),
});

/**
 * Telegram delivery for the contact form, or null while it is not configured (the form is not
 * shown then). A half-filled or malformed configuration is reported instead of silently ignored.
 */
export function readTelegramConfig(): TelegramConfig | null {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN && !TELEGRAM_CHAT_ID) return null;
  const parsed = telegramEnvSchema.safeParse({
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  });
  if (!parsed.success) {
    console.error(
      "[contact] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are set but invalid; the form stays hidden.",
      parsed.error.issues.map((issue) => issue.path.join(".")),
    );
    return null;
  }
  return {
    botToken: parsed.data.TELEGRAM_BOT_TOKEN,
    chatId: parsed.data.TELEGRAM_CHAT_ID,
  };
}
