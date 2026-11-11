import { CaseScript, type CaseRun } from "../case-script";
import { botsIntegrationsGraph } from "./graph";
import { stateName, type BotTurn, type ChatState } from "./model";

export type BotsCaption =
  | "receive"
  | "loadState"
  | "external"
  | "externalDown"
  | "llm"
  | "save"
  | "storeState"
  | "reply";

/** One message through the bot: the webhook, the state, the call it needs, and the answer. */
export function compileTurn(
  turn: BotTurn,
  previous: ChatState,
  next: { readonly startAt: number; readonly sequence: number },
): CaseRun<BotsCaption> {
  const s = new CaseScript<BotsCaption>(botsIntegrationsGraph, "bi-turn", next);
  const respond = { kind: "response", reverse: true } as const;
  s.caption("receive", { route: turn.route })
    .hop("bi.l.user-platform")
    .hop("bi.l.platform-flask")
    .work("bi.flask", `route ${turn.route}`, [1, 3]);

  for (const step of turn.steps) {
    switch (step.kind) {
      case "loadState":
        s.hop("bi.l.flask-redis")
          .work("bi.redis", "GET chat:state", [0.3, 0.8])
          .status("bi.redis", "cached", `state: ${stateName(previous)}`)
          .hop("bi.l.flask-redis", respond)
          .caption("loadState", { state: stateName(previous) });
        break;
      case "external":
        s.hop("bi.l.flask-external")
          .work("bi.external", "GET /orders/{id}", [80, 160], step.ok)
          .status(
            "bi.external",
            step.ok ? "success" : "failed",
            step.ok ? "200 OK" : "503 Unavailable",
          )
          .hop("bi.l.flask-external", {
            ...respond,
            tone: step.ok ? "success" : "failed",
          })
          .caption(step.ok ? "external" : "externalDown");
        break;
      case "llm":
        s.hop("bi.l.flask-llm")
          .work("bi.llm", "chat.completions", [600, 1200])
          .status("bi.llm", "success", "Answer")
          .hop("bi.l.flask-llm", { ...respond, tone: "success" })
          .caption("llm");
        break;
      case "save":
        s.hop("bi.l.flask-postgres")
          .work("bi.postgres", "INSERT INTO reports", [2, 6])
          .status("bi.postgres", "success", "Saved")
          .hop("bi.l.flask-postgres", { ...respond, tone: "success" })
          .caption("save");
        break;
      case "storeState":
        s.hop("bi.l.flask-redis", { kind: "job" })
          .status("bi.redis", "cached", `state: ${stateName(turn.state)}`)
          .caption("storeState", { state: stateName(turn.state) });
        break;
    }
  }

  s.hop("bi.l.platform-flask", { ...respond, tone: "success" })
    .hop("bi.l.user-platform", { ...respond, tone: "success" })
    .status("bi.user", "success", "Reply")
    .caption("reply", { ms: s.reportedMs });
  return s.build();
}
