# SLGRVTRS MapLibre Dashboard — Project Blueprint

**Project**: Selangor Voter Registry Interactive Map Dashboard  
**Tech Stack**: MapLibre GL JS 6.3 + Next.js 16.3 + TypeScript + Tailwind CSS 4  
**Data**: 3,971,650 registered voters across 56 DUNs, 22 Parliaments, 945 DMs  
**Deployed**: https://slgrvtrs.ritz-analytics.workers.dev (Cloudflare Workers, free tier)  
**Last updated**: 2026-08-15  
**License**: Project-specific; boundary data from MECo (CC0), voter data (private)  

---

## 1. Project Overview

An interactive web map dashboard that visualizes Selangor's voter registry data segmented by electoral boundaries. Users can explore demographic compositions (gender, race, age) at the Parliament, DUN, and DM levels through choropleth maps, popups, and drill-down interactions.

### Core Capabilities

- **Layer 1**: Parliament constituency boundaries (22 polygons) — click to see aggregated stats, choropleth by 7 metrics  ✅
- **Layer 2**: DUN (State Assembly) boundaries (56 polygons) — drill-down from Parliament, click for detailed demographics  ✅
- **Layer 3**: DM (Voting District) centroids/bubbles (945 points) — proportional to voter count, race/gender filters  ✅
- **Layer 4** (future): Individual geocoded voter points with clustering (3.97M points)

### Current Status

| Phase | Description | Status | Deployed |
|-------|-------------|--------|----------|
| Phase 1 | Parliament choropleth, 7 metrics, legend, popup, hover | **COMPLETE** | ✅ Yes |
| Phase 2 | DUN drill-down, zoom visibility, toggles, DUN popup | **COMPLETE** | ✅ Yes |
| Phase 3 | DM bubble visualization, centroid generation, filters | **COMPLETE** | ✅ Yes |
| Phase 4 | Responsive, error boundaries, Lighthouse audit | Not started | — |
| Phase 5 | Individual voter points via PMTiles + R2 | Future | — |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  Next.js 16.3 + React 19 + TypeScript 5          │
│  MapLibre GL JS 6.3 (ESM, worker in public/)     │
│  Tailwind CSS 4 + shadcn/ui                     │
│                                                   │
│  ┌─────────────────────────────────────────┐     │
│  │           MapLibre Map Container         │     │
│  │  ┌─────────────────────────────────────┐ │     │
│  │  │  Layer 0: Selangor outline           │ │     │
│  │  │  Layer 1: Parliament (22 polys) ✅  │ │     │
│  │  │  Layer 2: DUN (56 polys) ✅         │ │     │
│  │  │  Layer 3: DM centroids (945 pts)   │ │     │
│  │  │  Layer 4: (future) voter points    │ │     │
│  │  └─────────────────────────────────────┘ │     │
│  └─────────────────────────────────────────┘     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Sidebar  │ │ Legend   │ │ Popup/Panel     │  │
│  │ Layer    │ │ (reusable│ │ Parliament:     │  │
│  │ toggles  │ │  Legend  │ │  12-field stats │  │
│  │ Metric   │ │  .tsx)  │ │ DUN:            │  │
│  │ selector │ │          │ │  16-field stats │  │
│  └──────────┘ └──────────┘ └──────────────────┘  │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│              Static Assets (public/)               │
│  GeoJSON boundaries + JSON stats                  │
│  MapLibre ESM worker + shared module              │
│  No API routes needed (Phase 1-2)                 │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│          Cloudflare Workers (OpenNext)             │
│  @opennextjs/cloudflare 1.20.1                    │
│  wrangler 4.112.0                                 │
│  46 assets, 827 KB gzip, 20ms startup             │
│  Free tier (no credit card)                       │
│  Future: D1 database binding (Phase 3+)           │
│  Future: R2 bucket binding (Phase 5)               │
└─────────────────────────────────────────────────┘
```

---

## 3. Data Pipeline

### 3.1 Pre-computed Statistics

The xlsx files are processed offline (Python + calamine/pandas) to produce pre-aggregated JSON files. These are committed to the repo and served as static assets from `public/` — no server-side processing at runtime.

```
xlsx files (4x ~1M rows each)
    ↓ scripts/analyze_xlsx.py, scripts/build_dun_stats.py
aggregation pipeline
    ↓
public/stats/parliament.json  → 22 records, keyed by voter_prefix ("092"-"113")
  { total_voters, male, female, male_pct, female_pct,
    malay_pct, chinese_pct, indian_pct, other_pct,
    age_mean, age_median, contact_pct, child_dun_count }

public/stats/dun.json  → 56 records, keyed by voter_prefix ("01"-"56")
  { total_voters, male, female, male_pct, female_pct,
    malay_pct, chinese_pct, indian_pct, other_pct,
    age_mean, age_median, contact_pct, dm_count, locality_count }

public/stats/dm.json  → 945 records keyed by dm_code (e.g. "01.SUNGAI AIR TAWAR")
  { dm_code, dun_code, dun_prefix, code_parlimen, total_voters, male, female,
    male_pct, female_pct, malay_pct, chinese_pct, indian_pct, other_pct,
    age_mean, age_median, contact_pct,
    male_malay, male_chinese, male_indian, male_other,
    female_malay, female_chinese, female_indian, female_other }
```

### 3.2 Boundary Files

| File | Source | Format | Size | Location |
|------|--------|--------|------|----------|
| Parliament boundaries | MECo (post-2018), filtered to Selangor | GeoJSON | 183 KB | `public/boundaries/selangor_parliament.geojson` |
| DUN boundaries | MECo (post-2018), filtered to Selangor | GeoJSON | 215 KB | `public/boundaries/selangor_dun.geojson` |
| Selangor outline | Generated via `scripts/generate_outline.py` | GeoJSON MultiPolygon | 178 KB | `public/boundaries/selangor_outline.geojson` |
| DM centroids | Python Shapely grid-in-polygon | GeoJSON Points | 849 KB | `public/boundaries/dm_centroids.geojson` |

### 3.3 Data-Join Keys

The GeoJSON features use `voter_prefix` (3-digit zero-padded string) as the join key. Stats JSON files use the same key format.

| Level | GeoJSON Property | Example | Stats JSON Key | Match |
|-------|-----------------|---------|---------------|-------|
| Parliament | `voter_prefix` | `"092"` | `parliament.json["092"]` | ✅ 100% (22/22) |
| DUN | `voter_prefix` | `"01"` | `dun.json["01"]` | ✅ 100% (56/56) |
| DM | `dm_code` (in properties) | `"01.BANDAR COUNTRY HOME 1"` | Embedded in GeoJSON properties | ✅ 100% (945/945) |

The join is performed client-side by `join-stats.ts` which merges stats into GeoJSON feature properties before adding the source to the map.

---

## 4. Map Layer Specifications

### Layer 0: Selangor Outline (background) ✅

| Property | Value |
|----------|-------|
| Type | `fill` + `line` |
| Source | `public/boundaries/selangor_outline.geojson` |
| Features | 1 MultiPolygon |
| Fill | Light gray, 0.35 opacity |
| Border | Dark slate, 2.5px |
| Zoom range | Always visible |

### Layer 1: Parliament Boundaries (22 polygons) ✅

| Property | Value |
|----------|-------|
| Type | `fill` + `line` + `symbol` (label) |
| Source | `public/boundaries/selangor_parliament.geojson` |
| Features | 22 polygons |
| Color | Choropleth by selected metric (7 options) |
| Interaction | Click → popup (12 fields), hover → highlight via feature-state |
| Zoom range | [6, 9] (`maxzoom: 9` on fill + label) |
| Popup | Code, name, total voters, M/F %, race %, age, contact %, DUN count |
| Hover | `setFeatureState({ hover: true/false })`, no `promoteId` |

### Layer 2: DUN Boundaries (56 polygons) ✅

| Property | Value |
|----------|-------|
| Type | `fill` + `line` + `symbol` (label) |
| Source | `public/boundaries/selangor_dun.geojson` |
| Features | 56 polygons |
| Color | Static teal fill (`#b2dfdb`, 0.5 opacity) |
| Interaction | Click → popup (16 fields), hover → highlight via feature-state |
| Zoom range | [8.5, ∞] (`minzoom: 8.5` on fill/border, `minzoom: 9` on label) |
| Popup | DUN name, code, parent Parliament, total voters, M/F %, race %, age, contact %, DM count, locality count |
| Drill-down | Click Parliament → filter DUNs by `parent_parl`, flyTo zoom 10.5 |
| Back button | "← Back to Selangor overview" resets filter + zoom |

### Layer 3: DM Centroids/Bubbles (945 points) ✅

| Property | Value |
|----------|-------|
| Type | `circle` |
| Source | `public/boundaries/dm_centroids.geojson` |
| Features | 945 points (all within DUN boundaries) |
| Size | `interpolate` on `total_voters`, 3px (2K voters) → 20px (15K voters) |
| Color | Red sequential (`#fbb4ae` → `#b40426`) by `total_voters` |
| Interaction | Hover → tooltip (name + count), click → detailed popup (14 fields) |
| Zoom range | [11, 18] (`minzoom: 11`) |
| Hover highlight | `setFeatureState({ hover: true })` on ring layer |
| Filters | Gender (All/Male/Female) + Race (All/Malay/Chinese/Indian) via sidebar buttons |

**DM Centroid Generation** (Strategy C — Shapely grid-in-polygon):

```python
# scripts/generate_dm_centroids.py
# Grid spacing: 0.004 degrees (~350m at latitude 3N)
# Falls back to 0.002 spacing for dense DUNs
# Stats embedded directly in GeoJSON properties (no client-side join needed)
```

### Layer 4: Individual Voter Points (future) — Phase 5

| Property | Value |
|----------|-------|
| Type | `circle` with clustering (`supercluster`) |
| Source | PMTiles via Cloudflare R2 |
| Features | 3,971,650 points |
| Clustering | Supercluster at zoom <14, individual points at zoom 14+ |
| Zoom range | [14, 20] |
| Color | By gender, race, or age group |

---

## 5. UI/UX Design

### 5.1 Layout (Implemented)

```
┌──────────────────────────────────────────────────────┐
│  ≡ Toggle                              [Nav] [Attr] │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ Sidebar  │                                           │
│ (w-72,   │         MapLibre Map                     │
│ collapsi │         (WebGL2)                         │
│  ble)    │                                           │
│          │  ┌─────────────────────────┐              │
│ Metric   │  │ Legend / Color Scale    │              │
│ selector │  │ (dynamic, updates with  │              │
│ (7 opts) │  │  metric selection)      │              │
│          │  └─────────────────────────┘              │
│ Layer    │                                           │
│ toggles  │        Popup on click                    │
│ ☑ Parl   │        Hover highlight                   │
│ ☑ DUN    │                                           │
│ ☐ DM     │                                           │
│ (945)    │                                           │
│          │                                           │
│ [Back]   │                                           │
│ (drill)  │                                           │
├──────────┴───────────────────────────────────────────┤
```

### 5.2 Color Schemes (Implemented)

| Metric | Palette | Type | Range |
|--------|---------|------|-------|
| Total voters | YlOrRd | Sequential | min → max of dataset |
| Malay % | Blues | Sequential | 0% → 100% |
| Chinese % | Oranges | Sequential | 0% → 100% |
| Indian % | Greens | Sequential | 0% → 100% |
| Age (mean) | Viridis | Sequential | min → max age |
| Contact % | PuBu | Sequential | 0% → 100% |
| Female % | RdBu (reversed) | Sequential | 0% → 100% |

Defined in `src/lib/map/color-scales.ts` as `PARL_COLOR_SCALES` array.

### 5.3 Interactions (Implemented)

| Interaction | Trigger | Behavior |
|-------------|--------|----------|
| DM hover | `mousemove` on `dm-bubble` | Tooltip (name + count), `setFeatureState` hover ring, cursor pointer |
| DM click | `click` on `dm-bubble` | Popup with 14-field demographics |
| Gender filter | 3 buttons (All/Male/Female) | Filter DM bubbles by gender sub-counts |
| Race filter | 4 buttons (All/Malay/Chinese/Indian) | Filter DM bubbles by race sub-counts |
| Parliament hover | `mousemove` on `parliament-fill` | `setFeatureState` hover=true, cursor pointer |
| Parliament click | `click` on `parliament-fill` | Popup with 12-field stats + filter DUNs by `parent_parl` + flyTo zoom 10.5 |
| DUN hover | `mousemove` on `dun-fill` | `setFeatureState` hover=true, cursor pointer |
| DUN click | `click` on `dun-fill` | Popup with 16-field demographics |
| Back button | Click "← Back to Selangor overview" | Clear DUN filter, flyTo state center at default zoom |
| Metric change | `<select>` dropdown | Re-color Parliament choropleth + update Legend |
| Layer toggle | Checkboxes (Parliament/DUN/DM) | `setLayoutProperty` visibility on/off |
| Sidebar toggle | `≡` button | Collapse/expand sidebar (`w-72` ↔ `w-0`) |

---

## 6. Technology Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|----------|
| Framework | Next.js | 16.3.1 | App Router, static pages |
| Language | TypeScript | 5.x | Type safety (`ES2017` target) |
| Mapping | MapLibre GL JS | 6.3 | WebGL2 map rendering, ESM worker |
| Styling | Tailwind CSS | 4.x | Utility-first CSS |
| UI | shadcn/ui | latest | Accessible components |
| Data | Pre-computed JSON | — | Static stats from `public/stats/` |
| Boundaries | GeoJSON | — | Electoral boundaries from `public/boundaries/` |
| Workers | @opennextjs/cloudflare | 1.20.1 | Next.js → CF Workers adapter |
| CLI | wrangler | 4.112.0 | CF build/deploy |
| Database | Cloudflare D1 | (Phase 4+) | Edge SQLite for DM queries |
| Storage | Cloudflare R2 | (Phase 5) | PMTiles for voter points |
| Hosting | Cloudflare Workers | Free tier | 300+ edge nodes, unlimited bandwidth |

---

## 7. File Structure (Actual)

```
slgrvtrs/
├── dashboard/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx              # Root layout
│   │   │   ├── page.tsx                # Dynamic import MapDashboard (ssr: false)
│   │   │   └── globals.css
│   │   ├── components/map/
│   │   │   ├── MapDashboard.tsx        # Main map (890 lines) — all layers, popups, sidebar
│   │   │   └── Legend.tsx               # Reusable color legend (30 lines)
│   │   └── lib/map/
│   │       ├── setup.ts                # MapLibre init, workerUrl config (19 lines)
│   │       ├── color-scales.ts         # 7 PARL_COLOR_SCALES + interpolation (240 lines)
│   │       └── join-stats.ts            # Client-side GeoJSON ← JSON merge (64 lines)
│   ├── public/
│   │   ├── boundaries/
│   │   │   ├── selangor_parliament.geojson  # 22 features, 183 KB
│   │   │   ├── selangor_dun.geojson         # 56 features, 215 KB
│   │   │   ├── selangor_outline.geojson     # 1 MultiPolygon, 178 KB
│   │   │   └── dm_centroids.geojson        # 945 points, 849 KB (Phase 3)
│   │   ├── stats/
│   │   │   ├── parliament.json              # 22 records, 8.2 KB
│   │   │   ├── dun.json                     # 56 records, 24 KB
│   │   │   └── dm.json                      # 945 records, 429 KB (Phase 3)
│   │   ├── maplibre-gl-worker.mjs          # MapLibre ESM worker, 19 KB
│   │   └── maplibre-gl-shared.mjs          # MapLibre shared module, 471 KB
│   ├── migrations/
│   │   ├── 0001_analytics_warehouse.sql   # D1 schema (parliaments, duns, dms + indexes)
│   │   ├── 0002_load_parliaments.sql      # 22 INSERT OR REPLACE
│   │   └── 0003_load_duns.sql             # 56 INSERT OR REPLACE
│   ├── wrangler.jsonc                       # CF Worker config (D1/R2 commented out)
│   ├── open-next.config.ts                 # OpenNext adapter config
│   ├── .cloudflareignore                   # Deployment exclusions
│   ├── next.config.ts                      # CF-compatible (no standalone, unoptimized images)
│   ├── package.json                        # CF deploy scripts
│   └── tsconfig.json                       # Target: ES2017
├── scripts/
│   ├── analyze_xlsx.py                    # Parliament aggregation from xlsx
│   ├── build_dun_stats.py                 # DUN aggregation from xlsx
│   ├── build_dm_stats.py                  # DM aggregation from xlsx (Phase 3)
│   ├── generate_dm_centroids.py           # Shapely grid-in-polygon DM centroids (Phase 3)
│   ├── build_d1_load.py                   # Generate D1 SQL from JSON stats
│   ├── filter_dun.py                      # Filter MECo GeoJSON to Selangor DUNs
│   └── generate_outline.py                # Generate Selangor outline GeoJSON
├── docs/
│   └── CLOUDFLARE_IMPLEMENTATION_CHECKLIST.md  # CF deployment task tracking
├── CLOUDFLARE_DEPLOYMENT.md               # CF deployment guide (deployed)
├── CLOUDFLARE_D1_DATABASE.md              # D1 database design
├── CLOUDFLARE_PHASE_COMPATIBILITY.md      # Phase × CF compatibility matrix
└── MAPLIBRE_PROJECT.md                    # This file
```

### Key differences from original plan

| Planned | Actual | Reason |
|---------|--------|--------|
| `components/map/ParliamentLayer.tsx` | All layers in `MapDashboard.tsx` | Single-file approach sustained through Phase 3; refactor in Phase 4 if needed |
| `components/sidebar/MetricSelector.tsx` | Inline in `MapDashboard.tsx` | Sidebar is tightly coupled to map state |
| `components/charts/GenderBar.tsx` etc. | HTML tables in popup | Chart libraries not needed for tabular demographics |
| `api/stats/parliament/route.ts` | Static JSON from `public/` | No server needed — data is pre-computed and static |
| `lib/code-mapping.ts` | `lib/map/join-stats.ts` | Uses `voter_prefix` directly, no complex mapping needed |
| `data-processing/` | `scripts/` | Shorter path, matches project root convention |
| `tiles/build.sh` | Not created yet | Phase 5 — will use PMTiles + R2, not mbtiles |
| Vercel hosting | Cloudflare Workers | Free tier, no credit card, 300+ edge nodes, D1/R2 for future phases |

---

## 8. Data Processing Scripts

### 8.1 Parliament Aggregation

```bash
# scripts/analyze_xlsx.py
# Reads 4 xlsx files, aggregates by Parliament code
# Output: public/stats/parliament.json (22 records)
python scripts/analyze_xlsx.py
```

### 8.2 DUN Aggregation

```bash
# scripts/build_dun_stats.py
# Reads 4 xlsx files, aggregates by DUN code
# Output: public/stats/dun.json (56 records)
python scripts/build_dun_stats.py
```

### 8.3 Boundary Filtering

```bash
# scripts/filter_dun.py
# Filters MECo peninsular GeoJSON to Selangor's 56 DUNs (N.01-N.56)
# Output: public/boundaries/selangor_dun.geojson
python scripts/filter_dun.py
```

### 8.4 D1 SQL Generation (Phase 3 prep)

```bash
# scripts/build_d1_load.py
# Reads parliament.json and dun.json, generates INSERT OR REPLACE SQL
# Output: dashboard/migrations/0002_load_parliaments.sql (22 rows)
#          dashboard/migrations/0003_load_duns.sql (56 rows)
python scripts/build_d1_load.py
```

### 8.5 DM Aggregation

```bash
# scripts/build_dm_stats.py (Phase 3)
# Reads 4 xlsx files via pandas (one at a time for memory efficiency),
# aggregates by DM_CODE with gender x race sub-counts for filtering
# Output: public/stats/dm.json (945 records keyed by dm_code)
python scripts/build_dm_stats.py
```

### 8.6 DM Centroid Generation

```bash
# scripts/generate_dm_centroids.py (Phase 3)
# Strategy C: Python Shapely grid-in-polygon within DUN boundaries
# Grid spacing: 0.004 deg (~350m), auto-tightens to 0.002 for dense DUNs
# Stats embedded directly in GeoJSON properties (no client-side join)
# Output: public/boundaries/dm_centroids.geojson (945 Point features, 849 KB)
python scripts/generate_dm_centroids.py
```

---

## 9. Performance Strategy

### 9.1 Current (Phase 1-3)

| Asset | Size | Load Strategy |
|-------|------|--------------|
| Parliament GeoJSON | 183 KB | `fetch()` at bootstrap, add as source |
| DUN GeoJSON | 215 KB | `fetch()` at bootstrap, add as source |
| Outline GeoJSON | 178 KB | `fetch()` at bootstrap, graceful `catch(() => null)` |
| DM Centroids GeoJSON | 849 KB | `fetch()` at bootstrap (stats embedded in properties) |
| Parliament stats | 8.2 KB | `fetch()` at bootstrap |
| DUN stats | 24 KB | `fetch()` at bootstrap |
| MapLibre worker | 19 KB | Loaded by MapLibre via `setWorkerUrl()` |
| MapLibre shared | 471 KB | Imported by worker via ESM `import` |
| **Total page load** | **~1.9 MB** | All static, cached by CDN |

22 + 56 = 78 polygons + 945 circle features — still small for MapLibre. GeoJSON source is fine; no vector tiles needed.

### 9.2 Phase 3: DM Centroids

945 circle features with embedded stats (849 KB). GeoJSON source is fine — no vector tiles needed. Proportional circle-radius via `interpolate` expression. Gender/race filtering via MapLibre `setFilter()` on sub-count fields.

### 9.3 Phase 5: 3.97M Voter Points

Requires a tile pipeline — raw GeoJSON is ~2GB and cannot load client-side.

```
3.97M voter records (CSV with lat/lng)
    ↓ tippecanoe --drop-densest-as-needed
PMTiles
    ↓ upload to Cloudflare R2
MapLibre loads only visible tiles via PMTiles protocol
```

Key tippecanoe settings:
```bash
tippecanoe -o voters.pmtiles \
  voters.csv \
  -z 14 -Z 12 \
  --drop-densest-as-needed \
  --maximum-tile-bytes=512000 \
  --attribute-filter="[\"zoom\", >= 14]" \
  -l voters
```

---

## 10. Cloudflare Deployment

### 10.1 Current Setup

| Setting | Value |
|---------|-------|
| **URL** | https://slgrvtrs.ritz-analytics.workers.dev |
| **Mode** | OpenNext Workers (not static export) |
| **CDN** | Cloudflare (300+ edge nodes) |
| **Cost** | $0 (free tier, no credit card) |
| **Assets** | 46 files, 827 KB gzip |
| **Worker startup** | 20 ms |
| **Bindings** | `env.ASSETS` only (D1/R2 future) |

### 10.2 Build & Deploy

```bash
cd dashboard
npm run build:cf    # OpenNext build → .open-next/worker.js + assets
npm run deploy       # Build + deploy to CF Workers
```

### 10.3 Critical Rules

1. **NO `output: 'standalone'`** in `next.config.ts` — OpenNext handles bundling
2. **YES `images: { unoptimized: true }`** — CF Workers have no Image Optimization API
3. **NO `export const runtime = 'edge'`** in API routes — causes 500 on Workers
4. **Root directory = `dashboard`** in CF dashboard (not `/`)

### 10.4 CF Dashboard Settings

| Setting | Value |
|---------|-------|
| Root directory | `dashboard` |
| Build command | `npm run build:cf` |
| Deploy command | `npm run deploy` |
| Node.js version | 24.x (auto-detected) |

See `CLOUDFLARE_DEPLOYMENT.md` for full details.

---

## 11. Implementation Phases

### Phase 1: Foundation — COMPLETE ✅
- [x] Set up Next.js 16 project with MapLibre GL JS 6.3
- [x] Configure ESM worker — copy worker + shared module to `public/`, `setWorkerUrl()`
- [x] Download and filter MECo Parliament boundaries → `selangor_parliament.geojson` (22 features)
- [x] Run Python aggregation scripts → `stats/parliament.json` (22 records)
- [x] Validate data-join key format — `voter_prefix` ("092"-"113") matches stats keys
- [x] Implement MapDashboard with Parliament choropleth (Layer 1)
- [x] Add click popup with stats (12 fields), hover highlight via `feature-state` (no `promoteId`)
- [x] Add sidebar with metric selector (7 metrics: total, malay, chinese, indian, age, contact, female)
- [x] Add dynamic color legend (`Legend.tsx`, reusable, updates with metric)
- [x] Add sidebar toggle, loading state
- [x] Add navigation controls and attribution
- [x] Add Selangor outline background layer
- [x] Deploy to Cloudflare Workers

### Phase 2: DUN Drill-Down — COMPLETE ✅
- [x] Download and filter MECo DUN boundaries → `selangor_dun.geojson` (56 features)
- [x] Run Python DUN aggregation → `stats/dun.json` (56 records keyed by `voter_prefix`)
- [x] Add DUN boundary layer (Layer 2) with `minzoom: 8.5`
- [x] Add `maxzoom: 9` to Parliament fill and label layers
- [x] Implement Parliament → DUN drill-down on click (filter by `parent_parl`, flyTo zoom 10.5)
- [x] DUN popup with full demographics (16 fields)
- [x] Extract legend into reusable `Legend.tsx` component
- [x] Add layer toggle controls (Parliament, DUN, DM checkboxes)
- [x] Add DUN label layer (`code_dun`, `minzoom: 9`)
- [x] Deploy to Cloudflare Workers

### Phase 3: DM Visualization — COMPLETE ✅
- [x] Run Python DM aggregation → `stats/dm.json` (945 records keyed by `dm_code`)
- [x] Generate DM centroids (Strategy C: Python Shapely grid-in-polygon → `dm_centroids.geojson`)
- [x] Implement DM bubble layer (Layer 3) with proportional sizing (interpolate 3px–20px)
- [x] DM hover tooltip with name + voter count
- [x] DM click popup with 14-field demographics
- [x] Race/gender filter controls in sidebar (3 gender + 4 race buttons)
- [ ] Optionally: Provision D1 database and create DM API route (deferred)

### Phase 4: Polish & Deploy — Next
- [ ] Responsive design (mobile sidebar collapse, touch interactions)
- [ ] Refactor `page.tsx` to Server Component (move `'use client'` to MapDashboard only)
- [ ] Update `tsconfig.json` target to ES2022 (MapLibre v6 recommendation)
- [ ] Add React ErrorBoundary component (try/catch exists but no class-based boundary)
- [ ] Loading states, error boundaries, empty states for all layers
- [ ] Provenance panel (reads GeoJSON metadata block)
- [ ] Performance audit (Lighthouse)

### Phase 5: Individual Points (Future)
- [ ] Geocode voter addresses (batch Nominatim/Google Maps) or use DM centroids
- [ ] Build tippecanoe pipeline → `voters.pmtiles`
- [ ] Upload PMTiles to Cloudflare R2
- [ ] Implement PMTiles protocol + voter point layer (Layer 4)
- [ ] Deep zoom individual voter exploration with popups

---

## 12. Boundary Data Sources — Decision Matrix

| Source | Type | Year | Electoral? | License | Status |
|--------|------|-----:|:----------:|:-------:|:------:|
| **MECo** (Thevesh) | Parliament + DUN | 2018+ | ✅ | CC0 | **Used for Layers 1-2** |
| TindakMalaysia | Parliament + DUN + DM | 2015 | ✅ | Community | Outdated |
| DOSM | Parliament + DUN + District | 2022 | ✅ | Govt | Not used |
| geoBoundaries ADM1 | State | 2021 | ❌ | CC-BY 4.0 | Used for outline reference |
| geoBoundaries ADM3 | Mukim | 2021 | ❌ | CC-BY 4.0 | Not suitable for DM |

**Final decision**: **MECo** for Parliament (Layer 1) and DUN (Layer 2) boundaries. Selangor outline generated via dissolved DUN boundaries. DM boundaries unavailable — using centroid approximation (Phase 3).

---

## 13. References

- [MapLibre GL JS Documentation](https://maplibre.org/maplibre-gl-js/docs/)
- [MapLibre Tips for Large GeoJSON Datasets](https://maplibre.org/maplibre-gl-js/docs/guides/large-data)
- [MECo: Malaysian Election Corpus](https://github.com/Thevesh/paper-meco-maps) — [Zenodo DOI](https://doi.org/10.5281/zenodo.18093017)
- [geoBoundaries Global Database](https://www.geoboundaries.org)
- [Sinar Project GE15 Open Data](https://sinarproject.org/open-government/open-data/ge15-open-data)
- [tippecanoe](https://github.com/felt/tippecanoe) — Vector tile generation
- [Thevesh (2025), "The Malaysian Election Corpus (MECo): Electoral Maps and Cartograms from 1954 to 2025", arXiv:2512.24211](https://arxiv.org/abs/2512.24211v1)
- [@opennextjs/cloudflare](https://github.com/opennextjs/opennextjs-cloudflare) — Next.js on CF Workers
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [CLOUDFLARE_DEPLOYMENT.md](./CLOUDFLARE_DEPLOYMENT.md) — Full deployment guide
- [CLOUDFLARE_D1_DATABASE.md](./CLOUDFLARE_D1_DATABASE.md) — D1 schema and migration details
- [CLOUDFLARE_PHASE_COMPATIBILITY.md](./CLOUDFLARE_PHASE_COMPATIBILITY.md) — Phase × CF compatibility
- [docs/CLOUDFLARE_IMPLEMENTATION_CHECKLIST.md](./docs/CLOUDFLARE_IMPLEMENTATION_CHECKLIST.md) — Task tracking