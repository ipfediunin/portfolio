"use client";

import { useId, useState } from "react";
import { useStore } from "zustand";

import type { BotsIntegrationsDemoContent } from "@/content/cases/bots-integrations";
import { Switch } from "@/features/playground/controls";
import { cn } from "@/lib/cn";
import {
  compileTurn,
  type BotsCaption,
} from "@/simulation/cases/bots-integrations/compile";
import {
  handleMessage,
  idle,
  stateName,
  type ChatState,
} from "@/simulation/cases/bots-integrations/model";

import { CaseStage, useCaseDemo, type CaseStageInput } from "./case-stage";
import { DemoButton, DemoPanel, DemoValue } from "./demo-ui";
import { formatTemplate } from "./format";

const MAX_MESSAGES = 12;

interface ChatMessage {
  readonly id: number;
  readonly from: "user" | "bot";
  readonly text: string;
}

/** Case 08: a chat with the bot; the scene shows what each message touches behind it. */
export function BotsIntegrationsDemo({
  input,
  content,
}: {
  readonly input: CaseStageInput;
  readonly content: BotsIntegrationsDemoContent;
}) {
  const demo = useCaseDemo<BotsCaption>();
  const running = useStore(demo.controller.store, (state) => state.running);
  const [chat, setChat] = useState<ChatState>(idle);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [externalDown, setExternalDown] = useState(false);
  const [reports, setReports] = useState<readonly string[]>([]);
  const inputId = useId();
  const { labels } = content;
  const { locale } = input;

  function send(text: string) {
    const message = text.trim().slice(0, 200);
    if (!message) return;
    const turn = handleMessage(chat, message, { externalDown });
    const id = messages.at(-1)?.id ?? 0;
    setMessages(
      [
        ...messages,
        { id: id + 1, from: "user" as const, text: message },
        {
          id: id + 2,
          from: "bot" as const,
          text: formatTemplate(
            content.replies[turn.reply],
            turn.values,
            locale,
          ),
        },
      ].slice(-MAX_MESSAGES),
    );
    if (turn.reply === "reportSaved" && turn.values.date)
      setReports([...reports, turn.values.date]);
    setChat(turn.state);
    setDraft("");
    demo.play((next) => compileTurn(turn, chat, next));
  }

  const lastId = messages.at(-1)?.id;

  return (
    <CaseStage
      demo={demo}
      input={input}
      captions={content.captions}
      idleCaption={content.idle}
      entry={{
        kind: "text",
        nodeId: "bi.user",
        placeholder: labels.placeholder,
        submitLabel: labels.send,
        maxLength: 200,
        onSubmit: send,
      }}
    >
      <DemoPanel title={labels.chat}>
        <ol
          aria-live="polite"
          className="flex max-h-80 min-h-40 flex-col gap-2 overflow-y-auto rounded-xl bg-bg p-3"
        >
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                message.from === "user"
                  ? "self-end rounded-br-md bg-brand text-white"
                  : "self-start rounded-bl-md border border-line bg-surface text-ink",
              )}
            >
              <span className="sr-only">
                {message.from === "user" ? labels.you : labels.bot}:{" "}
              </span>
              {message.from === "bot" && running && message.id === lastId
                ? labels.typing
                : message.text}
            </li>
          ))}
        </ol>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
          className="mt-3 flex gap-2"
        >
          <label htmlFor={inputId} className="sr-only">
            {labels.placeholder}
          </label>
          <input
            id={inputId}
            value={draft}
            maxLength={200}
            placeholder={labels.placeholder}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-10 w-full min-w-0 rounded-xl border border-line bg-bg px-3.5 text-sm text-ink outline-none focus-visible:border-brand"
          />
          <DemoButton type="submit" tone="primary">
            {labels.send}
          </DemoButton>
        </form>
        <p className="mt-4 text-xs font-medium text-ink-3">{labels.quick}</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {content.quick.map((text) => (
            <li key={text}>
              <button
                type="button"
                onClick={() => send(text)}
                className="min-h-9 rounded-full border border-line bg-bg px-3 font-mono text-xs text-ink-2 transition-colors hover:border-brand/40 hover:text-ink"
              >
                {text}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <Switch
            label={labels.externalDown}
            checked={externalDown}
            onChange={setExternalDown}
          />
        </div>
      </DemoPanel>

      <DemoPanel title={labels.state}>
        <DemoValue
          label="chat:state"
          value={stateName(chat)}
          tone={chat.step === "idle" ? "neutral" : "warn"}
        />
        <h4 className="mt-4 text-xs font-medium text-ink-3">
          {labels.reports}
        </h4>
        {reports.length > 0 ? (
          <ul className="mt-1 font-mono text-xs text-ink-2">
            {reports.map((date, index) => (
              <li key={`${date}-${index}`}>
                #{index + 1} · {date}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-ink-3">{labels.reportsEmpty}</p>
        )}
      </DemoPanel>
    </CaseStage>
  );
}
