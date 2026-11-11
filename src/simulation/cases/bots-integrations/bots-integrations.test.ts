import { describe, expect, it } from "vitest";

import { compileTurn } from "./compile";
import { handleMessage, idle, parseDate, type ChatState } from "./model";

const up = { externalDown: false };

/** Feeds messages one by one, the way the webhook receives them. */
function dialog(messages: readonly string[], env = up) {
  let state: ChatState = idle;
  return messages.map((message) => {
    const turn = handleMessage(state, message, env);
    state = turn.state;
    return turn;
  });
}

describe("bot commands", () => {
  it("answers /status from the external API, or says honestly that it is down", () => {
    const [ok] = dialog(["/status 42"]);
    expect(ok?.steps.some((step) => step.kind === "external" && step.ok)).toBe(
      true,
    );
    const [down] = dialog(["/status 42"], { externalDown: true });
    expect(down?.reply).toBe("statusUnavailable");
    expect(dialog(["/status"])[0]?.reply).toBe("statusUsage");
  });

  it("sends free text to the LLM and unknown commands nowhere", () => {
    expect(
      dialog(["Как сбросить пароль?"])[0]?.steps.map((step) => step.kind),
    ).toEqual(["loadState", "llm"]);
    expect(dialog(["/teleport"])[0]?.reply).toBe("unknown");
  });
});

describe("report dialog (a state machine)", () => {
  it("asks for a date, confirms it and saves the report", () => {
    const turns = dialog(["/report", "04.11.2026", "да"]);
    expect(turns.map((turn) => turn.reply)).toEqual([
      "reportAskDate",
      "reportConfirm",
      "reportSaved",
    ]);
    expect(turns[1]?.values.date).toBe("2026-11-04");
    expect(turns[2]?.steps.some((step) => step.kind === "save")).toBe(true);
    expect(turns[2]?.state).toEqual(idle);
  });

  it("stays on the step until the answer fits, and can be cancelled", () => {
    const turns = dialog([
      "/report",
      "завтра",
      "2026-02-30",
      "2026-03-01",
      "может",
      "/cancel",
    ]);
    expect(turns.map((turn) => turn.reply)).toEqual([
      "reportAskDate",
      "reportBadDate",
      "reportBadDate",
      "reportConfirm",
      "reportConfirmAgain",
      "cancelled",
    ]);
  });

  it("writes the state to Redis only when it changes", () => {
    const [ask, bad] = dialog(["/report", "nope"]);
    expect(ask?.steps.at(-1)?.kind).toBe("storeState");
    expect(bad?.steps.some((step) => step.kind === "storeState")).toBe(false);
  });

  it("parses both date formats and rejects impossible dates", () => {
    expect(parseDate("2026-11-04")).toBe("2026-11-04");
    expect(parseDate("04.11.2026")).toBe("2026-11-04");
    expect(parseDate("31.02.2026")).toBeNull();
  });
});

describe("bot runs", () => {
  it("compiles every kind of turn", () => {
    const turns = dialog([
      "/start",
      "/status 7",
      "/report",
      "2026-11-04",
      "yes",
      "hello",
    ]);
    let previous: ChatState = idle;
    for (const turn of turns) {
      const run = compileTurn(turn, previous, { startAt: 0, sequence: 1 });
      expect(run.captions.at(-1)?.key).toBe("reply");
      previous = turn.state;
    }
  });
});
