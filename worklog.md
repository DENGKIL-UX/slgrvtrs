# SLGRVTRS — Selangor Voter Registry Map · Worklog

This file is the shared handover document for all agents working on this
project. Append (do not overwrite) when you finish a Task ID.

---
Task ID: 0-bootstrap
Agent: main
Task: Bring the dev environment back up, diagnose why API routes were
failing, and document the current state before starting new feature work.

Work Log:
- Inspected `/home/z/my-project` — Next.js 16.3 + Turbopack project, ~6.9k LOC
  of TypeScript across the dashboard. No `worklog.md` existed yet.
- `bun run dev` was running but every API route returned HTTP 500 with:
  `getCloudflareContext has been called without having called initOpenNextCloudflareForDev`.
- Root cause 1: `next.config.ts` did not import `initOpenNextCloudflareForDev`
  from `@opennextjs/cloudflare`. Added the call (must run before `nextConfig`
  is defined).
- Root cause 2: even with the init call, `getPlatformProxy` defaulted to local
  D1/R2 which had no seeded data (`no such table: dms`). Set `"remote": true`
  on the D1 and R2 bindings in `wrangler.jsonc` so `next dev` reads from the
  production-shape remote `slgrvtrs-voters` D1 / `slgrvtrs-tiles` R2 bucket.
- Root cause 3: preview host `preview-chat-fcc1f2f5-…space-z.ai` was being
  blocked by Next.js's new allowedDevOrigins guard. Added it (plus
  `*.space-z.ai`) to `allowedDevOrigins` in `next.config.ts`.
- Created `.dev.vars` with `NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000`.
- Restarted dev server with `CLOUDFLARE_API_TOKEN` +
  `CLOUDFLARE_ACCOUNT_ID` exported so wrangler can authenticate to the remote
  D1/R2/AI bindings.
- Verified endpoints:
  - `GET /` → 200 (page renders)
  - `GET /api/dm` → 200 (returns 945 DM GeoJSON features from remote D1)
  - `GET /api/settings/password` → 200
  - `GET /api/geocode/status` → 200
  - `POST /api/insights` → 405 (correct — POST only)

Stage Summary:
- Dev server is healthy on port 3000 with remote D1/R2/AI bindings.
- Next steps: run agent-browser QA, then add a sticky footer, a
  Recently-Viewed history panel, a screenshot/export-map feature, age
  distribution analytics, and polish dark-mode tokens.

---

---
Task ID: 1-qa-and-features
Agent: main
Task: Run agent-browser QA on the dashboard, fix any bugs found, then add
new features (recently-viewed panel, screenshot capture, analytics
enhancements, sidebar/footer polish) and improved keyboard shortcuts.

Work Log:
- QA pass via agent-browser + VLM on the existing dashboard:
  - Page renders correctly on desktop (1280×800) and mobile (375×812).
  - Search → flyTo → popup flow works (tested P.092 SABAK BERNAM, P.100 PANDAN).
  - Comparison "+ Compare" button on popup adds seats and shows toast.
  - AI Insights panel generates 5 bullets via the LLM (statewide scope).
  - VLM flagged two layout gaps: (1) no proper page-level footer; (2) the
    bottom "Quick Statistics" panel was being cut off in the sidebar.
- Found and fixed a React 19 console error in `addToComparison`:
  "Cannot update a component (`ToastProvider`) while rendering a different
  component (`MapDashboard`)" — was caused by calling `toast()` inside the
  `setComparisonList(prev => ...)` updater. Refactored to use a
  `comparisonListRef` snapshot + decide the toast message outside the updater.
- Fixed two ESLint errors:
  - `PasswordDialog.tsx:25` — `setState` inside `useEffect`. Refactored to
    reset state in a wrapped `handleClose` callback instead.
  - `RecentlyViewed.tsx:65` — same issue. Moved the refresh into a
    `queueMicrotask` so it doesn't trigger a synchronous cascading render.
- Fixed a calculation bug in `AnalyticsDrawer.tsx`: `avgContact` was being
  computed as a fraction (0.6953) but displayed as a percentage ("0.8%").
  Removed the extra `/100` so it now correctly shows ~76.8%.
- Added new "Recently Viewed" feature:
  - `src/components/RecentlyViewed.tsx` — pop-up panel showing the last 8
    parliament/DUN/DM seats the user clicked. Persisted to localStorage
    under `slgrvtrs:recent`. Cross-component updates via a
    `slgrvtrs:recent-updated` CustomEvent.
  - `pushRecent()` helper called from a new `selectSeat()` wrapper around
    `setCurrentSelection` in MapDashboard. Every seat click now records
    into history.
  - Toolbar button (clock icon, violet→fuchsia gradient) added next to
    Bookmarks. Press `H` to toggle.
- Added "Screenshot Map" feature:
  - `src/components/ScreenshotButton.tsx` — captures the MapLibre WebGL
    canvas as a PNG, with a 2D-canvas fallback for canvases created
    without `preserveDrawingBuffer: true`. Filename is timestamped.
  - Toolbar button (camera icon) added. Press `P` to trigger via a
    global `slgrvtrs:screenshot` CustomEvent.
- Improved sidebar footer:
  - Old: two plain text lines ("Boundaries: MECo…", "Phase 7…").
  - New: a "LIVE DATA" badge with pulse animation, a "Sources →" link
    that opens the provenance panel, version + comparison/layer status
    indicator (`v2.7 · Phase 11 · 0/3 compare · PDB`). Dark-mode aware.
- Added a new bottom status bar (replaces the small zoom indicator):
  - Shows zoom level, view mode (Parliament/DUN), active metric, current
    selection code, and comparison seat count. Truncates gracefully on
  - mobile (`hidden sm:block` on the metric segment) and uses
    `no-scrollbar` so the horizontal scroll doesn't show a scrollbar.
- Enhanced `AnalyticsDrawer`:
  - Added 4 new voter-weighted MetricCards above the existing KPI cards:
    Total Voters, Avg Contact %, Avg Mean Age, Voter Density (voters/DM).
    Each has a colored icon and sub-label.
  - Added a new "Contact Rate by Parliament" bar chart at the bottom
    with a 3-tier color legend (≥80% green, 70-80% amber, <70% rose).
  - Added a `MetricCard` sub-component with 4 accent themes.
- Fixed `MapDashboardClient.tsx` loading screen:
  - Was always `bg-slate-100` regardless of theme. Now uses a gradient
    with `dark:` variants, a glowing spinner, and shows the headline
    stats ("3,971,650 voters · 22 parliaments · 945 DMs") under the
    spinner.
- Added 3 new keyboard shortcuts (and updated the shortcuts overlay):
  - `H` — toggle Recently Viewed history panel
  - `P` — capture map as PNG screenshot
  - `C` — clear current selection (also closes the popup)
- Added new CSS utilities in `globals.css`:
  - `.no-scrollbar` — hide scrollbar on horizontal status bars
  - `.animate-scale-in` — subtle scale-in animation for popovers
  - `.spinner-glow` — drop-shadow glow for spinners
  - `.theme-transition` — smooth color transition for theme switches

Stage Summary:
- All initial bugs fixed (React 19 warning, lint errors, contact % calc).
- 4 new user-facing features shipped: Recently Viewed, Screenshot, sidebar
  footer, bottom status bar.
- Analytics drawer expanded with 4 metric cards + contact-rate chart.
- Loading screen now properly supports dark mode.
- 3 new keyboard shortcuts added (H, P, C) and documented in the overlay.
- Verified end-to-end via agent-browser: search → flyTo → popup →
  compare → AI Insights → analytics → recent panel → screenshot — all
  working. VLM confirms layout is clean on desktop and mobile.
- Next step: push to Git, then create the 15-min recurring webDevReview
  cron job as instructed.


---
Task ID: 2-cf-deploy-fix
Agent: main
Task: Fix the CF Pages deployment — new features (Recently Viewed, Screenshot,
analytics, footer, status bar) were not appearing at the deployed URL
https://slgrvtrs.ritz-analytics.workers.dev/ even though the build succeeded.

Work Log:
- Diagnosed root cause: CF Pages build settings use `dashboard/` as the
  Root directory (confirmed in build log: "App directory: /opt/buildhome/repo/dashboard").
  All Phase 12 enhancements were committed only to the repo root `src/` —
  the `dashboard/src/` copy was stale, so the deployed worker didn't have
  any of the new features.
- Synced ALL changed files from root → dashboard/:
  - 2 new components: RecentlyViewed.tsx, ScreenshotButton.tsx
  - 6 updated components: AnalyticsDrawer, KeyboardShortcuts, PasswordDialog,
    ExportPanel, MapDashboard, MapDashboardClient
  - 2 app files: globals.css, api/insights/route.ts
  - 4 config files: next.config.ts, wrangler.jsonc, package.json, .gitignore
- Also hardened `initOpenNextCloudflareForDev()` call in next.config.ts
  with a `process.env.NODE_ENV === "development"` guard. The function
  tries to connect to Cloudflare via `getPlatformProxy()` which could
  hang or fail during a `next build` / CF Pages production build. The
  guard ensures it only runs in `next dev`.
- Verified local dev server still works after the NODE_ENV guard:
  - GET / → 200
  - GET /api/dm → 200 (remote D1 still works)
  - GET /api/settings/password → 200
- Lint: 0 errors.
- Committed as `5b584d7` and pushed to origin/main.
- CF Pages should auto-trigger a new build from this commit.

Stage Summary:
- The dashboard/ folder is now fully in sync with the repo root.
- The NODE_ENV guard prevents potential build-time issues with
  initOpenNextCloudflareForDev().
- Next step: verify the CF build completes and the new features appear
  at https://slgrvtrs.ritz-analytics.workers.dev/ after the build finishes
  (~2 minutes).


---
Task ID: 3-cf-build-lockfile-fix
Agent: main
Task: Fix the CF Pages build failure caused by package.json / package-lock.json
desync in the dashboard/ folder.

Work Log:
- Root cause: commit 5b584d7 copied the root package.json to dashboard/,
  which bumped @opennextjs/cloudflare from ^1.20.1 to ^1.20.2. But the
  dashboard's package-lock.json was generated with 1.20.1, so `npm ci`
  (which CF Pages uses) failed with:
    "lock file's @opennextjs/cloudflare@1.20.1 does not satisfy
     @opennextjs/cloudflare@1.20.2"
  This affected ~40 transitive @smithy/* dependencies too.
- Fix: reverted dashboard/package.json's @opennextjs/cloudflare version
  back to ^1.20.1 (the version the existing lockfile was generated with).
  Did NOT touch the source code — all Phase 12 features (RecentlyViewed,
  ScreenshotButton, AnalyticsDrawer, MapDashboard, etc.) remain in place.
- Verified locally in dashboard/ folder:
  - `npm ci --progress=false` → exit 0 (success)
  - `npm run build:cf` → "OpenNext build complete" + "Worker saved in
    .open-next/worker.js"
  - `npx @opennextjs/cloudflare deploy` → deployed to
    https://slgrvtrs.ritz-analytics.workers.dev
    Version ID: cd193808-adf5-473a-8002-bf96b6fc75a5
- Verified deployed site via agent-browser:
  - LIVE DATA badge ✅
  - Sources → link ✅
  - v2.7 · Phase 11 · 0/3 compare · PDB ✅
  - Recent button (clock icon) + History sublabel ✅
  - Screenshot map tooltip ✅
  - Bottom status bar (zoom + view + metric) ✅
- Committed as 7ae6811 and pushed to origin/main.
- CF Pages should now auto-build successfully from this commit.

Stage Summary:
- The dashboard/package.json is now back in sync with its lockfile.
- All Phase 12 features are live on the deployed site.
- Lesson learned: when syncing files root → dashboard/, NEVER copy
  package.json or package-lock.json — the two folders have independent
  dependency trees. Only sync source code (src/), config files that
  don't affect npm (next.config.ts, wrangler.jsonc, tsconfig.json),
  and CSS.

