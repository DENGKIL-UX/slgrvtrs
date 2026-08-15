import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const { env } = await getCloudflareContext();

  if (q.length < 2) {
    return NextResponse.json({ results: [] }, { headers: CACHE_HEADERS });
  }

  const result = await env.DB
    .prepare(
      'SELECT dm_code, name, dun_code, total_voters, centroid_lng, centroid_lat \
       FROM dms WHERE name LIKE ? LIMIT 20'
    )
    .bind(`%${q.toUpperCase()}%`)
    .all();

  return NextResponse.json({ results: result.results }, { headers: CACHE_HEADERS });
}
