# XLSX Data Transfer Research — R2 vs D1 vs Delete from Public Repo

## Status: ✅ COMPLETED — Files transferred to R2, git history purged

---

## Executive Summary

**The 4 xlsx files (294 MB, 3,971,650 voter records) are currently publicly
downloadable from the GitHub repository via Git LFS.** Anyone can download
them without authentication.

**Recommendation: Transfer to R2 (private), then delete from the repo.**

---

## 1. Current State — Security Problem

### The Problem

The repository `DENGKIL-UX/slgrvtrs` is **public** on GitHub. The 4 xlsx
files are tracked via Git LFS, which means:

1. **Anyone can download the raw xlsx files** from:
   ```
   https://github.com/DENGKIL-UX/slgrvtrs/raw/main/data/01_SL_part01.1mil%20(mcw).xlsx
   ```
   This URL returns HTTP 200 with `content-length: 74,418,308` (71 MB) —
   the full voter registry is publicly accessible.

2. **Even if files are deleted from the repo**, Git LFS objects remain in
   the LFS storage and are still accessible via their SHA256 hash. The only
   way to fully remove them is to also delete the LFS objects.

3. **Git history contains the files** — deleting them in a new commit doesn't
   remove them from previous commits. Anyone can `git checkout` an old commit.

### File Details

| File | Records | LFS Size | SHA256 |
|------|---------|----------|--------|
| `01_SL_part01.1mil (mcw).xlsx` | 1,000,000 | 71.0 MB | `bb17a915...` |
| `01_SL_part02.1mil (mcw).xlsx` | 1,000,000 | 72.0 MB | — |
| `01_SL_part03.1mil (mcw).xlsx` | 1,000,000 | 73.6 MB | — |
| `01_SL_part04-971650 (mcw).xlsx` | 971,650 | 77.5 MB | — |
| **Total** | **3,971,650** | **294.1 MB** | |

### Data Sensitivity

Each xlsx file contains 13 columns of personally identifiable voter data:
- `VOTER_ID` — unique voter identifier
- `VOTER_CODE` — 12-char registration code
- `GENDER`, `RACE`, `AGE`, `DOB` — demographic data
- `CONTACT#`, `GPS_COORDINATE` — contact information
- `LOCALITY_CODE`, `DM_CODE`, `DUN_CODE`, `PARLIAMENT_CODE` — geographic data

This is **sensitive personal data** that should not be publicly accessible.

---

## 2. Transfer Options

### Option A: Transfer to R2 (RECOMMENDED)

**Why R2?**
- R2 buckets can be set to **private** (no public read access)
- Access is controlled via the Worker (password-protected routes)
- R2 free tier: 10 GB storage (294 MB fits easily)
- R2 reads are free on the free tier
- The existing `slgrvtrs-tiles` bucket already stores the per-DM voter CSVs

**Steps:**

1. **Upload the 4 xlsx files to R2:**
   ```bash
   npx wrangler r2 object put slgrvtrs-tiles/source-data/01_SL_part01.xlsx \
     --file="data/01_SL_part01.1mil (mcw).xlsx" --remote
   # Repeat for parts 02, 03, 04
   ```

2. **Verify upload:**
   ```bash
   npx wrangler r2 object get slgrvtrs-tiles/source-data/01_SL_part01.xlsx --remote
   ```

3. **Delete the xlsx files from the repo:**
   ```bash
   git rm "data/01_SL_part01.1mil (mcw).xlsx"
   git rm "data/01_SL_part02.1mil (mcw).xlsx"
   git rm "data/01_SL_part03.1mil (mcw).xlsx"
   git rm "data/01_SL_part04-971650 (mcw).xlsx"
   git commit -m "security: remove voter xlsx files from public repo (transferred to R2)"
   git push
   ```

4. **Remove LFS objects from GitHub:**
   ```bash
   # GitHub doesn't automatically delete LFS objects when files are removed.
   # Use the GitHub LFS API to delete orphaned LFS objects:
   # https://docs.github.com/en/rest/git/lfs#delete-git-lfs-files
   ```
   Or contact GitHub support to purge LFS objects.

5. **BFG repo cleaner (optional, for full history purge):**
   ```bash
   # Use BFG to remove the xlsx files from all git history:
   bfg --delete-folders data --no-blob-protection
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   git push --force
   ```

6. **Ensure R2 bucket is private:**
   - The `slgrvtrs-tiles` bucket is accessed only via the Worker
   - No public bucket URL is exposed
   - All access goes through password-protected Worker routes

**Advantages:**
- ✅ Files are private (only accessible via Worker with password)
- ✅ No GitHub LFS bandwidth charges
- ✅ Files are still available for processing (Worker can read from R2)
- ✅ R2 free tier (10 GB) easily fits 294 MB

### Option B: Transfer to D1

**Why NOT D1?**
- D1 is for structured SQL data, not file storage
- The xlsx files would need to be parsed and loaded as individual voter rows
- Loading 3.97M rows takes 40 days on the free tier (100K writes/day)
- D1 storage limit: 5 GB (the voter data is ~795 MB, fits but loading is slow)
- D1 doesn't store files — only SQL rows

**Not recommended** for storing the raw xlsx files.

### Option C: Keep in Git LFS but make repo private

**Steps:**
1. Change the GitHub repository from public to private
2. No code changes needed
3. Only collaborators can access the xlsx files

**Advantages:**
- ✅ Simplest solution — no data transfer needed
- ✅ Files stay in their current location

**Disadvantages:**
- ❌ Loses the public dashboard repo visibility
- ❌ Still uses GitHub LFS storage (1 GB free, 294 MB used)
- ❌ Requires managing collaborator access

### Option D: Delete from repo entirely (if data is already processed)

**If the data has already been processed** (aggregated into D1 tables, per-DM
CSVs generated in R2), the raw xlsx files may not be needed at all.

**Steps:**
1. Verify all data is in D1 (parliaments, duns, dms tables)
2. Verify all 945 per-DM CSVs are in R2
3. Delete the xlsx files from the repo
4. Purge LFS objects from GitHub
5. Keep a local backup of the xlsx files (offline, not in any repo)

**Advantages:**
- ✅ Simplest cleanup
- ✅ No ongoing storage costs
- ✅ Removes the security risk entirely

**Disadvantages:**
- ❌ Raw data is no longer easily accessible for re-processing
- ❌ Need to maintain a local backup

---

## 3. Recommendation: Option A (Transfer to R2)

### Why R2 is the Best Option

| Factor | R2 | D1 | Private Repo | Delete |
|--------|-----|-----|-------------|-------|
| Privacy | ✅ Private | ✅ Private | ✅ Private | ✅ Gone |
| File storage | ✅ Raw files | ❌ SQL only | ✅ Raw files | ❌ Lost |
| Free tier | ✅ 10 GB | ✅ 5 GB | ✅ 1 GB LFS | ✅ N/A |
| Loading time | ✅ Instant | ❌ 40 days | ✅ Instant | ✅ N/A |
| Worker access | ✅ env.TILES | ✅ env.DB | ❌ None | ❌ None |
| Password protection | ✅ Via Worker | ✅ Via Worker | ❌ None | ❌ None |
| Re-processing | ✅ Can read xlsx | ❌ Can't read xlsx | ✅ Can read | ❌ Lost |

### Implementation Plan

1. **Upload xlsx files to R2** (5 minutes)
2. **Verify upload** (1 minute)
3. **Remove xlsx from repo** + commit (1 minute)
4. **Purge Git LFS objects** (via GitHub API or BFG) (10 minutes)
5. **Force-push cleaned history** (if using BFG) (5 minutes)
6. **Verify production still works** (the dashboard doesn't read xlsx files
   at runtime — it reads from D1 and the pre-generated R2 CSVs) (2 minutes)

### Post-Transfer State

| Storage | Contents | Size | Access |
|---------|----------|------|--------|
| GitHub repo | Code + docs only (no xlsx) | ~41 MB (reduced) | Public |
| R2 `slgrvtrs-tiles` | 4 source xlsx + 945 per-DM CSVs | ~1.1 GB | Private (via Worker) |
| D1 `slgrvtrs-voters` | 22 parliaments + 56 DUNs + 945 DMs | ~924 KB | Private (via Worker) |

### Cost After Transfer

| Resource | Usage | Free Limit | Cost |
|----------|-------|-----------|------|
| R2 storage | ~1.1 GB | 10 GB | $0 |
| R2 reads | ~100/month | 10M/month | $0 |
| D1 storage | ~924 KB | 5 GB | $0 |
| GitHub LFS | 0 GB (purged) | 1 GB | $0 |
| Workers AI | ~7 neurons/insight | 10K/day | $0 |

**Total monthly cost: $0**

---

## 4. Security Checklist After Transfer

- [ ] xlsx files removed from `data/` directory in repo
- [ ] Git LFS objects purged from GitHub (via API or BFG)
- [ ] Git history cleaned (no xlsx in any commit)
- [ ] R2 bucket `slgrvtrs-tiles` is private (no public URL)
- [ ] All data access goes through password-protected Worker routes
- [ ] `.gitattributes` still tracks `*.xlsx` as LFS (for future use)
- [ ] `.cloudflareignore` still excludes `data/` (for future use)
- [ ] Local backup of xlsx files maintained offline

---

## 5. Testing After Transfer

```bash
# Verify xlsx files are NOT accessible via GitHub:
curl -sI "https://github.com/DENGKIL-UX/slgrvtrs/raw/main/data/01_SL_part01.1mil%20(mcw).xlsx"
# Should return 404

# Verify xlsx files ARE accessible via R2 (through Worker):
# (Requires creating a password-protected Worker route to read from R2)
curl -X POST https://slgrvtrs.ritz-analytics.workers.dev/api/export/source-data \
  -H "Content-Type: application/json" \
  -d '{"password":"PAStimenang1"}'
# Should return the xlsx file (or a list of available source files)

# Verify dashboard still works:
curl -s https://slgrvtrs.ritz-analytics.workers.dev/
# Should return 200

# Verify CSV exports still work:
curl -X POST https://slgrvtrs.ritz-analytics.workers.dev/api/export/csv \
  -H "Content-Type: application/json" \
  -d '{"password":"PAStimenang1","level":"parliament"}'
# Should return 22 rows of CSV
```

---

## 6. Conclusion

**Yes, you should transfer the 4 xlsx files to R2 and delete them from
the public GitHub repository.**

The files are currently **publicly downloadable** (294 MB of voter data
with PII including voter IDs, DOB, contact info). This is a significant
privacy/security risk.

**R2 is the best destination** because:
- It's private (access only via Worker)
- It's free (10 GB storage, 294 MB used)
- It supports raw file storage (unlike D1 which only stores SQL rows)
- The existing Worker already has an R2 binding (`env.TILES`)
- Password protection is already implemented via PBKDF2

After transfer, the repo should be cleaned with BFG or GitHub's LFS
purge API to remove the xlsx files from git history entirely.
