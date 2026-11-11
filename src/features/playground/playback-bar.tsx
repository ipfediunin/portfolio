"use client";

import { playbackSpeeds } from "@/simulation/runtime/trace-player";

import { Segmented, Switch } from "./controls";
import {
  usePlayground,
  usePlaygroundController,
  type PlaygroundCopy,
} from "./use-playground";

export function PlaybackBar({ copy }: { readonly copy: PlaygroundCopy }) {
  const controller = usePlaygroundController();
  const paused = usePlayground((state) => state.paused);
  const speed = usePlayground((state) => state.speed);
  const stepMode = usePlayground((state) => state.stepMode);
  const note = usePlayground((state) => state.note);

  return (
    <section
      aria-label={copy.playback}
      className="rounded-2xl border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => controller.togglePause()}
          className="h-10 rounded-xl border border-line bg-bg px-4 text-sm font-semibold text-ink transition-colors hover:border-ink-3/50"
        >
          {paused ? copy.play : copy.pause}
        </button>
        <button
          type="button"
          onClick={() => controller.step()}
          className="h-10 rounded-xl border border-line bg-bg px-4 text-sm font-semibold text-ink transition-colors hover:border-ink-3/50"
        >
          {copy.step}
        </button>
        <div className="w-40">
          <Segmented
            label={copy.speed}
            value={speed}
            options={playbackSpeeds.map((value) => ({
              value,
              label: `${value}×`,
            }))}
            onChange={(value) => controller.setSpeed(value)}
          />
        </div>
        <div className="ml-auto">
          <Switch
            label={copy.stepMode}
            checked={stepMode}
            onChange={(value) => controller.setStepMode(value)}
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-bg p-4">
        <p className="font-mono text-xs tracking-[0.14em] text-brand uppercase">
          {copy.whatHappens}
        </p>
        <p
          aria-live="polite"
          className="mt-2 min-h-12 text-sm leading-relaxed text-ink"
        >
          {note ? copy.notes[note] : copy.idleNote}
        </p>
      </div>
      <p className="mt-3 text-xs text-ink-3">{copy.slowedNote}</p>
    </section>
  );
}
