# Cloudflare Deployment — SLGRVTRS

> **Status**: DEPLOYED — Workers mode live on free tier (no credit card)
> **Last updated**: 2026-08-15
> **Deployed URL**: https://slgrvtrs.ritz-analytics.workers.dev
> **Deployment mode**: OpenNext Workers (`@opennextjs/cloudflare`)
> **Reference**: `DENGKIL-UX/pip-melaka` (verified working deployment, same org/stack)

---

## Table of Contents

1. [Architecture Decision: Why Cloudflare Workers](#1-architecture-decision-why-cloudflare-workers)
2. [Reference: pip-melaka Deployment Pattern](#2-reference-pip-melaka-deployment-pattern)
3. [Free Tier Limits](#3-free-tier-limits)
4. [Deployment Strategy — What We Actually Use](#4-deployment-strategy--what-we-actually-use)
5. [Files in Repo (Deployed)](#5-files-in-repo-deployed)
6. [Build & Deploy Commands](#6-build--deploy-commands)
7. [Cloudflare Dashboard Settings](#7-cloudflare-dashboard-settings)
8. [Environment Variables](#8-environment-variables)
9. [Confirmed Build Output](#9-confirmed-build-output)
10. [Known Constraints & Gotchas](#10-known-constraints--gotchas)
11. [Cost Projection](#11-cost-projection)
12. [Critical `next.config.ts` Rules (DONE)](#12-critical-nextconfigts-rules-done)

---

## 1. Architecture Decision: Why Cloudflare Workers

SLGRVTRS is a **static-first** application deployed via **OpenNext Workers** (not pure static Pages). The current architecture:

- **MapLibre GL JS v6.3** renders entirely client-side (WebGL2)
- **GeoJSON boundaries** (~200 KB parliament, ~400 KB DUN, ~50 KB outline) served from `public/`
- **Stats JSON** (~10 KB parliament, ~30 KB DUN) served from `public/`
- **No server-side rendering** required — `page.tsx` dynamically imports `MapDashboard` with `ssr: false`
- **No Node.js runtime APIs** used at request time (no `fs`, `path`, `crypto` at runtime)

We chose the **OpenNext Workers path** (not pure static export) because:
1. **Future-proof**: Phase 3+ adds D1 API routes — Workers are required for that
2. **Proven pattern**: `pip-melaka` (same org) runs this exact stack in production
3. **Zero cost difference**: Workers free tier is sufficient; static vs Workers costs the same ($0)
4. **Single deployment model**: No need to migrate from static → Workers later

| Factor | Vercel | Cloudflare Workers |
|--------|--------|--------------------|
| Cost | Free (hobby) | **Free (forever)** |
| Bandwidth | 100 GB/month | **Unlimited** |
| Requests | Unlimited | **100K/day (Workers)** |
| Edge locations | ~30 | **300+** |
| Custom domain | Free | **Free** |
| Credit card required | No | **No** |
| Build minutes | 6000/min | **500 builds/month** |
| D1 database | No | **Yes (5 GB, 5M reads/day)** |
| R2 storage | No | **Yes (10 GB, PMTiles)** |

---

## 2. Reference: pip-melaka Deployment Pattern

The `pip-melaka` repo (same org, same developer) is already deployed to Cloudflare Workers. Key patterns extracted:

### 2.1 Core Stack

```
Next.js 16.3.1 + @opennextjs/cloudflare 1.20.1 + wrangler 4.112.0
```

### 2.2 `wrangler.jsonc` (from pip-melaka, adapted)

```jsonc
{
  "name": "slgrvtrs",
  "compatibility_date": "2025-07-18",
  "compatibility_flags": ["nodejs_compat"],
  "main": ".open-next/worker.js",
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  }
}
```

**Key observations:**
- Uses `@opennextjs/cloudflare` (OpenNext adapter) to compile Next.js for Workers
- Output is a single Worker JS bundle (`worker.js`) + static assets in `.open-next/assets/`
- `nodejs_compat` flag enables Node.js APIs in Workers
- Assets bound via `ASSETS` binding — no separate R2 bucket needed for static files
- D1/R2 bindings added when provisioned (currently commented out)

### 2.3 `open-next.config.ts`

```typescript
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const cloudflareConfig = defineCloudflareConfig({
  incrementalCache: { deferred: false } as any,
} as any);

export default {
  ...cloudflareConfig,
  buildCommand: "npm run build",
} as any;
```

### 2.4 `package.json` scripts

```json
{
  "scripts": {
    "build": "next build",
    "build:cf": "npx @opennextjs/cloudflare build",
    "deploy": "npm run build:cf && npx @opennextjs/cloudflare deploy",
    "deploy:version": "npx wrangler versions upload",
    "preview:cf": "npm run build:cf && npx wrangler dev"
  }
}
```

### 2.5 `next.config.ts` (current, confirmed working)

```typescript
const nextConfig: NextConfig = {
  // NO output: 'standalone' — OpenNext handles bundling for Cloudflare Workers
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: false },
  reactStrictMode: false,
};
```

### 2.6 `.cloudflareignore`

Excludes `data/`, `analysis/`, `scripts/`, `*.md`, `docs/`, `.git/`, `node_modules/`, IDE files, Prisma engine, and local dev artifacts from the deployment bundle.

---

## 3. Free Tier Limits

### 3.1 Cloudflare Workers Free Tier

| Resource | Free Limit | SLGRVTRS Usage |
|----------|-----------|----------------|
| Requests/day | 100,000 | ~100-1000 (map dashboard) |
| CPU time/request | 10 ms | ~1-2 ms (static asset serving) |
| Memory | 128 MB | ~10-20 MB |
| Script size | 1 MB (compressed) | Worker.js is tiny; server function bundled separately |
| Subrequests/request | 50 | 0 (static assets served directly) |
| Builds/month | 500 | ~10-20 |
| Bandwidth | Unlimited | ~1-5 GB/month |

### 3.2 Static Assets Deployed

| Asset | Size | Served From |
|-------|------|-------------|
| `selangor_parliament.geojson` | ~182 KB | `.open-next/assets/boundaries/` |
| `selangor_dun.geojson` | ~400 KB | `.open-next/assets/boundaries/` |
| `selangor_outline.geojson` | ~50 KB | `.open-next/assets/boundaries/` |
| `dm_centroids.geojson` | ~849 KB | `.open-next/assets/boundaries/` |
| `parliament.json` | ~10 KB | `.open-next/assets/stats/` |
| `dun.json` | ~30 KB | `.open-next/assets/stats/` |
| `dm.json` | ~429 KB | `.open-next/assets/stats/` |
| `maplibre-gl-worker.mjs` | ~100 KB | `.open-next/assets/` |
| `maplibre-gl-shared.mjs` | ~200 KB | `.open-next/assets/` |
| Next.js JS chunks | ~2.5 MB | `.open-next/assets/_next/static/` |
| **Total deployed** | **48 files, ~5.2 MB** (827 KB gzip) | |

### 3.3 D1 Free Tier (Phase 3+, not yet provisioned)

| Resource | Free Limit |
|----------|-----------|
| Databases | 10 per account |
| Total storage | 5 GB |
| Rows read/day | 5,000,000 |
| Rows written/day | 100,000 |

### 3.4 R2 Free Tier (Phase 5, not yet provisioned)

| Resource | Free Limit |
|----------|-----------|
| Storage | 10 GB |
| Class A operations | 1M/month |
| Class B operations | 10M/month |

---

## 4. Deployment Strategy — What We Actually Use

### 4.1 Chosen Path: OpenNext Workers (ACTIVE)

We deployed using the **OpenNext Workers** pattern from day one (skipping pure static export):

1. `next build` generates the standard `.next/` output
2. `@opennextjs/cloudflare build` transforms it into:
   - `.open-next/worker.js` — Worker entry point (tiny)
   - `.open-next/assets/` — 46 static asset files
   - Server function bundle (for future API routes)
3. `@opennextjs/cloudflare deploy` uploads to Cloudflare
4. Static GeoJSON + stats + MapLibre worker files served via ASSETS binding

**Why not pure static (§4.2 below)?**
- OpenNext Workers costs the same ($0) as static Pages
- Workers are required for Phase 3+ D1 API routes
- Avoids a migration step later
- pip-melaka proves this pattern works in production

### 4.2 Alternative: Pure Static Export (NOT USED)

For reference, pure static deployment would use:

```bash
npx wrangler pages deploy .next --project-name=slgrvtrs
```

This was considered but rejected because:
- No upgrade path to D1 API routes without switching to Workers
- Requires `output: 'export'` in `next.config.ts` which conflicts with future SSR needs
- Same $0 cost, fewer capabilities

---

## 5. Files in Repo (Deployed)

### 5.1 Cloudflare Config Files

| File | Purpose | Status |
|------|---------|--------|
| `dashboard/wrangler.jsonc` | Worker config (D1/R2 commented out) | Deployed |
| `dashboard/open-next.config.ts` | OpenNext adapter config | Deployed |
| `dashboard/.cloudflareignore` | Deployment exclusions | Deployed |
| `dashboard/.dev.vars.example` | Local dev secrets template | Deployed (template only) |
| `dashboard/next.config.ts` | CF-compatible Next.js config | Deployed |
| `dashboard/package.json` | CF deploy scripts | Deployed |

### 5.2 Static Assets (in `public/`, copied to `.open-next/assets/`)

```
dashboard/public/
├── boundaries/
│   ├── selangor_parliament.geojson   # 22 Parliament boundaries
│   ├── selangor_dun.geojson          # 56 DUN boundaries
│   ├── selangor_outline.geojson      # Selangor state outline
│   └── dm_centroids.geojson          # 945 DM centroid points
├── stats/
│   ├── parliament.json               # 22 Parliament aggregated stats
│   ├── dun.json                      # 56 DUN aggregated stats
│   └── dm.json                       # 945 DM stats with gender×race sub-counts
├── maplibre-gl-worker.mjs            # MapLibre WebGL worker (ESM)
└── maplibre-gl-shared.mjs            # MapLibre shared helpers (ESM)
```

### 5.3 D1 Migration Files (Phase 3, ready but not yet applied)

| File | Purpose | Status |
|------|---------|--------|
| `dashboard/migrations/0001_analytics_warehouse.sql` | D1 schema (parliaments, duns, dms tables + indexes) | Ready |
| `dashboard/migrations/0002_load_parliaments.sql` | 22 INSERT OR REPLACE statements | Ready |
| `dashboard/migrations/0003_load_duns.sql` | 56 INSERT OR REPLACE statements | Ready |
| `scripts/build_d1_load.py` | Python script to regenerate SQL from JSON stats | Ready |

---

## 6. Build & Deploy Commands

### 6.1 Build for Cloudflare

```bash
cd dashboard
npm run build:cf
# Runs: npx @opennextjs/cloudflare build
# Output: .open-next/worker.js + .open-next/assets/ (46 files)
```

### 6.2 Deploy

```bash
cd dashboard
npm run deploy
# Runs: npm run build:cf && npx @opennextjs/cloudflare deploy
# Deploys to: https://slgrvtrs.ritz-analytics.workers.dev
```

### 6.3 Local Preview

```bash
cd dashboard
npm run preview:cf
# Runs: npm run build:cf && npx wrangler dev
# Opens: http://localhost:8787
```

### 6.4 CF Dashboard Auto-Deploy (Git Integration)

The Cloudflare dashboard is configured with:
- **Build command**: `npm run build:cf`
- **Deploy command**: `npm run deploy`

> **Note**: The `deploy` script includes `build:cf` internally, so `build:cf` runs twice in the CF dashboard (once as Build command, once inside deploy). This is wasteful but harmless — the second run is a no-op if nothing changed. To optimize, change the CF dashboard Build command to `echo "Build handled by deploy command"` or `npm run build` (the base Next.js build only).

---

## 7. Cloudflare Dashboard Settings

> These are the **confirmed working** settings in the Cloudflare dashboard.

| Setting | Value |
|---------|-------|
| **Framework preset** | None (custom) |
| **Root directory** | `dashboard` |
| **Build command** | `npm run build:cf` |
| **Deploy command** | `npm run deploy` |
| **Node.js version** | `24.x` (auto-detected from repo) |
| **Build output directory** | *(not set — OpenNext handles this)* |

**Critical**: Root directory MUST be `dashboard` (not `/`). The `open-next.config.ts` and `wrangler.jsonc` live in `dashboard/`, and OpenNext expects to find them at the app root.

---

## 8. Environment Variables

For SLGRVTRS Phase 1-2, **no environment variables are needed**. The app is fully static.

For Phase 3+ with D1, bindings are configured in `wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "slgrvtrs-voters",
      "database_id": "<generated-on-create>"
    }
  ]
}
```

D1 uses **bindings** (not connection strings). The `DB` binding is available in API route handlers via the `env` parameter.

---

## 9. Confirmed Build Output

> From the production build log on 2026-08-15. Version ID: `83ff0bc7-96b0-4041-a3c8-3803245a0b1f`

### 9.1 Build Environment

| Component | Version |
|-----------|---------|
| Node.js | 24.18.0 |
| npm | 10.9.2 |
| Next.js | 16.3.1 (Turbopack) |
| @opennextjs/cloudflare | 1.20.1 |
| @opennextjs/aws | 4.0.2 |
| wrangler | 4.112.0 |
| workerd | 1.20260714.1 |

### 9.2 Build Steps

```
1. npm clean-install (1142 packages, 52s)
2. next build (Turbopack, compiled in 528-1514ms, TS in 3.1-3.7s)
3. OpenNext bundle generation:
   - Bundling middleware function...
   - Bundling static assets...
   - Bundling cache assets...
   - Building server function: default...
   - Applying code patches: ~2.9s
   - Worker saved in .open-next/worker.js
4. Deploy:
   - Read 46 files from .open-next/assets
   - 4 new/modified assets uploaded (35 already cached)
   - Total Upload: 3984.38 KiB / gzip: 826.96 KiB
   - Worker Startup Time: 20 ms
```

### 9.3 Deployed Assets

```
Total: 48 files
  - BUILD_ID
  - _next/static/chunks/* (JS bundles)
  - _next/static/css/* (stylesheets)
  - boundaries/selangor_parliament.geojson
  - boundaries/selangor_dun.geojson
  - boundaries/selangor_outline.geojson
  - boundaries/dm_centroids.geojson
  - stats/parliament.json
  - stats/dun.json
  - stats/dm.json
  - maplibre-gl-worker.mjs
  - maplibre-gl-shared.mjs
  - (favicon, etc.)
```

### 9.4 Worker Bindings (Current)

```
Binding            Resource
env.ASSETS         Assets
```

No D1 or R2 bindings yet (Phase 3+).

### 9.5 Routes

```
Route (app)
┌ ○ /
└ ○ /_not-found

○  (Static)  prerendered as static content
```

---

## 10. Known Constraints & Gotchas

### 10.1 MapLibre GL JS on Cloudflare Workers

- **No issues.** MapLibre runs entirely in the browser (WebGL2).
- Worker files (`maplibre-gl-worker.mjs` + `maplibre-gl-shared.mjs`) are in `public/` and deployed as static assets.
- Glyph URLs (`basemaps.cartocdn.com`) are external — no CORS issues with MapLibre.

### 10.2 `output: 'standalone'` — FORBIDDEN

- `output: 'standalone'` generates a Node.js server — incompatible with OpenNext
- OpenNext needs standard `.next/` output to transform into a Worker bundle
- See §12 for the full rules

### 10.3 `export const runtime = 'edge'` — FORBIDDEN

- Cloudflare Workers already run on the edge
- Adding `runtime = 'edge'` to API routes causes **500 errors** in production
- The `nodejs_compat` flag in `wrangler.jsonc` handles Node.js compatibility

### 10.4 `images: { unoptimized: true }` — REQUIRED

- Cloudflare Workers do not have Next.js Image Optimization API
- Without this, image optimization calls will fail

### 10.5 Double Build in CF Dashboard

- The CF dashboard runs Build command (`build:cf`) then Deploy command (`deploy`)
- `deploy` script includes `build:cf` internally, so it runs twice
- Harmless but wasteful (~30s extra). See §6.4 for optimization.

### 10.6 `compatibility_date` Warning

- Current: `2025-07-18`. Wrangler suggests updating to a more recent date.
- Non-blocking. Update when convenient (e.g., next config change).

### 10.7 `.cloudflareignore` Excludes `*.md`

- All markdown files in `dashboard/` are excluded from deployment
- This is correct — docs are not served to users
- But it means `CLOUDFLARE_DEPLOYMENT.md` itself is not in the bundle (expected)

### 10.8 Build Cache

- Cloudflare caches both dependencies and build output between deploys
- Subsequent deploys are faster (~30s vs ~2min for cold build)
- Cache is invalidated automatically when `package-lock.json` or source files change

### 10.9 DM Bubble Layer Filter Bugs (Fixed Post-Deploy)

Two bugs were found in the DM (Layer 3) filter logic after initial Phase 3 deployment. Both were **frontend-only fixes** (no CF config changes):

1. **`setFilter()` hiding DMs**: Race/Gender filters used `map.setFilter()` which hid bubbles with zero count for the selected demographic (35 DMs vanished). Fixed by updating `circle-radius` paint property instead — all 945 bubbles stay visible and resize.

2. **`DM_MAX_VOTERS` clamping**: Was 9,500 (sub-count max) but `total_voters` reaches 26,156. This clamped 59 DMs at max radius, making filter toggles visually indistinguishable (e.g., Bandar Puncak Alam: All=20px vs Male=19.82px). Fixed by raising to **27,000**.

Both fixes deployed via standard CF dashboard auto-deploy (push to `main`). No infrastructure changes required.

---

## 11. Cost Projection

| Phase | Monthly Cost | Reason |
|-------|-------------|--------|
| Phase 1-2 (static map) | **$0** | OpenNext Workers + static assets, no D1 |
| Phase 3 (DM + API) | **$0** | 100K req/day free, D1 5M reads/day free |
| Phase 4 (polish) | **$0** | No additional infra |
| Phase 5 (PMTiles) | **$0** | R2 free tier: 10 GB storage, 10M Class B reads/month |

---

## 12. Critical `next.config.ts` Rules (DONE)

> These changes have been applied and are confirmed working in production.

### Rule 1: NO `output: 'standalone'`

```diff
- output: "standalone",
+ // NO output: 'standalone' — OpenNext handles bundling for Cloudflare Workers
```

### Rule 2: YES `images: { unoptimized: true }`

```diff
+ images: { unoptimized: true },  // CF Workers have no Image Optimization API
```

### Rule 3: NO `outputFileTracingIncludes` for this project

- pip-melaka uses `outputFileTracingIncludes` for its `public/data/` directory
- SLGRVTRS does not need this — all data is loaded client-side from `public/` URLs

### Rule 4: Build script is plain `next build`

```diff
- "build": "next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/",
+ "build": "next build",
```

### Why these matter

- `output: "standalone"` generates a self-contained Node.js server (`.next/standalone/server.js`) — OpenNext cannot transform this into a Worker
- `images: { unoptimized: true }` is required because Cloudflare Workers do not have Next.js Image Optimization
- The `cp -r` build script was for Docker/Vercel standalone mode — not applicable to OpenNext
