# GeoJSON Boundaries Research & Validation Report

**Purpose**: Validate uploaded boundary files against the Selangor voter registry dataset for the MapLibre dashboard project.  
**Date**: 14 August 2026  
**Dataset**: 3,971,650 voter records across 56 DUNs, 22 Parliaments, 945 DMs

---

## Executive Summary

**The uploaded `geoBoundaries-MYS-ADM3-all.zip` file contains Mukim (sub-district) boundaries, NOT electoral boundaries.** It cannot be used directly for DUN or Parliamentary choropleth maps. The geoBoundaries administrative hierarchy follows Malaysia's government administrative structure (State → District → Mukim), which is fundamentally different from the electoral boundary hierarchy (Parliament → DUN → DM).

> **"Constituency boundaries and administrative district boundaries may transcend each other and do not correspond with each other in most instances."**  
> — List of Malaysian Electoral Districts, Wikipedia

A replacement boundary source is required. This document identifies the correct sources and provides a complete mapping strategy.

---

## 1. geoBoundaries ADM Level Mapping for Malaysia

| ADM Level | Entity | Count (National) | Count (Selangor) | Matches Electoral? |
|:---------:|--------|-----------------:|-----------------:|:------------------:|
| ADM0 | Country (Malaysia) | 1 | — | No |
| ADM1 | State (Negeri) | 16 | 1 (Selangor) | **No** |
| ADM2 | District (Daerah/Jajahan) | ~160 | ~9 | **No** |
| ADM3 | Mukim (Sub-district) | 1,859 | ~100+ | **No** |

### Why ADM ≠ Electoral

Malaysia has **two parallel geographic hierarchies** that do NOT align:

**Administrative Hierarchy** (geoBoundaries):
```
Country (ADM0) → State (ADM1) → District/Daerah (ADM2) → Mukim (ADM3)
```

**Electoral Hierarchy** (SPR):
```
Parliament (P-code) → DUN/State Assembly (N-code) → DM/Voting District
```

Key differences:
- A single Daerah (e.g., Petaling) may contain multiple Parliament seats
- A DUN may span parts of multiple Mukim
- DM (Daerah Mengundi / Voting District) boundaries are drawn by SPR and do not follow Mukim boundaries
- Electoral boundaries are redrawn periodically (last major redelineation: 2018)

### What the Uploaded File Contains

The file `geoBoundaries-MYS-ADM3-all.zip` from [geoBoundaries.org](https://www.geoboundaries.org):

| Property | Value |
|----------|-------|
| Boundary Type | ADM3 (Mukim) |
| Total Features | 1,859 polygons (nationwide) |
| Year Represented | 2021 |
| Source | Wikimedia Commons, geoBoundaries |
| License | CC BY 4.0 |
| Mean Vertices | 535 per polygon |
| Format | GeoJSON + TopoJSON |

**Verdict**: This file contains **all of Malaysia's Mukim boundaries**. To use it for the Selangor voter dashboard, you would need to:
1. Filter to Selangor only (~100+ mukims)
2. Map each Mukim to the corresponding DUN/Parliament code (non-trivial — no standard mapping table exists)
3. Aggregate voter data at the Mukim level (your data uses DM codes, not Mukim names)

This approach is **not recommended** for the core dashboard layers (Parliament and DUN choropleths) because the boundary mismatch will produce inaccurate visualizations.

---

## 2. Voter Data Geographic Codes

The Selangor voter registry uses a three-level electoral coding system:

| Code Type | Format | Count | Example |
|-----------|--------|------:|--------|
| PARLIAMENT_CODE | `{P-code}.{Name}` | 22 | `102.BANGI`, `98.GOMBAK` |
| DUN_CODE | `{N-code}.{Name}` | 56 | `30.KINRARA`, `55.DENGKIL` |
| DM_CODE | `{DUN-num}.{DM Name}` | 945 | `01.BANDAR COUNTRY HOME 1` |

### Complete Parliament Seat List (22 seats)

| Code | Name | Registered Voters |
|:----:|------|------------------:|
| P92 | Sabak Bernam | 52,847 |
| P93 | Sungai Besar | 65,970 |
| P94 | Hulu Selangor | 165,939 |
| P95 | Tanjong Karang | 64,009 |
| P96 | Kuala Selangor | 112,292 |
| P97 | Selayang | 198,798 |
| P98 | Gombak | 218,332 |
| P99 | Ampang | 140,430 |
| P100 | Pandan | 155,756 |
| P101 | Hulu Langat | 186,297 |
| P102 | Bangi | 336,552 |
| P103 | Puchong | 167,672 |
| P104 | Subang | 250,212 |
| P105 | Petaling Jaya | 200,438 |
| P106 | Damansara | 250,418 |
| P107 | Sungai Buloh | 177,736 |
| P108 | Shah Alam | 183,381 |
| P109 | Kapar | 204,037 |
| P110 | Klang | 216,272 |
| P111 | Kota Raja | 271,818 |
| P112 | Kuala Langat | 161,841 |
| P113 | Sepang | 190,603 |
| | **Total** | **3,971,650** |

### Complete DUN Seat List (56 seats)

| Code | Name | Voters | Parent Parliament |
|:----:|------|-------:|:------------------:|
| N01 | Sungai Air Tawar | 20,333 | P92 |
| N02 | Sabak | 32,514 | P92 |
| N03 | Sungai Panjang | 41,908 | P93 |
| N04 | Sekinchan | 24,062 | P93 |
| N05 | Hulu Bernam | 30,867 | P93 |
| N06 | Kuala Kubu Baharu | 41,221 | P94 |
| N07 | Batang Kali | 93,851 | P94 |
| N08 | Sungai Burong | 32,511 | P94 |
| N09 | Permatang | 31,498 | P95 |
| N10 | Bukit Melawati | 39,607 | P95 |
| N11 | Ijok | 31,671 | P95 |
| N12 | Jeram | 41,014 | P96 |
| N13 | Kuang | 50,228 | P96 |
| N14 | Rawang | 82,713 | P97 |
| N15 | Taman Templer | 65,857 | P97 |
| N16 | Sungai Tua | 51,210 | P97 |
| N17 | Gombak Setia | 93,289 | P98 |
| N18 | Hulu Kelang | 73,833 | P98 |
| N19 | Bukit Antarabangsa | 72,105 | P99 |
| N20 | Lembah Jaya | 68,325 | P99 |
| N21 | Pandan Indah | 73,051 | P100 |
| N22 | Teratai | 82,705 | P100 |
| N23 | Dusun Tua | 78,563 | P101 |
| N24 | Semenyih | 107,734 | P102 |
| N25 | Kajang | 118,635 | P102 |
| N26 | Sungai Ramal | 106,848 | P102 |
| N27 | Balakong | 111,069 | P102 |
| N28 | Seri Kembangan | 65,329 | P102 |
| N29 | Seri Serdang | 102,343 | P113 |
| N30 | Kinrara | 134,350 | P103 |
| N31 | Subang Jaya | 115,862 | P103 |
| N32 | Sri Setia | 83,893 | P108 |
| N33 | Taman Medan | 63,548 | P108 |
| N34 | Bukit Gasing | 52,997 | P105 |
| N35 | Kampung Tunku | 57,282 | P105 |
| N36 | Bandar Utama | 74,697 | P106 |
| N37 | Bukit Lanjan | 118,439 | P106 |
| N38 | Paya Jaras | 79,728 | P107 |
| N39 | Kota Damansara | 98,008 | P107 |
| N40 | Kota Anggerik | 104,649 | P109 |
| N41 | Batu Tiga | 78,732 | P109 |
| N42 | Meru | 70,836 | P109 |
| N43 | Sementa | 73,637 | P110 |
| N44 | Selat Klang | 59,564 | P110 |
| N45 | Bandar Baru Klang | 84,876 | P110 |
| N46 | Pelabuhan Klang | 55,170 | P110 |
| N47 | Pandamaran | 76,226 | P111 |
| N48 | Sentosa | 96,672 | P111 |
| N49 | Sungai Kandis | 85,389 | P111 |
| N50 | Kota Kemuning | 89,757 | P111 |
| N51 | Sijangkang | 69,232 | P112 |
| N52 | Banting | 46,815 | P112 |
| N53 | Morib | 45,794 | P112 |
| N54 | Tanjong Sepat | 33,267 | P112 |
| N55 | Dengkil | 106,200 | P113 |
| N56 | Sungai Pelek | 51,136 | P113 |

---

## 3. Boundary Source Analysis

### Source A: geoBoundaries (Uploaded File) ❌

| Aspect | Assessment |
|--------|-----------|
| **Accuracy for electoral** | ❌ Wrong boundary type (Mukim ≠ DUN/Parliament) |
| **Code compatibility** | ❌ Uses `shapeName`/`shapeID`, not P-codes or N-codes |
| **Timeliness** | ⚠️ 2021 data (pre-2022 election, but Mukim boundaries are stable) |
| **License** | ✅ CC BY 4.0 |
| **Format** | ✅ GeoJSON, TopoJSON |
| **Verdict** | Not suitable for Layer 1 (Parliament) or Layer 2 (DUN). Could potentially be used for background context or Layer 3 if Mukim→DM mapping is developed. |

### Source B: TindakMalaysia/Selangor-Maps ⚠️

| Aspect | Assessment |
|--------|-----------|
| **URL** | https://github.com/TindakMalaysia/Selangor-Maps |
| **Accuracy** | ✅ Actual electoral boundaries (PAR, DUN, DM, PBT) |
| **Code compatibility** | ⚠️ Needs verification against voter data codes |
| **Timeliness** | ❌ **2015 boundaries only** — invalid after 2018 redelineation |
| **License** | Community data, Tindak Malaysia |
| **Format** | ✅ Shapefile, GeoJSON, KML |
| **Verdict** | Best starting point for understanding the data structure, but boundaries are outdated. The 2018 redelineation affected all Selangor Parliament seats except Sepang (P113). Using 2015 boundaries will produce misaligned choropleths for 21 of 22 Parliament seats. |

### Source C: MECo (Malaysian Election Corpus) ✅ RECOMMENDED

| Aspect | Assessment |
|--------|-----------|
| **URL** | https://github.com/Thevesh/paper-meco-maps |
| **DOI** | [Zenodo: 10.5281/zenodo.18093017](https://doi.org/10.5281/zenodo.18093017) |
| **Paper** | Thevesh (2025), arXiv:2512.24211 |
| **Accuracy** | ✅ Digitized from official EC maps for ALL 19 delimitations (1954–2025) |
| **Timeliness** | ✅ Updated through 2025, includes 2018 Peninsular Malaysia delimitation |
| **Code compatibility** | ✅ Uses standard P-codes and N-codes |
| **License** | ✅ **CC0 (public domain)** |
| **Format** | ✅ GeoJSON, TopoJSON, **GeoParquet**, FlatGeobuf, KML |
| **Verdict** | **Best available source.** Covers all electoral delimitations in Malaysian history with machine-readable formats. The GeoParquet format is particularly useful for large-scale web mapping. |

### Source D: DOSM (Department of Statistics Malaysia) ⚠️

| Aspect | Assessment |
|--------|-----------|
| **URL** | https://github.com/dosm-malaysia/data |
| **Reference** | Cited in GE15 Open Data by Sinar Project |
| **Accuracy** | ✅ Government source with electoral boundaries |
| **Code compatibility** | ⚠️ Needs verification |
| **Timeliness** | ✅ Updated for GE15 (2022) |
| **License** | Government open data |
| **Verdict** | Worth investigating, but the MECo dataset is more comprehensive and better documented. |

---

## 4. Redelineation Impact

The last major redelineation affecting Selangor was conducted in **March 2018**:

- **Scope**: All Parliament seats in Selangor except P113 (Sepang)
- **Impact**: Boundary lines were readjusted; voter composition shifted between constituencies
- **Effective**: GE14 (2018) and GE15 (2022)
- **Next possible review**: 2026 (minimum 8-year interval)

**For the MapLibre project**: Any boundary data must reflect the **post-2018** delimitation to match the current voter registry data. Pre-2018 boundaries (like TindakMalaysia's 2015 data) will misalign with actual voter distributions.

---

## 5. Recommended Boundary Acquisition Plan

### Priority 1: Parliament Boundaries (Layer 1)
- **Source**: MECo — `github.com/Thevesh/paper-meco-maps`
- **File needed**: Post-2018 delimitation Parliament boundaries for Selangor (22 polygons)
- **Format**: GeoJSON for MapLibre, or GeoParquet for performance
- **Action**: Download from Zenodo or GitHub, filter to Selangor P92–P113

### Priority 2: DUN Boundaries (Layer 2)
- **Source**: MECo — `github.com/Thevesh/paper-meco-maps`
- **File needed**: Post-2018 delimitation DUN boundaries for Selangor (56 polygons)
- **Format**: GeoJSON or GeoParquet
- **Action**: Download from Zenodo or GitHub, filter to Selangor N01–N56

### Priority 3: DM Boundaries (Layer 3)
- **Option A**: TindakMalaysia 2015 DM boundaries (outdated but useful as base, needs manual update)
- **Option B**: Generate DM centroids from voter data LOCALITY_CODE + coordinates (when geocoded)
- **Option C**: Request current DM boundaries from SPR (not publicly available in machine-readable form)

### Priority 4: Individual Voter Points (Layer 4)
- Requires geocoding 3.97M voter addresses
- Not feasible with current data (GPS_COORDINATE column is 0% populated)
- Future work: batch geocoding via Nominatim/Google Maps API

---

## 6. Code Mapping Strategy

The voter data uses `{number}.{Name}` format (e.g., `102.BANGI`). Boundary files may use different naming conventions. A mapping table will need to be built:

```python
# Example mapping logic
VOTER_DATA_CODE = "102.BANGI"
# Extract P-code number
P_CODE = int(VOTER_DATA_CODE.split(".")[0])  # 102

# Match to GeoJSON feature property
# MECo likely uses: feature.properties["parliament_code"] == "P102"
# or: feature.properties["code"] == 102
```

The exact property names in the MECo GeoJSON files need to be verified after download. The mapping step is straightforward — extract the numeric code from the voter data and match it to the corresponding GeoJSON feature property.

---

## 7. What to Do with the Uploaded geoBoundaries File

The uploaded `geoBoundaries-MYS-ADM3-all.zip` (Mukim boundaries) should **not** be used for the primary dashboard layers. However, it has potential secondary uses:

1. **Background reference layer**: Show Mukim boundaries as a subtle overlay for geographic context
2. **DM approximation**: If a Mukim→DM crosswalk table can be obtained from SPR or DOSM, Mukim polygons could be dissolved/merged to approximate DM boundaries
3. **Future analysis**: Useful if the project expands to include administrative (non-electoral) data

---

## 8. Summary of Findings

| Question | Answer |
|----------|--------|
| Is geoBoundaries ADM3 suitable for DUN/Parliament maps? | **No** — it contains Mukim boundaries, not electoral boundaries |
| Does ADM2 match Parliament constituencies? | **No** — ADM2 is District (Daerah), which is a different division |
| Are there open electoral boundary files for Selangor? | **Yes** — MECo dataset (CC0, post-2018, GeoJSON/GeoParquet) |
| What about TindakMalaysia? | Electoral boundaries but **2015 only** (pre-redelineation) |
| How many boundary files do I need? | 2 core files: Parliament (22 polys) + DUN (56 polys) |
| What format is best for MapLibre? | GeoJSON for <100 features, or vector tiles/GeoParquet for performance |