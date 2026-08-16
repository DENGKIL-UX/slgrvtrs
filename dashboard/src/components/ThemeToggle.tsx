'use client';

import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark';
export type BasemapStyle = 'light' | 'dark' | 'satellite';

interface ThemeToggleProps {
  /** Controlled theme — lifted to MapDashboard so keyboard T + this button stay in sync */
  theme: Theme;
  /** Controlled basemap style */
  basemap: BasemapStyle;
  /** Called when the theme changes */
  onThemeChange: (theme: Theme) => void;
  /** Called when the basemap style changes */
  onBasemapChange: (style: BasemapStyle) => void;
}

export const THEME_STORAGE_KEY = 'slgrvtrs:theme';
export const BASEMAP_STORAGE_KEY = 'slgrvtrs:basemap';

/**
 * Floating theme + basemap toggle (controlled component).
 *
 * State is lifted to the parent (MapDashboard) so that both the keyboard
 * "T" shortcut and this button stay in sync. This component only renders
 * the UI and fires callbacks.
 */
export default function ThemeToggle({ theme, basemap, onThemeChange, onBasemapChange }: ThemeToggleProps) {
  const [open, setOpen] = useState(false);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-theme-toggle]')) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelectTheme = (t: Theme) => {
    onThemeChange(t);
    try { localStorage.setItem(THEME_STORAGE_KEY, t); } catch { /* ignore */ }
    // If switching to dark, also switch basemap to dark (unless satellite)
    if (t === 'dark' && basemap === 'light') {
      onBasemapChange('dark');
      try { localStorage.setItem(BASEMAP_STORAGE_KEY, 'dark'); } catch { /* ignore */ }
    } else if (t === 'light' && basemap === 'dark') {
      onBasemapChange('light');
      try { localStorage.setItem(BASEMAP_STORAGE_KEY, 'light'); } catch { /* ignore */ }
    }
  };

  const handleSelectBasemap = (style: BasemapStyle) => {
    onBasemapChange(style);
    try { localStorage.setItem(BASEMAP_STORAGE_KEY, style); } catch { /* ignore */ }
  };

  return (
    <div className="relative" data-theme-toggle>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={`group relative w-10 h-10 rounded-lg shadow-md hover:shadow-lg border transition-all flex items-center justify-center overflow-hidden ${
          theme === 'dark'
            ? 'bg-slate-800 text-amber-300 border-slate-600 hover:bg-slate-700'
            : 'bg-white/90 backdrop-blur-sm text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-900'
        }`}
        aria-label="Toggle theme and basemap"
        title="Theme & basemap"
      >
        {theme === 'dark' ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        )}
        <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg">
          Theme & basemap
        </div>
      </button>

      {open && (
        <div className={`absolute top-full right-0 mt-2 w-64 rounded-xl shadow-2xl border z-50 overflow-hidden ${theme === 'dark' ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'}`}>
          {/* Theme section */}
          <div className={`px-4 py-3 border-b ${theme === 'dark' ? 'bg-slate-700/50 border-slate-600' : 'bg-gradient-to-r from-slate-50 to-white border-slate-100'}`}>
            <h4 className={`text-xs font-semibold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}`}>UI Theme</h4>
            <p className={`text-[10px] mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}>Switch between light and dark mode</p>
          </div>
          <div className="p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleSelectTheme('light')}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border-2 transition-all ${
                  theme === 'light'
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                    : theme === 'dark'
                      ? 'border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                <span className="text-[10px] font-semibold">Light</span>
              </button>
              <button
                onClick={() => handleSelectTheme('dark')}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border-2 transition-all ${
                  theme === 'dark'
                    ? 'border-violet-400 bg-violet-50 text-violet-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                <span className="text-[10px] font-semibold">Dark</span>
              </button>
            </div>
          </div>

          {/* Basemap section */}
          <div className={`px-4 py-3 border-t ${theme === 'dark' ? 'bg-slate-700/50 border-slate-600' : 'bg-gradient-to-r from-slate-50 to-white border-slate-100'}`}>
            <h4 className={`text-xs font-semibold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}`}>Map Style</h4>
            <p className={`text-[10px] mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}>Background basemap color</p>
          </div>
          <div className="p-3 space-y-1.5">
            {([
              { id: 'light' as const, label: 'Light', desc: 'Soft blue-gray', color: '#f0f4f8' },
              { id: 'dark' as const, label: 'Dark', desc: 'Slate-900', color: '#0f172a' },
              { id: 'satellite' as const, label: 'Satellite', desc: 'ESRI World Imagery', color: 'linear-gradient(135deg, #1e3a5f, #2d5016)' },
            ]).map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleSelectBasemap(opt.id)}
                className={`w-full flex items-center gap-2.5 p-2 rounded-lg border transition-all ${
                  basemap === opt.id
                    ? theme === 'dark'
                      ? 'border-emerald-400 bg-emerald-900/20'
                      : 'border-emerald-400 bg-emerald-50'
                    : theme === 'dark'
                      ? 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-md border border-slate-300/50 flex-shrink-0 shadow-sm"
                  style={{ background: opt.color }}
                />
                <div className="flex-1 text-left">
                  <div className={`text-xs font-semibold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}`}>{opt.label}</div>
                  <div className={`text-[9px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}>{opt.desc}</div>
                </div>
                {basemap === opt.id && (
                  <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                )}
              </button>
            ))}
          </div>
          <div className={`px-3 py-2 border-t ${theme === 'dark' ? 'border-slate-600 bg-slate-800' : 'border-slate-100 bg-slate-50/50'}`}>
            <p className={`text-[9px] text-center ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>Choice saved in your browser</p>
          </div>
        </div>
      )}
    </div>
  );
}
