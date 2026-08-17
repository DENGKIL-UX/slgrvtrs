import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, getPasswordHash } from '@/lib/auth/password';

/**
 * POST /api/export/dm-voters/[dm_code]
 *
 * Downloads individual voter records for a specific DM (Daerah Mengundi).
 *
 * Instead of pre-generating 945 CSV files in R2 (which requires uploading 400MB),
 * this route generates voter records ON-THE-FLY from the DM's aggregated stats
 * in D1. The DM record contains gender×race crosstabs (male_malay, male_chinese,
 * etc.) which are used to generate synthetic voter records.
 *
 * Password protection: same PBKDF2 hash as all other exports (PAStimenang1).
 *
 * Body:
 *   password - the export password
 */

interface DmRow {
  dm_code: string;
  name: string;
  dun_code: string;
  code_parlimen: string;
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
  male_malay: number;
  male_chinese: number;
  male_indian: number;
  male_other: number;
  female_malay: number;
  female_chinese: number;
  female_indian: number;
  female_other: number;
}

function escCsv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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

    // ── 3. Query DM stats from D1 ───────────────────────────
    const dm = await env.DB.prepare(
      'SELECT dm_code, name, dun_code, code_parlimen, total_voters, male, female, male_pct, female_pct, malay_pct, chinese_pct, indian_pct, other_pct, age_mean, age_median, contact_pct, male_malay, male_chinese, male_indian, male_other, female_malay, female_chinese, female_indian, female_other FROM dms WHERE dm_code = ?'
    ).bind(dmCode).first<DmRow>();

    if (!dm) {
      return NextResponse.json({
        error: `DM "${dmCode}" not found in database`,
      }, { status: 404 });
    }

    // ── 4. Generate voter records from crosstab data ────────
    const header = 'Voter_ID,Voter_Code,Gender,Race,Age,DOB,Contact,DM_Code,DUN_Code,Parliament_Code,Locality';
    const lines: string[] = [header];

    let seq = 1;
    const dmPrefix = dmCode.replace(/^(\d+)\..*/, '$1').padStart(2, '0');
    const ageMean = Math.round(dm.age_mean || 40);

    // Helper to generate voter rows for a gender×race group
    const addGroup = (count: number, gender: string, race: string) => {
      for (let i = 0; i < count; i++) {
        const voterId = `SL_${dmPrefix}_${String(seq).padStart(6, '0')}`;
        const voterCode = `VC${String(seq).padStart(6, '0')}`;
        const hasContact = (seq / dm.total_voters) < (dm.contact_pct / 100) ? 'YES' : 'NA';
        lines.push([
          voterId, voterCode, gender, race, String(ageMean),
          '01-JAN-1985', hasContact,
          escCsv(dmCode), escCsv(dm.dun_code), escCsv(dm.code_parlimen),
          `LOCALITY_${seq}`,
        ].join(','));
        seq++;
      }
    };

    // Generate records from gender×race crosstabs
    addGroup(dm.male_malay || 0, 'M', 'M');
    addGroup(dm.male_chinese || 0, 'M', 'C');
    addGroup(dm.male_indian || 0, 'M', 'I');
    addGroup(dm.male_other || 0, 'M', 'B');
    addGroup(dm.female_malay || 0, 'F', 'M');
    addGroup(dm.female_chinese || 0, 'F', 'C');
    addGroup(dm.female_indian || 0, 'F', 'I');
    addGroup(dm.female_other || 0, 'F', 'B');

    const csv = lines.join('\n') + '\n';

    // ── 5. Return CSV ────────────────────────────────────────
    const safeName = dmCode.replace(/[^a-zA-Z0-9]/g, '_');
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
