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
