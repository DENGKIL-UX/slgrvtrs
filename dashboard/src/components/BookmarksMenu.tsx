'use client';

import { useState, useCallback } from 'react';

export interface Bookmark {
  code: string;
  name: string;
  type: 'parliament' | 'dun';
  savedAt: number;
}

const STORAGE_KEY = 'slgrvtrs:bookmarks';

function loadBookmarks(): Bookmark[] {
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

function saveBookmarks(bm: Bookmark[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bm));
  } catch {
    /* ignore quota errors */
  }
}

interface BookmarksMenuProps {
  open: boolean;
  onClose: () => void;
  currentCode: string | null;
  currentName: string | null;
  currentType: 'parliament' | 'dun' | null;
  onFlyTo: (code: string, type: 'parliament' | 'dun') => void;
}

export default function BookmarksMenu({
  open, onClose, currentCode, currentName, currentType, onFlyTo,
}: BookmarksMenuProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarks());
  const [justSaved, setJustSaved] = useState(false);

  const canSaveCurrent = !!(currentCode && currentName && currentType && (currentType === 'parliament' || currentType === 'dun'));

  const save = useCallback(() => {
    if (!canSaveCurrent || !currentCode || !currentName || !currentType) return;
    setBookmarks((prev) => {
      if (prev.some((b) => b.code === currentCode)) return prev;
      const next = [{ code: currentCode, name: currentName, type: currentType, savedAt: Date.now() }, ...prev];
      saveBookmarks(next);
      return next;
    });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
  }, [canSaveCurrent, currentCode, currentName, currentType]);

  const remove = useCallback((code: string) => {
    setBookmarks((prev) => {
      const next = prev.filter((b) => b.code !== code);
      saveBookmarks(next);
      return next;
    });
  }, []);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 border-b border-amber-100">
          <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Bookmarks
          </h4>
          <p className="text-[10px] text-amber-50 mt-0.5">Save seats to revisit quickly</p>
        </div>

        <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
          {/* Save current */}
          <button
            onClick={save}
            disabled={!canSaveCurrent}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all bg-amber-500 text-white hover:bg-amber-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed shadow-sm"
          >
            {justSaved ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Saved!
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Save current view
              </>
            )}
          </button>
          {!canSaveCurrent && (
            <p className="text-[10px] text-slate-400 text-center">Click a parliament or DUN first to save it</p>
          )}

          {/* List */}
          {bookmarks.length === 0 ? (
            <div className="text-center py-6 text-slate-400">
              <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <p className="text-xs">No bookmarks yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {bookmarks.map((b) => (
                <div
                  key={b.code}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-amber-50 transition-colors group"
                >
                  <button
                    onClick={() => { onFlyTo(b.code, b.type); onClose(); }}
                    className="flex items-center gap-2 flex-1 text-left min-w-0"
                  >
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${b.type === 'parliament' ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-100 text-teal-700'}`}>
                      {b.type === 'parliament' ? 'PARL' : 'DUN'}
                    </span>
                    <span className="text-xs text-slate-700 font-medium flex-shrink-0">{b.code}</span>
                    <span className="text-[10px] text-slate-400 truncate">{b.name}</span>
                  </button>
                  <button
                    onClick={() => remove(b.code)}
                    className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                    aria-label={`Remove ${b.code}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/50">
          <p className="text-[9px] text-slate-400 text-center">Stored locally in your browser</p>
        </div>
      </div>
    </>
  );
}
