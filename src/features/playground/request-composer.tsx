"use client";

import { useId, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { isLiveScenario } from "@/simulation/live/live-exchange";
import { scenarios, type CacheMode } from "@/simulation/scenarios/catalog";

import { Segmented, Switch } from "./controls";
import {
  usePlayground,
  usePlaygroundController,
  type PlaygroundCopy,
} from "./use-playground";

const cacheModes: readonly CacheMode[] = ["auto", "hit", "miss"];
/** The live cache cannot be told to hit; "miss" sends `Cache-Control: no-cache`. */
const liveCacheModes: readonly CacheMode[] = ["auto", "miss"];
const failureCounts = [0, 1, 2, 3] as const;

/** Live hint for the editor: whether the text is JSON at all (the server-side 422 comes on send). */
function jsonProblem(body: string): string | null {
  try {
    JSON.parse(body);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid JSON";
  }
}

interface RequestComposerProps {
  readonly copy: PlaygroundCopy;
  readonly onSend: () => void;
}

export function RequestComposer({ copy, onSend }: RequestComposerProps) {
  const controller = usePlaygroundController();
  const scenarioId = usePlayground((state) => state.scenarioId);
  const body = usePlayground((state) => state.body);
  const options = usePlayground((state) => state.options);
  const mode = usePlayground((state) => state.mode);
  const liveAvailable = usePlayground((state) => state.liveAvailable);
  const livePending = usePlayground((state) => state.livePending);
  const liveError = usePlayground((state) => state.liveError);
  const sandboxExpiresAt = usePlayground((state) => state.sandboxExpiresAt);
  const liveChannel = usePlayground((state) => state.liveChannel);
  const lastPush = usePlayground((state) => state.lastPush);
  const spec = scenarios[scenarioId];
  const live = mode === "live" && isLiveScenario(scenarioId);
  const bodyId = useId();
  const hintId = useId();
  const hasBody = spec.request.method === "POST";
  const problem = hasBody ? jsonProblem(body) : null;

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <section
      aria-label={copy.request}
      onKeyDown={handleKeyDown}
      className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"
    >
      <h3 className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">
        {copy.request}
      </h3>
      {liveAvailable ? (
        <div className="mt-3">
          <Segmented
            label={copy.live.mode}
            value={mode}
            options={[
              { value: "simulation", label: copy.live.modes.simulation },
              { value: "live", label: copy.live.modes.live },
            ]}
            onChange={(next) => controller.setMode(next)}
          />
          {mode === "live" ? (
            <p className="mt-2 text-xs leading-relaxed text-ink-2">
              {live ? copy.live.hint : copy.live.unsupported}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="mt-3 flex items-center gap-2 font-mono text-sm">
        <span className="rounded-md bg-ink px-2 py-0.5 text-xs font-bold text-white">
          {spec.request.method}
        </span>
        <span className="break-all text-ink">{spec.request.path}</span>
      </p>

      <div className="mt-4 space-y-3">
        {spec.controls.includes("auth") ? (
          <Switch
            label={copy.authorization}
            checked={options.authorized}
            onChange={(authorized) => controller.setOptions({ authorized })}
          />
        ) : null}

        {spec.controls.includes("provider") ? (
          <div>
            <Switch
              label={copy.providerDown}
              checked={options.providerDown}
              onChange={(providerDown) =>
                controller.setOptions({ providerDown })
              }
            />
            {live ? (
              <p className="mt-2 text-xs text-ink-3">
                {copy.live.providerFault}
              </p>
            ) : null}
          </div>
        ) : null}

        {spec.controls.includes("worker") ? (
          <Switch
            label={copy.workerDown}
            checked={options.workerDown}
            onChange={(workerDown) => controller.setOptions({ workerDown })}
          />
        ) : null}

        {spec.controls.includes("cache") ? (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">{copy.cache}</p>
            <Segmented
              label={copy.cache}
              value={options.cache}
              options={(live ? liveCacheModes : cacheModes).map(
                (cacheMode) => ({
                  value: cacheMode,
                  label: copy.cacheModes[cacheMode],
                }),
              )}
              onChange={(cache) => controller.setOptions({ cache })}
            />
          </div>
        ) : null}

        {spec.controls.includes("failures") ? (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">{copy.failures}</p>
            <Segmented
              label={copy.failures}
              value={options.providerFailures}
              options={failureCounts.map((count) => ({
                value: count,
                label: String(count),
              }))}
              onChange={(providerFailures) =>
                controller.setOptions({ providerFailures })
              }
            />
            <p className="mt-2 text-xs text-ink-3">
              {live ? copy.live.faults : copy.failuresHint}
            </p>
          </div>
        ) : null}

        {hasBody ? (
          <div>
            <label
              htmlFor={bodyId}
              className="mb-2 block text-sm font-medium text-ink"
            >
              {copy.body}
            </label>
            <textarea
              id={bodyId}
              value={body}
              onChange={(event) => controller.setBody(event.target.value)}
              spellCheck={false}
              rows={5}
              aria-invalid={problem !== null}
              aria-describedby={problem ? hintId : undefined}
              className="w-full resize-y rounded-xl border border-line bg-bg p-3 font-mono text-[13px] leading-relaxed text-ink outline-none focus-visible:border-brand aria-invalid:border-status-failed/50"
            />
            {problem ? (
              <p
                id={hintId}
                className="mt-1 font-mono text-xs text-status-failed"
              >
                {problem}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          onClick={onSend}
          disabled={live && livePending}
          aria-keyshortcuts="Control+Enter"
        >
          {live && livePending ? copy.live.sending : copy.send}
          <ArrowRightIcon className="size-5" />
        </Button>
        <span className="font-mono text-xs text-ink-3">{copy.sendHint}</span>
      </div>
      {live && liveError ? (
        <p role="alert" className="mt-3 text-sm font-medium text-status-failed">
          {copy.live.errors[liveError]}
        </p>
      ) : null}
      {live && sandboxExpiresAt !== null ? (
        <p className="mt-3 text-xs text-ink-2">
          {copy.live.sandbox.replace(
            "{time}",
            new Date(sandboxExpiresAt).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          )}{" "}
          <button
            type="button"
            onClick={() => void controller.deleteSandbox()}
            className="font-medium text-ink underline underline-offset-4 hover:text-brand"
          >
            {copy.live.deleteSandbox}
          </button>
        </p>
      ) : null}
      {live && liveChannel !== "off" ? (
        <p className="mt-2 text-xs text-ink-2" aria-live="polite">
          {copy.live.channel[liveChannel]}
          {lastPush
            ? ` ${copy.live.lastPush.replace("{event}", lastPush.event)}`
            : null}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => controller.resetSystem()}
        className="mt-3 text-xs font-medium text-ink-3 underline-offset-4 hover:text-ink hover:underline"
      >
        {copy.resetSystem}
      </button>
    </section>
  );
}
