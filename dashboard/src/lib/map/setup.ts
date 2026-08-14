import { Map, Popup, NavigationControl, AttributionControl, LngLatBounds, setWorkerUrl } from "maplibre-gl";

export type { Map as MapLibreMap, FilterSpecification } from "maplibre-gl";
export { Map, Popup, NavigationControl, AttributionControl, LngLatBounds, setWorkerUrl };

let initialized = false;

/**
 * Configure the MapLibre web worker URL.
 *
 * MapLibre v6's worker is ESM and imports from a sibling shared module.
 * We place both files in public/ with corrected import paths so the
 * worker can load as a module worker without bundler URL resolution issues.
 */
export function initMapLibre() {
  if (initialized) return;
  initialized = true;
  setWorkerUrl("/maplibre-gl-worker.mjs");
}
