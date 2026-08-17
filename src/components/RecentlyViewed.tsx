'use client';

import { useState, useCallback, useEffect } from 'react';

export interface RecentSeat {
  code: string;
  name: string;
  type: 'parliament' | 'dun' | 'dm';
  visitedAt: number;
}

const STORAGE_KEY = 'slgrvtrs:recent';
const MAX_ITEMS = 8;

function loadRecent(): RecentSeat[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveRecent(items: RecentSeat[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota errors */
  }
}

/** Push a seat onto the recent list (newest first, deduped, capped). */
export function pushRecent(seat: { code: string; name: string; type: 'parliament' | 'dun' | 'dm' }) {
  if (typeof window === 'undefined') return;
  const cur = loadRecent();
  const next = [{ ...seat, visitedAt: Date.now() }, ...cur.filter((s) => s.code !== seat.code)].slice(0, MAX_ITEMS);
  saveRecent(next);
  // Notify subscribers — same-tab updates.
  window.dispatchEvent(new CustomEvent('slgrvtrs:recent-updated', { detail: next }));
}

interface RecentlyViewedProps {
  open: boolean;
  onClose: () => void;
  onFlyTo: (code: string, type: 'parliament' | 'dun') => void;
  onClear?: () => void;
}

export default function RecentlyViewed({ open, onClose, onFlyTo, onClear }: RecentlyViewedProps) {
  const [items, setItems] = useState<RecentSeat[]>(() => loadRecent());

  // Listen for cross-component updates from `pushRecent`.
  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as RecentSeat[] | undefined;
      if (Array.isArray(detail)) setItems(detail);
      else setItems(loadRecent());
    };
    window.addEventListener('slgrvtrs:recent-updated', handler);
    // Refresh on open in case localStorage was mutated elsewhere — deferred
    // to a microtask so we don't trigger a synchronous cascading render.
    queueMicrotask(() => setItems(loadRecent()));
    return () => window.removeEventListener('slgrvtrs:recent-updated', handler);
  }, [open]);

  const clearAll = useCallback(() => {
    saveRecent([]);
    setItems([]);
    onClear?.();
  }, [onClear]);

  if (!open) return null;

  const fmtTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-slide-up">
        <div className="px-4 py-3 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 border-b border-violet-100">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Recently Viewed
            </h4>
            {items.length > 0 && (
              <button
                onClick={clearAll}
                className="text-[10px] text-violet-100 hover:text-white font-medium transition-colors"
                aria-label="Clear all recent items"
              >
                Clear all
              </button>
            )}
          </div>
          <p className="text-[10px] text-violet-100 mt-0.5">Last {MAX_ITEMS} constituencies you visited</p>
        </div>

        <div className="p-2 max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <svg className="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-xs">No history yet</p>
              <p className="text-[10px] mt-1 text-slate-400">Click any seat on the map to start tracking</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {items.map((item, idx) => (
                <button
                  key={`${item.code}-${item.visitedAt}`}
                  onClick={() => {
                    if (item.type === 'dm') return; // DMs don't have a flyTo path
                    onFlyTo(item.code, item.type);
                    onClose();
                  }}
                  disabled={item.type === 'dm'}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-left group ${
                    item.type === 'dm'
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-violet-50 cursor-pointer'
                  } ${idx === 0 ? 'bg-violet-50/40' : ''}`}
                >
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${
                    item.type === 'parliament' ? 'bg-emerald-100 text-emerald-700' :
                    item.type === 'dun' ? 'bg-teal-100 text-teal-700' :
                    'bg-rose-100 text-rose-700'
                  }`}>
                    {item.type === 'parliament' ? 'PARL' : item.type === 'dun' ? 'DUN' : 'DM'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-800 font-semibold">{item.code}</span>
                      {idx === 0 && (
                        <span className="text-[8px] px-1 py-0.5 rounded-full bg-violet-200 text-violet-700 font-semibold uppercase tracking-wide">
                          Latest
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">{item.name}</div>
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono flex-shrink-0">{fmtTime(item.visitedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <p className="text-[9px] text-slate-400">History stays in your browser</p>
          <span className="text-[9px] text-slate-400 font-mono">{items.length}/{MAX_ITEMS}</span>
        </div>
      </div>
    </>
  );
}
