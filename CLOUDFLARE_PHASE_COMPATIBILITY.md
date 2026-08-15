# Cloudflare Deployment — Phase Compatibility Analysis

> **Status**: Phase B (Workers) deployed and live.
> **Last updated**: 2026-08-15
> **Deployed URL**: https://slgrvtrs.ritz-analytics.workers.dev
> **Conclusion**: All 5 phases are compatible with Cloudflare deployment. No architectural changes required.

---

## Summary Matrix

| Phase | Description | CF Compatible? | CF Deployment Mode | Changes Required | Risk |
|-------|-------------|---------------|-------------------|-----------------|------|
| **Phase 1** | Parliament choropleth map | Yes | Static Pages | None | None |
| **Phase 2** | DUN drill-down + toggles | Yes | Static Pages | None | None |
| **Phase 3** | DM bubble visualization, DUN choropleth (9 metrics), race/gender filters | Yes | Static + D1 | Add D1 for DM queries | Low |
| **Phase 4** | Polish & deploy | Yes | Static Pages + Workers | Minor config changes | None |
| **Phase 5** | Individual voter points (PMTiles) | Yes | Static + R2 | Add R2 for PMTiles | Low |

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

**D1 approach (optional enhancement):**
- Create D1 database with `dms` table
- Add API route: `GET /api/dms?dun=N.01&race=02`
- Use `@opennextjs/cloudflare` + `wrangler.jsonc` with D1 binding
- 945 DM queries/day is negligible (free tier: 5M reads/day)

### Changes needed for static approach
- None to the deployment config
- Generate `dm.json` and `dm_centroids.geojson` (already in the Phase 3 plan)

### Changes needed for D1 approach
- Uncomment D1 binding in `wrangler.jsonc` (already scaffolded)
- Add API route **without** `export const runtime = 'edge'` (see below)
- Create D1 database: `npx wrangler d1 create slgrvtrs-voters`
- Apply migrations: see `CLOUDFLARE_D1_DATABASE.md` §9

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

**All 5 phases are fully compatible with Cloudflare deployment on the free tier.**

- Phase 1-2: **DEPLOYED** — live at https://slgrvtrs.ritz-analytics.workers.dev
- Phase 3: **DEPLOYED** — DM bubbles + DUN choropleth (9 metrics) + race/gender filters (all static, zero CF changes needed)
- Phase 4: Cloudflare is the **intended deployment target**
- Phase 5: R2 + PMTiles is the **standard pattern** for this use case

The `pip-melaka` repo proves the pattern works — same org, same developer, same stack (Next.js 16 + OpenNext + Wrangler + D1), already deployed to Cloudflare.