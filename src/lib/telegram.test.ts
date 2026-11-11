import { describe, expect, it, vi } from "vitest";

import { sendTelegramMessage } from "./telegram";

const config = { botToken: "123:abc", chatId: "42" };

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("sendTelegramMessage", () => {
  it("posts plain text to the bot's chat", async () => {
    const fetchImpl = respond(200, { ok: true });
    await sendTelegramMessage(config, "<b>hi</b>", fetchImpl);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: "42",
      text: "<b>hi</b>",
      disable_web_page_preview: true,
    });
  });

  it("throws with Telegram's reason when the message is rejected", async () => {
    await expect(
      sendTelegramMessage(
        config,
        "hi",
        respond(401, { ok: false, description: "Unauthorized" }),
      ),
    ).rejects.toThrow("401 Unauthorized");
  });

  it("cuts texts to Telegram's limit", async () => {
    const fetchImpl = respond(200, { ok: true });
    await sendTelegramMessage(config, "x".repeat(5000), fetchImpl);
    const body = JSON.parse(
      String(vi.mocked(fetchImpl).mock.calls[0]![1]?.body),
    ) as { text: string };
    expect(body.text).toHaveLength(4096);
  });
});
