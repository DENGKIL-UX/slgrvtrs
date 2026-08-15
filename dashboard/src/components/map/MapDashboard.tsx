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

interface DMProperties {
  dm_code: string;
  dun_code: string;
  dun_prefix: string;
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
  male_malay: number;
  male_chinese: number;
  male_indian: number;
  male_other: number;
  female_malay: number;
  female_chinese: number;
  female_indian: number;
  female_other: number;
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
// Filter state for DM race/gender
// ============================================================

type GenderFilter = 'all' | 'male' | 'female';
type RaceFilter = 'all' | 'malay' | 'chinese' | 'indian';

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
  dm: false,
};

// All layer IDs per group for visibility toggling
const PARLIAMENT_LAYER_IDS = ['parliament-fill', 'parliament-label', 'parliament-border'];
const DUN_LAYER_IDS = ['dun-fill', 'dun-border', 'dun-label'];
const DM_LAYER_IDS = ['dm-bubble', 'dm-bubble-border'];

// DM bubble sizing: proportional circles for demographic counts
const DM_MIN_RADIUS = 2;
const DM_MAX_RADIUS = 20;
const DM_MIN_VOTERS = 0;
const DM_MAX_VOTERS = 27000;

// ============================================================
// Component
// ============================================================

export default function MapDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const hoveredIdRef = useRef<number | null>(null);
  const dmCentroidsRef = useRef<GeoJSON.FeatureCollection | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState('total_voters');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [drilledParl, setDrilledParl] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [raceFilter, setRaceFilter] = useState<RaceFilter>('all');

  // Keep refs for map callbacks
  const activeMetricRef = useRef(activeMetric);
  useEffect(() => { activeMetricRef.current = activeMetric; }, [activeMetric]);
  const genderFilterRef = useRef(genderFilter);
  useEffect(() => { genderFilterRef.current = genderFilter; }, [genderFilter]);
  const raceFilterRef = useRef(raceFilter);
  useEffect(() => { raceFilterRef.current = raceFilter; }, [raceFilter]);

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

    if (map.getLayer('dun-fill')) {
      map.setFilter('dun-fill', null);
    }
    if (map.getLayer('dun-border')) {
      map.setFilter('dun-border', null);
    }
    if (map.getLayer('dun-label')) {
      map.setFilter('dun-label', null);
    }

    map.flyTo({ center: SELANGOR_CENTER, zoom: DEFAULT_ZOOM, duration: 800 });
    setDrilledParl(null);
    popupRef.current?.remove();
  }, []);

  // ------- Apply DM filter: update bubble SIZE not visibility -------
  const applyDmFilter = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('dm-bubble')) return;

    const gf = genderFilterRef.current;
    const rf = raceFilterRef.current;

    // Always clear any filter — all 945 bubbles stay visible
    map.setFilter('dm-bubble', null);
    map.setFilter('dm-bubble-border', null);

    // Build the data expression for the selected demographic
    let dataExpr: any[];

    if (gf === 'all' && rf === 'all') {
      dataExpr = ['get', 'total_voters'];
    } else if (gf === 'all' && rf !== 'all') {
      // Race only: male_{race} + female_{race}
      dataExpr = [
        '+',
        ['get', `male_${rf}`],
        ['get', `female_${rf}`],
      ];
    } else if (gf !== 'all' && rf === 'all') {
      // Gender only: sum all 4 sub-counts for that gender
      const prefix = gf === 'male' ? 'male' : 'female';
      dataExpr = [
        '+',
        ['get', `${prefix}_malay`],
        ['get', `${prefix}_chinese`],
        ['get', `${prefix}_indian`],
        ['get', `${prefix}_other`],
      ];
    } else {
      // Both gender + race: single field
      dataExpr = ['get', `${gf}_${rf}`];
    }

    // Update circle-radius for the selected demographic
    const radiusExpr = [
      'interpolate', ['linear'], dataExpr,
      DM_MIN_VOTERS, DM_MIN_RADIUS,
      DM_MAX_VOTERS, DM_MAX_RADIUS,
    ];
    map.setPaintProperty('dm-bubble', 'circle-radius', radiusExpr as any);

    // Update border layer radius (base + 2)
    const borderRadiusExpr = [
      '+',
      ['interpolate', ['linear'], dataExpr,
        DM_MIN_VOTERS, DM_MIN_RADIUS,
        DM_MAX_VOTERS, DM_MAX_RADIUS,
      ],
      2,
    ];
    map.setPaintProperty('dm-bubble-border', 'circle-radius', borderRadiusExpr as any);
  }, []);

  // Apply filter when it changes
  useEffect(() => {
    applyDmFilter();
  }, [genderFilter, raceFilter, applyDmFilter]);

  // ------- Load data & initialize map -------
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    let cancelled = false;

    async function bootstrap() {
      try {
        initMapLibre();

        const [parlRes, statsRes, dunRes, dunStatsRes, outlineRes, dmCentroidsRes] = await Promise.all([
          fetch('/boundaries/selangor_parliament.geojson'),
          fetch('/stats/parliament.json'),
          fetch('/boundaries/selangor_dun.geojson'),
          fetch('/stats/dun.json'),
          fetch('/boundaries/selangor_outline.geojson').catch(() => null),
          fetch('/boundaries/dm_centroids.geojson').catch(() => null),
        ]);

        if (cancelled) return;

        const [parlGeojson, stats, dunGeojson, dunStats] = await Promise.all([
          parlRes.json(),
          statsRes.json() as Promise<StatsMap>,
          dunRes.json(),
          dunStatsRes.json() as Promise<DUNStatsMap>,
        ]);
        const outlineGeojson = outlineRes ? await outlineRes.json().catch(() => null) : null;
        const dmCentroids = dmCentroidsRes ? await dmCentroidsRes.json().catch(() => null) : null;

        // Store DM centroids ref for filter updates
        if (dmCentroids) {
          dmCentroidsRef.current = dmCentroids;
        }

        const joined = joinStatsToGeoJSON(parlGeojson, stats);
        const dunJoined = joinStatsToGeoJSON(dunGeojson, dunStats as unknown as StatsMap);

        if (cancelled) return;

        const map = new Map({
          container: containerRef.current!,
          style: {
            version: 8,
            name: 'SLGRVTRS Blank',
            sources: {},
            layers: [
              { id: 'background', type: 'background', paint: { 'background-color': '#f0f4f8' } },
            ],
            glyphs: 'https://basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
          },
          center: SELANGOR_CENTER,
          zoom: DEFAULT_ZOOM,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          attributionControl: false,
        });

        map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
        map.addControl(new NavigationControl(), 'top-right');

        let hoveredDunId: number | null = null;

        map.on('load', () => {
          if (cancelled) return;

          // ==== SOURCES ====
          if (outlineGeojson) {
            map.addSource('outline', { type: 'geojson', data: outlineGeojson });
          }
          map.addSource('parliament', { type: 'geojson', data: joined });
          map.addSource('dun', { type: 'geojson', data: dunJoined });

          // DM centroids source (loaded with stats embedded in properties)
          if (dmCentroids) {
            map.addSource('dm', { type: 'geojson', data: dmCentroids });
          }

          // ==== STATE OUTLINE LAYER (optional) ====
          if (outlineGeojson) {
            map.addLayer({
              id: 'outline-fill', type: 'fill', source: 'outline',
              paint: { 'fill-color': '#e2e8f0', 'fill-opacity': 0.35 },
            });
            map.addLayer({
              id: 'outline-border', type: 'line', source: 'outline',
              paint: { 'line-color': '#475569', 'line-width': 2.5, 'line-opacity': 0.9 },
            });
          }

          const scale = getScaleById('total_voters');
          const colorExpr = buildColorExpression(scale.property, scale.stops);

          // ==== PARLIAMENT LAYERS ====
          map.addLayer({
            id: 'parliament-fill', type: 'fill', source: 'parliament', maxzoom: 9,
            paint: {
              'fill-color': colorExpr,
              'fill-opacity': [
                'case', ['boolean', ['feature-state', 'hover'], false], 0.92, 0.72,
              ],
            },
          });
          map.addLayer({
            id: 'parliament-border', type: 'line', source: 'parliament',
            paint: {
              'line-color': '#1e293b',
              'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.5, 1],
              'line-opacity': 0.8,
            },
          });
          map.addLayer({
            id: 'parliament-label', type: 'symbol', source: 'parliament', maxzoom: 9,
            layout: {
              'text-field': ['get', 'code_parlimen'], 'text-size': 12,
              'text-font': ['Open Sans Regular'], 'text-anchor': 'center',
              'text-allow-overlap': false, 'text-ignore-placement': false,
            },
            paint: {
              'text-color': '#0f172a',
              'text-halo-color': 'rgba(255,255,255,0.85)', 'text-halo-width': 1.5,
            },
          });

          // ==== DUN LAYERS ====
          map.addLayer({
            id: 'dun-fill', type: 'fill', source: 'dun', minzoom: 8.5,
            paint: {
              'fill-color': '#b2dfdb',
              'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.75, 0.5],
            },
          });
          map.addLayer({
            id: 'dun-border', type: 'line', source: 'dun', minzoom: 8.5,
            paint: {
              'line-color': '#00695c',
              'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 0.8],
              'line-opacity': 0.7,
            },
          });
          map.addLayer({
            id: 'dun-label', type: 'symbol', source: 'dun', minzoom: 9,
            layout: {
              'text-field': ['get', 'code_dun'], 'text-size': 10,
              'text-font': ['Open Sans Regular'], 'text-anchor': 'center',
              'text-allow-overlap': true, 'text-ignore-placement': true,
            },
            paint: {
              'text-color': '#004d40',
              'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.2,
            },
          });

          // ==== DM BUBBLE LAYER (Phase 3) ====
          if (dmCentroids) {
            // Circle: proportional to sqrt(total_voters) for area-proportional sizing
            map.addLayer({
              id: 'dm-bubble',
              type: 'circle',
              source: 'dm',
              minzoom: 11,
              layout: { visibility: layers.dm ? 'visible' : 'none' },
              paint: {
                'circle-radius': [
                  'interpolate', ['linear'], ['get', 'total_voters'],
                  DM_MIN_VOTERS, DM_MIN_RADIUS,
                  DM_MAX_VOTERS, DM_MAX_RADIUS,
                ],
                'circle-color': [
                  'interpolate', ['linear'], ['get', 'total_voters'],
                  2000, '#fbb4ae',
                  5000, '#f7a072',
                  8000, '#f4845f',
                  11000, '#e15759',
                  15000, '#b40426',
                ],
                'circle-opacity': 0.75,
                'circle-stroke-width': 0,
              },
            });

            // Hover ring (slightly larger, transparent fill, visible stroke)
            map.addLayer({
              id: 'dm-bubble-border',
              type: 'circle',
              source: 'dm',
              minzoom: 11,
              layout: { visibility: layers.dm ? 'visible' : 'none' },
              paint: {
                'circle-radius': [
                  '+',
                  ['interpolate', ['linear'], ['get', 'total_voters'],
                    DM_MIN_VOTERS, DM_MIN_RADIUS,
                    DM_MAX_VOTERS, DM_MAX_RADIUS,
                  ],
                  2,
                ],
                'circle-color': 'transparent',
                'circle-opacity': [
                  'case', ['boolean', ['feature-state', 'hover'], false], 0.6, 0,
                ],
                'circle-stroke-color': '#6d1a36',
                'circle-stroke-width': 2,
              },
            });
          }

          // ==== POPUP (shared) ====
          const popup = new Popup({
            closeButton: true, closeOnClick: false, anchor: 'top',
            maxWidth: '340px', offset: 10, className: 'parliament-popup',
          });
          popupRef.current = popup;

          // ---- Parliament click → drill-down to DUNs ----
          map.on('click', 'parliament-fill', (e) => {
            if (!e.features?.length) return;
            const feat = e.features[0];
            const props = feat.properties as unknown as PopupData;
            const codeParlimen = props.code_parlimen;

            const dunsFilter: FilterSpecification = ['==', ['get', 'parent_parl'], codeParlimen] as unknown as FilterSpecification;
            DUN_LAYER_IDS.forEach((id) => {
              if (map.getLayer(id)) map.setFilter(id, dunsFilter);
            });

            if (feat.geometry && feat.geometry.type === 'Polygon') {
              const bounds = new LngLatBounds();
              for (const ring of feat.geometry.coordinates) {
                for (const coord of ring) bounds.extend(coord as [number, number]);
              }
              map.flyTo({
                center: bounds.getCenter(), zoom: 10.5, duration: 800,
                padding: { top: 40, bottom: 40, left: 40, right: 40 },
              });
            }

            popup.setLngLat(e.lngLat).setHTML(buildParliamentPopupHTML(props, true)).addTo(map);
            setDrilledParl(codeParlimen);
          });

          // ---- Parliament hover highlight ----
          map.on('mousemove', 'parliament-fill', (e) => {
            if (!e.features?.length) return;
            const fid = e.features[0].id as number;
            if (hoveredIdRef.current !== null && hoveredIdRef.current !== fid) {
              map.setFeatureState({ source: 'parliament', id: hoveredIdRef.current }, { hover: false });
            }
            hoveredIdRef.current = fid;
            map.setFeatureState({ source: 'parliament', id: fid }, { hover: true });
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', 'parliament-fill', () => {
            if (hoveredIdRef.current !== null) {
              map.setFeatureState({ source: 'parliament', id: hoveredIdRef.current }, { hover: false });
              hoveredIdRef.current = null;
            }
            map.getCanvas().style.cursor = '';
          });

          // ---- DUN click → popup ----
          map.on('click', 'dun-fill', (e) => {
            if (!e.features?.length) return;
            const props = e.features[0].properties as unknown as DUNProperties;
            popup.setLngLat(e.lngLat).setHTML(buildDUNPopupHTML(props)).addTo(map);
          });

          // ---- DUN hover highlight ----
          map.on('mousemove', 'dun-fill', (e) => {
            if (!e.features?.length) return;
            const fid = e.features[0].id as number;
            if (hoveredDunId !== null && hoveredDunId !== fid) {
              map.setFeatureState({ source: 'dun', id: hoveredDunId }, { hover: false });
            }
            hoveredDunId = fid;
            map.setFeatureState({ source: 'dun', id: fid }, { hover: true });
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', 'dun-fill', () => {
            if (hoveredDunId !== null) {
              map.setFeatureState({ source: 'dun', id: hoveredDunId }, { hover: false });
              hoveredDunId = null;
            }
            map.getCanvas().style.cursor = '';
          });

          // ==== DM BUBBLE INTERACTIONS (Phase 3) ====
          if (dmCentroids) {
            let hoveredDmId: string | null = null;

            // DM hover → tooltip
            map.on('mousemove', 'dm-bubble', (e) => {
              if (!e.features?.length) return;
              const props = e.features[0].properties as unknown as DMProperties;
              const dmCode = props.dm_code;

              if (hoveredDmId !== null && hoveredDmId !== dmCode) {
                map.setFeatureState({ source: 'dm', id: hoveredDmId }, { hover: false });
              }
              hoveredDmId = dmCode;
              map.setFeatureState({ source: 'dm', id: dmCode }, { hover: true });
              map.getCanvas().style.cursor = 'pointer';

              // Build tooltip HTML — reflect active filter
              const dmName = dmCode.replace(/^[\d.]+\s*/, '');
              const gFilter = genderFilterRef.current;
              const rFilter = raceFilterRef.current;
              let tooltipCount: number;
              if (gFilter === 'all' && rFilter === 'all') {
                tooltipCount = props.total_voters;
              } else if (gFilter === 'all' && rFilter !== 'all') {
                tooltipCount = (props as any)[`male_${rFilter}`] + (props as any)[`female_${rFilter}`];
              } else if (gFilter !== 'all' && rFilter === 'all') {
                const p = gFilter === 'male' ? 'male' : 'female';
                tooltipCount = (props as any)[`${p}_malay`] + (props as any)[`${p}_chinese`] + (props as any)[`${p}_indian`] + (props as any)[`${p}_other`];
              } else {
                tooltipCount = (props as any)[`${gFilter}_${rFilter}`];
              }
              const filterLabel = gFilter === 'all' && rFilter === 'all'
                ? 'voters'
                : `${gFilter === 'all' ? '' : gFilter + ' '}${rFilter === 'all' ? '' : rFilter} voters`.trim();
              const tooltipHTML = `
                <div style="font-family:system-ui,sans-serif;padding:6px 8px;">
                  <div style="font-weight:600;font-size:12px;color:#0f172a;">${dmName}</div>
                  <div style="font-size:11px;color:#64748b;margin-top:2px;">
                    ${tooltipCount.toLocaleString()} ${filterLabel}
                  </div>
                </div>
              `;
              popup.setLngLat(e.lngLat).setHTML(tooltipHTML).addTo(map);
            });

            map.on('mouseleave', 'dm-bubble', () => {
              if (hoveredDmId !== null) {
                map.setFeatureState({ source: 'dm', id: hoveredDmId }, { hover: false });
                hoveredDmId = null;
              }
              map.getCanvas().style.cursor = '';
              popup.remove();
            });

            // DM click → detailed popup
            map.on('click', 'dm-bubble', (e) => {
              if (!e.features?.length) return;
              const props = e.features[0].properties as unknown as DMProperties;
              popup.setLngLat(e.lngLat).setHTML(buildDMPopupHTML(props, genderFilterRef.current, raceFilterRef.current)).addTo(map);
            });
          }

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
  const updateMetric = useCallback((metricId: string) => {
    const map = mapRef.current;
    if (!map) return;
    const scale = getScaleById(metricId);
    const colorExpr = buildColorExpression(scale.property, scale.stops);
    map.setPaintProperty('parliament-fill', 'fill-color', colorExpr);
  }, []);

  useEffect(() => { updateMetric(activeMetric); }, [activeMetric, updateMetric]);

  const currentScale = getScaleById(activeMetric);

  return (
    <div className="relative w-full h-screen flex overflow-hidden bg-slate-100">
      {/* ======= Sidebar ======= */}
      <aside
        className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-300 bg-white border-r border-slate-200 flex-shrink-0 overflow-hidden flex flex-col`}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">SLGRVTRS</h1>
          <p className="text-xs text-slate-500 mt-0.5">Selangor Voter Registry — 3,971,650 voters</p>
        </div>

        {/* Layer Toggles */}
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">Layers</label>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={layers.parliament} onChange={() => toggleLayer('parliament')} className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
              <span className="text-xs text-slate-700 group-hover:text-slate-900">Parliament (22)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={layers.dun} onChange={() => toggleLayer('dun')} className="w-3.5 h-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer" />
              <span className="text-xs text-slate-700 group-hover:text-slate-900">DUN (56)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={layers.dm} onChange={() => toggleLayer('dm')} className="w-3.5 h-3.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer" />
              <span className="text-xs text-slate-700 group-hover:text-slate-900">DM Bubbles (945)</span>
            </label>
          </div>
        </div>

        {/* Metric Selector */}
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Choropleth Metric</label>
          <select
            value={activeMetric}
            onChange={(e) => setActiveMetric(e.target.value)}
            className="mt-1.5 w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          >
            {COLOR_SCALES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* DM Filters (Phase 3) */}
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">DM Filters</label>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Gender</label>
              <div className="flex gap-1">
                {(['all', 'male', 'female'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGenderFilter(g)}
                    className={`flex-1 text-[11px] py-1 px-2 rounded-md border transition-colors ${
                      genderFilter === g
                        ? 'bg-rose-50 border-rose-300 text-rose-700 font-medium'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {g === 'all' ? 'All' : g === 'male' ? 'Male' : 'Female'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Race</label>
              <div className="flex gap-1">
                {(['all', 'malay', 'chinese', 'indian'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRaceFilter(r)}
                    className={`flex-1 text-[11px] py-1 px-1.5 rounded-md border transition-colors ${
                      raceFilter === r
                        ? 'bg-rose-50 border-rose-300 text-rose-700 font-medium'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="p-4 flex-shrink-0">
          <Legend scale={currentScale} />
        </div>

        {/* Drill-down breadcrumb */}
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
            <p className="text-[10px] text-slate-500 mt-1 px-2">Showing DUNs under {drilledParl}</p>
          </div>
        )}

        {/* Info */}
        <div className="mt-auto p-4 border-t border-slate-200 flex-shrink-0">
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Boundaries derived from SPR 2018 delimitation; GeoJSON by
            ElectionData.MY. Not official SPR boundaries.
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Phase 3 — Parliament + DUN + DM Bubbles + Race/Gender Filters
          </p>
        </div>
      </aside>

      {/* ======= Map ======= */}
      <main className="flex-1 relative">
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="absolute top-3 left-3 z-10 bg-white rounded-md shadow-md p-2 hover:bg-slate-50 transition-colors border border-slate-200"
          aria-label="Toggle sidebar"
        >
          <svg className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {sidebarOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            )}
          </svg>
        </button>
        <div ref={containerRef} className="w-full h-full" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90 z-20">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-6 w-6 border-3 border-emerald-500 border-t-transparent rounded-full" />
              <span className="text-sm text-slate-600">Loading Selangor Voter Map...</span>
            </div>
          </div>
        )}
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
      <div style="font-size:11px; color:#64748b; margin-bottom:8px;">Parliamentary Constituency</div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr><td style="padding:2px 8px 2px 0;"><strong>Total Voters</strong></td><td style="text-align:right;font-weight:600;">${p.total_voters.toLocaleString()}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Male</strong></td><td style="text-align:right;">${p.male_pct}% (${p.male.toLocaleString()})</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Female</strong></td><td style="text-align:right;">${p.female_pct}% (${p.female.toLocaleString()})</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr><td style="padding:2px 8px 2px 0;"><strong>Malay</strong></td><td style="text-align:right;">${p.malay_pct}%</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Chinese</strong></td><td style="text-align:right;">${p.chinese_pct}%</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Indian</strong></td><td style="text-align:right;">${p.indian_pct}%</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Others</strong></td><td style="text-align:right;">${p.other_pct}%</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr><td style="padding:2px 8px 2px 0;"><strong>Mean Age</strong></td><td style="text-align:right;">${p.age_mean}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Median Age</strong></td><td style="text-align:right;">${p.age_median}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Contact %</strong></td><td style="text-align:right;">${p.contact_pct}%</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>DUNs</strong></td><td style="text-align:right;">${p.child_dun_count}</td></tr>
      </table>
      ${isDrillDown ? `
      <div style="font-size:10px;color:#059669;margin-top:8px;font-weight:500;">
        Zoomed to ${p.child_dun_count} DUN seat${p.child_dun_count > 1 ? 's' : ''} — click DUNs for details
      </div>` : ''}
    </div>`;
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
      <div style="font-size:11px; color:#64748b; margin-bottom:6px;">State Legislative Assembly</div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:6px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr><td style="padding:2px 8px 2px 0;"><strong>Parent Parliament</strong></td><td style="text-align:right;">${p.parent_parl} ${parlName}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>DUN Code</strong></td><td style="text-align:right;">${p.code_dun}</td></tr>
      </table>
      ${hasStats ? `
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:6px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr><td style="padding:2px 8px 2px 0;"><strong>Total Voters</strong></td><td style="text-align:right;font-weight:600;">${p.total_voters!.toLocaleString()}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Male</strong></td><td style="text-align:right;">${p.male_pct}% (${p.male!.toLocaleString()})</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Female</strong></td><td style="text-align:right;">${p.female_pct}% (${p.female!.toLocaleString()})</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:6px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr><td style="padding:2px 8px 2px 0;"><strong>Malay</strong></td><td style="text-align:right;">${p.malay_pct}%</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Chinese</strong></td><td style="text-align:right;">${p.chinese_pct}%</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Indian</strong></td><td style="text-align:right;">${p.indian_pct}%</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Others</strong></td><td style="text-align:right;">${p.other_pct}%</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:6px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr><td style="padding:2px 8px 2px 0;"><strong>Mean Age</strong></td><td style="text-align:right;">${p.age_mean}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Median Age</strong></td><td style="text-align:right;">${p.age_median}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Contact %</strong></td><td style="text-align:right;">${p.contact_pct}%</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>DMs</strong></td><td style="text-align:right;">${p.dm_count}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Localities</strong></td><td style="text-align:right;">${p.locality_count}</td></tr>
      </table>
      ` : `
      <div style="font-size:10px;color:#94a3b8;margin-top:8px;">No voter statistics available for this seat.</div>
      `}
    </div>`;
}

function buildDMPopupHTML(p: DMProperties, gf: string = "all", rf: string = "all"): string {
  const dmName = p.dm_code.replace(/^[\d.]+\s*/, '');
  const dunName = p.dun_code.replace(/^[\d.]+\s*/, '');

  return `
    <div style="font-family: system-ui, sans-serif;">
      <div style="font-weight:700; font-size:13px; color:#6d1a36;">
        ${dmName}
      </div>
      <div style="font-size:10px; color:#64748b; margin-bottom:6px;">
        Daerah Mengundi · ${p.dun_code} ${dunName}
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:6px 0;"/>
      ${(() => {
        if (gf === 'all' && rf === 'all') return '';
        let fc = 0, fl = '';
        if (gf === 'all') {
          fc = (p as any)['male_' + rf] + (p as any)['female_' + rf];
          fl = rf.charAt(0).toUpperCase() + rf.slice(1);
        } else if (rf === 'all') {
          fc = (p as any)[gf + '_malay'] + (p as any)[gf + '_chinese'] + (p as any)[gf + '_indian'] + (p as any)[gf + '_other'];
          fl = gf.charAt(0).toUpperCase() + gf.slice(1);
        } else {
          fc = (p as any)[gf + '_' + rf];
          fl = gf.charAt(0).toUpperCase() + gf.slice(1) + ' ' + rf.charAt(0).toUpperCase() + rf.slice(1);
        }
        const pct = p.total_voters > 0 ? (fc / p.total_voters * 100).toFixed(1) : '0.0';
        return '<div style="background:#fef2f2;border-radius:4px;padding:4px 8px;margin-bottom:6px;font-size:11px;color:#9f1239;"><strong>Active Filter:</strong> ' + fc.toLocaleString() + ' ' + fl + ' voters (' + pct + '%)</div>';
      })()}
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr><td style="padding:2px 8px 2px 0;"><strong>Total Voters</strong></td><td style="text-align:right;font-weight:600;">${p.total_voters.toLocaleString()}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Male</strong></td><td style="text-align:right;">${p.male_pct}% (${p.male.toLocaleString()})</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Female</strong></td><td style="text-align:right;">${p.female_pct}% (${p.female.toLocaleString()})</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:6px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr><td style="padding:2px 8px 2px 0;"><strong>Malay</strong></td><td style="text-align:right;">${p.malay_pct}%</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Chinese</strong></td><td style="text-align:right;">${p.chinese_pct}%</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Indian</strong></td><td style="text-align:right;">${p.indian_pct}%</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Others</strong></td><td style="text-align:right;">${p.other_pct}%</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:6px 0;"/>
      <table style="width:100%;font-size:12px;color:#334155;">
        <tr><td style="padding:2px 8px 2px 0;"><strong>Mean Age</strong></td><td style="text-align:right;">${p.age_mean}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;"><strong>Contact %</strong></td><td style="text-align:right;">${p.contact_pct}%</td></tr>
      </table>
    </div>`;
}
