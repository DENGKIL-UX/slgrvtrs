'use client';

import { type ColorScale } from '@/lib/map/color-scales';

interface LegendProps {
  scale: ColorScale;
}

export default function Legend({ scale }: LegendProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-1 h-3 bg-gradient-to-b from-emerald-400 to-teal-600 rounded-full" />
          {scale.label}
        </h3>
        {scale.dunApplicable === false && (
          <span className="text-[8px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full font-semibold ring-1 ring-amber-200">
            DUN: N/A
          </span>
        )}
      </div>
      <div className="relative">
        {/* Gradient bar with tick marks */}
        <div className="relative">
          <div
            className="h-4 rounded-md overflow-hidden border border-slate-200/80 shadow-inner"
            style={{
              background: `linear-gradient(to right, ${scale.stops.map(([, c]) => c).join(', ')})`,
            }}
          />
          {/* Tick marks under the bar */}
          <div className="absolute inset-x-0 top-full flex justify-between px-px">
            {scale.stops.map((_, i) => (
              <div key={i} className="w-px h-1 bg-slate-300" />
            ))}
          </div>
        </div>
        {/* Labels */}
        <div className="flex justify-between mt-1.5">
          {scale.legendLabels.map((label, i) => (
            <span
              key={i}
              className={`text-[9px] font-medium tabular-nums ${i === 0 ? 'text-slate-400' : i === scale.legendLabels.length - 1 ? 'text-slate-600' : 'text-slate-500'}`}
            >
              {label}
            </span>
          ))}
        </div>
        {/* Low / High indicators */}
        <div className="flex justify-between mt-0.5">
          <span className="text-[8px] text-slate-300 uppercase tracking-wider">Low</span>
          <span className="text-[8px] text-slate-300 uppercase tracking-wider">High</span>
        </div>
      </div>
    </div>
  );
}
