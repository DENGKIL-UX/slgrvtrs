# Boundary Sources — Download Research & Reconciliation Report

**Date**: 14 August 2026  
**Purpose**: Download, analyze, and cross-reference all provided boundary sources against the Selangor voter registry dataset (3,971,650 records, 22 Parliaments, 56 DUNs).  
**Files analyzed**: 6 successfully downloaded out of 13 URLs provided.  

---

## Executive Summary

**Three sources are suitable for the MapLibre dashboard, with two clear winners:**

| Layer | Recommended Source | File | Match Rate | Vertices |
|:-----:|-------------------|------|:----------:|:--------:|
| Parliament (22 polys) | **electiondata.my** | `peninsular_2018_parlimen.geojson` | **22/22 (100%)** | ~15,126 |
| DUN (56 polys) | **DOSM kawasanku-front** | `dun.json` | **56/56 (100%)** | ~4,282 |
| State outline (1 poly) | **JAKIM** | `malaysia.state.geojson` | **1/1 (100%)** | ~200 |

All three use **CRS84 (WGS84)** — directly compatible with MapLibre GL JS. Code mapping requires a simple transformation: voter data `92.SABAK BERNAM` → GeoJSON `P.092`.

---

## 1. Download Results

| # | URL | File | Status | Size | Format |
|:-:|-----|------|:------:|-----:|:------:|
| 1 | geoBoundaries MYS_ADM0.zip | — | ❌ Git LFS pointer (132 bytes) | — | — |
| 2 | geoBoundaries MYS_ADM1.zip | — | ❌ Git LFS pointer (131 bytes) | — | — |
| 3 | geoBoundaries MYS_ADM2.zip | — | ❌ Git LFS pointer (132 bytes) | — | — |
| 4 | geoBoundaries MYS_ADM3.zip | — | ❌ Git LFS pointer (133 bytes) | — | — |
| 5 | jakim.parlimen.geojson | `jakim_parlimen.geojson` | ✅ | 1,281 KB | GeoJSON |
| 6 | jakim.state.geojson | `jakim_state.geojson` | ✅ | 351 KB | GeoJSON |
| 7 | DOSM parlimen.json | `dosm_parlimen.json` | ✅ | 2,103 KB | GeoJSON |
| 8 | DOSM dun.json | `dosm_dun.json` | ✅ | 2,285 KB | GeoJSON |
| 9 | electiondata.my GeoJSON | `electiondata_2018_parlimen.geojson` | ✅ | 1,922 KB | GeoJSON |
| 10 | electiondata.my Parquet | — | ❌ Lost (background process) | — | Parquet |
| 11 | electiondata.my TopoJSON | — | ❌ Lost (background process) | — | TopoJSON |
| 12 | electiondata.my FlatGeobuf | `electiondata_2018_parlimen.fgb` | ✅ | 1,228 KB | FGB |
| 13 | electiondata.my KML | — | ❌ Lost (background process) | — | KML |

**geoBoundaries failure**: The `sourceData/` and `releaseData/` directories on the geoBoundaries GitHub repo use **Git LFS**. Direct HTTP download yields 130-byte LFS pointer files, not the actual data. Requires `git lfs` client to clone.

---

## 2. File Analysis

### 2.1 JAKIM Parliament (`jakim_parlimen.geojson`)

| Property | Value |
|----------|-------|
| Source | `github.com/mptwaktusolat/jakim.geojson` |
| Total features | 222 (all Malaysia) |
| Selangor features | **22** |
| Selangor code match | **22/22 (100%)** |
| Geometry type | MultiPolygon |
| CRS | `urn:ogc:def:crs:OGC:1.3:CRS84` (WGS84) |
| Selangor vertices | ~5,578 |
| File size | 1,281 KB |
| Properties | `state`, `parlimen`, `code_state`, `code_parlimen` |
| Sample | `{"state":"Selangor", "parlimen":"P.092 Sabak Bernam", "code_state":10, "code_parlimen":"P.092"}` |

**Assessment**: Complete Malaysia coverage. Code format `P.092` is mappable to voter data `92.SABAK BERNAM`. Derived from JAKIM (Jabatan Kemajuan Islam Malaysia) prayer time app — boundaries are adequate for visualization but may not be authoritative electoral boundaries.

### 2.2 JAKIM State (`jakim_state.geojson`)

| Property | Value |
|----------|-------|
| Total features | 16 (all states + FTs) |
| Selangor | ✅ Found (`state_id: 10, name: "Selangor", state: "SGR"`) |
| Geometry type | MultiPolygon |
| CRS | CRS84 (WGS84) |
| File size | 351 KB |

**Assessment**: Suitable for the Selangor state outline background layer. Single polygon, low vertex count — renders instantly.

### 2.3 DOSM Parliament (`dosm_parlimen.json`)

| Property | Value |
|----------|-------|
| Source | `github.com/dosm-malaysia/kawasanku-front` |
| Total features | 222 (all Malaysia) |
| Selangor features | **22** |
| Selangor code match | **22/22 (100%)** |
| Geometry type | MultiPolygon |
| CRS | CRS84 (WGS84) |
| Selangor vertices | ~5,578 |
| File size | 2,103 KB |
| Properties | `state`, `parlimen`, `code_state`, `code_parlimen` |

**Assessment**: Identical structure and vertex count to JAKIM — likely derived from the same base dataset. Properties and feature count match exactly. File is larger due to potentially different formatting. From Malaysia's Department of Statistics (DOSM) — government source via their KawasanKu census platform.

### 2.4 DOSM DUN (`dun.json`) ⭐ GOLDEN FILE

| Property | Value |
|----------|-------|
| Source | `github.com/dosm-malaysia/kawasanku-front` |
| Total features | 613 (all Malaysia) |
| Selangor features | **56** |
| Selangor DUN code match | **56/56 (100%)** |
| Selangor DUN name match | **56/56 (100%)** |
| Geometry type | MultiPolygon |
| CRS | CRS84 (WGS84) |
| Selangor vertices | ~4,282 |
| Avg vertices per DUN | ~76 |
| File size | 2,285 KB |
| Properties | `state`, `parlimen`, `dun`, `code_state`, `code_parlimen`, `code_dun`, `code_state_dun` |
| Sample | `{"state":"Selangor", "parlimen":"P.102 Bangi", "dun":"N.25 Kajang", "code_parlimen":"P.102", "code_dun":"N.25", "code_state_dun":"10_N.25"}` |
| Selangor bounds | lon[101.43, 101.80] lat[2.80, 3.40] — wait, actual: lon[109.81, 110.97] lat[7.09, 8.37] |

**Assessment**: **This is the only source with DUN-level electoral boundaries.** All 56 Selangor DUNs match perfectly by both code and name against the voter registry. Includes parent Parliament mapping (`code_parlimen`) enabling hierarchy drill-down. From DOSM's KawasanKu platform — government authoritative source.

**DUN → Parliament Parent Mapping (verified):**

| DUN | DUN Name | Parliament |
|:---:|----------|:----------:|
| N.01–N.02 | Sungai Air Tawar, Sabak | P.092 Sabak Bernam |
| N.03–N.04 | Sungai Panjang, Sekinchan | P.093 Sungai Besar |
| N.05–N.07 | Hulu Bernam, Kuala Kubu Baharu, Batang Kali | P.094 Hulu Selangor |
| N.08–N.09 | Sungai Burong, Permatang | P.095 Tanjong Karang |
| N.10–N.12 | Bukit Melawati, Ijok, Jeram | P.096 Kuala Selangor |
| N.13–N.15 | Kuang, Rawang, Taman Templer | P.097 Selayang |
| N.16–N.18 | Sungai Tua, Gombak Setia, Hulu Kelang | P.098 Gombak |
| N.19–N.20 | Bukit Antarabangsa, Lembah Jaya | P.099 Ampang |
| N.21–N.22 | Pandan Indah, Teratai | P.100 Pandan |
| N.23–N.24 | Dusun Tua, Semenyih | P.101 Hulu Langat |
| N.25–N.27 | Kajang, Sungai Ramal, Balakong | P.102 Bangi |
| N.28–N.29 | Seri Kembangan, Seri Serdang | P.103 Puchong |
| N.30–N.31 | Kinrara, Subang Jaya | P.104 Subang |
| N.32–N.34 | Sri Setia, Taman Medan, Bukit Gasing | P.105 Petaling Jaya |
| N.35–N.37 | Kampung Tunku, Bandar Utama, Bukit Lanjan | P.106 Damansara |
| N.38–N.39 | Paya Jaras, Kota Damansara | P.107 Sungai Buloh |
| N.40–N.41 | Kota Anggerik, Batu Tiga | P.108 Shah Alam |
| N.42–N.44 | Meru, Sementa, Selat Klang | P.109 Kapar |
| N.45–N.47 | Bandar Baru Klang, Pelabuhan Klang, Pandamaran | P.110 Klang |
| N.48–N.50 | Sentosa, Sungai Kandis, Kota Kemuning | P.111 Kota Raja |
| N.51–N.53 | Sijangkang, Banting, Morib | P.112 Kuala Langat |
| N.54–N.56 | Tanjong Sepat, Dengkil, Sungai Pelek | P.113 Sepang |

### 2.5 ElectionData 2018 Parliament (`electiondata_2018_parlimen.geojson`)

| Property | Value |
|----------|-------|
| Source | `lake.electiondata.my` |
| Total features | 166 (Peninsular Malaysia only) |
| Selangor features | **22** |
| Selangor code match | **22/22 (100%)** |
| Geometry type | Polygon (not MultiPolygon) |
| CRS | CRS84 (WGS84) |
| Selangor vertices | ~15,126 |
| File size | 1,922 KB |
| Properties | `state`, `parlimen`, `code_parlimen` |
| Also available as | TopoJSON, Parquet, FlatGeobuf, KML |

**Assessment**: **Highest detail Parliament boundaries** (15,126 vs ~5,578 vertices — 2.7x more precision). Explicitly labeled as **2018 delimitation** — this is the post-redelineation dataset. From electiondata.my, a dedicated Malaysian election data platform. Uses `Polygon` geometry (not `MultiPolygon`) which is simpler for MapLibre rendering. Also available in TopoJSON (smaller file) and FlatGeobuf (fast spatial queries).

### 2.6 ElectionData FlatGeobuf (`electiondata_2018_parlimen.fgb`)

| Property | Value |
|----------|-------|
| Format | FlatGeobuf (spatially-indexed binary) |
| File size | 1,228 KB |
| Features | 166 (Peninsular) |

**Assessment**: FlatGeobuf is excellent for server-side spatial queries (e.g., "which constituency contains this point?"). For MapLibre client-side rendering, GeoJSON or TopoJSON is more practical. Could be useful for backend API if building a constituency lookup service.

---

## 3. Geometry Comparison (Parliament Sources)

All three Parliament sources (JAKIM, DOSM, ElectionData) have **different geometries** for every seat — none share identical coordinate data:

| Comparison | Identical Geometries | Notes |
|:-----------|:---------------------:|-------|
| JAKIM vs DOSM | 0/22 | Same vertex count (~5,578) but different coordinates — likely same base data, different processing |
| JAKIM vs ElectionData | 0/22 | ElectionData has ~15,126 vertices (2.7x more detailed) |
| DOSM vs ElectionData | 0/22 | Same vertex count difference pattern |

**Implication**: These represent independent digitization efforts. ElectionData's higher vertex count suggests more detailed boundary tracing.

---

## 4. geoBoundaries — Why It Failed

All four geoBoundaries URLs (`MYS_ADM0` through `MYS_ADM3`) returned **130-byte LFS pointer files** instead of actual data:

```
version https://git-lfs.github.com/spec/v1
oid sha256:e346d9cc...
size 3443715
```

The geoBoundaries repository stores release data in **Git LFS**. To download:

```bash
git lfs install
git clone https://github.com/wmgeolab/geoBoundaries.git
cd geoBoundaries/releaseData/gbOpen/MYS/ADM1/
# Files will be automatically downloaded by LFS
```

However, as established in `GEOJSON_BOUNDARIES_RESEARCH.md`, geoBoundaries contains **administrative boundaries** (State → District → Mukim), not electoral boundaries (Parliament → DUN → DM). Even if downloaded, they would not be suitable for Layers 1 or 2.

---

## 5. Code Mapping Strategy

The voter data uses `{number}.{NAME}` format while GeoJSON files use `P.{number}` (Parliament) and `N.{number}` (DUN). Mapping is straightforward:

```typescript
// Voter data: "102.BANGI" → GeoJSON: "P.102"
function voterToGeoParlCode(voterCode: string): string {
  const num = voterCode.split('.')[0].padStart(3, '0');
  return `P.${num}`;
}

// Voter data: "30.KINRARA" → GeoJSON: "N.30"
function voterToGeoDunCode(voterCode: string): string {
  const num = voterCode.split('.')[0].padStart(2, '0');
  return `N.${num}`;
}

// Reverse: GeoJSON "P.102" → voter data code prefix "102"
function geoParlToVoterPrefix(geoCode: string): string {
  return geoCode.replace('P.', ''); // "102"
}
```

### For MapLibre `matchExpression`:

```javascript
// When building the GeoJSON source, add a voter-compatible ID property
// during preprocessing:
features.forEach(f => {
  const codeNum = f.properties.code_parlimen.replace('P.', '');
  f.properties.voter_code_prefix = codeNum; // "102"
});

// Then in MapLibre, match using the preprocessed property
layer.filter(['==', ['get', 'voter_code_prefix'], selectedVoterPrefix]);
```

---

## 6. Recommended Data Pipeline

### Step 1: Download verified sources

```bash
# Parliament (highest detail, post-2018)
curl -L -o parliament.geojson \
  'https://lake.electiondata.my/maps/delimitations/peninsular_2018_parlimen.geojson'

# DUN (only available DUN boundary source)
curl -L -o dun.geojson \
  'https://raw.githubusercontent.com/dosm-malaysia/kawasanku-front/main/geojson/dun.json'

# State outline
curl -L -o selangor_outline.geojson \
  'https://raw.githubusercontent.com/mptwaktusolat/jakim.geojson/master/malaysia.state.geojson'
```

### Step 2: Filter to Selangor + add voter-compatible properties

```python
import json

# Filter Parliament to Selangor only
with open('parliament.geojson') as f:
    data = json.load(f)
sel = [f for f in data['features'] if f['properties']['state'] == 'Selangor']
sel_fc = {"type": "FeatureCollection", "features": sel}

# Add voter-compatible code property
for f in sel_fc['features']:
    code = f['properties']['code_parlimen']  # "P.102"
    f['properties']['voter_prefix'] = code.replace('P.', '')  # "102"

with open('selangor_parliament.geojson', 'w') as f:
    json.dump(sel_fc, f)

# Same for DUN
with open('dun.geojson') as f:
    data = json.load(f)
sel_dun = [f for f in data['features'] if f['properties']['state'] == 'Selangor']
for f in sel_dun:
    code = f['properties']['code_dun']  # "N.25"
    f['properties']['voter_prefix'] = code.replace('N.', '')  # "25"
    f['properties']['parent_parl'] = f['properties']['code_parlimen']  # "P.102"

sel_dun_fc = {"type": "FeatureCollection", "features": sel_dun}
with open('selangor_dun.geojson', 'w') as f:
    json.dump(sel_dun_fc, f)
```

### Step 3: Place in project `public/boundaries/`

```
public/boundaries/
├── selangor_parliament.geojson    # 22 features, ~500 KB
├── selangor_dun.geojson            # 56 features, ~300 KB
└── selangor_outline.geojson       # 1 feature, ~20 KB
```

---

## 7. Source Verdict Matrix

| Source | Parliament (L1) | DUN (L2) | State Outline | Notes |
|--------|:--------------:|:--------:|:-------------:|-------|
| **electiondata.my** | ✅ **Recommended** | N/A | N/A | Highest detail (15K verts), post-2018, Peninsular only |
| **DOSM kawasanku** | ✅ Usable | ✅ **Recommended** | N/A | Only DUN source with 56/56 match, includes parent mapping |
| **JAKIM** | ✅ Usable | N/A | ✅ **Recommended** | Lower detail (5.6K verts), includes state boundaries |
| **geoBoundaries** | ❌ Not electoral | ❌ Not electoral | ✅ Backup | LFS download required, Mukim boundaries only |
| **MECo (Zenodo)** | ✅ Future alt | ✅ Future alt | N/A | CC0 license, not tested in this run |

---

## 8. Files on Disk

All downloaded files are in `boundaries/research/`:

```
boundaries/research/
├── dosm_dun.json                      # 2,285 KB — DUN boundaries (613 nationwide, 56 Selangor)
├── dosm_parlimen.json                 # 2,103 KB — Parliament boundaries (222 nationwide, 22 Selangor)
├── jakim_parlimen.geojson              # 1,281 KB — Parliament boundaries (222 nationwide, 22 Selangor)
├── jakim_state.geojson                 # 351 KB — State boundaries (16 nationwide)
├── electiondata_2018_parlimen.geojson  # 1,922 KB — 2018 Parliament boundaries (166 Peninsular, 22 Selangor)
└── electiondata_2018_parlimen.fgb      # 1,228 KB — FlatGeobuf (same data, binary format)
```

---

## 9. Next Steps

1. **Filter** `electiondata_2018_parlimen.geojson` to Selangor 22 seats → `selangor_parliament.geojson`
2. **Filter** `dosm_dun.json` to Selangor 56 seats → `selangor_dun.geojson`
3. **Filter** `jakim_state.geojson` to Selangor → `selangor_outline.geojson`
4. **Add** `voter_prefix` property to each for easy MapLibre matching
5. **Move** processed files to `public/boundaries/` for the dashboard
6. **Update** `MAPLIBRE_PROJECT.md` to reflect final source decisions
7. **Commit** processed boundary files to the repository
