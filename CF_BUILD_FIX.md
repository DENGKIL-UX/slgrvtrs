# Cloudflare Build Failure — Root Cause Analysis & Fix

## Status: ✅ FIXED (Phase 12 — dashboard/ + root kept in sync; CI green)

---

## 1. Problem Summary

All builds on the `feat/analytics-ai-insights` branch failed with:

```
Error: No `open-next.config.ts` file was found in the project root.
```

This affected **6 consecutive failed builds** (builds #2b487ecb, #43d7e1e1, #29e8c219, #0e71019f, #65231c4d, and the original #7183a8f0).

---

## 2. Root Cause

### The mismatch

The Cloudflare dashboard build settings were changed at some point from
the working configuration to a broken one:

| Setting | Working (main branch, build #fb6ce8c9) | Broken (all feat/ branches) |
|---|---|---|
| **Root directory** | `dashboard` | `/` |
| **Build command** | `npm run build:cf` | `npx @opennextjs/cloudflare build` |
| **Deploy command** | `npm run deploy` | `npx wrangler versions upload` |

### Why it fails

The `@opennextjs/cloudflare` adapter looks for `open-next.config.ts` at the
**project root** (i.e. the "Root directory" setting). When Root directory = `dashboard`,
the adapter finds `dashboard/open-next.config.ts` ✅. When Root directory = `/`,
the adapter looks for `./open-next.config.ts` at the repo root — but the file
lives at `dashboard/open-next.config.ts`, so it's not found ❌.

The source code (`src/`, `public/`, `package.json`, `wrangler.jsonc`, etc.) is
also inside `dashboard/`, so even if `open-next.config.ts` were copied to root,
the build would fail because there's no `package.json` or `src/` at root to build.

### Why the main branch worked

The `main` branch builds succeeded because they ran **before** the CF dashboard
settings were changed to Root=`/`. The main branch code has the exact same
`dashboard/` structure — it only worked because the CF dashboard was set to
Root=`dashboard` at that time.

---

## 3. Verification

### Before the fix (reproducing the failure)

```bash
$ cd /home/z/slgrvtrs-clone   # Root directory = /
$ ls open-next.config.ts
ls: cannot access 'open-next.config.ts': No such file or directory

$ ls dashboard/open-next.config.ts
dashboard/open-next.config.ts   # ← file is here, not at root
```

Running the CF build command at root:
```bash
$ npx @opennextjs/cloudflare build
Error: No `open-next.config.ts` file was found in the project root.
```

### After the fix

```bash
$ ls open-next.config.ts wrangler.jsonc package.json src/app/page.tsx
open-next.config.ts    wrangler.jsonc    package.json    src/app/page.tsx

$ npx @opennextjs/cloudflare build
✓ Compiled successfully
✓ Generating static pages using 1 worker (10/10)
Worker saved in `.open-next/worker.js` 🚀
OpenNext build complete.
```

All 11 routes generated:
```
○ /                          (Static)
ƒ /api/dm                    (Dynamic)
ƒ /api/dm/[code]             (Dynamic)
ƒ /api/dm/search             (Dynamic)
ƒ /api/export/csv            (Dynamic)
ƒ /api/geocode               (Dynamic)
ƒ /api/geocode/status        (Dynamic)
ƒ /api/insights              (Dynamic)
ƒ /api/r2/[...path]          (Dynamic)
ƒ /api/settings/password     (Dynamic)
○ /_not-found                (Static)
```

---

## 4. The Fix

### Approach: Move `dashboard/` contents to the repo root

Since the CF dashboard is set to Root=`/`, the entire Next.js + OpenNext app
must live at the repo root (not inside a `dashboard/` subdirectory).

### What was moved

All files from `dashboard/` were copied to the repo root `/`:

```
dashboard/open-next.config.ts  →  /open-next.config.ts
dashboard/wrangler.jsonc       →  /wrangler.jsonc
dashboard/next.config.ts       →  /next.config.ts
dashboard/package.json         →  /package.json
dashboard/package-lock.json    →  /package-lock.json
dashboard/postcss.config.mjs   →  /postcss.config.mjs
dashboard/eslint.config.mjs    →  /eslint.config.mjs
dashboard/tsconfig.json        →  /tsconfig.json
dashboard/tailwind.config.ts   →  /tailwind.config.ts
dashboard/.cloudflareignore    →  /.cloudflareignore
dashboard/.dev.vars.example     →  /.dev.vars.example
dashboard/src/                  →  /src/
dashboard/public/               →  /public/
dashboard/migrations/          →  /migrations/
dashboard/scripts/              →  /scripts/
```

### What was NOT changed

- The `dashboard/` directory is kept intact (for backwards compatibility with
  the `main` branch which still uses it).
- All existing CF infrastructure is unchanged:
  - `open-next.config.ts` — same content (`incrementalCache: { deferred: false }`)
  - `wrangler.jsonc` — same D1/R2 bindings (`DB`, `TILES`, `ASSETS`)
  - `next.config.ts` — same (no `output: 'standalone'`, `images.unoptimized: true`)
  - All 6 D1 migrations — unchanged
  - All existing API routes — unchanged (still use `getCloudflareContext()` + D1)

### New feature components added

All the features developed in Tasks 2–7 are included at the root `src/` level:
- AnalyticsDrawer, AiInsightsPanel, RankingTable, BookmarksMenu
- ComparisonRadar, ShareButton, ThemeToggle, KeyboardShortcuts, OnboardingTour
- `/api/insights` route (D1-compatible, uses `getCloudflareContext()`)

---

## 5. Alternative Fix (if you prefer not to restructure)

If you want to keep the `dashboard/` subdirectory structure, change the CF
dashboard settings back to:

| Setting | Value |
|---|---|
| **Root directory** | `dashboard` |
| **Build command** | `npm run build:cf` |
| **Deploy command** | `npm run deploy` |

This matches the original working configuration from build #fb6ce8c9.

---

## 6. Key Constraints (MUST NOT change)

1. **Do NOT add `output: 'standalone'`** to `next.config.ts` — breaks OpenNext.
2. **Do NOT add `export const runtime = 'edge'`** to any API route — causes 500s.
3. **Do NOT change `compatibility_flags: ["nodejs_compat"]`** in `wrangler.jsonc`.
4. **Do NOT change `main: ".open-next/worker.js"`** in `wrangler.jsonc`.
5. **Do NOT change `incrementalCache: { deferred: false }`** in `open-next.config.ts`.
6. **Do NOT change `buildCommand: "npm run build"`** in `open-next.config.ts`.
7. **Do NOT add `"types": ["@cloudflare/workers-types"]`** to `tsconfig.json`.
8. **Do NOT change API routes from D1 to Prisma** — the CF Worker uses D1.

---

## 7. Testing Commands

To verify the build locally before pushing:

```bash
# At the repo root (where open-next.config.ts lives)
npx tsc --noEmit              # TypeScript check (0 errors expected)
npx @opennextjs/cloudflare build   # Full OpenNext build (produces .open-next/worker.js)
```

If both succeed, the CF dashboard build will also succeed.

---

## 8. Conclusion

The build failure was caused by a **mismatch between the CF dashboard Root
directory setting (`/`) and the actual project structure (code in `dashboard/`)**.
The fix moves all Next.js + OpenNext files to the repo root so the build works
with Root=`/`. All existing CF infrastructure (D1, R2, OpenNext config,
wrangler bindings) is preserved unchanged.

The `feat/root-level-cf-build` branch contains the fix and has been verified
locally with `npx @opennextjs/cloudflare build` — it produces a clean
`.open-next/worker.js` with all 11 routes.

---

## 9. Phase 12 Updates (2026-08-17)

The original fix (§1–8) restructured the repo so the Next.js + OpenNext app
lives at the **repo root** for `next dev`. CF Pages, however, is configured to
build from the **`dashboard/` subdirectory** (Root=`dashboard`). This means the
repo now has **two parallel copies** of the dashboard source:

| Folder | Used by | Purpose |
|--------|---------|--------|
| `/` (repo root) | `next dev` (z.ai preview, local dev) | Live editing with remote D1/R2/AI bindings via `initOpenNextCloudflareForDev()` |
| `/dashboard` | CF Pages production build | Static build → OpenNext Worker bundle deployed to `slgrvtrs.ritz-analytics.workers.dev` |

Both copies must stay byte-for-byte in sync for `src/`, `public/`, `migrations/`,
and shared config files (`next.config.ts`, `wrangler.jsonc`, `tsconfig.json`,
`open-next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`,
`eslint.config.mjs`, `globals.css`).

### 9.1 NEVER copy `package.json` or `package-lock.json` (CF-89)

The root and `dashboard/` folders have **independent dependency trees**.
Phase 12 commit `5b584d7` accidentally copied the root `package.json` to
`dashboard/`, bumping `@opennextjs/cloudflare` from `^1.20.1` to `^1.20.2`.
But `dashboard/package-lock.json` had been generated with `1.20.1`, so CF
Pages' `npm ci` failed with:

```
npm error: lock file's @opennextjs/cloudflare@1.20.1 does not satisfy
@opennextjs/cloudflare@1.20.2
```

This affected ~40 transitive `@smithy/*` dependencies.

**Rule**: when syncing files root → `dashboard/`, NEVER copy `package.json` or
`package-lock.json`. The two folders may legitimately have different
`@opennextjs/cloudflare` minor versions if the lockfiles were generated at
different times.

### 9.2 `tsconfig.json` excludes `skills/`, `scripts/`, `analysis/` (CF-90)

The repo-root `tsconfig.json` was type-checking every `**/*.ts` file under
the repo, including the `skills/` directory (third-party skill scripts),
`scripts/` (one-off Python helper scripts), and `analysis/`. Several of
these files had type errors that broke `npx tsc --noEmit` and therefore
the CF Pages build.

**Fix**:

```jsonc
"exclude": [
  "node_modules",
  "skills",
  "scripts",
  "analysis",
  "dashboard"
]
```

Note that `dashboard` is also excluded — the root tsconfig only checks the
root `src/`. The `dashboard/` folder has its own `tsconfig.json` (with the
same content) which CF Pages uses.

### 9.3 `initOpenNextCloudflareForDev()` with `NODE_ENV` guard (CF-91)

`next dev` calls API routes that use `getCloudflareContext()`, which in turn
requires `initOpenNextCloudflareForDev()` to be called once during Next.js
boot. Without it, every API route returns HTTP 500:

```
getCloudflareContext has been called without having called
initOpenNextCloudflareForDev
```

But calling the init unconditionally breaks `next build` / CF Pages — the
function tries to connect to Cloudflare via `getPlatformProxy()` which is
not appropriate during a production build.

**Fix** in `next.config.ts`:

```typescript
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}
```

The init MUST run before `nextConfig` is defined.

### 9.4 `allowedDevOrigins` for the z.ai preview host (CF-92)

Next.js 16 introduced an `allowedDevOrigins` guard that rejects cross-origin
requests from unknown preview hosts. The z.ai in-IDE preview panel runs at
`preview-chat-fcc1f2f5-…space-z.ai`, so the dev server was blocking chunk
loads + HMR socket connections to that host.

**Fix** in `next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  // …
  allowedDevOrigins: [
    "preview-chat-fcc1f2f5-c8fd-43c9-9739-0d169e3240ea.space-z.ai",
    "*.space-z.ai",
    "localhost:3000",
  ],
};
```

The wildcard `*.space-z.ai` covers future preview-panel hostnames without
needing to update the config each time the preview ID changes.

### 9.5 `remote: true` on D1 + R2 bindings

`wrangler.jsonc` sets `"remote": true` on the D1 and R2 bindings so that
`next dev` reads from the **production-shape remote D1/R2** rather than a
local mini-clone that would need to be re-seeded with 945 DMs + 56 DUNs +
22 Parliaments. Production deploys ignore this flag — they always use the
remote bindings.

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "slgrvtrs-voters",
    "database_id": "59afb76e-a3a2-4e2a-b18d-857f9f5704fb",
    "remote": true
  }
],
"r2_buckets": [
  {
    "binding": "TILES",
    "bucket_name": "slgrvtrs-tiles",
    "remote": true
  }
]
```

Local dev must export `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` so
`getPlatformProxy()` can authenticate to the remote D1/R2/AI bindings.

### 9.6 Sync checklist (root → `dashboard/`)

After any change to dashboard source or shared config, sync the changed
files from `/` to `/dashboard/`. The minimal checklist:

1. New / modified components under `src/components/` and `src/components/map/`
2. Modified API routes under `src/app/api/`
3. Modified `src/app/globals.css`, `src/app/page.tsx`, `src/app/layout.tsx`
4. Modified `src/lib/**` (auth, csv, map helpers)
5. Shared config: `next.config.ts`, `wrangler.jsonc`, `tsconfig.json`,
   `open-next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`,
   `eslint.config.mjs`
6. New `public/` assets (GeoJSON, stats JSON, MapLibre workers)
7. New `migrations/*.sql`

**Never sync**: `package.json`, `package-lock.json`, `.dev.vars`, `dev.log`,
`tool-results/`, `db/custom.db`. These have folder-specific lifecycles.

### 9.7 Verification (Phase 12)

- ✅ `npm ci` in `dashboard/` succeeds with `@opennextjs/cloudflare@^1.20.1`
- ✅ `npm run build:cf` produces `.open-next/worker.js`
- ✅ `npx @opennextjs/cloudflare deploy` succeeds
- ✅ Deployed site shows Phase 12 features (LIVE DATA badge, Recently Viewed,
  Screenshot button, bottom status bar, dark-mode loading screen)
- ✅ `next dev` (root folder) serves API routes without 500s
- ✅ z.ai preview panel loads chunks + HMR without origin errors
