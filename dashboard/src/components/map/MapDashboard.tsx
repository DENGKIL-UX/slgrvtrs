'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Map, Popup, NavigationControl, AttributionControl, LngLatBounds, type FilterSpecification } from '@/lib/map/setup';
import 'maplibre-gl/dist/maplibre-gl.css';
import { initMapLibre } from '@/lib/map/setup';
import { joinStatsToGeoJSON, type StatsMap, type ParliamentStats } from '@/lib/map/join-stats';
import { buildColorExpression, getScaleById, COLOR_SCALES, type ColorScale } from '@/lib/map/color-scales';
import Legend from '@/components/map/Legend';

// ============================================================
// Types
// ============================================================

interface PopupData extends ParliamentStats {
  voter_prefix: string;
}

interface DUNStats {
  code_dun: string;
  name: string;
  code_parlimen: string;
  total_voters: number;
  male: number;
  female: number;
  male_pct: number;
  female_pct: number;
  malay_pct: number;
  chinese_pct: number;
  indian_pct: number;
  other_pct: number;
  age_mean: number;
  age_median: number;
  contact_pct: number;
  dm_count: number;
  locality_count: number;
}

type DUNStatsMap = Record<string, DUNStats>;

interface DUNProperties {
  state: string;
  parlimen: string;
  dun: string;
  code_parlimen: string;
  code_dun: string;
  voter_prefix: string;
  parent_parl: string;
  // Joined stats from dun.json
  total_voters?: number;
  male?: number;
  female?: number;
  male_pct?: number;
  female_pct?: number;
  malay_pct?: number;
  chinese_pct?: number;
  indian_pct?: number;
  other_pct?: number;
  age_mean?: number;
  age_median?: number;
  contact_pct?: number;
  dm_count?: number;
  locality_count?: number;
}

// ============================================================
// Layer toggle state
// ============================================================

interface LayerVisibility {
  parliament: boolean;
  dun: boolean;
  dm: boolean;
}

// ============================================================
// Constants
// ============================================================

const SELANGOR_CENTER: [number, number] = [101.5, 3.1];
const DEFAULT_ZOOM = 8.5;
const MIN_ZOOM = 7;
const MAX_ZOOM = 18;

const DEFAULT_LAYERS: LayerVisibility = {
  parliament: true,
  dun: true,
  dm: false, // Phase 3 — not yet implemented
};

// All layer IDs per group for visibility toggling
const PARLIAMENT_LAYER_IDS = ['parliament-fill', 'parliament-label', 'parliament-border'];
const DUN_LAYER_IDS = ['dun-fill', 'dun-border', 'dun-label'];
const DM_LAYER_IDS: string[] = []; // Phase 3

// ============================================================
// Component
// ============================================================

export default function MapDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const hoveredIdRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState('total_voters');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [drilledParl, setDrilledParl] = useState<string | null>(null);

  // Keep a ref to activeMetric so the map callback always reads the latest
  const activeMetricRef = useRef(activeMetric);
  useEffect(() => {
    activeMetricRef.current = activeMetric;
  }, [activeMetric]);

  // ------- Toggle layer visibility -------
  const toggleLayer = useCallback((group: keyof LayerVisibility) => {
    setLayers((prev) => {
      const next = { ...prev, [group]: !prev[group] };
      const map = mapRef.current;
      if (!map) return next;

      const visible = next[group] ? 'visible' : 'none';
      const layerIds =
        group === 'parliament' ? PARLIAMENT_LAYER_IDS :
        group === 'dun' ? DUN_LAYER_IDS :
        DM_LAYER_IDS;

      layerIds.forEach((id) => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', visible);
        }
      });

      return next;
    });
  }, []);

  // ------- Reset drill-down -------
  const resetDrillDown = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove filter (show all DUNs)
    if (map.getLayer('dun-fill')) {
      map.setFilter('dun-fill', null);
    }
    if (map.getLayer('dun-border')) {
      map.setFilter('dun-border', null);
    }
    if (map.getLayer('dun-label')) {
      map.setFilter('dun-label', null);
    }

    // Fly back to state overview
    map.flyTo({ center: SELANGOR_CENTER, zoom: DEFAULT_ZOOM, duration: 800 });
    setDrilledParl(null);
    popupRef.current?.remove();
  }, []);

  // ------- Load data & initialize map -------
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    let cancelled = false;

    async function bootstrap() {
      try {
        initMapLibre();

        // Load all boundary data in parallel
        const [parlRes, statsRes, dunRes, dunStatsRes, outlineRes] = await Promise.all([
          fetch('/boundaries/selangor_parliament.geojson'),
          fetch('/stats/parliament.json'),
          fetch('/boundaries/selangor_dun.geojson'),
          fetch('/stats/dun.json'),
          fetch('/boundaries/selangor_outline.geojson'),
        ]);

        if (cancelled) return;

        const [parlGeojson, stats, dunGeojson, dunStats, outlineGeojson] = await Promise.all([
          parlRes.json(),
          statsRes.json() as Promise<StatsMap>,
          dunRes.json(),
          dunStatsRes.json() as Promise<DUNStatsMap>,
          outlineRes.json(),
        ]);

        // Join stats into parliament GeoJSON properties
        const joined = joinStatsToGeoJSON(parlGeojson, stats);

        // Join DUN stats into DUN GeoJSON properties
        const dunJoined = joinStatsToGeoJSON(dunGeojson, dunStats as unknown as StatsMap);

        if (cancelled) return;

        // Create map
        const map = new Map({
          container: containerRef.current!,
          style: {
            version: 8,
            name: 'SLGRVTRS Blank',
            sources: {},
            layers: [
              {
                id: 'background',
                type: 'background',
                paint: { 'background-color': '#f0f4f8' },
              },
            ],
            glyphs: 'https://basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
          },
          center: SELANGOR_CENTER,
          zoom: DEFAULT_ZOOM,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          attributionControl: false,
        });

        map.addControl(
          new AttributionControl({ compact: true }),
          'bottom-right'
        );
        map.addControl(new NavigationControl(), 'top-right');

        // ---- DUN hover state ref ----
        let hoveredDunId: number | null = null;

        map.on('load', () => {
          if (cancelled) return;

          // ==== SOURCES ====

          // State outline (JAKIM) — always behind everything
          map.addSource('outline', {
            type: 'geojson',
            data: outlineGeojson,
          });

          // Parliament (with joined stats)
          map.addSource('parliament', {
            type: 'geojson',
            data: joined,
          });

          // DUN boundaries (with joined stats)
          map.addSource('dun', {
            type: 'geojson',
            data: dunJoined,
          });

          // ==== STATE OUTLINE LAYER ====
          map.addLayer({
            id: 'outline-fill',
            type: 'fill',
            source: 'outline',
            paint: {
              'fill-color': '#e2e8f0',
              'fill-opacity': 0.35,
            },
          });
          map.addLayer({
            id: 'outline-border',
            type: 'line',
            source: 'outline',
            paint: {
              'line-color': '#475569',
              'line-width': 2.5,
              'line-opacity': 0.9,
            },
          });

          // ---- Initial scale ----
          const scale = getScaleById('total_voters');
          const colorExpr = buildColorExpression(scale.property, scale.stops);

          // ==== PARLIAMENT LAYERS ====
          // Fill: visible at state-level zoom (7–9)
          map.addLayer({
            id: 'parliament-fill',
            type: 'fill',
            source: 'parliament',
            maxzoom: 9,
            paint: {
              'fill-color': colorExpr,
              'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                0.92,
                0.72,
              ],
            },
          });

          // Border: always visible as outline reference
          map.addLayer({
            id: 'parliament-border',
            type: 'line',
            source: 'parliament',
            paint: {
              'line-color': '#1e293b',
              'line-width': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                2.5,
                1,
              ],
              'line-opacity': 0.8,
            },
          });

          // Label: only at state-level zoom
          map.addLayer({
            id: 'parliament-label',
            type: 'symbol',
            source: 'parliament',
            maxzoom: 9,
            layout: {
              'text-field': ['get', 'code_parlimen'],
              'text-size': 12,
              'text-font': ['Open Sans Regular'],
              'text-anchor': 'center',
              'text-allow-overlap': false,
              'text-ignore-placement': false,
            },
            paint: {
              'text-color': '#0f172a',
              'text-halo-color': 'rgba(255,255,255,0.85)',
              'text-halo-width': 1.5,
            },
          });

          // ==== DUN LAYERS ====
          // Fill: appears when zoomed past state level
          map.addLayer({
            id: 'dun-fill',
            type: 'fill',
            source: 'dun',
            minzoom: 8.5,
            paint: {
              'fill-color': '#b2dfdb',
              'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                0.75,
                0.5,
              ],
            },
          });

          // Border
          map.addLayer({
            id: 'dun-border',
            type: 'line',
            source: 'dun',
            minzoom: 8.5,
            paint: {
              'line-color': '#00695c',
              'line-width': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                2,
                0.8,
              ],
              'line-opacity': 0.7,
            },
          });

          // Label: visible from zoom 9+ to avoid clutter
          map.addLayer({
            id: 'dun-label',
            type: 'symbol',
            source: 'dun',
            minzoom: 9,
            layout: {
              'text-field': ['get', 'code_dun'],
              'text-size': 10,
              'text-font': ['Open Sans Regular'],
              'text-anchor': 'center',
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            },
            paint: {
              'text-color': '#004d40',
              'text-halo-color': 'rgba(255,255,255,0.9)',
              'text-halo-width': 1.2,
            },
          });

          // ==== POPUP (shared) ====
          const popup = new Popup({
            closeButton: true,
            closeOnClick: false,
            anchor: 'top',
            maxWidth: '340px',
            offset: 10,
            className: 'parliament-popup',
          });
          popupRef.current = popup;

          // ---- Parliament click → drill-down to DUNs ----
          map.on('click', 'parliament-fill', (e) => {
            if (!e.features?.length) return;
            const feat = e.features[0];
            const props = feat.properties as unknown as PopupData;
            const codeParlimen = props.code_parlimen;

            // Filter DUN layers to show only this Parliament's child DUNs
            const dunsFilter: FilterSpecification = ['==', ['get', 'parent_parl'], codeParlimen] as unknown as FilterSpecification;
            DUN_LAYER_IDS.forEach((id) => {
              if (map.getLayer(id)) {
                map.setFilter(id, dunsFilter);
              }
            });

            // Fly to the clicked Parliament's bounds
            if (feat.geometry && feat.geometry.type === 'Polygon') {
              const bounds = new LngLatBounds();
              for (const ring of feat.geometry.coordinates) {
                for (const coord of ring) {
                  bounds.extend(coord as [number, number]);
                }
              }
              map.flyTo({
                center: bounds.getCenter(),
                zoom: 10.5,
                duration: 800,
                padding: { top: 40, bottom: 40, left: 40, right: 40 },
              });
            }

            // Show popup with Parliament info + drill-down hint
            popup
              .setLngLat(e.lngLat)
              .setHTML(buildParliamentPopupHTML(props, true))
              .addTo(map);

            setDrilledParl(codeParlimen);
          });

          // ---- Parliament hover highlight ----
          map.on('mousemove', 'parliament-fill', (e) => {
            if (!e.features?.length) return;
            const fid = e.features[0].id as number;
            if (hoveredIdRef.current !== null && hoveredIdRef.current !== fid) {
              map.setFeatureState(
                { source: 'parliament', id: hoveredIdRef.current },
                { hover: false },
              );
            }
            hoveredIdRef.current = fid;
            map.setFeatureState(
              { source: 'parliament', id: fid },
              { hover: true },
            );
            map.getCanvas().style.cursor = 'pointer';
          });

          map.on('mouseleave', 'parliament-fill', () => {
            if (hoveredIdRef.current !== null) {
              map.setFeatureState(
                { source: 'parliament', id: hoveredIdRef.current },
                { hover: false },
              );
              hoveredIdRef.current = null;
            }
            map.getCanvas().style.cursor = '';
          });

          // ---- DUN click → popup ----
          map.on('click', 'dun-fill', (e) => {
            if (!e.features?.length) return;
            const props = e.features[0].properties as unknown as DUNProperties;
            popup
              .setLngLat(e.lngLat)
              .setHTML(buildDUNPopupHTML(props))
              .addTo(map);
          });

          // ---- DUN hover highlight ----
          map.on('mousemove', 'dun-fill', (e) => {
            if (!e.features?.length) return;
            const fid = e.features[0].id as number;
            if (hoveredDunId !== null && hoveredDunId !== fid) {
              map.setFeatureState(
                { source: 'dun', id: hoveredDunId },
                { hover: false },
              );
            }
            hoveredDunId = fid;
            map.setFeatureState(
              { source: 'dun', id: fid },
              { hover: true },
            );
            map.getCanvas().style.cursor = 'pointer';
          });

          map.on('mouseleave', 'dun-fill', () => {
            if (hoveredDunId !== null) {
              map.setFeatureState(
                { source: 'dun', id: hoveredDunId },
                { hover: false },
              );
              hoveredDunId = null;
            }
            map.getCanvas().style.cursor = '';
          });

          setLoading(false);
        });

        mapRef.current = map;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load map data');
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ------- Update choropleth when metric changes -------
  const updateMetric = useCallback(
    (metricId: string) => {
      const map = mapRef.current;
      if (!map) return;
      const scale = getScaleById(metricId);
      const colorExpr = buildColorExpression(scale.property, scale.stops);
      map.setPaintProperty('parliament-fill', 'fill-color', colorExpr);
    },
    [],
  );

  useEffect(() => {
    updateMetric(activeMetric);
  }, [activeMetric, updateMetric]);

  const currentScale = getScaleById(activeMetric);

  return (
    <div className="relative w-full h-screen flex overflow-hidden bg-slate-100">
      {/* ======= Sidebar ======= */}
      <aside
        className={`${
          sidebarOpen ? 'w-72' : 'w-0'
        } transition-all duration-300 bg-white border-r border-slate-200 flex-shrink-0 overflow-hidden flex flex-col`}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            SLGRVTRS
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Selangor Voter Registry — 3,971,650 voters
          </p>
        </div>

        {/* Layer Toggles */}
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">
            Layers
          </label>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={layers.parliament}
                onChange={() => toggleLayer('parliament')}
                className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="text-xs text-slate-700 group-hover:text-slate-900">Parliament (22)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={layers.dun}
                onChange={() => toggleLayer('dun')}
                className="w-3.5 h-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
              />
              <span className="text-xs text-slate-700 group-hover:text-slate-900">DUN (56)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={layers.dm}
                onChange={() => toggleLayer('dm')}
                disabled
                className="w-3.5 h-3.5 rounded border-slate-300 text-slate-400 focus:ring-slate-400 cursor-not-allowed opacity-40"
              />
              <span className="text-xs text-slate-400">DM Centroids (Phase 3)</span>
            </label>
          </div>
        </div>

        {/* Metric Selector */}
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Choropleth Metric
          </label>
          <select
            value={activeMetric}
            onChange={(e) => setActiveMetric(e.target.value)}
            className="mt-1.5 w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          >
            {COLOR_SCALES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Legend — using reusable component */}
        <div className="p-4 flex-shrink-0">
          <Legend scale={currentScale} />
        </div>

        {/* Drill-down breadcrumb (when active) */}
        {drilledParl && (
          <div className="px-4 pb-3 flex-shrink-0">
            <button
              onClick={resetDrillDown}
              className="w-full flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-900 font-medium py-1.5 px-2 rounded-md hover:bg-emerald-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Selangor overview
            </button>
            <p className="text-[10px] text-slate-500 mt-1 px-2">
              Showing DUNs under {drilledParl}
            </p>
          </div>
        )}

        {/* Info */}
        <div className="mt-auto p-4 border-t border-slate-200 flex-shrink-0">
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Boundaries derived from SPR 2018 delimitation; GeoJSON by
            ElectionData.MY. Not official SPR boundaries.
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Phase 2 — Parliament (22) + DUN (56) + Drill-Down + Toggles
          </p>
        </div>
      </aside>

      {/* ======= Map ======= */}
      <main className="flex-1 relative">
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="absolute top-3 left-3 z-10 bg-white rounded-md shadow-md p-2 hover:bg-slate-50 transition-colors border border-slate-200"
          aria-label="Toggle sidebar"
        >
          <svg
            className="w-4 h-4 text-slate-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {sidebarOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 5l7 7-7 7M5 5l7 7-7 7"
              />
            )}
          </svg>
        </button>

        {/* Map container */}
        <div ref={containerRef} className="w-full h-full" />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90 z-20">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-6 w-6 border-3 border-emerald-500 border-t-transparent rounded-full" />
              <span className="text-sm text-slate-600">
                Loading Selangor Voter Map…
              </span>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/95 z-20">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm text-center">
              <p className="text-red-600 font-medium">Failed to load</p>
              <p className="text-sm text-slate-500 mt-1">{error}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================
// Popup HTML builders
// ============================================================

function buildParliamentPopupHTML(p: PopupData, isDrillDown: boolean = false): string {
  return `
    <div style="font-family: system-ui, sans-serif;">
      <div style="font-weight:700; font-size:15px; color:#0f172a;">
        ${p.code_parlimen} — ${p.name}
      </div>
      <div style="font-size:11px; color:#64748b; margin-bottom:8px;">
        Parliamentary Constituency
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Total Voters</strong></td>
          <td style="text-align:right;font-weight:600;">${p.total_voters.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Male</strong></td>
          <td style="text-align:right;">${p.male_pct}% (${p.male.toLocaleString()})</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Female</strong></td>
          <td style="text-align:right;">${p.female_pct}% (${p.female.toLocaleString()})</td>
        </tr>
      </table>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Malay</strong></td>
          <td style="text-align:right;">${p.malay_pct}%</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Chinese</strong></td>
          <td style="text-align:right;">${p.chinese_pct}%</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Indian</strong></td>
          <td style="text-align:right;">${p.indian_pct}%</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Others</strong></td>
          <td style="text-align:right;">${p.other_pct}%</td>
        </tr>
      </table>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Mean Age</strong></td>
          <td style="text-align:right;">${p.age_mean}</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Median Age</strong></td>
          <td style="text-align:right;">${p.age_median}</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Contact %</strong></td>
          <td style="text-align:right;">${p.contact_pct}%</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>DUNs</strong></td>
          <td style="text-align:right;">${p.child_dun_count}</td>
        </tr>
      </table>
      ${isDrillDown ? `
      <div style="font-size:10px;color:#059669;margin-top:8px;font-weight:500;">
        Zoomed to ${p.child_dun_count} DUN seat${p.child_dun_count > 1 ? 's' : ''} — click DUNs for details
      </div>
      ` : ''}
    </div>
  `;
}

function buildDUNPopupHTML(p: DUNProperties): string {
  const hasStats = p.total_voters !== undefined;
  const dunName = p.dun.replace(/^N\.\d+\s+/, '');
  const parlName = p.parlimen.replace(/^P\.\d+\s+/, '');

  return `
    <div style="font-family: system-ui, sans-serif;">
      <div style="font-weight:700; font-size:14px; color:#004d40;">
        ${p.code_dun} — ${dunName}
      </div>
      <div style="font-size:11px; color:#64748b; margin-bottom:6px;">
        State Legislative Assembly
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:6px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Parent Parliament</strong></td>
          <td style="text-align:right;">${p.parent_parl} ${parlName}</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>DUN Code</strong></td>
          <td style="text-align:right;">${p.code_dun}</td>
        </tr>
      </table>
      ${hasStats ? `
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:6px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Total Voters</strong></td>
          <td style="text-align:right;font-weight:600;">${p.total_voters!.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Male</strong></td>
          <td style="text-align:right;">${p.male_pct}% (${p.male!.toLocaleString()})</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Female</strong></td>
          <td style="text-align:right;">${p.female_pct}% (${p.female!.toLocaleString()})</td>
        </tr>
      </table>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:6px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Malay</strong></td>
          <td style="text-align:right;">${p.malay_pct}%</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Chinese</strong></td>
          <td style="text-align:right;">${p.chinese_pct}%</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Indian</strong></td>
          <td style="text-align:right;">${p.indian_pct}%</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Others</strong></td>
          <td style="text-align:right;">${p.other_pct}%</td>
        </tr>
      </table>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:6px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Mean Age</strong></td>
          <td style="text-align:right;">${p.age_mean}</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Median Age</strong></td>
          <td style="text-align:right;">${p.age_median}</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Contact %</strong></td>
          <td style="text-align:right;">${p.contact_pct}%</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>DMs</strong></td>
          <td style="text-align:right;">${p.dm_count}</td>
        </tr>
        <tr>
          <td style="padding:2px 8px 2px 0;"><strong>Localities</strong></td>
          <td style="text-align:right;">${p.locality_count}</td>
        </tr>
      </table>
      ` : `
      <div style="font-size:10px;color:#94a3b8;margin-top:8px;">
        No voter statistics available for this seat.
      </div>
      `}
    </div>
  `;
}