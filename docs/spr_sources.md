# SPR Official Sources Index

**Purpose**: Index of official Election Commission of Malaysia (SPR) documents that serve as the authoritative legal basis for the electoral boundaries used in this project.  
**Note**: This repository does **not** currently contain copies of SPR's official documents. The index below is provided as a reference for obtaining them.

---

## 2018 Delimitation — Peninsular Malaysia

This is the most recent delimitation exercise affecting Selangor's 22 Parliamentary and 56 DUN constituencies.

### Gazette Notices

| Document | Description | Status |
|----------|-------------|:------:|
| Federal Gazette P.U.(A) XXX/2018 | Notice of Delimitation of Parliamentary and State Legislative Assembly Constituencies — Peninsular Malaysia | Not yet obtained |
| Federal Gazette P.U.(A) XXX/2018 (Maps) | Accompanying boundary maps for the 2018 delimitation | Not yet obtained |

### SPR Official Publications

| Document | Description | Status |
|----------|-------------|:------:|
| Laporan Suruhanjaya Pilihan Raya — Peninjauan Semula Sempadan (2018) | SPR's official delimitation report with rationale, maps, and statistics | Not yet obtained |
| SPR website: http://www.spr.gov.my | Official portal for electoral information and publications | Available online |

### Where to Obtain

1. **SPR Official Website**: http://www.spr.gov.my — search for "Pemilihan Umum" or "Peninjauan Sempadan"
2. **Attorney General's Chambers (AGC)**: https://www.agc.gov.my — Federal Gazette archive
3. **Malaysian Parliament Library**: Physical copies may be available
4. **SPR Physical Office**: Suruhanjaya Pilihan Raya, Putrajaya

---

## 2019 Delimitation — Sabah

| Document | Description | Relevance to Selangor |
|----------|-------------|:---------------------:|
| Federal Gazette (2019) | Sabah parliamentary and state seat delimitation | None — listed for completeness |

---

## 2015 Delimitation — Sarawak

| Document | Description | Relevance to Selangor |
|----------|-------------|:---------------------:|
| Federal Gazette (2015) | Sarawak state seat delimitation | None — listed for completeness |

---

## Key SPR Legal Framework

These are the enabling laws under which delimitation exercises are conducted:

| Law | Relevance |
|-----|-----------|
| **Federal Constitution, Part VIII** (Articles 113–120) | Establishes the Election Commission and its delimitation powers |
| **Thirteenth Schedule** | Rules for delimitation (equal voter count, malapportionment tolerances, consideration of local ties) |
| **Election Act 1958 (Act 19)** | Operational provisions for conducting elections and maintaining the electoral roll |

---

## How to Add Official Documents to This Repo

If you obtain SPR's official gazette notices or scanned maps:

1. Place PDF scans in `data/spr_official/` (e.g. `2018_peninsular_delimitation_notice.pdf`)
2. Place map scans in `data/spr_official/2018_peninsular_maps_scan/`
3. Update this index with the exact file names, dates, and Gazette numbers
4. Cross-reference the derived GeoJSON files in `docs/provenance.md` to these official documents

```
data/spr_official/
├── 2018_peninsular_delimitation_notice.pdf    # Gazette P.U.(A) XXX/2018
└── 2018_peninsular_maps_scan/
    ├── P092_Sabak_Bernam.png
    ├── P093_Sungai_Besar.png
    ├── ...
    └── P113_Sepang.png
```

---

## Related Documents

- [`provenance.md`](./provenance.md) — Full provenance and metadata for all derived boundary files
- [`GEOJSON_BOUNDARIES_RESEARCH.md`](../GEOJSON_BOUNDARIES_RESEARCH.md) — Technical boundary validation report
- [`BOUNDARY_SOURCES_RESEARCH.md`](../BOUNDARY_SOURCES_RESEARCH.md) — Source comparison and download results
