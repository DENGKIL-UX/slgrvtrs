import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { env } = await getCloudflareContext();

  const dmCode = decodeURIComponent(code);

  const result = await env.DB
    .prepare('SELECT * FROM dms WHERE dm_code = ? OR dm_code LIKE ? || ".%"')
    .bind(dmCode, dmCode)
    .first();

  if (!result) {
    return NextResponse.json({ error: 'DM not found' }, { status: 404 });
  }

  return NextResponse.json(result, { headers: CACHE_HEADERS });
}
