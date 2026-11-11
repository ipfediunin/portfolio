import type { ImpactMeasure } from "../impact";
import {
  cleanSamples,
  datasets,
  errorAgainstTruth,
  sampleDataset,
  type InterpolationMethod,
  type Point,
} from "./model";

/** Points of the Runge function: few enough for a high-degree polynomial to swing at the ends. */
const RUNGE_POINTS = 11;
/** The method compared on the raw and on the cleaned sensor readings. */
const SENSOR_METHOD: InterpolationMethod = "pchip";

const present = (point: { readonly x: number; readonly y: number | null }) =>
  point.y !== null;

/**
 * Two decisions of the pipeline, each checked against the known function behind the synthetic
 * data: cleaning the sensor readings before interpolating them, and choosing the method.
 */
export function measureScientificDataImpact(): {
  readonly cleaning: ImpactMeasure;
  readonly method: ImpactMeasure;
} {
  const readings = sampleDataset("sensor", 0);
  // Without the cleaning step only the gaps go (interpolation cannot use them); the spike stays.
  const raw = readings.filter(present) as Point[];
  const cleaned = cleanSamples(readings).points;
  const sensorTruth = datasets.sensor.truth;

  const runge = sampleDataset("runge", RUNGE_POINTS).filter(present) as Point[];
  const rungeError = (method: InterpolationMethod) =>
    errorAgainstTruth(method, runge, datasets.runge.truth).max;

  return {
    cleaning: {
      id: "cleaning",
      unit: "error",
      better: "lower",
      bars: [
        {
          id: "raw",
          value: errorAgainstTruth(SENSOR_METHOD, raw, sensorTruth).rmse,
        },
        {
          id: "cleaned",
          value: errorAgainstTruth(SENSOR_METHOD, cleaned, sensorTruth).rmse,
        },
      ],
    },
    method: {
      id: "method",
      unit: "error",
      better: "lower",
      bars: [
        { id: "lagrange", value: rungeError("lagrange") },
        { id: "spline", value: rungeError("spline") },
        { id: "pchip", value: rungeError("pchip") },
      ],
    },
  };
}
