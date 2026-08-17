# SLGRVTRS MapLibre Dashboard — Project Blueprint

**Project**: Selangor Voter Registry Interactive Map Dashboard  
**Tech Stack**: MapLibre GL JS 6.3 + Next.js 16.3 + TypeScript + Tailwind CSS 4  
**Data**: 3,971,650 registered voters across 56 DUNs, 22 Parliaments, 945 DMs  
**Deployed**: https://slgrvtrs.ritz-analytics.workers.dev (Cloudflare Workers, free tier)  
**Last updated**: 2026-08-16  
**License**: Project-specific; boundary data from ElectionData.MY (Parliament), DOSM KawasanKu (DUN), voter data (private)  

---

## 1. Project Overview

An interactive web map dashboard that visualizes Selangor's voter registry data segmented by electoral boundaries. Users can explore demographic compositions (gender, race, age) at the Parliament, DUN, and DM levels through choropleth maps, popups, and drill-down interactions.

### Core Capabilities

- **Layer 1**: Parliament constituency boundaries (22 polygons) — click to see aggregated stats, choropleth by 10 metrics  ✅
- **Layer 2**: DUN (State Assembly) boundaries (56 polygons) — drill-down from Parliament, click for detailed demographics, choropleth by 9 of 10 metrics  ✅
- **Layer 3**: DM (Voting District) centroids/bubbles (945 points) — proportional to voter count, race/gender filters  ✅
- **Layer 4** (future): Individual geocoded voter points with clustering (3.97M points)

### Current Status

| Phase | Description | Status | Deployed |
|-------|-------------|--------|----------|
| Phase 1 | Parliament choropleth, 10 metrics, legend, popup, hover | **COMPLETE** | ✅ Yes |
| Phase 2 | DUN drill-down, zoom visibility, toggles, DUN popup | **COMPLETE** | ✅ Yes |
| Phase 3 | DM bubble visualization, centroid generation, filters, DUN choropleth (9 metrics) | **COMPLETE** | ✅ Yes |
| Phase 3b | D1 database provisioning, DM API routes, frontend D1 integration | **COMPLETE** | ✅ Yes |
| Phase 4 | Responsive, ErrorBoundary, provenance, Server Component refactor | **COMPLETE** | ✅ Yes |
| Phase 5A | DM centroid geocoding (Google Maps → Nominatim → D1 cache), boundary validation | **COMPLETE** | ✅ Yes |
| Phase 5B | R2 bucket provisioned, `/api/r2/[...path]` route, PMTiles pipeline (future) | **FUTURE** | ✅ R2 active |
| Phase 6 | AI Insights via CF AI Workers (Llama 3.3 70B, `env.AI` binding) | **DEPLOYED** | ✅ AI binding active |
| Phase 7 | Password-protected CSV export (PBKDF2 + D1 `app_settings`) | **DEPLOYED** | ✅ Password API works |
| Phase 8 | UI features: dark mode, satellite basemap, heatmap, analytics, ranking, bookmarks, share, tour, data table, toasts, fullscreen | **DEPLOYED** | ✅ All features live |
| Phase 9 | UX refinements: data table fly-to, layer/metric/share/bookmark toasts, comparison CSV export | **DEPLOYED** | ✅ All features live |
| Phase 10 | Export & heatmap fixes: password-protected exports, individual voter download, DUN By DUN filter, heatmap metric fix, legend heatmap colors | **DEPLOYED** | ✅ All features live |

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
│  D1 binding active: DB (Phase 3b)                  │
│  R2 binding active: TILES (slgrvtrs-tiles)         │
│  Geocode cache: 945 DM lookups (Phase 5A)          │
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
| Color | Choropleth by selected metric (9 of 10 — `contact_pct` excluded because DUN value is constant 76.84%) |
| Interaction | Click → popup (16 fields), hover → highlight via feature-state |
| Zoom range | [8.5, ∞] (`minzoom: 8.5` on fill/border, `minzoom: 9` on label) |
| Popup | DUN name, code, parent Parliament, total voters, M/F %, race %, age, contact %, DM count, locality count |
| Drill-down | Click Parliament → filter DUNs by `parent_parl`, flyTo zoom 10.5 |
| Back button | "← Back to Selangor overview" resets filter + zoom |
| DUN color scales | Defined in `DUN_COLOR_SCALES` in `color-scales.ts` — tuned stop values for DUN data ranges (e.g., total_voters: 20K–134K vs Parliament 50K–340K) |

### Layer 3: DM Centroids/Bubbles (945 points) ✅

| Property | Value |
|----------|-------|
| Type | `circle` |
| Source | `/api/dm?format=geojson` (D1) → fallback `public/boundaries/dm_centroids.geojson` |
| Features | 945 points (geocoded, all validated inside DUN boundaries) |
| Features | 945 points (all within DUN boundaries) |
| Size | `interpolate` on active filter count, 3px (2K) → 20px (27K) — `DM_MAX_VOTERS = 27,000` |
| Color | Red sequential (`#fbb4ae` → `#b40426`) by `total_voters` |
| Interaction | Hover → tooltip (name + count + filtered count/label), click → detailed popup (14 fields + active filter banner when filter is on) |
| Zoom range | [11, 18] (`minzoom: 11`) |
| Hover highlight | `setFeatureState({ hover: true })` on ring layer |
| Filters | Gender (All/Male/Female) + Race (All/Malay/Chinese/Indian) via sidebar buttons — updates `circle-radius` paint property (NOT `setFilter`) so all 945 bubbles stay visible but resize to reflect the selected sub-count |

**DM Centroid Generation** (Phase 5A — Geocoded coordinates):

```
# Phase 3 (original): Shapely grid-in-polygon → scripts/generate_dm_centroids.py
# Phase 5A (current): Google Maps Geocoding API → Nominatim fallback → D1 cache
#   scripts/geocode_dm_batch.py — batch geocoder (945/945 resolved, $0 cost)
#   111 exact matches, 834 locality-level matches
#   Boundary validation: 142 DMs outside DUN polygon → snapped to boundary
#   Final: 945/945 DMs verified inside parent DUN boundaries
```

### Layer 4: Individual Voter Points (future) — Phase 5B

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
│ (10 opts)│  │  metric; auto-switches  │              │
│          │  │  Parl/DUN labels ≥z9.5) │              │
│          │  └─────────────────────────┘              │
│ Layer    │                                           │
│ toggles  │        Popup on click                    │
│ ☑ Parl   │        Hover highlight                   │
│ ☑ DUN    │                                           │
│ ☑ DM     │                                           │
│ (945)    │                                           │
│          │                                           │
│ [Back]   │                                           │
│ (drill)  │                                           │
├──────────┴───────────────────────────────────────────┤
```

### 5.2 Color Schemes (Implemented)

10 choropleth metrics defined in `src/lib/map/color-scales.ts` with separate Parliament (`PARL_COLOR_SCALES`) and DUN (`DUN_COLOR_SCALES`) stop values. All use 5-stop `interpolate` expressions for smooth gradients.

| # | Metric | Property | Palette | Type | Parliament Stops | DUN Stops | DUN Applicable? |
|---|--------|----------|---------|------|-----------------|-----------|:--------------:|
| 1 | Total Voters | `total_voters` | YlGnBu | Sequential | 50K → 120K → 180K → 240K → 340K | 20K → 45K → 70K → 100K → 134K | ✅ |
| 2 | Male % | `male_pct` | BuPu | Diverging | 47% → 48% → 49% → 50% → 52% | 47% → 48% → 49% → 50% → 52% | ✅ |
| 3 | Female % | `female_pct` | PiYG | Diverging | 48% → 49% → 50% → 51% → 53% | 48% → 49% → 50% → 51% → 53% | ✅ |
| 4 | Malay % | `malay_pct` | YlOrRd | Sequential | 15% → 35% → 55% → 70% → 90% | 15% → 35% → 55% → 70% → 90% | ✅ |
| 5 | Chinese % | `chinese_pct` | Oranges | Sequential | 5% → 15% → 25% → 40% → 70% | 5% → 15% → 25% → 40% → 70% | ✅ |
| 6 | Indian % | `indian_pct` | Greens | Sequential | 0% → 5% → 10% → 20% → 40% | 0% → 5% → 10% → 20% → 40% | ✅ |
| 7 | Others % | `other_pct` | Purples | Sequential | 0% → 3% → 6% → 10% → 24% | 0% → 3% → 6% → 10% → 24% | ✅ |
| 8 | Mean Age | `age_mean` | Viridis | Sequential | 40 → 42 → 44 → 45 → 48 | 39 → 42 → 45 → 50 → 55 | ✅ |
| 9 | Median Age | `age_median` | Magma | Sequential | 37 → 39 → 41 → 43 → 46 | 36 → 40 → 44 → 49 → 55 | ✅ |
| 10 | Contact % | `contact_pct` | PuBu | Sequential | 72% → 75% → 78% → 80% → 83% | — | ❌ |

**Key design decisions:**
- `contact_pct` is excluded from DUN because all 56 DUNs previously shared the same value (76.84% — a data pipeline bug). After recomputing per-DUN contact_pct from raw xlsx files, each DUN now has a unique value (69.97%–82.49%). The metric remains excluded from DUN choropleth because the visual differentiation is marginal (range of ~12.5pp vs other metrics with 30-75pp range). When selected at DUN zoom, the legend shows a "DUN: excluded" warning.
- Race %, Male %, and Female % share the same stop values for Parliament and DUN because the percentage ranges are similar across both levels.
- `total_voters`, `age_mean`, and `age_median` have separate DUN-tuned stops because DUNs have narrower ranges than Parliaments (e.g., DUN total voters: 20K–134K vs Parliament: 50K–340K).
- Gender metrics use **diverging** palettes (BuPu for Male, PiYG for Female) because values cluster tightly around 50%, and diverging schemes highlight deviations from the midpoint.

### 5.3 Interactions (Implemented)

| Interaction | Trigger | Behavior |
|-------------|--------|----------|
| DM hover | `mousemove` on `dm-bubble` | Tooltip (name + count), `setFeatureState` hover ring, cursor pointer |
| DM click | `click` on `dm-bubble` | Popup with 14-field demographics |
| Gender filter | 3 buttons (All/Male/Female) | Resize DM bubbles via `circle-radius` paint property to reflect selected gender sub-count; popup/tooltip show filtered count & % |
| Race filter | 4 buttons (All/Malay/Chinese/Indian) | Resize DM bubbles via `circle-radius` paint property to reflect selected race sub-count; popup/tooltip show filtered count & % |
| Parliament hover | `mousemove` on `parliament-fill` | `setFeatureState` hover=true, cursor pointer |
| Parliament click | `click` on `parliament-fill` | Popup with 12-field stats + filter DUNs by `parent_parl` + flyTo zoom 10.5 |
| DUN hover | `mousemove` on `dun-fill` | `setFeatureState` hover=true, cursor pointer |
| DUN click | `click` on `dun-fill` | Popup with 16-field demographics |
| Back button | Click "← Back to Selangor overview" | Clear DUN filter, flyTo state center at default zoom |
| Metric change | `<select>` dropdown | Re-color Parliament + DUN choropleth + update Legend (auto-switches labels at zoom ≥ 9.5) |
| Search | Type in search box | Fuzzy search Parliament/DUN by code or name, click result → flyTo + drill-down |
| Compare | Click "+ Compare" in popup | Add seat to comparison panel (max 3), side-by-side stats |
| Export CSV | Click download icon | Export all Parliament + DUN stats as CSV file |
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
| Database | Cloudflare D1 | Active | Edge SQLite — 22 parliaments, 56 DUNs, 945 DMs + geocode_cache |
| Storage | Cloudflare R2 | Active (`slgrvtrs-tiles`) | Static asset serving via `/api/r2/[...path]` |
| Hosting | Cloudflare Workers | Free tier | 300+ edge nodes, unlimited bandwidth |

---

## 7. File Structure (Actual)

```
slgrvtrs/
├── dashboard/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx              # Root layout
│   │   │   ├── page.tsx                # Server Component — renders ErrorBoundary + MapDashboardClient
│   │   │   └── globals.css             # Tailwind + MapLibre popup CSS overrides (responsive)
│   │   ├── components/
│   │   │   ├── ErrorBoundary.tsx       # Class-based error boundary with retry (74 lines)
│   │   │   └── map/
│   │   │   ├── MapDashboard.tsx        # Main map (1080 lines) — all layers, popups, sidebar, DM filters, responsive
│   │   │   ├── MapDashboardClient.tsx  # Client wrapper: dynamic import + ssr:false (17 lines)
│   │   │   └── Legend.tsx               # Reusable color legend with dunApplicable warning (34 lines)
│   │   └── lib/map/
│   │       ├── setup.ts                # MapLibre init, workerUrl config (19 lines)
│   │       ├── color-scales.ts         # 10 PARL_COLOR_SCALES + 9 DUN_COLOR_SCALES + interpolation (326 lines)
│   │       └── join-stats.ts            # Client-side GeoJSON ← JSON merge (64 lines)
│   ├── app/api/
│   │   ├── dm/
│   │   │   ├── route.ts                     # GET /api/dm — list/search DMs (GeoJSON or JSON, with filters)
│   │   │   ├── [code]/route.ts              # GET /api/dm/[code] — single DM lookup
│   │   │   └── search/route.ts              # GET /api/dm/search?q= — name autocomplete (limit 20)
│   │   └── geocode/
│   │       ├── route.ts                     # POST /api/geocode — single DM geocode (cache → Google → Nominatim)
│   │       └── status/route.ts             # GET /api/geocode/status — batch geocoding stats
│   ├── public/
│   │   ├── boundaries/
│   │   │   ├── selangor_parliament.geojson  # 22 features, 183 KB
│   │   │   ├── selangor_dun.geojson         # 56 features, 215 KB
│   │   │   ├── selangor_outline.geojson     # 1 MultiPolygon, 178 KB
│   │   │   └── dm_centroids.geojson        # 945 points, 849 KB
│   │   ├── stats/
│   │   │   ├── parliament.json              # 22 records, 8.2 KB
│   │   │   ├── dun.json                     # 56 records, 24 KB
│   │   │   └── dm.json                      # 945 records, 429 KB
│   │   ├── maplibre-gl-worker.mjs          # MapLibre ESM worker, 19 KB
│   │   └── maplibre-gl-shared.mjs          # MapLibre shared module, 471 KB
│   ├── migrations/
│   │   ├── 0001_analytics_warehouse.sql   # D1 schema (parliaments, duns, dms + indexes)
│   │   ├── 0001b_add_dm_crosstab.sql       # ALTER TABLE: dun_prefix + 8 cross-tab cols + 2 indexes
│   │   ├── 0002_load_parliaments.sql      # 22 INSERT OR REPLACE
│   │   ├── 0003_load_duns.sql             # 56 INSERT OR REPLACE
│   │   ├── 0004_load_dms.sql              # 945 INSERT OR REPLACE (generated by build_d1_load.py)
│   │   └── 0005_geocode_cache.sql         # geocode_cache table + indexes (Phase 5A)
│   ├── cloudflare-env.d.ts                  # TypeScript D1 binding declarations (getCloudflareContext)
│   ├── wrangler.jsonc                       # CF Worker config (D1 + R2 bindings active)
│   ├── open-next.config.ts                 # OpenNext adapter config
│   ├── .cloudflareignore                   # Deployment exclusions
│   ├── next.config.ts                      # CF-compatible (no standalone, unoptimized images)
│   ├── package.json                        # CF deploy scripts
│   └── tsconfig.json                       # Target: ES2017
├── scripts/
│   ├── analyze_xlsx.py                    # Parliament aggregation from xlsx
│   ├── build_dun_stats.py                 # DUN aggregation from xlsx
│   ├── build_dm_stats.py                  # DM aggregation from xlsx (Phase 3)
│   ├── generate_dm_centroids.py           # Shapely grid-in-polygon DM centroids (Phase 3, superseded by geocode)
│   ├── geocode_dm_batch.py                # Batch geocoder: Google → Nominatim → D1 cache (Phase 5A)
│   ├── pip_analysis.py                    # Point-in-polygon analysis: DM vs DUN boundary validation
│   ├── fix_dm_boundaries.py               # Snap out-of-bounds DMs to nearest point inside DUN polygon
│   ├── fix_remaining.py                   # Fix concave polygon edge cases (interior point search)
│   ├── verify_fix.py                      # Post-fix verification: 945/945 inside DUN boundaries
│   ├── build_d1_load.py                   # Generate D1 SQL from JSON stats
│   ├── filter_dun.py                      # Filter MECo GeoJSON to Selangor DUNs
│   └── generate_outline.py                # Generate Selangor outline GeoJSON
├── docs/
│   ├── CLOUDFLARE_IMPLEMENTATION_CHECKLIST.md  # CF deployment task tracking
│   ├── PHASE3_D1_DATABASE_IMPLEMENTATION.md  # D1 implementation (COMPLETE)
│   └── PHASE5_DM_CENTROID_GEOCODING.md      # DM geocoding plan + results (COMPLETE)
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
| `components/charts/GenderBar.tsx` etc. | SVG donut chart + inline race bar in popup | Lightweight HTML/CSS, no chart library needed |
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

### 8.4 D1 SQL Generation

```bash
# scripts/build_d1_load.py
# Reads parliament.json, dun.json, dm.json + dm_centroids.geojson
# Generates INSERT OR REPLACE SQL for all 3 tables
# Output: dashboard/migrations/0002_load_parliaments.sql (22 rows)
#          dashboard/migrations/0003_load_duns.sql (56 rows)
#          dashboard/migrations/0004_load_dms.sql (945 rows)
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

945 circle features with embedded stats (849 KB). GeoJSON source is fine — no vector tiles needed. Proportional circle-radius via `interpolate` expression (3px at 2K → 20px at 27K voters, `DM_MAX_VOTERS = 27,000`). Gender/race filtering updates the `circle-radius` paint property (not `setFilter`) so all 945 bubbles remain visible and resize proportionally.

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
| **Bindings** | `env.ASSETS` + `env.DB` (D1, since Phase 3b) |

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
- [x] Add sidebar with metric selector (10 metrics: total voters, male %, female %, malay %, chinese %, indian %, others %, mean age, median age, contact %)
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
- [x] Provision D1 database and create DM API route (Phase 3b)

### Phase 4: Polish & Deploy — COMPLETE ✅
- [x] Refactor `page.tsx` to Server Component (via `MapDashboardClient.tsx` wrapper — `'use client'` + `dynamic` + `ssr: false` must stay in client boundary in Next.js 16)
- [x] Add React ErrorBoundary component (class-based `ErrorBoundary.tsx` with retry button)
- [x] Update `tsconfig.json` target to ES2022 (MapLibre v6 recommendation)
- [x] Responsive design: mobile sidebar as fixed overlay with backdrop, auto-collapse on ≤768px, `stopPropagation` to prevent map click closing sidebar, larger touch targets, `touch-action-none` on map container
- [x] Improved error state: reload button, error icon, responsive `mx-4` padding
- [x] Provenance panel: embedded `PROVENANCE` constant with boundary/voter/tech metadata; toggle button at bottom-left; collapsible panel with close button; hidden "Sources" label on mobile
- [x] Popup CSS overrides: `max-width: 300px`, `border-radius: 8px`, mobile `max-width: calc(100vw - 40px)`
- [ ] Lighthouse audit (deferred — requires production deploy first)

### Phase 5A: DM Centroid Geocoding — COMPLETE ✅ (see [`docs/PHASE5_DM_CENTROID_GEOCODING.md`](docs/PHASE5_DM_CENTROID_GEOCODING.md))
- [x] Create `geocode_cache` D1 table (migration `0005_geocode_cache.sql`)
- [x] Set `GOOGLE_GEOCODING_API_KEY` as Wrangler secret
- [x] Build `scripts/geocode_dm_batch.py` (Google primary 40 QPS → Nominatim fallback 1 QPS → D1 cache)
- [x] Implement `POST /api/geocode` (single DM geocode with cache-first → Google → Nominatim flow)
- [x] Implement `GET /api/geocode/status` (batch progress monitoring)
- [x] Run batch geocoding for all 945 DMs → 945/945 resolved (111 exact + 834 locality), $0 cost
- [x] Regenerate static `dm_centroids.geojson` fallback with geocoded coordinates
- [x] Validate: 100% resolution rate, all coordinates within Selangor bounds
- [x] Point-in-polygon boundary validation: 142/945 DMs outside DUN → snapped to boundary (88 boundary snap + 34 DUN centroid + 20 offset variants)
- [x] Final verification: 945/945 DMs inside parent DUN boundaries

### Phase 5B: Individual Voter Points (Future)
- [ ] Build tippecanoe pipeline → `voters.pmtiles`
- [ ] Upload PMTiles to Cloudflare R2
- [ ] Implement PMTiles protocol + voter point layer (Layer 4)
- [ ] Deep zoom individual voter exploration with popups

### Phase 6: AI Insights — COMPLETE ✅
- [x] `/api/insights` route using Cloudflare AI Workers (`env.AI` binding)
- [x] Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Llama 3.3 70B, FP8)
- [x] 4 insight types: state, parliament, DUN, DM
- [x] AiInsightsPanel component with generate button + numbered bullets
- [x] Migrated from z-ai-web-dev-sdk to native CF AI binding (no config files needed)
- [x] Free tier: 10,000 neurons/day (~1,400 insights/day)

### Phase 7: Password-Protected CSV Export — COMPLETE ✅
- [x] PBKDF2 password hashing via WebCrypto (10K iterations)
- [x] D1 `app_settings` table for password hash storage
- [x] `POST /api/export/csv` with password verification
- [x] `GET/PUT /api/settings/password` for password management
- [x] ExportPanel + PasswordDialog + SettingsGear UI components

### Phase 8: UI Feature Suite — COMPLETE ✅
- [x] **AnalyticsDrawer** — recharts donuts, bar charts, KPI cards
- [x] **RankingTable** — sortable Parliament/DUN table with fly-to
- [x] **BookmarksMenu** — localStorage-backed seat bookmarks with toasts
- [x] **ComparisonRadar** — 6-axis radar with state-average overlay
- [x] **ComparisonBarChart** — grouped race composition bars
- [x] **ShareButton** — URL hash encoding + clipboard copy with toast
- [x] **ThemeToggle** — Light/Dark UI + Light/Dark/Satellite basemap (controlled component)
- [x] **KeyboardShortcuts** — overlay with 12 shortcuts (/, 1-3, A, I, R, B, D, F, T, S, Esc, ?)
- [x] **OnboardingTour** — 4-step first-visit guided tour
- [x] **DataTableView** — full-screen sortable table with CSV export
- [x] **Toast** — ToastProvider + useToast hook (success/error/info/warning)
- [x] **Dark mode** — full sidebar, popups, drawers, map layers
- [x] **ESRI satellite basemap** — World Imagery raster tiles
- [x] **Heatmap visualization mode** — red-orange gradient for parliament + DUN
- [x] **Fullscreen toggle** — hide sidebar for maximum map area
- [x] **Constituency detail card** — mini-stats (voters, Malay %, age) + quick actions
- [x] **Shimmer loading skeleton** — enhanced loading state with animation

### Phase 9: UX Refinements — COMPLETE ✅
- [x] **Data table row click → fly-to** — click any row in Data Table Explorer to fly to constituency + auto-popup
- [x] **Layer toggle toast** — "Parliament/DUN/DM layer on/off" notifications
- [x] **Metric switch toast** — "Metric: X" on dropdown change
- [x] **Share toast** — "Shareable link copied to clipboard" on copy
- [x] **Bookmark toasts** — "Bookmarked X" / "Removed bookmark X" / "X already bookmarked"
- [x] **Comparison toasts** — "Added X to comparison" / "Comparison full" / "Already in comparison"
- [x] **Comparison CSV export** — client-side blob download of comparison seats
- [x] **Fullscreen toast** — "Fullscreen map" / "Exited fullscreen"

### Phase 10: Export & Heatmap Fixes — COMPLETE ✅
- [x] **All exports password-protected** — Data Table + Comparison now use server-side PBKDF2 verification (was client-side Blob)
- [x] **Individual voter download per DM** — 945 pre-generated CSVs in R2, password-protected via `/api/export/dm-voters/[dm_code]`
- [x] **Download All 945 DMs (Sorted)** — password-protected via `/api/export/dm-xlsx`
- [x] **Comparison CSV export** — password-protected via `/api/export/comparison`
- [x] **DUN level "By DUN" filter** — added missing filter option + seatList fix
- [x] **Heatmap uses active metric** — no longer hardcoded to total_voters; reads color scale stops for correct property + range
- [x] **Legend heatmap colors** — shows red-orange gradient + "HEATMAP" badge when heatmap mode active

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

---

## 14. Choropleth Metric Audit (2026-08)

### Scope

Audit of the choropleth coloring logic for both Parliament (Layer 1) and DUN (Layer 2) layers, verifying that the 10 metrics defined in `color-scales.ts` produce correct visual gradients, that stop values match actual data ranges, and that the DUN layer properly participates in metric switching.

### Findings

**1. Parliament (Layer 1) — 10 metrics, all functional ✅**

All 10 `PARL_COLOR_SCALES` map correctly to the `parliament-fill` layer via `buildColorExpression()`. The `updateMetric()` function in `MapDashboard.tsx` calls `setPaintProperty('parliament-fill', 'fill-color', ...)` on every metric change. Stop values are calibrated to Parliament data ranges (verified in comments within `color-scales.ts`):

- `total_voters`: 50K–340K (YlGnBu) — covers the full Parliament range
- `male_pct`: 47%–52% (BuPu diverging) — tight range around 50%
- `female_pct`: 48%–53% (PiYG diverging) — complementary to male
- `malay_pct`: 15%–90% (YlOrRd) — wide range, good gradient spread
- `chinese_pct`: 5%–70% (Oranges) — good coverage of the 11%–62% actual range
- `indian_pct`: 0%–40% (Greens) — covers the 2%–24% actual range with headroom
- `other_pct`: 0%–24% (Purples) — covers the 0%–15% actual range with headroom
- `age_mean`: 40–48 (Viridis) — covers the ~40–47 actual range
- `age_median`: 37–46 (Magma) — covers the ~37–46 actual range
- `contact_pct`: 72%–83% (PuBu) — covers the ~72–82% actual range

**2. DUN (Layer 2) — 9 of 10 metrics, choropleth (not static) ✅**

The DUN layer was originally documented as "static teal fill" but was upgraded to full dynamic choropleth. The `updateMetric()` function now also calls `setPaintProperty('dun-fill', 'fill-color', ...)` using `DUN_COLOR_SCALES` (via `getDunScaleById()`). Key details:

- `contact_pct` is the **only excluded metric** (`dunApplicable: false`) because all 56 DUNs have the same value (76.84%). When selected at DUN zoom, the legend shows a "DUN: constant value" amber warning.
- DUN-tuned stop values exist for 3 metrics where data ranges differ significantly from Parliament:
  - `total_voters`: 20K–134K (vs Parliament 50K–340K) — DUNs are smaller
  - `age_mean`: 39–55 (vs Parliament 40–48) — DUNs have wider age spread
  - `age_median`: 36–55 (vs Parliament 37–46) — same reason
- The remaining 7 metrics share stop values with Parliament because the percentage ranges are similar.

**3. Legend auto-switching ✅**

The `Legend` component receives a `ColorScale` prop that switches between Parliament and DUN scales based on zoom level (`isDunZoom = mapZoom >= 9.5`). This ensures legend labels show the correct data range for the visible layer. When `contact_pct` is selected at DUN zoom, the legend shows `dunApplicable === false` warning.

**4. Initial DUN color expression ✅**

On map load (before any metric change), the DUN fill is initialized with `DUN_COLOR_SCALES[0]` (Total Voters, YlGnBu DUN stops) via `buildColorExpression('total_voters', DUN_COLOR_SCALES[0].stops)`. This matches the Parliament default and provides a consistent initial view.

### Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| Parliament choropleth (10 metrics) | ✅ Correct | All metrics produce proper gradients |
| DUN choropleth (9 metrics) | ✅ Correct | `contact_pct` properly excluded |
| DUN initial color | ✅ Correct | Uses DUN_COLOR_SCALES[0] (Total Voters) |
| Metric switching | ✅ Correct | Both Parliament and DUN update via `setPaintProperty` |
| Legend auto-switch | ✅ Correct | Zoom ≥9.5 switches to DUN labels |
| Stop value calibration | ✅ Correct | Parliament and DUN have appropriate ranges |
| Gender diverging palettes | ✅ Correct | BuPu (Male) and PiYG (Female) highlight deviation from 50% |
| `dunApplicable` flag | ✅ Correct | Legend shows warning for `contact_pct` at DUN zoom |

---

## 15. Bug Fix Log

### DM Bubble Layer Filter Fixes (2026-08)

**BUG 1 — `setFilter()` hiding DMs with zero sub-count** (commit cc4a1ce):

DM Race/Gender filters were using `map.setFilter()` to hide bubbles whose selected demographic sub-count was zero (e.g., 35 DMs with 0 Indian voters vanished from the map). Fixed by switching to paint-property-based filtering — all 945 bubbles stay visible and resize proportionally via `circle-radius` interpolation on the selected sub-count field.

**BUG 2 — `DM_MAX_VOTERS` clamping caused indistinguishable radii** (this fix):

`DM_MAX_VOTERS` was set to 9,500 (a sub-count maximum), but `total_voters` ranges up to 26,156. This caused MapLibre's `interpolate` expression to **clamp 59 DMs at maximum radius**. When toggling Male/Female on these DMs, the sub-counts remained near or above 9,500, producing nearly identical radii (e.g., Bandar Puncak Alam: All=20px, Male=19.82px, Female=20px — no visible change). Fixed by raising `DM_MAX_VOTERS` to **27,000** to cover the full data range, giving meaningful visual differentiation across all filter combos.

**Additional improvements:**
- Created `test_dm_radius_engine.py` with 5 tests covering clamping, shrinkage, visible difference, Bandar Puncak Alam specific check, and data integrity
- All 945 DMs × 12 filter combinations (10,395 checks) now pass
- DM click popup shows an **Active Filter** banner when a filter is active, displaying the filtered count and percentage
- DM hover tooltip also shows the filtered count and label