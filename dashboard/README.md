# SLGRVTRS Dashboard

Interactive electoral map of Selangor showing 3,971,650 registered voters across 22 Parliamentary and 56 State (DUN) constituencies, with 945 DM-level voting districts.

**Live**: https://slgrvtrs.ritz-analytics.workers.dev

## Quick Start

```bash
cd dashboard
bun install
bun run dev          # Local dev (no D1 — uses static fallback)
npm run build:cf   # Build for Cloudflare Workers
npx wrangler dev    # Local dev with D1 (requires wrangler)
```

## Features (Phase 1–5A)

- **Parliament choropleth** (22 seats) with 10 switchable metrics
- **DUN drill-down** (56 seats) with 9 dynamic choropleth metrics
- **DM bubble layer** (945 centroids) with race/gender proportional filters
- **D1 database** with 3 API routes (`/api/dm`, `/api/dm/[code]`, `/api/dm/search`)
- **DM geocoding** (Phase 5A) — 945/945 real coordinates via Google Maps + Nominatim, boundary-validated
- **Responsive design** with mobile sidebar collapse
- **ErrorBoundary** and **provenance panel**

## Tech Stack

| Component | Version | Notes |
-----------|---------|-------|
| Next.js | 16.3 | App Router, React 19 |
| MapLibre GL JS | 6.3 | ESM-only, WebGL2, named imports |
| TypeScript | 5 | ES2022 target |
| Tailwind CSS | 4 | Utility-first styling |
| Cloudflare D1 | Provisioned | 22 parliaments, 56 DUNs, 945 DMs |
| @opennextjs/cloudflare | 1.20.1 | Next.js → CF Workers adapter |

## Architecture

- `src/app/page.tsx` — Server Component, renders ErrorBoundary + MapDashboardClient
- `src/components/map/MapDashboard.tsx` — Main map (all layers, popups, sidebar, DM filters)
- `src/app/api/dm/route.ts` — GET /api/dm (GeoJSON or JSON, with DUN/Parliament/voter filters)
- `src/app/api/dm/[code]/route.ts` — GET /api/dm/[code] (single DM lookup)
- `src/app/api/dm/search/route.ts` — GET /api/dm/search?q= (name autocomplete)
- `src/app/api/geocode/route.ts` — POST /api/geocode (cache → Google → Nominatim geocoding)
- `src/app/api/geocode/status/route.ts` — GET /api/geocode/status (geocoding stats)
- `src/lib/map/setup.ts` — MapLibre worker URL config + named re-exports
- `src/lib/map/join-stats.ts` — Stats JSON → GeoJSON property join
- `src/lib/map/color-scales.ts` — 10 Parliament + 9 DUN color scales + expression builder
- `public/boundaries/` — Pre-processed GeoJSON files (static fallback for DMs)
- `public/stats/` — Pre-computed voter statistics JSON
- `migrations/` — D1 SQL schema + data load files

## Data Provenance

See [`docs/provenance.md`](../docs/provenance.md) for full provenance and disclaimers.
