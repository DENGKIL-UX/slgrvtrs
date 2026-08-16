/**
 * CSV string builder with proper RFC 4180 escaping.
 * Handles commas, double-quotes, and newlines in values.
 */

export function buildCSV(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  const esc = (val: unknown): string => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headerLine = headers.map(esc).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => esc(row[h])).join(','),
  );

  return [headerLine, ...dataLines].join('\n');
}

// ── Column definitions per export level ──────────────────────────

export const PARLIAMENT_COLUMNS = [
  'Code', 'Name', 'Total Voters', 'Male', 'Female',
  'Male %', 'Female %',
  'Malay %', 'Chinese %', 'Indian %', 'Others %',
  'Mean Age', 'Median Age', 'Contact %', 'DUN Count',
] as const;

export const DUN_COLUMNS = [
  'Code', 'Name', 'Parliament Code', 'Parliament Name',
  'Total Voters', 'Male', 'Female',
  'Male %', 'Female %',
  'Malay %', 'Chinese %', 'Indian %', 'Others %',
  'Mean Age', 'Median Age', 'Contact %',
  'DM Count', 'Locality Count',
] as const;

export const DM_COLUMNS = [
  'DM Code', 'Name', 'DUN Code', 'Parliament Code',
  'Total Voters', 'Male', 'Female',
  'Male %', 'Female %',
  'Malay %', 'Chinese %', 'Indian %', 'Others %',
  'Mean Age', 'Median Age', 'Contact %',
  'Male Malay', 'Male Chinese', 'Male Indian', 'Male Other',
  'Female Malay', 'Female Chinese', 'Female Indian', 'Female Other',
] as const;

// ── D1 row → CSV row mappers ─────────────────────────────────────

interface ParlRow {
  code_parlimen: string; name: string;
  total_voters: number; male: number; female: number;
  male_pct: number; female_pct: number;
  malay_pct: number; chinese_pct: number; indian_pct: number; other_pct: number;
  age_mean: number; age_median: number; contact_pct: number;
  child_dun_count: number;
}

export function mapParlRow(r: ParlRow): Record<string, unknown> {
  return {
    Code: r.code_parlimen, Name: r.name,
    'Total Voters': r.total_voters, Male: r.male, Female: r.female,
    'Male %': r.male_pct, 'Female %': r.female_pct,
    'Malay %': r.malay_pct, 'Chinese %': r.chinese_pct,
    'Indian %': r.indian_pct, 'Others %': r.other_pct,
    'Mean Age': r.age_mean, 'Median Age': r.age_median,
    'Contact %': r.contact_pct, 'DUN Count': r.child_dun_count,
  };
}

interface DunRow {
  code_dun: string; name: string;
  code_parlimen: string; parliament_name?: string;
  total_voters: number; male: number; female: number;
  male_pct: number; female_pct: number;
  malay_pct: number; chinese_pct: number; indian_pct: number; other_pct: number;
  age_mean: number; age_median: number; contact_pct: number;
  dm_count: number; locality_count: number;
}

export function mapDunRow(r: DunRow): Record<string, unknown> {
  return {
    Code: r.code_dun, Name: r.name,
    'Parliament Code': r.code_parlimen,
    'Parliament Name': r.parliament_name ?? '',
    'Total Voters': r.total_voters, Male: r.male, Female: r.female,
    'Male %': r.male_pct, 'Female %': r.female_pct,
    'Malay %': r.malay_pct, 'Chinese %': r.chinese_pct,
    'Indian %': r.indian_pct, 'Others %': r.other_pct,
    'Mean Age': r.age_mean, 'Median Age': r.age_median,
    'Contact %': r.contact_pct,
    'DM Count': r.dm_count, 'Locality Count': r.locality_count,
  };
}

interface DmRow {
  dm_code: string; name: string;
  dun_code: string; code_parlimen: string;
  total_voters: number; male: number; female: number;
  male_pct: number; female_pct: number;
  malay_pct: number; chinese_pct: number; indian_pct: number; other_pct: number;
  age_mean: number; age_median: number; contact_pct: number;
  male_malay: number; male_chinese: number; male_indian: number; male_other: number;
  female_malay: number; female_chinese: number; female_indian: number; female_other: number;
}

export function mapDmRow(r: DmRow): Record<string, unknown> {
  return {
    'DM Code': r.dm_code, Name: r.name,
    'DUN Code': r.dun_code, 'Parliament Code': r.code_parlimen,
    'Total Voters': r.total_voters, Male: r.male, Female: r.female,
    'Male %': r.male_pct, 'Female %': r.female_pct,
    'Malay %': r.malay_pct, 'Chinese %': r.chinese_pct,
    'Indian %': r.indian_pct, 'Others %': r.other_pct,
    'Mean Age': r.age_mean, 'Median Age': r.age_median,
    'Contact %': r.contact_pct,
    'Male Malay': r.male_malay, 'Male Chinese': r.male_chinese,
    'Male Indian': r.male_indian, 'Male Other': r.male_other,
    'Female Malay': r.female_malay, 'Female Chinese': r.female_chinese,
    'Female Indian': r.female_indian, 'Female Other': r.female_other,
  };
}
