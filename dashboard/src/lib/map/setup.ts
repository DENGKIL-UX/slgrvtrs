import { Map, Popup, NavigationControl, AttributionControl, setWorkerUrl } from "maplibre-gl";

export type { Map as MapLibreMap } from "maplibre-gl";
export { Map, Popup, NavigationControl, AttributionControl, setWorkerUrl };

let initialized = false;

/**
 * Configure the MapLibre web worker URL for bundler compatibility.
 * Call once before creating any Map instance.
 */
export function initMapLibre() {
  if (initialized) return;
  initialized = true;

  try {
    setWorkerUrl(
      new URL(
        "maplibre-gl/dist/maplibre-gl-worker.mjs",
        import.meta.url
      ).href
    );
  } catch {
    // Worker URL resolution may fail in some environments;
    // MapLibre will fall back to its default worker loading.
  }
}
