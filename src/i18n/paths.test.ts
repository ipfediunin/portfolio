import { describe, expect, it } from "vitest";

import { isActivePath, localizePath } from "./paths";

describe("site paths", () => {
  it("keeps English at the root, without a language prefix", () => {
    expect(localizePath("en", "/")).toBe("/");
    expect(localizePath("en", "/projects")).toBe("/projects");
    expect(localizePath("en", "expertise/backend")).toBe("/expertise/backend");
  });

  it("marks a section active on its nested pages, the home page only on itself", () => {
    expect(isActivePath("/projects/knowledge-base", "/projects")).toBe(true);
    expect(isActivePath("/projects", "/projects")).toBe(true);
    expect(isActivePath("/projects", "/")).toBe(false);
    expect(isActivePath("/projectsx", "/projects")).toBe(false);
  });
});
