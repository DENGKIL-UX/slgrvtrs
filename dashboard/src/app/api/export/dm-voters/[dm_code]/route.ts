import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, getPasswordHash } from '@/lib/auth/password';

/**
 * POST /api/export/dm-voters/[dm_code]
 *
 * Downloads individual voter records for a specific DM (Daerah Mengundi)
 * from R2 storage. The per-DM CSV files are pre-generated and stored in
 * the R2 bucket `slgrvtrs-tiles` under the `voters/` prefix.
 *
 * Password protection: same PBKDF2 hash as all other exports (PAStimenang1).
 *
 * Body:
 *   password - the export password
 *
 * Response:
 *   Content-Type: text/csv
 *   Content-Disposition: attachment; filename="voters_{dm_code}.csv"
 *
 * R2 key format: voters/{sanitized_dm_code}.csv
 *   - DM code "01.BANDAR MELAWATI" → key "voters/01_BANDAR_MELAWATI.csv"
 *   - Dots, spaces, and slashes are replaced with underscores
 */

function sanitizeDmCode(dmCode: string): string {
  return dmCode
    .replace(/\//g, '_')
    .replace(/ /g, '_')
    .replace(/\./g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dm_code: string }> },
) {
  try {
    const { dm_code: rawDmCode } = await params;
    const dmCode = decodeURIComponent(rawDmCode);
    const { env } = await getCloudflareContext();

    const reqBody = await request.json();
    const { password } = reqBody as { password: string };

    // ── 1. Validate ─────────────────────────────────────────
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    // ── 2. Verify password ───────────────────────────────────
    const storedHash = await getPasswordHash(env.DB);
    if (!storedHash) {
      return NextResponse.json({ error: 'Export password not set.' }, { status: 403 });
    }
    const valid = await verifyPassword(storedHash, password);
    if (!valid) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    // ── 3. Fetch pre-generated CSV from R2 ──────────────────
    const safeName = sanitizeDmCode(dmCode);
    const r2Key = `voters/${safeName}.csv`;
    const object = await env.TILES.get(r2Key);

    if (!object) {
      return NextResponse.json({
        error: `Voter data for DM "${dmCode}" not found in R2`,
        hint: `Looked for key: ${r2Key}`,
      }, { status: 404 });
    }

    // ── 4. Return CSV ────────────────────────────────────────
    const body = (object as any).body || (object as any).readableStream || object;
    const csv = typeof body === 'string' ? body : await new Response(body).text();

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="voters_${safeName}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
