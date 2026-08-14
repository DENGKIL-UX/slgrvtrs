# SLGRVTRS Dashboard — Phase 1

Interactive electoral map of Selangor showing 3,971,650 registered voters across 22 Parliamentary constituencies.

## Quick Start

```bash
cd dashboard
bun install
bun run dev
```

Then open `http://localhost:3000`.

## Phase 1 Features

- **Parliament choropleth** (22 seats) with 7 switchable metrics
- **Hover highlight** via `feature-state` API
- **Click popup** with full constituency demographics
- **Sidebar** with metric selector and dynamic color legend
- **Data**: ElectionData.MY 2018 Parliament boundaries + pre-computed voter stats

## Tech Stack

| Component | Version | Notes |
-----------|---------|-------|
| Next.js | 16 | App Router, React 19 |
| MapLibre GL JS | 6.3.0 | ESM-only, WebGL2, named imports |
| TypeScript | 5 | ES2022 target |
| Tailwind CSS | 4 | Utility-first styling |

## Architecture

- `src/app/page.tsx` — Client Component with `next/dynamic` + `ssr: false`
- `src/components/map/MapDashboard.tsx` — Main map component (single-file Phase 1)
- `src/lib/map/setup.ts` — MapLibre worker URL config + named re-exports
- `src/lib/map/join-stats.ts` — Stats JSON → GeoJSON property join
- `src/lib/map/color-scales.ts` — 7 choropleth color scales + expression builder
- `public/boundaries/` — Pre-processed GeoJSON files
- `public/stats/` — Pre-computed voter statistics JSON

## Data Provenance

See [`docs/provenance.md`](../docs/provenance.md) for full provenance and disclaimers.
