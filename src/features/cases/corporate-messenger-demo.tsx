"use client";

import { useId, useState } from "react";
import { useStore } from "zustand";

import type { CorporateMessengerDemoContent } from "@/content/cases/corporate-messenger";
import { Segmented } from "@/features/playground/controls";
import { cn } from "@/lib/cn";
import {
  compileClose,
  compileConnect,
  compileSend,
  deskName,
  type MessengerCaption,
} from "@/simulation/cases/corporate-messenger/compile";
import {
  closeConnection,
  deskIds,
  isComplete,
  openConnection,
  segmentCount,
  sendMessage,
  type DeliveryReport,
  type DeskId,
  type Transport,
} from "@/simulation/cases/corporate-messenger/model";

import { CaseStage, useCaseDemo, type CaseStageInput } from "./case-stage";
import { DemoButton, DemoPanel, DemoValue } from "./demo-ui";
import { formatTemplate } from "./format";

const lossRates = [0, 0.2, 0.4] as const;
type LossRate = (typeof lossRates)[number];

/** Case 04: the same message over TCP and over UDP, with losses you choose. */
export function CorporateMessengerDemo({
  input,
  content,
}: {
  readonly input: CaseStageInput;
  readonly content: CorporateMessengerDemoContent;
}) {
  const demo = useCaseDemo<MessengerCaption>();
  const running = useStore(demo.controller.store, (state) => state.running);
  const [message, setMessage] = useState(content.labels.messageDefault);
  const [transport, setTransport] = useState<Transport>("tcp");
  const [sender, setSender] = useState<DeskId>("desk-1");
  const [loss, setLoss] = useState<LossRate>(0.2);
  const [connected, setConnected] = useState<ReadonlySet<DeskId>>(
    new Set(["desk-2", "desk-3", "desk-4"]),
  );
  const [report, setReport] = useState<{
    readonly delivery: DeliveryReport;
    readonly sender: DeskId;
  } | null>(null);
  const [seed, setSeed] = useState(1);
  const messageId = useId();
  const { labels } = content;
  const { locale } = input;
  const settled = report !== null && !running;

  function send(text: string = message) {
    const delivery = sendMessage({
      transport,
      sender,
      parts: segmentCount(text),
      lossRate: loss,
      seed,
      connected,
    });
    setSeed(seed + 1);
    setConnected(delivery.connected);
    setReport({ delivery, sender });
    demo.play((next) => compileSend(delivery, sender, next));
  }

  function toggleConnection(desk: DeskId) {
    const next = new Set(connected);
    if (next.has(desk)) {
      next.delete(desk);
      demo.play((timing) => compileClose(closeConnection(desk), desk, timing));
    } else {
      next.add(desk);
      demo.play((timing) => compileConnect(openConnection(desk), desk, timing));
    }
    setConnected(next);
  }

  function resultFor(desk: DeskId): {
    readonly text: string;
    readonly tone: string;
  } {
    if (!report) return { text: "", tone: "" };
    const { delivery } = report;
    const parts = delivery.received[desk];
    if (!parts) return { text: labels.notConnected, tone: "text-ink-3" };
    const count = formatTemplate(
      labels.parts,
      { count: parts.length, parts: delivery.parts },
      locale,
    );
    if (isComplete(parts, delivery.parts))
      return {
        text: `${count} · ${labels.inOrder}`,
        tone: "text-status-success",
      };
    if (parts.length === delivery.parts)
      return {
        text: `${count} · ${labels.outOfOrder}`,
        tone: "text-status-retry",
      };
    return { text: `${count} · ${labels.missing}`, tone: "text-status-failed" };
  }

  return (
    <CaseStage
      demo={demo}
      input={input}
      captions={content.captions}
      idleCaption={content.idle}
      entry={{
        kind: "text",
        nodeId: `cm.${sender}`,
        placeholder: labels.message,
        submitLabel: labels.send,
        maxLength: 120,
        onSubmit: (text) => {
          setMessage(text);
          send(text);
        },
      }}
    >
      <DemoPanel title={labels.controls}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor={messageId}
              className="mb-2 block text-sm font-medium text-ink"
            >
              {labels.message}
            </label>
            <input
              id={messageId}
              value={message}
              maxLength={120}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-10 w-full rounded-xl border border-line bg-bg px-3.5 text-sm text-ink outline-none focus-visible:border-brand"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium text-ink">
                {labels.transport}
              </p>
              <Segmented
                label={labels.transport}
                value={transport}
                options={[
                  { value: "tcp", label: "TCP" },
                  { value: "udp", label: "UDP" },
                ]}
                onChange={setTransport}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink">{labels.loss}</p>
              <Segmented
                label={labels.loss}
                value={loss}
                options={lossRates.map((rate) => ({
                  value: rate,
                  label: `${rate * 100}%`,
                }))}
                onChange={setLoss}
              />
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">{labels.sender}</p>
            <Segmented
              label={labels.sender}
              value={sender}
              options={deskIds.map((desk) => ({
                value: desk,
                label: deskName(desk),
              }))}
              onChange={setSender}
            />
          </div>
          <DemoButton
            type="submit"
            tone="primary"
            disabled={message.trim().length === 0}
          >
            {labels.send}
          </DemoButton>
        </form>
      </DemoPanel>

      <DemoPanel title={labels.connections}>
        <ul className="space-y-2">
          {deskIds.map((desk) => {
            const online = connected.has(desk);
            return (
              <li
                key={desk}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-semibold text-ink">
                  {deskName(desk)}{" "}
                  <span
                    className={cn(
                      "ml-1 text-xs font-medium",
                      online ? "text-status-success" : "text-ink-3",
                    )}
                  >
                    {online ? labels.online : labels.offline}
                  </span>
                </span>
                <DemoButton
                  className="min-h-9 px-3 text-xs"
                  onClick={() => toggleConnection(desk)}
                >
                  {online ? labels.disconnect : labels.connect}
                </DemoButton>
              </li>
            );
          })}
        </ul>
      </DemoPanel>

      <DemoPanel title={labels.results}>
        {settled ? (
          <>
            <ul className="space-y-1.5">
              {deskIds
                .filter((desk) => desk !== report.sender)
                .map((desk) => {
                  const result = resultFor(desk);
                  return (
                    <li
                      key={desk}
                      className="flex justify-between gap-3 text-sm"
                    >
                      <span className="font-semibold text-ink">
                        {deskName(desk)}
                      </span>
                      <span
                        className={cn(
                          "text-right text-xs font-medium",
                          result.tone,
                        )}
                      >
                        {result.text}
                      </span>
                    </li>
                  );
                })}
            </ul>
            <div className="mt-3">
              <DemoValue
                label={report.delivery.transport.toUpperCase()}
                value={formatTemplate(
                  labels.stats,
                  {
                    sent: report.delivery.sent,
                    lost: report.delivery.lost,
                    retransmitted: report.delivery.retransmitted,
                  },
                  locale,
                )}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-3">{labels.resultsEmpty}</p>
        )}
        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          {labels.difference}
        </p>
      </DemoPanel>
    </CaseStage>
  );
}
