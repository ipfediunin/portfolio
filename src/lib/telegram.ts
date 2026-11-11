import { z } from "zod";

export interface TelegramConfig {
  readonly botToken: string;
  readonly chatId: string;
}

const TIMEOUT_MS = 8000;
/** Telegram rejects longer texts. */
const MAX_TEXT_LENGTH = 4096;

const responseSchema = z.object({
  ok: z.boolean(),
  description: z.string().optional(),
});

/**
 * Sends a plain-text message through the Bot API. Plain text on purpose: whatever a visitor typed
 * is never interpreted as markup. Throws with context when Telegram does not accept it.
 */
export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(
    `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: text.slice(0, MAX_TEXT_LENGTH),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  const parsed = responseSchema.safeParse(
    await response.json().catch((error: unknown) => {
      throw new Error(`Telegram answered ${response.status} with no JSON`, {
        cause: error,
      });
    }),
  );
  if (!response.ok || !parsed.success || !parsed.data.ok) {
    const description = parsed.success ? parsed.data.description : undefined;
    throw new Error(
      `Telegram rejected the message: ${response.status} ${description ?? "unknown error"}`,
    );
  }
}
