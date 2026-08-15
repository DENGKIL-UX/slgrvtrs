# Phase 3 Optional: D1 Database & DM API Route

> **Status:** Deferred from Phase 3 — Implementation plan for provisioning Cloudflare D1, loading DM data, and exposing an API route to replace the static `dm_centroids.geojson` fetch.

---

## Table of Contents

1. [Overview & Motivation](#1-overview--motivation)
2. [Current State Audit](#2-current-state-audit)
3. [Architecture Decision: Static vs D1](#3-architecture-decision-static-vs-d1)
4. [Prerequisites](#4-prerequisites)
5. [Step 1: Provision D1 Database](#5-step-1-provision-d1-database)
6. [Step 2: Fix Schema Gaps](#6-step-2-fix-schema-gaps)
7. [Step 3: Generate DM Load Migration](#7-step-3-generate-dm-load-migration)
8. [Step 4: Apply Migrations](#8-step-4-apply-migrations)
9. [Step 5: TypeScript Environment Setup](#9-step-5-typescript-environment-setup)
10. [Step 6: API Route — `GET /api/dm`](#10-step-6-api-route--get-apidm)
11. [Step 7: API Route — `GET /api/dm/[code]`](#11-step-7-api-route--get-apidmcode)
12. [Step 8: API Route — `GET /api/dm/search`](#12-step-8-api-route--get-apidmsearch)
13. [Step 9: Frontend Migration](#13-step-9-frontend-migration)
14. [Step 10: Caching & Performance](#14-step-10-caching--performance)
15. [Step 11: Local Development Workflow](#15-step-11-local-development-workflow)
16. [Rollback Strategy](#16-rollback-strategy)
17. [Future: Phase 5 Voter-Level Queries](#17-future-phase-5-voter-level-queries)
18. [File Change Summary](#18-file-change-summary)

---

## 1. Overview & Motivation

The current DM visualization loads all 945 DM records as a single static GeoJSON file (`dm_centroids.geojson`, ~829 KB) embedded with 24 demographic fields per feature. This works for the current scale but has limitations:

| Concern | Static (current) | D1 API (proposed) |
|---------|-------------------|-------------------|
| **Payload size** | 829 KB GeoJSON downloaded on every page load | Only requested fields returned, potentially smaller |
| **Freshness** | Requires rebuild & redeploy to update data | Data can be updated via `wrangler d1 execute` without redeploy |
| **Queryability** | All 945 DMs always loaded; client-side filtering only | Server-side filtering by DUN, Parliament, voter count range |
| **Scalability** | At 945 records the GeoJSON is manageable; Phase 5 individual voters (3.97M rows) cannot use static files | D1 handles 3.97M rows with indexed queries |
| **Complexity** | Zero infrastructure — just static files in `public/` | Requires D1 provisioning, migrations, API routes, type augmentation |

**Recommendation:** The D1 path is justified primarily as a **stepping stone to Phase 5** (individual voter queries). For the current 945-record DM dataset alone, the static GeoJSON approach is simpler and faster. Implement D1 now only if Phase 5 is confirmed in the near roadmap.

---

## 2. Current State Audit

### 2.1 What Already Exists

| Asset | Path | Status |
|-------|------|--------|
| D1 schema (4 tables) | `dashboard/migrations/0001_analytics_warehouse.sql` | ✅ Complete — but `dms` table missing 8 cross-tab columns |
| Parliament data migration | `dashboard/migrations/0002_load_parliaments.sql` | ✅ 22 rows |
| DUN data migration | `dashboard/migrations/0003_load_duns.sql` | ✅ 56 rows |
| DM data migration | `dashboard/migrations/0004_load_dms.sql` | ❌ Does not exist |
| D1 load generator (Parl + DUN) | `scripts/build_d1_load.py` | ✅ Working — but does not handle DMs |
| DM stats JSON | `dashboard/public/stats/dm.json` | ✅ 945 records, 24 fields each |
| DM centroids GeoJSON | `dashboard/public/boundaries/dm_centroids.geojson` | ✅ 945 Point features, 24 properties each |
| Wrangler config | `dashboard/wrangler.jsonc` | ⚠️ D1 binding commented out with placeholder ID |
| `@cloudflare/workers-types` | `dashboard/package.json` | ❌ Not installed |
| Cloudflare env types | `dashboard/src/cloudflare-env.d.ts` | ❌ Does not exist |
| API routes | `dashboard/src/app/api/` | ❌ Directory does not exist |

### 2.2 D1 Schema (from `0001_analytics_warehouse.sql`)

```sql
-- Current dms table (INCOMPLETE for frontend needs)
CREATE TABLE IF NOT EXISTS dms (
  dm_code         TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  dun_code        TEXT NOT NULL REFERENCES duns(code_dun),
  code_parlimen   TEXT NOT NULL,
  voter_prefix    TEXT NOT NULL,
  total_voters    INTEGER NOT NULL DEFAULT 0,
  male            INTEGER NOT NULL DEFAULT 0,
  female          INTEGER NOT NULL DEFAULT 0,
  male_pct        REAL,
  female_pct      REAL,
  malay_pct       REAL,
  chinese_pct     REAL,
  indian_pct       REAL,
  other_pct       REAL,
  age_mean        REAL,
  age_median      REAL,
  contact_pct     REAL,
  centroid_lng    REAL,
  centroid_lat    REAL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 2.3 DM Data Shape (from `dm.json` / `dm_centroids.geojson`)

```jsonc
// 24 fields per DM record:
{
  "dm_code": "01.BANDAR COUNTRY HOME 1",   // Primary key
  "dun_code": "14.RAWANG",                 // FK to duns table
  "dun_prefix": "14",                       // Numeric DUN prefix
  "code_parlimen": "97.SELAYANG",           // FK to parliaments table
  "total_voters": 10395,
  "male": 5101, "female": 5294,
  "male_pct": 49.1, "female_pct": 50.9,
  "malay_pct": 51.33, "chinese_pct": 29.31,
  "indian_pct": 19.13, "other_pct": 0.23,
  "age_mean": 38.9, "age_median": 38.9,
  "contact_pct": 75.53,
  // ⚠️ 8 cross-tab fields NOT in D1 schema:
  "male_malay": 2616, "male_chinese": 1563,
  "male_indian": 910, "male_other": 12,
  "female_malay": 2720, "female_chinese": 1484,
  "female_indian": 1079, "female_other": 11
}
```

### 2.4 Frontend DM Consumption

The map loads DM data at **line 330–337** of `MapDashboard.tsx`:

```typescript
const dmCentroidsRes = await fetch('/boundaries/dm_centroids.geojson');
const dmCentroids = await dmCentroidsRes.json();
dmCentroidsRef.current = dmCentroids;
map.addSource('dm', { type: 'geojson', data: dmCentroids });
```

The `applyDmFilter` function (lines 256–318) uses `setPaintProperty` (NOT `setFilter`) to change bubble radius based on the selected demographic. It reads these properties from each feature:

- `total_voters`
- `male_malay`, `male_chinese`, `male_indian`, `male_other`
- `female_malay`, `female_chinese`, `female_indian`, `female_other`

**Critical implication:** Any D1 API response that replaces the static GeoJSON **must include all 24 fields** as GeoJSON feature properties, otherwise the client-side `applyDmFilter` expression will fail with undefined values.

### 2.5 Wrangler Config (current)

```jsonc
// dashboard/wrangler.jsonc
{
  "name": "slgrvtrs",
  "compatibility_date": "2025-07-18",
  "compatibility_flags": ["nodejs_compat"],
  "main": ".open-next/worker.js",
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  // D1 database binding — COMMENTED OUT
  // "d1_databases": [
  //   {
  //     "binding": "DB",
  //     "database_name": "slgrvtrs-voters",
  //     "database_id": "<YOUR_DATABASE_ID>"
  //   }
  // ]
}
```

---

## 3. Architecture Decision: Static vs D1

### When to stay with static files
- No plans for Phase 5 (individual voter queries)
- Data updates are infrequent (election cycle pace)
- Simplicity and zero-cost hosting are priorities

### When to migrate to D1
- Phase 5 (3.97M voter rows) is confirmed — static files cannot serve this
- Need server-side filtering (e.g., "show DMs where Malay > 60% and voters > 5000")
- Data needs to be updatable without a full redeploy
- Want to add server-side search / autocomplete for DM names

### Hybrid approach (recommended for transition)

Keep the static `dm_centroids.geojson` as the default, but add an optional D1 API route that can be toggled via an environment variable. This allows incremental migration:

```typescript
// Future toggle in MapDashboard.tsx
const DM_DATA_SOURCE = process.env.NEXT_PUBLIC_DM_SOURCE === 'api'
  ? '/api/dm?format=geojson'
  : '/boundaries/dm_centroids.geojson';
```

---

## 4. Prerequisites

| Requirement | Command / Action |
|-------------|-----------------|
| Wrangler CLI authenticated | `npx wrangler whoami` — should show your account |
| D1 database provisioned | `npx wrangler d1 create slgrvtrs-voters` (see Step 5) |
| `@cloudflare/workers-types` | `npm install -D @cloudflare/workers-types` |
| Node.js ≥ 18 | Already satisfied by Next.js 16 |

---

## 5. Step 1: Provision D1 Database

```bash
cd dashboard

# Create the D1 database
npx wrangler d1 create slgrvtrs-voters

# Output will include:
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` and update `wrangler.jsonc`:

```jsonc
// dashboard/wrangler.jsonc — uncomment and fill in
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "slgrvtrs-voters",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  // ← paste here
  }
]
```

**D1 free tier limits:**
- 5 GB storage
- 5 million reads/day
- 100K writes/day
- 128 MB per query result

For 945 DM rows + 22 Parliaments + 56 DUNs, total storage is well under 1 MB. Phase 5 (3.97M voter rows) would use approximately 2–3 GB — within free tier.

---

## 6. Step 2: Fix Schema Gaps

### 6.1 Add cross-tab columns to `dms` table

Create `dashboard/migrations/0001b_add_dm_crosstab.sql`:

```sql
-- Add gender×race cross-tab columns required by frontend DM filter
-- These fields allow server-side demographic queries without client-side computation
ALTER TABLE dms ADD COLUMN male_malay   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dms ADD COLUMN male_chinese INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dms ADD COLUMN male_indian  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dms ADD COLUMN male_other   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dms ADD COLUMN female_malay   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dms ADD COLUMN female_chinese INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dms ADD COLUMN female_indian  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dms ADD COLUMN female_other   INTEGER NOT NULL DEFAULT 0;

-- Index for DUN-based DM queries (used by drill-down filtering)
CREATE INDEX IF NOT EXISTS idx_dms_dun_prefix ON dms(dun_prefix);

-- Index for Parliament-based DM queries
CREATE INDEX IF NOT EXISTS idx_dms_parlimen_prefix ON dms(voter_prefix);
```

### 6.2 Why ALTER TABLE and not recreate

D1 supports `ALTER TABLE ADD COLUMN`. Using an additive migration preserves existing Parliament and DUN data that was loaded by migrations 0002 and 0003. A full schema recreate would require re-running those migrations.

---

## 7. Step 3: Generate DM Load Migration

Extend `scripts/build_d1_load.py` to also generate `0004_load_dms.sql`. The script should:

1. Read `dashboard/public/stats/dm.json` (945 records)
2. Read `dashboard/public/boundaries/dm_centroids.geojson` (for centroid coordinates)
3. Build a lookup from `dm_code` → `[lng, lat]`
4. Generate `INSERT OR REPLACE INTO dms (...) VALUES (...)` for each DM

### 7.1 Column mapping

| JSON field | D1 column | Notes |
|-----------|-----------|-------|
| `dm_code` | `dm_code` | Primary key, e.g. `"01.BANDAR COUNTRY HOME 1"` |
| (extract name after `.`) | `name` | `dm_code.split('.', 1)[1]` → `"BANDAR COUNTRY HOME 1"` |
| `dun_code` | `dun_code` | FK, e.g. `"14.RAWANG"` → store as `"N.14"` to match `duns.code_dun` |
| `dun_prefix` | `dun_prefix` | `"14"` (numeric prefix) |
| `code_parlimen` | `code_parlimen` | `"97.SELAYANG"` → store as `"P.097"` to match `parliaments.code_parlimen` |
| (extract prefix) | `voter_prefix` | `"097"` (padded to 3 digits for Parliament) |
| `total_voters` | `total_voters` | |
| `male` | `male` | |
| `female` | `female` | |
| `male_pct` | `male_pct` | |
| `female_pct` | `female_pct` | |
| `malay_pct` | `malay_pct` | |
| `chinese_pct` | `chinese_pct` | |
| `indian_pct` | `indian_pct` | |
| `other_pct` | `other_pct` | |
| `age_mean` | `age_mean` | |
| `age_median` | `age_median` | |
| `contact_pct` | `contact_pct` | Per-DUN recomputed value (see commit `6ec90ce`) |
| (from centroids GeoJSON) | `centroid_lng` | First element of `coordinates` array |
| (from centroids GeoJSON) | `centroid_lat` | Second element of `coordinates` array |
| `male_malay` | `male_malay` | |
| `male_chinese` | `male_chinese` | |
| `male_indian` | `male_indian` | |
| `male_other` | `male_other` | |
| `female_malay` | `female_malay` | |
| `female_chinese` | `female_chinese` | |
| `female_indian` | `female_indian` | |
| `female_other` | `female_other` | |

### 7.2 Key format normalization

The `dm.json` and `dm_centroids.geojson` use **composite keys** (e.g., `"14.RAWANG"` for DUN, `"97.SELAYANG"` for Parliament). The D1 tables use **prefixed keys** (e.g., `"N.14"` for DUN, `"P.097"` for Parliament). The migration generator must normalize these:

```python
# dm.json format:  "dun_code": "14.RAWANG"
# D1 duns table:   "code_dun": "N.14"
# Normalize: extract numeric prefix, pad, prepend code letter
def normalize_dun_code(raw: str) -> str:
    num = raw.split('.')[0].zfill(2)
    return f'N.{num}'

def normalize_parl_code(raw: str) -> str:
    num = raw.split('.')[0].zfill(3)
    return f'P.{num}'
```

### 7.3 Sample generated SQL

```sql
-- Auto-generated from dm.json + dm_centroids.geojson
-- Do NOT edit manually.

INSERT OR REPLACE INTO dms (
  dm_code, name, dun_code, code_parlimen, voter_prefix,
  total_voters, male, female, male_pct, female_pct,
  malay_pct, chinese_pct, indian_pct, other_pct,
  age_mean, age_median, contact_pct,
  centroid_lng, centroid_lat,
  male_malay, male_chinese, male_indian, male_other,
  female_malay, female_chinese, female_indian, female_other
) VALUES (
  '01.BANDAR COUNTRY HOME 1', 'BANDAR COUNTRY HOME 1', 'N.14', 'P.097', '097',
  10395, 5101, 5294, 49.1, 50.9,
  51.33, 29.31, 19.13, 0.23,
  38.9, 38.9, 75.53,
  101.6207, 3.2094,
  2616, 1563, 910, 12,
  2720, 1484, 1079, 11
);
-- ... 944 more rows
```

---

## 8. Step 4: Apply Migrations

```bash
cd dashboard

# Apply schema creation (0001) — tables + indexes
npx wrangler d1 migrations apply slgrvtrs-voters --local  # local dev first
npx wrangler d1 migrations apply slgrvtrs-voters --remote # then production

# Apply cross-tab columns (0001b)
npx wrangler d1 migrations apply slgrvtrs-voters --local
npx wrangler d1 migrations apply slgrvtrs-voters --remote

# Apply Parliament data (0002)
npx wrangler d1 migrations apply slgrvtrs-voters --local
npx wrangler d1 migrations apply slgrvtrs-voters --remote

# Apply DUN data (0003)
npx wrangler d1 migrations apply slgrvtrs-voters --local
npx wrangler d1 migrations apply slgrvtrs-voters --remote

# Apply DM data (0004) — 945 rows
npx wrangler d1 migrations apply slgrvtrs-voters --local
npx wrangler d1 migrations apply slgrvtrs-voters --remote
```

**Verify data loads:**

```bash
npx wrangler d1 execute slgrvtrs-voters --remote \
  --command "SELECT 'parliaments' AS tbl, COUNT(*) AS cnt FROM parliaments
  UNION ALL SELECT 'duns', COUNT(*) FROM duns
  UNION ALL SELECT 'dms', COUNT(*) FROM dms"

# Expected: parliaments=22, duns=56, dms=945
```

---

## 9. Step 5: TypeScript Environment Setup

### 9.1 Install Workers types

```bash
cd dashboard
npm install -D @cloudflare/workers-types
```

### 9.2 Create Cloudflare env type declaration

Create `dashboard/src/cloudflare-env.d.ts`:

```typescript
// Cloudflare Worker environment bindings
// This file augments the global NextRequest/NextResponse types with D1 access

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

// Extend Next.js route handler context for Cloudflare
declare module 'next' {
  interface NextRequest {
    env: Env;
  }
}
```

### 9.3 Update `tsconfig.json`

Add `@cloudflare/workers-types` and the env declaration to `compilerOptions`:

```jsonc
// dashboard/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "types": ["@cloudflare/workers-types"],  // ← ADD
    "strict": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts", "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "src/cloudflare-env.d.ts"  // ← ADD
  ]
}
```

### 9.4 Accessing D1 in Next.js API routes with OpenNext

OpenNext for Cloudflare exposes bindings through `process.env` or the `getRequestContext()` helper from `@opennextjs/cloudflare`:

```typescript
import { getRequestContext } from '@opennextjs/cloudflare';

export async function GET(request: Request) {
  const { env } = getRequestContext();
  const result = await env.DB.prepare('SELECT * FROM dms').all();
  return Response.json(result.results);
}
```

> **⚠️ Important:** `getRequestContext()` works in the deployed Worker but NOT in `next dev`. For local development, use `wrangler dev` (see Step 11).

---

## 10. Step 6: API Route — `GET /api/dm`

### 10.1 Route handler

Create `dashboard/src/app/api/dm/route.ts`:

```typescript
import { getRequestContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

export const runtime = 'edge';  // NOT needed — OpenNext handles this

interface DMRow {
  dm_code: string;
  name: string;
  dun_code: string;
  code_parlimen: string;
  voter_prefix: string;
  dun_prefix: string;
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
  centroid_lng: number | null;
  centroid_lat: number | null;
  male_malay: number;
  male_chinese: number;
  male_indian: number;
  male_other: number;
  female_malay: number;
  female_chinese: number;
  female_indian: number;
  female_other: number;
}

function rowToFeature(row: DMRow): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: {
      dm_code: row.dm_code,
      dun_code: row.dun_code,
      dun_prefix: row.dun_prefix,
      code_parlimen: row.code_parlimen,
      total_voters: row.total_voters,
      male: row.male,
      female: row.female,
      male_pct: row.male_pct,
      female_pct: row.female_pct,
      malay_pct: row.malay_pct,
      chinese_pct: row.chinese_pct,
      indian_pct: row.indian_pct,
      other_pct: row.other_pct,
      age_mean: row.age_mean,
      age_median: row.age_median,
      contact_pct: row.contact_pct,
      male_malay: row.male_malay,
      male_chinese: row.male_chinese,
      male_indian: row.male_indian,
      male_other: row.male_other,
      female_malay: row.female_malay,
      female_chinese: row.female_chinese,
      female_indian: row.female_indian,
      female_other: row.female_other,
    },
    geometry: row.centroid_lng && row.centroid_lat
      ? { type: 'Point', coordinates: [row.centroid_lng, row.centroid_lat] }
      : null,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { env } = getRequestContext();

  // Query parameters
  const format = searchParams.get('format') || 'geojson';  // 'geojson' | 'json'
  const dun = searchParams.get('dun');                      // filter by DUN prefix e.g. '14'
  const parl = searchParams.get('parl');                    // filter by Parliament prefix e.g. '097'
  const minVoters = searchParams.get('min_voters');         // minimum total_voters
  const maxVoters = searchParams.get('max_voters');         // maximum total_voters

  // Build query
  let sql = 'SELECT * FROM dms WHERE 1=1';
  const params: any[] = [];

  if (dun) {
    sql += ' AND dun_prefix = ?';
    params.push(dun.padStart(2, '0'));
  }
  if (parl) {
    sql += ' AND voter_prefix = ?';
    params.push(parl.padStart(3, '0'));
  }
  if (minVoters) {
    sql += ' AND total_voters >= ?';
    params.push(Number(minVoters));
  }
  if (maxVoters) {
    sql += ' AND total_voters <= ?';
    params.push(Number(maxVoters));
  }

  sql += ' ORDER BY total_voters DESC';

  const result = await env.DB.prepare(sql).bind(...params).all<DMRow>();

  if (format === 'json') {
    return NextResponse.json({
      total: result.results.length,
      data: result.results,
    });
  }

  // Default: GeoJSON FeatureCollection (drop null geometries)
  const features = result.results
    .map(rowToFeature)
    .filter((f): f is GeoJSON.Feature => f.geometry !== null);

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  };

  return NextResponse.json(geojson);
}
```

### 10.2 API contract

```
GET /api/dm?format=geojson                     → Full GeoJSON (all 945 DMs)
GET /api/dm?format=geojson&dun=14              → DMs in DUN 14 only
GET /api/dm?format=geojson&parl=097            → DMs in Parliament 097 only
GET /api/dm?format=geojson&min_voters=10000     → DMs with ≥10,000 voters
GET /api/dm?format=json                         → Plain JSON array
```

### 10.3 Response format compatibility

The GeoJSON response must be **drop-in compatible** with the current `dm_centroids.geojson` structure. The `rowToFeature()` function maps all 24 fields into `properties`, and the `geometry` is a `Point` — identical to what MapLibre currently receives. The frontend `applyDmFilter` function reads properties by name (e.g., `['get', 'male_malay']`), so as long as the property names match, no frontend changes are needed.

---

## 11. Step 7: API Route — `GET /api/dm/[code]`

Create `dashboard/src/app/api/dm/[code]/route.ts`:

```typescript
import { getRequestContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { env } = getRequestContext();

  // Support both formats: "01.BANDAR COUNTRY HOME 1" or just "01"
  const dmCode = decodeURIComponent(code);

  const result = await env.DB
    .prepare('SELECT * FROM dms WHERE dm_code = ? OR dm_code LIKE ? || ".%"')
    .bind(dmCode, dmCode)
    .first();

  if (!result) {
    return NextResponse.json({ error: 'DM not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}
```

---

## 12. Step 8: API Route — `GET /api/dm/search`

Create `dashboard/src/app/api/dm/search/route.ts`:

```typescript
import { getRequestContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const { env } = getRequestContext();

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const result = await env.DB
    .prepare(
      'SELECT dm_code, name, dun_code, total_voters, centroid_lng, centroid_lat \
       FROM dms WHERE name LIKE ? LIMIT 20'
    )
    .bind(`%${q.toUpperCase()}%`)
    .all();

  return NextResponse.json({ results: result.results });
}
```

---

## 13. Step 9: Frontend Migration

### 13.1 Toggle mechanism

In `dashboard/src/components/map/MapDashboard.tsx`, replace the static fetch with a configurable source:

```typescript
// At the top of the component or as a constant
const DM_ENDPOINT = '/api/dm?format=geojson';
// Fallback to static file if API fails:
// const DM_ENDPOINT = '/boundaries/dm_centroids.geojson';

// In the data loading Promise.all (around line 330):
const dmCentroidsRes = await fetch(DM_ENDPOINT).catch(() => null);
```

### 13.2 What changes in the frontend

| Change | File | Lines |
|--------|------|-------|
| Replace fetch URL | `MapDashboard.tsx` | ~330 |
| Add error fallback to static file | `MapDashboard.tsx` | ~330–340 |

**Nothing else changes.** The `applyDmFilter` function, tooltip, popup, and legend all read from the GeoJSON `properties` object — which has the same field names whether the data comes from the static file or the API.

### 13.3 Fallback pattern

```typescript
let dmCentroids: GeoJSON.FeatureCollection | null = null;

// Try API first, fall back to static file
try {
  const res = await fetch('/api/dm?format=geojson');
  if (res.ok) {
    dmCentroids = await res.json();
  }
} catch {}

if (!dmCentroids) {
  const fallback = await fetch('/boundaries/dm_centroids.geojson').catch(() => null);
  if (fallback?.ok) {
    dmCentroids = await fallback.json();
  }
}
```

---

## 14. Step 10: Caching & Performance

### 14.1 Cloudflare CDN caching (automatic)

API responses routed through Cloudflare Workers are automatically cached at the edge if the response includes appropriate headers. Add cache headers to the DM route:

```typescript
// In GET handler, before returning:
return new NextResponse(JSON.stringify(geojson), {
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    // Cache at edge for 1 hour, serve stale for 24h while revalidating
  },
});
```

### 14.2 D1 query performance

For 945 rows, any query completes in < 10ms. No query optimization is needed at this scale. For Phase 5 (3.97M rows), consider:

- Composite indexes on `(dun_prefix, dm_code)`
- Pagination (`LIMIT 100 OFFSET 0`)
- Pre-aggregated materialized views for common queries

### 14.3 Payload comparison

| Source | Size | Transfer time (3G) |
|--------|------|---------------------|
| Static `dm_centroids.geojson` | ~829 KB | ~2.5s |
| API `GET /api/dm?format=geojson` (unfiltered) | ~830 KB (similar) | ~2.5s + ~20ms query |
| API `GET /api/dm?dun=14&format=geojson` | ~15 KB (17 DMs) | ~0.05s |
| API `GET /api/dm?format=json` (no geometry) | ~180 KB | ~0.5s |

The key performance win comes from **filtered queries** (e.g., after DUN drill-down, only fetch DMs for that DUN — 15–25 records instead of 945).

---

## 15. Step 11: Local Development Workflow

### 15.1 The `next dev` limitation

`next dev` runs on Node.js and does **not** have access to Cloudflare bindings (D1, KV, etc.). `getRequestContext()` will throw. To develop API routes that use D1:

### 15.2 Use `wrangler dev` for full-stack local dev

```bash
cd dashboard

# Build the OpenNext output
npm run build:cf

# Start local Wrangler dev server (includes D1 local SQLite)
npx wrangler dev

# This serves the app at http://localhost:8787 with:
# - D1 local database (.wrangler/state/v3/d1/miniflare-D1DatabaseObject/...)
# - Hot reload for static assets
# - Full Worker runtime
```

### 15.3 Applying migrations locally

```bash
# Local D1 uses SQLite under the hood
npx wrangler d1 migrations apply slgrvtrs-voters --local

# Inspect local D1 data
npx wrangler d1 execute slgrvtrs-voters --local \
  --command "SELECT dm_code, name, total_voters FROM dms LIMIT 5"
```

### 15.4 Development workflow summary

```
Edit code → npm run build:cf → npx wrangler dev → test at localhost:8787
```

This is slower than `next dev` hot-reload but is the only way to test D1 bindings locally.

---

## 16. Rollback Strategy

### Reverting to static files

If D1 causes issues in production:

1. Revert the frontend fetch URL in `MapDashboard.tsx` back to `/boundaries/dm_centroids.geojson`
2. Comment out the D1 binding in `wrangler.jsonc`
3. Redeploy — the static file is still in `public/boundaries/` and works independently

### D1 data rollback

```bash
# Reset remote D1 to empty (destructive)
npx wrangler d1 execute slgrvtrs-voters --remote \
  --command "DELETE FROM dms; DELETE FROM duns; DELETE FROM parliaments;"

# Re-apply all migrations
npx wrangler d1 migrations apply slgrvtrs-voters --remote
```

---

## 17. Future: Phase 5 Voter-Level Queries

The commented-out `voters` table in `0001_analytics_warehouse.sql` is designed for Phase 5 — storing all 3.97M individual voter records. This would enable:

- Point-in-polygon queries: "which DM contains this coordinate?"
- Demographic drill-down: "show me all voters aged 25–35 in DUN 14"
- Export endpoints: "download filtered voter list as CSV"

D1 free tier (5 GB) can accommodate 3.97M voter rows (~2–3 GB with indexes).

---

## 18. File Change Summary

### New files to create

| File | Purpose |
|------|---------|
| `dashboard/migrations/0001b_add_dm_crosstab.sql` | ALTER TABLE to add 8 cross-tab columns + indexes |
| `dashboard/migrations/0004_load_dms.sql` | INSERT 945 DM records (generated by script) |
| `dashboard/src/app/api/dm/route.ts` | `GET /api/dm` — list/search DMs as GeoJSON or JSON |
| `dashboard/src/app/api/dm/[code]/route.ts` | `GET /api/dm/[code]` — single DM lookup |
| `dashboard/src/app/api/dm/search/route.ts` | `GET /api/dm/search?q=` — name autocomplete |
| `dashboard/src/cloudflare-env.d.ts` | TypeScript env binding declarations |

### Files to modify

| File | Change |
|------|--------|
| `dashboard/wrangler.jsonc` | Uncomment D1 binding, fill in `database_id` |
| `dashboard/tsconfig.json` | Add `@cloudflare/workers-types` to `types`, add `cloudflare-env.d.ts` to `include` |
| `dashboard/package.json` | Add `@cloudflare/workers-types` to devDependencies |
| `scripts/build_d1_load.py` | Extend to generate `0004_load_dms.sql` from `dm.json` + centroids |
| `dashboard/src/components/map/MapDashboard.tsx` | (Optional) Switch DM fetch from static to API endpoint with fallback |

### Files unchanged (no modifications needed)

| File | Reason |
|------|--------|
| `dashboard/migrations/0001_analytics_warehouse.sql` | Schema is correct; gaps addressed by 0001b |
| `dashboard/migrations/0002_load_parliaments.sql` | Already generated, no changes |
| `dashboard/migrations/0003_load_duns.sql` | Already generated, no changes |
| `dashboard/public/stats/dm.json` | Remains as source of truth for the build pipeline |
| `dashboard/public/boundaries/dm_centroids.geojson` | Remains as fallback static file |

---

## Appendix A: D1 CLI Cheat Sheet

```bash
# Provision
npx wrangler d1 create slgrvtrs-voters

# Migrations
npx wrangler d1 migrations apply slgrvtrs-voters --local
npx wrangler d1 migrations apply slgrvtrs-voters --remote

# Ad-hoc queries
npx wrangler d1 execute slgrvtrs-voters --local  --command "SELECT COUNT(*) FROM dms"
npx wrangler d1 execute slgrvtrs-voters --remote --command "SELECT COUNT(*) FROM dms"

# Import CSV (alternative to SQL migrations)
npx wrangler d1 execute slgrvtrs-voters --remote --file=data.csv --command="SELECT * FROM dms"
```

## Appendix B: `dm_code` Format Reference

| Context | Format | Example |
|---------|--------|---------|
| `dm.json` key | `"{dun_prefix}.{dm_name}"` | `"01.BANDAR COUNTRY HOME 1"` |
| `dms.dm_code` (D1) | Same as JSON | `"01.BANDAR COUNTRY HOME 1"` |
| `dm_centroids.geojson` property | Same as JSON | `"01.BANDAR COUNTRY HOME 1"` |
| `dm.json` `dun_code` | `"{dun_prefix}.{dun_name}"` | `"14.RAWANG"` |
| `dms.dun_code` (D1 FK) | `"N.{dun_prefix}"` | `"N.14"` |
| `duns.code_dun` (D1 PK) | `"N.{dun_prefix}"` | `"N.14"` |
| `dm.json` `code_parlimen` | `"{parl_prefix}.{parl_name}"` | `"97.SELAYANG"` |
| `dms.code_parlimen` (D1 FK) | `"P.{parl_prefix}"` | `"P.097"` |
| `parliaments.code_parlimen` (D1 PK) | `"P.{parl_prefix}"` | `"P.097"` |

## Appendix C: Dependency Changes

```bash
# Install
npm install -D @cloudflare/workers-types

# No new runtime dependencies required
# D1 is accessed via the built-in env.DB binding — no ORM needed
# For Phase 5, consider adding drizzle-orm for type-safe queries:
# npm install drizzle-orm
# npm install -D drizzle-kit
```
