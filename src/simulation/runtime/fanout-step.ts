import type { LiveTraceCursor } from "../live/live-exchange";
import type { Step } from "../scenarios/catalog";
import { runFanout } from "./background-work";
import type { StepContext, StepOutcome } from "./step-context";

type FanoutStep = Extract<Step, { type: "fanout" }>;

/**
 * Playback ms between the order's commit and the outbox relay publishing its event: the relay
 * polls the outbox, so the event leaves after the client already has its answer.
 */
export const RELAY_PICKUP_MS = 450;

/** The Kafka topic, as the services name it (`contracts.ORDER_EVENTS_TOPIC`). */
const TOPIC = "orders.events";

/**
 * The order's event is already in the outbox (the INSERT before this step wrote both); the request
 * only answers. What happens to the event is background work: the relay publishes it, and every
 * consumer group reads it on its own.
 */
function stored(ctx: StepContext, step: FanoutStep): void {
  const { run, state } = ctx;
  run.note(state.t, "fanoutPublish");
  run.status(state.t, state.at, "queued", `Outbox · ${step.event}`);
  run.log(
    state.t,
    "info",
    state.at,
    `${step.event} stored in the outbox with the order`,
  );
}

/** Simulation: the relay's publish and the groups' work are compiled right away. */
export function fanout(ctx: StepContext, step: FanoutStep): StepOutcome {
  const { run, state } = ctx;
  const link = ctx.link(step.link);
  stored(ctx, step);
  const pickedUpAt = state.t + RELAY_PICKUP_MS;
  run.status(pickedUpAt, state.at, "success", "Outbox · published");
  let t = run.hop(
    run.newPacket(),
    "event",
    "neutral",
    link.id,
    false,
    pickedUpAt,
    false,
  );
  t = run.span(link.to, `produce ${TOPIC} (acks=all)`, t, [2, 6], {
    onSyncPath: false,
  });
  runFanout(ctx.background(), step.consumers, {
    brokerId: link.to,
    event: step.event,
    startAt: t,
  });
  return "continue";
}

/**
 * Live: the service queued background work only if it stored the order (and so its event). The
 * relay's publish and the consumer groups' spans arrive with the background part of the trace.
 */
export function fanoutLive(
  ctx: StepContext,
  step: FanoutStep,
  live: LiveTraceCursor,
): StepOutcome {
  const { state } = ctx;
  if (live.exchange.trace.background === null) return "continue";
  stored(ctx, step);
  state.queued = {
    kind: "fanout",
    origin: state.at,
    link: step.link,
    event: step.event,
    consumers: step.consumers,
    readyAt: state.t + RELAY_PICKUP_MS,
  };
  return "continue";
}
