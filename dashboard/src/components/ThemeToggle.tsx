'use client';

import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';
type BasemapStyle = 'light' | 'dark' | 'satellite';

interface ThemeToggleProps {
  /** Called when the theme changes; the MapDashboard switches the map background color */
  onThemeChange?: (theme: Theme) => void;
  /** Called when the basemap style changes */
  onBasemapChange?: (style: BasemapStyle) => void;
}

const STORAGE_KEY = 'slgrvtrs:theme';
const BASEMAP_KEY = 'slgrvtrs:basemap';

/**
 * Floating theme + basemap toggle.
 *
 * - Cycles light → dark for the UI (applies `.dark` class on <html>).
 * - Switches the map background color + layer opacity to match.
 * - Persists the choice in localStorage.
 */
export default function ThemeToggle({ onThemeChange, onBasemapChange }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>('light');
  const [basemap, setBasemap] = useState<BasemapStyle>('light');
  const [open, setOpen] = useState(false);

  const applyTheme = useCallback((t: Theme) => {
    if (typeof document === 'undefined') return;
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Load persisted theme on mount (deferred to avoid setState-in-effect cascade)
  useEffect(() => {
    const savedTheme = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) as Theme | null;
    const savedBasemap = (typeof window !== 'undefined' && localStorage.getItem(BASEMAP_KEY)) as BasemapStyle | null;
    if (savedTheme || savedBasemap) {
      queueMicrotask(() => {
        if (savedTheme) {
          setTheme(savedTheme);
          applyTheme(savedTheme);
          onThemeChange?.(savedTheme);
        }
        if (savedBasemap) {
          setBasemap(savedBasemap);
          onBasemapChange?.(savedBasemap);
        }
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    onThemeChange?.(next);
    // If switching to dark, also switch basemap to dark (unless satellite)
    if (next === 'dark' && basemap === 'light') {
      setBasemap('dark');
      try { localStorage.setItem(BASEMAP_KEY, 'dark'); } catch { /* ignore */ }
      onBasemapChange?.('dark');
    } else if (next === 'light' && basemap === 'dark') {
      setBasemap('light');
      try { localStorage.setItem(BASEMAP_KEY, 'light'); } catch { /* ignore */ }
      onBasemapChange?.('light');
    }
  }, [theme, basemap, applyTheme, onThemeChange, onBasemapChange]);

  const selectBasemap = useCallback((style: BasemapStyle) => {
    setBasemap(style);
    try { localStorage.setItem(BASEMAP_KEY, style); } catch { /* ignore */ }
    onBasemapChange?.(style);
  }, [onBasemapChange]);

  return (
    <div className="relative">
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
                onClick={() => { if (theme !== 'light') toggleTheme(); }}
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
                onClick={() => { if (theme !== 'dark') toggleTheme(); }}
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
              { id: 'satellite' as const, label: 'Satellite', desc: 'Imagery (coming soon)', color: 'linear-gradient(135deg, #1e3a5f, #2d5016)' },
            ]).map((opt) => (
              <button
                key={opt.id}
                onClick={() => selectBasemap(opt.id)}
                disabled={opt.id === 'satellite'}
                className={`w-full flex items-center gap-2.5 p-2 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
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
