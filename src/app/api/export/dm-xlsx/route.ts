import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, getPasswordHash } from '@/lib/auth/password';
import { buildCSV, DM_COLUMNS, mapDmRow } from '@/lib/csv/builder';

/**
 * POST /api/export/dm-xlsx
 *
 * Exports ALL 945 DMs as a CSV file (one row per DM, sorted by DM code).
 * This is the "download all DMs sorted" endpoint.
 *
 * The DM data is read from D1, sorted by dm_code, and returned as a CSV
 * (not xlsx — xlsx generation requires a library like ExcelJS which is
 * too heavy for CF Workers free tier; CSV can be opened in Excel directly).
 *
 * Password protection: same as /api/export/csv — uses PBKDF2 hash from
 * the app_settings table. Password must match.
 *
 * Body:
 *   password - the export password (e.g. "PAStimenang1")
 *
 * Response:
 *   Content-Type: text/csv
 *   Content-Disposition: attachment; filename="slgrvtrs_all_945_dms_sorted.csv"
 */

export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const body = await request.json();
    const { password } = body as { password: string };

    // ── 1. Validate ─────────────────────────────────────────
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    // ── 2. Verify password ───────────────────────────────────
    const storedHash = await getPasswordHash(env.DB);
    if (!storedHash) {
      return NextResponse.json({ error: 'Export password not set. Set it in Settings (gear icon).' }, { status: 403 });
    }
    const valid = await verifyPassword(storedHash, password);
    if (!valid) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    // ── 3. Query all 945 DMs sorted by dm_code ────────────────
    const result = await env.DB.prepare(
      'SELECT * FROM dms ORDER BY dm_code ASC'
    ).all();

    // ── 4. Build CSV ──────────────────────────────────────────
    const csv = buildCSV([...DM_COLUMNS], result.results.map(mapDmRow));

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="slgrvtrs_all_945_dms_sorted.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
