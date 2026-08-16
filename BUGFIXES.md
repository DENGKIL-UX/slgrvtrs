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
