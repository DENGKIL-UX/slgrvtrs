'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Map, Popup, NavigationControl, AttributionControl, LngLatBounds, type FilterSpecification } from '@/lib/map/setup';
import 'maplibre-gl/dist/maplibre-gl.css';
import { initMapLibre } from '@/lib/map/setup';
import { joinStatsToGeoJSON, type StatsMap, type ParliamentStats } from '@/lib/map/join-stats';
import { buildColorExpression, getScaleById, getDunScaleById, COLOR_SCALES, DUN_COLOR_SCALES, type ColorScale } from '@/lib/map/color-scales';
import Legend from '@/components/map/Legend';
import SettingsGear from '@/components/SettingsGear';
import ExportPanel from '@/components/ExportPanel';
import AnalyticsDrawer from '@/components/AnalyticsDrawer';
import AiInsightsPanel from '@/components/AiInsightsPanel';
import RankingTable from '@/components/RankingTable';
import BookmarksMenu from '@/components/BookmarksMenu';

// ============================================================
// Provenance data (embedded)
// ============================================================
const PROVENANCE = {
  boundaries: {
    source: 'MECo (Thevesh, 2025) — Malaysian Election Corpus',
    doi: '10.5281/zenodo.18093017',
    license: 'CC0',
    year: '2018+ (post-delimitation)',
    note: 'Parliament & DUN boundaries filtered to Selangor. Not official SPR boundaries.',
  },
  voters: {
    source: 'Private voter registry data',
    total: '3,971,650',
    aggregation: 'Python (pandas + calamine) from 4 xlsx files',
  },
  tech: {
    map: 'MapLibre GL JS 6.3 (WebGL2, ESM)',
    framework: 'Next.js 16.3 + TypeScript',
    hosting: 'Cloudflare Workers',
    url: 'https://slgrvtrs.ritz-analytics.workers.dev',
  },
} as const;

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
// Comparison feature types
// ============================================================

interface ComparisonSeat {
  code: string;
  name: string;
  type: 'parliament' | 'dun';
  data: Record<string, number | string>;
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
  dm: true,
};

const PARLIAMENT_LAYER_IDS = ['parliament-fill', 'parliament-label', 'parliament-border', 'parliament-hover-fill'];
const DUN_LAYER_IDS = ['dun-fill', 'dun-border', 'dun-label', 'dun-hover-fill'];
const DM_LAYER_IDS = ['dm-bubble', 'dm-bubble-border'];

const DM_MIN_RADIUS = 2;
const DM_MAX_RADIUS = 20;
const DM_MIN_VOTERS = 0;
const DM_MAX_VOTERS = 27000;

// ============================================================
// Visual helpers for popups
// ============================================================

function raceBar(malay: number, chinese: number, indian: number, other: number): string {
  const total = malay + chinese + indian + other;
  if (total === 0) return '';
  const mPct = (malay / total * 100).toFixed(1);
  const cPct = (chinese / total * 100).toFixed(1);
  const iPct = (indian / total * 100).toFixed(1);
  const oPct = Math.max(0, 100 - parseFloat(mPct) - parseFloat(cPct) - parseFloat(iPct)).toFixed(1);
  return `<div style="display:flex;height:10px;border-radius:5px;overflow:hidden;margin:6px 0 2px;gap:1px;">
    <div style="width:${mPct}%;background:#ef4444;border-radius:5px 0 0 5px;" title="Malay ${mPct}%"></div>
    <div style="width:${cPct}%;background:#f59e0b;" title="Chinese ${cPct}%"></div>
    <div style="width:${iPct}%;background:#3b82f6;" title="Indian ${iPct}%"></div>
    <div style="width:${oPct}%;background:#8b5cf6;border-radius:0 5px 5px 0;" title="Others"></div>
  </div>
  <div style="display:flex;gap:8px;font-size:9px;color:#94a3b8;margin-bottom:4px;">
    <span style="display:flex;align-items:center;gap:3px;"><span style="width:6px;height:6px;background:#ef4444;border-radius:50%;display:inline-block;"></span>Melayu ${malay.toFixed(1)}%</span>
    <span style="display:flex;align-items:center;gap:3px;"><span style="width:6px;height:6px;background:#f59e0b;border-radius:50%;display:inline-block;"></span>Cina ${chinese.toFixed(1)}%</span>
    <span style="display:flex;align-items:center;gap:3px;"><span style="width:6px;height:6px;background:#3b82f6;border-radius:50%;display:inline-block;"></span>India ${indian.toFixed(1)}%</span>
    <span style="display:flex;align-items:center;gap:3px;"><span style="width:6px;height:6px;background:#8b5cf6;border-radius:50%;display:inline-block;"></span>Lain² ${other.toFixed(1)}%</span>
  </div>`;
}

/** Real SVG donut chart for gender distribution */
function genderDonut(male: number, female: number): string {
  const total = male + female;
  if (total === 0) return '';
  const mPct = (male / total * 100).toFixed(1);
  const fPct = (female / total * 100).toFixed(1);
  // SVG donut using stroke-dasharray on circles
  // circumference = 2 * PI * r = 2 * 3.14159 * 18 = 113.097
  const C = 2 * Math.PI * 18;
  const maleLen = (male / total) * C;
  const femaleLen = (female / total) * C;
  return `<div style="display:flex;align-items:center;gap:12px;margin:8px 0 6px;">
    <svg width="64" height="64" viewBox="0 0 64 64" style="flex-shrink:0;">
      <circle cx="32" cy="32" r="18" fill="none" stroke="#3b82f6" stroke-width="8"
        stroke-dasharray="${maleLen} ${C - maleLen}"
        stroke-dashoffset="${C / 4}" transform="rotate(-90 32 32)" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="#ec4899" stroke-width="8"
        stroke-dasharray="${femaleLen} ${C - femaleLen}"
        stroke-dashoffset="${C / 4 - maleLen}" transform="rotate(-90 32 32)" />
      <text x="32" y="30" text-anchor="middle" font-size="9" font-weight="700" fill="#0f172a">${total.toLocaleString()}</text>
      <text x="32" y="39" text-anchor="middle" font-size="7" fill="#94a3b8">voters</text>
    </svg>
    <div style="display:flex;flex-direction:column;gap:4px;flex:1;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;background:#3b82f6;border-radius:50%;display:inline-block;flex-shrink:0;"></span>
        <span style="font-size:11px;color:#334155;font-weight:500;">Lelaki</span>
        <span style="font-size:11px;color:#3b82f6;font-weight:700;margin-left:auto;">${mPct}%</span>
      </div>
      <div style="font-size:10px;color:#64748b;padding-left:14px;">${male.toLocaleString()} voters</div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;background:#ec4899;border-radius:50%;display:inline-block;flex-shrink:0;"></span>
        <span style="font-size:11px;color:#334155;font-weight:500;">Perempuan</span>
        <span style="font-size:11px;color:#ec4899;font-weight:700;margin-left:auto;">${fPct}%</span>
      </div>
      <div style="font-size:10px;color:#64748b;padding-left:14px;">${female.toLocaleString()} voters</div>
    </div>
  </div>`;
}

// ============================================================
// Component
// ============================================================

export default function MapDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const hoveredIdRef = useRef<number | null>(null);
  const dmCentroidsRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const statsRef = useRef<StatsMap>({});
  const dunStatsRef = useRef<DUNStatsMap>({});
  // Store independent GeoJSON references for search flyTo (source._data is unreliable)
  const parlGeojsonRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const dunGeojsonRef = useRef<GeoJSON.FeatureCollection | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showProvenance, setShowProvenance] = useState(false);
  const [activeMetric, setActiveMetric] = useState('total_voters');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [drilledParl, setDrilledParl] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [raceFilter, setRaceFilter] = useState<RaceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ code: string; name: string; type: 'parliament' | 'dun' }>>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [comparisonList, setComparisonList] = useState<ComparisonSeat[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [activeTab, setActiveTab] = useState<'layers' | 'filters' | 'compare'>('layers');

  // New feature drawers
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  // Tracks the currently selected seat for the AI insights panel.
  const [currentSelection, setCurrentSelection] = useState<{ type: 'state' | 'parliament' | 'dun' | 'dm'; code: string | null; label: string } | null>(null);

  // Summary stats — populated once the voter stats JSON has loaded (see bootstrap effect).
  // Kept as state (not a ref read during render) to satisfy react-hooks/refs.
  const [summaryStats, setSummaryStats] = useState<{
    totalVoters: number;
    avgMalay: number;
    avgChinese: number;
    avgIndian: number;
    avgAge: number;
    avgContact: number;
    largest: ParliamentStats;
    smallest: ParliamentStats;
  } | null>(null);
  // Mirror of the stats refs as state, so drawer components can read them as props
  // (reading refs during render is forbidden by react-hooks/refs).
  const [parlStatsState, setParlStatsState] = useState<StatsMap>({});
  const [dunStatsState, setDunStatsState] = useState<DUNStatsMap>({});

  // Keep refs for map callbacks
  const activeMetricRef = useRef(activeMetric);
  useEffect(() => { activeMetricRef.current = activeMetric; }, [activeMetric]);
  const genderFilterRef = useRef(genderFilter);
  useEffect(() => { genderFilterRef.current = genderFilter; }, [genderFilter]);
  const raceFilterRef = useRef(raceFilter);
  useEffect(() => { raceFilterRef.current = raceFilter; }, [raceFilter]);

  // Detect mobile viewport
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Search handler
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (!query.trim()) { setSearchResults([]); return; }
    const q = query.toLowerCase();
    const results: typeof searchResults = [];
    const stats = statsRef.current;
    const dunStats = dunStatsRef.current;
    for (const [key, s] of Object.entries(stats)) {
      if (s.code_parlimen.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) {
        results.push({ code: s.code_parlimen, name: s.name, type: 'parliament' });
      }
    }
    for (const [key, s] of Object.entries(dunStats)) {
      if (s.code_dun.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) {
        results.push({ code: s.code_dun, name: s.name, type: 'dun' });
      }
    }
    setSearchResults(results.slice(0, 8));
  }, []);

  // Fly to searched constituency — uses stored GeoJSON refs, not source._data
  const flyToConstituency = useCallback((code: string, type: 'parliament' | 'dun') => {
    const map = mapRef.current;
    if (!map) return;

    const findBounds = (geojson: GeoJSON.FeatureCollection | null, field: string, value: string): LngLatBounds | null => {
      if (!geojson) return null;
      const feat = geojson.features.find(f => (f.properties as any)?.[field] === value);
      if (!feat?.geometry) return null;
      const geom = feat.geometry;
      const coords = geom.type === 'Polygon'
        ? geom.coordinates
        : geom.type === 'MultiPolygon'
          ? geom.coordinates.flat(2)
          : [];
      if (!coords.length) return null;
      const bounds = new LngLatBounds();
      for (const coord of coords) bounds.extend(coord as [number, number]);
      return bounds;
    };

    if (type === 'parliament') {
      const bounds = findBounds(parlGeojsonRef.current, 'code_parlimen', code);
      if (bounds) {
        map.flyTo({ center: bounds.getCenter(), zoom: 10, duration: 1000, padding: { top: 60, bottom: 60, left: 340, right: 60 } });
      }
      // Trigger drill-down
      const dunsFilter: FilterSpecification = ['==', ['get', 'parent_parl'], code] as unknown as FilterSpecification;
      DUN_LAYER_IDS.forEach((id) => {
        if (map.getLayer(id)) map.setFilter(id, dunsFilter);
      });
      setDrilledParl(code);
      const seatName = (statsRef.current[Object.keys(statsRef.current).find((k) => statsRef.current[k].code_parlimen === code) ?? '']?.name) ?? code;
      setCurrentSelection({ type: 'parliament', code, label: `${code} ${seatName}` });
    } else {
      const bounds = findBounds(dunGeojsonRef.current, 'code_dun', code);
      if (bounds) {
        map.flyTo({ center: bounds.getCenter(), zoom: 12, duration: 1000, padding: { top: 60, bottom: 60, left: 340, right: 60 } });
      }
      const dunKey = Object.keys(dunStatsRef.current).find((k) => dunStatsRef.current[k].code_dun === code);
      const seatName = dunKey ? dunStatsRef.current[dunKey].name : code;
      setCurrentSelection({ type: 'dun', code, label: `${code} ${seatName}` });
    }
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  // Add to comparison — exposed via global event for popup HTML buttons
  const addToComparison = useCallback((code: string, name: string, type: 'parliament' | 'dun', data: Record<string, number | string>) => {
    setComparisonList(prev => {
      if (prev.length >= 3) return prev;
      if (prev.some(s => s.code === code)) return prev;
      return [...prev, { code, name, type, data }];
    });
    setShowComparison(true);
    setActiveTab('compare');
  }, []);

  const removeFromComparison = useCallback((code: string) => {
    setComparisonList(prev => prev.filter(s => s.code !== code));
  }, []);

  // Global event listener for popup compare buttons (React closure can't be accessed from setHTML)
  useEffect(() => {
    const handler = (e: Event) => {
      const { code, name, type, data } = (e as CustomEvent).detail;
      addToComparison(code, name, type, data);
    };
    window.addEventListener('slgrvtrs:compare', handler);
    return () => window.removeEventListener('slgrvtrs:compare', handler);
  }, [addToComparison]);

  // Password change callback — bump version so ExportPanel re-fetches isSet
  const [passwordSetVersion, setPasswordSetVersion] = useState(0);
  const handlePasswordChanged = useCallback(() => setPasswordSetVersion((v) => v + 1), []);

  const handleMapContainerClick = useCallback(() => {
    if (isMobile && sidebarOpen) setSidebarOpen(false);
  }, [isMobile, sidebarOpen]);

  // Toggle layer visibility
  const toggleLayer = useCallback((group: keyof LayerVisibility) => {
    setLayers((prev) => {
      const next = { ...prev, [group]: !prev[group] };
      const map = mapRef.current;
      if (!map) return next;
      const visible = next[group] ? 'visible' : 'none';
      const layerIds = group === 'parliament' ? PARLIAMENT_LAYER_IDS : group === 'dun' ? DUN_LAYER_IDS : DM_LAYER_IDS;
      layerIds.forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible); });
      return next;
    });
  }, []);

  useEffect(() => {
    if (drilledParl && isMobile) {
      // Defer to avoid synchronous setState-in-effect cascade flagged by react-hooks.
      queueMicrotask(() => setSidebarOpen(false));
    }
  }, [drilledParl, isMobile]);

  // Reset drill-down
  const resetDrillDown = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    ['dun-fill', 'dun-border', 'dun-label', 'dun-hover-fill'].forEach(id => {
      if (map.getLayer(id)) map.setFilter(id, null);
    });
    map.flyTo({ center: SELANGOR_CENTER, zoom: DEFAULT_ZOOM, duration: 800 });
    setDrilledParl(null);
    popupRef.current?.remove();
  }, []);

  // Apply DM filter
  const applyDmFilter = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('dm-bubble')) return;
    const gf = genderFilterRef.current;
    const rf = raceFilterRef.current;
    map.setFilter('dm-bubble', null);
    map.setFilter('dm-bubble-border', null);
    let dataExpr: any[];
    if (gf === 'all' && rf === 'all') {
      dataExpr = ['get', 'total_voters'];
    } else if (gf === 'all' && rf !== 'all') {
      dataExpr = ['+', ['get', `male_${rf}`], ['get', `female_${rf}`]];
    } else if (gf !== 'all' && rf === 'all') {
      const prefix = gf === 'male' ? 'male' : 'female';
      dataExpr = ['+', ['get', `${prefix}_malay`], ['get', `${prefix}_chinese`], ['get', `${prefix}_indian`], ['get', `${prefix}_other`]];
    } else {
      dataExpr = ['get', `${gf}_${rf}`];
    }
    const radiusExpr = ['interpolate', ['linear'], dataExpr, DM_MIN_VOTERS, DM_MIN_RADIUS, DM_MAX_VOTERS, DM_MAX_RADIUS];
    map.setPaintProperty('dm-bubble', 'circle-radius', radiusExpr as any);
    const borderRadiusExpr = ['+', ['interpolate', ['linear'], dataExpr, DM_MIN_VOTERS, DM_MIN_RADIUS, DM_MAX_VOTERS, DM_MAX_RADIUS], 2];
    map.setPaintProperty('dm-bubble-border', 'circle-radius', borderRadiusExpr as any);
  }, []);

  useEffect(() => { applyDmFilter(); }, [genderFilter, raceFilter, applyDmFilter]);

  // ------- Load data & initialize map -------
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    let cancelled = false;
    async function bootstrap() {
      try {
        initMapLibre();
        const [parlRes, statsRes, dunRes, dunStatsRes, outlineRes] = await Promise.all([
          fetch('/boundaries/selangor_parliament.geojson'),
          fetch('/stats/parliament.json'),
          fetch('/boundaries/selangor_dun.geojson'),
          fetch('/stats/dun.json'),
          fetch('/boundaries/selangor_outline.geojson').catch(() => null),
        ]);
        if (cancelled) return;
        const [parlGeojson, stats, dunGeojson, dunStats] = await Promise.all([
          parlRes.json(),
          statsRes.json() as Promise<StatsMap>,
          dunRes.json(),
          dunStatsRes.json() as Promise<DUNStatsMap>,
        ]);
        const outlineGeojson = outlineRes ? await outlineRes.json().catch(() => null) : null;

        // Store stats refs for search
        statsRef.current = stats;
        dunStatsRef.current = dunStats;
        // Mirror to state so drawer components can read them as props.
        setParlStatsState(stats);
        setDunStatsState(dunStats);
        // Compute summary stats now that stats are loaded (avoids reading
        // the ref during render — see summaryStats state below).
        const allParls = Object.values(stats);
        if (allParls.length) {
          setSummaryStats({
            totalVoters: allParls.reduce((s, p) => s + p.total_voters, 0),
            avgMalay: allParls.reduce((s, p) => s + p.malay_pct, 0) / allParls.length,
            avgChinese: allParls.reduce((s, p) => s + p.chinese_pct, 0) / allParls.length,
            avgIndian: allParls.reduce((s, p) => s + p.indian_pct, 0) / allParls.length,
            avgAge: allParls.reduce((s, p) => s + p.age_mean, 0) / allParls.length,
            avgContact: allParls.reduce((s, p) => s + p.contact_pct, 0) / allParls.length,
            largest: allParls.reduce((a, b) => a.total_voters > b.total_voters ? a : b),
            smallest: allParls.reduce((a, b) => a.total_voters < b.total_voters ? a : b),
          });
        }

        // DM centroids: try D1 API first, fall back to static GeoJSON
        let dmCentroids: GeoJSON.FeatureCollection | null = null;
        try {
          const dmRes = await fetch('/api/dm?format=geojson');
          if (dmRes.ok) dmCentroids = await dmRes.json();
        } catch { /* API unavailable */ }
        if (!dmCentroids) {
          try {
            const fallback = await fetch('/boundaries/dm_centroids.geojson');
            if (fallback.ok) dmCentroids = await fallback.json();
          } catch { /* static file also unavailable */ }
        }
        if (dmCentroids) dmCentroidsRef.current = dmCentroids;

        const joined = joinStatsToGeoJSON(parlGeojson, stats);
        const dunJoined = joinStatsToGeoJSON(dunGeojson, dunStats as unknown as StatsMap);
        // Store GeoJSON refs for search flyTo (source._data is unreliable in MapLibre)
        parlGeojsonRef.current = joined;
        dunGeojsonRef.current = dunJoined;

        if (cancelled) return;

        const map = new Map({
          container: containerRef.current!,
          style: {
            version: 8, name: 'SLGRVTRS Blank', sources: {}, layers: [
              { id: 'background', type: 'background', paint: { 'background-color': '#f0f4f8' } },
            ],
            glyphs: 'https://basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
          },
          center: SELANGOR_CENTER, zoom: DEFAULT_ZOOM, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM,
          attributionControl: false,
        });

        map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
        map.addControl(new NavigationControl(), 'bottom-right');

        let hoveredDunId: number | null = null;

        map.on('load', () => {
          if (cancelled) return;

          // ==== SOURCES ====
          if (outlineGeojson) map.addSource('outline', { type: 'geojson', data: outlineGeojson });
          map.addSource('parliament', { type: 'geojson', data: joined, promoteId: 'voter_prefix' });
          map.addSource('dun', { type: 'geojson', data: dunJoined, promoteId: 'voter_prefix' });
          if (dmCentroids) map.addSource('dm', { type: 'geojson', data: dmCentroids, promoteId: 'dm_code' });

          // ==== STATE OUTLINE ====
          if (outlineGeojson) {
            map.addLayer({ id: 'outline-fill', type: 'fill', source: 'outline', paint: { 'fill-color': '#e8edf3', 'fill-opacity': 0.5 } });
            map.addLayer({ id: 'outline-border', type: 'line', source: 'outline', paint: { 'line-color': '#334155', 'line-width': 2.5, 'line-opacity': 0.85 } });
          }

          const scale = getScaleById('total_voters');
          const colorExpr = buildColorExpression(scale.property, scale.stops);

          // ==== PARLIAMENT LAYERS ====
          map.addLayer({
            id: 'parliament-fill', type: 'fill', source: 'parliament', maxzoom: 9,
            paint: { 'fill-color': colorExpr, 'fill-opacity': 0.72 },
          });
          // Hover highlight layer (transparent, only shows on feature-state)
          map.addLayer({
            id: 'parliament-hover-fill', type: 'fill', source: 'parliament', maxzoom: 9,
            paint: { 'fill-color': '#000000', 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.15, 0] },
          });
          map.addLayer({
            id: 'parliament-border', type: 'line', source: 'parliament',
            paint: { 'line-color': '#1e293b', 'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.5, 1], 'line-opacity': 0.8 },
          });
          map.addLayer({
            id: 'parliament-label', type: 'symbol', source: 'parliament', maxzoom: 9,
            layout: { 'text-field': ['get', 'code_parlimen'], 'text-size': 12, 'text-font': ['Open Sans Regular'], 'text-anchor': 'center', 'text-allow-overlap': false, 'text-ignore-placement': false },
            paint: { 'text-color': '#0f172a', 'text-halo-color': 'rgba(255,255,255,0.85)', 'text-halo-width': 1.5 },
          });

          // ==== DUN LAYERS ====
          map.addLayer({
            id: 'dun-fill', type: 'fill', source: 'dun', minzoom: 8.5,
            paint: { 'fill-color': buildColorExpression('total_voters', DUN_COLOR_SCALES[0].stops), 'fill-opacity': 0.5 },
          });
          map.addLayer({
            id: 'dun-hover-fill', type: 'fill', source: 'dun', minzoom: 8.5,
            paint: { 'fill-color': '#000000', 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.18, 0] },
          });
          map.addLayer({
            id: 'dun-border', type: 'line', source: 'dun', minzoom: 8.5,
            paint: { 'line-color': '#00695c', 'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 0.8], 'line-opacity': 0.7 },
          });
          map.addLayer({
            id: 'dun-label', type: 'symbol', source: 'dun', minzoom: 9,
            layout: { 'text-field': ['get', 'code_dun'], 'text-size': 10, 'text-font': ['Open Sans Regular'], 'text-anchor': 'center', 'text-allow-overlap': true, 'text-ignore-placement': true },
            paint: { 'text-color': '#004d40', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.2 },
          });

          // ==== DM BUBBLE LAYER ====
          if (dmCentroids) {
            map.addLayer({
              id: 'dm-bubble', type: 'circle', source: 'dm', minzoom: 11,
              layout: { visibility: layers.dm ? 'visible' : 'none' },
              paint: {
                'circle-radius': ['interpolate', ['linear'], ['get', 'total_voters'], DM_MIN_VOTERS, DM_MIN_RADIUS, DM_MAX_VOTERS, DM_MAX_RADIUS],
                'circle-color': ['interpolate', ['linear'], ['get', 'total_voters'], 2000, '#fbb4ae', 5000, '#f7a072', 8000, '#f4845f', 11000, '#e15759', 15000, '#b40426'],
                'circle-opacity': 0.75, 'circle-stroke-width': 0,
              },
            });
            map.addLayer({
              id: 'dm-bubble-border', type: 'circle', source: 'dm', minzoom: 11,
              layout: { visibility: layers.dm ? 'visible' : 'none' },
              paint: {
                'circle-radius': ['+', ['interpolate', ['linear'], ['get', 'total_voters'], DM_MIN_VOTERS, DM_MIN_RADIUS, DM_MAX_VOTERS, DM_MAX_RADIUS], 2],
                'circle-color': 'transparent',
                'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.6, 0],
                'circle-stroke-color': '#6d1a36', 'circle-stroke-width': 2,
              },
            });
          }

          // ==== POPUP ====
          const popup = new Popup({ closeButton: true, closeOnClick: false, anchor: 'top', maxWidth: '380px', offset: 10, className: 'slgrvtrs-popup' });
          popupRef.current = popup;

          // ---- Parliament click ----
          map.on('click', 'parliament-fill', (e) => {
            if (!e.features?.length) return;
            const feat = e.features[0];
            const props = feat.properties as unknown as PopupData;
            const codeParlimen = props.code_parlimen;
            const dunsFilter: FilterSpecification = ['==', ['get', 'parent_parl'], codeParlimen] as unknown as FilterSpecification;
            DUN_LAYER_IDS.forEach((id) => { if (map.getLayer(id)) map.setFilter(id, dunsFilter); });
            if (feat.geometry && feat.geometry.type === 'Polygon') {
              const bounds = new LngLatBounds();
              for (const ring of feat.geometry.coordinates) { for (const coord of ring) bounds.extend(coord as [number, number]); }
              map.flyTo({ center: bounds.getCenter(), zoom: 10.5, duration: 800, padding: { top: 40, bottom: 40, left: 40, right: 40 } });
            }
            popup.setLngLat(e.lngLat).setHTML(buildParliamentPopupHTML(props, true, codeParlimen)).addTo(map);
            setDrilledParl(codeParlimen);
            setCurrentSelection({ type: 'parliament', code: codeParlimen, label: `${codeParlimen} ${props.name}` });
          });

          // ---- Parliament hover ----
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
            if (hoveredIdRef.current !== null) { map.setFeatureState({ source: 'parliament', id: hoveredIdRef.current }, { hover: false }); hoveredIdRef.current = null; }
            map.getCanvas().style.cursor = '';
          });

          // ---- DUN click ----
          map.on('click', 'dun-fill', (e) => {
            if (!e.features?.length) return;
            const props = e.features[0].properties as unknown as DUNProperties;
            const codeDun = props.code_dun;
            const dunName = props.dun.replace(/^N\.\d+\s+/, '');
            popup.setLngLat(e.lngLat).setHTML(buildDUNPopupHTML(props, codeDun)).addTo(map);
            setCurrentSelection({ type: 'dun', code: codeDun, label: `${codeDun} ${dunName}` });
          });

          // ---- DUN hover ----
          map.on('mousemove', 'dun-fill', (e) => {
            if (!e.features?.length) return;
            const fid = e.features[0].id as number;
            if (hoveredDunId !== null && hoveredDunId !== fid) { map.setFeatureState({ source: 'dun', id: hoveredDunId }, { hover: false }); }
            hoveredDunId = fid;
            map.setFeatureState({ source: 'dun', id: fid }, { hover: true });
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', 'dun-fill', () => {
            if (hoveredDunId !== null) { map.setFeatureState({ source: 'dun', id: hoveredDunId }, { hover: false }); hoveredDunId = null; }
            map.getCanvas().style.cursor = '';
          });

          // ==== DM BUBBLE INTERACTIONS ====
          if (dmCentroids) {
            let hoveredDmId: string | null = null;
            map.on('mousemove', 'dm-bubble', (e) => {
              if (!e.features?.length) return;
              const props = e.features[0].properties as unknown as DMProperties;
              const dmCode = props.dm_code;
              if (hoveredDmId !== null && hoveredDmId !== dmCode) { map.setFeatureState({ source: 'dm', id: hoveredDmId }, { hover: false }); }
              hoveredDmId = dmCode;
              map.setFeatureState({ source: 'dm', id: dmCode }, { hover: true });
              map.getCanvas().style.cursor = 'pointer';
              const dmName = dmCode.replace(/^[\d.]+\s*/, '');
              const gFilter = genderFilterRef.current;
              const rFilter = raceFilterRef.current;
              let tooltipCount: number;
              if (gFilter === 'all' && rFilter === 'all') { tooltipCount = props.total_voters; }
              else if (gFilter === 'all' && rFilter !== 'all') { tooltipCount = (props as any)[`male_${rFilter}`] + (props as any)[`female_${rFilter}`]; }
              else if (gFilter !== 'all' && rFilter === 'all') { const p = gFilter === 'male' ? 'male' : 'female'; tooltipCount = (props as any)[`${p}_malay`] + (props as any)[`${p}_chinese`] + (props as any)[`${p}_indian`] + (props as any)[`${p}_other`]; }
              else { tooltipCount = (props as any)[`${gFilter}_${rFilter}`]; }
              const filterLabel = gFilter === 'all' && rFilter === 'all' ? 'voters' : `${gFilter === 'all' ? '' : gFilter + ' '}${rFilter === 'all' ? '' : rFilter} voters`.trim();
              const tooltipHTML = `<div style="font-family:system-ui,sans-serif;padding:6px 8px;background:rgba(255,255,255,0.95);border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.12);">
                <div style="font-weight:600;font-size:12px;color:#0f172a;">${dmName}</div>
                <div style="font-size:11px;color:#64748b;margin-top:2px;">${tooltipCount.toLocaleString()} ${filterLabel}</div>
              </div>`;
              popup.setLngLat(e.lngLat).setHTML(tooltipHTML).addTo(map);
            });
            map.on('mouseleave', 'dm-bubble', () => {
              if (hoveredDmId !== null) { map.setFeatureState({ source: 'dm', id: hoveredDmId }, { hover: false }); hoveredDmId = null; }
              map.getCanvas().style.cursor = '';
              popup.remove();
            });
            map.on('click', 'dm-bubble', (e) => {
              if (!e.features?.length) return;
              const props = e.features[0].properties as unknown as DMProperties;
              popup.setLngLat(e.lngLat).setHTML(buildDMPopupHTML(props, genderFilterRef.current, raceFilterRef.current)).addTo(map);
              const dmName = props.dm_code.replace(/^[\d.]+\s*/, '');
              setCurrentSelection({ type: 'dm', code: props.dm_code, label: dmName });
            });
          }

          setLoading(false);
        });

        mapRef.current = map;
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed to load map data'); setLoading(false); }
      }
    }
    bootstrap();
    return () => { cancelled = true; popupRef.current?.remove(); mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // ------- Update choropleth when metric changes -------
  const updateMetric = useCallback((metricId: string) => {
    const map = mapRef.current;
    if (!map) return;
    const parlScale = getScaleById(metricId);
    const parlExpr = buildColorExpression(parlScale.property, parlScale.stops);
    map.setPaintProperty('parliament-fill', 'fill-color', parlExpr);
    const dunScale = getDunScaleById(metricId);
    if (dunScale) { const dunExpr = buildColorExpression(dunScale.property, dunScale.stops); map.setPaintProperty('dun-fill', 'fill-color', dunExpr); }
  }, []);
  useEffect(() => { updateMetric(activeMetric); }, [activeMetric, updateMetric]);

  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const onZoom = () => setMapZoom(map.getZoom());
    map.on('zoom', onZoom);
    return () => { map.off('zoom', onZoom); };
  }, []);

  const isDunZoom = mapZoom >= 9.5;
  const currentScale = isDunZoom ? (getDunScaleById(activeMetric) ?? getScaleById(activeMetric)) : getScaleById(activeMetric);

  return (
    <div className="relative w-full h-screen flex overflow-hidden bg-slate-100" onClick={handleMapContainerClick}>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-20 md:hidden" onClick={(e) => { e.stopPropagation(); setSidebarOpen(false); }} aria-hidden="true" />
      )}

      {/* ======= Sidebar ======= */}
      <aside
        className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 ease-in-out bg-white/95 backdrop-blur-md border-r border-slate-200/80 flex-shrink-0 overflow-hidden flex flex-col ${isMobile ? 'fixed top-0 left-0 h-full z-30 shadow-2xl' : 'relative'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient accent */}
        <div className="flex-shrink-0 border-b border-slate-200/80">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight">SLGRVTRS</h1>
                <p className="text-[10px] text-emerald-100">Selangor Voter Registry</p>
              </div>
            </div>
          </div>
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">3,971,650 registered voters</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-medium">22 Parls &middot; 56 DUNs</span>
              <SettingsGear onPasswordChanged={handlePasswordChanged} />
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-3 py-2 border-b border-slate-100 flex-shrink-0 relative">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search P.092, N.01, Pandan..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => setShowSearch(true)}
              className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none transition-all placeholder:text-slate-400"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          {showSearch && searchResults.length > 0 && (
            <div className="absolute top-full left-3 right-3 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 z-50 max-h-48 overflow-y-auto">
              {searchResults.map((r) => (
                <button
                  key={r.code}
                  onClick={() => flyToConstituency(r.code, r.type)}
                  className="w-full text-left px-3 py-2 hover:bg-emerald-50 transition-colors flex items-center gap-2 border-b border-slate-50 last:border-0"
                >
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${r.type === 'parliament' ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-100 text-teal-700'}`}>{r.type === 'parliament' ? 'PARL' : 'DUN'}</span>
                  <span className="text-xs text-slate-700 font-medium">{r.code}</span>
                  <span className="text-xs text-slate-500">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-slate-200/80 flex-shrink-0">
          {(['layers', 'filters', 'compare'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-[11px] font-medium transition-colors relative ${activeTab === tab ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {tab === 'layers' ? 'Layers' : tab === 'filters' ? 'Metrics' : 'Compare'}
              {activeTab === tab && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-emerald-500 rounded-full" />}
              {tab === 'compare' && comparisonList.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[9px] bg-rose-500 text-white rounded-full">{comparisonList.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content - scrollable */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'layers' && (
            <div className="p-3 space-y-3">
              {/* Layer toggles */}
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Map Layers</label>
                <div className="space-y-1">
                  {[
                    { key: 'parliament' as const, label: 'Parliament', count: '22', activeColor: '#10b981' },
                    { key: 'dun' as const, label: 'DUN', count: '56', activeColor: '#14b8a6' },
                    { key: 'dm' as const, label: 'DM Bubbles', count: '945', activeColor: '#f43f5e' },
                  ].map(({ key, label, count, activeColor }) => (
                    <button
                      key={key}
                      onClick={() => toggleLayer(key)}
                      className="flex items-center gap-2.5 cursor-pointer group py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors w-full text-left"
                    >
                      <div
                        className="w-8 h-4 rounded-full transition-colors relative flex-shrink-0"
                        style={{ backgroundColor: layers[key] ? activeColor : '#e2e8f0' }}
                      >
                        <div
                          className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform"
                          style={{ transform: layers[key] ? 'translateX(16px)' : 'translateX(2px)' }}
                        />
                      </div>
                      <span className="text-xs text-slate-700 group-hover:text-slate-900 flex-1">{label}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Metric selector */}
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Choropleth Metric</label>
                <select
                  value={activeMetric}
                  onChange={(e) => setActiveMetric(e.target.value)}
                  className="w-full h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
                >
                  {COLOR_SCALES.filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i).map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* DM Filters */}
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">DM Demographic Filter</label>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Gender</label>
                    <div className="flex gap-1">
                      {(['all', 'male', 'female'] as const).map((g) => (
                        <button key={g} onClick={() => setGenderFilter(g)}
                          className={`flex-1 text-[10px] py-1.5 rounded-md border transition-all ${genderFilter === g ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
                        >{g === 'all' ? 'All' : g === 'male' ? 'Male' : 'Female'}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Ethnicity</label>
                    <div className="flex gap-1">
                      {(['all', 'malay', 'chinese', 'indian'] as const).map((r) => (
                        <button key={r} onClick={() => setRaceFilter(r)}
                          className={`flex-1 text-[10px] py-1.5 rounded-md border transition-all ${raceFilter === r ? 'bg-amber-50 border-amber-300 text-amber-700 font-semibold shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
                        >{r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-100">
                <Legend scale={currentScale} />
              </div>

              {/* Quick stats summary */}
              {summaryStats && (
                <div>
                  <button onClick={() => setShowStats(!showStats)} className="flex items-center justify-between w-full text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    <span>Quick Statistics</span>
                    <svg className={`w-3 h-3 transition-transform ${showStats ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showStats && (
                    <div className="bg-gradient-to-br from-slate-50 to-emerald-50/30 rounded-lg p-3 space-y-2 border border-slate-100">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white rounded-md p-2 border border-slate-100">
                          <div className="text-[9px] text-slate-400">Largest Seat</div>
                          <div className="text-xs font-semibold text-slate-800">{summaryStats.largest.name}</div>
                          <div className="text-[10px] text-emerald-600 font-medium">{summaryStats.largest.total_voters.toLocaleString()}</div>
                        </div>
                        <div className="bg-white rounded-md p-2 border border-slate-100">
                          <div className="text-[9px] text-slate-400">Smallest Seat</div>
                          <div className="text-xs font-semibold text-slate-800">{summaryStats.smallest.name}</div>
                          <div className="text-[10px] text-rose-600 font-medium">{summaryStats.smallest.total_voters.toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between text-slate-600"><span>Avg Malay %</span><span className="font-medium">{summaryStats.avgMalay.toFixed(1)}%</span></div>
                        <div className="flex justify-between text-slate-600"><span>Avg Chinese %</span><span className="font-medium">{summaryStats.avgChinese.toFixed(1)}%</span></div>
                        <div className="flex justify-between text-slate-600"><span>Avg Indian %</span><span className="font-medium">{summaryStats.avgIndian.toFixed(1)}%</span></div>
                        <div className="flex justify-between text-slate-600"><span>Avg Mean Age</span><span className="font-medium">{summaryStats.avgAge.toFixed(1)}</span></div>
                        <div className="flex justify-between text-slate-600"><span>Avg Contact %</span><span className="font-medium">{summaryStats.avgContact.toFixed(1)}%</span></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'filters' && (
            <div className="p-3 space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Advanced Metrics</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {COLOR_SCALES.filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i).map((s) => (
                    <button key={s.id} onClick={() => setActiveMetric(s.id)}
                      className={`text-left px-2.5 py-2 rounded-lg border transition-all text-[11px] ${activeMetric === s.id ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >{s.label}</button>
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="text-[10px] text-amber-700 leading-relaxed">Zoom in to see DUN boundaries. Click a Parliament seat to drill down into its DUNs. Zoom further to see DM bubbles.</p>
                </div>
              </div>
              <ExportPanel drilledParl={drilledParl} passwordSetVersion={passwordSetVersion} />
            </div>
          )}

          {activeTab === 'compare' && (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Seat Comparison (max 3)</label>
                {comparisonList.length > 0 && (
                  <button onClick={() => setComparisonList([])} className="text-[10px] text-rose-500 hover:text-rose-700 font-medium hover:underline">Clear All</button>
                )}
              </div>
              <p className="text-[10px] text-slate-400">Click any constituency popup's &quot;+ Compare&quot; button to add it here.</p>
              {comparisonList.length === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  <p className="text-xs">No seats selected yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                    {comparisonList.map((seat) => {
                      const voters = (seat.data.total_voters as number) || 0;
                      const malay = Number(seat.data.malay_pct) || 0;
                      const chinese = Number(seat.data.chinese_pct) || 0;
                      const indian = Number(seat.data.indian_pct) || 0;
                      return (
                      <div key={seat.code} className="bg-white border border-slate-200 rounded-lg p-2.5 relative group hover:shadow-md transition-shadow">
                        <button onClick={() => removeFromComparison(seat.code)} className="absolute top-1.5 right-1.5 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${seat.type === 'parliament' ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-100 text-teal-700'}`}>{seat.type === 'parliament' ? 'PARL' : 'DUN'}</span>
                          <span className="text-xs font-semibold text-slate-800">{seat.code}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mb-1.5">{seat.name}</div>
                        <div className="text-lg font-extrabold text-slate-800">{voters.toLocaleString()}</div>
                        <div className="text-[9px] text-slate-400 -mt-0.5 mb-2">total voters</div>
                        {/* Mini race bar */}
                        <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                          <div className="rounded-l-full" style={{width: malay + '%', background: '#ef4444'}} />
                          <div style={{width: chinese + '%', background: '#f59e0b'}} />
                          <div style={{width: indian + '%', background: '#3b82f6'}} />
                          <div className="rounded-r-full" style={{width: Math.max(0, 100 - malay - chinese - indian) + '%', background: '#8b5cf6'}} />
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                          <div className="flex justify-between"><span className="text-slate-400">Malay</span><span className="font-medium text-slate-700">{malay}%</span></div>
                          <div className="flex justify-between"><span className="text-slate-400">Chinese</span><span className="font-medium text-slate-700">{chinese}%</span></div>
                          <div className="flex justify-between"><span className="text-slate-400">Indian</span><span className="font-medium text-slate-700">{indian}%</span></div>
                          <div className="flex justify-between"><span className="text-slate-400">Age</span><span className="font-medium text-slate-700">{seat.data.age_mean}</span></div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Drill-down breadcrumb */}
        {drilledParl && (
          <div className="px-3 py-2 border-t border-slate-200/80 flex-shrink-0 bg-emerald-50/50">
            <button onClick={resetDrillDown} className="w-full flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-900 font-medium py-1.5 px-2 rounded-lg hover:bg-emerald-100 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back to Selangor overview
            </button>
            <p className="text-[10px] text-slate-500 mt-0.5 px-2">Showing DUNs under {drilledParl}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-3 py-2 border-t border-slate-200/80 flex-shrink-0 bg-slate-50/50">
          <p className="text-[9px] text-slate-400 leading-relaxed">Boundaries: MECo (CC0) &middot; Not official SPR boundaries.</p>
          <p className="text-[9px] text-slate-400 mt-0.5">Phase 7 &middot; Password-Protected CSV Export</p>
        </div>
      </aside>

      {/* ======= Map ======= */}
      <main className="flex-1 relative min-w-0">
        {/* Sidebar toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setSidebarOpen((o) => !o); }}
          className={`absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg hover:shadow-xl hover:bg-white transition-all border border-slate-200/80 ${isMobile ? 'p-2.5' : 'p-2'}`}
          aria-label="Toggle sidebar"
        >
          <svg className={`${isMobile ? 'w-5 h-5' : 'w-4 h-4'} text-slate-600`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {sidebarOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            )}
          </svg>
        </button>

        {/* Map container */}
        <div ref={containerRef} className="w-full h-full touch-action-none" />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/95 z-20">
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 border-3 border-emerald-200 rounded-full" />
                <div className="absolute inset-0 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <span className="text-sm text-slate-600 font-medium">Loading Selangor Voter Map...</span>
              <span className="text-xs text-slate-400">Loading boundaries & statistics</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/95 z-20">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm text-center mx-4 border border-slate-200">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
              <p className="text-red-600 font-semibold">Failed to load map data</p>
              <p className="text-sm text-slate-500 mt-1">{error}</p>
              <button onClick={() => window.location.reload()} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm">
                Reload Page
              </button>
            </div>
          </div>
        )}

        {/* Provenance button */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowProvenance((p) => !p); }}
          className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm px-2.5 py-1.5 hover:bg-white hover:shadow-md transition-all border border-slate-200/80 flex items-center gap-1.5"
          aria-label="Data provenance" title="Data provenance & sources"
        >
          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">Sources</span>
        </button>

        {/* Provenance panel */}
        {showProvenance && (
          <div className="absolute bottom-12 left-3 z-20 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-200/80 w-80 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white rounded-t-xl">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Data Provenance</h3>
              <button onClick={() => setShowProvenance(false)} className="text-slate-400 hover:text-slate-600 transition-colors" aria-label="Close provenance">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-3 space-y-3 text-xs text-slate-600">
              <div><h4 className="font-semibold text-slate-700 mb-0.5">Boundary Data</h4><p>{PROVENANCE.boundaries.source}</p><p className="text-slate-400 mt-0.5">DOI: {PROVENANCE.boundaries.doi}</p><p className="text-slate-400">License: {PROVENANCE.boundaries.license} &middot; {PROVENANCE.boundaries.year}</p><p className="text-amber-600 mt-0.5 italic">{PROVENANCE.boundaries.note}</p></div>
              <div><h4 className="font-semibold text-slate-700 mb-0.5">Voter Statistics</h4><p>{PROVENANCE.voters.total} registered voters across 22 Parliaments, 56 DUNs, 945 DMs.</p><p className="text-slate-400 mt-0.5">{PROVENANCE.voters.aggregation}</p></div>
              <div><h4 className="font-semibold text-slate-700 mb-0.5">Technology</h4><p>{PROVENANCE.tech.map} &middot; {PROVENANCE.tech.framework}</p><p className="text-slate-400 mt-0.5">{PROVENANCE.tech.hosting}</p><p className="mt-1"><a href={PROVENANCE.tech.url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">{PROVENANCE.tech.url}</a></p></div>
            </div>
          </div>
        )}

        {/* ===== Floating right-side feature toolbar ===== */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
          <ToolButton
            label="Analytics"
            sublabel="Charts"
            active={showAnalytics}
            onClick={(e) => { e.stopPropagation(); setShowAnalytics(true); setShowInsights(false); setShowRanking(false); }}
            gradient="from-emerald-500 to-teal-500"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </ToolButton>
          <ToolButton
            label="AI Insights"
            sublabel="LLM"
            active={showInsights}
            onClick={(e) => { e.stopPropagation(); setShowInsights(true); setShowAnalytics(false); setShowRanking(false); }}
            gradient="from-violet-500 to-fuchsia-500"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          </ToolButton>
          <ToolButton
            label="Ranking"
            sublabel="22 seats"
            active={showRanking}
            onClick={(e) => { e.stopPropagation(); setShowRanking(true); setShowAnalytics(false); setShowInsights(false); }}
            gradient="from-slate-600 to-slate-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l9 6 9-6M3 12l9 6 9-6M3 18l9 6 9-6" /></svg>
          </ToolButton>
          <div className="relative">
            <ToolButton
              label="Bookmarks"
              sublabel="Saved"
              active={showBookmarks}
              onClick={(e) => { e.stopPropagation(); setShowBookmarks((s) => !s); }}
              gradient="from-amber-500 to-orange-500"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
            </ToolButton>
            <BookmarksMenu
              open={showBookmarks}
              onClose={() => setShowBookmarks(false)}
              currentCode={currentSelection?.code ?? null}
              currentName={currentSelection?.type === 'parliament' || currentSelection?.type === 'dun' ? currentSelection.label.replace(/^[\w.]+\s*/, '') : null}
              currentType={currentSelection?.type === 'parliament' || currentSelection?.type === 'dun' ? currentSelection.type : null}
              onFlyTo={(code, type) => flyToConstituency(code, type)}
            />
          </div>
        </div>

        {/* ===== Current selection indicator (top-center) ===== */}
        {currentSelection && !loading && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-md border border-slate-200/80 px-3 py-2 flex items-center gap-2 max-w-[280px] sm:max-w-[360px]">
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${currentSelection.type === 'parliament' ? 'bg-emerald-100 text-emerald-700' : currentSelection.type === 'dun' ? 'bg-teal-100 text-teal-700' : currentSelection.type === 'dm' ? 'bg-rose-100 text-rose-700' : 'bg-violet-100 text-violet-700'}`}>
              {currentSelection.type.toUpperCase()}
            </span>
            <span className="text-xs text-slate-700 font-medium truncate" title={currentSelection.label}>{currentSelection.label}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setCurrentSelection(null); }}
              className="text-slate-300 hover:text-rose-500 transition-colors flex-shrink-0"
              aria-label="Clear selection"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* ===== Zoom level indicator ===== */}
        {!loading && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-white/85 backdrop-blur-sm rounded-full shadow-md border border-slate-200/60 px-3 py-1 flex items-center gap-2 text-[10px] text-slate-500 font-mono">
            <span title="Current zoom">z{mapZoom.toFixed(1)}</span>
            <span className="w-px h-3 bg-slate-200" />
            <span className="text-slate-400">{isDunZoom ? 'DUN view' : 'Parliament view'}</span>
          </div>
        )}

        {/* ===== Drawers ===== */}
        <AnalyticsDrawer
          open={showAnalytics}
          onClose={() => setShowAnalytics(false)}
          parliamentStats={parlStatsState}
          dunStats={dunStatsState}
          activeMetric={activeMetric}
        />
        <AiInsightsPanel
          open={showInsights}
          onClose={() => setShowInsights(false)}
          selection={currentSelection}
        />
        <RankingTable
          open={showRanking}
          onClose={() => setShowRanking(false)}
          parliamentStats={parlStatsState}
          activeMetric={activeMetric}
          onFlyTo={(code) => flyToConstituency(code, 'parliament')}
        />
      </main>
    </div>
  );
}

// ============================================================
// Floating toolbar button
// ============================================================

function ToolButton({
  children, label, sublabel, active, onClick, gradient,
}: {
  children: React.ReactNode;
  label: string;
  sublabel?: string;
  active?: boolean;
  onClick: (e: React.MouseEvent) => void;
  gradient: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative w-10 h-10 rounded-lg shadow-md hover:shadow-lg border transition-all flex items-center justify-center overflow-hidden ${
        active
          ? `bg-gradient-to-br ${gradient} text-white border-white/30 shadow-lg`
          : 'bg-white/90 backdrop-blur-sm text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-900'
      }`}
      aria-label={label}
      title={label}
    >
      {children}
      {/* Tooltip on hover */}
      <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg flex flex-col">
        <span className="font-medium">{label}</span>
        {sublabel && <span className="text-slate-300 text-[9px]">{sublabel}</span>}
      </div>
    </button>
  );
}

// ============================================================
// Popup HTML builders — Enhanced with visual bars and bilingual labels
// ============================================================

function escapeHTMLAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildParliamentPopupHTML(p: PopupData, isDrillDown: boolean, code: string): string {
  const compareData = JSON.stringify({ code, name: p.name, type: 'parliament', data: { total_voters: p.total_voters, male: p.male, female: p.female, male_pct: p.male_pct, female_pct: p.female_pct, malay_pct: p.malay_pct, chinese_pct: p.chinese_pct, indian_pct: p.indian_pct, other_pct: p.other_pct, age_mean: p.age_mean, age_median: p.age_median, contact_pct: p.contact_pct } });
  const safeCompareData = escapeHTMLAttr(compareData);
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;min-width:280px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div>
          <div style="font-weight:700;font-size:14px;color:#0f172a;line-height:1.3;">${p.code_parlimen} — ${p.name}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px;display:flex;align-items:center;gap:4px;">
            <span style="background:#ecfdf5;color:#059669;padding:1px 6px;border-radius:4px;font-weight:500;">PARL</span>
            Kawasan Persekutuan
          </div>
        </div>
        <button data-c="${safeCompareData}" onclick="window.dispatchEvent(new CustomEvent('slgrvtrs:compare',{detail:JSON.parse(this.dataset.c)}))" style="background:#f0fdf4;border:1px solid #bbf7d0;color:#16a34a;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:500;cursor:pointer;white-space:nowrap;transition:all 0.15s;" onmouseover="this.style.background='#dcfce7'" onmouseout="this.style.background='#f0fdf4'">+ Compare</button>
      </div>
      <div style="margin-top:10px;padding:8px 10px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:4px;">Jumlah Pengundi / Total Voters</div>
        <div style="font-size:20px;font-weight:800;color:#0f172a;">${p.total_voters.toLocaleString()}</div>
      </div>
      <div style="margin-top:10px;">${genderDonut(p.male, p.female)}</div>
      <div style="margin-top:8px;">${raceBar(p.malay_pct, p.chinese_pct, p.indian_pct, p.other_pct)}</div>
      <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <div style="background:#f8fafc;border-radius:6px;padding:6px 8px;border:1px solid #f1f5f9;">
          <div style="font-size:9px;color:#94a3b8;">Min Umur / Mean Age</div>
          <div style="font-size:14px;font-weight:700;color:#334155;">${p.age_mean}</div>
        </div>
        <div style="background:#f8fafc;border-radius:6px;padding:6px 8px;border:1px solid #f1f5f9;">
          <div style="font-size:9px;color:#94a3b8;">Median Umur</div>
          <div style="font-size:14px;font-weight:700;color:#334155;">${p.age_median}</div>
        </div>
        <div style="background:#f8fafc;border-radius:6px;padding:6px 8px;border:1px solid #f1f5f9;">
          <div style="font-size:9px;color:#94a3b8;">Hubungan / Contact %</div>
          <div style="font-size:14px;font-weight:700;color:#334155;">${p.contact_pct}%</div>
        </div>
        <div style="background:#f8fafc;border-radius:6px;padding:6px 8px;border:1px solid #f1f5f9;">
          <div style="font-size:9px;color:#94a3b8;">Bil. DUN</div>
          <div style="font-size:14px;font-weight:700;color:#334155;">${p.child_dun_count}</div>
        </div>
      </div>
      ${isDrillDown ? `<div style="font-size:10px;color:#059669;margin-top:8px;font-weight:500;padding:4px 8px;background:#ecfdf5;border-radius:4px;">Zoomed to ${p.child_dun_count} DUN seat${p.child_dun_count > 1 ? 's' : ''} — click DUNs for details</div>` : ''}
    </div>`;
}

function buildDUNPopupHTML(p: DUNProperties, codeDun: string): string {
  const hasStats = p.total_voters !== undefined && p.total_voters !== null;
  const dunName = p.dun.replace(/^N\.\d+\s+/, '');
  const parlName = p.parlimen.replace(/^P\.\d+\s+/, '');

  if (!hasStats) {
    return `<div style="font-family:system-ui,sans-serif;">
      <div style="font-weight:700;font-size:14px;color:#004d40;">${p.code_dun} — ${dunName}</div>
      <div style="font-size:10px;color:#64748b;margin-top:2px;display:flex;align-items:center;gap:4px;">
        <span style="background:#f0fdfa;color:#0d9488;padding:1px 6px;border-radius:4px;font-weight:500;">DUN</span>
        Dewan Undangan Negeri
      </div>
      <div style="margin-top:8px;padding:6px 8px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;font-size:11px;color:#64748b;">Parent: ${p.parent_parl} ${parlName}</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:8px;">No voter statistics available for this seat.</div>
    </div>`;
  }

  const compareData = JSON.stringify({ code: codeDun, name: dunName, type: 'dun', data: { total_voters: p.total_voters, male: p.male, female: p.female, male_pct: p.male_pct, female_pct: p.female_pct, malay_pct: p.malay_pct, chinese_pct: p.chinese_pct, indian_pct: p.indian_pct, other_pct: p.other_pct, age_mean: p.age_mean, age_median: p.age_median, contact_pct: p.contact_pct, dm_count: p.dm_count } });
  const safeCompareData = escapeHTMLAttr(compareData);

  return `<div style="font-family:system-ui,-apple-system,sans-serif;min-width:280px;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
      <div>
        <div style="font-weight:700;font-size:14px;color:#004d40;line-height:1.3;">${p.code_dun} — ${dunName}</div>
        <div style="font-size:10px;color:#64748b;margin-top:2px;display:flex;align-items:center;gap:4px;">
          <span style="background:#f0fdfa;color:#0d9488;padding:1px 6px;border-radius:4px;font-weight:500;">DUN</span>
          Dewan Undangan Negeri
        </div>
      </div>
      <button data-c="${safeCompareData}" onclick="window.dispatchEvent(new CustomEvent('slgrvtrs:compare',{detail:JSON.parse(this.dataset.c)}))" style="background:#f0fdfa;border:1px solid #99f6e4;color:#0d9488;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:500;cursor:pointer;white-space:nowrap;" onmouseover="this.style.background='#ccfbf1'" onmouseout="this.style.background='#f0fdfa'">+ Compare</button>
    </div>
    <div style="margin-top:6px;padding:4px 8px;background:#f0fdfa;border-radius:6px;font-size:10px;color:#0f766e;border:1px solid #ccfbf1;">
      Parent: <strong>${p.parent_parl}</strong> ${parlName}
    </div>
    <div style="margin-top:10px;padding:8px 10px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:4px;">Jumlah Pengundi / Total Voters</div>
      <div style="font-size:20px;font-weight:800;color:#0f172a;">${p.total_voters!.toLocaleString()}</div>
    </div>
    <div style="margin-top:10px;">${genderDonut(p.male!, p.female!)}</div>
    <div style="margin-top:8px;">${raceBar(p.malay_pct!, p.chinese_pct!, p.indian_pct!, p.other_pct!)}</div>
    <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
      <div style="background:#f8fafc;border-radius:6px;padding:6px 8px;border:1px solid #f1f5f9;">
        <div style="font-size:9px;color:#94a3b8;">Min Umur</div>
        <div style="font-size:13px;font-weight:700;color:#334155;">${p.age_mean}</div>
      </div>
      <div style="background:#f8fafc;border-radius:6px;padding:6px 8px;border:1px solid #f1f5f9;">
        <div style="font-size:9px;color:#94a3b8;">Contact %</div>
        <div style="font-size:13px;font-weight:700;color:#334155;">${p.contact_pct}%</div>
      </div>
      <div style="background:#f8fafc;border-radius:6px;padding:6px 8px;border:1px solid #f1f5f9;">
        <div style="font-size:9px;color:#94a3b8;">Bil. DM</div>
        <div style="font-size:13px;font-weight:700;color:#334155;">${p.dm_count}</div>
      </div>
    </div>
  </div>`;
}

function buildDMPopupHTML(p: DMProperties, gf: string = 'all', rf: string = 'all'): string {
  const dmName = p.dm_code.replace(/^[\d.]+\s*/, '');
  const dunName = p.dun_code.replace(/^[\d.]+\s*/, '');
  return `<div style="font-family:system-ui,-apple-system,sans-serif;min-width:260px;">
    <div style="font-weight:700;font-size:13px;color:#6d1a36;line-height:1.3;">${dmName}</div>
    <div style="font-size:10px;color:#64748b;margin-top:2px;display:flex;align-items:center;gap:4px;">
      <span style="background:#fff1f2;color:#be123c;padding:1px 6px;border-radius:4px;font-weight:500;">DM</span>
      Daerah Mengundi &middot; ${p.dun_code} ${dunName}
    </div>
    ${(() => {
      if (gf === 'all' && rf === 'all') return '';
      let fc = 0, fl = '';
      if (gf === 'all') { fc = (p as any)['male_' + rf] + (p as any)['female_' + rf]; fl = rf.charAt(0).toUpperCase() + rf.slice(1); }
      else if (rf === 'all') { fc = (p as any)[gf + '_malay'] + (p as any)[gf + '_chinese'] + (p as any)[gf + '_indian'] + (p as any)[gf + '_other']; fl = gf.charAt(0).toUpperCase() + gf.slice(1); }
      else { fc = (p as any)[gf + '_' + rf]; fl = gf.charAt(0).toUpperCase() + gf.slice(1) + ' ' + rf.charAt(0).toUpperCase() + rf.slice(1); }
      const pct = p.total_voters > 0 ? (fc / p.total_voters * 100).toFixed(1) : '0.0';
      return '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:4px 8px;margin-top:8px;font-size:11px;color:#9f1239;"><strong>Active Filter:</strong> ' + fc.toLocaleString() + ' ' + fl + ' voters (' + pct + '%)</div>';
    })()}
    <div style="margin-top:10px;padding:8px 10px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:4px;">Jumlah Pengundi</div>
      <div style="font-size:18px;font-weight:800;color:#0f172a;">${p.total_voters.toLocaleString()}</div>
    </div>
    <div style="margin-top:8px;">${genderDonut(p.male, p.female)}</div>
    <div style="margin-top:6px;">${raceBar(p.malay_pct, p.chinese_pct, p.indian_pct, p.other_pct)}</div>
    <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px;">
      <div style="background:#f8fafc;border-radius:6px;padding:6px 8px;border:1px solid #f1f5f9;">
        <div style="font-size:9px;color:#94a3b8;">Min Umur</div>
        <div style="font-size:13px;font-weight:700;color:#334155;">${p.age_mean}</div>
      </div>
      <div style="background:#f8fafc;border-radius:6px;padding:6px 8px;border:1px solid #f1f5f9;">
        <div style="font-size:9px;color:#94a3b8;">Contact %</div>
        <div style="font-size:13px;font-weight:700;color:#334155;">${p.contact_pct}%</div>
      </div>
    </div>
  </div>`;
}
