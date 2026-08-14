# Provenance of Electoral Boundary Data — Selangor Voter Registry

**Project**: [DENGKIL-UX/slgrvtrs](https://github.com/DENGKIL-UX/slgrvtrs)  
**Last updated**: 14 August 2026  
**Scope**: Selangor state — 22 Parliamentary constituencies (P92–P113), 56 State Assembly (DUN) constituencies (N01–N56), 3,971,650 registered voters

---

## Official Authority

All parliamentary (Parlimen) and state assembly (DUN) boundaries in Malaysia are legally defined by the **Election Commission of Malaysia** (Suruhanjaya Pilihan Raya, **SPR**) through periodic delimitation exercises published in the Federal Gazette.

- **Official authority**: Suruhanjaya Pilihan Raya (SPR)  
- **Legal instruments**: Delimitation notices, boundary maps, and reports published in the Federal Gazette and on SPR's official website (http://www.spr.gov.my)
- **Current delimitation for Peninsular Malaysia**: **2018** (the most recent exercise affecting Selangor)

> **These official documents are the authoritative reference for any legal or formal purpose.** No derived open dataset, including the files in this repository, constitutes a legal instrument or substitutes for SPR's official gazetted boundaries.

---

## Working Geodata (Open, Derived)

The GeoJSON / FlatGeobuf files in `data/derived_open/` and `boundaries/research/` are **derived, open datasets** created by third parties based on SPR's official delimitations. They are provided for analytical, visualization, and dashboard purposes only.

### Characteristics

| Attribute | Detail |
|-----------|--------|
| **Format** | GeoJSON, FlatGeobuf (machine-readable) |
| **Intended use** | Analysis, dashboards, infographics, and web mapping (MapLibre GL JS) |
| **Legal status** | **Not the legal instrument**; approximations of SPR's official gazetted boundaries |
| **Coordinate system** | CRS84 / WGS84 (EPSG:4326) |
| **License** | As specified by each provider (see per-file metadata below) |
| **Accuracy caveat** | Small geometric differences from SPR's official scanned maps may exist due to digitization, simplification, or coordinate rounding. These differences are generally negligible for choropleth visualization but may be material for legal or survey-grade applications. |

---

## File-Level Metadata

### 1. Parliament Boundaries — `peninsular_2018_parlimen.geojson`

| Field | Value |
|-------|-------|
| **Description** | Parliamentary constituency boundaries for Peninsular Malaysia under the 2018 delimitation |
| **Delimitation year** | 2018 |
| **Region** | Peninsular Malaysia (166 constituencies total; **22 Selangor** P92–P113) |
| **Derived from** | SPR 2018 Peninsular delimitation (Gazette notices and official maps) |
| **Data provider** | [ElectionData.MY](https://electiondata.my) |
| **Source URL** | https://electiondata.my/data-catalogue/peninsular-2018-parlimen/ |
| **Direct file** | https://lake.electiondata.my/maps/delimitations/peninsular_2018_parlimen.geojson |
| **License** | As per ElectionData.MY terms (open data) |
| **Geometry** | Polygon (single-part); ~15,126 vertices for Selangor |
| **Properties** | `state`, `parlimen`, `code_parlimen` (e.g. `"P.102"`) |
| **Selangor code match** | **22/22 (100%)** — all voter data Parliament codes P92–P113 present |
| **Notes** | Highest-detail Parliament source available (2.7x more vertices than JAKIM/DOSM alternatives). Explicitly labeled as 2018 delimitation. Recommended as **primary Parliament layer** for the MapLibre dashboard. |

### 2. Parliament Boundaries (FlatGeobuf) — `peninsular_2018_parlimen.fgb`

| Field | Value |
|-------|-------|
| **Description** | Same Parliament boundaries as above, in spatially-indexed FlatGeobuf format |
| **Data provider** | [ElectionData.MY](https://electiondata.my) |
| **Direct file** | https://lake.electiondata.my/maps/delimitations/peninsular_2018_parlimen.fgb |
| **License** | As per ElectionData.MY terms |
| **Size** | 1,228 KB (vs 1,922 KB for GeoJSON) |
| **Notes** | Suitable for server-side spatial queries (e.g. point-in-polygon constituency lookup). Not directly renderable by MapLibre GL JS client-side. Kept as a reference/compute artifact. |

### 3. DUN Boundaries — `dun.json`

| Field | Value |
|-------|-------|
| **Description** | State Assembly (DUN) constituency boundaries for all Malaysia |
| **Delimitation year** | 2018 (Peninsular) |
| **Region** | All Malaysia (613 constituencies total; **56 Selangor** N01–N56) |
| **Derived from** | SPR delimitation exercises |
| **Data provider** | [DOSM KawasanKu](https://kawasanku.dosm.gov.my) (Department of Statistics, Malaysia) |
| **Source URL** | https://github.com/dosm-malaysia/kawasanku-front/blob/main/geojson/dun.json |
| **Direct file** | https://raw.githubusercontent.com/dosm-malaysia/kawasanku-front/main/geojson/dun.json |
| **License** | Government open data (DOSM) |
| **Geometry** | MultiPolygon; ~4,282 vertices for Selangor (avg ~76 per DUN) |
| **Properties** | `state`, `parlimen`, `dun`, `code_state`, `code_parlimen`, `code_dun`, `code_state_dun` |
| **Selangor code match** | **56/56 (100%)** — by both code and name |
| **Notes** | **Only available DUN-level boundary source** with complete Selangor coverage. Includes parent Parliament mapping (`code_parlimen`) enabling hierarchy drill-down. Recommended as **primary DUN layer** for the MapLibre dashboard. |

### 4. Parliament Boundaries (JAKIM) — `jakim_parlimen.geojson`

| Field | Value |
|-------|-------|
| **Description** | Parliamentary constituency boundaries for all Malaysia |
| **Data provider** | [JAKIM](https://www.e-solat.gov.my) (Jabatan Kemajuan Islam Malaysia) |
| **Source URL** | https://github.com/mptwaktusolat/jakim.geojson/blob/master/malaysia.parlimen.geojson |
| **Direct file** | https://raw.githubusercontent.com/mptwaktusolat/jakim.geojson/master/malaysia.parlimen.geojson |
| **License** | Open data (government source) |
| **Geometry** | MultiPolygon; ~5,578 vertices for Selangor |
| **Properties** | `state`, `parlimen`, `code_state`, `code_parlimen` |
| **Selangor code match** | **22/22 (100%)** |
| **Notes** | Derived from JAKIM prayer time app boundaries. Adequate for visualization but not the authoritative electoral boundary source. Lower geometric detail than ElectionData.MY. Retained as a **backup/verification** layer. |

### 5. State Outline — `jakim_state.geojson`

| Field | Value |
|-------|-------|
| **Description** | Malaysian state and federal territory boundaries |
| **Data provider** | JAKIM (Jabatan Kemajuan Islam Malaysia) |
| **Source URL** | https://github.com/mptwaktusolat/jakim.geojson/blob/master/malaysia.state.geojson |
| **Direct file** | https://raw.githubusercontent.com/mptwaktusolat/jakim.geojson/master/malaysia.state.geojson |
| **License** | Open data (government source) |
| **Geometry** | MultiPolygon; ~200 vertices for Selangor |
| **Notes** | Suitable for Selangor state outline background layer in the MapLibre dashboard. Single polygon, low vertex count — renders instantly. |

### 6. Parliament Boundaries (DOSM) — `dosm_parlimen.json`

| Field | Value |
|-------|-------|
| **Description** | Parliamentary constituency boundaries for all Malaysia |
| **Data provider** | [DOSM KawasanKu](https://kawasanku.dosm.gov.my) |
| **Source URL** | https://github.com/dosm-malaysia/kawasanku-front/blob/main/geojson/parlimen.json |
| **Direct file** | https://raw.githubusercontent.com/dosm-malaysia/kawasanku-front/main/geojson/parlimen.json |
| **License** | Government open data (DOSM) |
| **Geometry** | MultiPolygon; ~5,578 vertices for Selangor |
| **Selangor code match** | **22/22 (100%)** |
| **Notes** | Same vertex count as JAKIM source — likely derived from the same base dataset. Larger file size than JAKIM due to formatting differences. Retained as a **backup/verification** layer. |

---

## Geometry Comparison — Parliament Sources

All three Parliament sources (JAKIM, DOSM, ElectionData) represent **independent digitization efforts**. No two share identical coordinate data:

| Comparison | Identical Geometries | Notes |
|:-----------|:---------------------:|-------|
| JAKIM vs DOSM | 0/22 | Same vertex count (~5,578) but different coordinates |
| JAKIM vs ElectionData | 0/22 | ElectionData has ~15,126 vertices (2.7x more detailed) |
| DOSM vs ElectionData | 0/22 | Same vertex count difference pattern |

This divergence is expected: each provider digitized SPR's published maps independently, resulting in slightly different coordinate sets. **ElectionData.MY's higher vertex count indicates more faithful boundary tracing.**

---

## Recommended Layers for MapLibre Dashboard

| Map Layer | Source File | Reason |
|:----------:|-------------|--------|
| **L1 — Parliament** | `electiondata_2018_parlimen.geojson` | Highest geometric detail (15K verts), explicitly 2018 delimitation, CC0-compatible |
| **L2 — DUN** | `dun.json` (DOSM) | Only source with DUN boundaries and 56/56 Selangor match, includes Parliament parent mapping |
| **L3 — State outline** | `jakim_state.geojson` | Lightweight state boundary for background context |
| **L4 — Voter points** | Voter registry XLSX (3.97M records) | GPS coordinates from voter data |

---

## Code Mapping Reference

The voter registry and GeoJSON files use different code formats. The following mapping is required:

| Voter Data Format | GeoJSON Format | Example |
|:-----------------:|:--------------:|:-------:|
| `{number}.{NAME}` | `P.{number}` (Parliament) | `102.BANGI` → `P.102` |
| `{number}.{NAME}` | `N.{number}` (DUN) | `30.KINRARA` → `N.30` |

```typescript
// Parliament: "102.BANGI" → "P.102"
function voterToGeoParlCode(v: string): string {
  return `P.${v.split('.')[0].padStart(3, '0')}`;
}

// DUN: "30.KINRARA" → "N.30"
function voterToGeoDunCode(v: string): string {
  return `N.${v.split('.')[0].padStart(2, '0')}`;
}
```

---

## How to Use This in Practice

- **For dashboards, analysis, and infographics**: use files in `data/derived_open/` or `boundaries/research/`.
- **For legal references, formal submissions, or dispute resolution**: refer to SPR's official notices and maps in `data/spr_official/` and the original Federal Gazette.
- **When publishing visuals**, include a short note such as:

  > "Boundaries derived from SPR 2018 delimitation exercises; GeoJSON provided by ElectionData.MY and DOSM KawasanKu. Not official SPR boundaries."

---

## Excluded Sources

### geoBoundaries (ADM0–ADM3)

| Field | Value |
|-------|-------|
| **Provider** | [geoBoundaries.org](https://www.geoboundaries.org) (William & Mary GeoLab) |
| **License** | CC BY 4.0 |
| **Why excluded** | Contains **administrative** boundaries (State → District → Mukim), **NOT electoral** boundaries (Parliament → DUN). Malaysia's administrative and electoral hierarchies do not align — a Mukim may span multiple DUNs and vice versa. |
| **Additional issue** | Release data stored in Git LFS; direct HTTP download yields LFS pointer files, not actual data. |
| **Potential use** | ADM0 (country outline) or ADM1 (Selangor state boundary) could serve as backup state outlines, but JAKIM's state boundary is already sufficient. |

### MECo Dataset (Zenodo)

| Field | Value |
|-------|-------|
| **Provider** | Malaysian Election Coverage (MECo) via Zenodo |
| **License** | CC0 (public domain) |
| **Why not used yet** | Identified as a high-quality alternative in earlier research (`GEOJSON_BOUNDARIES_RESEARCH.md`) but not downloaded in the current batch. Available for future validation if ElectionData.MY or DOSM boundaries prove insufficient. |

---

## Disclaimer

> **This repository contains derived open datasets for analytical and visualization purposes only. The boundary files are approximations digitized by third parties from SPR's official delimitation publications. They do NOT constitute official legal instruments. For authoritative boundaries, consult the Federal Gazette and SPR's official publications directly.**
>
> **The voter registry data (XLSX files) is provided as-is for research purposes. No claims are made regarding its completeness, accuracy, or currency relative to SPR's live electoral roll.**

---

## Related Documents

- [`GEOJSON_BOUNDARIES_RESEARCH.md`](../GEOJSON_BOUNDARIES_RESEARCH.md) — Initial boundary validation report (geoBoundaries ADM analysis, MECo identification)
- [`BOUNDARY_SOURCES_RESEARCH.md`](../BOUNDARY_SOURCES_RESEARCH.md) — Download results, file analysis, geometry comparison, and source verdict matrix
- [`MAPLIBRE_PROJECT.md`](../MAPLIBRE_PROJECT.md) — MapLibre dashboard architecture blueprint (4-layer design, data pipeline, tech stack)
- [`DEDUPLICATION.md`](../DEDUPLICATION.md) — Voter data deduplication analysis (VOTER_ID 0% dup, VOTER_CODE 5.97% dup)
- [`ANALYSIS.md`](../ANALYSIS.md) — Voter demographics analysis
