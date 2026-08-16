# Cloudflare D1 Database — SLGRVTRS Voter Data

> **Status**: D1 database provisioned and live. 22 parliaments, 56 DUNs, 945 DMs loaded.
> **Last updated**: 2026-08-16
> **Database**: `slgrvtrs-voters` (ID: `59afb76e-a3a2-4e2a-b18d-857f9f5704fb`, region APAC)
> **Binding**: `env.DB` in `wrangler.jsonc`
> **See**: `docs/PHASE3_D1_DATABASE_IMPLEMENTATION.md` for implementation plan (completed)
> **Phase 5A**: geocode_cache table added, 945 DM centroid coordinates populated via Google Maps / Nominatim geocoding.

---

## Table of Contents

1. [Why D1 for SLGRVTRS](#1-why-d1-for-slgrvtrs)
2. [Free Tier Limits](#2-free-tier-limits)
3. [Dataset Analysis](#3-dataset-analysis)
4. [Schema Design](#4-schema-design)
5. [Data Segmentation Strategy](#5-data-segmentation-strategy)
6. [Migration Pipeline](#6-migration-pipeline)
7. [Query Patterns](#7-query-patterns)
8. [Integration with Next.js](#8-integration-with-next-js)
9. [Step-by-Step Setup](#9-step-by-step-setup)
10. [Risk Assessment](#10-risk-assessment)

---

## 1. Why D1 for SLGRVTRS

D1 is Cloudflare's **serverless SQLite** database. It runs at the edge (300+ locations) and is perfect for:

- **Read-heavy workloads** (map dashboards are 95% reads)
- **Small to medium datasets** (3.9M rows is well within limits)
- **Low-latency queries** from Workers at the edge
- **Free tier** with no credit card

D1 is **not** needed for Phase 1-2 (static JSON files work fine). It becomes valuable in Phase 3+ when:
- DM-level voter statistics need to be queried dynamically
- Filter/search by demographic attributes is needed
- Real-time aggregation (by age range, ethnicity, gender) is required

---

## 2. Free Tier Limits

| Resource | Free Limit | SLGRVTRS Projection |
|----------|-----------|-------------------|
| **Databases** | 10 per account | 1-2 (voters, optional search index) |
| **Total storage** | 5 GB total | ~800 MB (see §3) |
| **Rows read/day** | 5,000,000 | ~100K/day (100x headroom) |
| **Rows written/day** | 100,000 | ~100K on initial load, then 0 |
| **Rows stored** | Unlimited (within 5 GB) | 3.97M voters + 945 DMs + 56 DUNs + 22 Parliaments |
| **Request size** | 1 MB | ~1 KB per query |
| **Response size** | 100 MB | ~50 KB per typical query |
| **Query duration** | No hard limit (CPU limit applies) | <50 ms expected |
| **Statement timeout** | No limit on D1 itself | Workers 10 ms CPU (but D1 queries don't count toward Worker CPU) |

**Critical insight: D1 query execution time does NOT count toward the Worker CPU limit.** A complex aggregation query that takes 200ms of D1 time only consumes ~1ms of Worker CPU for the request/response overhead.

---

## 3. Dataset Analysis

### 3.1 Raw Data Profile

| Source | Rows | Columns | Estimated Size |
|--------|------|---------|---------------|
| Selangor Voter Registry (4 xlsx files) | 3,971,650 | ~15 per row | ~600 MB raw |
| Aggregated Parliament stats | 22 | 17 metrics | ~5 KB |
| Aggregated DUN stats | 56 | 17 metrics | ~15 KB |
| Aggregated DM stats (Phase 3) | ~945 | 17 metrics | ~200 KB |
| Parliament GeoJSON | 22 features | 4,386 vertices | 182 KB |
| DUN GeoJSON | 56 features | 8,600 vertices | ~400 KB |

### 3.2 Individual Voter Record Columns

From the SPR Excel source files, each voter record contains:

| Column | Type | Description | Example |
|--------|------|-------------|--------|
| `voter_id` | TEXT | Unique voter identifier | `S001-01-001234` |
| `dm_code` | TEXT | Daerah Mengundi code | `DM01` |
| `dun_code` | TEXT | DUN code (with N. prefix) | `N.01` |
| `parlimen_code` | TEXT | Parliament code (with P. prefix) | `P.092` |
| `name` | TEXT | Voter name | `AHMAD BIN ALI` |
| `age` | INTEGER | Voter age | `45` |
| `gender` | TEXT | M or F | `M` |
| `race` | TEXT | Ethnicity code | `01` (Malay), `02` (Chinese), `03` (Indian), `04` (Others) |
| `locality` | TEXT | Locality/village name | `KG. SUNGAI AIR TAWAR` |
| `has_contact` | INTEGER | Has phone/contact (0/1) | `1` |

### 3.3 Storage Estimate in D1

| Table | Rows | Row Size | Total |
|--------|------|----------|-------|
| `voters` | 3,971,650 | ~200 bytes | ~795 MB |
| `parliaments` | 22 | ~500 bytes | ~11 KB |
| `duns` | 56 | ~600 bytes | ~34 KB |
| `dms` | 945 | ~500 bytes | ~473 KB |
| **Total** | | | **~796 MB** |

**796 MB < 5 GB limit.** Fits comfortably with 6.3x headroom.

---

## 4. Schema Design

### 4.1 Entity Relationship

```
parliaments (22)
    └── duns (56, FK: parlimen_code)
            └── dms (945, FK: dun_code)
                    └── voters (3.97M, FK: dm_code)
```

### 4.2 Table Definitions

```sql
-- Parliament-level aggregated statistics
CREATE TABLE parliaments (
  code_parlimen   TEXT PRIMARY KEY,  -- 'P.092'
  name            TEXT NOT NULL,         -- 'SABAK BERNAM'
  voter_prefix    TEXT NOT NULL,         -- '092'
  total_voters    INTEGER NOT NULL,
  male            INTEGER NOT NULL,
  female          INTEGER NOT NULL,
  male_pct        REAL NOT NULL,
  female_pct      REAL NOT NULL,
  malay_pct       REAL NOT NULL,
  chinese_pct     REAL NOT NULL,
  indian_pct      REAL NOT NULL,
  other_pct       REAL NOT NULL,
  age_mean        REAL NOT NULL,
  age_median      REAL NOT NULL,
  contact_pct     REAL NOT NULL,
  child_dun_count INTEGER NOT NULL,
  geom            TEXT                    -- GeoJSON Polygon (stored as text)
);

-- DUN-level aggregated statistics
CREATE TABLE duns (
  code_dun        TEXT PRIMARY KEY,      -- 'N.01'
  name            TEXT NOT NULL,            -- 'SUNGAI AIR TAWAR'
  code_parlimen   TEXT NOT NULL REFERENCES parliaments(code_parlimen),
  voter_prefix    TEXT NOT NULL,            -- '01'
  total_voters    INTEGER NOT NULL,
  male            INTEGER NOT NULL,
  female          INTEGER NOT NULL,
  male_pct        REAL NOT NULL,
  female_pct      REAL NOT NULL,
  malay_pct       REAL NOT NULL,
  chinese_pct     REAL NOT NULL,
  indian_pct      REAL NOT NULL,
  other_pct       REAL NOT NULL,
  age_mean        REAL NOT NULL,
  age_median      REAL NOT NULL,
  contact_pct     REAL NOT NULL,
  dm_count        INTEGER NOT NULL,
  locality_count  INTEGER NOT NULL,
  geom            TEXT                        -- GeoJSON Polygon
);

-- DM-level aggregated statistics
CREATE TABLE dms (
  dm_code         TEXT PRIMARY KEY,      -- 'DM01'
  name            TEXT NOT NULL,
  dun_code        TEXT NOT NULL REFERENCES duns(code_dun),
  code_parlimen   TEXT NOT NULL,
  voter_prefix    TEXT NOT NULL,
  total_voters    INTEGER NOT NULL,
  male            INTEGER NOT NULL,
  female          INTEGER NOT NULL,
  male_pct        REAL,
  female_pct      REAL,
  malay_pct       REAL,
  chinese_pct     REAL,
  indian_pct      REAL,
  other_pct       REAL,
  age_mean        REAL,
  age_median      REAL,
  contact_pct     REAL,
  centroid_lng    REAL,
  centroid_lat    REAL
);

-- Individual voter records (Phase 5 — loaded on demand)
-- NOTE: This table is NOT recommended for the free tier if you need
-- frequent writes. Load once, read often.
CREATE TABLE voters (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id        TEXT NOT NULL UNIQUE,
  dm_code         TEXT NOT NULL REFERENCES dms(dm_code),
  dun_code        TEXT NOT NULL,
  parlimen_code   TEXT NOT NULL,
  age             INTEGER NOT NULL,
  gender          TEXT NOT NULL CHECK(gender IN ('M', 'F')),
  race            TEXT NOT NULL,
  locality        TEXT NOT NULL DEFAULT '',
  has_contact     INTEGER NOT NULL DEFAULT 0
);

-- Indexes for common query patterns
CREATE INDEX idx_voters_dm ON voters(dm_code);
CREATE INDEX idx_voters_dun ON voters(dun_code);
CREATE INDEX idx_voters_parl ON voters(parlimen_code);
CREATE INDEX idx_voters_age ON voters(age);
CREATE INDEX idx_voters_gender ON voters(gender);
CREATE INDEX idx_voters_race ON voters(race);
CREATE INDEX idx_dms_dun ON dms(dun_code);
CREATE INDEX idx_dms_parl ON dms(code_parlimen);

-- Geocode cache for DM centroid lookups (Phase 5A)
CREATE TABLE geocode_cache (
  query_hash TEXT PRIMARY KEY,  -- SHA-256 hash of normalized query string
  dm_code   TEXT NOT NULL,
  lat       REAL NOT NULL,
  lng       REAL NOT NULL,
  accuracy_level TEXT NOT NULL CHECK(accuracy_level IN ('exact', 'locality', 'admin', 'country')),
  source    TEXT NOT NULL CHECK(source IN ('google', 'nominatim', 'cache')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  hit_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_geocode_cache_dm ON geocode_cache(dm_code);
CREATE INDEX idx_geocode_cache_source ON geocode_cache(source);
CREATE INDEX idx_geocode_cache_accuracy ON geocode_cache(accuracy_level);
CREATE INDEX idx_geocode_cache_created ON geocode_cache(created_at);
```

### 4.3 Design Decisions

1. **GeoJSON stored as TEXT, not as SQLite geometry.** D1 does not support `Spatialite` extensions. For boundary rendering, continue using static GeoJSON files in `public/`. D1 stores the GeoJSON for potential future API use only.

2. **Pre-aggregated tables vs. raw voters.** The `parliaments`, `duns`, and `dms` tables store pre-computed statistics (from the Python aggregation pipeline). The `voters` table stores individual records. This avoids expensive `COUNT/GROUP BY` queries at runtime.

3. **`voter_prefix` as join key.** Maintains compatibility with the existing GeoJSON `voter_prefix` property used for data joins.

---

## 5. Data Segmentation Strategy

### 5.1 Segmentation Levels

The voter data is naturally segmented into 4 levels, matching the political hierarchy:

```
Selangor (State)
  ├── Parliament P.092 (22 seats)
  │     ├── DUN N.01 Sungai Air Tawar (56 seats)
  │     │     ├── DM01 (945 DMs)
  │     │     │     ├── ~4,200 individual voters
  │     │     │     └── ...
  │     │     └── ...
  │     └── ...
  └── ...
```

### 5.2 Labels Already Present

Each voter record in the SPR Excel files already has:
- **Parliament code**: `P.092` (present in voter data)
- **DUN code**: `N.01` (present in voter data)
- **DM code**: present in voter data
- **Locality name**: present in voter data

These labels directly map to the GeoJSON boundary properties:

| Voter Record | GeoJSON Property |
|--------------|-------------------|
| `P.092` | `code_parlimen` in `selangor_parliament.geojson` |
| `N.01` | `code_dun` in `selangor_dun.geojson` |
| `DM01` | `dm_code` in `dm_centroids.geojson` (Phase 3) |

### 5.3 Segmentation for D1 Loading

**Recommended loading order (to minimize write quota):**

1. **Load `parliaments` (22 rows)** — pre-aggregated from Python pipeline
2. **Load `duns` (56 rows)** — pre-aggregated from Python pipeline
3. **Load `dms` (945 rows)** — pre-aggregated from Python pipeline
4. **Load `voters` (3,971,650 rows)** — from the 4 Excel source files

Step 4 consumes 3,971,650 of the 100,000 daily write quota. **This must be done over ~40 days** on the free tier, or done in a single batch by temporarily using a paid plan ($5/month) and downgrading after.

**Alternative: Skip the `voters` table entirely.** If the map only needs aggregated statistics (which is the case for Phase 1-4), the `parliaments`, `duns`, and `dms` tables total only **1,023 rows** — well within the free tier's daily write limit.

---

## 6. Migration Pipeline

### 6.1 Prerequisites

Wrangler is already installed in `devDependencies` and authenticated via CF dashboard. For local CLI usage:

```bash
npx wrangler login  # only if not already authenticated
```

### 6.2 Create Database

```bash
npx wrangler d1 create slgrvtrs-voters
# Outputs: database_id (save this)
```

### 6.3 Apply Schema

```bash
npx wrangler d1 execute slgrvtrs-voters --remote --file=./migrations/0001_analytics_warehouse.sql
```

The schema file is already in the repo at `dashboard/migrations/0001_analytics_warehouse.sql`.

### 6.4 Load Pre-Aggregated Stats (Phase 2-3)

The SQL files are already generated and in the repo:

```bash
# These files are at dashboard/migrations/0002_load_parliaments.sql
# and dashboard/migrations/0003_load_duns.sql
# They were generated by: python3 scripts/build_d1_load.py

npx wrangler d1 execute slgrvtrs-voters --remote --file=./migrations/0002_load_parliaments.sql
npx wrangler d1 execute slgrvtrs-voters --remote --file=./migrations/0003_load_duns.sql
```

### 6.5 Load Individual Voters (Phase 5)

```bash
# Parse 4 Excel files → SQL INSERT (batched)
python3 scripts/build_d1_voters.py > voters_load.sql

# Load in batches (100K rows/batch to avoid timeouts)
split -l 100000 voters_load.sql voters_batch_
for f in voters_batch_*; do
  npx wrangler d1 execute slgrvtrs-voters --remote --file="$f"
done
```

---

## 7. Query Patterns

### 7.1 Get Parliament with Stats

```sql
SELECT * FROM parliaments WHERE code_parlimen = 'P.092';
```

### 7.2 Get DUNs Under a Parliament

```sql
SELECT * FROM duns WHERE code_parlimen = 'P.092' ORDER BY voter_prefix;
```

### 7.3 Get DMs Under a DUN

```sql
SELECT dm_code, name, total_voters, male_pct, female_pct, malay_pct,
       chinese_pct, indian_pct, age_mean, age_median, contact_pct,
       centroid_lng, centroid_lat
FROM dms WHERE dun_code = 'N.01'
ORDER BY total_voters DESC;
```

### 7.4 Aggregate Stats Across DUNs (for Parliament popup)

```sql
SELECT 
  SUM(total_voters) as total_voters,
  SUM(male) as total_male,
  SUM(female) as total_female,
  AVG(malay_pct) as avg_malay_pct,
  AVG(chinese_pct) as avg_chinese_pct,
  AVG(indian_pct) as avg_indian_pct,
  AVG(age_mean) as avg_age_mean,
  AVG(contact_pct) as avg_contact_pct,
  COUNT(*) as dun_count
FROM duns WHERE code_parlimen = 'P.092';
```

### 7.5 Demographic Filter (Phase 3+ API route)

```sql
SELECT gender, COUNT(*) as count, ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM voters WHERE dm_code = 'DM01'), 2) as pct
FROM voters
WHERE dm_code = 'DM01'
GROUP BY gender;
```

---

## 8. Integration with Next.js

### 8.1 Wrangler Binding

```jsonc
// wrangler.jsonc
{
  "name": "slgrvtrs",
  "compatibility_date": "2025-07-18",
  "compatibility_flags": ["nodejs_compat"],
  "main": ".open-next/worker.js",
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "slgrvtrs-voters",
      "database_id": "<YOUR_DATABASE_ID>"
    }
  ]
}
```

### 8.2 API Route Example (Phase 3)

**CRITICAL**: From pip-melaka research — do NOT use `export const runtime = 'edge'`.
Cloudflare Workers already run on the edge. The `nodejs_compat` flag in `wrangler.jsonc`
handles Node.js compatibility. Using `runtime = 'edge'` causes a 500 error in production.

```typescript
// src/app/api/dms/route.ts
import { NextRequest } from 'next/server';

// NO "export const runtime = 'edge'" — Workers are already edge

interface Env {
  DB: D1Database;
}

export async function GET(request: NextRequest, { env }: { env: Env }) {
  const { searchParams } = new URL(request.url);
  const dunCode = searchParams.get('dun') ?? '';

  const results = await env.DB.prepare(
    `SELECT dm_code, name, total_voters, male_pct, female_pct,
            malay_pct, chinese_pct, indian_pct, other_pct,
            age_mean, age_median, contact_pct, centroid_lng, centroid_lat
     FROM dms WHERE dun_code = ? ORDER BY total_voters DESC`
  ).bind(dunCode).all();

  return Response.json(results.results);
}
```

### 8.3 TypeScript D1 Types

```typescript
// src/types/d1.ts
export interface Env {
  DB: D1Database;
}

export interface ParliamentRow {
  code_parlimen: string;
  name: string;
  voter_prefix: string;
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
  child_dun_count: number;
}
```

---

## 9. Step-by-Step Setup

> Wrangler is already installed (`devDependencies`) and authenticated via CF dashboard.
> Migration SQL files are already in `dashboard/migrations/`.

1. `npx wrangler d1 create slgrvtrs-voters` — Create database
2. Save `database_id` to `wrangler.jsonc` (uncomment the `d1_databases` block)
3. `npx wrangler d1 execute slgrvtrs-voters --remote --file=./migrations/0001_analytics_warehouse.sql`
4. `npx wrangler d1 execute slgrvtrs-voters --remote --file=./migrations/0002_load_parliaments.sql`
5. `npx wrangler d1 execute slgrvtrs-voters --remote --file=./migrations/0003_load_duns.sql`
6. Verify: `npx wrangler d1 execute slgrvtrs-voters --remote --command="SELECT COUNT(*) FROM parliaments"` (expect 22)
7. Verify: `npx wrangler d1 execute slgrvtrs-voters --remote --command="SELECT COUNT(*) FROM duns"` (expect 56)

---

## 10. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Free tier 100K writes/day | Loading 3.97M voters takes 40 days | Load only aggregated tables (~1K rows) for Phase 2-4; defer individual voters to Phase 5 |
| 5 GB storage limit | ~800 MB projected, 6.3x headroom | Monitor; add indexes selectively |
| No Spatialite | Can't do spatial queries in D1 | Keep GeoJSON in static files for rendering; use DUN/DM codes for joins only |
| D1 query latency | Adds ~10-50ms to API routes | Acceptable for dashboard use; pre-aggregated tables minimize queries |
| Worker 10ms CPU limit | Complex queries might hit this | D1 query time does NOT count toward Worker CPU; only request/response overhead |
| Database deletion after 90 days inactivity | Data loss | Free tier databases persist as long as account is active and any read happens |

---

## 11. Hard "Do NOT Do This on Free Tier" List

> Extracted from pip-melaka's `CLOUDFLARE-FREE-TIER-ARCHITECTURE.md` — battle-tested rules.

These patterns run hot paths over the 10ms CPU budget, the 50 subrequest cap, the 128MB memory cap, or all three. They **must** run offline (developer laptop, CI):

- [ ] Parse the full 3.9M-row voter dataset inside a Worker request
- [ ] Build any spatial aggregates (H3, grids) in-request
- [ ] Generate MVT tiles in-request
- [ ] Join 22 Parliaments x 56 DUNs x 945 DMs x N segments on the Worker
- [ ] Load large JSONL/GeoJSON from `public/` at request time (use build-time imports only)
- [ ] Bulk `INSERT` rows into D1 one row at a time from a Worker (use `wrangler d1 import` offline)

### Approved hot path (from pip-melaka pattern)

Every Worker request must:
1. Return in **<= 10ms CPU** (validation -> 1-2 indexed D1 prepared statements -> JSON serialize)
2. Use **<= 5 subrequests** (<= 2 D1, <= 1 R2 GET, <= 1 cache lookup)
3. Never hold more than ~2MB in memory
4. Use prepared statements with parameterized binds (`.bind(param)`), never string interpolation