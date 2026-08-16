'use client';

import { useMemo, useState } from 'react';
import type { ParliamentStats, DunStats } from '@/lib/map/join-stats';

interface RankingTableProps {
  open: boolean;
  onClose: () => void;
  parliamentStats: Record<string, ParliamentStats>;
  dunStats: Record<string, DunStats>;
  activeMetric: string;
  onFlyTo?: (code: string, type: 'parliament' | 'dun') => void;
}

const METRICS = [
  { id: 'total_voters', label: 'Total Voters', fmt: (v: number) => v.toLocaleString() },
  { id: 'malay_pct', label: 'Malay %', fmt: (v: number) => `${v.toFixed(1)}%` },
  { id: 'chinese_pct', label: 'Chinese %', fmt: (v: number) => `${v.toFixed(1)}%` },
  { id: 'indian_pct', label: 'Indian %', fmt: (v: number) => `${v.toFixed(1)}%` },
  { id: 'other_pct', label: 'Others %', fmt: (v: number) => `${v.toFixed(1)}%` },
  { id: 'male_pct', label: 'Male %', fmt: (v: number) => `${v.toFixed(1)}%` },
  { id: 'female_pct', label: 'Female %', fmt: (v: number) => `${v.toFixed(1)}%` },
  { id: 'age_mean', label: 'Mean Age', fmt: (v: number) => v.toFixed(1) },
  { id: 'age_median', label: 'Median Age', fmt: (v: number) => v.toFixed(1) },
  { id: 'contact_pct', label: 'Contact %', fmt: (v: number) => `${v.toFixed(1)}%` },
] as const;

type SortDir = 'asc' | 'desc';
type Level = 'parliament' | 'dun';

interface Row {
  code: string;
  name: string;
  parentCode?: string;
  parentName?: string;
  value: number;
}

export default function RankingTable({
  open, onClose, parliamentStats, dunStats, activeMetric, onFlyTo,
}: RankingTableProps) {
  const [level, setLevel] = useState<Level>('parliament');
  const [metric, setMetric] = useState<string>(activeMetric);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [query, setQuery] = useState('');

  const meta = useMemo(() => METRICS.find((m) => m.id === metric) ?? METRICS[0], [metric]);

  const rows = useMemo<Row[]>(() => {
    const prop = metric as keyof ParliamentStats;
    const q = query.toLowerCase();
    if (level === 'parliament') {
      const all = Object.values(parliamentStats);
      const filtered = q
        ? all.filter((p) => p.code_parlimen.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
        : all;
      return [...filtered]
        .map((p) => ({ code: p.code_parlimen, name: p.name, value: p[prop] as number }))
        .sort((a, b) => sortDir === 'desc' ? b.value - a.value : a.value - b.value);
    }
    // DUN level
    const parlMap: Record<string, string> = {};
    Object.values(parliamentStats).forEach((p) => { parlMap[p.code_parlimen] = p.name; });
    const all = Object.values(dunStats);
    const filtered = q
      ? all.filter((d) => d.code_dun.toLowerCase().includes(q) || d.name.toLowerCase().includes(q) || d.code_parlimen.toLowerCase().includes(q))
      : all;
    return [...filtered]
      .map((d) => ({
        code: d.code_dun,
        name: d.name,
        parentCode: d.code_parlimen,
        parentName: parlMap[d.code_parlimen] ?? '',
        value: d[prop as keyof DunStats] as number,
      }))
      .sort((a, b) => sortDir === 'desc' ? b.value - a.value : a.value - b.value);
  }, [level, parliamentStats, dunStats, metric, sortDir, query]);

  if (!open) return null;

  const totalCount = level === 'parliament' ? Object.keys(parliamentStats).length : Object.keys(dunStats).length;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40 animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="fixed top-0 right-0 h-full w-full sm:w-[460px] bg-white shadow-2xl z-50 flex flex-col animate-[slideInRight_0.25s_ease-out] border-l border-slate-200">
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l9 6 9-6M3 12l9 6 9-6M3 18l9 6 9-6" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Constituency Ranking</h2>
              <p className="text-[10px] text-slate-300">Sort & explore {totalCount} {level === 'parliament' ? 'parliaments' : 'DUNs'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 transition-colors text-white"
            aria-label="Close ranking table"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Level toggle */}
        <div className="flex-shrink-0 px-3 pt-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex gap-1 mb-2">
            {(['parliament', 'dun'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`flex-1 py-1.5 text-[11px] rounded-md border transition-all font-medium ${level === l
                  ? 'bg-slate-700 border-slate-700 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                {l === 'parliament' ? `Parliament (22)` : `DUN (56)`}
              </button>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex-shrink-0 p-3 space-y-2 border-b border-slate-100 bg-slate-50/50">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Filter by code or name…`}
                className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
              />
            </div>
            <button
              onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
              className="h-8 px-2.5 text-xs rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all flex items-center gap-1 font-medium text-slate-600"
              title="Toggle sort direction"
            >
              {sortDir === 'desc' ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
              )}
              {sortDir === 'desc' ? 'High→Low' : 'Low→High'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {METRICS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMetric(m.id)}
                className={`px-2 py-1 text-[10px] rounded-md border transition-all ${metric === m.id ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-semibold' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 font-semibold w-10">#</th>
                <th className="px-1 py-2 font-semibold">Code</th>
                <th className="px-1 py-2 font-semibold">Name</th>
                {level === 'dun' && <th className="px-1 py-2 font-semibold">Parliament</th>}
                <th className="px-3 py-2 font-semibold text-right">{meta.label}</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const max = rows.length ? Math.max(...rows.map((x) => x.value)) : 0;
                const barPct = max > 0 ? (r.value / max) * 100 : 0;
                return (
                  <tr
                    key={r.code}
                    className="border-t border-slate-100 hover:bg-emerald-50/40 transition-colors group"
                  >
                    <td className="px-3 py-2 text-slate-400 font-mono tabular-nums">{i + 1}</td>
                    <td className="px-1 py-2 font-semibold text-slate-700">{r.code}</td>
                    <td className="px-1 py-2 text-slate-600 truncate max-w-[100px]" title={r.name}>{r.name}</td>
                    {level === 'dun' && (
                      <td className="px-1 py-2 text-[10px] text-slate-400 truncate max-w-[80px]" title={`${r.parentCode} ${r.parentName}`}>{r.parentCode}</td>
                    )}
                    <td className="px-3 py-2 text-right relative">
                      <div className="absolute inset-y-1 right-2 rounded bg-emerald-100/60" style={{ width: `${barPct}%` }} />
                      <span className="relative font-semibold text-slate-800 tabular-nums">{meta.fmt(r.value)}</span>
                    </td>
                    <td className="px-2 py-2">
                      {onFlyTo && (
                        <button
                          onClick={() => onFlyTo(r.code, level)}
                          className="opacity-0 group-hover:opacity-100 text-emerald-500 hover:text-emerald-700 transition-all"
                          title={`Fly to ${r.code}`}
                          aria-label={`Fly to ${r.code}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-xs">No matches for &quot;{query}&quot;</div>
          )}
        </div>
      </aside>

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
    </>
  );
}
