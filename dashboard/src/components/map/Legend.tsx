'use client';

import { type ColorScale } from '@/lib/map/color-scales';

interface LegendProps {
  scale: ColorScale;
}

export default function Legend({ scale }: LegendProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
        {scale.label}
      </h3>
      {scale.dunApplicable === false && (
        <p className="text-[9px] text-amber-600 mb-1">DUN: constant value</p>
      )}
      <div className="space-y-1">
        {scale.stops.map(([value, color], i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="w-5 h-3 rounded-sm flex-shrink-0 border border-slate-200"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-slate-700">
              {scale.legendLabels[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
