import { worldGraphSchema, type WorldGraph } from "../../model/graph";
import { building, centre, roadTraffic, viaLane } from "../layout";

const dataset = building(
  "sd.data",
  "storage",
  "Dataset",
  "CSV",
  { x: 0.9, y: 1.2 },
  1.6,
  40,
);
const pandas = building(
  "sd.pandas",
  "worker",
  "Pandas",
  "Cleaning",
  { x: 3.5, y: 1.2 },
  1.6,
  64,
  4,
);
const numpy = building(
  "sd.numpy",
  "service",
  "NumPy",
  "Arrays",
  { x: 8.0, y: 1.0 },
  1.7,
  92,
  6,
);
const scipy = building(
  "sd.scipy",
  "service",
  "SciPy",
  "Interpolation",
  { x: 10.6, y: 1.4 },
  1.7,
  112,
  7,
);
const matplotlib = building(
  "sd.matplotlib",
  "service",
  "Matplotlib",
  "Plots",
  { x: 8.2, y: 7.0 },
  1.6,
  76,
  5,
);
const report = building(
  "sd.report",
  "client",
  "Report",
  "Analysis",
  { x: 3.6, y: 7.2 },
  1.5,
  30,
);

/**
 * Case 02 — a numerical pipeline: raw data is cleaned with Pandas, turned into NumPy arrays,
 * interpolated with SciPy and plotted with Matplotlib for the report. Data moves as batch jobs.
 */
export const scientificDataGraph: WorldGraph = worldGraphSchema.parse({
  size: { width: 13, height: 11 },
  nameTags: true,
  views: {
    system: { area: { x0: 0.3, y0: 0.5, x1: 12.7, y1: 10.2 } },
  },
  roads: [
    { id: "sd.r.h", axis: "x", line: 5, from: -12, to: 25 },
    { id: "sd.r.v", axis: "y", line: 6, from: -12, to: 23 },
  ],
  nodes: [dataset, pandas, numpy, scipy, matplotlib, report],
  links: [
    {
      id: "sd.l.data-pandas",
      from: dataset.id,
      to: pandas.id,
      protocol: "http",
      flow: "async",
      route: [centre(dataset), { x: centre(pandas).x, y: centre(dataset).y }],
    },
    {
      id: "sd.l.pandas-numpy",
      from: pandas.id,
      to: numpy.id,
      protocol: "http",
      flow: "async",
      route: [
        { x: centre(pandas).x, y: 1.9 },
        { x: centre(numpy).x, y: 1.9 },
      ],
    },
    {
      id: "sd.l.numpy-scipy",
      from: numpy.id,
      to: scipy.id,
      protocol: "http",
      flow: "async",
      route: [
        { x: centre(numpy).x, y: 1.8 },
        { x: centre(scipy).x, y: 1.8 },
      ],
    },
    {
      id: "sd.l.scipy-matplotlib",
      from: scipy.id,
      to: matplotlib.id,
      protocol: "http",
      flow: "async",
      route: viaLane(centre(scipy), centre(matplotlib), "x", 6.5),
    },
    {
      id: "sd.l.matplotlib-report",
      from: matplotlib.id,
      to: report.id,
      protocol: "http",
      flow: "async",
      route: [
        centre(matplotlib),
        { x: centre(report).x, y: centre(matplotlib).y },
      ],
    },
  ],
  vehicleRoutes: [
    ...roadTraffic("sd.v.h", "x", 5, [-9, 22], [2, 1]),
    ...roadTraffic("sd.v.v", "y", 6, [-9, 20], [1, 2]),
  ],
  statusCycles: [
    {
      node: scipy.id,
      states: [
        { status: "processing", text: "Interpolating", durationMs: 3200 },
        { status: "success", text: "max err 0.004", durationMs: 4800 },
      ],
    },
    {
      node: pandas.id,
      states: [{ status: "success", text: "dropna · 0 NaN", durationMs: 8000 }],
    },
  ],
});
