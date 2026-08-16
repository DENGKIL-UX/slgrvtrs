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

export interface DunStats {
  code_dun: string;
  name: string;
  code_parlimen: string;
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
  dm_count: number;
  locality_count: number;
}

export type ParlStatsMap = Record<string, ParliamentStats>;
export type DunStatsMap = Record<string, DunStats>;

/** Backwards-compatible alias */
export type StatsMap = ParlStatsMap;

/**
 * Join pre-computed voter stats into GeoJSON feature properties
 * by matching on the specified code field.
 */
export function joinStatsToGeoJSON<T>(
  geojson: GeoJSON.FeatureCollection,
  stats: Record<string, T>,
  codeField = 'voter_prefix',
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
