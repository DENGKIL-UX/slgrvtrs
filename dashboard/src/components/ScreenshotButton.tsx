'use client';

import { useState, useCallback, useEffect } from 'react';

interface ScreenshotButtonProps {
  /** Returns the MapLibre map instance (or null if not ready). */
  getMap: () => any | null;
  /** Optional filename prefix. Defaults to "slgrvtrs-map". */
  filenamePrefix?: string;
  /** Visual style: 'floating' (toolbar button) or 'inline' (small button). */
  variant?: 'floating' | 'inline';
  onToast?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

/**
 * Captures the current MapLibre canvas as a PNG and triggers a download.
 *
 * MapLibre renders into a WebGL canvas. To include it in a screenshot we need
 * to call `preserveDrawingBuffer: true` at map init OR re-render and capture
 * immediately. We try the simple path first; if the canvas is tainted (empty),
 * we prompt the user to re-click.
 *
 * The captured PNG includes the current map view only (no React overlay UI).
 * The file is named with a timestamp so multiple captures don't overwrite.
 *
 * Listens for the global `slgrvtrs:screenshot` event so other components
 * (e.g. the keyboard-shortcut handler) can trigger a capture without needing
 * a direct ref to this button.
 */
export default function ScreenshotButton({
  getMap,
  filenamePrefix = 'slgrvtrs-map',
  variant = 'floating',
  onToast,
}: ScreenshotButtonProps) {
  const [busy, setBusy] = useState(false);

  const capture = useCallback(async () => {
    const map = getMap();
    if (!map) {
      onToast?.('Map not ready yet', 'warning');
      return;
    }
    setBusy(true);
    try {
      // Force a synchronous redraw so the drawing buffer is fresh.
      // MapLibre exposes `painter` and `render()` but the public `triggerRepaint`
      // + `once('render', ...)` combo is the documented pattern.
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        map.once('render', done);
        map.triggerRepaint();
        // Fallback: don't hang forever if render doesn't fire.
        setTimeout(done, 500);
      });

      const canvas: HTMLCanvasElement = map.getCanvas();
      if (!canvas) throw new Error('Map canvas unavailable');

      // Try to export directly. If WebGL context wasn't created with
      // preserveDrawingBuffer:true, this throws or returns a blank image.
      let dataUrl: string;
      try {
        dataUrl = canvas.toDataURL('image/png');
        // Heuristic: blank WebGL canvases return a tiny data URL (~3KB).
        // A real map screenshot is usually >50KB.
        if (dataUrl.length < 5000) {
          throw new Error('empty-canvas');
        }
      } catch {
        // Fallback: clone the canvas into a 2D context and re-draw it.
        // This works even without preserveDrawingBuffer because we read
        // the framebuffer immediately after a forced render.
        const tmp = document.createElement('canvas');
        tmp.width = canvas.width;
        tmp.height = canvas.height;
        const ctx = tmp.getContext('2d');
        if (!ctx) throw new Error('2D context unavailable');
        ctx.drawImage(canvas, 0, 0);
        dataUrl = tmp.toDataURL('image/png');
        if (dataUrl.length < 5000) {
          throw new Error('Canvas is blank — try clicking again after moving the map');
        }
      }

      // Trigger download.
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = dataUrl;
      a.download = `${filenamePrefix}-${ts}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      onToast?.('Map screenshot saved', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Screenshot failed';
      onToast?.(msg, 'error');
    } finally {
      setBusy(false);
    }
  }, [getMap, filenamePrefix, onToast]);

  // Listen for global screenshot trigger (e.g. from keyboard shortcut 'P').
  useEffect(() => {
    const handler = () => { void capture(); };
    window.addEventListener('slgrvtrs:screenshot', handler);
    return () => window.removeEventListener('slgrvtrs:screenshot', handler);
  }, [capture]);

  if (variant === 'inline') {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); capture(); }}
        disabled={busy}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold rounded-md bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        title="Save the current map view as a PNG image"
      >
        {busy ? (
          <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth="3" className="opacity-25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
        {busy ? 'Capturing…' : 'Screenshot'}
      </button>
    );
  }

  // Floating toolbar button — matches the visual style of ToolButton in MapDashboard.
  return (
    <button
      onClick={(e) => { e.stopPropagation(); capture(); }}
      disabled={busy}
      className="group relative w-10 h-10 rounded-lg shadow-md hover:shadow-lg border transition-all flex items-center justify-center overflow-hidden bg-white/90 backdrop-blur-sm text-slate-600 border-slate-200/80 hover:bg-white hover:text-violet-700 disabled:opacity-50"
      aria-label="Capture map as PNG"
      title="Save current map as PNG"
    >
      {busy ? (
        <svg className="w-4 h-4 animate-spin text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth="3" className="opacity-25" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
      <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg flex flex-col">
        <span className="font-medium">Screenshot map</span>
        <span className="text-slate-300 text-[9px]">Save current view as PNG</span>
      </div>
    </button>
  );
}
