# SLGRVTRS Dashboard

Interactive electoral map of Selangor showing 3,971,650 registered voters across 22 Parliamentary and 56 State (DUN) constituencies, with 945 DM-level voting districts.

**Live**: https://slgrvtrs.ritz-analytics.workers.dev

## Quick Start

```bash
cd dashboard
bun install
bun run dev          # Local dev (no D1 — uses static fallback)
npm run build:cf   # Build for Cloudflare Workers
npm run deploy     # Deploy to Cloudflare
```

## Features (Phase 1–10)

### Map Visualization
- **Parliament choropleth** (22 seats) with 10 switchable metrics
- **DUN drill-down** (56 seats) with 9 dynamic choropleth metrics
- **DM bubble layer** (945 centroids) with race/gender proportional filters
- **Heatmap visualization mode** — red-orange gradient for voter density (parliament + DUN)
- **ESRI satellite basemap** — toggle between light, dark, and satellite imagery
- **Dark mode** — full UI theming including sidebar, popups, drawers, and map layers

### Interactivity
- **Search** — fuzzy search Parliament/DUN by code or name, click to flyTo + auto-popup
- **Seat comparison** — add up to 3 seats from popups for side-by-side stats
- **Comparison radar chart** — 6-axis normalized radar with state-average overlay
- **Comparison bar chart** — grouped race composition bars
- **Bookmarks** — save/restore constituencies in localStorage
- **Shareable URLs** — encode map center, zoom, metric, and selection into URL hash
- **Fullscreen map toggle** — hide sidebar for maximum map area (press F)

### Data & Analytics
- **Analytics drawer** — statewide ethnic/gender donuts, top/bottom-5 bar charts, age distribution
- **AI Insights** — LLM-powered bullet insights via Cloudflare AI Workers (Llama 3.3 70B)
- **Ranking table** — sortable/filterable table of all 22 parliaments or 56 DUNs
- **Data table explorer** — full-screen sortable table with CSV export + row click to fly-to
- **Constituency detail card** — mini-stats (voters, Malay %, age) + quick actions
- **Quick statistics** — statewide aggregate summary in sidebar

### UX & Polish
- **Onboarding tour** — 4-step first-visit guided tour
- **Keyboard shortcuts** — press ? for overlay (/ 1 2 3 A I R B D F T S Esc ?)
- **Toast notifications** — success/error/info feedback for all key actions
- **Password-protected CSV export** — PBKDF2 hashed, D1-backed
- **Responsive design** — mobile sidebar collapse, touch-friendly controls
- **ErrorBoundary** and **provenance panel**

## Tech Stack

| Component | Version | Notes |
|-----------|---------|-------|
| Next.js | 16.3 | App Router, React 19 |
| MapLibre GL JS | 6.3 | ESM-only, WebGL2, named imports |
| TypeScript | 5 | ES2022 target |
| Tailwind CSS | 4 | Utility-first styling |
| Cloudflare D1 | Provisioned | 22 parliaments, 56 DUNs, 945 DMs |
| Cloudflare R2 | Active | `slgrvtrs-tiles` bucket, `/api/r2/[...path]` |
| Cloudflare AI Workers | Active | `env.AI` binding, Llama 3.3 70B |
| @opennextjs/cloudflare | 1.20.1 | Next.js → CF Workers adapter |
| Recharts | 2.15 | Analytics + comparison charts |

## API Routes (14 total)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/dm` | GET | DM GeoJSON/JSON with filters (dun, parl, min/max voters) |
| `/api/dm/[code]` | GET | Single DM lookup |
| `/api/dm/search` | GET | DM name autocomplete |
| `/api/export/csv` | POST | Password-protected CSV export (parliament/dun/dm levels) |
| `/api/export/dm-xlsx` | POST | All 945 DMs sorted (password-protected) |
| `/api/export/comparison` | POST | Comparison seats CSV (password-protected) |
| `/api/export/dm-voters/[dm_code]` | POST | Individual voters per DM from R2 (password-protected) |
| `/api/geocode` | POST | Geocode cache → Google → Nominatim |
| `/api/geocode/status` | GET | Geocoding stats |
| `/api/insights` | POST | AI-powered insights via CF AI Workers (Llama 3.3 70B) |
| `/api/r2/[...path]` | GET | R2 object proxy for slgrvtrs-tiles |
| `/api/settings/password` | GET/PUT | Check/set export password hash |
| `/` | GET | Main dashboard page |

All export endpoints use the same password: `PAStimenang1` (PBKDF2, 10K iterations).

## Architecture

- `src/app/page.tsx` — Server Component, renders ErrorBoundary + ToastProvider + MapDashboardClient
- `src/components/map/MapDashboard.tsx` — Main map (all layers, popups, sidebar, filters, toolbar, drawers)
- `src/components/map/MapDashboardClient.tsx` — Client wrapper (dynamic import, ssr:false)
- `src/components/map/Legend.tsx` — Gradient legend with tick marks + Low/High labels
- `src/app/api/dm/route.ts` — GET /api/dm (GeoJSON or JSON, with DUN/Parliament/voter filters)
- `src/app/api/dm/[code]/route.ts` — GET /api/dm/[code] (single DM lookup)
- `src/app/api/dm/search/route.ts` — GET /api/dm/search?q= (name autocomplete)
- `src/app/api/insights/route.ts` — POST /api/insights (CF AI Workers, Llama 3.3 70B)
- `src/app/api/geocode/route.ts` — POST /api/geocode (cache → Google → Nominatim geocoding)
- `src/app/api/geocode/status/route.ts` — GET /api/geocode/status (geocoding stats)
- `src/app/api/r2/[...path]/route.ts` — R2 object proxy for slgrvtrs-tiles bucket
- `src/app/api/settings/password/route.ts` — GET/PUT /api/settings/password
- `src/app/api/export/csv/route.ts` — POST /api/export/csv (password-protected CSV)
- `src/lib/map/setup.ts` — MapLibre worker URL config + named re-exports
- `src/lib/map/join-stats.ts` — Stats JSON → GeoJSON property join
- `src/lib/map/color-scales.ts` — 10 Parliament + 9 DUN color scales + expression builder
- `src/lib/auth/password.ts` — PBKDF2 hash/verify via WebCrypto
- `src/lib/csv/builder.ts` — CSV string builder with RFC 4180 escaping

### Feature Components

| Component | Description |
|-----------|-------------|
| `AnalyticsDrawer.tsx` | Statewide charts (donuts, bar charts, KPI cards) |
| `AiInsightsPanel.tsx` | LLM insights drawer (calls /api/insights) |
| `RankingTable.tsx` | Sortable Parliament/DUN ranking with fly-to |
| `BookmarksMenu.tsx` | localStorage-backed seat bookmarks |
| `ComparisonRadar.tsx` | 6-axis radar chart with state-average overlay |
| `ComparisonBarChart.tsx` | Grouped race composition bars |
| `ShareButton.tsx` | URL hash encoding + clipboard copy |
| `ThemeToggle.tsx` | Light/Dark UI + Light/Dark/Satellite basemap |
| `KeyboardShortcuts.tsx` | Shortcuts overlay (? button) |
| `OnboardingTour.tsx` | 4-step first-visit tour |
| `DataTableView.tsx` | Full-screen sortable table + CSV export |
| `Toast.tsx` | ToastProvider + useToast hook |
| `ExportPanel.tsx` | Export level selector + password modal |
| `PasswordDialog.tsx` | Password entry modal |
| `SettingsGear.tsx` | Password management popover |
| `ErrorBoundary.tsx` | React error boundary with retry |

## Cloudflare Bindings

| Binding | Type | Resource |
|---------|------|----------|
| `env.DB` | D1 Database | `slgrvtrs-voters` |
| `env.TILES` | R2 Bucket | `slgrvtrs-tiles` |
| `env.AI` | Workers AI | Llama 3.3 70B inference |
| `env.ASSETS` | Assets | Static file serving |

## Data Provenance

See [`docs/provenance.md`](../docs/provenance.md) for full provenance and disclaimers.
