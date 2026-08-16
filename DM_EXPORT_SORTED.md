# DM Export — All 945 DMs Sorted

## Status: ✅ LIVE on Production

**Endpoint**: `POST /api/export/dm-xlsx`  
**Live URL**: https://slgrvtrs.ritz-analytics.workers.dev/api/export/dm-xlsx  
**Password**: `PAStimenang1` (same as all other exports)  
**Output**: `slgrvtrs_all_945_dms_sorted.csv` (945 rows + header, sorted by DM code)

---

## Overview

The `/api/export/dm-xlsx` endpoint exports all 945 DM (Daerah Mengundi / polling
district) records from the D1 database, sorted alphabetically by `dm_code`.

This is a separate endpoint from `/api/export/csv` (which supports filtering
by parliament or DUN). The DM-sorted export gives users a single CSV with
all 945 DMs in one file, which can be opened directly in Excel.

---

## Data Source

The data comes from the `dms` table in Cloudflare D1 database `slgrvtrs-voters`.
The source xlsx files are in `data/01_SL_part01-04.1mil (mcw).xlsx` — these are
the original Selangor voter registry files split into 4 parts (~1M voters each,
total 3,971,650 voters).

The xlsx files were processed by Python scripts (`scripts/build_d1_load.py`)
which:
1. Read the 4 xlsx files using `pandas + calamine`
2. Aggregated voter data to the DM level (945 unique DM codes)
3. Calculated demographics: total voters, male/female, race (Malay/Chinese/Indian/Other),
   age (mean/median), contact percentage
4. Computed gender×race crosstabs (8 columns: male_malay, male_chinese, etc.)
5. Loaded into D1 via `migrations/0004_load_dms.sql`

---

## CSV Columns (24 columns)

| Column | Description |
|--------|-------------|
| DM Code | e.g. `01.BANDAR COUNTRY HOME 1` |
| Name | DM name (same as code for most) |
| DUN Code | e.g. `N.14` |
| Parliament Code | e.g. `P.097` |
| Total Voters | e.g. `10395` |
| Male | Male voter count |
| Female | Female voter count |
| Male % | e.g. `49.1` |
| Female % | e.g. `50.9` |
| Malay % | e.g. `51.33` |
| Chinese % | e.g. `29.31` |
| Indian % | e.g. `19.13` |
| Others % | e.g. `0.23` |
| Mean Age | e.g. `38.9` |
| Median Age | e.g. `38.9` |
| Contact % | e.g. `75.53` |
| Male Malay | Male Malay voter count |
| Male Chinese | Male Chinese voter count |
| Male Indian | Male Indian voter count |
| Male Other | Male Other voter count |
| Female Malay | Female Malay voter count |
| Female Chinese | Female Chinese voter count |
| Female Indian | Female Indian voter count |
| Female Other | Female Other voter count |

---

## Password Protection

All export endpoints (CSV + DM-sorted) use the same password:
- **Password**: `PAStimenang1`
- **Hash**: PBKDF2 (10,000 iterations, SHA-256, 16-byte salt)
- **Storage**: D1 `app_settings` table (key: `export_password_hash`)
- **Verification**: `verifyPassword(storedHash, passwordAttempt)` via WebCrypto

### Password Flow

```
User clicks "Download All 945 DMs (Sorted)"
        ↓
PasswordDialog opens → user enters password
        ↓
POST /api/export/dm-xlsx { password: "PAStimenang1" }
        ↓
Server: getPasswordHash(env.DB) → fetch stored hash from D1
        ↓
Server: verifyPassword(storedHash, "PAStimenang1") → true/false
        ↓
If valid: SELECT * FROM dms ORDER BY dm_code ASC → build CSV → return
If invalid: return 401 { error: "Incorrect password" }
```

---

## API Testing

### All 945 DMs Sorted

```bash
curl -X POST https://slgrvtrs.ritz-analytics.workers.dev/api/export/dm-xlsx \
  -H "Content-Type: application/json" \
  -d '{"password":"PAStimenang1"}'
```

**Response**: `slgrvtrs_all_945_dms_sorted.csv` (945 rows + header)

### Wrong Password

```bash
curl -X POST https://slgrvtrs.ritz-analytics.workers.dev/api/export/dm-xlsx \
  -H "Content-Type: application/json" \
  -d '{"password":"wrong"}'
```

**Response**: `401 { "error": "Incorrect password" }`

### No Password

```bash
curl -X POST https://slgrvtrs.ritz-analytics.workers.dev/api/export/dm-xlsx \
  -H "Content-Type: application/json" \
  -d '{"password":""}'
```

**Response**: `400 { "error": "Password is required" }`

---

## Existing CSV Export Endpoints (also password-protected)

| Endpoint | Level | Filter | Rows |
|----------|-------|--------|------|
| `POST /api/export/csv` | parliament | all | 22 |
| `POST /api/export/csv` | parliament | P.100 | 1 |
| `POST /api/export/csv` | dun | all | 56 |
| `POST /api/export/csv` | dun | P.100 (parl filter) | ~2-3 |
| `POST /api/export/csv` | dm | all | 945 |
| `POST /api/export/csv` | dm | P.100 (parl filter) | ~30-50 |
| `POST /api/export/csv` | dm | N.01 (dun filter) | ~15-20 |
| `POST /api/export/dm-xlsx` | dm | all (sorted) | 945 |

All endpoints use the same password: `PAStimenang1`

---

## UI Integration

The ExportPanel in the Metrics tab now has two download buttons:

1. **Download CSV** (green) — uses `/api/export/csv` with the selected level/filter
2. **Download All 945 DMs (Sorted)** (rose) — uses `/api/export/dm-xlsx`

Both buttons open the same PasswordDialog. The correct endpoint is selected
based on which button was clicked (via the `allDmMode` flag).

---

## Files

| File | Description |
|------|-------------|
| `dashboard/src/app/api/export/dm-xlsx/route.ts` | New endpoint — all 945 DMs sorted |
| `dashboard/src/app/api/export/csv/route.ts` | Existing endpoint — filtered exports |
| `dashboard/src/components/ExportPanel.tsx` | Updated — added "Download All 945 DMs" button |
| `dashboard/src/lib/csv/builder.ts` | Shared CSV builder + column definitions |
| `dashboard/src/lib/auth/password.ts` | PBKDF2 hash/verify (shared by all exports) |

---

## Verification

- ✅ `POST /api/export/dm-xlsx` with correct password → 945 rows CSV
- ✅ Wrong password → 401
- ✅ No password → 400
- ✅ All existing `/api/export/csv` endpoints still work with `PAStimenang1`
- ✅ Production deployed: Version ID `26948958-ed06-4c06-9195-6ed3e9d033dd`
