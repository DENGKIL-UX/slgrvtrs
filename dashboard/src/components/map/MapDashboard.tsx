'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Map, Popup, NavigationControl, AttributionControl } from '@/lib/map/setup';
import 'maplibre-gl/dist/maplibre-gl.css';
import { initMapLibre } from '@/lib/map/setup';
import { joinStatsToGeoJSON, type StatsMap, type ParliamentStats } from '@/lib/map/join-stats';
import { buildColorExpression, getScaleById, COLOR_SCALES, type ColorScale } from '@/lib/map/color-scales';

// ============================================================
// Types
// ============================================================

interface PopupData extends ParliamentStats {
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
  const hoveredIdRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState('total_voters');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Keep a ref to activeMetric so the map callback always reads the latest
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

        const [geoRes, statsRes] = await Promise.all([
          fetch('/boundaries/selangor_parliament.geojson'),
          fetch('/stats/parliament.json'),
        ]);

        if (cancelled) return;

        const geojson = await geoRes.json();
        const stats: StatsMap = await statsRes.json();

        // Join stats into GeoJSON properties
        const joined = joinStatsToGeoJSON(geojson, stats);

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
            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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

        map.on('load', () => {
          if (cancelled) return;

          // ---- Source ----
          map.addSource('parliament', {
            type: 'geojson',
            data: joined,
            promoteId: 'id',
          });

          // ---- Initial scale ----
          const scale = getScaleById('total_voters');
          const colorExpr = buildColorExpression(scale.property, scale.stops);

          // ---- Fill layer ----
          map.addLayer({
            id: 'parliament-fill',
            type: 'fill',
            source: 'parliament',
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

          // ---- Border layer ----
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

          // ---- Label layer ----
          map.addLayer({
            id: 'parliament-label',
            type: 'symbol',
            source: 'parliament',
            layout: {
              'text-field': ['get', 'code_parlimen'],
              'text-size': 12,
              'text-font': ['Open Sans Bold'],
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

          // ---- Popup ----
          const popup = new Popup({
            closeButton: true,
            closeOnClick: false,
            anchor: 'top',
            maxWidth: '340px',
            offset: 10,
            className: 'parliament-popup',
          });
          popupRef.current = popup;

          // ---- Click → popup ----
          map.on('click', 'parliament-fill', (e) => {
            if (!e.features?.length) return;
            const props = e.features[0].properties as unknown as PopupData;
            const coords = e.lngLat;

            popup
              .setLngLat(coords)
              .setHTML(buildPopupHTML(props))
              .addTo(map);
          });

          // ---- Hover highlight ----
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

        {/* Legend */}
        <div className="p-4 flex-shrink-0">
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
            {currentScale.label}
          </h3>
          <div className="space-y-1">
            {currentScale.stops.map(([value, color], i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="w-5 h-3 rounded-sm flex-shrink-0 border border-slate-200"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-slate-700">
                  {currentScale.legendLabels[i]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="mt-auto p-4 border-t border-slate-200 flex-shrink-0">
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Boundaries derived from SPR 2018 delimitation; GeoJSON by
            ElectionData.MY. Not official SPR boundaries.
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Phase 1 — Parliament Layer (22 seats)
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
// Popup HTML builder
// ============================================================

function buildPopupHTML(p: PopupData): string {
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
    </div>
  `;
}