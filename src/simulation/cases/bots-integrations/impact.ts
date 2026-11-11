import type { ImpactMeasure } from "../impact";
import { handleMessage, idle, type ChatState } from "./model";

/** Synthetic report dialogs, typos and second thoughts included. */
export const sampleDialogs: readonly (readonly string[])[] = [
  ["/report", "04.11.2026", "yes"],
  ["/report", "31.02.2026", "2026-11-04", "y"],
  ["/report", "next tuesday", "05.11.2026", "maybe", "yes"],
  ["/report", "2026-11-06", "yes"],
];

/**
 * Report dialogs that end with the report saved: a handler that forgets the dialog between
 * messages (every message starts from idle) against the state machine with its state kept in Redis.
 */
export function measureBotsIntegrationsImpact(): {
  readonly reports: ImpactMeasure;
} {
  const completed = (keepState: boolean) => {
    const saved = sampleDialogs.filter((messages) => {
      let state: ChatState = idle;
      return messages.some((message) => {
        const turn = handleMessage(keepState ? state : idle, message, {
          externalDown: false,
        });
        state = turn.state;
        return turn.reply === "reportSaved";
      });
    });
    return (saved.length / sampleDialogs.length) * 100;
  };
  return {
    reports: {
      id: "reports",
      unit: "percent",
      better: "higher",
      bars: [
        { id: "stateless", value: completed(false) },
        { id: "state-machine", value: completed(true) },
      ],
    },
  };
}
