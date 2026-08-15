import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const { env } = await getCloudflareContext({ async: true });
    const result = await env.DB
      .prepare(
        'SELECT dm_code, name, dun_code, total_voters, centroid_lng, centroid_lat FROM dms WHERE name LIKE ? LIMIT 20',
      )
      .bind(`%${q.toUpperCase()}%`)
      .all();

    return NextResponse.json({ results: result.results });
  } catch {
    return NextResponse.json({ error: 'D1 database not available' }, { status: 503 });
  }
}
