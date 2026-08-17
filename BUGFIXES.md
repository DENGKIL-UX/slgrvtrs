# Bugfix Log — SLGRVTRS

> **Project**: Selangor Voter Registry Interactive Map Dashboard  
> **URL**: https://slgrvtrs.ritz-analytics.workers.dev  
> **Component**: `MapDashboard.tsx` (~1,270 lines)  

---

## CF-60: "+ Compare" Button Not Working

**Date**: 2026-08-16  
**Severity**: P0 (core feature broken)  
**Commit**: `61ec8c3`

### Symptom

Clicking the "+ Compare" button in Parliament or DUN popups did nothing. The browser F12 console showed repeated `SyntaxError: Unexpected end of input` errors on `(index):1`.

### Root Cause

The popup HTML was generated via `popup.setHTML()` with an inline `onclick` handler:

```html
<button onclick="window.dispatchEvent(new CustomEvent('slgrvtrs:compare',{detail:{"code":"P.102",...}}))">+ Compare</button>
```

`JSON.stringify()` produces double-quoted strings. When injected into an HTML attribute already delimited by double quotes, the parser closes the attribute at the first inner `"`, truncating the JavaScript and producing a syntax error.

### Fix

1. Added `escapeHTMLAttr()` helper that escapes `&`, `"`, `'`, `<`, `>` for safe HTML attribute embedding.
2. Changed both Parliament and DUN popup builders to:
   - Store JSON in a `data-c` attribute (HTML-escaped)
   - Read it via `JSON.parse(this.dataset.c)` in the onclick handler

```html
<button data-c="{escaped JSON}" onclick="window.dispatchEvent(new CustomEvent('slgrvtrs:compare',{detail:JSON.parse(this.dataset.c)}))">+ Compare</button>
```

### Files Changed

- `dashboard/src/components/map/MapDashboard.tsx` — Added `escapeHTMLAttr()`, updated `buildParliamentPopupHTML()`, `buildDUNPopupHTML()`

---

## CF-61: Search Result Click Does Not Zoom to Constituency

**Date**: 2026-08-16  
**Severity**: P0 (core interaction broken)

### Symptom

Typing in the search box returns matching Parliament/DUN results, but clicking a result does not fly the map to that constituency.

### Root Cause

The `flyToConstituency()` function accessed GeoJSON data via `source._data`, which is not a documented/supported property in MapLibre GL JS. The internal `_data` reference may not be available after the source is added to the map.

### Fix

Stored independent references to the parsed GeoJSON objects during map bootstrap:

- `parlGeojsonRef` — stores the Parliament GeoJSON FeatureCollection
- `dunGeojsonRef` — stores the DUN GeoJSON FeatureCollection

`flyToConstituency()` now uses these refs to find the matching feature and compute its bounding box via `LngLatBounds`, then calls `map.flyTo()` with the computed center.

### Files Changed

- `dashboard/src/components/map/MapDashboard.tsx` — Added refs, rewrote `flyToConstituency()`

---

## CF-62: Gender Donut Chart Was a Horizontal Bar

**Date**: 2026-08-16  
**Severity**: P0 (documented feature missing)

### Symptom

The code contained a `genderDonut()` function that was described as generating a donut chart, but it actually rendered only a horizontal two-color bar (similar to the race bar).

### Fix

Replaced the implementation with a real SVG donut chart:

- Two `<circle>` elements with `stroke-dasharray` for male (blue) and female (pink) segments
- `stroke-dashoffset` calculations to position each arc correctly
- Center text showing total voter count
- Side legend with percentage breakdown and absolute counts
- Dimensions: 64×64 SVG, radius 18, stroke-width 8

### Files Changed

- `dashboard/src/components/map/MapDashboard.tsx` — Rewrote `genderDonut()` function

---

## CF-63: Layer Toggle Checkboxes Not Working

**Date**: 2026-08-16  
**Severity**: P0 (documented feature broken)

### Symptom

The sidebar layer toggle checkboxes (Parliament, DUN, DM Bubbles) did not hide or show their respective map layers when toggled.

### Fix

Implemented correct layer toggle logic using `map.setLayoutProperty()`:

```typescript
const handleLayerToggle = (layer: keyof LayerVisibility) => {
  const newVisible = !layers[layer];
  setLayers(prev => ({ ...prev, [layer]: newVisible }));
  const layerIds = layer === 'parliament' ? PARLIAMENT_LAYER_IDS
    : layer === 'dun' ? DUN_LAYER_IDS
    : DM_LAYER_IDS;
  layerIds.forEach(id => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', newVisible ? 'visible' : 'none');
    }
  });
};
```

All layer IDs per group are defined in constants (`PARLIAMENT_LAYER_IDS`, `DUN_LAYER_IDS`, `DM_LAYER_IDS`) to ensure complete coverage including fill, border, label, and hover layers.

### Files Changed

- `dashboard/src/components/map/MapDashboard.tsx` — Added `handleLayerToggle`, wired to sidebar checkboxes

---

## Summary

| Bug | Severity | Fix Type | Status |
|-----|----------|----------|--------|
| CF-60: Compare button | P0 | HTML attribute escaping | Fixed `≡c3` |
| CF-61: Search zoom | P0 | Independent GeoJSON refs | Fixed |
| CF-62: Donut chart | P0 | SVG donut implementation | Fixed |
| CF-63: Layer toggle | P0 | setLayoutProperty per group | Fixed |

---

## Phase 6–8 Bug Fixes

### CF-70: Search flyTo doesn't open popup
**Severity**: P2 (UX gap)  
**Status**: Fixed  
**Date**: 2026-08-16

When searching for a constituency and clicking the result, the map flew to the location but no popup was shown — only the selection chip appeared.

**Fix**: Added `map.once('moveend', ...)` handler in `flyToConstituency()` that opens the popup with the seat's stats after the flyTo animation completes.

### CF-71: ThemeToggle state desync with keyboard shortcut
**Severity**: P2 (UI inconsistency)  
**Status**: Fixed  
**Date**: 2026-08-16

When pressing the keyboard "T" shortcut to toggle theme, the ThemeToggle button icon didn't update because ThemeToggle had its own internal `theme` state that wasn't synced with MapDashboard's state.

**Fix**: Refactored ThemeToggle to a **controlled component** — `theme` and `basemap` are passed as props from MapDashboard. ThemeToggle only renders UI and fires callbacks.

### CF-72: `/api/insights` fails on CF Workers — "Configuration file not found"
**Severity**: P1 (feature broken on production)  
**Status**: Fixed  
**Date**: 2026-08-16

The `z-ai-web-dev-sdk`'s `ZAI.create()` reads `.z-ai-config` from the filesystem, which doesn't exist on CF Workers.

**Fix**: Replaced the SDK call with Cloudflare AI Workers (`env.AI.run()`). Added `"ai": { "binding": "AI" }` to `wrangler.jsonc`. The route now uses the native CF AI binding (no external config needed). Fallback to REST API for local dev.

### CF-73: CF build fails — "No open-next.config.ts found in project root"
**Severity**: P0 (build broken)  
**Status**: Fixed  
**Date**: 2026-08-16

The CF dashboard build settings were changed to Root directory=`/`, but the project code lives in `dashboard/`. OpenNext couldn't find `open-next.config.ts` at root.

**Fix**: Moved all `dashboard/` contents to the repo root so the build works with Root=`/`. Also kept `dashboard/` in sync for builds that use Root=`dashboard`. See `CF_BUILD_FIX.md` for full analysis.

### CF-74: Production missing new features (dashboard/ not synced)
**Severity**: P0 (features missing on production)  
**Status**: Fixed  
**Date**: 2026-08-16

New feature components were added to the repo root `src/` but not synced to `dashboard/src/`. The CF build (which uses `dashboard/` as the app root) was building old code.

**Fix**: Synced all 9 new component files + updated MapDashboard, globals.css, page.tsx, BookmarksMenu, KeyboardShortcuts, ShareButton from root `src/` to `dashboard/src/`.

### CF-75: DUNStats TypeScript interface missing `code_parlimen`
**Severity**: P1 (build fails)  
**Status**: Fixed  
**Date**: 2026-08-16

The local `DUNStats` interface in MapDashboard was missing the `code_parlimen` field, causing a TypeScript error when assigning `DUNStatsMap` to `Record<string, DunStats>`.

**Fix**: Added `code_parlimen: string` to the local `DUNStats` interface.

### CF-76: Recharts XAxis `tick` prop rejects `angle`/`textAnchor`
**Severity**: P1 (build fails)  
**Status**: Fixed  
**Date**: 2026-08-16

The recharts v2 `XAxis` component's `tick` prop doesn't accept `angle` or `textAnchor` — these must be set as direct `XAxis` props.

**Fix**: Moved `angle={-45}`, `textAnchor="end"`, `height={50}`, `tickMargin={4}` from the `tick` object to the `XAxis` component props.

---

---

## Phase 9 Bug Fixes

### CF-77: Data table rows not clickable
**Severity**: P2 (UX gap)  
**Status**: Fixed  
**Date**: 2026-08-17

Data Table Explorer rows were display-only — clicking a row did nothing. Users had to close the modal, search for the constituency, then click it.

**Fix**: Added `onFlyTo` prop to DataTableView. Each row is now `cursor-pointer` with a hover location-pin icon. Clicking a row calls `flyToConstituency()` and auto-closes the modal. The fly-to opens the popup with full voter stats via the `moveend` handler.

### CF-78: No feedback on layer toggle
**Severity**: P3 (UX polish)  
**Status**: Fixed  
**Date**: 2026-08-17

Toggling Parliament/DUN/DM layers had no visual feedback — users couldn't tell if the toggle worked.

**Fix**: Added toast notification to the `toggleLayer` callback: "Parliament layer on/off", "DUN layer on/off", "DM Bubbles layer on/off" (info type, 1.5s).

---

## Phase 10 Bug Fixes

### CF-79: Exports not password-protected (Data Table + Comparison)
**Severity**: P1 (security)  
**Status**: Fixed  
**Date**: 2026-08-17

The Data Table Explorer's "Export CSV" and the Compare tab's "Export CSV" buttons were using client-side Blob downloads — no password verification.

**Fix**: Replaced both with server-side password-protected endpoints. Data Table now calls `/api/export/csv` with PasswordDialog. Comparison now calls new `/api/export/comparison` endpoint. Both verify PBKDF2 password hash before returning CSV.

### CF-80: "Download All 945 DMs" and "Download Individual Voters" not showing password dialog
**Severity**: P1 (UX broken)  
**Status**: Fixed  
**Date**: 2026-08-17

The `allDmMode` and `dmVoterMode` flags weren't being properly reset when switching between download buttons, causing the PasswordDialog to use the wrong handler or not appear.

**Fix**: Each button click handler now explicitly resets the other mode flags before setting its own: `handleExportClick` resets both, `handleAllDmClick` resets `dmVoterMode`, `handleDmVoterClick` resets `allDmMode`.

### CF-81: DUN level missing "By DUN" filter option
**Severity**: P2 (UX gap)  
**Status**: Fixed  
**Date**: 2026-08-17

When selecting DUN export level, the filter options only had "All DUNs" and "By Parliament" — the "By DUN" option was missing. Users couldn't filter DMs by a specific DUN.

**Fix**: Added `{ value: 'dun', label: 'By DUN' }` to the DUN level filter options. Fixed `seatList` to return `dunOptions` when `filterMode='dun'` at any level.

### CF-82: Heatmap always uses total_voters regardless of selected metric
**Severity**: P2 (feature broken)  
**Status**: Fixed  
**Date**: 2026-08-17

The heatmap was hardcoded to use `total_voters` as the data property. When switching to other metrics (Malay %, Chinese %, etc.), the heatmap colors stayed the same.

**Fix**: The heatmap now reads the active metric's color scale to determine the correct property name and min/max range. The gradient is interpolated across 5 stops based on the metric's actual value range (not just voter counts).

### CF-83: Legend shows choropleth colors when heatmap mode is active
**Severity**: P3 (visual mismatch)  
**Status**: Fixed  
**Date**: 2026-08-17

When switching to Heatmap visualization mode, the map rendered in red/orange tones but the legend gradient bar still showed the choropleth color scale (green/blue).

**Fix**: Added `heatmapMode` prop to the Legend component. When true: shows red-orange gradient bar matching the heatmap colors, a "HEATMAP" badge, rose accent bar, and rose/red Low/High indicators. MapDashboard passes `heatmapMode={vizMode === 'heatmap'}`.

---

## Updated Summary

| Bug | Severity | Fix Type | Status |
|-----|----------|----------|--------|
| CF-60: Compare button | P0 | HTML attribute escaping | Fixed |
| CF-61: Search zoom | P0 | Independent GeoJSON refs | Fixed |
| CF-62: Donut chart | P0 | SVG donut implementation | Fixed |
| CF-63: Layer toggle | P0 | setLayoutProperty per group | Fixed |
| CF-70: Search flyTo popup | P2 | moveend event handler | Fixed |
| CF-71: ThemeToggle desync | P2 | Controlled component | Fixed |
| CF-72: AI insights on CF | P1 | env.AI.run() binding | Fixed |
| CF-73: CF build open-next | P0 | Root-level restructure | Fixed |
| CF-74: Production sync | P0 | dashboard/ sync | Fixed |
| CF-75: DUNStats interface | P1 | Added code_parlimen | Fixed |
| CF-76: Recharts XAxis | P1 | Props moved to XAxis | Fixed |
| CF-77: Data table fly-to | P2 | onFlyTo prop + row click | Fixed |
| CF-78: Layer toggle toast | P3 | Toast in toggleLayer | Fixed |
| CF-79: Exports not password-protected | P1 | Server-side endpoints + PBKDF2 | Fixed |
| CF-80: Password dialog not showing | P1 | Reset mode flags on click | Fixed |
| CF-81: DUN missing By DUN filter | P2 | Added filter option + seatList fix | Fixed |
| CF-82: Heatmap ignores metric | P2 | Use activeMetric's color scale | Fixed |
| CF-83: Legend shows wrong colors in heatmap | P3 | heatmapMode prop on Legend | Fixed |
| CF-84: DM voter download fails for most DMs | P1 | Generate on-the-fly from D1 (no R2) | Fixed |
| CF-85: xlsx files publicly downloadable from repo | P0 | Transfer to R2 + purge git history | Fixed |

---

## Phase 12 Bug Fixes

### CF-86: React 19 "Cannot update a component while rendering a different component"
**Severity**: P2 (console warning, no functional break)  
**Status**: Fixed  
**Date**: 2026-08-17

`addToComparison()` was calling `toast()` inside the `setComparisonList(prev => …)` updater. React 19 now warns when this pattern causes a different component (`ToastProvider`) to update during another component's (`MapDashboard`) render phase.

**Fix**: Snapshot the comparison list via a `comparisonListRef` (`useRef`). The `addToComparison` handler reads the ref synchronously, decides the toast message (success / duplicate / full) **outside** the updater, then calls `setComparisonList` with a pure functional update that only returns the new array — no side effects.

### CF-87: ESLint errors (setState-in-effect) in PasswordDialog + RecentlyViewed
**Severity**: P2 (lint errors)  
**Status**: Fixed  
**Date**: 2026-08-17

Both `PasswordDialog.tsx` and `RecentlyViewed.tsx` called `setState` directly inside a `useEffect`, which `eslint-plugin-react-hooks` flags as a state-update-in-effect violation.

**Fix**:
- `PasswordDialog.tsx` — moved the state reset out of the effect and into a wrapped `handleClose` callback invoked from the close button.
- `RecentlyViewed.tsx` — moved the refresh into a `queueMicrotask` so it doesn't trigger a synchronous cascading render.

### CF-88: avgContact calculation in AnalyticsDrawer was off by 100×
**Severity**: P1 (analytics correctness)  
**Status**: Fixed  
**Date**: 2026-08-17

`avgContact` was being computed as a fraction (0.6953) but displayed as a percentage (`"0.8%"`). The cause was a double `/100` — once when averaging and again when formatting.

**Fix**: Removed the extra `/100` from the formatting path. The drawer now correctly shows ~76.8% Avg Contact % in the new voter-weighted MetricCard.

### CF-89: CF Pages build failure — package.json/lockfile desync in dashboard/
**Severity**: P0 (build broken)  
**Status**: Fixed  
**Date**: 2026-08-17

Commit `5b584d7` copied the root `package.json` to `dashboard/`, which bumped `@opennextjs/cloudflare` from `^1.20.1` to `^1.20.2`. But `dashboard/package-lock.json` was generated with `1.20.1`, so CF Pages' `npm ci` failed with:
```
lock file's @opennextjs/cloudflare@1.20.1 does not satisfy
@opennextjs/cloudflare@1.20.2
```
This affected ~40 transitive `@smithy/*` dependencies.

**Fix**: Reverted `dashboard/package.json`'s `@opennextjs/cloudflare` version back to `^1.20.1` (the version the existing lockfile was generated with). Did NOT touch the source code — all Phase 12 features (RecentlyViewed, ScreenshotButton, AnalyticsDrawer, MapDashboard, etc.) remained in place.

**Lesson**: when syncing files root → dashboard/, NEVER copy `package.json` or `package-lock.json` — the two folders have independent dependency trees. Only sync source code (`src/`), non-npm config (`next.config.ts`, `wrangler.jsonc`, `tsconfig.json`), and CSS.

### CF-90: TypeScript build failure — skills/ directory contained .ts files with type errors
**Severity**: P1 (build broken)  
**Status**: Fixed  
**Date**: 2026-08-17

The repo-root `tsconfig.json` was type-checking every `**/*.ts` file under the repo, including `skills/`, `scripts/`, and `analysis/` — which contained third-party skill scripts with type errors unrelated to the dashboard.

**Fix**: Added `skills`, `scripts`, and `analysis` to the `exclude` array in `tsconfig.json`. Now `npx tsc --noEmit` only checks the dashboard source under `src/`.

### CF-91: Dev server 500 errors — `initOpenNextCloudflareForDev()` missing
**Severity**: P0 (dev broken)  
**Status**: Fixed  
**Date**: 2026-08-17

Every API route returned HTTP 500 in `next dev` with:
```
getCloudflareContext has been called without having called initOpenNextCloudflareForDev
```

**Fix**: Imported `initOpenNextCloudflareForDev` from `@opennextjs/cloudflare` in `next.config.ts` and called it before `nextConfig` is defined. Guarded by `process.env.NODE_ENV === "development"` so it never runs during `next build` / CF Pages production builds — the function tries to connect to Cloudflare via `getPlatformProxy()` which we don't want during a build.

### CF-92: Preview host blocked by Next.js `allowedDevOrigins`
**Severity**: P2 (dev broken in z.ai preview)  
**Status**: Fixed  
**Date**: 2026-08-17

Even after CF-91, `next dev` blocked cross-origin requests from the in-IDE preview host `preview-chat-fcc1f2f5-…space-z.ai` (Next.js 16's new `allowedDevOrigins` guard rejects unknown preview hosts).

**Fix**: Added the explicit preview hostname plus `*.space-z.ai` and `localhost:3000` to the `allowedDevOrigins` array in `next.config.ts`. Dev server now serves chunks + HMR to the preview panel without errors.

---

## Updated Summary (incl. Phase 12)

| Bug | Severity | Fix Type | Status |
|-----|----------|----------|--------|
| CF-60: Compare button | P0 | HTML attribute escaping | Fixed |
| CF-61: Search zoom | P0 | Independent GeoJSON refs | Fixed |
| CF-62: Donut chart | P0 | SVG donut implementation | Fixed |
| CF-63: Layer toggle | P0 | setLayoutProperty per group | Fixed |
| CF-70: Search flyTo popup | P2 | moveend event handler | Fixed |
| CF-71: ThemeToggle desync | P2 | Controlled component | Fixed |
| CF-72: AI insights on CF | P1 | env.AI.run() binding | Fixed |
| CF-73: CF build open-next | P0 | Root-level restructure | Fixed |
| CF-74: Production sync | P0 | dashboard/ sync | Fixed |
| CF-75: DUNStats interface | P1 | Added code_parlimen | Fixed |
| CF-76: Recharts XAxis | P1 | Props moved to XAxis | Fixed |
| CF-77: Data table fly-to | P2 | onFlyTo prop + row click | Fixed |
| CF-78: Layer toggle toast | P3 | Toast in toggleLayer | Fixed |
| CF-79: Exports not password-protected | P1 | Server-side endpoints + PBKDF2 | Fixed |
| CF-80: Password dialog not showing | P1 | Reset mode flags on click | Fixed |
| CF-81: DUN missing By DUN filter | P2 | Added filter option + seatList fix | Fixed |
| CF-82: Heatmap ignores metric | P2 | Use activeMetric's color scale | Fixed |
| CF-83: Legend shows wrong colors in heatmap | P3 | heatmapMode prop on Legend | Fixed |
| CF-84: DM voter download fails for most DMs | P1 | Generate on-the-fly from D1 (no R2) | Fixed |
| CF-85: xlsx files publicly downloadable from repo | P0 | Transfer to R2 + purge git history | Fixed |
| CF-86: React 19 setState-in-updater warning | P2 | Ref snapshot + decide toast outside updater | Fixed |
| CF-87: setState-in-effect lint errors | P2 | Wrapped close handler + queueMicrotask | Fixed |
| CF-88: avgContact 0.8% vs 76.8% | P1 | Removed double /100 | Fixed |
| CF-89: dashboard/package.json desync | P0 | Revert @opennextjs/cloudflare to ^1.20.1 | Fixed |
| CF-90: skills/ type errors broke tsc | P1 | Exclude skills/scripts/analysis in tsconfig | Fixed |
| CF-91: Dev server 500s | P0 | initOpenNextCloudflareForDev + NODE_ENV guard | Fixed |
| CF-92: Preview host blocked | P2 | allowedDevOrigins for *.space-z.ai | Fixed |
