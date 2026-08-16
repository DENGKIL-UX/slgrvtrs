/**
 * Color scale definitions for choropleth maps.
 * Each scale has 5 stops compatible with MapLibre `interpolate` expression.
 * Both Parliament (22 seats) and DUN (56 seats) scales are provided.
 */

export interface ColorScale {
  id: string;
  label: string;
  property: string;
  stops: [number, string][];
  legendLabels: string[];
  /** If true, this metric is meaningful for DUN-level choropleth */
  dunApplicable: boolean;
}

/** YlGnBu sequential — total voter counts */
const YLGNBU_PARL: [number, string][] = [
  [50000, '#ffffcc'],
  [120000, '#a1dab4'],
  [180000, '#41b6c4'],
  [240000, '#2c7fb8'],
  [340000, '#253494'],
];
const YLGNBU_DUN: [number, string][] = [
  [20000, '#ffffcc'],
  [45000, '#a1dab4'],
  [70000, '#41b6c4'],
  [100000, '#2c7fb8'],
  [134000, '#253494'],
];

/** YlOrRd sequential — Malay % (Parl 24–83, DUN 13–88) */
const YLORRD: [number, string][] = [
  [15, '#ffffb2'],
  [35, '#fecc5c'],
  [55, '#fd8d3c'],
  [70, '#f03b20'],
  [90, '#bd0026'],
];

/** Oranges sequential — Chinese % (Parl 11–62, DUN 6–69) */
const ORANGES: [number, string][] = [
  [5, '#fff5eb'],
  [15, '#fee6ce'],
  [25, '#fdd0a2'],
  [40, '#fdae6b'],
  [70, '#e6550d'],
];

/** Greens sequential — Indian % (Parl 2–24, DUN 1–38) */
const GREENS: [number, string][] = [
  [0, '#f7fcf5'],
  [5, '#e5f5e0'],
  [10, '#c7e9c0'],
  [20, '#a1d99b'],
  [40, '#31a354'],
];

/** Purples sequential — Others % (Parl 0–15, DUN 0–23) */
const PURPLES: [number, string][] = [
  [0, '#fcfbfd'],
  [3, '#efedf5'],
  [6, '#dadaeb'],
  [10, '#bcbddc'],
  [24, '#756bb1'],
];

/** BuPu diverging — Male % (Parl 48.5–50.5, DUN 47.5–51.2) */
const BUPU_MALE: [number, string][] = [
  [47, '#f1eef6'],
  [48, '#d0d1e6'],
  [49, '#a6bddb'],
  [50, '#74a9cf'],
  [52, '#0570b0'],
];

/** PiYG diverging — Female % (Parl 49.5–51.5, DUN 48.8–52.5) */
const PIGY_FEMALE: [number, string][] = [
  [48, '#e41a1c'],
  [49, '#f7f7f7'],
  [50, '#d4e6c3'],
  [51, '#a1d99b'],
  [53, '#4daf4a'],
];

/** Viridis sequential — Mean Age (Parl 40–47, DUN 39–55) */
const VIRIDIS_PARL: [number, string][] = [
  [40, '#440154'],
  [42, '#31688e'],
  [44, '#35b779'],
  [45, '#fde725'],
  [48, '#fde725'],
];
const VIRIDIS_DUN: [number, string][] = [
  [39, '#440154'],
  [42, '#31688e'],
  [45, '#35b779'],
  [50, '#fde725'],
  [55, '#fde725'],
];

/** Magma sequential — Median Age (Parl 37–46, DUN 36–55) */
const MAGMA_PARL: [number, string][] = [
  [37, '#0d0887'],
  [39, '#6a00a8'],
  [41, '#b12a90'],
  [43, '#e16462'],
  [46, '#fcfdbf'],
];
const MAGMA_DUN: [number, string][] = [
  [36, '#0d0887'],
  [40, '#6a00a8'],
  [44, '#b12a90'],
  [49, '#e16462'],
  [55, '#fcfdbf'],
];

/** PuBu sequential — Contact % (Parl 72–82, DUN: constant 76.84 — not useful for DUN) */
const PUBU_PARL: [number, string][] = [
  [72, '#f7fbff'],
  [75, '#c6dbef'],
  [78, '#6baed6'],
  [80, '#2171b5'],
  [83, '#08306b'],
];
const PUBU_DUN: [number, string][] = [
  [76, '#f7fbff'],
  [76.5, '#c6dbef'],
  [77, '#6baed6'],
  [77.5, '#2171b5'],
  [78, '#08306b'],
];

/** @type {import('maplibre-gl').DataDrivenPropertyValueSpecification<string>} */
export type ColorExpression = any;

/**
 * Build a MapLibre `interpolate` expression for a fill-color paint property.
 */
export function buildColorExpression(
  property: string,
  stops: [number, string][],
): ColorExpression {
  const expr: any[] = ['interpolate', ['linear'], ['get', property]];
  for (const [value, color] of stops) {
    expr.push(value, color);
  }
  return expr;
}

/**
 * Parliament choropleth metric options.
 */
export const PARL_COLOR_SCALES: ColorScale[] = [
  {
    id: 'total_voters',
    label: 'Total Voters',
    property: 'total_voters',
    stops: YLGNBU_PARL,
    legendLabels: ['50K', '120K', '180K', '240K', '340K'],
    dunApplicable: true,
  },
  {
    id: 'male_pct',
    label: 'Male %',
    property: 'male_pct',
    stops: BUPU_MALE,
    legendLabels: ['47%', '48%', '49%', '50%', '52%'],
    dunApplicable: true,
  },
  {
    id: 'female_pct',
    label: 'Female %',
    property: 'female_pct',
    stops: PIGY_FEMALE,
    legendLabels: ['48%', '49%', '50%', '51%', '53%'],
    dunApplicable: true,
  },
  {
    id: 'malay_pct',
    label: 'Malay %',
    property: 'malay_pct',
    stops: YLORRD,
    legendLabels: ['15%', '35%', '55%', '70%', '90%'],
    dunApplicable: true,
  },
  {
    id: 'chinese_pct',
    label: 'Chinese %',
    property: 'chinese_pct',
    stops: ORANGES,
    legendLabels: ['5%', '15%', '25%', '40%', '70%'],
    dunApplicable: true,
  },
  {
    id: 'indian_pct',
    label: 'Indian %',
    property: 'indian_pct',
    stops: GREENS,
    legendLabels: ['0%', '5%', '10%', '20%', '40%'],
    dunApplicable: true,
  },
  {
    id: 'other_pct',
    label: 'Others %',
    property: 'other_pct',
    stops: PURPLES,
    legendLabels: ['0%', '3%', '6%', '10%', '24%'],
    dunApplicable: true,
  },
  {
    id: 'age_mean',
    label: 'Mean Age',
    property: 'age_mean',
    stops: VIRIDIS_PARL,
    legendLabels: ['40', '42', '44', '45', '48'],
    dunApplicable: true,
  },
  {
    id: 'age_median',
    label: 'Median Age',
    property: 'age_median',
    stops: MAGMA_PARL,
    legendLabels: ['37', '39', '41', '43', '46'],
    dunApplicable: true,
  },
  {
    id: 'contact_pct',
    label: 'Contact %',
    property: 'contact_pct',
    stops: PUBU_PARL,
    legendLabels: ['72%', '75%', '78%', '80%', '83%'],
    dunApplicable: false, // DUN contact_pct is constant (76.84)
  },
];

/**
 * DUN choropleth metric options — same metrics but scales tuned for DUN ranges.
 */
export const DUN_COLOR_SCALES: ColorScale[] = [
  {
    id: 'total_voters',
    label: 'Total Voters',
    property: 'total_voters',
    stops: YLGNBU_DUN,
    legendLabels: ['20K', '45K', '70K', '100K', '134K'],
    dunApplicable: true,
  },
  {
    id: 'male_pct',
    label: 'Male %',
    property: 'male_pct',
    stops: BUPU_MALE,
    legendLabels: ['47%', '48%', '49%', '50%', '52%'],
    dunApplicable: true,
  },
  {
    id: 'female_pct',
    label: 'Female %',
    property: 'female_pct',
    stops: PIGY_FEMALE,
    legendLabels: ['48%', '49%', '50%', '51%', '53%'],
    dunApplicable: true,
  },
  {
    id: 'malay_pct',
    label: 'Malay %',
    property: 'malay_pct',
    stops: YLORRD,
    legendLabels: ['15%', '35%', '55%', '70%', '90%'],
    dunApplicable: true,
  },
  {
    id: 'chinese_pct',
    label: 'Chinese %',
    property: 'chinese_pct',
    stops: ORANGES,
    legendLabels: ['5%', '15%', '25%', '40%', '70%'],
    dunApplicable: true,
  },
  {
    id: 'indian_pct',
    label: 'Indian %',
    property: 'indian_pct',
    stops: GREENS,
    legendLabels: ['0%', '5%', '10%', '20%', '40%'],
    dunApplicable: true,
  },
  {
    id: 'other_pct',
    label: 'Others %',
    property: 'other_pct',
    stops: PURPLES,
    legendLabels: ['0%', '3%', '6%', '10%', '24%'],
    dunApplicable: true,
  },
  {
    id: 'age_mean',
    label: 'Mean Age',
    property: 'age_mean',
    stops: VIRIDIS_DUN,
    legendLabels: ['39', '42', '45', '50', '55'],
    dunApplicable: true,
  },
  {
    id: 'age_median',
    label: 'Median Age',
    property: 'age_median',
    stops: MAGMA_DUN,
    legendLabels: ['36', '40', '44', '49', '55'],
    dunApplicable: true,
  },
];

/** Backwards-compatible alias */
export const COLOR_SCALES = PARL_COLOR_SCALES;

export function getScaleById(id: string): ColorScale {
  return PARL_COLOR_SCALES.find((s) => s.id === id) ?? PARL_COLOR_SCALES[0];
}

export function getDunScaleById(id: string): ColorScale {
  return DUN_COLOR_SCALES.find((s) => s.id === id) ?? DUN_COLOR_SCALES[0];
}
