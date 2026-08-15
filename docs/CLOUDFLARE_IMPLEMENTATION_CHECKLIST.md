# Cloudflare Implementation Checklist — SLGRVTRS

> **Status**: Actionable task list for deploying SLGRVTRS to Cloudflare.  
> **Last updated**: 2026-08-15  
> **Reference**: `CLOUDFLARE_DEPLOYMENT.md`, `CLOUDFLARE_D1_DATABASE.md`, `CLOUDFLARE_PHASE_COMPATIBILITY.md`  
> **Pattern source**: `DENGKIL-UX/pip-melaka` (verified working deployment)

---

## Pre-Flight: Critical Fix Required

### [ ] CF-00: Remove `output: "standalone"` from `next.config.ts`

**Blocker.** The current `next.config.ts` has `output: "standalone"` which is **incompatible** with `@opennextjs/cloudflare`. The pip-melaka repo explicitly documents: "NO `output: 'standalone'` — OpenNext handles bundling."

Also need to:
- Add `images: { unoptimized: true }` (Workers have no Image Optimization API)
- The `build` script in `package.json` currently does `cp -r .next/static .next/standalone/...` — this is Vercel/Docker-specific and must change for CF

```diff
- output: "standalone",
+ // NO output: 'standalone' — OpenNext handles bundling for Cloudflare
+ images: { unoptimized: true },
```

**File**: `dashboard/next.config.ts`

---

## Phase A: Static Deployment (Phase 1-2, Zero Cost)

> Deploy the current map as a pure static site. No Workers, no D1, no OpenNext.
> This is the simplest path and works today.

### [ ] CF-01: Create Cloudflare Account

1. Go to https://dash.cloudflare.com/sign-up
2. Sign up with GitHub OAuth (fastest, same org as repo)
3. **No credit card** — select Free plan
4. Verify email

### [ ] CF-02: Connect GitHub Repo to Pages

1. Dashboard → Workers & Pages → Create → Pages → Connect to Git
2. Select `DENGKIL-UX/slgrvtrs`
3. Set build settings:
   - **Root directory**: `dashboard`
   - **Build command**: `npm run build`
   - **Build output directory**: `.next`
   - **Node.js version**: `20.x`
4. Deploy

### [ ] CF-03: Verify Static Deployment

1. Visit the auto-generated `*.pages.dev` URL
2. Verify map loads with Parliament choropleth
3. Verify DUN drill-down works (click Parliament → DUNs appear)
4. Verify layer toggles work
5. Verify legend renders correctly
6. Check browser console for errors

### [ ] CF-04: Add Custom Domain (Optional)

1. Pages → slgrvtrs → Custom domains → Add
2. Update DNS records as instructed
3. SSL auto-provisioned by Cloudflare

---

## Phase B: Workers Deployment (Phase 3+ API Routes)

> Upgrade from static to Workers when D1 queries are needed.
> Requires `@opennextjs/cloudflare`.

### [ ] CF-10: Fix `next.config.ts` (prerequisite)

See CF-00 above. Must be done first.

### [ ] CF-11: Install Cloudflare Dependencies

```bash
cd dashboard
npm install -D @opennextjs/cloudflare wrangler
```

### [ ] CF-12: Verify Config Files

The following files are already scaffolded in the repo:
- `dashboard/wrangler.jsonc` — Worker config (D1/R2 bindings commented out)
- `dashboard/open-next.config.ts` — OpenNext adapter config
- `dashboard/.cloudflareignore` — deployment exclusions
- `dashboard/.dev.vars.example` — secrets template

### [ ] CF-13: Update `package.json` Scripts

```json
{
  "scripts": {
    "build:cf": "npx @opennextjs/cloudflare build",
    "deploy": "npm run build:cf && npx @opennextjs/cloudflare deploy",
    "preview:cf": "npm run build:cf && npx wrangler dev"
  }
}
```

### [ ] CF-14: Update Build Command in CF Dashboard

Change from:
- Build command: `npm run build`

To:
- Build command: `npm run build:cf`

### [ ] CF-15: Verify Worker Bundle Size

```bash
npm run build:cf
ls -lh .open-next/worker.js
# Must be < 3 MB (gzip). pip-melaka is ~1.5 MB.
```

If bundle exceeds 3 MB, tree-shake unused deps (sharp, prisma, recharts, three, etc.).

### [ ] CF-16: Test Locally with Wrangler

```bash
npm run preview:cf
# Opens browser at http://localhost:8787
# Verify map loads, drill-down works, layer toggles work
```

---

## Phase C: D1 Database (Phase 3+ DM Queries)

### [ ] CF-20: Create D1 Database

```bash
npx wrangler d1 create slgrvtrs-voters
# Copy the database_id from output
# Paste into wrangler.jsonc d1_databases[0].database_id
```

### [ ] CF-21: Apply Schema Migration

```bash
npx wrangler d1 execute slgrvtrs-voters --remote --file=./migrations/0001_analytics_warehouse.sql
```

### [ ] CF-22: Generate Data Load SQL from Existing JSON

```bash
# Parliament stats (22 rows)
python3 scripts/build_d1_parl_load.py --input=public/stats/parliament.json --output=migrations/0002_load_parliaments.sql

# DUN stats (56 rows)
python3 scripts/build_d1_dun_load.py --input=public/stats/dun.json --output=migrations/0003_load_duns.sql
```

### [ ] CF-23: Load Pre-Aggregated Stats

```bash
npx wrangler d1 execute slgrvtrs-voters --remote --file=./migrations/0002_load_parliaments.sql
npx wrangler d1 execute slgrvtrs-voters --remote --file=./migrations/0003_load_duns.sql
```

### [ ] CF-24: Verify D1 Data

```bash
npx wrangler d1 execute slgrvtrs-voters --remote --command="SELECT COUNT(*) as cnt FROM parliaments"
# Expected: 22

npx wrangler d1 execute slgrvtrs-voters --remote --command="SELECT COUNT(*) as cnt FROM duns"
# Expected: 56
```

### [ ] CF-25: Uncommit D1 Binding in wrangler.jsonc

Remove the comments around `d1_databases` in `wrangler.jsonc`.

---

## Phase D: R2 Storage (Phase 5 PMTiles)

### [ ] CF-30: Create R2 Bucket

```bash
npx wrangler r2 bucket create slgrvtrs-tiles
```

### [ ] CF-31: Uncommit R2 Binding in wrangler.jsonc

Remove the comments around `r2_buckets` in `wrangler.jsonc`.

### [ ] CF-32: Upload PMTiles

```bash
npx wrangler r2 object put slgrvtrs-tiles/voters.pmtiles --file=./artifacts/voters.pmtiles
```

---

## Phase E: CI/CD (Optional)

### [ ] CF-40: Add Cloudflare Build to CI

Add to `.github/workflows/ci.yml`:

```yaml
- name: Cloudflare build
  run: npx @opennextjs/cloudflare build
```

### [ ] CF-41: Add Deploy on Push to Main (Optional)

Use Cloudflare Pages Git integration (already auto-deploys on push to main).

---

## Dependency Tree

```
CF-00 (fix next.config.ts)
  ├── CF-01..04 (Static deploy — can skip CF-00 if using pure static)
  └── CF-10..16 (Workers deploy — REQUIRES CF-00)
        └── CF-20..25 (D1 database — REQUIRES CF-10..16)
              └── CF-30..32 (R2 storage — REQUIRES CF-20..25)
                    └── CF-40..41 (CI/CD)
```

## Time Estimates

| Phase | Tasks | Time |
|-------|-------|------|
| A: Static | CF-01 to CF-04 | 15 minutes |
| B: Workers | CF-10 to CF-16 | 1-2 hours |
| C: D1 | CF-20 to CF-25 | 2-3 hours |
| D: R2 | CF-30 to CF-32 | 30 minutes (after PMTiles built) |
| E: CI/CD | CF-40 to CF-41 | 30 minutes |
