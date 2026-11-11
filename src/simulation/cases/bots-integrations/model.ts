/**
 * The bot behind the demo: a command router plus a finite-state machine for multi-step dialogs.
 * The dialog state lives in Redis between messages (each update is handled by a stateless
 * webhook), results are saved to PostgreSQL, data comes from an external API, and free text goes
 * to an LLM. A failing external API gets an honest answer instead of silence.
 */

export type ChatState =
  | { readonly step: "idle" }
  | { readonly step: "reportDate" }
  | { readonly step: "reportConfirm"; readonly date: string };

export const replyKeys = [
  "start",
  "statusAccepted",
  "statusInProgress",
  "statusDone",
  "statusUsage",
  "statusUnavailable",
  "reportAskDate",
  "reportBadDate",
  "reportConfirm",
  "reportConfirmAgain",
  "reportSaved",
  "reportCancelled",
  "cancelled",
  "llm",
  "unknown",
] as const;
export type ReplyKey = (typeof replyKeys)[number];

/** What handling one message touched, in order (drawn on the scene). */
export type BotStep =
  | { readonly kind: "loadState" }
  | { readonly kind: "external"; readonly ok: boolean }
  | { readonly kind: "llm" }
  | { readonly kind: "save" }
  | { readonly kind: "storeState" };

export interface BotTurn {
  /** The command as routed: "/status", "/report", "text", … */
  readonly route: string;
  readonly reply: ReplyKey;
  readonly values: Readonly<Record<string, string>>;
  readonly steps: readonly BotStep[];
  readonly state: ChatState;
}

export const idle: ChatState = { step: "idle" };

/** How the state is written in Redis, e.g. "report:confirm". */
export function stateName(state: ChatState): string {
  if (state.step === "idle") return "idle";
  return state.step === "reportDate" ? "report:date" : "report:confirm";
}

const YES = new Set(["да", "д", "yes", "y"]);
const NO = new Set(["нет", "н", "no", "n"]);

/** "2026-11-04" or "04.11.2026" → "2026-11-04"; anything else, or an impossible date, → null. */
export function parseDate(text: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const local = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  const [year, month, day] = iso
    ? [iso[1], iso[2], iso[3]]
    : local
      ? [local[3], local[2], local[1]]
      : [];
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const normalised = `${year}-${month}-${day}`;
  return date.toISOString().slice(0, 10) === normalised ? normalised : null;
}

const statusReplies = [
  "statusAccepted",
  "statusInProgress",
  "statusDone",
] as const;

export function handleMessage(
  state: ChatState,
  message: string,
  env: { readonly externalDown: boolean },
): BotTurn {
  const text = message.trim();
  const lower = text.toLowerCase();
  const turn = (
    route: string,
    reply: ReplyKey,
    next: ChatState,
    middle: readonly BotStep[] = [],
    values: Record<string, string> = {},
  ): BotTurn => ({
    route,
    reply,
    values,
    state: next,
    steps: [
      { kind: "loadState" },
      ...middle,
      ...(stateName(next) === stateName(state)
        ? []
        : [{ kind: "storeState" } as const]),
    ],
  });

  if (lower === "/cancel") return turn("/cancel", "cancelled", idle);

  if (state.step === "reportDate") {
    const date = parseDate(text);
    return date
      ? turn(
          "report:date",
          "reportConfirm",
          { step: "reportConfirm", date },
          [],
          { date },
        )
      : turn("report:date", "reportBadDate", state);
  }
  if (state.step === "reportConfirm") {
    if (YES.has(lower))
      return turn("report:confirm", "reportSaved", idle, [{ kind: "save" }], {
        date: state.date,
      });
    if (NO.has(lower)) return turn("report:confirm", "reportCancelled", idle);
    return turn("report:confirm", "reportConfirmAgain", state, [], {
      date: state.date,
    });
  }

  if (lower === "/start") return turn("/start", "start", idle);
  if (lower === "/report")
    return turn("/report", "reportAskDate", { step: "reportDate" });
  if (lower.startsWith("/status")) {
    const id = /^\/status\s+(\d{1,6})$/.exec(lower)?.[1];
    if (!id) return turn("/status", "statusUsage", idle);
    if (env.externalDown)
      return turn(
        "/status",
        "statusUnavailable",
        idle,
        [{ kind: "external", ok: false }],
        { id },
      );
    return turn(
      "/status",
      statusReplies[Number(id) % statusReplies.length]!,
      idle,
      [{ kind: "external", ok: true }],
      { id },
    );
  }
  if (lower.startsWith("/"))
    return turn(lower.split(/\s/)[0]!, "unknown", idle, [], {
      command: lower.split(/\s/)[0]!,
    });
  return turn("text", "llm", idle, [{ kind: "llm" }], {
    question: text.slice(0, 80),
  });
}
