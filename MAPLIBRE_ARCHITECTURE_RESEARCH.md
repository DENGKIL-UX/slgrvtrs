# MapLibre 4-Layer Architecture — Technical Research Report

**Project**: Selangor Voter Registry Interactive Map Dashboard (SLGRVTRS)
**Date**: 14 August 2026
**Scope**: Deep technical research for implementing the 4-layer MapLibre architecture — data sizing, rendering performance, interaction patterns, library versions, and integration with Next.js 16
**Data**: 3,971,650 voters | 22 Parliaments | 56 DUNs | 945 DMs

---

## Executive Summary

This document provides the engineering research behind the 4-layer MapLibre dashboard architecture. It covers every technical dimension needed to scaffold the project: MapLibre GL JS version selection (v6 vs v5), Next.js 16 App Router integration patterns, per-layer data sizing and rendering characteristics, choropleth styling with expressions, `feature-state` hover/selection, DM centroid generation, and the vector tile pipeline required for the future 3.97M-point Layer 4.

**Key findings:**

- MapLibre GL JS **v6.3.0** is the latest stable release (July 2026) — ESM-only, WebGL2-only, ~130 KB gzipped, with 3.4x faster feature-state. Use v6 for this greenfield project.
- Next.js 16 + React 19: use **`next/dynamic` with `ssr: false`** for the map component. **Do NOT use `react-map-gl`** — it has known React 19/Turbopack compatibility bugs. Use the imperative MapLibre API directly.
- Layers 1-3 (22 + 56 polygons + 945 points) total **~15,782 vertices and under 5 MB of GeoJSON** — trivially small for MapLibre. No vector tiles needed. All data loads from `/public` as static GeoJSON.
- Layer 4 (3.97M points) **requires vector tiles** — tippecanoe → PMTiles → S3/CloudFront. Expected tileset size: 100-300 MB. GeoJSON would be 800 MB+ and is not viable.
- **945 DM centroids** must be generated from voter data since no DM boundary polygons exist. Strategy: compute from voter DM_CODE grouping (no GPS available in current data), place within parent DUN polygon using Turf.js grid-in-polygon.

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
// lib/map-setup.ts
import maplibregl from 'maplibre-gl';

// Set worker URL for bundler compatibility
maplibregl.setWorkerUrl(
  new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href
);

export default maplibregl;
```

---

## 2. Next.js 16 Integration

### 2.1 Why NOT react-map-gl

The `react-map-gl` library (v7.x) has a **known open bug** with React 19 + Next.js 16 + Turbopack. The imperative MapLibre GL JS API is more reliable and gives full control over source/layer lifecycle — which matters for the 4-layer architecture with zoom-dependent visibility.

### 2.2 Correct Pattern: `next/dynamic` + `ssr: false`

MapLibre requires `window`, `WebGL2`, and `document` — none of which exist during SSR. The App Router makes all components Server Components by default. The map must be explicitly loaded client-side only.

```tsx
// app/page.tsx — Server Component (default)
import dynamic from 'next/dynamic';

const MapDashboard = dynamic(() => import('@/components/map/MapDashboard'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-slate-900">
      <div className="animate-spin h-8 w-8 border-4 border-blue-400 border-t-transparent rounded-full" />
      <span className="ml-3 text-slate-400 text-sm">Loading Selangor Voter Map...</span>
    </div>
  ),
});

export default function Home() {
  return <MapDashboard />;
}
```

```tsx
// components/map/MapDashboard.tsx — Client Component
'use client';

import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import '@lib/map-setup'; // sets worker URL

export default function MapDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: { version: 8, sources: {}, layers: [] },
      center: [101.5, 3.1], // Selangor center
      zoom: 8.5,
      minZoom: 7,
      maxZoom: 18,
      attributionControl: false,
    });

    // Add layers after map loads
    mapRef.current.on('load', () => {
      addBoundaryLayers(mapRef.current!);
      addCentroidLayers(mapRef.current!);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
```

### 2.3 React 19 `useRef` + StrictMode

React 19 StrictMode (development) double-mounts components. The pattern above handles this:

1. `if (mapRef.current) return;` — prevents double initialization
2. Cleanup function calls `mapRef.current?.remove()` — destroys the first instance
3. The second mount creates a fresh map instance

### 2.4 Loading GeoJSON Data

For Layers 1-3, the boundary GeoJSON files are small enough to fetch from `/public`:

| Layer | File | Estimated Selangor-only size | Load method |
|:-----:|------|:---------------------------:|:-----------:|
| L1 Parliament | `selangor_parliament.geojson` | ~300-400 KB (22 features, 7,563 vertices) | `fetch('/boundaries/...')` |
| L2 DUN | `selangor_dun.geojson` | ~200-300 KB (56 features, 4,219 vertices) | `fetch('/boundaries/...')` |
| L3 DM centroids | `dm_centroids.geojson` | ~80-120 KB (945 point features) | `fetch('/boundaries/...')` |
| State outline | `selangor_outline.geojson` | ~20 KB (1 feature, ~200 vertices) | `fetch('/boundaries/...')` |

**Total: ~600-840 KB** of GeoJSON — well within MapLibre's 10-50 MB recommended limit for URL-sourced GeoJSON.

```typescript
// Load all boundary data in parallel
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

---

## 3. Layer 1: Parliament Boundaries (22 Polygons)

### 3.1 Data Specifications

| Property | Value |
|----------|-------|
| **Source file** | `electiondata_2018_parlimen.geojson` (filtered to Selangor) |
| **Data provider** | ElectionData.MY (derived from SPR 2018 delimitation) |
| **Features (Selangor)** | 22 polygons |
| **Geometry type** | `Polygon` (single-part, not MultiPolygon) |
| **Total vertices** | 7,563 (avg 344 per polygon) |
| **Properties** | `state`, `parlimen`, `code_parlimen` (e.g. `"P.102"`) |
| **CRS** | CRS84 (WGS84, EPSG:4326) |
| **File size (Selangor-only, estimated)** | ~300-400 KB |
| **Render cost** | Negligible — 22 polygons is trivial for WebGL |

### 3.2 Preprocessing Required

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
    f['properties']['voter_prefix'] = code.replace('P.', '')  # "102"
    f['id'] = i + 1  # Integer ID for feature-state

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

with open('public/boundaries/selangor_parliament.geojson', 'w') as f:
    json.dump(result, f)

print(f"Wrote {len(sel)} Parliament features")
```

### 3.3 MapLibre Source & Layer Configuration

```typescript
// Add source
map.addSource('parliament', {
  type: 'geojson',
  data: parliamentGeoJSON,
  promoteId: 'id',  // Integer feature IDs for feature-state
});

// Fill layer (choropleth)
map.addLayer({
  id: 'parliament-fill',
  type: 'fill',
  source: 'parliament',
  maxzoom: 9,  // Hide when zoomed into DUN level
  paint: {
    'fill-color': [
      'interpolate',
      ['linear'],
      ['get', 'total_voters'],
      50000,   '#ffffcc',
      100000,  '#a1dab4',
      170000,  '#41b6c4',
      220000,  '#2c7fb8',
      340000,  '#253494',
    ],
    'fill-opacity': [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      0.9,  // Brighter on hover
      0.7,  // Default
    ],
    'fill-antialias': true,
  },
});

// Border layer
map.addLayer({
  id: 'parliament-border',
  type: 'line',
  source: 'parliament',
  maxzoom: 9,
  paint: {
    'line-color': '#1a1a2e',
    'line-width': [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      2.5,  // Thicker on hover
      1.0,  // Default
    ],
  },
});

// Label layer
map.addLayer({
  id: 'parliament-label',
  type: 'symbol',
  source: 'parliament',
  maxzoom: 9,
  layout: {
    'text-field': ['get', 'code_parlimen'],
    'text-size': 13,
    'text-font': ['Open Sans Bold'],
    'text-anchor': 'center',
  },
  paint: {
    'text-color': '#1a1a2e',
    'text-halo-color': 'rgba(255,255,255,0.8)',
    'text-halo-width': 1.5,
  },
});
```

### 3.4 Interaction: Click Popup with Stats

```typescript
const popup = new maplibregl.Popup({
  closeButton: true,
  closeOnClick: false,
  anchor: 'top',
  maxWidth: '320px',
  className: 'parliament-popup',
});

map.on('click', 'parliament-fill', (e) => {
  if (!e.features?.length) return;
  const props = e.features[0].properties;
  const coords = e.lngLat;

  popup
    .setLngLat(coords)
    .setHTML(`
      <div class="p-3">
        <h3 class="font-bold text-lg">${props.code_parlimen} — ${props.parlimen.replace('P.\\d+ ', '')}</h3>
        <p class="text-sm text-gray-600">Parliamentary Constituency</p>
        <hr class="my-2">
        <p><strong>Total Voters:</strong> ${Number(props.total_voters).toLocaleString()}</p>
        <p><strong>Gender:</strong> M ${props.male_pct}% | F ${props.female_pct}%</p>
        <p><strong>Malay:</strong> ${props.malay_pct}% | <strong>Chinese:</strong> ${props.chinese_pct}% | <strong>Indian:</strong> ${props.indian_pct}%</p>
        <p><strong>Mean Age:</strong> ${props.age_mean} | <strong>Contact:</strong> ${props.contact_pct}%</p>
        <hr class="my-2">
        <p class="text-xs text-gray-400">Contains ${props.child_dun_count} DUNs</p>
      </div>
    `)
    .addTo(map);
});

// Change cursor on hover
map.on('mouseenter', 'parliament-fill', () => {
  map.getCanvas().style.cursor = 'pointer';
});
map.on('mouseleave', 'parliament-fill', () => {
  map.getCanvas().style.cursor = '';
});
```

### 3.5 Hover Highlight via `feature-state`

```typescript
let hoveredParlId: number | null = null;

map.on('mousemove', 'parliament-fill', (e) => {
  if (!e.features?.length) return;
  const featureId = e.features[0].id;

  if (hoveredParlId !== null && hoveredParlId !== featureId) {
    map.setFeatureState(
      { source: 'parliament', id: hoveredParlId },
      { hover: false }
    );
  }

  hoveredParlId = featureId;
  map.setFeatureState(
    { source: 'parliament', id: featureId },
    { hover: true }
  );
});

map.on('mouseleave', 'parliament-fill', () => {
  if (hoveredParlId !== null) {
    map.setFeatureState(
      { source: 'parliament', id: hoveredParlId },
      { hover: false }
    );
    hoveredParlId = null;
  }
});
```

---

## 4. Layer 2: DUN Boundaries (56 Polygons)

### 4.1 Data Specifications

| Property | Value |
|----------|-------|
| **Source file** | `dosm_dun.json` (filtered to Selangor) |
| **Data provider** | DOSM KawasanKu (Department of Statistics, Malaysia) |
| **Features (Selangor)** | 56 polygons |
| **Geometry type** | `MultiPolygon` |
| **Total vertices** | 4,219 (avg 75 per polygon) |
| **Properties** | `state`, `parlimen`, `dun`, `code_state`, `code_parlimen`, `code_dun`, `code_state_dun` |
| **Sample** | `{"dun":"N.25 Kajang", "code_dun":"N.25", "code_parlimen":"P.102"}` |
| **CRS** | CRS84 (WGS84) |
| **File size (Selangor-only, estimated)** | ~200-300 KB |
| **Parent mapping** | Each DUN includes `code_parlimen` enabling Parliament → DUN hierarchy |

### 4.2 Preprocessing Required

```python
# scripts/filter_dun.py
import json

with open('boundaries/research/dosm_dun.json') as f:
    data = json.load(f)

sel = [f for f in data['features'] if f['properties']['state'] == 'Selangor']

for i, f in enumerate(sel):
    f['properties']['voter_prefix'] = f['properties']['code_dun'].replace('N.', '')  # "25"
    f['properties']['parent_parl'] = f['properties']['code_parlimen']  # "P.102"
    f['id'] = i + 1  # Integer ID for feature-state

result = {
    "type": "FeatureCollection",
    "metadata": {
        "title": "Selangor DUN Constituency Boundaries",
        "authority": "Suruhanjaya Pilihan Raya (SPR)",
        "derived_from": "SPR delimitation exercises",
        "data_provider": "DOSM KawasanKu",
        "license": "Government open data (DOSM)",
        "notes": "Derived open dataset; not the legal instrument."
    },
    "features": sel
}

with open('public/boundaries/selangor_dun.geojson', 'w') as f:
    json.dump(result, f)

print(f"Wrote {len(sel)} DUN features")
```

### 4.3 Zoom-Based Visibility Strategy

The core UX pattern is **Parliament at low zoom, DUN at higher zoom**:

| Zoom Range | Visible Layers | Rationale |
|:----------:|:--------------:|-----------|
| 7.0 – 8.5 | Parliament fill + border + label | State-level overview, compare 22 seats |
| 8.5 – 10.0 | Parliament border (outline only) + DUN fill + label | Transition: Parliament fades, DUN emerges |
| 10.0 – 18.0 | DUN fill + border + label + DM centroids | DUN-level exploration |
| 14.0+ | DUN + DM centroids + voter points (future) | Individual voter exploration |

```typescript
// Parliament: full at low zoom, outline only at medium zoom
// parliament-fill: maxzoom: 9 (set in layer config above)
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

### 4.4 Parliament → DUN Drill-Down

When a user clicks a Parliament polygon, fly to its extent and show DUNs:

```typescript
map.on('click', 'parliament-fill', (e) => {
  if (!e.features?.length) return;
  const props = e.features[0].properties;
  const voterPrefix = props.voter_prefix; // e.g. "102"

  // Filter DUN layer to show only this Parliament's DUNs
  map.setFilter('dun-fill', ['==', ['get', 'voter_prefix'], voterPrefix]);
  map.setFilter('dun-border', ['==', ['get', 'voter_prefix'], voterPrefix]);
  map.setFilter('dun-label', ['==', ['get', 'voter_prefix'], voterPrefix]);

  // Fly to the Parliament's bounding box
  const bounds = new maplibregl.LngLatBounds();
  const parliamentGeoJSON = map.getSource('parliament')?.serialize();
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

### 4.5 DUN → Demographics Popup

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
        <strong>Contact:</strong> ${props.contact_pct}% | <strong>GPS:</strong> ${props.gps_pct}%
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
    const dunCode = dunFeature.properties!.code_dun; // "N.25"
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
from shapely.geometry import shape, mapping, Point, MultiPoint
from shapely.ops import unary_union

with open('public/boundaries/selangor_dun.geojson') as f:
    dun_data = json.load(f)

with open('public/stats/dm.json') as f:
    dm_stats = json.load(f)

features = []
for dun in dun_data['features']:
    poly = shape(dun['geometry'])
    parent_code = dun['properties']['code_dun']  # "N.25"
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

with open('public/boundaries/dm_centroids.geojson', 'w') as f:
    json.dump({"type": "FeatureCollection", "features": features}, f)

print(f"Generated {len(features)} DM centroids")
```

### 5.3 MapLibre Layer Configuration

```typescript
map.addSource('dm-centroids', {
  type: 'geojson',
  data: dmCentroidGeoJSON,
  promoteId: 'dm_code_num',  // Must be integer!
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
| `-l voters` | Layer name inside the tileset (used in `source-layer`)

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
|--------|---------|
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

The voter stats (pre-computed from Python aggregation) must be joined to GeoJSON boundary features at runtime. Two approaches:

### 7.1 Pre-join at Build Time (Recommended)

```typescript
// lib/join-stats.ts
export function joinStatsToGeoJSON(
  geojson: GeoJSON.FeatureCollection,
  stats: Record<string, VoterStats>,
  codeField: string, // 'voter_prefix' — the preprocessed matching field
): GeoJSON.FeatureCollection {
  return {
    ...geojson,
    features: geojson.features.map(f => ({
      ...f,
      properties: {
        ...f.properties,
        ...stats[f.properties?.[codeField]],
      },
    })),
  };
}
}

// Usage in MapDashboard
const [parlGeo, parlStats, dunGeo, dunStats, dmCentroids, dmStats] =
  await Promise.all([...]);

const parlJoined = joinStatsToGeoJSON(parlGeo, parlStats, 'voter_prefix');
const dunJoined = joinStatsToGeoJSON(dunGeo, dunStats, 'voter_prefix');
```

### 7.2 Stats JSON Schema

```typescript
// public/stats/parliament.json — keyed by voter_prefix
interface VoterStats {
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
  age_brackets: Record<string, number>;
  contact_pct: number;
  gps_pct: number;
  child_dun_count: number; // Parliament only
  dm_count: number;         // DUN only
  locality_count: number;   // DUN only
  parent_parl: string;      // DUN only
}

// File structure:
// {
//   "92": { "total_voters": 52847, "male_pct": 49.2, ... },
//   "93": { "total_voters": 65970, ... },
//   ...
// }
```

---

## 8. Choropleth Color Scales

### 8.1 Recommended Palettes

| Metric | Palette | Type | Colors (5-class) |
|--------|---------|------|-----------------|
| Total voters | YlGnBu | Sequential | `#ffffcc` → `#a1dab4` → `#41b6c4` → `#2c7fb8` → `#253494` |
| Gender ratio (M:F) | PiYG | Diverging | `#e41a1c` → `#f7f7f7` → `#4daf4a` |
| Malay % | YlOrRd | Sequential | `#ffffb2` → `#fecc5c` → `#fd8d3c` → `#f03b20` → `#bd0026` |
| Chinese % | Oranges | Sequential | `#fff5eb` → `#fee6ce` → `#fdd0a2` → `#fdae6b` → `#e6550d` |
| Indian % | Greens | Sequential | `#f7fcf5` → `#e5f5e0` → `#c7e9c0` → `#a1d99b` → `#31a354` |
| Mean age | Viridis | Sequential | `#440154` → `#31688e` → `#35b779` → `#fde725` |
| Contact % | PuBu | Sequential | `#f7fbff` → `#c6dbef` → `#6baed6` → `#2171b5` → `#08306b` |

### 8.2 Generating Breaks (Jenks Natural Breaks)

For choropleth classification, **Jenks natural breaks** (k-means clustering of values) produces the most visually meaningful class boundaries. Implement in the Python preprocessing step:

```python
# scripts/compute_choropleth_breaks.py
import json
import jenkspy  # pip install jenkspy

with open('public/stats/parliament.json') as f:
    stats = json.load(f)

values = [v['total_voters'] for v in stats.values()]
breaks = jenkspy.jenks_breaks(values, n_classes=5)
# Example output: [52847, 155756, 204037, 250418, 336552]

print(f"5-class Jenks breaks for Parliament voter count:")
for i, (low, high) in enumerate(zip(breaks[:-1], breaks[1:])):
    print(f"  Class {i+1}: {low:,} – {high:,}")
```

---

## 9. Memory Management & Performance

### 9.1 Source/Layer Lifecycle

```typescript
// Correct removal order: layers first, then source
function removeLayerSafely(map: maplibregl.Map, layerId: string, sourceId: string) {
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

// Map destruction (critical in React StrictMode double-mount)
useEffect(() => {
  // ... init ...
  return () => {
    mapRef.current?.remove(); // Cleans up all sources, layers, WebGL context
    mapRef.current = null;
  };
}, []);
```

### 9.2 Performance Characteristics Per Layer

| Layer | Features | Vertices | GeoJSON Size | Parse Time (est.) | Render Cost |
|:-----:|:--------:|:--------:|:------------:|:-----------------:|:-----------:|
| Parliament | 22 | 7,563 | ~350 KB | <50 ms | Negligible |
| DUN | 56 | 4,219 | ~250 KB | <50 ms | Negligible |
| DM centroids | 945 | 945 points | ~100 KB | <10 ms | Negligible |
| Voter points (L4) | 3.97M | 3.97M points | ~200 MB (tiles) | N/A (streamed) | Per-tile rendering |

**Total Layers 1-3: ~700 KB GeoJSON, ~13,700 vertices** — MapLibre handles this in under 100ms total. No performance optimization needed for these layers.

### 9.3 Debounce Hover Handlers

```typescript
// Avoid processing on every mousemove pixel
let hoverTimeout: NodeJS.Timeout;

map.on('mousemove', 'dun-fill', (e) => {
  if (hoverTimeout) clearTimeout(hoverTimeout);
  hoverTimeout = setTimeout(() => {
    // Update feature-state and tooltip
  }, 16); // ~60fps throttle
});
```

### 9.4 GeoJSON Optimization Tips

For the Selangor-filtered files, apply these optimizations in the Python preprocessing step:

1. **Reduce coordinate precision** to 6 decimal places (~1cm accuracy, more than enough):
   ```python
   # Round all coordinates to 6 decimal places
   from shapely.geometry import shape, mapping
   geom = shape(feature['geometry'])
   geom = geom.simplify(0, preserve_topology=True)  # No simplification, just precision
   ```

2. **Strip unused properties** before saving:
   ```python
   # Only keep properties needed for rendering and data-join
   keep_keys = ['code_parlimen', 'parlimen', 'voter_prefix', 'id']
   feature['properties'] = {k: v for k, v in feature['properties'].items() if k in keep_keys}
   ```

3. **Minify JSON** (no whitespace) — already the default for `json.dump()` without `indent`.

---

## 10. Complete Component Architecture

### 10.1 File Structure (Updated)

```
slgrvtrs-dashboard/
├── app/
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Server Component → dynamic import MapDashboard
│   ├── globals.css                   # Tailwind + map popup styles
│   └── api/
│       └── stats/
│           ├── parliament/route.ts   # GET /api/stats/parliament (or serve static)
│           └── dun/route.ts          # GET /api/stats/dun
├── components/
│   ├── map/
│   │   ├── MapDashboard.tsx          # 'use client' — main map orchestrator
│   │   ├── sources.ts                # addSource() calls for all 4 layers
│   │   ├── layers/
│   │   │   ├── ParliamentLayer.ts    # L1: fill + border + label + hover + click
│   │   │   ├── DUNLayer.ts            # L2: fill + border + label + hover + click
│   │   │   ├── DMCentroidLayer.ts     # L3: circle + tooltip
│   │   │   └── VoterPointsLayer.ts    # L4 (future): vector tile circle layer
│   │   ├── interactions.ts           # Popup, tooltip, hover state management
│   │   └── Legend.tsx                 # Dynamic choropleth legend
│   ├── sidebar/
│   │   ├── LayerToggle.tsx            # Layer visibility checkboxes
│   │   ├── MetricSelector.tsx         # Dropdown: total / gender / race / age
│   │   └── FilterPanel.tsx            # Race/gender/age range filters
│   └── charts/
│       ├── GenderBar.tsx              # Horizontal stacked bar
│       ├── RacePie.tsx                # Donut chart
│       └── AgeHistogram.tsx           # Bar chart
├── lib/
│   ├── map-setup.ts                  # Worker URL, PMTiles protocol
│   ├── join-stats.ts                 # Stats JSON → GeoJSON property merge
│   ├── color-scales.ts               # Choropleth color functions + Jenks breaks
│   └── code-mapping.ts               # Voter code ↔ GeoJSON code utilities
├── hooks/
│   ├── useMap.ts                     # Map instance ref + init logic
│   ├── useFeatureState.ts            # Hover/selection state manager
│   └── useBoundaryData.ts            # Data loading + join orchestration
├── public/
│   ├── boundaries/
│   │   ├── selangor_parliament.geojson    # 22 features, ~350 KB
│   │   ├── selangor_dun.geojson            # 56 features, ~250 KB
│   │   ├── selangor_outline.geojson       # 1 feature, ~20 KB
│   │   └── dm_centroids.geojson           # 945 features, ~100 KB
│   └── stats/
│       ├── parliament.json               # 22 records keyed by voter_prefix
│       ├── dun.json                      # 56 records keyed by voter_prefix
│       └── dm.json                       # 945 records keyed by dm_code
├── data-processing/
│   ├── aggregate_stats.py              # XLSX → stats JSON (python-calamine + pandas)
│   ├── filter_parliament.py            # ElectionData → Selangor 22 + voter_prefix
│   ├── filter_dun.py                   # DOSM → Selangor 56 + voter_prefix + parent
│   ├── generate_dm_centroids.py        # DM stats + DUN polys → centroid GeoJSON
│   └── compute_choropleth_breaks.py    # Jenks natural breaks for each metric
├── tiles/
│   └── build_voter_tiles.sh            # tippecanoe pipeline for Layer 4
├── package.json
├── tsconfig.json                      # target: "ES2022"
├── tailwind.config.ts
└── next.config.ts
```

### 10.2 Component Hierarchy

```
page.tsx (Server Component)
  └── MapDashboard (Client Component, dynamic import ssr:false)
        ├── MapLibre Map (imperative, via useMap hook)
        │     ├── ParliamentLayer (L1)
        │     ├── DUNLayer (L2)
        │     ├── DMCentroidLayer (L3)
        │     └── VoterPointsLayer (L4, future)
        ├── Sidebar
        │     ├── LayerToggle
        │     ├── MetricSelector → triggers layer.paint updates
        │     └── FilterPanel
        ├── Legend (reads current metric's color scale)
        └── Popup/Tooltip (managed by interactions.ts)
```

---

## 11. Updated Source Decisions

The original `MAPLIBRE_PROJECT.md` recommended MECo for boundaries. After the download research in `BOUNDARY_SOURCES_RESEARCH.md`, the sources have been updated:

| Layer | Original Plan | Updated Decision | Reason |
|:-----:|:-------------:|:----------------:|--------|
| Parliament (L1) | MECo (not yet tested) | **ElectionData.MY** | 22/22 match, 7,563 vertices (2.7x more detail), explicitly 2018 delimitation |
| DUN (L2) | MECo (not yet tested) | **DOSM KawasanKu** | Only source with DUN boundaries, 56/56 match, includes parent Parliament mapping |
| State outline | geoBoundaries ADM1 | **JAKIM** | 1/1 match, ~200 vertices, lightweight |
| DM centroids (L3) | Not specified | **Generated from voter data** | No DM boundary polygons exist. 945 centroids from DM grouping + DUN polygon grid |
| Voter points (L4) | tippecanoe tiles | **tippecanoe → PMTiles** | Same approach, updated to PMTiles for static hosting |

---

## 12. Dependency Versions

| Package | Version | Purpose |
|---------|:-------:|---------|
| `maplibre-gl` | **6.3.0** | WebGL2 map rendering (ESM-only) |
| `next` | **16.x** | App Router, API routes, React 19 |
| `react` | **19.x** | UI framework (via Next.js 16) |
| `typescript` | **5.x** | Type safety, target ES2022 |
| `tailwindcss` | **4.x** | Utility-first CSS |
| `@turf/turf` | **7.x** | Geometry operations (centroid, point-in-polygon, grid) |
| `pmtiles` | **3.x** | PMTiles protocol for MapLibre (Layer 4) |
| `recharts` | **2.x** | Popup charts (gender bar, race pie, age histogram) |
| `jenkspy` | **2.x** (Python) | Jenks natural breaks for choropleth classification |
| `python-calamine` | **0.2x** (Python) | Fast XLSX reading for stats aggregation |
| `pandas` | **2.x** (Python) | Data processing and aggregation |

**NOT used** (explicitly excluded):

| Package | Reason |
|---------|--------|
| `react-map-gl` | Known React 19 + Turbopack compatibility bugs |
| `@maplibre/maplibre-gl-js/plugins` (supercluster) | Supercluster is built into GeoJSONSource — no separate plugin needed |
| `openpyxl` | Too slow for 4M rows; python-calamine is 14x faster |

---

## 13. Implementation Phases (Updated)

### Phase 1: Foundation (Week 1-2)
- [x] Research and validate boundary sources
- [ ] Set up Next.js 16 project with MapLibre GL JS 6.3
- [ ] Run Python aggregation scripts → `stats/parliament.json`, `stats/dun.json`, `stats/dm.json`
- [ ] Filter ElectionData Parliament → `selangor_parliament.geojson` (22 features)
- [ ] Filter DOSM DUN → `selangor_dun.geojson` (56 features)
- [ ] Filter JAKIM state → `selangor_outline.geojson` (1 feature)
- [ ] Implement MapDashboard with Parliament choropleth (Layer 1)
- [ ] Add click popup with stats, hover highlight via feature-state
- [ ] Add sidebar with metric selector (total / gender / race / age)

### Phase 2: DUN Drill-Down (Week 3)
- [ ] Add DUN boundary layer (Layer 2) with zoom-based visibility
- [ ] Implement Parliament → DUN drill-down on click
- [ ] DUN popup with full demographics
- [ ] Color legend component
- [ ] Layer toggle controls

### Phase 3: DM Visualization (Week 4)
- [ ] Generate DM centroids (Strategy A: Turf.js grid-in-polygon or Strategy C: Python Shapely)
- [ ] Implement DM bubble layer (Layer 3) with proportional sizing
- [ ] DM tooltip with voter count and name
- [ ] Race/gender filter controls in sidebar

### Phase 4: Polish & Deploy (Week 5)
- [ ] Responsive design (mobile sidebar collapse, touch interactions)
- [ ] Loading states, error boundaries, empty states
- [ ] Provenance panel (reads GeoJSON metadata block)
- [ ] Performance audit (Lighthouse)
- [ ] Deploy to Vercel

### Phase 5: Individual Points (Future)
- [ ] Geocode voter addresses (batch Nominatim/Google Maps) or use DM centroids
- [ ] Build tippecanoe pipeline → `voters.pmtiles`
- [ ] Upload PMTiles to S3/Cloudflare R2
- [ ] Implement PMTiles protocol + voter point layer (Layer 4)
- [ ] Deep zoom individual voter exploration with popups

---

## 14. References

- [MapLibre GL JS v6.0.0 Release Notes](https://github.com/maplibre/maplibre-gl-js/releases/tag/v6.0.0)
- [MapLibre GL JS Documentation](https://maplibre.org/maplibre-gl-js/docs/)
- [MapLibre Tips for Large GeoJSON Datasets](https://www.maplibre.org/maplibre-gl-js/docs/guides/large-data)
- [MapLibre `feature-state` API](https://maplibre.org/maplibre-gl-js/docs/api/map/#map#setfeaturestate)
- [PMTiles Specification](https://github.com/protomaps/PMTiles)
- [tippecanoe](https://github.com/felt/tippecanoe) — Vector tile generation
- [Martin Tile Server v1.13](https://github.com/maplibre/martin)
- [Turf.js](https://turfjs.org/) — Geospatial analysis
- [ElectionData.MY](https://electiondata.my) — Parliament boundary source
- [DOSM KawasanKu](https://kawasanku.dosm.gov.my) — DUN boundary source
- [JAKIM GeoJSON](https://github.com/mptwaktusolat/jakim.geojson) — State boundary source
- [Project Provenance](./docs/provenance.md) — Full data provenance and disclaimers
- [Boundary Sources Research](./BOUNDARY_SOURCES_RESEARCH.md) — Source comparison and download results
