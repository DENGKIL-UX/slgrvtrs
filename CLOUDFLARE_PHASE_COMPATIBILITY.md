# Cloudflare Deployment — Phase Compatibility Analysis

> **Status**: Phase B (Workers) deployed and live. R2 bucket active.
> **Last updated**: 2026-08-16
> **Deployed URL**: https://slgrvtrs.ritz-analytics.workers.dev
> **Conclusion**: All 5 phases are compatible with Cloudflare deployment. Phase 5B R2 bucket provisioned and bound.

---

## Summary Matrix

| Phase | Description | CF Compatible? | CF Deployment Mode | Changes Required | Risk |
|-------|-------------|---------------|-------------------|-----------------|------|
| **Phase 1** | Parliament choropleth map | Yes | Static Pages | None | None |
| **Phase 2** | DUN drill-down + toggles | Yes | Static Pages | None | None |
| **Phase 3** | DM bubble visualization, DUN choropleth (9 metrics), race/gender filters, D1 database, DM API routes | Yes | Static + D1 | D1 provisioned with 945 DMs, 3 API routes, frontend fallback | None |
| **Phase 4** | Polish & deploy — responsive, ErrorBoundary, provenance, Server Component | Yes | Static Pages + Workers | None | None |
| **Phase 5A** | DM centroid geocoding, boundary validation | Yes | Workers + D1 | geocode_cache table, 2 API routes, batch validation scripts | None |
| **Phase 5B** | Individual voter points (PMTiles) | Yes | Workers + R2 | R2 bucket `slgrvtrs-tiles` created and bound, `/api/r2/[...path]` route deployed | None |

---

## Phase 1: Foundation — COMPLETE

### What it does
- MapLibre GL JS v6.3 map with Parliament choropleth (22 seats)
- Stats from `public/stats/parliament.json` (static JSON)
- Boundaries from `public/boundaries/selangor_parliament.geojson` (static GeoJSON)
- Sidebar with metric selector, dynamic legend, hover/click interactions

### Why it works on Cloudflare
- **100% client-side rendering** — `ssr: false` on the MapDashboard component
- **All data in `public/`** — served as static files, no API calls
- **No Node.js runtime** needed — no `fs`, `path`, `crypto` at request time
- **MapLibre WebGL2** runs in the browser, not on the server
- **Worker files** (`maplibre-gl-worker.mjs` + `maplibre-gl-shared.mjs`) are static ESM files

### Cloudflare-specific notes
- Static GeoJSON (182 KB) + stats JSON (~10 KB) = ~192 KB per page load
- Well within Cloudflare's unlimited bandwidth
- No `output: 'export'` needed — the App Router with dynamic import works as-is
- If issues arise, add `output: 'export'` to `next.config.ts` for pure static HTML

### Verdict: Zero risk. Drop-in deployment.

---

## Phase 2: DUN Drill-Down — COMPLETE

### What it does
- DUN boundary layer (56 seats) with zoom-based visibility
- DUN stats from `public/stats/dun.json` (static JSON)
- Parliament → DUN drill-down via `setFilter` + `flyTo`
- Layer toggle checkboxes (Parliament, DUN, DM)
- Reusable `Legend.tsx` component

### Why it works on Cloudflare
- Same pattern as Phase 1 — all data in `public/`, no API routes
- `setFilter` and `flyTo` are MapLibre client-side APIs — no server involvement
- Layer toggles use `setLayoutProperty` — also client-side
- All 56 DUN stats (~30 KB) loaded as a single static JSON file

### Cloudflare-specific notes
- Total static assets now: ~972 KB (parliament GeoJSON + DUN GeoJSON + stats + workers + outline)
- Still well within any reasonable limit
- No additional configuration needed

### Verdict: Zero risk. Drop-in deployment.

---

## Phase 3: DM Visualization — COMPLETE

### What it does
- DM bubble layer (945 DMs) with proportional sizing (interpolate 3px–20px on 0–27K voters)
- DM stats from Python aggregation pipeline (gender×race sub-counts)
- DM centroids from Shapely grid-in-polygon
- Race/gender filter controls in sidebar (paint-property-based, not setFilter)
- DUN layer upgraded from static teal fill to **dynamic choropleth** with 9 of 10 metrics
- Legend auto-switches between Parliament/DUN color scales at zoom >= 9.5
- 10 Parliament metrics + 9 DUN metrics defined in `color-scales.ts` (DUN excludes contact_pct)

### Why it works on Cloudflare
- **Static mode** (no D1): DM centroids + stats can be pre-computed and served as static JSON, exactly like parliament/dun stats. ~945 DMs × ~200 bytes = ~190 KB. No problem.
- **D1 mode** (optional): If dynamic filtering is needed (e.g., "show me all DMs with >60% Chinese voters"), add a D1 API route. This requires upgrading to the OpenNext Workers pattern.

### Cloudflare-specific notes

**Static approach (recommended for Phase 3):**
- Generate `stats/dm.json` (945 records) from Python pipeline
- Generate `boundaries/dm_centroids.geojson` from Shapely
- Load both in `bootstrap()` alongside parliament/dun data
- No D1 needed, no API routes, no Workers
- Deploy as pure static — same as Phase 1-2

**D1 approach (implemented):**
- D1 database `slgrvtrs-voters` provisioned (region APAC)
- Schema: `parliaments` (22), `duns` (56), `dms` (945) with 8 cross-tab columns
- 3 API routes: `GET /api/dm`, `GET /api/dm/[code]`, `GET /api/dm/search`
- Frontend tries API first, falls back to static GeoJSON
- Cache-Control: `s-maxage=3600, stale-while-revalidate=86400`
- Uses `getCloudflareContext()` from `@opennextjs/cloudflare` (not `getRequestContext`)

### Changes needed for static approach
- None to the deployment config
- Generate `dm.json` and `dm_centroids.geojson` (already in the Phase 3 plan)

### Changes needed for D1 approach
- All done: DB provisioned, migrations applied, API routes deployed, frontend integrated
- Key gotcha: use `getCloudflareContext()` not `getRequestContext()`
- Key gotcha: do NOT add `"types": ["@cloudflare/workers-types"]` to tsconfig.json — it breaks GeoJSON namespace
- Key gotcha: D1 remote migration system doesn't handle multi-statement DDL well — use `--command` for manual execution

> **CRITICAL**: Do NOT add `export const runtime = 'edge'` to API routes.
> Workers are already edge. `runtime = 'edge'` causes **500 errors** on CF Workers.

### Verdict: Fully compatible. Static mode needs zero changes. D1 mode needs config additions only.

---

## Phase 4: Polish & Deploy

### What it does
- Responsive design (mobile sidebar collapse, touch interactions)
- Refactor `page.tsx` to Server Component
- Update `tsconfig.json` target to ES2022
- Loading states, error boundaries
- Performance audit (Lighthouse)
- Deploy to Cloudflare Pages

### Why it works on Cloudflare
- **Responsive design**: Pure CSS/JS — no server-side dependencies
- **Server Component refactor**: Cloudflare Pages supports both static and SSR via Workers
- **ES2022 target**: Workers runtime supports ES2022+
- **Loading/error states**: Client-side React — no server dependency
- **Lighthouse audit**: Cloudflare Pages has excellent Core Web Vitals due to 300+ edge nodes

### Cloudflare-specific notes

**Refactoring `page.tsx` to Server Component:**
- Move `'use client'` from `page.tsx` to `MapDashboard.tsx` only
- This is the correct pattern for Next.js on Cloudflare — the page shell is server-rendered, the map is client-rendered
- Works identically on Vercel and Cloudflare

**Performance expectations on Cloudflare:**
- TTFB: ~50-100ms (static assets from edge)
- LCP: ~200-500ms (MapLibre canvas + GeoJSON)
- CLS: ~0 (no layout shifts in map)
- FID: ~0 (no heavy JS on main thread)
- Better than Vercel for Malaysian users due to Kuala Lumpur edge node

### Verdict: Fully compatible. Cloudflare deployment is the target for this phase.

---

## Phase 5: Individual Points (Future)

### What it does
- Geocode voter addresses or use DM centroids
- Build tippecanoe pipeline → `voters.pmtiles`
- Upload PMTiles to Cloudflare R2
- Implement PMTiles protocol + voter point layer (Layer 4)
- Deep zoom individual voter exploration

### Why it works on Cloudflare
- **PMTiles on R2**: Cloudflare R2 free tier offers 10 GB storage and 10M Class B reads/month
- **PMTiles protocol**: Runs entirely client-side (fetches byte ranges from R2)
- **No server-side processing**: PMTiles rendering is a client-side MapLibre feature
- **R2 integration**: R2 buckets can be bound to Workers for authenticated access (if needed)

### Cloudflare-specific notes

**R2 Free Tier Limits:**

| Resource | Free Limit | SLGRVTRS Usage |
|----------|-----------|----------------|
| Storage | 10 GB | PMTiles: ~200-500 MB |
| Class A operations | 1M/month | ~100K (metadata fetches) |
| Class B operations | 10M/month | ~1M (tile reads) |

**PMTiles on R2 workflow:**
1. Build PMTiles with tippecanoe (local)
2. Upload to R2: `wrangler r2 object put slgrvtrs-tiles/voters.pmtiles --file=voters.pmtiles`
3. Bind R2 to Worker or use public bucket
4. Add MapLibre PMTiles protocol layer pointing to R2 URL

**Privacy consideration:** Individual voter data should NOT be stored in R2 without PDPA compliance review. DM-level aggregates are safe. Individual records should only be loaded if the deployment has proper access controls.

### Verdict: Fully compatible. PMTiles + R2 is the standard pattern for large tile datasets on Cloudflare.

---

## Migration Path: Vercel/Local → Cloudflare

If the project is currently running locally with `output: "standalone"`, the migration requires one critical change:

### Step 0: Fix `next.config.ts` — DONE

The `output: "standalone"` was **removed** and `images: { unoptimized: true }` was added.
This was completed as CF-00. See `CLOUDFLARE_DEPLOYMENT.md` §12 for the confirmed rules.

### Step 1: Cloudflare deployment config — DONE

All config files are deployed and working:
- `wrangler.jsonc`, `open-next.config.ts`, `.cloudflareignore` in repo
- `@opennextjs/cloudflare` 1.20.1 + `wrangler` 4.112.0 in devDependencies
- CF dashboard: Root=`dashboard`, Build=`npm run build:cf`, Deploy=`npm run deploy`

### Step 2: Add D1 (Phase 3+)

```bash
npm install -D @opennextjs/cloudflare wrangler
```

Create `wrangler.jsonc` and `open-next.config.ts` following the pip-melaka pattern. Both are already scaffolded in the repo.

### Step 3: Add R2 (Phase 5)

```bash
wrangler r2 bucket create slgrvtrs-tiles
```

### Step 4: Switch DNS

Update the domain's DNS from Vercel to Cloudflare Pages.

### No code changes needed for Phase 1-2.

---

## Conclusion

**All 11 phases are fully compatible with Cloudflare deployment on the free tier.**

- Phase 1-2: **DEPLOYED** — live at https://slgrvtrs.ritz-analytics.workers.dev
- Phase 3: **DEPLOYED** — DM bubbles + DUN choropleth (9 metrics) + race/gender filters
- Phase 4: **DEPLOYED** — responsive design, ErrorBoundary, provenance panel
- Phase 5A: **DEPLOYED** — 945 DMs geocoded, geocode_cache in D1
- Phase 5B: **DEPLOYED** — R2 bucket `slgrvtrs-tiles` active
- Phase 6: **DEPLOYED** — AI Insights via CF AI Workers (Llama 3.3 70B, `env.AI` binding)
- Phase 7: **DEPLOYED** — Password-protected CSV export (PBKDF2 + D1 `app_settings`)
- Phase 8: **DEPLOYED** — UI features (dark mode, satellite basemap, heatmap, analytics drawer, ranking table, bookmarks, share, onboarding tour, data table, toast notifications, fullscreen, keyboard shortcuts, comparison charts)

### Phase 6: AI Insights (CF AI Workers)
**Status**: DEPLOYED  
**CF Compatibility**: Full — uses native `env.AI` binding, no external API calls  
**Model**: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (70B, FP8 quantized)  
**Free tier**: 10,000 neurons/day (~1,400 insights/day)  
**Route**: `POST /api/insights`  

### Phase 7: Password-Protected CSV Export
**Status**: DEPLOYED  
**CF Compatibility**: Full — PBKDF2 via WebCrypto (10K iterations, fits free-tier CPU budget)  
**D1 table**: `app_settings` (key-value store for password hash)  
**Route**: `POST /api/export/csv` + `GET/PUT /api/settings/password`

### Phase 8: UI Feature Suite
**Status**: DEPLOYED  
**CF Compatibility**: All client-side — no CF infrastructure changes needed  
**Components**: AnalyticsDrawer, AiInsightsPanel, RankingTable, BookmarksMenu, ComparisonRadar, ComparisonBarChart, ShareButton, ThemeToggle, KeyboardShortcuts, OnboardingTour, DataTableView, Toast  
**Features**: Dark mode (sidebar + popups + drawers), ESRI satellite basemap, heatmap visualization, fullscreen toggle, constituency detail card with mini-stats, toast notifications on all key actions

### Phase 9: UX Refinements
**Status**: DEPLOYED
**CF Compatibility**: All client-side
**Features**: Data table row click → fly-to constituency + auto-popup, layer toggle toast notifications, metric switch toast, shimmer loading skeleton

### Phase 10: Export & Heatmap Fixes
**Status**: DEPLOYED
**CF Compatibility**: Uses existing D1 + R2 bindings, no new infrastructure
**Features**:
- All exports password-protected with PAStimenang1 (Data Table, Comparison, All DMs, Individual Voters)
- Individual voter download per DM generated on-the-fly from D1 (no R2 upload needed)
- DUN level "By DUN" filter option added
- Heatmap uses active metric (not hardcoded total_voters)
- Legend shows heatmap colors (red-orange) when heatmap mode active
- New endpoints: `/api/export/dm-xlsx`, `/api/export/comparison`, `/api/export/dm-voters/[dm_code]`

### Phase 11: Security — xlsx Transfer + History Purge
**Status**: DEPLOYED
**CF Compatibility**: No CF infrastructure changes
**Actions**:
- Transferred 4 source xlsx files (294 MB) from public GitHub repo to private R2 bucket (`slgrvtrs-tiles/source-data/`)
- Purged all xlsx files from git history using `git filter-branch` (79 commits rewritten)
- Force-pushed cleaned history to GitHub
- Voter PII (voter IDs, DOB, contact info) no longer publicly accessible
- R2 bucket is private — access only via password-protected Worker routes

The `pip-melaka` repo proves the pattern works — same org, same developer, same stack (Next.js 16 + OpenNext + Wrangler + D1), already deployed to Cloudflare.