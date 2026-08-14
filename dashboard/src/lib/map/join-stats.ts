export interface ParliamentStats {
  code_parlimen: string;
  name: string;
  total_voters: number;
  male: number;
  female: number;
  male_pct: number;
  female_pct: number;
  malay_pct: number;
  chinese_pct: number;
  indian_pct: number;
  other_pct: number;
  age_mean: number;
  age_median: number;
  contact_pct: number;
  child_dun_count: number;
}

export type StatsMap = Record<string, ParliamentStats>;

/**
 * Join pre-computed voter stats into GeoJSON feature properties
 * by matching on the `voter_prefix` field.
 */
export function joinStatsToGeoJSON(
  geojson: GeoJSON.FeatureCollection,
  stats: StatsMap,
  codeField = "voter_prefix"
): GeoJSON.FeatureCollection {
  return {
    ...geojson,
    features: geojson.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        ...(stats[String(f.properties?.[codeField])] ?? {}),
      },
    })),
  };
}
