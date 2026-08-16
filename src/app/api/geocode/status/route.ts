import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { env } = await getCloudflareContext();

    // Total DMs
    const totalRow = await env.DB.prepare(`SELECT count(*) as cnt FROM dms`).first<{ cnt: number }>();
    const totalDms = totalRow?.cnt ?? 0;

    // Geocoded vs unresolved
    const statusRow = await env.DB.prepare(
      `SELECT
        count(CASE WHEN gc.accuracy_level != 'unresolved' THEN 1 END) as geocoded,
        count(CASE WHEN gc.accuracy_level = 'unresolved' THEN 1 END) as unresolved
       FROM dms d
       LEFT JOIN geocode_cache gc ON gc.dm_code = d.dm_code
         AND gc.expires_at > datetime('now')`
    ).first<{ geocoded: number; unresolved: number }>();

    // By source
    const sourceRows = await env.DB.prepare(
      `SELECT source, count(*) as cnt
       FROM geocode_cache
       WHERE expires_at > datetime('now') AND accuracy_level != 'unresolved'
       GROUP BY source`
    ).all<{ source: string; cnt: number }>();

    const bySource: Record<string, number> = {};
    for (const row of sourceRows.results) {
      bySource[row.source || 'unknown'] = row.cnt;
    }

    // By accuracy
    const accuracyRows = await env.DB.prepare(
      `SELECT accuracy_level, count(*) as cnt
       FROM geocode_cache
       WHERE expires_at > datetime('now')
       GROUP BY accuracy_level`
    ).all<{ accuracy_level: string; cnt: number }>();

    const byAccuracy: Record<string, number> = {};
    for (const row of accuracyRows.results) {
      byAccuracy[row.accuracy_level] = row.cnt;
    }

    return NextResponse.json(
      {
        total_dms: totalDms,
        geocoded: statusRow?.geocoded ?? 0,
        unresolved: statusRow?.unresolved ?? 0,
        by_source: bySource,
        by_accuracy: byAccuracy,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    );
  } catch (error) {
    console.error('Geocode status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
