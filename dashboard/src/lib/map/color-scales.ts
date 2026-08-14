/**
 * Color scale definitions for choropleth maps.
 * Each scale has 5 stops compatible with MapLibre `interpolate` expression.
 */

export interface ColorScale {
  id: string;
  label: string;
  property: string;
  stops: [number, string][];
  legendLabels: string[];
}

/** YlGnBu sequential — good for total voter counts (Parliament) */
const YLGNBU: [number, string][] = [
  [50000, '#ffffcc'],
  [120000, '#a1dab4'],
  [180000, '#41b6c4'],
  [240000, '#2c7fb8'],
  [340000, '#253494'],
];

/** YlGnBu for DUN — smaller range 20K–134K */
const YLGNBU_DUN: [number, string][] = [
  [20000, '#ffffcc'],
  [45000, '#a1dab4'],
  [70000, '#41b6c4'],
  [100000, '#2c7fb8'],
  [134000, '#253494'],
];

/** YlOrRd sequential — good for Malay % */
const YLORRD: [number, string][] = [
  [20, '#ffffb2'],
  [40, '#fecc5c'],
  [55, '#fd8d3c'],
  [70, '#f03b20'],
  [85, '#bd0026'],
];

/** Oranges sequential — good for Chinese % */
const ORANGES: [number, string][] = [
  [5, '#fff5eb'],
  [15, '#fee6ce'],
  [25, '#fdd0a2'],
  [40, '#fdae6b'],
  [62, '#e6550d'],
];

/** Greens sequential — good for Indian % */
const GREENS: [number, string][] = [
  [0, '#f7fcf5'],
  [5, '#e5f5e0'],
  [10, '#c7e9c0'],
  [15, '#a1d99b'],
  [25, '#31a354'],
];

/** Viridis sequential — good for mean age (Parliament ~39–48) */
const VIRIDIS: [number, string][] = [
  [39, '#440154'],
  [41, '#31688e'],
  [43, '#35b779'],
  [45, '#fde725'],
  [48, '#fde725'],
];

/** Viridis for DUN — wider range ~39–55 */
const VIRIDIS_DUN: [number, string][] = [
  [39, '#440154'],
  [42, '#31688e'],
  [45, '#35b779'],
  [50, '#fde725'],
  [55, '#fde725'],
];

/** PuBu sequential — good for contact % */
const PUBU: [number, string][] = [
  [70, '#f7fbff'],
  [74, '#c6dbef'],
  [77, '#6baed6'],
  [80, '#2171b5'],
  [83, '#08306b'],
];

/** PiYG diverging — good for female % (Parliament ~46–52) */
const PIGY: [number, string][] = [
  [46, '#e41a1c'],
  [48.5, '#f7f7f7'],
  [49, '#d4e6c3'],
  [49.5, '#a1d99b'],
  [52, '#4daf4a'],
];

/** PiYG for DUN — narrower range ~48.8–52.5 */
const PIGY_DUN: [number, string][] = [
  [48.5, '#e41a1c'],
  [49.5, '#f7f7f7'],
  [50, '#d4e6c3'],
  [51, '#a1d99b'],
  [52.5, '#4daf4a'],
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
    stops: YLGNBU,
    legendLabels: ['50K', '120K', '180K', '240K', '340K'],
  },
  {
    id: 'malay_pct',
    label: 'Malay %',
    property: 'malay_pct',
    stops: YLORRD,
    legendLabels: ['20%', '40%', '55%', '70%', '85%'],
  },
  {
    id: 'chinese_pct',
    label: 'Chinese %',
    property: 'chinese_pct',
    stops: ORANGES,
    legendLabels: ['5%', '15%', '25%', '40%', '62%'],
  },
  {
    id: 'indian_pct',
    label: 'Indian %',
    property: 'indian_pct',
    stops: GREENS,
    legendLabels: ['0%', '5%', '10%', '15%', '25%'],
  },
  {
    id: 'age_mean',
    label: 'Mean Age',
    property: 'age_mean',
    stops: VIRIDIS,
    legendLabels: ['39', '41', '43', '45', '48'],
  },
  {
    id: 'contact_pct',
    label: 'Contact %',
    property: 'contact_pct',
    stops: PUBU,
    legendLabels: ['70%', '74%', '77%', '80%', '83%'],
  },
  {
    id: 'female_pct',
    label: 'Female %',
    property: 'female_pct',
    stops: PIGY,
    legendLabels: ['46%', '48.5%', '49%', '49.5%', '52%'],
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
  },
  {
    id: 'malay_pct',
    label: 'Malay %',
    property: 'malay_pct',
    stops: YLORRD,
    legendLabels: ['20%', '40%', '55%', '70%', '85%'],
  },
  {
    id: 'chinese_pct',
    label: 'Chinese %',
    property: 'chinese_pct',
    stops: ORANGES,
    legendLabels: ['5%', '15%', '25%', '40%', '62%'],
  },
  {
    id: 'indian_pct',
    label: 'Indian %',
    property: 'indian_pct',
    stops: GREENS,
    legendLabels: ['0%', '5%', '10%', '15%', '25%'],
  },
  {
    id: 'age_mean',
    label: 'Mean Age',
    property: 'age_mean',
    stops: VIRIDIS_DUN,
    legendLabels: ['39', '42', '45', '50', '55'],
  },
  {
    id: 'contact_pct',
    label: 'Contact %',
    property: 'contact_pct',
    stops: PUBU,
    legendLabels: ['70%', '74%', '77%', '80%', '83%'],
  },
  {
    id: 'female_pct',
    label: 'Female %',
    property: 'female_pct',
    stops: PIGY_DUN,
    legendLabels: ['48.5%', '49.5%', '50%', '51%', '52.5%'],
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
