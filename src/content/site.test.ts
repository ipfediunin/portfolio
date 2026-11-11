import { describe, expect, it } from "vitest";

import { siteEnvSchema } from "./site";

const parse = (values: Record<string, string | undefined>) =>
  siteEnvSchema.safeParse(values);

describe("site env", () => {
  it("reads the owner's age as a number", () => {
    const result = parse({ NEXT_PUBLIC_OWNER_AGE: "31" });
    expect(result.success && result.data.NEXT_PUBLIC_OWNER_AGE).toBe(31);
  });

  it("rejects an age that is not a plausible whole number", () => {
    for (const age of ["thirty", "31.5", "7", "150"])
      expect(parse({ NEXT_PUBLIC_OWNER_AGE: age }).success, age).toBe(false);
  });

  it("accepts a portrait from /public only", () => {
    expect(parse({ NEXT_PUBLIC_OWNER_PHOTO: "/owner.jpg" }).success).toBe(true);
    expect(parse({ NEXT_PUBLIC_OWNER_PHOTO: "/photos/me.webp" }).success).toBe(
      true,
    );
    for (const photo of [
      "https://example.com/owner.jpg",
      "owner.jpg",
      "/owner.pdf",
    ])
      expect(parse({ NEXT_PUBLIC_OWNER_PHOTO: photo }).success, photo).toBe(
        false,
      );
  });

  it("treats empty values (unset build args) as unset", () => {
    const result = parse({
      NEXT_PUBLIC_OWNER_NAME: "",
      NEXT_PUBLIC_OWNER_AGE: "",
      NEXT_PUBLIC_OWNER_PHOTO: " ",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.NEXT_PUBLIC_OWNER_NAME).toBeUndefined();
    expect(result.data.NEXT_PUBLIC_OWNER_AGE).toBeUndefined();
    expect(result.data.NEXT_PUBLIC_OWNER_PHOTO).toBeUndefined();
  });
});
