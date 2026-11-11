import { z } from "zod";

import { scenarioIds, type ScenarioId } from "@/simulation/scenarios/catalog";

/** `/architecture?scenario=cache` opens the playground and runs that scenario once. */
export const SCENARIO_PARAM = "scenario";

const scenarioIdSchema = z.enum(scenarioIds);

/** The scenario a URL asks for; null when the parameter is missing or not a known scenario. */
export function readScenarioParam(search: string): ScenarioId | null {
  const parsed = scenarioIdSchema.safeParse(
    new URLSearchParams(search).get(SCENARIO_PARAM),
  );
  return parsed.success ? parsed.data : null;
}
