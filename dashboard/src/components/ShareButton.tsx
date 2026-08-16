'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface ShareButtonProps {
  /** Called to get the current map state (center, zoom, metric, selection) */
  getState: () => {
    lng: number;
    lat: number;
    zoom: number;
    metric: string;
    parl?: string | null;
  };
}

/**
 * Floating "Share" button that encodes the current map view + active metric
 * into the URL hash and copies a shareable link to the clipboard.
 *
 * Hash format: #m=<metric>&lng=<lng>&lat=<lat>&z=<zoom>&p=<parl>
 */
export default function ShareButton({ getState }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const buildUrl = useCallback(() => {
    const s = getState();
    const hash = `#m=${encodeURIComponent(s.metric)}&lng=${s.lng.toFixed(4)}&lat=${s.lat.toFixed(4)}&z=${s.zoom.toFixed(1)}${s.parl ? `&p=${encodeURIComponent(s.parl)}` : ''}`;
    return `${window.location.origin}${window.location.pathname}${hash}`;
  }, [getState]);

  const copyLink = useCallback(async () => {
    const url = buildUrl();
    // Update the URL hash in-place so the user can also just copy from the address bar.
    try {
      window.history.replaceState(null, '', url.substring(url.indexOf('#')));
    } catch { /* ignore */ }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: select the URL in a text input for manual copy
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
      document.body.removeChild(input);
    }
  }, [buildUrl]);

  // Close on outside click (proper effect, not render-time)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="group relative w-10 h-10 rounded-lg shadow-md hover:shadow-lg border transition-all flex items-center justify-center bg-white/90 backdrop-blur-sm text-slate-600 border-slate-200/80 hover:bg-white hover:text-cyan-600"
        aria-label="Share this view"
        title="Share this view"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg">
          Share view
        </div>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 border-b border-cyan-100">
            <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              Share this view
            </h4>
            <p className="text-[10px] text-cyan-50 mt-0.5">Copy a link to the current map state</p>
          </div>
          <div className="p-3 space-y-2">
            <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
              <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">Current view</div>
              <div className="text-[10px] text-slate-600 font-mono break-all" id="share-url-preview">
                {buildUrl().substring(buildUrl().indexOf('#'))}
              </div>
            </div>
            <button
              onClick={copyLink}
              className={`w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all shadow-sm ${copied ? 'bg-emerald-500 text-white' : 'bg-cyan-500 text-white hover:bg-cyan-600'}`}
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Copied to clipboard!
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  Copy shareable link
                </>
              )}
            </button>
            <p className="text-[9px] text-slate-400 text-center leading-relaxed">
              Link encodes map center, zoom level, active metric, and selected parliament.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
