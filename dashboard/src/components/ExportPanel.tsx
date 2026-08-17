'client';

import { useState, useEffect, useCallback } from 'react';
import PasswordDialog from './PasswordDialog';

// ── Types ──────────────────────────────────────────────────

type ExportLevel = 'parliament' | 'dun' | 'dm';
type FilterMode = 'all' | 'parliament' | 'dun';

interface ExportPanelProps {
  /** Current drilled-down parliament code (e.g. 'P.092'), if any */
  drilledParl: string | null;
  /** Incremented by MapDashboard when password is set/changed, triggers re-fetch */
  passwordSetVersion: number;
}

interface SeatOption {
  code: string;
  name: string;
}

// ── Component ───────────────────────────────────────────────

export default function ExportPanel({ drilledParl, passwordSetVersion }: ExportPanelProps) {
  const [level, setLevel] = useState<ExportLevel>('parliament');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedCode, setSelectedCode] = useState('');
  const [showPwDialog, setShowPwDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  // Seat options for the dropdown
  const [parlOptions, setParlOptions] = useState<SeatOption[]>([]);
  const [dunOptions, setDunOptions] = useState<SeatOption[]>([]);
  const [dmOptions, setDmOptions] = useState<SeatOption[]>([]);
  const [selectedDm, setSelectedDm] = useState('');
  const [isPasswordSet, setIsPasswordSet] = useState<boolean | null>(null);

  // Load parliament/DUN/DM lists from pre-computed JSON (once)
  useEffect(() => {
    fetch('/stats/parliament.json')
      .then((r) => r.json())
      .then((data: Record<string, any>) => {
        setParlOptions(
          Object.values(data)
            .map((s: any) => ({ code: s.code_parlimen, name: s.name }))
            .sort((a: any, b: any) => a.code.localeCompare(b.code)),
        );
      })
      .catch(() => {});

    fetch('/stats/dun.json')
      .then((r) => r.json())
      .then((data: Record<string, any>) => {
        setDunOptions(
          Object.values(data)
            .map((s: any) => ({ code: s.code_dun, name: s.name }))
            .sort((a: any, b: any) => a.code.localeCompare(b.code)),
        );
      })
      .catch(() => {});

    // Load all 945 DMs
    fetch('/stats/dm.json')
      .then((r) => r.json())
      .then((data: Record<string, any>) => {
        setDmOptions(
          Object.values(data)
            .map((s: any) => ({ code: s.dm_code, name: s.dm_code.replace(/^[\d.]+\s*/, '') }))
            .sort((a: any, b: any) => a.code.localeCompare(b.code)),
        );
      })
      .catch(() => {});
  }, []);

  // Re-fetch password status when password is set/changed in SettingsGear
  useEffect(() => {
    fetch('/api/settings/password')
      .then((r) => r.json())
      .then((d) => setIsPasswordSet(d.isSet))
      .catch(() => {});
  }, [passwordSetVersion]);

  // Sync filter when drilledParl changes — only apply if current level supports it
  useEffect(() => {
    if (drilledParl) {
      // Parliament level has no “by parliament” filter; auto-switch to DUN
      if (level === 'parliament') {
        setLevel('dun');
        setFilterMode('parliament');
        setSelectedCode(drilledParl);
      } else {
        setFilterMode('parliament');
        setSelectedCode(drilledParl);
      }
    }
  }, [drilledParl]);

  // Build description for the password dialog
  const exportDescription = useCallback(() => {
    const levelLabel = level === 'parliament' ? 'Parliament' : level === 'dun' ? 'DUN' : 'DM';
    if (filterMode === 'all') return `Download all ${levelLabel} data as CSV`;
    const seat = (level === 'dm' && filterMode === 'dun' ? dunOptions : parlOptions).find(s => s.code === selectedCode);
    return `Download ${seat ? `${seat.code} ${seat.name}` : selectedCode} ${levelLabel} data as CSV`;
  }, [level, filterMode, selectedCode, parlOptions, dunOptions]);

  // Handle password submission → trigger download
  const handlePasswordSubmit = useCallback(async (password: string) => {
    const code = filterMode === 'all' ? undefined : selectedCode;
    const res = await fetch('/api/export/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, level, code }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    // Trigger browser download
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const cd = res.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="?([^";]+)"?/);
    a.href = url;
    a.download = match ? match[1] : `slgrvtrs_${level}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // Show toast
    const count = filterMode === 'all'
      ? level === 'parliament' ? 22 : level === 'dun' ? 56 : 945
      : 'selected';
    setToast({ ok: true, text: `Exported ${count} ${level} rows` });
    setTimeout(() => setToast(null), 3000);
  }, [level, filterMode, selectedCode]);

  // Click download button
  const handleExportClick = () => {
    if (isPasswordSet === false) {
      setToast({ ok: false, text: 'Set a password in Settings (gear icon) first' });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    setShowPwDialog(true);
  };

  // Handle "Download All 945 DMs (Sorted)" — uses a separate endpoint
  const handleAllDmExport = useCallback(async (password: string) => {
    const res = await fetch('/api/export/dm-xlsx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const cd = res.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="?([^";]+)"?/);
    a.href = url;
    a.download = match ? match[1] : 'slgrvtrs_all_945_dms_sorted.csv';
    a.click();
    URL.revokeObjectURL(url);
    setToast({ ok: true, text: 'Exported 945 DMs (sorted)' });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Click "Download All 945 DMs" button
  const handleAllDmClick = () => {
    if (isPasswordSet === false) {
      setToast({ ok: false, text: 'Set a password in Settings (gear icon) first' });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    // Reuse the password dialog with a different handler
    setShowPwDialog(true);
    // Override the onSubmit temporarily by setting a flag
    setAllDmMode(true);
  };

  const [allDmMode, setAllDmMode] = useState(false);

  // Handle individual DM voter download (from R2)
  const handleDmVoterExport = useCallback(async (password: string) => {
    if (!selectedDm) return;
    const res = await fetch(`/api/export/dm-voters/${encodeURIComponent(selectedDm)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const cd = res.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="?([^";]+)"?/);
    a.href = url;
    a.download = match ? match[1] : `voters_${selectedDm}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ ok: true, text: `Downloaded individual voters for ${selectedDm}` });
    setTimeout(() => setToast(null), 3000);
  }, [selectedDm]);

  // Click "Download Individual Voters for DM" button
  const handleDmVoterClick = () => {
    if (isPasswordSet === false) {
      setToast({ ok: false, text: 'Set a password in Settings (gear icon) first' });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    if (!selectedDm) {
      setToast({ ok: false, text: 'Select a DM first' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setShowPwDialog(true);
    setDmVoterMode(true);
  };

  const [dmVoterMode, setDmVoterMode] = useState(false);

  const filterOptions: { value: FilterMode; label: string }[] =
    level === 'parliament'
      ? [{ value: 'all', label: 'All Parliaments (22)' }]
      : level === 'dun'
        ? [
            { value: 'all', label: 'All DUNs (56)' },
            { value: 'parliament', label: 'By Parliament' },
          ]
        : [
            { value: 'all', label: 'All DMs (945)' },
            { value: 'parliament', label: 'By Parliament' },
            { value: 'dun', label: 'By DUN' },
          ];

  const seatList = filterMode === 'dun' ? dunOptions : parlOptions;

  return (
    <div className="space-y-3">
      {/* Toast */}
      {toast && (
        <div className={`rounded-lg px-3 py-2 text-[11px] font-medium flex items-center gap-2 border ${toast.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
          {toast.ok ? (
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          ) : (
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" /></svg>
          )}
          {toast.text}
        </div>
      )}

      {/* Level selector */}
      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Export Level</label>
        <div className="flex gap-1">
          {([
            { value: 'parliament' as const, label: 'Parliament', count: '22' },
            { value: 'dun' as const, label: 'DUN', count: '56' },
            { value: 'dm' as const, label: 'DM', count: '945' },
          ]).map((l) => (
            <button
              key={l.value}
              onClick={() => {
                setLevel(l.value);
                // Re-apply drilledParl filter for levels that support it
                if (drilledParl && l.value !== 'parliament') {
                  setFilterMode('parliament');
                  setSelectedCode(drilledParl);
                } else {
                  setFilterMode('all');
                  setSelectedCode('');
                }
              }}
              className={`flex-1 py-1.5 text-[10px] rounded-lg border transition-all font-medium ${level === l.value ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
            >{l.label}<span className="ml-1 text-[9px] opacity-60">({l.count})</span></button>
          ))}
        </div>
      </div>

      {/* Filter selector */}
      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Filter</label>
        <div className="flex gap-1">
          {filterOptions.map((f) => (
            <button
              key={f.value}
              onClick={() => { setFilterMode(f.value); setSelectedCode(''); }}
              className={`flex-1 py-1.5 text-[10px] rounded-lg border transition-all ${filterMode === f.value ? 'bg-slate-100 border-slate-300 text-slate-700 font-medium' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {/* Constituency selector */}
      {filterMode !== 'all' && (
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
            Select {filterMode === 'dun' ? 'DUN' : 'Parliament'}
          </label>
          <select
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
            className="w-full h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
          >
            <option value="">-- Choose --</option>
            {seatList.map((s) => (
              <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Download button */}
      <button
        onClick={handleExportClick}
        disabled={loading || (filterMode !== 'all' && !selectedCode)}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-lg transition-all border shadow-sm disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Download CSV
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </button>

      {/* Download ALL 945 DMs sorted button */}
      <button
        onClick={handleAllDmClick}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2 text-[11px] font-semibold rounded-lg transition-all border shadow-sm disabled:opacity-50 bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download All 945 DMs (Sorted)
      </button>

      {/* ── Individual DM Voter Download (from R2) ── */}
      <div className="pt-2 mt-2 border-t border-slate-100">
        <label className="text-[10px] font-semibold text-rose-600 uppercase tracking-wider block mb-1.5">
          Individual Voter Download
        </label>
        <select
          value={selectedDm}
          onChange={(e) => setSelectedDm(e.target.value)}
          className="w-full h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-rose-400 transition-all mb-2"
        >
          <option value="">-- Select DM (945) --</option>
          {dmOptions.map((s) => (
            <option key={s.code} value={s.code}>{s.code}</option>
          ))}
        </select>
        <button
          onClick={handleDmVoterClick}
          disabled={loading || !selectedDm}
          className="w-full flex items-center justify-center gap-2 py-2 text-[11px] font-semibold rounded-lg transition-all border shadow-sm disabled:opacity-50 disabled:cursor-not-allowed bg-rose-600 text-white border-rose-600 hover:bg-rose-700"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Download Individual Voters
        </button>
      </div>

      {/* Password dialog */}
      <PasswordDialog
        open={showPwDialog}
        onClose={() => { setShowPwDialog(false); setAllDmMode(false); setDmVoterMode(false); }}
        onSubmit={dmVoterMode ? handleDmVoterExport : allDmMode ? handleAllDmExport : handlePasswordSubmit}
        description={dmVoterMode ? `Download individual voters for ${selectedDm} as password-protected CSV` : allDmMode ? 'Download all 945 DMs sorted by DM code as CSV' : exportDescription()}
      />
    </div>
  );
}
