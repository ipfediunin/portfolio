import { describe, expect, it } from "vitest";

import { readScenarioParam } from "./scenario-param";

describe("readScenarioParam", () => {
  it("reads a known scenario", () => {
    expect(readScenarioParam("?scenario=dead-letter")).toBe("dead-letter");
    expect(readScenarioParam("?utm=x&scenario=cache")).toBe("cache");
  });

  it("ignores missing, unknown and malformed values", () => {
    expect(readScenarioParam("")).toBeNull();
    expect(readScenarioParam("?scenario=")).toBeNull();
    expect(readScenarioParam("?scenario=drop-tables")).toBeNull();
    expect(readScenarioParam("?scenario=%3Cscript%3E")).toBeNull();
  });
});
