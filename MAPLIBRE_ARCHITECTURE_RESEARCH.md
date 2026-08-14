# MapLibre 4-Layer Architecture — Technical Research Report

**Project**: Selangor Voter Registry Interactive Map Dashboard (SLGRVTRS)
**Date**: 14 August 2026 (updated)
**Scope**: Deep technical research for implementing the 4-layer MapLibre architecture — data sizing, rendering performance, interaction patterns, library versions, and integration with Next.js 16
**Data**: 3,971,650 voters | 22 Parliaments | 56 DUNs | 945 DMs

---

## Executive Summary

This document provides the engineering research behind the 4-layer MapLibre dashboard architecture. It covers every technical dimension needed to scaffold the project: MapLibre GL JS version selection (v6 vs v5), Next.js 16 App Router integration patterns, per-layer data sizing and rendering characteristics, choropleth styling with expressions, `feature-state` hover/selection, DM centroid generation, and the vector tile pipeline required for the future 3.97M-point Layer 4.

**Key findings:**

- MapLibre GL JS **v6.3.0** is the latest stable release (July 2026) — ESM-only, WebGL2-only, ~130 KB gzipped, with 3.4x faster feature-state. Use v6 for this greenfield project.
- Next.js 16 + React 19: use **`next/dynamic` with `ssr: false`** for the map component. **Do NOT use `react-map-gl`** — it has known React 19/Turbopack compatibility bugs. Use the imperative MapLibre API directly.
- Layers 1-3 (22 + 56 polygons + 945 points) total **~17,286 vertices and under 5 MB of GeoJSON** — trivially small for MapLibre. No vector tiles needed. All data loads from `/public` as static GeoJSON.
- Layer 4 (3.97M points) **requires vector tiles** — tippecanoe → PMTiles → S3/CloudFront. Expected tileset size: 100-300 MB. GeoJSON would be 800 MB+ and is not viable.
- **945 DM centroids** must be generated from voter data since no DM boundary polygons exist. Strategy: compute from voter DM_CODE grouping (no GPS available in current data), place within parent DUN polygon using Turf.js grid-in-polygon.
- **DUN boundaries**: ElectionData.MY now provides both Parliament and DUN boundary files from the 2018 delimitation. The ElectionData DUN file (`electiondata_2018_dun.geojson`) contains 445 Peninsular features, 56 in Selangor, with 8,600 vertices (avg 154 per DUN, ~2x more detail than DOSM). It uses `Polygon` geometry (not `MultiPolygon`) and includes `code_parlimen` for direct parent mapping.

---

## 1. MapLibre GL JS — Version Decision

### 1.1 Version Landscape (August 2026)

| Version | Status | Release | Key Changes |
|:--------|:------:|:-------:|-------------|
| **v6.3.0** | Latest stable | Aug 2026 | ESM-only, WebGL2-only, 3.4x faster feature-state |
| v6.0.0 | Major release | Jul 22, 2026 | Breaking: dropped WebGL1, dropped UMD, ES2022 target |
| v5.24.0 | Last v5.x | Apr 2026 | Stable, backward-compatible |
| v4.7.1 | Legacy | 2024 | Widely deployed, UMD available |

### 1.2 Decision: Use v6.3.0

This is a **greenfield project** with no legacy browser requirement. All modern browsers support WebGL2 (Chrome 56+, Firefox 51+, Safari 15+). The benefits of v6 justify targeting it directly:

| Benefit | Detail |
|---------|--------|
| **3.4x faster `feature-state`** | Internal data structure optimization — critical for hover/selection on 78 boundary features |
| **Unified layer opacity** | New `fill-layer-opacity` and `line-layer-opacity` paint properties reduce rendering artifacts with transparent overlapping polygons |
| **ESM-native** | Aligns perfectly with Next.js 16 App Router (ESM-first). No UMD wrapper overhead. |
| **Smaller bundle** | Removal of WebGL1 fallback code reduces bundle size |
| **Memory leak fixes** | Worker request abort, flyTo smoothness, drag jumpiness all fixed in v6 |
| **MLT tile format** | New binary tile spec supporting up to 2^31-1 features per tile — future-proof for Layer 4 |

### 1.3 Breaking Changes to Be Aware Of

1. **No UMD build** — only `maplibre-gl.mjs`. Import as: `import { Map, Popup } from 'maplibre-gl'`
2. **`map.transform` removed** — use the public `Camera` API (`map.getCenter()`, `map.setCenter()`, etc.)
3. **`GeoJSONSource.setData()` no longer returns `this`** — no chaining
4. **TypeScript target ES2022** — ensure `tsconfig.json` targets ES2022+
5. **Custom shaders** must use `#pragma maplibre` instead of `#pragma mapbox`
6. **Nested object property encoding changed** — test any property access expressions carefully

### 1.4 Package Structure

```
maplibre-gl/
├── dist/
│   ├── maplibre-gl.mjs          # ESM main bundle (only build in v6+)
│   ├── maplibre-gl.css           # Required stylesheet (~5 KB)
│   └── maplibre-gl-worker.mjs    # Web Worker (separate thread for data parsing)
└── package.json                  # "type": "module"
```

### 1.5 Bundle Size Impact

| Metric | Approximate Size |
|--------|-----------------|
| MapLibre GL JS minified | ~420 KB |
| MapLibre GL JS gzipped | ~130-145 KB |
| maplibre-gl.css gzipped | ~2 KB |
| Worker (loaded separately) | ~80 KB gzipped |

The map library loads via `next/dynamic({ ssr: false })`, so it **does not block** the initial SSR/HTML render. The 145 KB gzipped chunk loads after hydration.

### 1.6 Worker URL Configuration

When bundling with Next.js 16 (Turbopack or Webpack), the web worker may need an explicit URL:

```typescript
// lib/map/setup.ts
import { Map, Popup, NavigationControl, AttributionControl, setWorkerUrl } from 'maplibre-gl';

export { Map, Popup, NavigationControl, AttributionControl, setWorkerUrl };

let initialized = false;

export function initMapLibre() {
  if (initialized) return;
  initialized = true;
  setWorkerUrl('/maplibre-gl-worker.mjs');
}
```

> **Note**: The actual project uses a centralized setup module at `src/lib/map/setup.ts` that re-exports all MapLibre types and configures the worker URL. All components import from this module — never directly from `maplibre-gl`.

---

## 2. Next.js 16 Integration

### 2.1 Why NOT react-map-gl

The `react-map-gl` library (v7.x) has a **known open bug** with React 19 + Next.js 16 + Turbopack. The imperative MapLibre GL JS API is more reliable and gives full control over source/layer lifecycle — which matters for the 4-layer architecture with zoom-dependent visibility.

### 2.2 Correct Pattern: `next/dynamic` + `ssr: false`

MapLibre requires `window`, `WebGL2`, and `document` — none of which exist during SSR. The App Router makes all components Server Components by default. The map must be explicitly loaded client-side only.

**Implemented** (`dashboard/src/app/page.tsx`):

```tsx
// app/page.tsx — Client Component (uses 'use client' directive)
import dynamic from 'next/dynamic';

const MapDashboard = dynamic(() => import('@/components/map/MapDashboard'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-slate-100">
      <div className="animate-spin h-7 w-7 border-3 border-emerald-500 border-t-transparent rounded-full" />
      <span className="ml-3 text-sm text-slate-500">
        Loading Selangor Voter Map…
      </span>
    </div>
  ),
});

export default function Home() {
  return <MapDashboard />;
}
```

> **Implementation note**: The current code uses `'use client'` on `page.tsx` instead of keeping it as a Server Component and delegating client-side rendering to `MapDashboard.tsx`. This works but is slightly less optimal — a future refactor should move the `'use client'` directive to `MapDashboard.tsx` only and keep `page.tsx` as a Server Component.

```tsx
// components/map/MapDashboard.tsx — Client Component
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Map, Popup, NavigationControl, AttributionControl } from '@/lib/map/setup';
import 'maplibre-gl/dist/maplibre-gl.css';
import { initMapLibre } from '@/lib/map/setup';
import { joinStatsToGeoJSON, type StatsMap } from '@/lib/map/join-stats';
import { buildColorExpression, getScaleById, COLOR_SCALES } from '@/lib/map/color-scales';

export default function MapDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const hoveredIdRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState('total_voters');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Keep a ref to activeMetric so the map callback always reads the latest
  const activeMetricRef = useRef(activeMetric);
  useEffect(() => { activeMetricRef.current = activeMetric; }, [activeMetric]);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    let cancelled = false;

    async function bootstrap() {
      try {
        initMapLibre(); // Configure worker URL BEFORE creating Map

        const [geoRes, statsRes] = await Promise.all([
          fetch('/boundaries/selangor_parliament.geojson'),
          fetch('/stats/parliament.json'),
        ]);
        if (cancelled) return;

        const geojson = await geoRes.json();
        const stats: StatsMap = await statsRes.json();
        const joined = joinStatsToGeoJSON(geojson, stats);
        if (cancelled) return;

        const map = new Map({
          container: containerRef.current!,
          style: {
            version: 8, name: 'SLGRVTRS Blank',
            sources: {},
            layers: [{ id: 'background', type: 'background',
              paint: { 'background-color': '#f0f4f8' } }],
            glyphs: 'https://basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
          },
          center: [101.5, 3.1] as [number, number],
          zoom: 8.5, minZoom: 7, maxZoom: 18,
          attributionControl: false,
        });

        map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
        map.addControl(new NavigationControl(), 'top-right');

        map.on('load', () => { /* add sources, layers, interactions */ });
        mapRef.current = map;
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed to load map data'); setLoading(false); }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-screen flex overflow-hidden bg-slate-100">
      {/* Sidebar + Map container */}
    </div>
  );
}
```

> **IMPORTANT**: MapLibre v6 is ESM-only. Use **named imports** (`import { Map } from 'maplibre-gl'`), NOT the default import (`import maplibregl from 'maplibre-gl'`). The default import silently resolves to `undefined` in ESM mode — the `new Map()` call will throw with no useful error message. The project's `setup.ts` module handles this by re-exporting named exports.

### 2.3 React 19 `useRef` + StrictMode

React 19 StrictMode (development) double-mounts components. The pattern above handles this:

1. `if (mapRef.current) return;` — prevents double initialization
2. Cleanup function calls `mapRef.current?.remove()` — destroys the first instance
3. The second mount creates a fresh map instance

> **Implementation note**: The current `next.config.ts` sets `reactStrictMode: false` to avoid the double-mount issue during development. This is a pragmatic choice — the cleanup pattern in `MapDashboard.tsx` handles StrictMode correctly, but disabling it eliminates unnecessary map create/destroy cycles during HMR.

### 2.4 Loading GeoJSON Data

For Layers 1-3, the boundary GeoJSON files are small enough to fetch from `/public`:

| Layer | File | Estimated Selangor-only size | Load method |
|:-----:|------|:---------------------------:|:-----------:|
| L1 Parliament | `selangor_parliament.geojson` | ~182 KB (22 features, 4,386 vertices) | `fetch('/boundaries/...')` |
| L2 DUN | `selangor_dun.geojson` | ~200-300 KB (56 features, 8,600 vertices) | `fetch('/boundaries/...')` |
| L3 DM centroids | `dm_centroids.geojson` | ~80-120 KB (945 point features) | `fetch('/boundaries/...')` |
| State outline | `selangor_outline.geojson` | ~20 KB (1 feature, ~200 vertices) | `fetch('/boundaries/...')` |

**Total: ~480-620 KB** of GeoJSON — well within MapLibre's 10-50 MB recommended limit for URL-sourced GeoJSON.

```typescript
// Load all boundary data in parallel (Phase 2)
async function loadBoundaryData() {
  const [parliament, dun, outline, dmCentroids] = await Promise.all([
    fetch('/boundaries/selangor_parliament.geojson').then(r => r.json()),
    fetch('/boundaries/selangor_dun.geojson').then(r => r.json()),
    fetch('/boundaries/selangor_outline.geojson').then(r => r.json()),
    fetch('/boundaries/dm_centroids.geojson').then(r => r.json()),
  ]);
  return { parliament, dun, outline, dmCentroids };
}
```

For stats data (pre-computed JSON from Python aggregation):

```typescript
async function loadStats() {
  const [parlStats, dunStats, dmStats] = await Promise.all([
    fetch('/stats/parliament.json').then(r => r.json()),
    fetch('/stats/dun.json').then(r => r.json()),
    fetch('/stats/dm.json').then(r => r.json()),
  ]);
  return { parlStats, dunStats, dmStats };
}
```

### 2.5 Worker Setup (MapLibre v6 + Turbopack) — CRITICAL PITFALL

**This is the #1 cause of a blank-white map canvas with zero console errors.** Documented here so you don't lose hours debugging it.

#### The Problem

MapLibre v6's web worker (`maplibre-gl-worker.mjs`) is an **ES module** that imports from a sibling shared module:

```js
// maplibre-gl-worker.mjs (line 5)
import { An, Bt, C, ... } from "./maplibre-gl-shared.mjs";
```

In a Next.js 16 / Turbopack environment, three approaches to set the worker URL all fail:

| Approach | What happens | Symptom |
|----------|-------------|----------|
| `new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href` | Turbopack resolves the worker URL to a hashed `_next/static/media/...` path, but the **sibling `./maplibre-gl-shared.mjs` import** resolves relative to the hashed URL and 404s. | Blank canvas, zero errors. |
| `setWorkerUrl('/maplibre-gl-worker.mjs')` (copy worker only to `public/`) | The worker loads from `public/`, but its `import "./maplibre-gl-shared.mjs"` resolves to `/maplibre-gl-shared.mjs` which doesn't exist in `public/`. Worker crashes on the import. | Blank canvas, zero errors. |
| No `setWorkerUrl` call (auto-detect) | MapLibre's auto-detect checks `import.meta.url` — in a Turbopack bundle this doesn't start with `https?:`, so it returns empty string. Worker never loads. | Blank canvas, zero errors. |

**Key insight**: The worker loads and begins executing, but the ESM import failure is **swallowed** — no error appears in the browser console. The map's `load` event still fires, but the worker can't process any GeoJSON data, so all sources render as empty.

#### The Fix (Verified Working — implemented in project)

Copy **both** files to `public/` and rewrite the worker's import to use an absolute path:

```bash
# Run once during project setup
 cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs public/
 cp node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs public/

# Rewrite the relative import to absolute
 sed -i 's|from"./maplibre-gl-shared\.mjs"|from"/maplibre-gl-shared.mjs"|' \
   public/maplibre-gl-worker.mjs
```

Then in your setup module:

```typescript
// lib/map/setup.ts
import { Map, Popup, NavigationControl, AttributionControl, setWorkerUrl } from 'maplibre-gl';

export { Map, Popup, NavigationControl, AttributionControl, setWorkerUrl };

let initialized = false;

/**
 * Configure the MapLibre web worker URL.
 *
 * MapLibre v6's worker is ESM and imports from a sibling shared module.
 * We place both files in public/ with corrected import paths so the
 * worker can load as a module worker without bundler URL resolution issues.
 */
export function initMapLibre() {
  if (initialized) return;
  initialized = true;
  setWorkerUrl('/maplibre-gl-worker.mjs');
}
```

Call `initMapLibre()` **before** creating any `new Map()` instance.

#### Alternative: Blob URL with Fetch (works without public/ files)

If you prefer not to add files to `public/`, you can fetch both modules at runtime, rewrite the import, and create a blob URL:

```typescript
export async function initMapLibre(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const workerUrl = new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href;
  const sharedUrl = new URL('maplibre-gl/dist/maplibre-gl-shared.mjs', import.meta.url).href;

  const [workerRes, sharedRes] = await Promise.all([fetch(workerUrl), fetch(sharedUrl)]);
  let workerCode = await workerRes.text();
  workerCode = workerCode.replace(/from\s*"\.\/maplibre-gl-shared\.mjs"/, `from "${sharedUrl}"`);

  const blob = new Blob([workerCode], { type: 'text/javascript' });
  setWorkerUrl(URL.createObjectURL(blob));
}
```

This is more elegant but adds ~200ms of startup latency (two extra fetches).

#### Diagnostic Checklist

If the map canvas is blank but the sidebar/controls render:

1. Open DevTools → Network tab → filter for `worker` or `shared`
2. Check if `maplibre-gl-worker.mjs` loaded (status 200)
3. Check if `maplibre-gl-shared.mjs` loaded (status 200) — **this is the one that usually 404s**
4. Open Console → look for `Uncaught SyntaxError: Cannot use import statement outside a module` — this confirms the worker loaded but couldn't resolve its ESM import
5. Verify the worker was created with `{ type: 'module' }` — MapLibre v6 does this automatically for `.mjs` URLs

#### Additional Pitfall: `promoteId` vs Top-Level `id`

When using `setFeatureState()` for hover/selection, the feature must have a numeric ID. There are **two ways** to provide it, and they conflict:

| Method | How it works | Gotcha |
|--------|-------------|--------|
| GeoJSON top-level `id` | `feature.id = 1` — standard GeoJSON spec field. MapLibre recognizes it automatically. | If you also set `promoteId`, it **overrides** the top-level ID. |
| `promoteId` option | `map.addSource({ promoteId: 'my_field' })` — looks inside `feature.properties.my_field`. | If `my_field` doesn't exist in properties, the ID becomes `undefined`, breaking `setFeatureState` with: "The feature id parameter must be provided." |

**Rule**: If your GeoJSON preprocessing sets `f['id'] = i + 1` (top-level), do **NOT** set `promoteId` on the source. If you store the ID in properties instead, then you must use `promoteId` and ensure the property exists.

---

## 3. Layer 1: Parliament Boundaries (22 Polygons) — IMPLEMENTED

### 3.1 Data Specifications

| Property | Value |
|----------|--------|
| **Source file** | `electiondata_2018_parlimen.geojson` (filtered to Selangor) |
| **Data provider** | ElectionData.MY (derived from SPR 2018 delimitation) |
| **Features (Selangor)** | 22 polygons |
| **Geometry type** | `Polygon` (single-part, not MultiPolygon) |
| **Total vertices** | 4,386 (avg 199 per polygon) |
| **Properties** | `state`, `parlimen`, `code_parlimen` (e.g. `"P.102"`), `voter_prefix` |
| **CRS** | CRS84 (WGS84, EPSG:4326) |
| **File size (Selangor-only)** | **182 KB** (minified) |
| **Render cost** | Negligible — 22 polygons is trivial for WebGL |

> **Updated**: The actual processed file is 182 KB (not the originally estimated 300-400 KB). This is because the ElectionData Parliament GeoJSON was filtered to Selangor-only and saved minified.

### 3.2 Preprocessing Required (Done)

The source file contains 166 Peninsular features. Filter to Selangor 22 + add join properties:

```python
# scripts/filter_parliament.py
import json

with open('boundaries/research/electiondata_2018_parlimen.geojson') as f:
    data = json.load(f)

sel = [f for f in data['features'] if f['properties']['state'] == 'Selangor']

# Add voter-code-compatible ID for data-join
for i, f in enumerate(sel):
    code = f['properties']['code_parlimen']  # "P.102"
    f['properties']['voter_prefix'] = code.replace('P.', '')  # "102" (preserves zero-pad)
    f['id'] = i + 1  # Integer ID for feature-state (top-level, NOT in properties)

result = {
    "type": "FeatureCollection",
    "metadata": {
        "title": "Selangor Parliamentary Constituency Boundaries (2018 Delimitation)",
        "authority": "Suruhanjaya Pilihan Raya (SPR)",
        "derived_from": "SPR 2018 Peninsular Malaysia delimitation",
        "data_provider": "ElectionData.MY",
        "source_url": "https://electiondata.my/data-catalogue/peninsular-2018-parlimen/",
        "license": "Open data (see ElectionData.MY terms)",
        "notes": "Derived open dataset; not the legal instrument."
    },
    "features": sel
}

with open('dashboard/public/boundaries/selangor_parliament.geojson', 'w') as f:
    json.dump(result, f)  # minified (no indent)

print(f"Wrote {len(sel)} Parliament features")
```

### 3.3 MapLibre Source & Layer Configuration (Implemented)

```typescript
// Add source
map.addSource('parliament', {
  type: 'geojson',
  data: joined, // GeoJSON after joinStatsToGeoJSON()
  // NOTE: Do NOT set promoteId here. Our GeoJSON uses standard
  // top-level feature.id (f.id = 1..22). promoteId looks inside
  // f.properties, which would override the valid top-level ID
  // with undefined, breaking setFeatureState. (See §2.5.)
});

// Fill layer (choropleth) — color driven by active metric
const scale = getScaleById(activeMetric);
const colorExpr = buildColorExpression(scale.property, scale.stops);

map.addLayer({
  id: 'parliament-fill',
  type: 'fill',
  source: 'parliament',
  // maxzoom: 9 — set in Phase 2 when DUN layer is added
  paint: {
    'fill-color': colorExpr, // ['interpolate', ['linear'], ['get', 'total_voters'], ...]
    'fill-opacity': [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      0.92,  // Brighter on hover
      0.72,  // Default
    ],
  },
});

// Border layer
map.addLayer({
  id: 'parliament-border',
  type: 'line',
  source: 'parliament',
  paint: {
    'line-color': '#1e293b',
    'line-width': [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      2.5,  // Thicker on hover
      1,    // Default
    ],
    'line-opacity': 0.8,
  },
});

// Label layer
map.addLayer({
  id: 'parliament-label',
  type: 'symbol',
  source: 'parliament',
  layout: {
    'text-field': ['get', 'code_parlimen'],
    'text-size': 12,
    'text-font': ['Open Sans Regular'],
    'text-anchor': 'center',
    'text-allow-overlap': false,
    'text-ignore-placement': false,
  },
  paint: {
    'text-color': '#0f172a',
    'text-halo-color': 'rgba(255,255,255,0.85)',
    'text-halo-width': 1.5,
  },
});
```

### 3.4 Interaction: Click Popup with Stats (Implemented)

```typescript
const popup = new Popup({
  closeButton: true,
  closeOnClick: false,
  anchor: 'top',
  maxWidth: '340px',
  offset: 10,
  className: 'parliament-popup',
});

map.on('click', 'parliament-fill', (e) => {
  if (!e.features?.length) return;
  const props = e.features[0].properties as unknown as PopupData;
  popup.setLngLat(e.lngLat).setHTML(buildPopupHTML(props)).addTo(map);
});
```

The popup displays: total voters, male/female counts and percentages, Malay/Chinese/Indian/Other percentages, mean/median age, contact %, and DUN count. HTML is built by a standalone `buildPopupHTML()` function using inline styles (since MapLibre popups are outside React's DOM).

### 3.5 Hover Highlight via `feature-state` (Implemented)

```typescript
let hoveredIdRef = useRef<number | null>(null);

map.on('mousemove', 'parliament-fill', (e) => {
  if (!e.features?.length) return;
  const fid = e.features[0].id as number;
  if (hoveredIdRef.current !== null && hoveredIdRef.current !== fid) {
    map.setFeatureState(
      { source: 'parliament', id: hoveredIdRef.current },
      { hover: false },
    );
  }
  hoveredIdRef.current = fid;
  map.setFeatureState(
    { source: 'parliament', id: fid },
    { hover: true },
  );
  map.getCanvas().style.cursor = 'pointer';
});

map.on('mouseleave', 'parliament-fill', () => {
  if (hoveredIdRef.current !== null) {
    map.setFeatureState(
      { source: 'parliament', id: hoveredIdRef.current },
      { hover: false },
    );
    hoveredIdRef.current = null;
  }
  map.getCanvas().style.cursor = '';
});
```

### 3.6 Sidebar with Metric Selector (Implemented)

The sidebar includes a `<select>` dropdown that triggers choropleth repaint:

```typescript
// When user changes metric
const updateMetric = useCallback((metricId: string) => {
  const map = mapRef.current;
  if (!map) return;
  const scale = getScaleById(metricId);
  const colorExpr = buildColorExpression(scale.property, scale.stops);
  map.setPaintProperty('parliament-fill', 'fill-color', colorExpr);
}, []);

useEffect(() => { updateMetric(activeMetric); }, [activeMetric, updateMetric]);
```

Seven metrics are available: Total Voters (YlGnBu), Malay % (YlOrRd), Chinese % (Oranges), Indian % (Greens), Mean Age (Viridis), Contact % (PuBu), Female % (PiYG).

---

## 4. Layer 2: DUN Boundaries (56 Polygons)

### 4.1 Data Specifications

| Property | Value |
|----------|--------|
| **Source file** | `electiondata_2018_dun.geojson` (filtered to Selangor) |
| **Data provider** | ElectionData.MY (derived from SPR 2018 delimitation) |
| **Features (Selangor)** | 56 polygons |
| **Geometry type** | `Polygon` (single-part, not MultiPolygon) |
| **Total vertices** | 8,600 (avg 154 per polygon) |
| **Properties** | `state`, `parlimen`, `code_parlimen`, `dun`, `code_dun` |
| **Sample** | `{"dun":"N.01 Sungai Air Tawar", "code_dun":"N.01", "code_parlimen":"P.092"}` |
| **CRS** | CRS84 (WGS84) |
| **Full file size** | 2,303 KB (445 Peninsular features) |
| **Est. Selangor-only size** | ~200-300 KB |
| **Parent mapping** | Each DUN includes `code_parlimen` enabling Parliament → DUN hierarchy |

> **UPDATED**: The DUN source has been changed from **DOSM KawasanKu** to **ElectionData.MY**. The ElectionData DUN file provides 2x more vertex detail (8,600 vs ~4,219 vertices) and uses cleaner `Polygon` geometry instead of `MultiPolygon`. It also provides consistent property naming (`code_dun`, `code_parlimen`) that aligns with the Parliament file from the same provider. The DOSM file remains available as a backup at `boundaries/research/dosm_dun.json` and `boundaries/research/corrected/dosm_dun_new.json`.

### 4.2 Why ElectionData.MY over DOSM for DUN

| Criterion | ElectionData.MY | DOSM KawasanKu |
|-----------|:--------------:|:--------------:|
| Selangor match | 56/56 (100%) | 56/56 (100%) |
| Geometry type | `Polygon` | `MultiPolygon` |
| Vertex count | 8,600 (154 avg) | ~4,219 (75 avg) |
| Detail level | Higher (2x) | Lower |
| Property schema | `code_dun`, `code_parlimen` | `code_dun`, `code_parlimen`, `code_state_dun` |
| Consistency with L1 | Same provider as Parliament | Different provider |
| Delimitation year | Explicitly 2018 | Unclear (likely 2018) |

The ElectionData source wins on: higher geometric detail, consistent provider across L1 and L2, simpler geometry type, and explicit 2018 delimitation labeling.

### 4.3 Preprocessing Required

```python
# scripts/filter_dun.py
import json

with open('boundaries/research/electiondata_2018_dun.geojson') as f:
    data = json.load(f)

sel = [f for f in data['features'] if f['properties']['state'] == 'Selangor']

for i, f in enumerate(sel):
    f['properties']['voter_prefix'] = f['properties']['code_dun'].replace('N.', '')
    f['properties']['parent_parl'] = f['properties']['code_parlimen']  # "P.102"
    f['id'] = i + 1  # Integer ID for feature-state (top-level, NOT in properties)

result = {
    "type": "FeatureCollection",
    "metadata": {
        "title": "Selangor DUN Constituency Boundaries (2018 Delimitation)",
        "authority": "Suruhanjaya Pilihan Raya (SPR)",
        "derived_from": "SPR 2018 Peninsular Malaysia delimitation",
        "data_provider": "ElectionData.MY",
        "source_url": "https://electiondata.my",
        "license": "Open data (see ElectionData.MY terms)",
        "notes": "Derived open dataset; not the legal instrument."
    },
    "features": sel
}

with open('dashboard/public/boundaries/selangor_dun.geojson', 'w') as f:
    json.dump(result, f)

print(f"Wrote {len(sel)} DUN features")
```

### 4.4 Zoom-Based Visibility Strategy

The core UX pattern is **Parliament at low zoom, DUN at higher zoom**:

| Zoom Range | Visible Layers | Rationale |
|:----------:|:--------------:|-----------|
| 7.0 – 8.5 | Parliament fill + border + label | State-level overview, compare 22 seats |
| 8.5 – 10.0 | Parliament border (outline only) + DUN fill + label | Transition: Parliament fades, DUN emerges |
| 10.0 – 18.0 | DUN fill + border + label + DM centroids | DUN-level exploration |
| 14.0+ | DUN + DM centroids + voter points (future) | Individual voter exploration |

```typescript
// Parliament: full at low zoom, outline only at medium zoom
// parliament-fill: maxzoom: 9 (add when DUN layer is implemented)
// parliament-border: no maxzoom (always visible as outline)
// parliament-label: maxzoom: 9

// DUN: hidden at low zoom, full at medium+ zoom
map.addLayer({
  id: 'dun-fill',
  type: 'fill',
  source: 'dun',
  minzoom: 8,  // Only appears when zoomed past state level
  paint: {
    'fill-color': [
      'interpolate',
      ['linear'],
      ['get', 'total_voters'],
      2000,   '#ffffcc',
      5000,   '#a1dab4',
      10000,  '#41b6c4',
      20000,  '#2c7fb8',
      40000,  '#253494',
    ],
    'fill-opacity': [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      0.85,
      0.65,
    ],
  },
});
```

### 4.5 Parliament → DUN Drill-Down

When a user clicks a Parliament polygon, fly to its extent and show DUNs:

```typescript
map.on('click', 'parliament-fill', (e) => {
  if (!e.features?.length) return;
  const props = e.features[0].properties;
  const voterPrefix = props.voter_prefix; // e.g. "102"

  // Filter DUN layer to show only this Parliament's DUNs
  map.setFilter('dun-fill', ['==', ['get', 'parent_parl'], props.code_parlimen]);
  map.setFilter('dun-border', ['==', ['get', 'parent_parl'], props.code_parlimen]);
  map.setFilter('dun-label', ['==', ['get', 'parent_parl'], props.code_parlimen]);

  // Fly to the Parliament's bounding box
  const bounds = new maplibregl.LngLatBounds();
  // ... compute bounds from geometry ...
  map.fitBounds(bounds, { padding: 50, duration: 1000 });
});

// Reset filter when zooming back out
map.on('zoomend', () => {
  if (map.getZoom() < 8.5) {
    map.setFilter('dun-fill', null);  // Show all DUNs
    map.setFilter('dun-border', null);
    map.setFilter('dun-label', null);
  }
});
```

> **Note**: The drill-down filter uses `parent_parl` (the `code_parlimen` value like `"P.102"`) rather than `voter_prefix` for clearer semantics.

### 4.6 DUN → Demographics Popup

Same pattern as Parliament popup but with richer demographics:

```typescript
map.on('click', 'dun-fill', (e) => {
  if (!e.features?.length) return;
  const props = e.features[0].properties;

  popup.setLngLat(e.lngLat).setHTML(`
    <div class="p-3">
      <h3 class="font-bold text-base">${props.code_dun} — ${props.dun.replace('N.\\d+ ', '')}</h3>
      <p class="text-xs text-gray-500">${props.parent_parl} | ${props.dm_count} DMs</p>
      <hr class="my-2">
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div><strong>Voters:</strong><br>${Number(props.total_voters).toLocaleString()}</div>
        <div><strong>Age:</strong><br>Mean ${props.age_mean} / Med ${props.age_median}</div>
        <div><strong>Male:</strong><br>${props.male_pct}% (${Number(props.male).toLocaleString()})</div>
        <div><strong>Female:</strong><br>${props.female_pct}% (${Number(props.female).toLocaleString()})</div>
      </div>
      <hr class="my-2">
      <p class="text-xs">
        <strong>Race:</strong> M ${props.malay_pct}% | C ${props.chinese_pct}% | I ${props.indian_pct}% | B+TBC ${props.other_pct}%
      </p>
      <p class="text-xs mt-1">
        <strong>Contact:</strong> ${props.contact_pct}%
      </p>
    </div>
  `).addTo(map);
});
```

---

## 5. Layer 3: DM Centroids / Bubbles (945 Points)

### 5.1 The DM Data Challenge

DMs (Daerah Mengundi / Voting Districts) are the finest electoral geography in the voter data. However:

- **No DM boundary polygons exist** in any of the 4 boundary sources tested (ElectionData, DOSM, JAKIM, geoBoundaries)
- **GPS_COORDINATE is 0.00% available** across all 3,971,650 voter records (binary YES/NA flag, not actual coordinates)
- **945 unique DMs** exist across Selangor (range: 9-26 per DUN, mean 16.9)

This means DMs must be represented as **proportional bubbles at approximate centroid positions**, not as boundary polygons.

### 5.2 DM Centroid Generation Strategy

Since no GPS data exists, centroids must be **generated algorithmically** within parent DUN polygons. Three strategies ranked by accuracy:

#### Strategy A: Turf.js Grid-in-Polygon (Recommended)

```typescript
// Preprocessing (run once, output to dm_centroids.geojson)
import * as turf from '@turf/turf';

function generateDMCentroids(
  dunGeoJSON: GeoJSON.FeatureCollection,
  dmStats: DMStatsRecord[]
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const dunFeature of dunGeoJSON.features) {
    const dunCode = dunFeature.properties!.code_dun; // "N.01"
    const dmsInDun = dmStats.filter(dm => dm.parent_dun === dunCode);

    if (dmsInDun.length === 0) continue;

    // Generate a grid of candidate points within the DUN polygon
    const bbox = turf.bbox(dunFeature);
    const grid = turf.pointGrid(bbox, 0.005, { units: 'degrees' }); // ~500m spacing

    // Filter to points inside the DUN polygon
    const insidePoints = grid.features.filter(pt =>
      turf.booleanPointInPolygon(pt, dunFeature)
    );

    if (insidePoints.length === 0) {
      // Fallback: use DUN centroid
      features.push({
        type: 'Feature',
        geometry: turf.centroid(dunFeature).geometry,
        properties: { ...dmsInDun[0], approx: true },
      });
      continue;
    }

    // Evenly distribute DMs across available grid points
    const step = Math.max(1, Math.floor(insidePoints.length / dmsInDun.length));
    dmsInDun.forEach((dm, i) => {
      const pointIndex = Math.min(i * step, insidePoints.length - 1);
      const point = insidePoints[pointIndex];
      features.push({
        type: 'Feature',
        geometry: point.geometry,
        properties: {
          dm_code: dm.code,
          dm_name: dm.name,
          voter_count: dm.total_voters,
          parent_dun: dunCode,
          parent_parl: dunFeature.properties!.code_parlimen,
        },
      });
    });
  }

  return { type: 'FeatureCollection', features };
}
```

#### Strategy B: Radial Distribution from DUN Centroid

```typescript
// Simpler but less spatially accurate
const dunCentroid = turf.centroid(dunFeature);
dmsInDun.forEach((dm, i) => {
  const angle = (2 * Math.PI * i) / dmsInDun.length;
  const offset = 0.008; // ~800m radius
  const point = turf.destination(dunCentroid, offset, angle * (180 / Math.PI), {
    units: 'kilometers',
  });
  features.push({
    type: 'Feature',
    geometry: point.geometry,
    properties: { ...dm, approx: true },
  });
});
```

#### Strategy C: Python Preprocessing (Fastest for Batch)

```python
# scripts/generate_dm_centroids.py
import json
import numpy as np
from shapely.geometry import shape, mapping, Point

with open('dashboard/public/boundaries/selangor_dun.geojson') as f:
    dun_data = json.load(f)

with open('dashboard/public/stats/dm.json') as f:
    dm_stats = json.load(f)

features = []
for dun in dun_data['features']:
    poly = shape(dun['geometry'])
    parent_code = dun['properties']['code_dun']  # "N.01"
    dms = [d for d in dm_stats if d['parent_dun'] == parent_code]

    if not dms:
        continue

    # Generate grid points within polygon
    minx, miny, maxx, maxy = poly.bounds
    xs = np.arange(minx, maxx, 0.005)
    ys = np.arange(miny, maxy, 0.005)
    grid = [Point(x, y) for x in xs for y in ys if poly.contains(Point(x, y))]

    if not grid:
        centroid = poly.centroid
        for dm in dms:
            features.append({
                "type": "Feature",
                "geometry": mapping(centroid),
                "properties": {**dm, "approx": True}
            })
        continue

    step = max(1, len(grid) // len(dms))
    for i, dm in enumerate(dms):
        pt = grid[min(i * step, len(grid) - 1)]
        features.append({
            "type": "Feature",
            "geometry": mapping(pt),
            "properties": {
                "dm_code": dm["code"],
                "voter_count": dm["total_voters"],
                "parent_dun": parent_code,
                "parent_parl": dun["properties"]["code_parlimen"],
            }
        })

with open('dashboard/public/boundaries/dm_centroids.geojson', 'w') as f:
    json.dump({"type": "FeatureCollection", "features": features}, f)

print(f"Generated {len(features)} DM centroids")
```

### 5.3 MapLibre Layer Configuration

```typescript
map.addSource('dm-centroids', {
  type: 'geojson',
  data: dmCentroidGeoJSON,
  // No promoteId — use top-level f.id (same as Parliament/DUN)
});

// Bubble layer — radius proportional to sqrt(voter_count)
map.addLayer({
  id: 'dm-bubbles',
  type: 'circle',
  source: 'dm-centroids',
  minzoom: 10,  // Only visible at DUN zoom level
  paint: {
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['sqrt', ['get', 'voter_count']],
      30,   3,    // ~900 voters → 3px radius
      70,   6,    // ~4,900 voters → 6px
      100,  8,    // ~10,000 voters → 8px
      150,  12,   // ~22,500 voters → 12px
      200,  16,   // ~40,000 voters → 16px
    ],
    'circle-color': [
      'interpolate',
      ['linear'],
      ['get', 'voter_count'],
      1000,  '#ffffcc',
      3000,  '#a1dab4',
      6000,  '#41b6c4',
      10000, '#2c7fb8',
      20000, '#253494',
    ],
    'circle-stroke-width': 1,
    'circle-stroke-color': 'rgba(0,0,0,0.2)',
    'circle-opacity': [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      0.9,
      0.7,
    ],
  },
});

// Optional: built-in clustering for DMs at lower zoom within the minzoom range
// (945 points is small enough that clustering is optional but nice)
```

### 5.4 DM Tooltip

```typescript
map.on('mouseenter', 'dm-bubbles', (e) => {
  map.getCanvas().style.cursor = 'pointer';
  const props = e.features[0].properties;
  tooltip.setLngLat(e.lngLat).setHTML(`
    <strong>${props.dm_name}</strong><br>
    ${Number(props.voter_count).toLocaleString()} voters
  `).addTo(map);
});

map.on('mouseleave', 'dm-bubbles', () => {
  map.getCanvas().style.cursor = '';
  tooltip.remove();
});
```

---

## 6. Layer 4 (Future): 3.97M Individual Voter Points

### 6.1 Why Vector Tiles Are Mandatory

| Approach | Feasibility | Reason |
|----------|:-----------:|--------|
| Raw GeoJSON in browser | **Impossible** | ~800 MB - 1.2 GB uncompressed. Browser would OOM. |
| GeoJSON via `fetch()` | **Impossible** | Even gzipped (~200 MB), exceeds MapLibre's 50 MB practical limit |
| Built-in clustering | **Impossible** | Supercluster handles up to ~500K points. 3.97M is 8x beyond. |
| Chunked GeoJSON (2-3 chunks) | **Marginal** | Would need ~8-10 chunks. Complex, slow initial load. |
| **Vector tiles** | **Only viable approach** | Server renders only visible tiles. Client loads ~100-500 KB at a time. |

### 6.2 Recommended Pipeline

```
3.97M voter records (XLSX)
    │ Python: python-calamine + pandas
    ▼
Preprocessing script
  - Extract: VOTER_ID, GENDER, RACE, AGE, DUN_CODE, DM_CODE
  - Convert PARLIAMENT_CODE to numeric prefix
  - If GPS_COORDINATE == YES and actual coords exist: use them
  - If no coords: use parent DM centroid from Layer 3
  - Output: voters.geojson (3.97M Point features)
    │ ~800 MB - 1.2 GB
    ▼
tippecanoe v2.79
  - Input: voters.geojson
  - Output: voters.pmtiles
  - Flags: --drop-densest-as-needed, --maximum-tile-bytes=500000
  - Zoom: -Z 4 -z 16
  - Include: gender, race, age_group as tile properties
    │ ~100-300 MB PMTiles
    ▼
Upload to S3 / Cloudflare R2
    │
    ▼
MapLibre GL JS
  - Source: { type: 'vector', url: 'pmtiles://...' }
  - Layer: type: 'circle', minzoom: 13
  - Properties available for styling and popups
```

### 6.3 Tippecanoe Command

```bash
tippecanoe -o voters.pmtiles \
  voters.geojson \
  -Z 4 -z 16 \
  --drop-densest-as-needed \
  --maximum-tile-bytes=500000 \
  --extended-feature-id \
  --attribute-gender \
  --attribute-race \
  --attribute-age_group \
  --attribute-dun_code \
  --attribute-dm_code \
  -l voters
```

Key flags explained:

| Flag | Purpose |
|------|---------|
| `-Z 4 -z 16` | Generate tiles from zoom 4 (Malaysia-wide) to zoom 16 (street level) |
| `--drop-densest-as-needed` | At low zoom, drop excess points to keep tiles under size limit |
| `--maximum-tile-bytes=500000` | 500 KB per tile max — ensures fast loading |
| `--extended-feature-id` | Preserve feature IDs across zoom levels |
| `--attribute-X` | Include only these properties in tiles (strip the rest to save space) |
| `-l voters` | Layer name inside the tileset (used in `source-layer`) |

### 6.4 PMTiles Serving Architecture

**PMTiles** (Cloud Optimized Map Tiles) is the modern standard for static tile hosting:

- Single file containing the entire tileset + spatial index
- Hostable on **any static file server** (S3, Cloudflare R2, Vercel Blob, etc.)
- No tile server process needed — just serve the file over HTTPS
- MapLibre GL JS has **native PMTiles protocol support** via `addProtocol()`

```typescript
// Register PMTiles protocol
import { PMTiles } from 'pmtiles';

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

// Use in source
map.addSource('voters-vector', {
  type: 'vector',
  url: 'pmtiles://https://tiles.example.com/voters.pmtiles',
});

map.addLayer({
  id: 'voter-points',
  type: 'circle',
  source: 'voters-vector',
  'source-layer': 'voters',
  minzoom: 13,
  paint: {
    'circle-radius': 2.5,
    'circle-color': [
      'match', ['get', 'gender'],
      'M', '#4264fb',
      'F', '#f72585',
      '#888888',
    ],
    'circle-opacity': 0.5,
  },
});
```

### 6.5 Tile Server Alternatives

| Server | Best For | Language | Notes |
|--------|----------|----------|-------|
| **PMTiles on S3/R2** | Static, scalable, zero ops | N/A | Recommended for this project |
| **Martin v1.13** | Dynamic/real-time data | Rust | Can serve GeoJSON directly with R-tree index |
| **tileserver-gl light** | Simple static hosting | Node.js | Supports MBTiles, PMTiles, style.json |
| **pg_tileserv** | Database-backed | Go | Useful if voter data moves to PostGIS |

### 6.6 Expected Tileset Size

| Metric | Estimate |
|--------|----------|
| Raw GeoJSON (3.97M points, 6 properties each) | ~800 MB - 1.2 GB |
| PMTiles (with `--drop-densest-as-needed`) | ~100-300 MB |
| Per-tile size at zoom 14 (urban area) | ~200-500 KB |
| Per-tile size at zoom 10 (state-wide) | ~50-100 KB |
| Typical viewport loads (4-6 tiles) | ~1-3 MB |

### 6.7 Properties in Vector Tiles

Yes, **non-spatial properties are fully preserved** in vector tiles. All included properties (gender, race, age_group, dun_code, dm_code) are available for:

- **Data-driven styling** via expressions: `['match', ['get', 'gender'], ...]`
- **Popups**: `e.features[0].properties.gender`
- **`queryRenderedFeatures`**: filter and query visible points

---

## 7. Data-Join: Merging Stats JSON with GeoJSON

The voter stats (pre-computed from Python aggregation) must be joined to GeoJSON boundary features at runtime.

### 7.1 Pre-join at Build Time (Implemented)

The project implements this as a client-side join in `src/lib/map/join-stats.ts`:

```typescript
// src/lib/map/join-stats.ts
export interface ParliamentStats {
  code_parlimen: string;
  name: string;
  total_voters: number;
  male: number;
  female: number;
  male_pct: number;
  female_pct: number;
  malay_pct: number;
  chinese_pct: number;
  indian_pct: number;
  other_pct: number;
  age_mean: number;
  age_median: number;
  contact_pct: number;
  child_dun_count: number;
}

export type StatsMap = Record<string, ParliamentStats>;

export function joinStatsToGeoJSON(
  geojson: GeoJSON.FeatureCollection,
  stats: StatsMap,
  codeField = 'voter_prefix'
): GeoJSON.FeatureCollection {
  return {
    ...geojson,
    features: geojson.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        ...(stats[String(f.properties?.[codeField])] ?? {}),
      },
    })),
  };
}
```

Usage in `MapDashboard.tsx`:

```typescript
const [geoRes, statsRes] = await Promise.all([
  fetch('/boundaries/selangor_parliament.geojson'),
  fetch('/stats/parliament.json'),
]);
const geojson = await geoRes.json();
const stats: StatsMap = await statsRes.json();
const joined = joinStatsToGeoJSON(geojson, stats);
```

### 7.2 Stats JSON Schema

```typescript
// public/stats/parliament.json — keyed by voter_prefix (3-digit zero-padded)
// Example:
// {
//   "100": { "code_parlimen": "P.100", "name": "PANDAN", "total_voters": 155756, ... },
//   "101": { "code_parlimen": "P.101", "name": "HULU LANGAT", "total_voters": 186297, ... },
//   "102": { "code_parlimen": "P.102", "name": "BANGI", "total_voters": 336552, ... },
//   ...
// }
```

> **CRITICAL**: The keys are 3-digit zero-padded strings (`"100"`, `"101"`, ..., `"113"`). The GeoJSON `voter_prefix` property must use the same format. The `code_parlimen` field (e.g. `