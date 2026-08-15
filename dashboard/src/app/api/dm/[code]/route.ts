import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const dmCode = decodeURIComponent(code);

  try {
    const { env } = await getCloudflareContext({ async: true });
    const row = await env.DB
      .prepare('SELECT * FROM dms WHERE dm_code = ? OR dm_code LIKE ? || ".%"')
      .bind(dmCode, dmCode)
      .first();

    if (!row) {
      return NextResponse.json({ error: 'DM not found', code: dmCode }, { status: 404 });
    }

    return NextResponse.json(row, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch {
    return NextResponse.json({ error: 'D1 database not available' }, { status: 503 });
  }
}
