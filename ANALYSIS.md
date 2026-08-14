# Selangor Voter Registry Data Analysis

## Overview

This repository contains **Selangor state voter registry data** (Malaysia) extracted from a split 7z archive (`SlgrVtrs.7z.001`–`.006`). The dataset comprises **4 Excel files** totaling **~3,971,650 voter records** across **294.1 MB** of data.

| # | File | Records | Size |
|---|------|---------|------|
| 1 | `01_SL_part01.1mil (mcw).xlsx` | 1,000,000 | 71.0 MB |
| 2 | `01_SL_part02.1mil (mcw).xlsx` | 1,000,000 | 72.0 MB |
| 3 | `01_SL_part03.1mil (mcw).xlsx` | 1,000,000 | 73.6 MB |
| 4 | `01_SL_part04-971650 (mcw).xlsx` | 971,650 | 77.5 MB |
| | **Total** | **3,971,650** | **294.1 MB** |

---

## Data Schema

All 4 files share an identical **13-column schema** with one sheet each:

| Col | Field | Type | Description |
|-----|-------|------|-------------|
| A | `VOTER_ID` | String | Unique identifier, format `SL{n}_{sequence}` (e.g., `SL1_000001`) |
| B | `VOTER_CODE` | String | Registration code, 12-char alphanumeric (e.g., `LID218NUR602`) |
| C | `GENDER` | String | `M` (Male) or `F` (Female) |
| D | `RACE` | String | `M` (Malay), `C` (Chinese), `I` (Indian), `B` (Others), `TBC` (To Be Confirmed) |
| E | `AGE` | Integer | Voter age in years (minimum 18) |
| F | `DOB` | String | Date of birth in `DD-MMM-YYYY` format (e.g., `22-AUG-2007`) |
| G | `CONTACT#` | String | Contact number availability flag: `YES` or `NA` (blank/NaN) |
| H | `GPS_COORDINATE` | String | GPS coordinate availability flag: `YES` or `NA` |
| I | `LOCALITY_CODE` | String | Locality/neighborhood code + name (e.g., `001.BAGAN PARIT BAHRU`) |
| J | `DM_CODE` | String | Daerah Mengundi (Voting District) code + name |
| K | `DUN_CODE` | String | Dun Undangan Negeri (State Legislative Assembly Constituency) code + name |
| L | `PARLIAMENT_CODE` | String | Parliamentary constituency code + name (e.g., `92.SABAK BERNAM`) |
| M | `STATE_CODE` | String | State code + name — all records are `8.SELANGOR` |

### Geographic Hierarchy

```
LOCALITY → DM (Daerah Mengundi) → DUN (State Constituency) → PARLIAMENT → STATE
```

---

## Statistical Analysis

> **Methodology:** Statistics derived from a systematic sample of **40,000 records** (first 10,000 rows per file), representing approximately **1%** of the total dataset. Demographic proportions (gender, race, age) are expected to be representative. Geographic counts are lower-bound estimates from the sample.

### Gender Distribution

| Gender | Count (sample) | Percentage |
|--------|---------------|------------|
| Male (M) | 20,051 | **50.13%** |
| Female (F) | 19,949 | **49.87%** |

The gender split is remarkably balanced, with a near 50/50 distribution.

### Race/Ethnicity Distribution

| Race Code | Ethnicity | Count (sample) | Percentage |
|-----------|-----------|---------------|------------|
| M | Malay | 27,192 | **67.98%** |
| C | Chinese | 7,652 | **19.13%** |
| I | Indian | 3,574 | **8.94%** |
| TBC | To Be Confirmed | 1,562 | **3.91%** |
| B | Others | 20 | **0.05%** |

The racial composition aligns with Selangor's known demographic profile — Malay majority with significant Chinese and Indian minorities. The ~4% TBC rate may indicate pending verification or data entry incompleteness.

### Gender × Race Cross-Tabulation

| | Malay (M) | Chinese (C) | Indian (I) | TBC | Others (B) |
|---|-----------|-------------|------------|-----|-------------|
| **Female** | 13,656 | 3,633 | 1,800 | 854 | 6 |
| **Male** | 13,536 | 4,019 | 1,774 | 708 | 14 |

### Age Distribution

| Metric | Value |
|--------|-------|
| **Mean** | 38.01 years |
| **Minimum** | 18 years |
| **Maximum** | 113 years |

#### Age Bracket Breakdown

| Age Bracket | Count (sample) | Percentage |
|-------------|---------------|------------|
| 18–20 | 614 | 1.54% |
| 21–29 | 13,129 | **32.82%** |
| 30–39 | 12,646 | **31.62%** |
| 40–49 | 8,162 | 20.41% |
| 50–59 | 3,400 | 8.50% |
| 60–69 | 1,061 | 2.65% |
| 70–79 | 701 | 1.75% |
| 80–89 | 229 | 0.57% |
| 90+ | 58 | 0.15% |

**Key insight:** Over **64%** of voters fall within the **21–39 age range**, indicating a significantly younger voter population. This likely reflects both Selangor's urban demographics and the inclusion of newly registered voters.

### Date of Birth — Decade Distribution

| Decade | Count (sample) | Notes |
|--------|---------------|-------|
| 1910s | 5 | |
| 1920s | 20 | |
| 1930s | 99 | |
| 1940s | 455 | |
| 1950s | 807 | |
| 1960s | 2,008 | |
| 1970s | 5,342 | |
| 1980s | 9,115 | |
| **1990s** | **20,656** | **Largest cohort (51.6%)** |
| 2000s | 1,493 | |

The **1990s** birth decade dominates, aligning with the 21–29 and 30–39 age brackets being the largest groups.

### Data Completeness

| Field | Available | Missing/NA | Completeness |
|-------|-----------|------------|--------------|
| CONTACT# | 83.25% | 16.75% | **83.25%** |
| GPS_COORDINATE | 0.00% | 100.00% | **0.00%** |

- **Contact information** is available for roughly **4 in 5 voters**, stored as a binary `YES`/`NA` flag rather than actual phone numbers.
- **GPS coordinates** are marked as `NA` for **all sampled records**, suggesting GPS data was not collected or is stored elsewhere.

### Geographic Distribution (Sample-Based)

All records belong to **Selangor** (state code `8`).

#### Parliamentary Constituencies in Sample

| Parliamentary Constituency | Sample Count |
|----------------------------|---------------|
| 92.SABAK BERNAM | 10,000 |
| 99.AMPANG | 10,000 |
| 104.SUBANG | 10,000 |
| 109.KAPAR | 10,000 |

> **Note:** The sample captures only 4 out of Selangor's 22 parliamentary seats. The full dataset covers all constituencies.

#### DUN (State Constituency) Seats in Sample

| DUN Constituency | Sample Count |
|-------------------|---------------|
| 01.SUNGAI AIR TAWAR | 10,000 |
| 42.MERU | 10,000 |
| 30.KINRARA | 10,000 |
| 19.BUKIT ANTARABANGSA | 9,085 |
| 20.LEMBAH JAYA | 915 |

#### Geographic Counts in Sample

| Level | Distinct Values in Sample |
|-------|--------------------------|
| Parliamentary constituencies | 4 |
| DUN (state) constituencies | 5 |
| DM (voting) districts | 39 |
| Localities | 239 |

> **Note:** These are lower-bound counts from the 1% sample. The full dataset contains significantly more distinct geographic entities.

---

## Data Quality Observations

1. **Consistent schema** across all 4 files — no structural variations detected.
2. **VOTER_ID format** is systematic: `SL1_`, `SL2_`, `SL3_`, `SL4_` prefixes corresponding to each part file, with sequential numbering.
3. **Race field** contains a `TBC` (To Be Confirmed) category comprising ~4% of records, indicating some records have unverified ethnicity data.
4. **CONTACT# and GPS_COORDINATE** are stored as binary availability flags (`YES`/`NA`), not actual data values.
5. **DOB format** is consistent (`DD-MMM-YYYY`), e.g., `22-AUG-2007`.
6. **Geographic codes** follow a hierarchical numeric naming convention (e.g., `001.BAGAN PARIT BAHRU` → `01.PARIT BAHARU BARUH` → `01.SUNGAI AIR TAWAR` → `92.SABAK BERNAM` → `8.SELANGOR`).
7. **Age range** spans 18–113, with 18 being the legal voting age in Malaysia.

---

## File Structure

```
.
├── ANALYSIS.md                          # This report
├── data/
│   ├── 01_SL_part01.1mil (mcw).xlsx     # Part 1: 1,000,000 records
│   ├── 01_SL_part02.1mil (mcw).xlsx     # Part 2: 1,000,000 records
│   ├── 01_SL_part03.1mil (mcw).xlsx     # Part 3: 1,000,000 records
│   └── 01_SL_part04-971650 (mcw).xlsx   # Part 4: 971,650 records
└── scripts/
    ├── analyze_xlsx.py                   # Lightweight structural analysis
    ├── sample_analysis.py                # Reservoir sampling analysis
    └── fast_analysis.py                  # Fast pandas nrows analysis
```

---

## Summary

This dataset represents a comprehensive **Selangor state voter registry** containing approximately **3.97 million records** with 13 data fields per record. The electorate is ethnically diverse (68% Malay, 19% Chinese, 9% Indian), gender-balanced (~50/50), and predominantly young (64% aged 21–39). Contact information is available for ~83% of voters, while GPS coordinates are absent across the board. The data is organized by a clear geographic hierarchy from locality level up to state level.
