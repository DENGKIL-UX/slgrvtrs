'use client';

import { useState, useCallback } from 'react';

type InsightType = 'state' | 'parliament' | 'dun' | 'dm';

interface AiInsightsPanelProps {
  open: boolean;
  onClose: () => void;
  /** Current selection, if any */
  selection: { type: InsightType; code: string | null; label: string } | null;
}

interface InsightResponse {
  label: string;
  type: InsightType;
  code: string | null;
  bullets: string[];
}

export default function AiInsightsPanel({ open, onClose, selection }: AiInsightsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InsightResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const target = selection ?? { type: 'state' as InsightType, code: null, label: 'Selangor (statewide)' };

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: target.type, code: target.code }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as InsightResponse;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate insights');
    } finally {
      setLoading(false);
    }
  }, [target]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40 animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white shadow-2xl z-50 flex flex-col animate-[slideInRight_0.25s_ease-out] border-l border-slate-200"
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">AI Insights</h2>
              <p className="text-[10px] text-purple-100">LLM-generated analysis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white"
            aria-label="Close insights"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Target selector display */}
          <div className="mb-3 bg-violet-50 rounded-lg p-3 border border-violet-100">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-violet-600 mb-1">Analyzing</div>
            <div className="flex items-center gap-2">
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${target.type === 'state' ? 'bg-violet-200 text-violet-800' : target.type === 'parliament' ? 'bg-emerald-100 text-emerald-700' : target.type === 'dun' ? 'bg-teal-100 text-teal-700' : 'bg-rose-100 text-rose-700'}`}>
                {target.type === 'state' ? 'STATE' : target.type === 'parliament' ? 'PARL' : target.type === 'dun' ? 'DUN' : 'DM'}
              </span>
              <span className="text-xs font-semibold text-slate-800">{target.label}</span>
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-lg transition-all bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-md mb-4"
          >
            {loading ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating insights…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate AI Insights
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="mb-3 bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-start gap-2">
              <svg className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-xs font-medium text-rose-700">Failed to generate</p>
                <p className="text-[10px] text-rose-600 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-2 animate-[fadeIn_0.3s_ease-out]">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {result.bullets.length} insights for {result.label}
              </div>
              {result.bullets.map((b, i) => (
                <div
                  key={i}
                  className="bg-white rounded-lg border border-slate-100 p-3 shadow-sm flex gap-2.5 hover:shadow-md transition-shadow"
                >
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{b}</p>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && !result && !error && (
            <div className="text-center py-8 text-slate-400">
              <svg className="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <p className="text-xs">Click "Generate" to analyze</p>
              <p className="text-[10px] text-slate-400 mt-1">{target.label} with the LLM</p>
            </div>
          )}

          <p className="text-[9px] text-slate-400 text-center pt-4 leading-relaxed">
            Insights are generated by an LLM from the voter statistics JSON. Always verify against the source data.
          </p>
        </div>
      </aside>

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
    </>
  );
}
