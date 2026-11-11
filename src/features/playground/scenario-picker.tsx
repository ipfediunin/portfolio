"use client";

import { scenarioIds } from "@/simulation/scenarios/catalog";
import { cn } from "@/lib/cn";

import {
  usePlayground,
  usePlaygroundController,
  type PlaygroundCopy,
} from "./use-playground";

export function ScenarioPicker({ copy }: { readonly copy: PlaygroundCopy }) {
  const controller = usePlaygroundController();
  const selected = usePlayground((state) => state.scenarioId);

  return (
    <fieldset>
      <legend className="font-mono text-xs tracking-[0.14em] text-ink-3 uppercase">
        {copy.scenariosTitle}
      </legend>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
        {scenarioIds.map((id, index) => {
          const scenario = copy.scenarios[id];
          const checked = id === selected;
          return (
            <label
              key={id}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand",
                checked
                  ? "border-brand/40 bg-brand/5"
                  : "border-line bg-surface hover:border-ink-3/40",
              )}
            >
              <input
                type="radio"
                name="playground-scenario"
                value={id}
                checked={checked}
                onChange={() => controller.selectScenario(id)}
                className="sr-only"
              />
              <span className="font-mono text-xs text-ink-3">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="block text-sm font-bold text-ink">
                  {scenario.title}
                </span>
                <span className="mt-0.5 hidden text-xs leading-relaxed text-ink-2 sm:block">
                  {scenario.text}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-2 sm:hidden">
        {copy.scenarios[selected].text}
      </p>
    </fieldset>
  );
}
