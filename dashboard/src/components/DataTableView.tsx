'use client';

import { useState, useMemo } from 'react';
import type { ParliamentStats, DunStats } from '@/lib/map/join-stats';

interface DataTableViewProps {
  open: boolean;
  onClose: () => void;
  parliamentStats: Record<string, ParliamentStats>;
  dunStats: Record<string, DunStats>;
  onFlyTo?: (code: string, type: 'parliament' | 'dun') => void;
}

type Level = 'parliament' | 'dun';
type SortDir = 'asc' | 'desc';

const COLUMNS = [
  { key: 'code', label: 'Code', sortable: true, fmt: (v: any) => String(v) },
  { key: 'name', label: 'Name', sortable: true, fmt: (v: any) => String(v) },
  { key: 'total_voters', label: 'Voters', sortable: true, fmt: (v: number) => v?.toLocaleString() ?? '—', align: 'right' as const },
  { key: 'male_pct', label: 'Male %', sortable: true, fmt: (v: number) => v != null ? `${v.toFixed(1)}%` : '—', align: 'right' as const },
  { key: 'female_pct', label: 'Female %', sortable: true, fmt: (v: number) => v != null ? `${v.toFixed(1)}%` : '—', align: 'right' as const },
  { key: 'malay_pct', label: 'Malay %', sortable: true, fmt: (v: number) => v != null ? `${v.toFixed(1)}%` : '—', align: 'right' as const },
  { key: 'chinese_pct', label: 'Chinese %', sortable: true, fmt: (v: number) => v != null ? `${v.toFixed(1)}%` : '—', align: 'right' as const },
  { key: 'indian_pct', label: 'Indian %', sortable: true, fmt: (v: number) => v != null ? `${v.toFixed(1)}%` : '—', align: 'right' as const },
  { key: 'age_mean', label: 'Mean Age', sortable: true, fmt: (v: number) => v != null ? v.toFixed(1) : '—', align: 'right' as const },
  { key: 'contact_pct', label: 'Contact %', sortable: true, fmt: (v: number) => v != null ? `${v.toFixed(1)}%` : '—', align: 'right' as const },
];

export default function DataTableView({ open, onClose, parliamentStats, dunStats, onFlyTo }: DataTableViewProps) {
  const [level, setLevel] = useState<Level>('parliament');
  const [sortKey, setSortKey] = useState('total_voters');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    const source = level === 'parliament' ? Object.values(parliamentStats) : Object.values(dunStats);
    const filtered = q
      ? source.filter((r: any) => r.code_parlimen?.toLowerCase().includes(q) || r.code_dun?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q))
      : source;
    return [...filtered].sort((a: any, b: any) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'desc' ? bv - av : av - bv;
      }
      const as = String(av ?? '');
      const bs = String(bv ?? '');
      return sortDir === 'desc' ? bs.localeCompare(as) : as.localeCompare(bs);
    });
  }, [level, parliamentStats, dunStats, sortKey, sortDir, query]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const exportCSV = () => {
    const headers = COLUMNS.map((c) => c.label);
    const lines = [headers.join(',')];
    const esc = (s: string) => /[,\"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    rows.forEach((r: any) => {
      lines.push(COLUMNS.map((c) => esc(c.fmt(r[c.key]))).join(','));
    });
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slgrvtrs_${level}_table.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col animate-[slideUp_0.3s_ease-out]">
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center backdrop-blur-sm ring-1 ring-white/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Data Table Explorer</h2>
              <p className="text-[10px] text-indigo-100">{rows.length} {level === 'parliament' ? 'parliaments' : 'DUNs'} · sortable · exportable</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15 transition-colors text-white" aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Controls */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            {(['parliament', 'dun'] as const).map((l) => (
              <button key={l} onClick={() => setLevel(l)}
                className={`px-3 py-1.5 text-[11px] rounded-md border font-medium transition-all ${level === l ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                {l === 'parliament' ? 'Parliament (22)' : 'DUN (56)'}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[200px] relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by code or name…"
              className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all" />
          </div>
          <button onClick={exportCSV} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-sm">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-100 z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                {COLUMNS.map((col) => (
                  <th key={col.key}
                    onClick={() => col.sortable && handleSort(col.key)}
                    className={`px-3 py-2.5 font-semibold ${col.sortable ? 'cursor-pointer hover:text-indigo-600 transition-colors select-none' : ''} ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                    <span className="flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}">
                      {col.label}
                      {col.sortable && sortKey === col.key && (
                        <svg className="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {sortDir === 'desc'
                            ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />}
                        </svg>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, i) => (
                <tr key={level === 'parliament' ? r.code_parlimen : r.code_dun}
                  className={`border-t border-slate-100 hover:bg-indigo-50/40 transition-colors cursor-pointer group ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}
                  onClick={() => {
                    const code = level === 'parliament' ? r.code_parlimen : r.code_dun;
                    if (onFlyTo) {
                      onFlyTo(code, level);
                      onClose();
                    }
                  }}>
                  {COLUMNS.map((col) => {
                    const val = r[col.key];
                    const code = level === 'parliament' ? r.code_parlimen : r.code_dun;
                    const displayVal = col.key === 'code' ? code : val;
                    return (
                      <td key={col.key} className={`px-3 py-2 ${col.align === 'right' ? 'text-right tabular-nums font-medium' : col.key === 'code' ? 'font-semibold text-indigo-600' : 'text-slate-600'}`}>
                        {col.fmt(displayVal)}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 w-8 text-center">
                    {onFlyTo && (
                      <span className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Fly to this seat">
                        <svg className="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-xs">No matches for &quot;{query}&quot;</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-[10px] text-slate-400">
          <span>Showing {rows.length} of {level === 'parliament' ? 22 : 56} {level === 'parliament' ? 'parliaments' : 'DUNs'}</span>
          <span>Click column headers to sort · Click Export to download CSV</span>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  );
}
