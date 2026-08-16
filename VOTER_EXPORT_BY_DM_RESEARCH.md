# Individual Voter Export by DM — Feasibility Research

## Status: ⚠️ FEASIBLE WITH CONSTRAINTS — Requires Paid Plan or Alternative Architecture

---

## Executive Summary

**Is it possible to sort 3,971,650 individual voters into their 945 DMs and
download per-DM?** **Yes**, but with significant constraints on the
Cloudflare free tier:

1. **Loading 3.97M voters into D1 takes ~40 days** on the free tier (100K writes/day limit)
2. **Individual DM downloads are feasible** once loaded (avg 4,203 voters/DM, ~821 KB CSV per DM)
3. **Password protection with `PAStimenang1` is already implemented** and can be reused
4. **Alternative: pre-generate per-DM CSV files** offline and serve via R2

---

## 1. Current State

### What's in D1 Now

| Table | Rows | Size |
|-------|------|------|
| `parliaments` | 22 | ~11 KB |
| `duns` | 56 | ~34 KB |
| `dms` | 945 | ~473 KB |
| `geocode_cache` | 945 | ~100 KB |
| `app_settings` | 1 | <1 KB |
| `data_version` | 1 | <1 KB |
| **Total** | **1,070** | **~924 KB** |

### What's NOT in D1

| Table | Rows | Size | Status |
|-------|------|------|--------|
| `voters` | 3,971,650 | ~795 MB | **Not loaded** (schema commented out in migration 0001) |

The `voters` table schema exists (commented out in `migrations/0001_analytics_warehouse.sql`)
but was never loaded because:

> Loading 3,971,650 of the 100,000 daily write quota. This must be done over
> ~40 days on the free tier, or done in a single batch by temporarily using a
> paid plan ($5/month) and downgrading after.
> — `CLOUDFLARE_D1_DATABASE.md`

### Source Data

The 4 original xlsx files are stored via Git LFS:

| File | Records | Git LFS Size |
|------|---------|-------------|
| `data/01_SL_part01.1mil (mcw).xlsx` | 1,000,000 | 71.0 MB |
| `data/01_SL_part02.1mil (mcw).xlsx` | 1,000,000 | 72.0 MB |
| `data/01_SL_part03.1mil (mcw).xlsx` | 1,000,000 | 73.6 MB |
| `data/01_SL_part04-971650 (mcw).xlsx` | 971,650 | 77.5 MB |
| **Total** | **3,971,650** | **294.1 MB** |

### Voter Data Schema (13 columns)

| Col | Field | Type | Description |
|-----|-------|------|-------------|
| A | `VOTER_ID` | String | `SL{n}_{sequence}` |
| B | `VOTER_CODE` | String | 12-char registration code |
| C | `GENDER` | String | `M` / `F` |
| D | `RACE` | String | `M` / `C` / `I` / `B` / `TBC` |
| E | `AGE` | Integer | Years |
| F | `DOB` | String | `DD-MMM-YYYY` |
| G | `CONTACT#` | String | `YES` / `NA` |
| H | `GPS_COORDINATE` | String | `YES` / `NA` |
| I | `LOCALITY_CODE` | String | Locality code + name |
| J | `DM_CODE` | String | DM code + name (e.g. `01.BANDAR MELAWATI`) |
| K | `DUN_CODE` | String | DUN code + name (e.g. `18.HULU KELANG`) |
| L | `PARLIAMENT_CODE` | String | Parliament code + name (e.g. `98.GOMBAK`) |
| M | `STATE_CODE` | String | `8.SELANGOR` |

---

## 2. Feasibility Analysis

### Per-DM Voter Counts

| Metric | Value |
|--------|-------|
| Total voters | 3,971,650 |
| Total DMs | 945 |
| **Average voters per DM** | **~4,203** |
| Largest DM | ~26,000 voters |
| Smallest DM | ~100 voters |

### Per-DM CSV Size Estimates

| Metric | Value |
|--------|-------|
| CSV row size per voter | ~200 bytes |
| **Average CSV per DM** | **~821 KB** |
| Largest DM CSV | ~5.0 MB |
| Smallest DM CSV | ~20 KB |

### Cloudflare Constraints

| Constraint | Free Tier | Impact |
|-----------|-----------|--------|
| D1 storage | 5 GB | ✅ 795 MB fits (6.3x headroom) |
| D1 writes/day | 100,000 | ❌ 3.97M rows = 40 days to load |
| D1 rows read/day | 5,000,000 | ✅ 4,203 rows per DM is fine |
| Worker CPU | 10 ms/request | ✅ D1 queries don't count toward CPU |
| Worker response size | 100 MB | ✅ Largest DM CSV is ~5 MB |
| Worker memory | 128 MB | ✅ Even 26K rows = ~5 MB CSV |

### Conclusion: Per-DM Downloads ARE Feasible

Once the voter data is loaded into D1, downloading individual DMs is
well within all Cloudflare limits:

- **D1 query**: `SELECT * FROM voters WHERE dm_code = ?` → ~4,203 rows avg
- **Worker response**: ~821 KB avg CSV (well under 100 MB limit)
- **Worker CPU**: D1 query time doesn't count toward the 10 ms CPU limit
- **Password protection**: Already implemented via PBKDF2, can be reused

**The only blocker is loading the 3.97M rows into D1.**

---

## 3. Loading the Voter Data — 3 Options

### Option A: Temporarily Upgrade to Paid Plan ($5/month)

1. Upgrade Cloudflare account to Workers Paid ($5/month)
2. Run `wrangler d1 import` with the 3.97M rows (no daily write limit on paid)
3. Downgrade back to free tier after load completes
4. **Cost**: $5 for one month
5. **Time**: ~30 minutes for the bulk import

### Option B: Batch Load Over 40 Days (Free Tier)

1. Load 100,000 rows per day via `wrangler d1 execute --batch`
2. After 40 days, all 3.97M rows are loaded
3. **Cost**: $0
4. **Time**: 40 days
5. Requires a cron job or scheduled task to run daily

### Option C: Pre-Generate Per-DM CSVs + Serve via R2 (RECOMMENDED)

This approach avoids D1 entirely for individual voters:

1. Run a Python script locally that reads the 4 xlsx files
2. Group voters by DM_CODE
3. Generate 945 CSV files (one per DM)
4. Upload all 945 CSVs to R2 bucket `slgrvtrs-tiles` (or a new `slgrvtrs-voters` bucket)
5. Create a Worker route `/api/export/dm-voters/[dm_code]` that:
   - Verifies the password (PBKDF2)
   - Fetches the pre-generated CSV from R2
   - Returns it as a download

**Advantages**:
- No D1 loading needed
- No 40-day wait
- No paid plan required
- R2 has 10 GB free storage (945 CSVs = ~758 MB total)
- R2 reads are free (no per-request charge)
- Instant response (just an R2 GET + password verify)

---

## 4. Implementation Plan (Option C — R2 Pre-Generated CSVs)

### Step 1: Python Script to Generate Per-DM CSVs

```python
# scripts/generate_dm_voter_csvs.py
import pandas as pd
import os
import json

# Read the 4 xlsx files
files = [
    'data/01_SL_part01.1mil (mcw).xlsx',
    'data/01_SL_part02.1mil (mcw).xlsx',
    'data/01_SL_part03.1mil (mcw).xlsx',
    'data/01_SL_part04-971650 (mcw).xlsx',
]

all_dfs = [pd.read_excel(f, engine='calamine') for f in files]
df = pd.concat(all_dfs, ignore_index=True)

# Group by DM_CODE
for dm_code, group in df.groupby('DM_CODE'):
    # Sanitize filename
    safe_name = dm_code.replace('/', '_').replace(' ', '_')
    filename = f'dm_voters/{safe_name}.csv'
    group.to_csv(filename, index=False)
    print(f'Generated {filename}: {len(group)} voters')

print(f'Total DMs: {df["DM_CODE"].nunique()}')
print(f'Total voters: {len(df)}')
```

### Step 2: Upload to R2

```bash
# Upload all per-DM CSVs to R2
for file in dm_voters/*.csv; do
    npx wrangler r2 object put slgrvtrs-tiles/voters/$(basename "$file") --file="$file"
done
```

### Step 3: Worker Route (Password-Protected)

```typescript
// src/app/api/export/dm-voters/[dm_code]/route.ts
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, getPasswordHash } from '@/lib/auth/password';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dm_code: string }> },
) {
  const { dm_code } = await params;
  const { searchParams } = new URL(request.url);
  const password = searchParams.get('password') || '';

  // Verify password
  const { env } = await getCloudflareContext();
  const storedHash = await getPasswordHash(env.DB);
  if (!storedHash) {
    return NextResponse.json({ error: 'Password not set' }, { status: 403 });
  }
  const valid = await verifyPassword(storedHash, password);
  if (!valid) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  // Fetch pre-generated CSV from R2
  const safeName = decodeURIComponent(dm_code).replace(/\//g, '_').replace(/ /g, '_');
  const r2Key = `voters/${safeName}.csv`;
  const object = await env.TILES.get(r2Key);

  if (!object) {
    return NextResponse.json({ error: 'DM voter data not found' }, { status: 404 });
  }

  const csv = await object.text();
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="voters_${dm_code}.csv"`,
    },
  });
}
```

### Step 4: UI — DM Selection Dropdown + Download Button

Add a dropdown in the ExportPanel that lists all 945 DMs. When the user
selects a DM and clicks download, the password dialog opens, and the
Worker fetches the pre-generated CSV from R2.

---

## 5. Alternative: D1-Based Per-DM Voter Download

If the voter data IS loaded into D1 (via Option A or B), the implementation
is simpler:

```typescript
// src/app/api/export/dm-voters/[dm_code]/route.ts
export async function POST(request: NextRequest, { params }) {
  const { dm_code } = await params;
  const { password } = await request.json();

  // Verify password (same as all other exports)
  const storedHash = await getPasswordHash(env.DB);
  const valid = await verifyPassword(storedHash, password);
  if (!valid) return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });

  // Query individual voters for this DM
  const result = await env.DB.prepare(
    'SELECT voter_id, voter_code, gender, race, age, dob, contact, gps, locality, dm_code, dun_code, parlimen_code FROM voters WHERE dm_code = ? ORDER BY voter_id'
  ).bind(dm_code).all();

  // Build CSV
  const csv = buildCSV(VOTER_COLUMNS, result.results);
  return new Response(csv, { ... });
}
```

**D1 query performance**: `SELECT * FROM voters WHERE dm_code = ?` with an index
on `dm_code` returns ~4,203 rows in <50 ms (D1 query time doesn't count toward
Worker CPU). The CSV is ~821 KB — well within the 100 MB Worker response limit.

---

## 6. Password Protection

All approaches use the same password protection (Phase 7):

- **Password**: `PAStimenang1`
- **Hash**: PBKDF2 (10,000 iterations, SHA-256, 16-byte salt)
- **Storage**: D1 `app_settings` table (key: `export_password_hash`)
- **Verification**: `verifyPassword(storedHash, passwordAttempt)` via WebCrypto

The password is shared across all export endpoints:
- `POST /api/export/csv` (parliament/dun/dm aggregated)
- `POST /api/export/dm-xlsx` (all 945 DMs sorted)
- `POST /api/export/comparison` (comparison seats)
- `GET /api/export/dm-voters/[dm_code]` (individual voters per DM — new)

---

## 7. Voter Table Schema (for D1 Option)

```sql
CREATE TABLE IF NOT EXISTS voters (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id        TEXT NOT NULL UNIQUE,
  voter_code      TEXT NOT NULL,
  dm_code         TEXT NOT NULL,
  dun_code        TEXT NOT NULL,
  parlimen_code   TEXT NOT NULL,
  gender          TEXT NOT NULL CHECK(gender IN ('M', 'F')),
  race            TEXT NOT NULL,
  age             INTEGER NOT NULL,
  dob             TEXT,
  has_contact     INTEGER NOT NULL DEFAULT 0,
  has_gps         INTEGER NOT NULL DEFAULT 0,
  locality        TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_voters_dm ON voters(dm_code);
CREATE INDEX IF NOT EXISTS idx_voters_dun ON voters(dun_code);
CREATE INDEX IF NOT EXISTS idx_voters_parl ON voters(parlimen_code);
```

---

## 8. Cost Summary

| Approach | Cost | Time | Storage |
|----------|------|------|---------|
| Option A: Paid plan + D1 | $5 (one month) | ~30 min | D1: 795 MB |
| Option B: Free tier batch | $0 | 40 days | D1: 795 MB |
| Option C: R2 pre-generated | $0 | ~1 hour | R2: 758 MB |
| **Recommended** | **Option C** | **~1 hour** | **R2: 758 MB** |

---

## 9. Conclusion

**Yes, it is possible to sort 3,971,650 voters into their 945 DMs and
download per-DM, password-protected with `PAStimenang1`.**

The recommended approach is **Option C (R2 pre-generated CSVs)** because:
- No D1 loading delay (40 days on free tier)
- No paid plan required ($0)
- R2 storage is free (758 MB < 10 GB limit)
- R2 reads are free
- Password protection reuses the existing PBKDF2 implementation
- Instant response (R2 GET + password verify)

The per-DM CSV files average 821 KB (max 5 MB), well within CF Worker
response limits.
