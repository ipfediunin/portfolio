import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image (Dockerfile) runs the traced standalone server; local builds and the e2e
  // tests keep `next start` (standalone output needs symlinks, which Windows restricts).
  output:
    process.env.NEXT_BUILD_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  // /services/[slug] are landing pages; the overview of all services is /hire. A visitor who trims
  // the URL to /services lands there instead of on a 404 or a second, competing overview page.
  redirects() {
    return [{ source: "/services", destination: "/hire", permanent: true }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Case studies are MDX files imported by their pages (src/content/projects); styles live in
// src/mdx-components.tsx.
const withMDX = createMDX({});

export default withMDX(nextConfig);
