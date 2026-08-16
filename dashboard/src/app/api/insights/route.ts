import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/insights
 *
 * Generates natural-language analytical insights about a constituency
 * (or the whole state) using Cloudflare AI Workers (Llama 3.3 70B).
 *
 * This route queries the D1 database for voter statistics, then calls
 * the Cloudflare AI Workers API to generate 3-5 insight bullets.
 *
 * Body:
 *   type    - "parliament" | "dun" | "dm" | "state"
 *   code    - the constituency code (required unless type === "state")
 *
 * Architecture:
 *   D1 query (CPU-billed) → JSON payload → CF AI Workers fetch (not CPU-billed) → response
 *
 * The CF AI call uses the Workers AI binding or the REST API.
 * On CF Workers, we use `env.AI.run()` (binding). In local dev (not on CF),
 * we fall back to the REST API with the account ID + API token.
 *
 * Model: @cf/meta/llama-3.3-70b-instruct-fp8-fast
 *   - 70B parameter model, FP8 quantized for speed
 *   - Free tier: 10,000 neurons/day
 *   - Cost: ~7 neurons per request (well within free tier)
 */

// ── CF AI Configuration ────────────────────────────────────

const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// For local dev / fallback REST API calls (when AI binding is not available)
// These should be set as environment variables — never commit real tokens.
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || '';
const CF_AI_API_TOKEN = process.env.CF_AI_API_TOKEN || '';

// ── D1 row types ───────────────────────────────────────────

interface ParlRow {
  code_parlimen: string; name: string; total_voters: number;
  male: number; female: number;
  male_pct: number; female_pct: number;
  malay_pct: number; chinese_pct: number; indian_pct: number; other_pct: number;
  age_mean: number; age_median: number; contact_pct: number;
  child_dun_count: number;
}
interface DunRow {
  code_dun: string; name: string; code_parlimen: string;
  total_voters: number; male: number; female: number;
  male_pct: number; female_pct: number;
  malay_pct: number; chinese_pct: number; indian_pct: number; other_pct: number;
  age_mean: number; age_median: number; contact_pct: number;
  dm_count: number; locality_count: number;
}
interface DmRow {
  dm_code: string; name: string; dun_code: string; code_parlimen: string;
  total_voters: number; male: number; female: number;
  male_pct: number; female_pct: number;
  malay_pct: number; chinese_pct: number; indian_pct: number; other_pct: number;
  age_mean: number; age_median: number; contact_pct: number;
  male_malay: number; male_chinese: number; male_indian: number; male_other: number;
  female_malay: number; female_chinese: number; female_indian: number; female_other: number;
}

/**
 * Call the Cloudflare AI Workers API to generate insights.
 *
 * On CF Workers, uses `env.AI.run()` (binding). In local dev, falls back
 * to the REST API.
 */
async function generateInsights(
  systemPrompt: string,
  userPrompt: string,
  env: any,
): Promise<string> {
  // Try CF AI binding first (available on CF Workers)
  if (env.AI) {
    const response: any = await env.AI.run(AI_MODEL, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 500,
    });
    // CF AI binding returns various formats depending on the model:
    // - { response: string } for text-generation models (Llama, etc.)
    // - A ReadableStream (if streaming)
    // - { choices: [{ message: { content: string } }] } for some models
    if (typeof response === 'string') return response;
    if (response?.response && typeof response.response === 'string') return response.response;
    if (response?.choices?.[0]?.message?.content) return response.choices[0].message.content;
    // Last resort: stringify
    return JSON.stringify(response);
  }

  // Fallback: REST API (for local dev or when AI binding is not configured)
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${AI_MODEL}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_AI_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 500,
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => 'AI request failed');
    throw new Error(`CF AI API error: ${res.status} — ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as any;
  if (!data.success) {
    throw new Error(`CF AI error: ${JSON.stringify(data.errors)}`);
  }

  return data.result?.response ?? '';
}

export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext();
    const body = await request.json();
    const { type, code } = body as { type: 'parliament' | 'dun' | 'dm' | 'state'; code?: string };

    // ── Build the data payload for the LLM ──────────────────
    let payload: Record<string, unknown> = {};
    let label = 'Selangor (statewide)';

    if (type === 'state') {
      const { results: parls } = await env.DB.prepare(
        'SELECT code_parlimen, name, total_voters, male, female, male_pct, female_pct, malay_pct, chinese_pct, indian_pct, other_pct, age_mean, age_median, contact_pct, child_dun_count FROM parliaments'
      ).all<ParlRow>();
      const { results: duns } = await env.DB.prepare('SELECT COUNT(*) as c FROM duns').all<{ c: number }>();
      const { results: dms } = await env.DB.prepare('SELECT COUNT(*) as c FROM dms').all<{ c: number }>();

      const totalVoters = parls.reduce((s, p) => s + p.total_voters, 0);
      const avgMalay = parls.reduce((s, p) => s + (p.malay_pct / 100) * p.total_voters, 0) / totalVoters;
      const avgChinese = parls.reduce((s, p) => s + (p.chinese_pct / 100) * p.total_voters, 0) / totalVoters;
      const avgIndian = parls.reduce((s, p) => s + (p.indian_pct / 100) * p.total_voters, 0) / totalVoters;
      const avgAge = parls.reduce((s, p) => s + (p.age_mean * p.total_voters), 0) / totalVoters;
      const largest = parls.reduce((a, b) => (a.total_voters > b.total_voters ? a : b));
      const smallest = parls.reduce((a, b) => (a.total_voters < b.total_voters ? a : b));

      payload = {
        scope: 'statewide',
        parliaments: parls.length,
        duns: duns[0]?.c ?? 0,
        dms: dms[0]?.c ?? 0,
        total_voters: totalVoters,
        race_mix: { malay_pct: +avgMalay.toFixed(1), chinese_pct: +avgChinese.toFixed(1), indian_pct: +avgIndian.toFixed(1) },
        avg_age: +avgAge.toFixed(1),
        largest_parliament: largest,
        smallest_parliament: smallest,
      };
    } else if (type === 'parliament') {
      const seat = await env.DB.prepare(
        'SELECT code_parlimen, name, total_voters, male, female, male_pct, female_pct, malay_pct, chinese_pct, indian_pct, other_pct, age_mean, age_median, contact_pct, child_dun_count FROM parliaments WHERE code_parlimen = ?'
      ).bind(code!).first<ParlRow>();
      if (!seat) return NextResponse.json({ error: 'Parliament not found' }, { status: 404 });

      const { results: childDuns } = await env.DB.prepare(
        'SELECT code_dun, name, total_voters, malay_pct, chinese_pct, indian_pct, age_mean FROM duns WHERE code_parlimen = ? ORDER BY total_voters DESC'
      ).bind(code!).all<DunRow>();

      const { results: rankRow } = await env.DB.prepare(
        'SELECT COUNT(*) + 1 as rank FROM parliaments WHERE total_voters > ?'
      ).bind(seat.total_voters).all<{ rank: number }>();
      const totalRow = await env.DB.prepare('SELECT COUNT(*) as c FROM parliaments').first<{ c: number }>();

      payload = {
        scope: 'parliament',
        seat,
        child_duns: childDuns,
        voter_rank: rankRow[0]?.rank ?? 0,
        total_parliaments: totalRow?.c ?? 22,
      };
      label = `${seat.code_parlimen} ${seat.name}`;
    } else if (type === 'dun') {
      const seat = await env.DB.prepare(
        'SELECT code_dun, name, code_parlimen, total_voters, male, female, male_pct, female_pct, malay_pct, chinese_pct, indian_pct, other_pct, age_mean, age_median, contact_pct, dm_count, locality_count FROM duns WHERE code_dun = ?'
      ).bind(code!).first<DunRow>();
      if (!seat) return NextResponse.json({ error: 'DUN not found' }, { status: 404 });

      const parent = await env.DB.prepare(
        'SELECT code_parlimen, name, total_voters FROM parliaments WHERE code_parlimen = ?'
      ).bind(seat.code_parlimen).first<ParlRow>();

      payload = { scope: 'dun', seat, parent_parliament: parent };
      label = `${seat.code_dun} ${seat.name}`;
    } else if (type === 'dm') {
      const seat = await env.DB.prepare(
        'SELECT dm_code, name, dun_code, code_parlimen, total_voters, male, female, male_pct, female_pct, malay_pct, chinese_pct, indian_pct, other_pct, age_mean, age_median, contact_pct, male_malay, male_chinese, male_indian, male_other, female_malay, female_chinese, female_indian, female_other FROM dms WHERE dm_code = ?'
      ).bind(code!).first<DmRow>();
      if (!seat) return NextResponse.json({ error: 'DM not found' }, { status: 404 });

      payload = { scope: 'dm', seat };
      label = seat.dm_code;
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    // ── Call the Cloudflare AI Workers LLM ──────────────────
    const systemPrompt =
      'You are an electoral-data analyst for Selangor, Malaysia. ' +
      'Given a JSON payload of voter statistics, produce 3-5 concise, actionable bullet insights. ' +
      'Focus on: demographic composition, standout metrics, comparisons to state averages, and notable patterns. ' +
      'Use Malaysian context (e.g. "Bumiputera/Melayu", "Cina", "India"). ' +
      'Keep each bullet under 25 words. Be specific — cite actual numbers and percentages. ' +
      'Return ONLY the bullets as a JSON array of strings, e.g. ["...", "..."]';
    const userPrompt = `Constituency: ${label}\n\nData:\n${JSON.stringify(payload, null, 2)}`;

    const raw = await generateInsights(systemPrompt, userPrompt, env);

    // Try to parse as JSON array; if it fails, split on newlines.
    let bullets: string[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) bullets = parsed.map(String);
      else bullets = [String(parsed)];
    } catch {
      bullets = raw
        .split('\n')
        .map((l) => l.replace(/^[\s>*-•\d.]+/, '').trim())
        .filter(Boolean);
      if (!bullets.length) bullets = [raw.trim()];
    }

    return NextResponse.json({
      label,
      type,
      code: code ?? null,
      bullets,
      model: AI_MODEL,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
