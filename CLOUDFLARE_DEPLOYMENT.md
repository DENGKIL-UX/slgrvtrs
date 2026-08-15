# Cloudflare Pages Deployment — SLGRVTRS

> **Status**: Research scaffold — not yet implemented.  
> **Last updated**: 2026-08-15  
> **Target**: Cloudflare Pages Free Tier (no credit card)

---

## Table of Contents

1. [Architecture Decision: Why Cloudflare Pages](#1-architecture-decision-why-cloudflare-pages)
2. [Reference: pip-melaka Deployment Pattern](#2-reference-pip-melaka-deployment-pattern)
3. [Free Tier Limits](#3-free-tier-limits)
4. [Deployment Strategy for SLGRVTRS](#4-deployment-strategy-for-slgrvtrs)
5. [Required Files](#5-required-files)
6. [Build & Deploy Commands](#6-build--deploy-commands)
7. [Environment Variables](#7-environment-variables)
8. [Step-by-Step Setup](#8-step-by-step-setup)
9. [Known Constraints](#9-known-constraints)
10. [Cost Projection](#10-cost-projection)

---

## 1. Architecture Decision: Why Cloudflare Pages

SLGRVTRS is a **static-first** application. The current architecture:

- **MapLibre GL JS v6.3** renders entirely client-side (WebGL2)
- **GeoJSON boundaries** (~200 KB parliament, ~400 KB DUN) served from `public/`
- **Stats JSON** (~10 KB parliament, ~30 KB DUN) served from `public/`
- **No server-side rendering** required — `page.tsx` dynamically imports `MapDashboard` with `ssr: false`
- **No Node.js runtime APIs** used at request time (no `fs`, `path`, `crypto` at runtime)

This makes SLGRVTRS an **ideal candidate for Cloudflare Pages**:

| Factor | Vercel | Cloudflare Pages |
|--------|--------|-------------------|
| Cost for static site | Free (hobby) | **Free (forever)** |
| Bandwidth | 100 GB/month | **Unlimited** |
| Requests | Unlimited | **Unlimited** |
| Edge locations | ~30 | **300+** |
| Custom domain | Free | **Free** |
| Credit card required | No | **No** |
| Build minutes | 6000/min | **500 builds/month** |
| Workers integration | No | **Yes (D1, KV, R2)** |

Cloudflare Pages is the superior choice for this project because:
1. **Free tier has no credit card** — Vercel's free tier also doesn't, but CF has better limits
2. **Unlimited bandwidth** — critical if the map goes viral during elections
3. **D1 database** available for Phase 3+ data queries (DM-level stats, voter search)
4. **R2 storage** available for PMTiles in Phase 5
5. **300+ edge nodes** — faster map tile/GeoJSON delivery across Malaysia

---

## 2. Reference: pip-melaka Deployment Pattern

The `pip-melaka` repo (same org, same developer) is already deployed to Cloudflare Pages + Workers. Key patterns extracted:

### 2.1 Core Stack

```
Next.js 16.1 + @opennextjs/cloudflare + wrangler
```

### 2.2 `wrangler.jsonc` (from pip-melaka)

```jsonc
{
  "name": "pip-melaka",
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
- Output is a single Worker JS bundle (`worker.js`) + static assets
- `nodejs_compat` flag enables Node.js APIs in Workers
- Assets bound via `ASSETS` binding — no separate R2 bucket needed for static files

### 2.3 `open-next.config.ts` (from pip-melaka)

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

### 2.4 `package.json` scripts (from pip-melaka)

```json
{
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "build:cf": "npx @opennextjs/cloudflare build",
    "deploy": "npm run build:cf && npx @opennextjs/cloudflare deploy",
    "deploy:version": "npx wrangler versions upload",
    "preview:cf": "npm run build:cf && npx wrangler dev"
  }
}
```

### 2.5 `next.config.ts` key settings (from pip-melaka)

```typescript
const config: NextConfig = {
  images: { unoptimized: true },  // CF Workers has no Image Optimization
  typescript: { ignoreBuildErrors: false },
  reactStrictMode: false,
  // outputFileTracingIncludes restricts what gets bundled into the Worker
  outputFileTracingIncludes: {
    "/api/demographics": ["./public/data/**/*"],
  },
};
```

### 2.6 `.cloudflareignore` (from pip-melaka)

```
s2d-engine/
```

Excludes large build-time-only directories from the deployment bundle.

---

## 3. Free Tier Limits

### 3.1 Cloudflare Pages Free Tier

| Resource | Free Limit | SLGRVTRS Usage |
|----------|-----------|----------------|
| Builds per month | 500 | ~10-20 (more than enough) |
| Bandwidth | Unlimited | ~1-5 GB/month (GeoJSON + stats) |
| Requests | Unlimited | Depends on traffic |
| Build time | Unlimited | ~30-60s per build |
| Deployment slots | Unlimited | 1 production + preview PRs |
| Custom domains | Free | `slgrvtrs.ritz-analytics.workers.dev` or custom |
| SSL | Free | Auto-provisioned |
| Web analytics | Free | Can enable for traffic insights |

### 3.2 Cloudflare Workers (bundled with Pages)

| Resource | Free Limit |
|----------|-----------|
| Requests/day | 100,000 |
| CPU time/request | 10 ms |
| Memory | 128 MB |
| Script size | 1 MB (compressed) |
| Subrequests/request | 50 |

### 3.3 What SLGRVTRS Needs at Runtime

| Need | Size/Amount | Fits Free Tier? |
|------|-----------|----------------|
| `selangor_parliament.geojson` | 182 KB | Yes (static asset) |
| `selangor_dun.geojson` | ~400 KB | Yes (static asset) |
| `parliament.json` | ~10 KB | Yes (static asset) |
| `dun.json` | ~30 KB | Yes (static asset) |
| `maplibre-gl-worker.mjs` | ~100 KB | Yes (static asset) |
| `maplibre-gl-shared.mjs` | ~200 KB | Yes (static asset) |
| `selangor_outline.geojson` | ~50 KB | Yes (static asset) |
| **Total static assets** | **~972 KB** | **Easily** |
| Map render (client-side) | 0 Worker CPU | Yes (no SSR) |
| API routes | 0 currently | Yes |

**Verdict: SLGRVTRS Phase 1-2 fits entirely within the free tier with zero risk of hitting limits.**

---

## 4. Deployment Strategy for SLGRVTRS

### 4.1 Recommended: Static Export (Simplest)

Since SLGRVTRS is a client-side map with `ssr: false`, the **simplest deployment** is a **fully static export**:

1. `next build` generates static HTML + JS bundles in `.next/`
2. GeoJSON + stats + worker files are already in `public/`
3. Deploy as **direct upload** or **Git integration** to Cloudflare Pages
4. No Workers runtime needed — pure static serving

**Advantages:**
- No `@opennextjs/cloudflare` dependency
- No `wrangler.jsonc` needed
- No `nodejs_compat` complexity
- Faster builds
- Smaller bundle
- Works with simple `npx wrangler pages deploy` or Git push

### 4.2 Alternative: OpenNext Workers (if API routes added later)

If Phase 3+ adds API routes (D1 queries for DM-level data), use the `pip-melaka` pattern:

1. Add `@opennextjs/cloudflare`
2. Create `wrangler.jsonc` and `open-next.config.ts`
3. Bind D1 database for DM stats queries
4. Deploy with `npm run deploy`

**Recommendation: Start with 4.1 (static), upgrade to 4.2 when API routes are needed.**

---

## 5. Required Files

### 5.1 For Static Deployment (Phase 2)

```
slgrvtrs/
├── dashboard/
│   ├── .cloudflareignore          # Exclude build artifacts
│   └── public/                     # All static assets (already exists)
│       ├── boundaries/
│       │   ├── selangor_parliament.geojson
│       │   ├── selangor_dun.geojson
│       │   └── selangor_outline.geojson
│       ├── stats/
│       │   ├── parliament.json
│       │   └── dun.json
│       ├── maplibre-gl-worker.mjs
│       └── maplibre-gl-shared.mjs
└── (no wrangler.jsonc needed for static)
```

### 5.2 For Workers Deployment (Phase 3+)

```
slgrvtrs/dashboard/
├── wrangler.jsonc                 # NEW — Worker config
├── open-next.config.ts             # NEW — OpenNext adapter config
├── .cloudflareignore               # NEW — exclude large files
├── .dev.vars.example               # NEW — local dev secrets template
└── package.json                    # MODIFY — add deploy scripts
```

---

## 6. Build & Deploy Commands

### 6.1 Static Deployment

```bash
# Build
npm run build

# Deploy (direct upload)
npx wrangler pages deploy .next --project-name=slgrvtrs

# Or: connect GitHub repo in CF Dashboard → auto-deploy on push
```

### 6.2 Workers Deployment (Phase 3+)

```bash
# Build for Cloudflare
npm run build:cf

# Deploy
npm run deploy

# Local preview
npm run preview:cf
```

---

## 7. Environment Variables

For SLGRVTRS Phase 1-2, **no environment variables are needed**. The app is fully static.

For Phase 3+ with D1:

```bash
# .dev.vars.example
DATABASE_URL=not-needed  # D1 uses bindings, not connection strings
```

D1 bindings are configured in `wrangler.jsonc`:

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

---

## 8. Step-by-Step Setup

### 8.1 Create Cloudflare Account (Free, No Credit Card)

1. Go to https://dash.cloudflare.com/sign-up
2. Sign up with email + password (or Google/GitHub OAuth)
3. **No credit card required** — select the free plan
4. Verify email

### 8.2 Create Pages Project

**Option A: Git Integration (Recommended)**

1. Dashboard → Workers & Pages → Create application → Pages → Connect to Git
2. Select the `DENGKIL-UX/slgrvtrs` repository
3. Set build settings:
   - **Build command:** `cd dashboard && npm run build`
   - **Build output directory:** `dashboard/.next`
   - **Node.js version:** `20.x`
4. Deploy

**Option B: Direct Upload**

```bash
cd dashboard
npm run build
npx wrangler pages deploy .next --project-name=slgrvtrs
```

### 8.3 Configure Custom Domain (Optional)

1. Pages → slgrvtrs → Custom domains → Add domain
2. Update DNS records as instructed
3. SSL auto-provisioned

### 8.4 Enable Analytics (Optional)

1. Pages → slgrvtrs → Analytics → Enable Web Analytics
2. Free, privacy-first analytics

---

## 9. Known Constraints

### 9.1 MapLibre GL JS on Cloudflare Pages

- **No issues expected.** MapLibre runs entirely in the browser (WebGL2).
- Worker files (`maplibre-gl-worker.mjs` + `maplibre-gl-shared.mjs`) must be in `public/` and served as static files — this is already the case.
- Glyph URLs (`basemaps.cartocdn.com`) are external — no CORS issues with MapLibre.

### 9.2 Static Export Considerations

- `next build` with `output: 'export'` may be needed for pure static deployment
- However, the current setup (App Router with `'use client'` dynamic import) may work without it
- Test with both `npx wrangler pages deploy .next` and `npx wrangler pages deploy out` (if using `output: 'export'`)

### 9.3 ESM Worker Files

- The `maplibre-gl-worker.mjs` imports `maplibre-gl-shared.mjs` from an absolute path (`/maplibre-gl-shared.mjs`)
- This works correctly when both files are in `public/` — they're served as static ESM files
- **No changes needed for Cloudflare Pages** — same pattern as Vercel/local dev

---

## 10. Cost Projection

| Phase | Monthly Cost | Reason |
|-------|-------------|--------|
| Phase 1-2 (static) | **$0** | Pure static assets, no Workers, no D1 |
| Phase 3 (DM + API) | **$0** | 100K req/day free, D1 5M reads/day free |
| Phase 4 (polish) | **$0** | No additional infra |
| Phase 5 (PMTiles) | **$0** | R2 free tier: 10 GB storage, Class A: 1M req/month, Class B: 10M req/month |

**Total projected cost: $0/month for all 5 phases on the free tier.**