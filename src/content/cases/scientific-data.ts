import type { Locale } from "@/i18n/config";
import type { ScientificDataCaption } from "@/simulation/cases/scientific-data/compile";
import type {
  DatasetId,
  InterpolationMethod,
} from "@/simulation/cases/scientific-data/model";
import { measureScientificDataImpact } from "@/simulation/cases/scientific-data/impact";

import type { CaseGlanceInput, CaseRecordInput } from "../schema";

export const scientificDataProject = {
  slug: "scientific-data",
  published: true,
  basis: "practice",
  order: 2,
  title: "Scientific Data Processing",
  subtitle: {
    ru: "Математическая обработка, интерполяция и визуализация данных",
    en: "Numerical processing, interpolation and visualisation of data",
  },
  direction: "Data Engineering / Scientific Computing / Python",
  summary: {
    ru: "Программные инструменты для числовых данных: подготовка наборов данных, численные методы и интерполяция, графики для сравнения исходных и обработанных значений.",
    en: "Software tools for numerical data: preparing datasets, numerical methods and interpolation, and plots that compare the original and the processed values.",
  },
  scene: { world: "scientific-data", view: "system" },
  stack: ["Python", "NumPy", "SciPy", "Pandas", "Matplotlib"],
  technologies: ["data-science"],
} satisfies CaseRecordInput;

export interface ScientificDataDemoContent {
  readonly idle: string;
  readonly captions: Readonly<Record<ScientificDataCaption, string>>;
  readonly datasets: Readonly<
    Record<DatasetId, { readonly name: string; readonly hint: string }>
  >;
  readonly methods: Readonly<Record<InterpolationMethod, string>>;
  readonly labels: {
    readonly controls: string;
    readonly dataset: string;
    readonly points: string;
    readonly fixedReadings: string;
    readonly method: string;
    readonly run: string;
    readonly reset: string;
    readonly chart: string;
    readonly chartLabel: string;
    readonly truth: string;
    readonly data: string;
    readonly removed: string;
    readonly point: string;
    readonly editHint: string;
    readonly compare: string;
    readonly maxError: string;
    readonly loo: string;
    readonly synthetic: string;
    readonly edited: string;
    readonly cleaned: string;
  };
}

export const scientificDataDemo: Readonly<
  Record<Locale, ScientificDataDemoContent>
> = {
  ru: {
    idle: "Выберите данные и метод, подвигайте точки, затем запустите конвейер — данные пройдут Pandas, NumPy, SciPy и Matplotlib.",
    captions: {
      load: "Pandas читает {rows} строк исходных данных.",
      clean:
        "Очистка: удалено пропусков — {missing}, выбросов — {outliers}. Выброс — точка, далёкая от прямой между соседями.",
      arrays:
        "Чистые значения переходят в массивы NumPy: {points} точек float64.",
      interpolate: "SciPy строит интерполяцию: {call}.",
      plot: "Matplotlib рисует исходные точки и восстановленную кривую.",
      done: "Готово. Максимальная ошибка против исходной функции — {error}, leave-one-out RMSE — {loo}.",
      doneEdited:
        "Готово. Точки изменены вручную, поэтому оценка только leave-one-out: RMSE {loo}.",
    },
    datasets: {
      sine: {
        name: "Синусоида",
        hint: "Гладкий сигнал: сплайн восстанавливает его почти без ошибки, ломаная заметно хуже.",
      },
      runge: {
        name: "Функция Рунге",
        hint: "Полином высокой степени по равномерным точкам раскачивается у краёв — эффект Рунге. Сплайн устойчив.",
      },
      steps: {
        name: "Ступенька",
        hint: "Резкий монотонный переход: обычный сплайн перелетает ступеньку, PCHIP сохраняет монотонность.",
      },
      sensor: {
        name: "Датчик",
        hint: "Запись с шумом, двумя пропусками и одним выбросом: сначала очистка, потом интерполяция.",
      },
    },
    methods: {
      linear: "Линейная",
      spline: "Сплайн",
      pchip: "PCHIP",
      lagrange: "Лагранж",
    },
    labels: {
      controls: "Данные и метод",
      dataset: "Набор данных",
      points: "Точек: {count}",
      fixedReadings: "{count} показание — частота записи датчика фиксирована.",
      method: "Метод интерполяции",
      run: "Запустить конвейер",
      reset: "Вернуть точки",
      chart: "График",
      chartLabel: "Точки данных и интерполяция методом «{method}»",
      truth: "Исходная функция",
      data: "Точки",
      removed: "Удалены при очистке",
      point: "Точка {index}: x = {x}, y = {y}",
      editHint:
        "Точки можно тянуть мышью или пальцем, а с клавиатуры — двигать стрелками ↑ ↓.",
      compare: "Сравнение методов",
      maxError: "Макс. ошибка",
      loo: "LOO RMSE",
      synthetic:
        "Данные синтетические: исходная функция известна, поэтому ошибку можно посчитать честно. LOO — каждая точка по очереди предсказывается по остальным.",
      edited:
        "Точки изменены — сравнение с исходной функцией недоступно, остаётся leave-one-out.",
      cleaned: "Очистка: пропусков −{missing}, выбросов −{outliers}.",
    },
  },
  en: {
    idle: "Pick the data and a method, move the points, then run the pipeline — the data goes through Pandas, NumPy, SciPy and Matplotlib.",
    captions: {
      load: "Pandas reads {rows} rows of source data.",
      clean:
        "Cleaning: {missing} gaps and {outliers} outliers removed. An outlier is a point far from the line between its neighbours.",
      arrays: "The clean values become NumPy arrays: {points} float64 points.",
      interpolate: "SciPy builds the interpolation: {call}.",
      plot: "Matplotlib plots the source points and the restored curve.",
      done: "Done. Maximum error against the original function is {error}; leave-one-out RMSE is {loo}.",
      doneEdited:
        "Done. The points were edited by hand, so only leave-one-out applies: RMSE {loo}.",
    },
    datasets: {
      sine: {
        name: "Sine wave",
        hint: "A smooth signal: the spline restores it almost exactly, straight segments do noticeably worse.",
      },
      runge: {
        name: "Runge function",
        hint: "A high-degree polynomial through evenly spaced points swings near the ends — Runge's phenomenon. The spline stays stable.",
      },
      steps: {
        name: "Step",
        hint: "A sharp monotone transition: a plain spline overshoots it, PCHIP keeps it monotone.",
      },
      sensor: {
        name: "Sensor",
        hint: "A recording with noise, two gaps and one outlier: cleaning first, interpolation second.",
      },
    },
    methods: {
      linear: "Linear",
      spline: "Spline",
      pchip: "PCHIP",
      lagrange: "Lagrange",
    },
    labels: {
      controls: "Data and method",
      dataset: "Dataset",
      points: "Points: {count}",
      fixedReadings: "{count} readings — the sensor's sampling rate is fixed.",
      method: "Interpolation method",
      run: "Run the pipeline",
      reset: "Reset the points",
      chart: "Plot",
      chartLabel: "Data points and the “{method}” interpolation",
      truth: "Original function",
      data: "Points",
      removed: "Removed by cleaning",
      point: "Point {index}: x = {x}, y = {y}",
      editHint:
        "Drag the points with a mouse or a finger, or move them with the ↑ ↓ keys.",
      compare: "Methods compared",
      maxError: "Max error",
      loo: "LOO RMSE",
      synthetic:
        "The data is synthetic: the original function is known, so the error can be measured honestly. LOO predicts each point in turn from the others.",
      edited:
        "The points were edited, so there is no comparison with the original function; leave-one-out remains.",
      cleaned: "Cleaning: −{missing} gaps, −{outliers} outliers.",
    },
  },
};

const measures = measureScientificDataImpact();

/** The case at a glance: before and after, what the approach changes in the model, what I did. */
export const scientificDataGlance = {
  before: [
    "Gaps and outliers in the measurements",
    "Readings taken at a step other than the one needed",
    "Hard to check how processed values relate to the original",
  ],
  after: [
    "Data is cleaned before any computation",
    "Values in between are restored by a method chosen for the data",
    "Plots compare the processed values with the original ones",
  ],
  did: [
    "Import and preparation tools in Python",
    "Cleaning and transformation with Pandas",
    "Interpolation with NumPy and SciPy",
    "Comparison plots with Matplotlib",
  ],
  charts: [
    {
      measure: measures.cleaning,
      title: "Error after cleaning",
      figure: "ratio",
      caption: "smaller error once the gaps and the spike are handled",
      bars: {
        raw: "Raw readings, spike kept",
        cleaned: "Cleaned readings",
      },
      method:
        "A sensor recording with gaps and a spike, PCHIP interpolation, RMSE against the true signal.",
    },
    {
      measure: measures.method,
      title: "Choosing the method",
      figure: "ratio",
      caption: "smaller worst-case error than a high-degree polynomial",
      bars: {
        lagrange: "Polynomial through all points",
        spline: "Cubic spline",
        pchip: "PCHIP",
      },
      method:
        "The Runge function from 11 even points; the largest deviation from the true curve.",
    },
  ],
} satisfies CaseGlanceInput;
