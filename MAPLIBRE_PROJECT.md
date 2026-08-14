# SLGRVTRS MapLibre Dashboard — Project Blueprint

**Project**: Selangor Voter Registry Interactive Map Dashboard  
**Tech Stack**: MapLibre GL JS + Next.js + GeoParquet/Vector Tiles  
**Data**: 3,971,650 registered voters across 56 DUNs, 22 Parliaments, 945 DMs  
**Date**: 14 August 2026  
**License**: Project-specific; boundary data from MECo (CC0), voter data (private)  

---

## 1. Project Overview

An interactive web map dashboard that visualizes Selangor's voter registry data segmented by electoral boundaries. Users can explore demographic compositions (gender, race, age) at the Parliament, DUN, and DM levels through choropleth maps, popups, and drill-down interactions.

### Core Capabilities

- **Layer 1**: Parliament constituency boundaries (22 polygons) — click to see aggregated stats
- **Layer 2**: DUN (State Assembly) boundaries (56 polygons) — click for detailed demographics
- **Layer 3**: DM (Voting District) centroids/bubbles (~945 points) — proportional to voter count
- **Layer 4** (future): Individual geocoded voter points with clustering (3.97M points)

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  Next.js 16 + React + TypeScript                 │
│  MapLibre GL JS + maplibre-gl-js/plugins         │
│  Tailwind CSS 4 + shadcn/ui                     │
│                                                   │
│  ┌─────────────────────────────────────────┐     │
│  │           MapLibre Map Container         │     │
│  │  ┌─────────────────────────────────────┐ │     │
│  │  │  Layer 1: Parliament (22 polys)     │ │     │
│  │  │  Layer 2: DUN (56 polys)           │ │     │
│  │  │  Layer 3: DM centroids (945 pts)   │ │     │
│  │  │  Layer 4: (future) voter points    │ │     │
│  │  └─────────────────────────────────────┘ │     │
│  └─────────────────────────────────────────┘     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Sidebar  │ │ Legend   │ │ Popup/Panel     │  │
│  │ Filters  │ │ Controls │ │ Demographics    │  │
│  └──────────┘ └──────────┘ └──────────────────┘  │
└─────────────────────────────────────────────────┘
         │ API calls
         ▼
┌─────────────────────────────────────────────────┐
│                  Backend API                       │
│  Next.js API Routes                              │
│  ┌──────────────────────────────────────────┐    │
│  │  /api/stats/parliament  → 22 records     │    │
│  │  /api/stats/dun         → 56 records     │    │
│  │  /api/stats/dm           → 945 records    │    │
│  │  /api/stats/dun/:code    → single DUN    │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
         │ reads
         ▼
┌─────────────────────────────────────────────────┐
│                   Data Layer                       │
│  Pre-computed JSON stats (from xlsx analysis)     │
│  GeoJSON/GeoParquet boundary files                │
│  Static assets served from /public                 │
└─────────────────────────────────────────────────┘
```

---

## 3. Data Pipeline

### 3.1 Pre-computed Statistics

The xlsx files are processed offline (Python + calamine) to produce pre-aggregated JSON files. These are committed to the repo and served as static assets — no server-side xlsx processing at runtime.

```
xlsx files (4x ~1M rows)
    ↓ python-calamine + pandas
aggregation scripts
    ↓
stats_parliament.json  → 22 records, each with:
  { code, name, total, gender:{M,F}, race:{M,C,I,B,TBC},
    age:{mean,median,distribution}, contact_pct, gps_pct }

stats_dun.json  → 56 records, same schema

stats_dm.json  → 945 records, same schema + centroid approx.
```

### 3.2 Boundary Files

| File | Source | Format | Size Estimate | Location |
|------|--------|--------|--------------|----------|
| Parliament boundaries | MECo (post-2018) | GeoJSON | ~500KB | `public/boundaries/parliament.geojson` |
| DUN boundaries | MECo (post-2018) | GeoJSON | ~2MB | `public/boundaries/dun.geojson` |
| DM centroids | Generated from stats | GeoJSON Points | ~200KB | `public/boundaries/dm_centroids.geojson` |
| Selangor outline | MECo or geoBoundaries ADM1 | GeoJSON | ~50KB | `public/boundaries/selangor_outline.geojson` |

### 3.3 Code Mapping

The voter data uses `{number}.{Name}` format (e.g., `102.BANGI`). GeoJSON features from MECo will likely use different property names. A mapping step is required:

```typescript
// Boundary file feature.properties might look like:
// { "code": "P102", "name": "Bangi", "state": "Selangor" }

// Voter data code: "102.BANGI"
// Extract numeric part for matching
function matchCode(voterCode: string, geoCode: string): boolean {
  const voterNum = voterCode.split('.')[0]; // "102"
  return geoCode.replace(/^P/, '') === voterNum; // "102" === "102"
}
```

A mapping table should be pre-built during data processing and stored as `data/code_mapping.json`.

---

## 4. Map Layer Specifications

### Layer 1: Parliament Boundaries (22 polygons)

| Property | Value |
|----------|-------|
| Type | `fill` + `line` |
| Source | `public/boundaries/parliament.geojson` |
| Features | 22 polygons |
| Color | Choropleth by voter count or selected metric |
| Interaction | Click → popup with full stats panel |
| Zoom range | [6, 10] (visible at state level) |
| Popup data | Total voters, gender split, race breakdown, age stats, list of child DUNs |

### Layer 2: DUN Boundaries (56 polygons)

| Property | Value |
|----------|-------|
| Type | `fill` + `line` |
| Source | `public/boundaries/dun.geojson` |
| Features | 56 polygons |
| Color | Choropleth by selected metric (gender/race/age) |
| Interaction | Click → popup with demographics, hover → highlight |
| Zoom range | [8, 14] (appears when zoomed into a Parliament) |
| Popup data | Total voters, gender %, race %, age distribution, parent Parliament, child DM count |

### Layer 3: DM Centroids/Bubbles (945 points)

| Property | Value |
|----------|-------|
| Type | `circle` |
| Source | `public/boundaries/dm_centroids.geojson` |
| Features | ~945 points |
| Size | Proportional to `sqrt(voter_count)` (area-proportional) |
| Color | By parent DUN color or selected metric |
| Interaction | Click → DM stats, hover → tooltip with name + count |
| Zoom range | [11, 18] (appears at DUN zoom level) |
| Note | Centroids need to be generated — DM boundary polygons are not yet available |

**DM Centroid Generation Strategy** (since DM boundaries are unavailable):

```python
# Option A: Approximate from voter data locality codes
# Group voters by DM, use locality name frequency to approximate center
# Requires geocoding locality names (one-time batch of ~945 names)

# Option B: Use Mukim centroids from geoBoundaries ADM3 as proxy
# Map DM → nearest Mukim centroid (approximate, may be inaccurate)

# Option C: Random scatter within parent DUN boundary
# Place DM centroids at evenly distributed points within DUN polygon
# (fastest, least accurate, good for visual prototype)
```

### Layer 4: Individual Voter Points (future)

| Property | Value |
|----------|-------|
| Type | `circle` with clustering (`supercluster`) |
| Source | Vector tiles (generated via tippecanoe) |
| Features | 3,971,650 points |
| Clustering | Supercluster at zoom <14, individual points at zoom 14+ |
| Zoom range | [14, 20] |
| Color | By gender, race, or age group |

**Performance considerations for 3.97M points:**
- Raw GeoJSON is ~2GB — cannot load client-side
- Must use **vector tiles** generated with `tippecanoe` or `planetiler`
- Alternative: **GeoParquet** with `geoparquet-js` for streaming
- MapLibre can handle ~500K client-side points; beyond that, tiles are mandatory
- Reference: [MapLibre Tips for Large GeoJSON](https://www.maplibre.org/maplibre-gl-js/docs/guides/large-data)

---

## 5. UI/UX Design

### 5.1 Layout

```
┌──────────────────────────────────────────────────────┐
│  Header: SLGRVTRS Dashboard — Selangor Voter Map     │
├──────────┬───────────────────────────────────┬───────┤
│          │                                   │       │
│ Sidebar  │                                   │       │
│          │         MapLibre Map              │  Pop-  │
│ □ Layer  │                                   │  up   │
│   toggles│                                   │  Panel │
│          │                                   │       │
│ Metric   │                                   │       │
│ selector │                                   │       │
│          │                                   │       │
│ Race     │                                   │       │
│ filter   │                                   │       │
│          │                                   │       │
│ Age      │  ┌─────────────────────────┐      │       │
│ range    │  │ Legend / Color Scale    │      │       │
│          │  └─────────────────────────┘      │       │
├──────────┴───────────────────────────────────┴───────┤
│  Footer: Data source, last updated, total voters     │
└──────────────────────────────────────────────────────┘
```

### 5.2 Color Schemes

| Metric | Palette | Type |
|--------|---------|------|
| Total voters | YlOrRd (Yellow-Orange-Red) | Sequential |
| Gender ratio (M:F) | PiYG (Pink-Green) | Diverging |
| Malay % | Blues | Sequential |
| Chinese % | Oranges | Sequential |
| Indian % | Greens | Sequential |
| Age (mean) | Viridis | Sequential |
| Contact % | PuBu (Purple-Blue) | Sequential |

### 5.3 Popup Content

**Parliament popup example:**
```
┌────────────────────────────┐
│ P102 — BANGI               │
│ Parliament Constituency    │
│────────────────────────────│
│ Total Voters: 336,552      │
│ DUNs: 5 (N24-N28)          │
│                              │
│ Gender: ▓▓▓▓▓▓ M 49.8%     │
│         ▓▓▓▓▓▓ F 50.2%     │
│                              │
│ Race:                       │
│   M 67.2%  C 18.1%         │
│   I 9.3%   B 3.1% TBC 2.3% │
│                              │
│ Age: Mean 37.2 | Med 36    │
│ Contact: 84.1%             │
│                              │
│ [↓ Show DUN Breakdown]    │
└────────────────────────────┘
```

---

## 6. Technology Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Framework | Next.js | 16 | App router, API routes, SSR |
| Language | TypeScript | 5.x | Type safety |
| Mapping | MapLibre GL JS | 5.x | WebGL map rendering |
| Clustering | @maplibre/maplibre-gl-js | plugin | Point clustering (Layer 4) |
| Styling | Tailwind CSS | 4.x | Utility-first CSS |
| UI | shadcn/ui | latest | Accessible components |
| Charts | Recharts or D3 | latest | Popup bar/pie charts |
| Data | Pre-computed JSON | — | Static stats served from /public |
| Boundaries | GeoJSON/GeoParquet | — | Electoral boundary polygons |
| Tiles | tippecanoe (build) | 1.x | Generate vector tiles for Layer 4 |
| Hosting | Vercel / self-host | — | Deployment |

---

## 7. File Structure

```
slgrvtrs-dashboard/
├── app/
│   ├── layout.tsx              # Root layout with map provider
│   ├── page.tsx                # Main dashboard page
│   ├── api/
│   │   ├── stats/
│   │   │   ├── parliament/route.ts    # GET /api/stats/parliament
│   │   │   ├── dun/route.ts           # GET /api/stats/dun
│   │   │   └── dm/route.ts             # GET /api/stats/dm
│   │   └── boundaries/
│   │       ├── parliament/route.ts    # Serve parliament GeoJSON
│   │       └── dun/route.ts            # Serve DUN GeoJSON
│   └── globals.css
├── components/
│   ├── map/
│   │   ├── MapContainer.tsx     # Main MapLibre component
│   │   ├── ParliamentLayer.tsx  # Layer 1
│   │   ├── DUNLayer.tsx         # Layer 2
│   │   ├── DMCentroidsLayer.tsx # Layer 3
│   │   ├── Popup.tsx            # Click popup component
│   │   └── Legend.tsx           # Color legend
│   ├── sidebar/
│   │   ├── LayerToggle.tsx      # Layer visibility controls
│   │   ├── MetricSelector.tsx   # Choose color metric
│   │   └── FilterPanel.tsx      # Race/gender/age filters
│   └── charts/
│       ├── GenderBar.tsx        # Gender split bar
│       ├── RacePie.tsx          # Race distribution
│       └── AgeHistogram.tsx     # Age distribution
├── lib/
│   ├── map-style.ts            # MapLibre style configuration
│   ├── color-scales.ts         # Choropleth color functions
│   └── code-mapping.ts         # Voter code → GeoJSON property matching
├── public/
│   ├── boundaries/
│   │   ├── parliament.geojson       # 22 Parliament polygons
│   │   ├── dun.geojson               # 56 DUN polygons
│   │   ├── dm_centroids.geojson     # 945 DM point features
│   │   └── selangor_outline.geojson  # State outline
│   └── stats/
│       ├── parliament.json           # Pre-computed Parliament stats
│       ├── dun.json                  # Pre-computed DUN stats
│       └── dm.json                   # Pre-computed DM stats
├── data-processing/
│   ├── aggregate_stats.py       # Generate stats JSON from xlsx
│   ├── generate_dm_centroids.py # Create DM centroid GeoJSON
│   └── build_code_mapping.py    # Build voter code → boundary code map
├── tiles/
│   └── build.sh                # tippecanoe tile generation (Layer 4)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## 8. Data Processing Scripts

### 8.1 Aggregate Statistics Generator

```bash
# Process all 4 xlsx files and output per-constituency stats
cd data-processing
python aggregate_stats.py \
  --input /path/to/data/*.xlsx \
  --output-parliament ../../public/stats/parliament.json \
  --output-dun ../../public/stats/dun.json \
  --output-dm ../../public/stats/dm.json
```

Output schema per record:
```json
{
  "code": "102.BANGI",
  "code_num": 102,
  "name": "BANGI",
  "level": "parliament",
  "total_voters": 336552,
  "gender": { "M": 167514, "F": 169038 },
  "race": { "M": 226180, "C": 60895, "I": 31299, "B": 10433, "TBC": 7745 },
  "age": {
    "mean": 37.2,
    "median": 36,
    "min": 18,
    "max": 100,
    "distribution": { "18-25": 45000, "26-35": 82000, ... }
  },
  "contact_pct": 84.1,
  "gps_pct": 0.0,
  "child_duns": ["24.SEMENYIH", "25.KAJANG", ...],
  "child_dun_count": 5
}
```

### 8.2 Boundary Data Acquisition

```bash
# Download MECo electoral boundaries (CC0 license)
# Parliament boundaries (post-2018 delimitation)
curl -L -o parliament.geojson \
  "https://raw.githubusercontent.com/Thevesh/paper-meco-maps/main/data/geojson/parliament_2018_peninsular.geojson"

# DUN boundaries (post-2018 delimitation)
curl -L -o dun.geojson \
  "https://raw.githubusercontent.com/Thevesh/paper-meco-maps/main/data/geojson/dun_2018_peninsular.geojson"

# Filter to Selangor only (P92-P113, N01-N56)
python filter_selangor.py \
  --input parliament.geojson \
  --output selangor_parliament.geojson \
  --codes P92,P93,...,P113
```

> **Note**: Exact MECo file paths need to be verified after cloning the repository. The file naming convention may differ from the examples above.

---

## 9. Performance Strategy

### 9.1 Boundary Rendering

22 Parliament polygons + 56 DUN polygons = **78 total features** — trivially small for MapLibre. GeoJSON source is fine; no need for vector tiles at this level.

### 9.2 DM Centroids

945 circle features — also small. GeoJSON source is fine. Use `circle-radius` data-driven styling for proportional sizing.

### 9.3 Future: 3.97M Voter Points

This requires a tile pipeline:

```
3.97M voter records (CSV with lat/lng)
    ↓ tippecanoe --drop-densest-as-needed
vector tiles (.pbf)
    ↓ serve via mbtiles-server or cloud storage
MapLibre loads only visible tiles
```

Key tippecanoe settings:
```bash
tippecanoe -o voters.mbtiles \
  voters.csv \
  -z 14 -Z 12 \
  --drop-densest-as-needed \
  --maximum-tile-bytes=512000 \
  --attribute-filter="[\"zoom\", >= 14]" \
  -l voters
```

### 9.4 MapLibre Large Data Best Practices

Per [MapLibre official guide](https://www.maplibre.org/maplibre-gl-js/docs/guides/large-data):

1. **Use `setData()` instead of recreating sources** for dynamic updates
2. **Simplify geometries** — `geojson-vt` or `geojson-polygon-simplification`
3. **Cluster points** using `@maplibre/maplibre-gl-js` supercluster plugin
4. **Use vector tiles** instead of GeoJSON for >100K features
5. **Debounce hover/click handlers** — avoid processing on every mousemove
6. **Use `feature-state`** for hover/selection instead of creating new layers

---

## 10. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Set up Next.js 16 project with MapLibre GL JS
- [ ] Download and integrate MECo Parliament + DUN boundary GeoJSONs
- [ ] Build code mapping (voter data codes → GeoJSON properties)
- [ ] Run aggregation scripts to produce stats JSON files
- [ ] Implement base map with Parliament choropleth (Layer 1)
- [ ] Add click popup with basic stats

### Phase 2: DUN Drill-down (Week 3)
- [ ] Integrate DUN boundary GeoJSON (Layer 2)
- [ ] Implement zoom-based layer switching (Parliament → DUN)
- [ ] Add DUN popup with full demographics
- [ ] Build sidebar with metric selector and layer toggles
- [ ] Add color legend

### Phase 3: DM Visualization (Week 4)
- [ ] Generate DM centroid GeoJSON
- [ ] Implement DM bubble layer (Layer 3)
- [ ] Add DM tooltip/popup
- [ ] Implement race/gender filter controls

### Phase 4: Polish & Deploy (Week 5)
- [ ] Responsive design for mobile/tablet
- [ ] Loading states and error handling
- [ ] Performance optimization
- [ ] Deploy to Vercel

### Phase 5: Individual Points (Future)
- [ ] Geocode voter addresses (batch Nominatim/Google Maps)
- [ ] Build tippecanoe tile pipeline
- [ ] Implement clustered point layer (Layer 4)
- [ ] Deep zoom individual voter exploration

---

## 11. Boundary Data Sources — Decision Matrix

| Source | Type | Year | Electoral? | License | Status |
|--------|------|-----:|:----------:|:-------:|:------:|
| **MECo** (Thevesh) | Parliament + DUN | 2018+ | ✅ | CC0 | **Recommended** |
| TindakMalaysia | Parliament + DUN + DM | 2015 | ✅ | Community | Outdated |
| DOSM | Parliament + DUN + District | 2022 | ✅ | Govt | Needs verification |
| geoBoundaries ADM1 | State | 2021 | ❌ | CC-BY 4.0 | Background only |
| geoBoundaries ADM2 | District | 2021 | ❌ | CC-BY 4.0 | Not recommended |
| geoBoundaries ADM3 | Mukim | 2021 | ❌ | CC-BY 4.0 | Uploaded but not suitable |

**Final recommendation**: Use **MECo** for Parliament (Layer 1) and DUN (Layer 2) boundaries. Use **geoBoundaries ADM1** for the Selangor state outline. Defer DM boundaries to Phase 3 — use centroid approximation.

---

## 12. References

- [MapLibre GL JS Documentation](https://maplibre.org/maplibre-gl-js/docs/)
- [MapLibre Tips for Large GeoJSON Datasets](https://www.maplibre.org/maplibre-gl-js/docs/guides/large-data)
- [MECo: Malaysian Election Corpus](https://github.com/Thevesh/paper-meco-maps) — [Zenodo DOI](https://doi.org/10.5281/zenodo.18093017)
- [geoBoundaries Global Database](https://www.geoboundaries.org)
- [TindakMalaysia/Selangor-Maps](https://github.com/TindakMalaysia/Selangor-Maps) (2015 boundaries)
- [DOSM Open Data](https://github.com/dosm-malaysia/data)
- [Sinar Project GE15 Open Data](https://sinarproject.org/open-government/open-data/ge15-open-data)
- [tippecanoe](https://github.com/felt/tippecanoe) — Vector tile generation
- [MapLibre Supercluster Plugin](https://github.com/maplibre/maplibre-gl-js)
- [Thevesh (2025), "The Malaysian Election Corpus (MECo): Electoral Maps and Cartograms from 1954 to 2025", arXiv:2512.24211](https://arxiv.org/abs/2512.24211v1)
