import { CaseScript, type CaseRun } from "../case-script";
import { scientificDataGraph } from "./graph";
import type { InterpolationMethod } from "./model";

export type ScientificDataCaption =
  "load" | "clean" | "arrays" | "interpolate" | "plot" | "done" | "doneEdited";

/** The SciPy / NumPy call each method stands for, shown on the scene's trace. */
export const methodCalls: Readonly<Record<InterpolationMethod, string>> = {
  linear: "np.interp(x_new, x, y)",
  spline: "CubicSpline(x, y, bc_type='natural')",
  pchip: "PchipInterpolator(x, y)",
  lagrange: "BarycentricInterpolator(x, y)",
};

export interface PipelinePlan {
  readonly rows: number;
  readonly missing: number;
  readonly outliers: number;
  readonly points: number;
  readonly method: InterpolationMethod;
  /** Error against the known function; null once the visitor edited the points. */
  readonly maxError: number | null;
  /** Leave-one-out RMSE; null with too few points. */
  readonly looError: number | null;
}

const short = (value: number) => Number(value.toPrecision(2));

/** One pass of the pipeline over the current data, with the numbers the model computed. */
export function compilePipeline(
  plan: PipelinePlan,
  next: { readonly startAt: number; readonly sequence: number },
): CaseRun<ScientificDataCaption> {
  const s = new CaseScript<ScientificDataCaption>(
    scientificDataGraph,
    "sd-pipeline",
    next,
  );
  const job = { kind: "job" } as const;
  s.caption("load", { rows: plan.rows })
    .hop("sd.l.data-pandas", job)
    .work("sd.pandas", "read_csv → dropna → hampel", [8, 20])
    .status(
      "sd.pandas",
      plan.missing + plan.outliers > 0 ? "retry" : "success",
      `−${plan.missing} NaN · −${plan.outliers} outliers`,
    )
    .caption("clean", { missing: plan.missing, outliers: plan.outliers })
    .hop("sd.l.pandas-numpy", job)
    .work("sd.numpy", "np.asarray(df[['x', 'y']])", [1, 3])
    .status("sd.numpy", "success", `float64[${plan.points}]`)
    .caption("arrays", { points: plan.points })
    .hop("sd.l.numpy-scipy", job)
    .work("sd.scipy", methodCalls[plan.method], [2, 9])
    .status(
      "sd.scipy",
      "success",
      plan.maxError === null
        ? "Interpolated"
        : `max err ${short(plan.maxError)}`,
    )
    .caption("interpolate", { call: methodCalls[plan.method] })
    .hop("sd.l.scipy-matplotlib", job)
    .work("sd.matplotlib", "ax.plot(x_new, y_new)", [20, 60])
    .status("sd.matplotlib", "success", "figure.png")
    .caption("plot")
    .hop("sd.l.matplotlib-report", { ...job, tone: "success" })
    .status("sd.report", "success", "Report ready");
  if (plan.maxError === null)
    s.caption("doneEdited", { loo: short(plan.looError ?? 0) });
  else
    s.caption("done", {
      error: short(plan.maxError),
      loo: short(plan.looError ?? 0),
    });
  return s.build();
}
