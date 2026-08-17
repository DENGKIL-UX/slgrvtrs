'use client';

import { useState, useEffect, useCallback } from 'react';

interface KeyboardShortcutsProps {
  /** Map of shortcut key → description */
  shortcuts?: { key: string; desc: string; group?: string }[];
}

const DEFAULT_SHORTCUTS: { key: string; desc: string; group?: string }[] = [
  { key: '/', desc: 'Focus search bar', group: 'Navigation' },
  { key: '1', desc: 'Switch to Layers tab', group: 'Navigation' },
  { key: '2', desc: 'Switch to Metrics tab', group: 'Navigation' },
  { key: '3', desc: 'Switch to Compare tab', group: 'Navigation' },
  { key: 'A', desc: 'Toggle Analytics drawer', group: 'Drawers' },
  { key: 'I', desc: 'Toggle AI Insights panel', group: 'Drawers' },
  { key: 'R', desc: 'Toggle Ranking table', group: 'Drawers' },
  { key: 'B', desc: 'Toggle Bookmarks menu', group: 'Drawers' },
  { key: 'H', desc: 'Toggle Recently Viewed history', group: 'Drawers' },
  { key: 'D', desc: 'Open Data Table explorer', group: 'Drawers' },
  { key: 'P', desc: 'Capture map as PNG screenshot', group: 'Drawers' },
  { key: 'F', desc: 'Toggle fullscreen map', group: 'View' },
  { key: 'T', desc: 'Toggle Theme (light/dark)', group: 'View' },
  { key: 'S', desc: 'Open Share menu', group: 'View' },
  { key: 'C', desc: 'Clear current selection', group: 'View' },
  { key: 'Esc', desc: 'Close any open drawer/popup', group: 'View' },
  { key: '?', desc: 'Show this shortcuts overlay', group: 'Help' },
];

/**
 * Floating "?" button that opens a keyboard-shortcuts overlay.
 * Also registers global keydown handlers for the shortcuts.
 */
export default function KeyboardShortcuts({ shortcuts = DEFAULT_SHORTCUTS }: KeyboardShortcutsProps) {
  const [open, setOpen] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Register "?" to toggle this overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        // Only trigger if not typing in an input
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Group shortcuts by group
  const grouped = shortcuts.reduce<Record<string, typeof shortcuts>>((acc, s) => {
    const g = s.group || 'Other';
    if (!acc[g]) acc[g] = [];
    acc[g].push(s);
    return acc;
  }, {});

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="group absolute bottom-3 left-1/2 translate-x-[120px] z-10 w-8 h-8 rounded-full bg-white/85 backdrop-blur-sm shadow-md border border-slate-200/60 hover:bg-white hover:shadow-lg transition-all flex items-center justify-center text-slate-500 hover:text-slate-700"
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (press ?)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full ring-2 ring-white animate-live-pulse opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col animate-[slideUp_0.3s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex-shrink-0 bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center backdrop-blur-sm ring-1 ring-white/20">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white tracking-tight">Keyboard Shortcuts</h2>
                  <p className="text-[10px] text-slate-300">Power-user shortcuts for faster navigation</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/15 transition-colors text-white"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Shortcuts list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-1 h-3 bg-gradient-to-b from-emerald-400 to-teal-600 rounded-full" />
                    {group}
                  </h3>
                  <div className="space-y-1.5">
                    {items.map((s) => (
                      <div key={s.key} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors">
                        <span className="text-xs text-slate-600">{s.desc}</span>
                        <kbd className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 text-[10px] font-bold font-mono text-slate-700 bg-slate-100 border border-slate-300 rounded shadow-sm">
                          {s.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <p className="text-[10px] text-slate-400">Press <kbd className="px-1 py-0.5 text-[9px] font-mono bg-slate-200 rounded">Esc</kbd> to close</p>
              <p className="text-[10px] text-slate-400">SLGRVTRS · v1.0</p>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </>
  );
}
