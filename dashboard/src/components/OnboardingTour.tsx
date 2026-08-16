'use client';

import { useState, useEffect, useCallback } from 'react';

interface TourStep {
  target: string; // CSS selector for the element to highlight
  title: string;
  body: string;
  placement: 'bottom' | 'left' | 'top' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'input[placeholder*="Search"]',
    title: 'Search Constituencies',
    body: 'Find any Parliament (P.xxx) or DUN (N.xx) by code or name. The map flies to it and auto-opens a popup with full stats.',
    placement: 'bottom',
  },
  {
    target: 'button[aria-label="Toggle sidebar"]',
    title: 'Sidebar & Tabs',
    body: 'Toggle the sidebar. Use Layers / Metrics / Compare tabs to switch between layer controls, export settings, and seat comparison.',
    placement: 'right',
  },
  {
    target: 'div[class*="top-3"][class*="right-3"][class*="flex-col"]',
    title: 'Feature Toolbar',
    body: '6 floating buttons: Analytics (charts), AI Insights (LLM), Ranking (sort), Bookmarks (save), Share (URL), Theme (dark mode). Hover for tooltips.',
    placement: 'left',
  },
  {
    target: 'button[aria-label="Keyboard shortcuts"]',
    title: 'Keyboard Shortcuts',
    body: 'Press ? to see all shortcuts. Try / (search), T (theme), A (analytics), 1/2/3 (tabs), Esc (close).',
    placement: 'top',
  },
];

const STORAGE_KEY = 'slgrvtrs:tour-completed';

/**
 * First-visit onboarding tour.
 * Shows a spotlight + tooltip for each toolbar feature.
 * Only runs once per browser (localStorage flag).
 */
export default function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Start tour on first visit
  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      // Delay to let the map + UI fully render
      const timer = setTimeout(() => setActive(true), 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Update target rect when step changes
  useEffect(() => {
    if (!active) return;
    const step = TOUR_STEPS[stepIdx];
    if (!step) return;
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => setTargetRect(el.getBoundingClientRect()), 300);
    } else {
      // Defer to avoid setState-in-effect cascade
      queueMicrotask(() => setTargetRect(null));
    }
  }, [active, stepIdx]);

  const finish = useCallback(() => {
    setActive(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
  }, []);

  const next = useCallback(() => {
    if (stepIdx < TOUR_STEPS.length - 1) {
      setStepIdx((i) => i + 1);
    } else {
      finish();
    }
  }, [stepIdx, finish]);

  const prev = useCallback(() => {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  }, [stepIdx]);

  const skip = useCallback(() => {
    setActive(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
  }, []);

  if (!active || !targetRect) return null;

  const step = TOUR_STEPS[stepIdx];
  const padding = 8;

  // Tooltip position based on placement
  const tooltipStyle: React.CSSProperties = {};
  if (step.placement === 'bottom') {
    tooltipStyle.top = targetRect.bottom + 16;
    tooltipStyle.left = targetRect.left + targetRect.width / 2;
    tooltipStyle.transform = 'translateX(-50%)';
  } else if (step.placement === 'top') {
    tooltipStyle.top = targetRect.top - 16;
    tooltipStyle.left = targetRect.left + targetRect.width / 2;
    tooltipStyle.transform = 'translate(-50%, -100%)';
  } else if (step.placement === 'left') {
    tooltipStyle.top = targetRect.top + targetRect.height / 2;
    tooltipStyle.left = targetRect.left - 16;
    tooltipStyle.transform = 'translate(-100%, -50%)';
  } else {
    tooltipStyle.top = targetRect.top + targetRect.height / 2;
    tooltipStyle.left = targetRect.right + 16;
    tooltipStyle.transform = 'translateY(-50%)';
  }

  return (
    <>
      {/* Dark overlay with cutout */}
      <div className="fixed inset-0 z-[60] pointer-events-none" style={{
        background: `rgba(0,0,0,0.55)`,
        // SVG cutout using mask
        WebkitMaskImage: `radial-gradient(circle at ${targetRect.left + targetRect.width/2}px ${targetRect.top + targetRect.height/2}px, transparent ${Math.max(targetRect.width, targetRect.height)/2 + padding}px, black ${Math.max(targetRect.width, targetRect.height)/2 + padding + 4}px)`,
        maskImage: `radial-gradient(circle at ${targetRect.left + targetRect.width/2}px ${targetRect.top + targetRect.height/2}px, transparent ${Math.max(targetRect.width, targetRect.height)/2 + padding}px, black ${Math.max(targetRect.width, targetRect.height)/2 + padding + 4}px)`,
      }} />

      {/* Highlight ring around target */}
      <div
        className="fixed z-[61] pointer-events-none ring-2 ring-emerald-400 ring-offset-2 ring-offset-transparent rounded-lg"
        style={{
          top: targetRect.top - 4,
          left: targetRect.left - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          borderRadius: 8,
        }}
      />

      {/* Tooltip card */}
      <div
        className="fixed z-[62] bg-white rounded-xl shadow-2xl border border-slate-200 w-72 p-4 animate-[slideUp_0.25s_ease-out]"
        style={tooltipStyle}
      >
        {/* Progress dots */}
        <div className="flex items-center gap-1 mb-2">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${i === stepIdx ? 'w-6 bg-emerald-500' : i < stepIdx ? 'w-1.5 bg-emerald-300' : 'w-1.5 bg-slate-200'}`}
            />
          ))}
        </div>
        <h3 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-1.5">
          <span className="w-1 h-4 bg-gradient-to-b from-emerald-400 to-teal-600 rounded-full" />
          {step.title}
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed mb-3">{step.body}</p>
        <div className="flex items-center justify-between">
          <button
            onClick={skip}
            className="text-[10px] text-slate-400 hover:text-slate-600 font-medium"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                onClick={prev}
                className="px-3 py-1.5 text-[10px] font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="px-3 py-1.5 text-[10px] font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-1"
            >
              {stepIdx === TOUR_STEPS.length - 1 ? 'Done' : 'Next'}
              {stepIdx < TOUR_STEPS.length - 1 && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              )}
            </button>
          </div>
        </div>
        <div className="text-[9px] text-slate-400 mt-2 text-center">
          Step {stepIdx + 1} of {TOUR_STEPS.length}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </>
  );
}
