import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, getPasswordHash } from '@/lib/auth/password';
import { buildCSV } from '@/lib/csv/builder';

/**
 * POST /api/export/comparison
 *
 * Exports the comparison seats (up to 3) as a password-protected CSV.
 * The comparison data is sent from the client (not queried from D1) because
 * it's user-selected at runtime.
 *
 * Body:
 *   password - the export password
 *   seats    - array of { code, name, type, data: { ...stats } }
 *
 * Password protection: same PBKDF2 hash as all other exports.
 */

const COMPARISON_COLUMNS = [
  'Code', 'Name', 'Type', 'Total Voters',
  'Male %', 'Female %',
  'Malay %', 'Chinese %', 'Indian %', 'Others %',
  'Mean Age', 'Median Age', 'Contact %',
] as const;

export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const body = await request.json();
    const { password, seats } = body as {
      password: string;
      seats: Array<{ code: string; name: string; type: string; data: Record<string, number | string> }>;
    };

    // ── 1. Validate ─────────────────────────────────────────
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }
    if (!seats || !Array.isArray(seats) || seats.length === 0) {
      return NextResponse.json({ error: 'No seats to export' }, { status: 400 });
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

    // ── 3. Build CSV ─────────────────────────────────────────
    const rows = seats.map((s) => ({
      Code: s.code,
      Name: s.name,
      Type: s.type,
      'Total Voters': s.data.total_voters ?? '',
      'Male %': s.data.male_pct ?? '',
      'Female %': s.data.female_pct ?? '',
      'Malay %': s.data.malay_pct ?? '',
      'Chinese %': s.data.chinese_pct ?? '',
      'Indian %': s.data.indian_pct ?? '',
      'Others %': s.data.other_pct ?? '',
      'Mean Age': s.data.age_mean ?? '',
      'Median Age': s.data.age_median ?? '',
      'Contact %': s.data.contact_pct ?? '',
    }));

    const csv = buildCSV([...COMPARISON_COLUMNS], rows);

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="slgrvtrs_comparison_${seats.length}seats.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
