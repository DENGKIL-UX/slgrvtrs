import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

interface DMRow {
  dm_code: string;
  name: string;
  dun_code: string;
  code_parlimen: string;
  voter_prefix: string;
  dun_prefix: string;
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
  centroid_lng: number | null;
  centroid_lat: number | null;
  male_malay: number;
  male_chinese: number;
  male_indian: number;
  male_other: number;
  female_malay: number;
  female_chinese: number;
  female_indian: number;
  female_other: number;
}

function rowToFeature(row: DMRow): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: {
      dm_code: row.dm_code,
      dun_code: row.dun_code,
      dun_prefix: row.dun_prefix,
      code_parlimen: row.code_parlimen,
      total_voters: row.total_voters,
      male: row.male,
      female: row.female,
      male_pct: row.male_pct,
      female_pct: row.female_pct,
      malay_pct: row.malay_pct,
      chinese_pct: row.chinese_pct,
      indian_pct: row.indian_pct,
      other_pct: row.other_pct,
      age_mean: row.age_mean,
      age_median: row.age_median,
      contact_pct: row.contact_pct,
      male_malay: row.male_malay,
      male_chinese: row.male_chinese,
      male_indian: row.male_indian,
      male_other: row.male_other,
      female_malay: row.female_malay,
      female_chinese: row.female_chinese,
      female_indian: row.female_indian,
      female_other: row.female_other,
    },
    geometry: row.centroid_lng && row.centroid_lat
      ? { type: 'Point' as const, coordinates: [row.centroid_lng, row.centroid_lat] }
      : { type: 'Point' as const, coordinates: [0, 0] },
  };
}

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { env } = await getCloudflareContext();

  const format = searchParams.get('format') || 'geojson';
  const dun = searchParams.get('dun');
  const parl = searchParams.get('parl');
  const minVoters = searchParams.get('min_voters');
  const maxVoters = searchParams.get('max_voters');

  let sql = 'SELECT * FROM dms WHERE 1=1';
  const params: (string | number)[] = [];

  if (dun) {
    sql += ' AND dun_prefix = ?';
    params.push(dun.padStart(2, '0'));
  }
  if (parl) {
    sql += ' AND voter_prefix = ?';
    params.push(parl.padStart(3, '0'));
  }
  if (minVoters) {
    sql += ' AND total_voters >= ?';
    params.push(Number(minVoters));
  }
  if (maxVoters) {
    sql += ' AND total_voters <= ?';
    params.push(Number(maxVoters));
  }

  sql += ' ORDER BY total_voters DESC';

  const result = await env.DB.prepare(sql).bind(...params).all<DMRow>();

  if (format === 'json') {
    return NextResponse.json(
      { total: result.results.length, data: result.results },
      { headers: CACHE_HEADERS }
    );
  }

  const features = result.results.map(rowToFeature);

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  };

  return NextResponse.json(geojson, { headers: CACHE_HEADERS });
}
