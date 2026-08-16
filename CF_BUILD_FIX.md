# Cloudflare Build Failure — Root Cause Analysis & Fix

## Status: ✅ FIXED (commit on `feat/root-level-cf-build` branch)

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
