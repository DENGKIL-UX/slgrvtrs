'use client';

import { type ColorScale } from '@/lib/map/color-scales';

interface LegendProps {
  scale: ColorScale;
}

export default function Legend({ scale }: LegendProps) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
        {scale.label}
      </h3>
      {scale.dunApplicable === false && (
        <p className="text-[9px] text-amber-600 mb-1.5 bg-amber-50 px-2 py-0.5 rounded">DUN: constant value</p>
      )}
      <div className="relative">
        {/* Gradient bar */}
        <div
          className="h-3 rounded-full overflow-hidden border border-slate-200/80"
          style={{
            background: `linear-gradient(to right, ${scale.stops.map(([, c]) => c).join(', ')})`,
          }}
        />
        {/* Labels */}
        <div className="flex justify-between mt-1">
          {scale.legendLabels.map((label, i) => (
            <span key={i} className="text-[9px] text-slate-500 font-medium tabular-nums">
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
