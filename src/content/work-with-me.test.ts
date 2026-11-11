import { describe, expect, it } from "vitest";

import { employerPage } from "./employers";
import { hirePage } from "./hire";
import { privacySections } from "./privacy";
import { projects } from "./projects";
import {
  findLandingService,
  landingServices,
  services,
  servicesForCase,
  workProcess,
} from "./services";

const published = projects.filter((project) => project.published);

describe("services", () => {
  it("are six, with unique slugs", () => {
    expect(services).toHaveLength(6);
    expect(new Set(services.map((service) => service.slug)).size).toBe(6);
  });

  it("link every published case study from at least one service", () => {
    for (const project of published)
      expect(servicesForCase(project.slug), project.slug).not.toHaveLength(0);
  });

  it("give every landing page its own title and description", () => {
    const titles = landingServices.map((service) => service.landing.metaTitle);
    const descriptions = landingServices.map(
      (service) => service.landing.metaDescription,
    );
    const pageTitles = [...titles, hirePage.metaTitle, employerPage.metaTitle];
    expect(new Set(pageTitles).size).toBe(pageTitles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("find landing pages by slug and nothing else", () => {
    expect(findLandingService("ai-rag")?.title).toBe("AI & RAG Solutions");
    // A service without a landing page lives on /hire only.
    expect(findLandingService("data-processing")).toBeUndefined();
    expect(findLandingService("nope")).toBeUndefined();
  });

  it("describe the process without promising timelines, prices or guarantees", () => {
    const text = JSON.stringify([
      services,
      workProcess,
      hirePage,
    ]).toLowerCase();
    for (const word of ["guarantee", "price", "week", "$", "€", "cheap"])
      expect(text, word).not.toContain(word);
  });
});

describe("employer page", () => {
  it("features published case studies only", () => {
    const slugs = new Set(published.map((project) => project.slug));
    for (const slug of employerPage.cases.slugs)
      expect(slugs.has(slug), slug).toBe(true);
  });
});

describe("privacy notice", () => {
  const base = {
    ownerName: null,
    email: null,
    formEnabled: false,
    analyticsEnabled: false,
    liveApiEnabled: false,
  };
  const ids = (input: Parameters<typeof privacySections>[0]) =>
    privacySections(input).map((section) => section.id);

  it("describes the contact form, analytics and live API only when they are enabled", () => {
    expect(ids(base)).not.toContain("contact-form");
    expect(ids(base)).not.toContain("analytics");
    expect(ids(base)).not.toContain("live-api");
    expect(
      ids({
        ...base,
        formEnabled: true,
        analyticsEnabled: true,
        liveApiEnabled: true,
      }),
    ).toEqual(
      expect.arrayContaining(["contact-form", "analytics", "live-api"]),
    );
  });

  it("names the configured owner and email, and invents none", () => {
    const anonymous = JSON.stringify(privacySections(base));
    expect(anonymous).toContain("the owner of this website");
    expect(anonymous).not.toMatch(/@|example\./);

    const named = JSON.stringify(
      privacySections({
        ...base,
        ownerName: "Ada Lovelace",
        email: "ada@site.dev",
      }),
    );
    expect(named).toContain("Ada Lovelace");
    expect(named).toContain("ada@site.dev");
  });
});
