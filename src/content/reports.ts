import { z } from "zod";

import chaosData from "./reports/chaos.json";
import loadData from "./reports/load.json";

/**
 * Load and chaos runs of the live backend (backend/scripts/run_load.py, run_chaos.py). The
 * scripts write these files; nothing here is typed in by hand. Validated when the module loads:
 * a malformed report fails the build, not the page.
 */

const environmentSchema = z.object({
  machine: z.object({
    cpu: z.string().min(1),
    logical_cpus: z.number().int().positive(),
    memory_gb: z.number().positive(),
    os: z.string().min(1),
  }),
  docker: z.object({
    engine: z.string().min(1),
    cpus: z.number().int().positive(),
    memory_gb: z.number().positive(),
  }),
  load_generator: z.string().min(1),
  limits: z.array(
    z.object({
      service: z.string().min(1),
      replicas: z.number().int().positive(),
      cpus: z.number().positive().nullable(),
      memory_mb: z.number().int().positive().nullable(),
    }),
  ),
});
export type BenchEnvironment = z.infer<typeof environmentSchema>;

const latency = {
  p50: z.number().nonnegative(),
  p95: z.number().nonnegative(),
  p99: z.number().nonnegative(),
  max: z.number().nonnegative(),
};

export const endpointGroups = [
  "read",
  "events",
  "jobs",
  "payments",
  "traces",
] as const;

const loadRunSchema = z.object({
  users: z.number().int().positive(),
  duration_s: z.number().positive(),
  requests: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
  rps: z.number().nonnegative(),
  p95: z.number().nonnegative(),
  endpoints: z
    .array(
      z.object({
        name: z.string().min(1),
        group: z.enum(endpointGroups),
        requests: z.number().int().nonnegative(),
        failures: z.number().int().nonnegative(),
        rps: z.number().nonnegative(),
        ...latency,
      }),
    )
    .min(1),
  background: z.array(
    z.object({
      name: z.string().min(1),
      count: z.number().int().nonnegative(),
      failures: z.number().int().nonnegative(),
      ...latency,
    }),
  ),
  containers: z.array(
    z.object({
      service: z.string().min(1),
      cpu_peak_pct: z.number().nonnegative(),
      memory_peak_mb: z.number().nonnegative(),
    }),
  ),
});
export type LoadRun = z.infer<typeof loadRunSchema>;

export const loadReportSchema = z.object({
  kind: z.literal("load"),
  measured_at: z.iso.datetime({ offset: true }),
  environment: environmentSchema,
  profile: z.object({
    spawn_rate: z.number().positive(),
    wait_s: z.tuple([z.number().nonnegative(), z.number().positive()]),
    weights: z.record(z.string(), z.number().int().positive()),
  }),
  runs: z.array(loadRunSchema).min(1),
});
export type LoadReport = z.infer<typeof loadReportSchema>;

export const chaosReportSchema = z.object({
  kind: z.literal("chaos"),
  measured_at: z.iso.datetime({ offset: true }),
  environment: environmentSchema,
  experiments: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        title: z.string().min(1),
        fault: z.string().min(1),
        hypothesis: z.string().min(1),
        passed: z.boolean(),
        observations: z
          .array(z.object({ label: z.string().min(1), value: z.string() }))
          .min(1),
      }),
    )
    .min(1),
});
export type ChaosReport = z.infer<typeof chaosReportSchema>;

export const loadReport: LoadReport = loadReportSchema.parse(loadData);
export const chaosReport: ChaosReport = chaosReportSchema.parse(chaosData);
