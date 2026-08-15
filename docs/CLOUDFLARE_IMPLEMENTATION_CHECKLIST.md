# Cloudflare Implementation Checklist — SLGRVTRS

> **Status**: Phase B COMPLETE — Workers deployment live on free tier.
> **Last updated**: 2026-08-15
> **Deployed URL**: https://slgrvtrs.ritz-analytics.workers.dev
> **Reference**: `CLOUDFLARE_DEPLOYMENT.md`, `CLOUDFLARE_D1_DATABASE.md`, `CLOUDFLARE_PHASE_COMPATIBILITY.md`
> **Pattern source**: `DENGKIL-UX/pip-melaka` (verified working deployment)

---

## Pre-Flight: Critical Fix Required

### [x] CF-00: Remove `output: "standalone"` from `next.config.ts`

**Done.** Removed `output: "standalone"`, added `images: { unoptimized: true }`, cleaned build script.

```diff
- output: "standalone",
+ // NO output: 'standalone' — OpenNext handles bundling for Cloudflare Workers
+ images: { unoptimized: true },
```

Also fixed:
- `package.json` build script: removed `cp -r .next/static .next/standalone/...` (Docker/Vercel-specific)
- Build script is now plain `next build`

**File**: `dashboard/next.config.ts`

---

## Phase A: Static Deployment (Phase 1-2, Zero Cost)

> **SKIPPED** — We went straight to Phase B (Workers deployment).
> Rationale: OpenNext Workers costs the same as static ($0), but enables D1 API routes for Phase 3+ without a migration step. The `pip-melaka` reference repo uses this pattern in production.

### [~] CF-01: Create Cloudflare Account

**Done** (via browser, outside this repo). Free plan, no credit card.

### [~] CF-02: Connect GitHub Repo

**Done** (via CF dashboard). Settings:
- Framework preset: None (custom)
- Root directory: `dashboard`
- Build command: `npm run build:cf`
- Deploy command: `npm run deploy`

### [~] CF-03: Verify Static Deployment

**Replaced by CF-17** (Workers verification). See below.

### [ ] CF-04: Add Custom Domain (Optional)

1. Workers & Pages → slgrvtrs → Custom domains → Add
2. Update DNS records as instructed
3. SSL auto-provisioned by Cloudflare

---

## Phase B: Workers Deployment (Phase 3+ API Routes)

> **COMPLETE.** All tasks CF-10 through CF-18 are done.
> The map dashboard is live at https://slgrvtrs.ritz-analytics.workers.dev

### [x] CF-10: Fix `next.config.ts` (prerequisite)

See CF-00 above. Confirmed working in production build.

### [x] CF-11: Install Cloudflare Dependencies

```bash
cd dashboard
npm install -D @opennextjs/cloudflare wrangler
```

Installed versions (confirmed in build log):
- `@opennextjs/cloudflare` 1.20.1
- `wrangler` 4.112.0

### [x] CF-12: Verify Config Files

All config files deployed and confirmed working:
- `dashboard/wrangler.jsonc` — Worker config (D1/R2 commented out)
- `dashboard/open-next.config.ts` — OpenNext adapter with `incrementalCache: { deferred: false }`
- `dashboard/.cloudflareignore` — Excludes `data/`, `analysis/`, `scripts/`, `*.md`, `docs/`, etc.
- `dashboard/.dev.vars.example` — Secrets template

### [x] CF-13: Update `package.json` Scripts

Confirmed scripts in `dashboard/package.json`:
```json
{
  "build": "next build",
  "build:cf": "npx @opennextjs/cloudflare build",
  "deploy": "npm run build:cf && npx @opennextjs/cloudflare deploy",
  "deploy:version": "npx wrangler versions upload",
  "preview:cf": "npm run build:cf && npx wrangler dev"
}
```

### [x] CF-14: Update Build Command in CF Dashboard

**Done.** CF dashboard configured with:
- **Root directory**: `dashboard`
- **Build command**: `npm run build:cf`
- **Deploy command**: `npm run deploy`

> **Known issue**: `deploy` script includes `build:cf` internally, so OpenNext builds twice per deploy (once from Build command, once inside deploy). Harmless but adds ~30s. To optimize, change CF dashboard Build command to `echo "skip"` or `npm run build` (Next.js only, no OpenNext).

### [x] CF-15: Verify Worker Bundle Size

**Confirmed from production build log:**
- Total Upload: **3984.38 KiB / gzip: 826.96 KiB**
- 46 asset files deployed
- Worker Startup Time: **20 ms**
- Worker.js itself is tiny (~746 bytes gzip) — the bulk is JS chunks and GeoJSON assets
- Well under the 1 MB compressed Worker script limit and the 3 MB general limit

### [x] CF-16: Test Locally with Wrangler

**Skipped** — went straight to remote deploy via CF dashboard. The remote deploy succeeded, confirming the build works. Local testing can be done anytime with `npm run preview:cf`.

### [x] CF-17: Verify Remote Deployment

**Confirmed working.** Production build log shows:
- OpenNext build: `next build` → Turbopack compiled in 528-1514ms, TS in 3.1-3.7s
- OpenNext bundle: middleware + static assets + cache assets + server function bundled
- Code patches applied in ~2.9s
- 46 assets read from `.open-next/assets/`
- 4 new/modified assets uploaded (35 already cached from prior deploy)
- Deployed to: `https://slgrvtrs.ritz-analytics.workers.dev`
- Version ID: `83ff0bc7-96b0-4041-a3c8-3803245a0b1f`
- Only binding: `env.ASSETS`

### [x] CF-18: Verify All Map Assets Deployed

**Confirmed from build log.** All GeoJSON and stats files present in upload:
- `/boundaries/selangor_parliament.geojson` (deployed in initial upload)
- `/boundaries/selangor_dun.geojson` (deployed in initial upload)
- `/boundaries/selangor_outline.geojson` (deployed as new asset in this build)
- `/boundaries/dm_centroids.geojson` (deployed with Phase 3 DM bubble layer)
- `/stats/parliament.json` (deployed in initial upload)
- `/stats/dun.json` (deployed in initial upload)
- `/stats/dm.json` (deployed with Phase 3 DM bubble layer — 945 records with gender×race sub-counts)
- `/maplibre-gl-worker.mjs` (deployed in initial upload)
- `/maplibre-gl-shared.mjs` (deployed in initial upload)

> **Note**: `selangor_outline.geojson` was missing from the first deploy (37 assets), causing a 404 and JSON parse error on the map. This was fixed and confirmed uploaded in the second deploy (46 assets). DM assets (`dm_centroids.geojson`, `dm.json`) were added in Phase 3, bringing the total to 48 assets.

### [x] CF-19: Post-Deploy DM Bubble Layer Bug Fixes

Two bugs in the DM (Layer 3) bubble filter logic were found and fixed after initial Phase 3 deployment:

1. **BUG 1** (commit cc4a1ce): `setFilter()` was hiding DMs whose selected demographic sub-count was zero (35 DMs vanished when filtering by Indian, etc.). Fixed by switching to paint-property-based `circle-radius` updates — all 945 bubbles remain visible and resize proportionally.

2. **BUG 2**: `DM_MAX_VOTERS` was 9,500 (sub-count max) but `total_voters` goes up to 26,156. This clamped 59 DMs at max radius, making Male/Female toggles visually indistinguishable on high-voter DMs (e.g., Bandar Puncak Alam: All=20px, Male=19.82px). Fixed by raising `DM_MAX_VOTERS` to **27,000**.

Additional: added `test_dm_radius_engine.py` (5 tests, 10,395 checks passing), Active Filter banner in DM popup, filtered count/label in DM hover tooltip.

**Files changed**: `MapDashboard.tsx`, new `test_dm_radius_engine.py`
**No CF config changes needed** — purely frontend logic fixes.

### [x] CF-19a: Choropleth Metric Audit

Audited the choropleth coloring logic for Parliament (Layer 1) and DUN (Layer 2):
- **10 metrics** defined in `PARL_COLOR_SCALES` (was documented as 7 — updated)
- **9 DUN metrics** in `DUN_COLOR_SCALES` (`contact_pct` excluded — constant value across all DUNs)
- DUN layer uses **dynamic choropleth** (not static teal fill as previously documented)
- Legend **auto-switches** between Parliament/DUN labels at zoom ≥ 9.5
- 3 metrics have DUN-specific stop values (`total_voters`, `age_mean`, `age_median`)
- Full audit documented in `MAPLIBRE_PROJECT.md` §14

**No code changes needed** — the implementation was already correct; only documentation was outdated.

---

## Phase C: D1 Database (Phase 3+ DM Queries)

> **Not started.** Schema and migration files are ready.

### [ ] CF-20: Create D1 Database

```bash
npx wrangler d1 create slgrvtrs-voters
# Copy the database_id from output
# Paste into wrangler.jsonc d1_databases[0].database_id
```

### [ ] CF-21: Apply Schema Migration

```bash
npx wrangler d1 execute slgrvtrs-voters --remote --file=./migrations/0001_analytics_warehouse.sql
```

### [x] CF-22: Generate Data Load SQL from Existing JSON

**Done** via `scripts/build_d1_load.py`:
- `migrations/0002_load_parliaments.sql` — 22 INSERT OR REPLACE statements
- `migrations/0003_load_duns.sql` — 56 INSERT OR REPLACE statements

```bash
python3 scripts/build_d1_load.py
```

### [ ] CF-23: Load Pre-Aggregated Stats

```bash
npx wrangler d1 execute slgrvtrs-voters --remote --file=./migrations/0002_load_parliaments.sql
npx wrangler d1 execute slgrvtrs-voters --remote --file=./migrations/0003_load_duns.sql
```

### [ ] CF-24: Verify D1 Data

```bash
npx wrangler d1 execute slgrvtrs-voters --remote --command="SELECT COUNT(*) as cnt FROM parliaments"
# Expected: 22

npx wrangler d1 execute slgrvtrs-voters --remote --command="SELECT COUNT(*) as cnt FROM duns"
# Expected: 56
```

### [ ] CF-25: Uncomment D1 Binding in wrangler.jsonc

Remove the comments around `d1_databases` in `wrangler.jsonc` and paste the `database_id` from CF-20.

---

## Phase D: R2 Storage (Phase 5 PMTiles)

### [ ] CF-30: Create R2 Bucket

```bash
npx wrangler r2 bucket create slgrvtrs-tiles
```

### [ ] CF-31: Uncomment R2 Binding in wrangler.jsonc

Remove the comments around `r2_buckets` in `wrangler.jsonc`.

### [ ] CF-32: Upload PMTiles

```bash
npx wrangler r2 object put slgrvtrs-tiles/voters.pmtiles --file=./artifacts/voters.pmtiles
```

---

## Phase E: CI/CD (Optional)

### [ ] CF-40: Add Cloudflare Build to CI

Add to `.github/workflows/ci.yml`:

```yaml
- name: Cloudflare build
  run: npx @opennextjs/cloudflare build
```

### [ ] CF-41: Add Deploy on Push to Main (Optional)

Already configured via CF dashboard Git integration. Pushes to `main` auto-deploy.

---

## Dependency Tree

```
CF-00 (fix next.config.ts) ✅
  ├── CF-01..04 (Static deploy — SKIPPED, went straight to Workers)
  └── CF-10..19a (Workers deploy + post-deploy fixes + choropleth audit — COMPLETE ✅)
        └── CF-20..25 (D1 database — ready, not started)
              └── CF-30..32 (R2 storage — future)
                    └── CF-40..41 (CI/CD — optional)
```

## Progress Summary

| Phase | Tasks | Status | Notes |
|-------|-------|--------|-------|
| Pre-Flight | CF-00 | **DONE** | next.config.ts fixed |
| A: Static | CF-01..04 | **SKIPPED** | Went straight to Workers |
| B: Workers | CF-10..20 | **DONE** | Live at workers.dev; DM bubble filter bugs fixed; choropleth metric audit complete |
| C: D1 | CF-20..25 | **Ready** | SQL files generated, D1 not provisioned |
| D: R2 | CF-30..32 | **Future** | Needs PMTiles build first |
| E: CI/CD | CF-40..41 | **Optional** | Git integration already auto-deploys |