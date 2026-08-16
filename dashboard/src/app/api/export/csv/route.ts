import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, getPasswordHash } from '@/lib/auth/password';
import {
  buildCSV,
  PARLIAMENT_COLUMNS,
  DUN_COLUMNS,
  DM_COLUMNS,
  mapParlRow,
  mapDunRow,
  mapDmRow,
} from '@/lib/csv/builder';

// Edge runtime is implicit on Cloudflare Workers via @opennextjs/cloudflare

export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const body = await request.json();
    const { password, level, code } = body as {
      password: string;
      level: 'parliament' | 'dun' | 'dm';
      code?: string;
    };

    // ── 1. Validate inputs ───────────────────────────────────
    if (!password || typeof password !== 'string' || password.length < 1) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }
    if (!['parliament', 'dun', 'dm'].includes(level)) {
      return NextResponse.json({ error: 'Invalid level. Use parliament, dun, or dm.' }, { status: 400 });
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

    // ── 3. Query D1 & build CSV ─────────────────────────────
    let csv: string;
    let filename: string;

    if (level === 'parliament') {
      const result = await env.DB
        .prepare('SELECT * FROM parliaments ORDER BY code_parlimen')
        .all();
      csv = buildCSV(
        [...PARLIAMENT_COLUMNS],
        result.results.map(mapParlRow),
      );
      filename = 'slgrvtrs_parliaments.csv';
    } else if (level === 'dun') {
      let sql: string;
      const params: (string | number)[] = [];
      if (code) {
        sql = `SELECT d.*, p.name as parliament_name
              FROM duns d JOIN parliaments p ON d.code_parlimen = p.code_parlimen
              WHERE d.code_parlimen = ? ORDER BY d.code_dun`;
        params.push(code);
      } else {
        sql = `SELECT d.*, p.name as parliament_name
              FROM duns d JOIN parliaments p ON d.code_parlimen = p.code_parlimen
              ORDER BY d.code_dun`;
      }
      const result = await env.DB.prepare(sql).bind(...params).all();
      csv = buildCSV([...DUN_COLUMNS], result.results.map(mapDunRow));
      filename = code
        ? `slgrvtrs_duns_${code.replace('.', '')}.csv`
        : 'slgrvtrs_duns.csv';
    } else {
      // DM level
      let sql: string;
      const params: (string | number)[] = [];
      if (code) {
        // Detect if code is Parliament (P.xxx) or DUN (N.xx)
        const isParl = code.startsWith('P.');
        if (isParl) {
          sql = 'SELECT * FROM dms WHERE code_parlimen = ? ORDER BY dm_code';
        } else {
          sql = 'SELECT * FROM dms WHERE dun_code = ? ORDER BY dm_code';
        }
        params.push(code);
      } else {
        sql = 'SELECT * FROM dms ORDER BY dm_code';
      }
      const result = await env.DB.prepare(sql).bind(...params).all();
      csv = buildCSV([...DM_COLUMNS], result.results.map(mapDmRow));
      const suffix = code ? `_${code.replace('.', '')}` : '';
      filename = `slgrvtrs_dms${suffix}.csv`;
    }

    // ── 4. Return CSV ────────────────────────────────────────
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
