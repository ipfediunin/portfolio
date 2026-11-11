import { mean, type ImpactMeasure } from "../impact";
import { deskIds, sendMessage, type Transport } from "./model";

/** Network loss on every hop, as set with the demo's loss slider. */
const LOSS_RATE = 0.1;
/** A short message: three parts. */
const PARTS = 3;
/** Sends averaged per transport, so one lucky seed does not decide the chart. */
const SENDS = 60;
const SENDER = "desk-1";

/**
 * Share of recipients that get a message complete and in order, over UDP and over TCP. Every desk
 * is connected, so TCP opens no new connections and only the delivery guarantees differ.
 */
export function measureCorporateMessengerImpact(): {
  readonly delivery: ImpactMeasure;
} {
  const connected = new Set(deskIds);
  const recipients = deskIds.filter((desk) => desk !== SENDER);
  const expected = Array.from(
    { length: PARTS },
    (_, index) => index + 1,
  ).join();
  const intact = (transport: Transport) =>
    mean(
      Array.from({ length: SENDS }, (_, seed) => {
        const report = sendMessage({
          transport,
          sender: SENDER,
          parts: PARTS,
          lossRate: LOSS_RATE,
          seed: seed + 1,
          connected,
        });
        const complete = recipients.filter(
          (desk) => report.received[desk]?.join() === expected,
        );
        return (complete.length / recipients.length) * 100;
      }),
    );
  return {
    delivery: {
      id: "delivery",
      unit: "percent",
      better: "higher",
      bars: [
        { id: "udp", value: intact("udp") },
        { id: "tcp", value: intact("tcp") },
      ],
    },
  };
}
