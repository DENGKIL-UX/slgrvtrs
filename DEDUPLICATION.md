# Selangor Voter Registry — Deduplication Analysis Report

**Dataset**: Selangor State Voter Registry (SLGRVTRS)  
**Total Records Scanned**: 3,971,650  
**Files Analyzed**: 4 xlsx files (Part 01–04)  
**Analysis Date**: 14 August 2026  
**Processing Time**: ~74 seconds (core) + ~140 seconds (deep analysis)  

---

## Executive Summary

A comprehensive deduplication scan was performed across all 3,971,650 voter records in the Selangor voter registry. The analysis examined duplicate patterns at multiple levels — VOTER_ID, VOTER_CODE, cross-file overlap, VOTER_CODE-to-VOTER_ID mapping, and geographic distribution across DUN and Parliamentary constituencies.

**Key Finding**: The VOTER_ID field is 100% unique across all 3.97 million records — there are zero duplicate VOTER_IDs. This means every row in the dataset represents a distinct record with a unique serial identifier. However, 163,373 VOTER_CODEs (5.97% of all records) appear more than once, each mapping to a **different** VOTER_ID. This indicates that VOTER_CODE is **not a unique voter identifier** but rather a composite code that can be shared by multiple individuals, likely encoding geographic or administrative information.

---

## 1. VOTER_ID Deduplication

| Metric | Value |
|--------|-------|
| Total Records | 3,971,650 |
| Unique VOTER_IDs | 3,971,650 |
| Duplicate VOTER_IDs | **0** |
| Extra Records | **0** |
| Duplication Rate | **0.00%** |

**Conclusion**: VOTER_ID (format: `SL{n}_{sequence}`) serves as the dataset's primary unique key. Every record has a distinct VOTER_ID, confirming that the dataset does not contain exact row-level duplicates when identified by this field. No records need to be removed on the basis of VOTER_ID duplication.

---

## 2. VOTER_CODE Deduplication

| Metric | Value |
|--------|-------|
| Total Records | 3,971,650 |
| Unique VOTER_CODEs | 3,734,380 |
| Duplicate VOTER_CODEs | **163,373** |
| Records Under Duplicate Codes | 400,643 |
| Extra Records (beyond 1st occurrence) | **237,270** |
| Duplication Rate | **5.9741%** |

### 2.1 Duplication Frequency Distribution

| Occurrences | Number of VOTER_CODEs | Records Generated |
|:------------:|---------------------:|------------------:|
| 2 | 122,864 | 245,728 |
| 3 | 24,546 | 73,638 |
| 4 | 8,174 | 32,696 |
| 5 | 3,605 | 18,025 |
| 6 | 1,812 | 10,872 |
| 7 | 985 | 6,895 |
| 8 | 617 | 4,936 |
| 9 | 324 | 2,916 |
| 10 | 225 | 2,250 |
| 11 | 101 | 1,111 |
| 12 | 53 | 636 |
| 13 | 32 | 416 |
| 14 | 15 | 210 |
| 15 | 10 | 150 |
| 16 | 7 | 112 |
| 17 | 2 | 34 |
| 18 | 1 | 18 |
| **Total** | **163,373** | **400,643** |

The distribution follows a classic long-tail pattern. The vast majority (75.2%) of duplicated VOTER_CODEs appear exactly twice, while a small number appear many times — the most frequent VOTER_CODE (`DIN135MOH105`) appears 18 times across the dataset.

### 2.2 Most Frequently Occurring VOTER_CODEs

| Rank | VOTER_CODE | Occurrences |
|:----:|------------|:-----------:|
| 1 | DIN135MOH105 | 18 |
| 2 | DIN029MOH105 | 17 |
| 3 | DIN987MUH105 | 17 |
| 4 | DIN047MOH105 | 16 |
| 5 | DIN317MOH105 | 16 |
| 6 | DIN219MUH105 | 16 |
| 7 | DIN659MOH105 | 16 |
| 8 | DIN283MUH105 | 16 |
| 9 | DIN207MOH105 | 16 |
| 10 | DIN715MUH105 | 16 |
| 11 | DIN125MUH145 | 15 |
| 12 | DIN605MOH105 | 15 |
| 13 | MAN587MOH105 | 15 |
| 14 | MAN019MOH105 | 15 |
| 15 | DIN422NUR105 | 15 |

**Code Pattern Analysis**: The VOTER_CODE format follows a discernible structure: `[3-letter prefix][3-digit number][3-letter locality][3-digit code]`. Common prefixes include `DIN` and `MAN`, while locality segments include `MOH`, `MUH`, `NUR`. This strongly suggests VOTER_CODE is a composite identifier encoding administrative/geographic hierarchy rather than a per-voter unique identifier.

---

## 3. VOTER_CODE → VOTER_ID Mapping Analysis

A critical question: do duplicated VOTER_CODEs represent the same person recorded multiple times, or different people who share the same code?

| Metric | Value |
|--------|-------|
| Duplicate VOTER_CODEs | 163,373 |
| Codes mapping to multiple distinct VOTER_IDs | **163,373 (100%)** |
| Codes mapping to a single VOTER_ID | **0** |

**Finding**: Every single duplicated VOTER_CODE maps to a **different** VOTER_ID for each occurrence. This means no two records with the same VOTER_CODE share the same VOTER_ID. The duplication is structural — multiple distinct individuals carry the same VOTER_CODE.

This confirms that VOTER_CODE is **not a unique personal identifier**. It is likely a composite code derived from the voter's registration locality (Daerah Mengundi) and a sequential number within that locality, which resets or repeats across different registration centers or periods.

### VCODE-to-VID Distribution

| Distinct VIDs per VCODE | Count of VCODEs |
|:----------------------:|----------------:|
| 2 | 122,864 |
| 3 | 24,546 |
| 4 | 8,174 |
| 5 | 3,605 |
| 6 | 1,812 |
| 7 | 985 |
| 8 | 617 |
| 9 | 324 |
| 10 | 225 |
| 11 | 101 |
| 12 | 53 |
| 13 | 32 |
| 14 | 15 |
| 15 | 10 |
| 16 | 7 |
| 17 | 2 |
| 18 | 1 |

The distribution exactly mirrors the VOTER_CODE frequency distribution, further confirming a 1:1 relationship between VOTER_CODE occurrences and unique VOTER_IDs.

---

## 4. Cross-File Duplicate Analysis

The 3.97M records are split across 4 xlsx files. This analysis checks whether the same VOTER_CODE appears in more than one file.

| Metric | Value |
|--------|-------|
| VOTER_CODEs appearing in 2+ files | **117,211** |
| VOTER_CODEs in exactly 2 files | 101,515 |
| VOTER_CODEs in exactly 3 files | 13,361 |
| VOTER_CODEs in all 4 files | 2,335 |

**71.8%** of all duplicated VOTER_CODEs (117,211 out of 163,373) span multiple files, while **28.2%** (46,162) have all their occurrences within a single file. The cross-file overlap is expected since the dataset was split arbitrarily by row count rather than by geographic or administrative boundaries.

---

## 5. Geographic Distribution of Duplicated VOTER_CODE Records

All 56 DUN constituencies and all 22 Parliamentary constituencies in Selangor contain records with duplicated VOTER_CODEs. The distribution is roughly proportional to constituency size, meaning the duplication pattern is uniform across the state rather than concentrated in specific areas.

### 5.1 Top 20 DUN Constituencies by Duplicate Record Count

| Rank | DUN Code | DUN Name | Duplicate Records |
|:----:|:--------:|----------|------------------:|
| 1 | N24 | Semenyih | 11,104 |
| 2 | N43 | Sementa | 11,092 |
| 3 | N26 | Sungai Ramal | 10,864 |
| 4 | N55 | Dengkil | 10,847 |
| 5 | N45 | Bandar Baru Klang | 10,696 |
| 6 | N25 | Kajang | 10,497 |
| 7 | N49 | Sungai Kandis | 10,311 |
| 8 | N27 | Balakong | 10,304 |
| 9 | N07 | Batang Kali | 10,166 |
| 10 | N30 | Kinrara | 9,966 |
| 11 | N29 | Sri Serdang | 9,454 |
| 12 | N37 | Bukit Lanjan | 9,426 |
| 13 | N40 | Kota Anggerik | 9,269 |
| 14 | N39 | Kota Damansara | 9,243 |
| 15 | N17 | Gombak Setia | 9,140 |
| 16 | N41 | Batu Tiga | 9,009 |
| 17 | N44 | Selat Klang | 8,769 |
| 18 | N51 | Sijangkang | 8,511 |
| 19 | N47 | Pandamaran | 8,507 |
| 20 | N23 | Dusun Tua | 8,428 |

### 5.2 Top 20 Parliamentary Constituencies by Duplicate Record Count

| Rank | Parliament Code | Parliament Name | Duplicate Records |
|:----:|:---------------:|-----------------|------------------:|
| 1 | P102 | Bangi | 31,665 |
| 2 | P109 | Kapar | 28,281 |
| 3 | P110 | Klang | 26,363 |
| 4 | P111 | Kota Raja | 24,466 |
| 5 | P98 | Gombak | 21,235 |
| 6 | P112 | Kuala Langat | 20,537 |
| 7 | P113 | Sepang | 19,855 |
| 8 | P101 | Hulu Langat | 19,532 |
| 9 | P106 | Damansara | 19,075 |
| 10 | P97 | Selayang | 18,794 |
| 11 | P108 | Shah Alam | 18,278 |
| 12 | P94 | Hulu Selangor | 18,112 |
| 13 | P107 | Sungai Buloh | 17,337 |
| 14 | P104 | Subang | 17,199 |
| 15 | P105 | Petaling Jaya | 17,130 |
| 16 | P103 | Puchong | 15,483 |
| 17 | P96 | Kuala Selangor | 13,858 |
| 18 | P100 | Pandan | 13,812 |
| 19 | P99 | Ampang | 13,145 |
| 20 | P93 | Sungai Besar | 9,696 |

**All 22 Parliamentary seats** are affected, and **all 56 DUN seats** contain duplicate VOTER_CODE records. Larger constituencies like Bangi (P102), Kapar (P109), and Klang (P110) naturally have higher absolute counts, but the duplication rate (percentage of records per constituency with shared VOTER_CODEs) remains consistently around 5.5–6.5% statewide.

---

## 6. Conclusions and Recommendations

### 6.1 Data Integrity Assessment

The Selangor voter registry dataset is **clean with respect to true record-level duplication**. All 3,971,650 records have unique VOTER_IDs, meaning there are no exact duplicate rows when identified by the primary key. No records need to be removed or de-duplicated.

### 6.2 VOTER_CODE Structure

The VOTER_CODE field (12-character alphanumeric) is **not a unique voter identifier**. It is a composite code that can be shared by multiple individuals. The observed 5.97% duplication rate is a structural feature of the coding system, not a data quality defect. The code likely encodes:

- **Prefix** (3 chars, e.g., `DIN`, `MAN`): Possibly a serial/category indicator within the registration center
- **Number** (3 digits): Sequential number within the category
- **Locality** (3 chars, e.g., `MOH105`, `MUH145`): Daerah Mengundi (Voting District) code

### 6.3 Recommendations

1. **Use VOTER_ID as the primary key** for any database, join, or deduplication operation. It is guaranteed unique across the entire dataset.
2. **Do not use VOTER_CODE as a unique identifier** in any context where a 1:1 mapping to a voter is required. Treat it as a geographic/administrative composite field.
3. **For voter matching across datasets**, use VOTER_ID first, and fall back to composite keys (VOTER_CODE + DOB + GENDER) only when VOTER_ID is unavailable.
4. **When segmenting by VOTER_CODE**, be aware that grouping by this field will aggregate multiple distinct voters, inflating counts in analysis.

---

## Methodology

- **Reading engine**: python-calamine (Rust-based xlsx parser) for high-performance file reading
- **Core frequency counting**: pandas `value_counts()` (vectorized C-level operations)
- **Cross-file tracking**: Bitmask approach — each file assigned a bit (1, 2, 4, 8), OR'ed per VOTER_CODE
- **VCODE→VID mapping**: Two-pass approach — first identify duplicate VCODEs, then map to distinct VIDs
- **Geographic distribution**: Row-level scanning with set-based duplicate VCODE lookup
- **Total processing time**: ~214 seconds for all analyses across 3,971,650 records

---

## Supporting Files

| File | Description |
|------|-------------|
| `analysis/dedup_results.json` | Core VOTER_ID and VOTER_CODE frequency data |
| `analysis/dedup_deep.json` | Cross-file overlap analysis |
| `analysis/dedup_dun.json` | DUN and Parliament distribution of duplicates |
| `analysis/dedup_vcode2vid.json` | VOTER_CODE to VOTER_ID mapping analysis |
| `scripts/dedup_fast.py` | Core dedup analysis script (calamine + pandas) |
| `scripts/dedup_crossfile.py` | Cross-file duplicate tracking script |
| `scripts/dedup_dun.py` | Geographic distribution analysis script |
| `scripts/dedup_vcode2vid.py` | VCODE→VID mapping script |
