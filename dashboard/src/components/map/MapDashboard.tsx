'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Map,
  Popup,
  NavigationControl,
  AttributionControl,
} from '@/lib/map/setup';
import 'maplibre-gl/dist/maplibre-gl.css';
import { initMapLibre } from '@/lib/map/setup';
import {
  joinStatsToGeoJSON,
  type ParlStatsMap,
  type DunStatsMap,
} from '@/lib/map/join-stats';
import {
  buildColorExpression,
  getScaleById,
  getDunScaleById,
  PARL_COLOR_SCALES,
  DUN_COLOR_SCALES,
  type ColorScale,
} from '@/lib/map/color-scales';
import Legend from '@/components/map/Legend';

// ============================================================
// Types
// ============================================================

interface ParlPopupData {
  code_parlimen: string;
  name: string;
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
  child_dun_count: number;
  voter_prefix: string;
}

interface DunPopupData {
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
  voter_prefix: string;
}

// ============================================================
// Constants
// ============================================================

const SELANGOR_CENTER: [number, number] = [101.5, 3.1];
const DEFAULT_ZOOM = 8.5;
const MIN_ZOOM = 7;
const MAX_ZOOM = 18;

// ============================================================
// Component
// ============================================================

export default function MapDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const hoveredParlIdRef = useRef<number | null>(null);
  const hoveredDunIdRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState('total_voters');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showParl, setShowParl] = useState(true);
  const [showDun, setShowDun] = useState(true);
  const [drilledParl, setDrilledParl] = useState<string | null>(null);

  // Keep refs to latest state for map callbacks
  const activeMetricRef = useRef(activeMetric);
  useEffect(() => {
    activeMetricRef.current = activeMetric;
  }, [activeMetric]);

  // ------- Load data & initialize map -------
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    let cancelled = false;

    async function bootstrap() {
      try {
        initMapLibre();

        const [parlGeoRes, parlStatsRes, dunGeoRes, dunStatsRes] =
          await Promise.all([
            fetch('/boundaries/selangor_parliament.geojson'),
            fetch('/stats/parliament.json'),
            fetch('/boundaries/selangor_dun.geojson'),
            fetch('/stats/dun.json'),
          ]);

        if (cancelled) return;

        const [parlGeo, parlStats, dunGeo, dunStats] = await Promise.all([
          parlGeoRes.json(),
          parlStatsRes.json() as Promise<ParlStatsMap>,
          dunGeoRes.json(),
          dunStatsRes.json() as Promise<DunStatsMap>,
        ]);

        const parlJoined = joinStatsToGeoJSON(parlGeo, parlStats);
        const dunJoined = joinStatsToGeoJSON(dunGeo, dunStats);

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
            glyphs:
              'https://basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
          },
          center: SELANGOR_CENTER,
          zoom: DEFAULT_ZOOM,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          attributionControl: false,
        });

        map.addControl(
          new AttributionControl({ compact: true }),
          'bottom-right',
        );
        map.addControl(new NavigationControl(), 'top-right');

        map.on('load', () => {
          if (cancelled) return;

          // ==================== PARLIAMENT SOURCE ====================
          map.addSource('parliament', {
            type: 'geojson',
            data: parlJoined,
          });

          // Parliament fill
          const pScale = getScaleById(activeMetricRef.current);
          map.addLayer({
            id: 'parliament-fill',
            type: 'fill',
            source: 'parliament',
            maxzoom: 9,
            paint: {
              'fill-color': buildColorExpression(pScale.property, pScale.stops),
              'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                0.92,
                0.72,
              ],
            },
          });

          // Parliament border (always visible as outline)
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
                0.8,
              ],
              'line-opacity': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                0.9,
                0.35,
              ],
            },
          });

          // Parliament label
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

          // ==================== DUN SOURCE ====================
          map.addSource('dun', {
            type: 'geojson',
            data: dunJoined,
          });

          // DUN fill
          const dScale = getDunScaleById(activeMetricRef.current);
          map.addLayer({
            id: 'dun-fill',
            type: 'fill',
            source: 'dun',
            minzoom: 8,
            paint: {
              'fill-color': buildColorExpression(dScale.property, dScale.stops),
              'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                0.88,
                0.65,
              ],
            },
          });

          // DUN border
          map.addLayer({
            id: 'dun-border',
            type: 'line',
            source: 'dun',
            minzoom: 8,
            paint: {
              'line-color': '#1e293b',
              'line-width': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                2,
                0.8,
              ],
              'line-opacity': 0.7,
            },
          });

          // DUN label
          map.addLayer({
            id: 'dun-label',
            type: 'symbol',
            source: 'dun',
            minzoom: 9.5,
            layout: {
              'text-field': ['get', 'code_dun'],
              'text-size': 11,
              'text-font': ['Open Sans Regular'],
              'text-anchor': 'center',
              'text-allow-overlap': false,
              'text-ignore-placement': false,
            },
            paint: {
              'text-color': '#0f172a',
              'text-halo-color': 'rgba(255,255,255,0.9)',
              'text-halo-width': 1.5,
            },
          });

          // ==================== POPUP ====================
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
            const props = e.features[0].properties as unknown as ParlPopupData;
            const codeParl = props.code_parlimen;

            // Filter DUN layers to this parliament
            map.setFilter('dun-fill', [
              '==', ['get', 'parent_parl'], codeParl,
            ]);
            map.setFilter('dun-border', [
              '==', ['get', 'parent_parl'], codeParl,
            ]);
            map.setFilter('dun-label', [
              '==', ['get', 'parent_parl'], codeParl,
            ]);

            setDrilledParl(codeParl);

            // Fly to parliament bounding box
            const feat = e.features[0];
            if (feat.geometry && feat.geometry.type === 'Polygon') {
              const coords = feat.geometry.coordinates[0];
              let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
              for (const [lng, lat] of coords) {
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
              }
              map.fitBounds(
                [[minLng, minLat], [maxLng, maxLat]],
                { padding: 60, duration: 800 },
              );
            }

            // Show parliament popup
            popup
              .setLngLat(e.lngLat)
              .setHTML(buildParlPopupHTML(props))
              .addTo(map);
          });

          // ---- DUN click → show DUN popup ----
          map.on('click', 'dun-fill', (e) => {
            if (!e.features?.length) return;
            const props = e.features[0].properties as unknown as DunPopupData;
            popup
              .setLngLat(e.lngLat)
              .setHTML(buildDunPopupHTML(props))
              .addTo(map);
          });

          // ---- Parliament hover ----
          map.on('mousemove', 'parliament-fill', (e) => {
            if (!e.features?.length) return;
            const fid = e.features[0].id as number;
            if (hoveredParlIdRef.current !== null && hoveredParlIdRef.current !== fid) {
              map.setFeatureState(
                { source: 'parliament', id: hoveredParlIdRef.current },
                { hover: false },
              );
            }
            hoveredParlIdRef.current = fid;
            map.setFeatureState(
              { source: 'parliament', id: fid },
              { hover: true },
            );
            map.getCanvas().style.cursor = 'pointer';
          });

          map.on('mouseleave', 'parliament-fill', () => {
            if (hoveredParlIdRef.current !== null) {
              map.setFeatureState(
                { source: 'parliament', id: hoveredParlIdRef.current },
                { hover: false },
              );
              hoveredParlIdRef.current = null;
            }
            map.getCanvas().style.cursor = '';
          });

          // ---- DUN hover ----
          map.on('mousemove', 'dun-fill', (e) => {
            if (!e.features?.length) return;
            const fid = e.features[0].id as number;
            if (hoveredDunIdRef.current !== null && hoveredDunIdRef.current !== fid) {
              map.setFeatureState(
                { source: 'dun', id: hoveredDunIdRef.current },
                { hover: false },
              );
            }
            hoveredDunIdRef.current = fid;
            map.setFeatureState(
              { source: 'dun', id: fid },
              { hover: true },
            );
            map.getCanvas().style.cursor = 'pointer';
          });

          map.on('mouseleave', 'dun-fill', () => {
            if (hoveredDunIdRef.current !== null) {
              map.setFeatureState(
                { source: 'dun', id: hoveredDunIdRef.current },
                { hover: false },
              );
              hoveredDunIdRef.current = null;
            }
            map.getCanvas().style.cursor = '';
          });

          // ---- Reset DUN filter when zooming out ----
          map.on('zoomend', () => {
            if (map.getZoom() < 8.5) {
              map.setFilter('dun-fill', null);
              map.setFilter('dun-border', null);
              map.setFilter('dun-label', null);
              setDrilledParl(null);
            }
          });

          setLoading(false);
        });

        mapRef.current = map;
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load map data',
          );
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
  const updateMetric = useCallback((metricId: string) => {
    const map = mapRef.current;
    if (!map) return;

    const pScale = getScaleById(metricId);
    map.setPaintProperty(
      'parliament-fill',
      'fill-color',
      buildColorExpression(pScale.property, pScale.stops),
    );

    const dScale = getDunScaleById(metricId);
    map.setPaintProperty(
      'dun-fill',
      'fill-color',
      buildColorExpression(dScale.property, dScale.stops),
    );
  }, []);

  useEffect(() => {
    updateMetric(activeMetric);
  }, [activeMetric, updateMetric]);

  // ------- Layer visibility -------
  const updateParlVisibility = useCallback(
    (visible: boolean) => {
      const map = mapRef.current;
      if (!map) return;
      const op = visible ? 'visible' : 'none';
      map.setLayoutProperty('parliament-fill', 'visibility', op);
      map.setLayoutProperty('parliament-border', 'visibility', op);
      map.setLayoutProperty('parliament-label', 'visibility', op);
    },
    [],
  );

  const updateDunVisibility = useCallback(
    (visible: boolean) => {
      const map = mapRef.current;
      if (!map) return;
      const op = visible ? 'visible' : 'none';
      map.setLayoutProperty('dun-fill', 'visibility', op);
      map.setLayoutProperty('dun-border', 'visibility', op);
      map.setLayoutProperty('dun-label', 'visibility', op);
    },
    [],
  );

  useEffect(() => {
    updateParlVisibility(showParl);
  }, [showParl, updateParlVisibility]);

  useEffect(() => {
    updateDunVisibility(showDun);
  }, [showDun, updateDunVisibility]);

  // ------- Reset drill-down -------
  const resetDrill = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setFilter('dun-fill', null);
    map.setFilter('dun-border', null);
    map.setFilter('dun-label', null);
    setDrilledParl(null);
    popupRef.current?.remove();
    map.flyTo({ center: SELANGOR_CENTER, zoom: DEFAULT_ZOOM, duration: 800 });
  }, []);

  // Current zoom level
  const zoom = mapRef.current?.getZoom() ?? DEFAULT_ZOOM;
  const isDunLevel = zoom >= 8.5;
  const currentScale = isDunLevel
    ? getDunScaleById(activeMetric)
    : getScaleById(activeMetric);

  // Get active scale options based on zoom
  const scaleOptions = isDunLevel ? DUN_COLOR_SCALES : PARL_COLOR_SCALES;

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
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Layers
          </label>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showParl}
                onChange={(e) => setShowParl(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-700">
                Parliament (22 seats)
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showDun}
                onChange={(e) => setShowDun(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-700">
                DUN (56 seats)
              </span>
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
            {scaleOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Legend */}
        <div className="p-4 flex-shrink-0 overflow-y-auto">
          <Legend scale={currentScale} />
        </div>

        {/* Drill-down indicator */}
        {drilledParl && (
          <div className="mx-4 mb-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-md flex-shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-emerald-800">
                Filtered: {drilledParl}
              </span>
              <button
                onClick={resetDrill}
                className="text-xs text-emerald-700 hover:text-emerald-900 font-medium underline"
              >
                Reset
              </button>
            </div>
            <p className="text-[10px] text-emerald-600 mt-1">
              Showing DUNs within this Parliament. Click &quot;Reset&quot; or zoom out to show all.
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
            Phase 2 — Parliament + DUN Layers
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

function buildParlPopupHTML(p: ParlPopupData): string {
  return `
    <div style="font-family: system-ui, sans-serif;">
      <div style="font-weight:700; font-size:15px; color:#0f172a;">
        ${p.code_parlimen} — ${p.name}
      </div>
      <div style="font-size:11px; color:#64748b; margin-bottom:8px;">
        Parliamentary Constituency · ${p.child_dun_count} DUNs
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
      </table>
    </div>
  `;
}

function buildDunPopupHTML(p: DunPopupData): string {
  return `
    <div style="font-family: system-ui, sans-serif;">
      <div style="font-weight:700; font-size:14px; color:#0f172a;">
        ${p.code_dun} — ${p.name}
      </div>
      <div style="font-size:11px; color:#64748b; margin-bottom:8px;">
        ${p.code_parlimen} · ${p.dm_count} DMs · ${p.locality_count} localities
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
      </table>
    </div>
  `;
}
