'use client';

import { type ColorScale } from '@/lib/map/color-scales';

interface LegendProps {
  scale: ColorScale;
  /** When true, show heatmap gradient (red-orange) instead of choropleth colors */
  heatmapMode?: boolean;
}

// Heatmap color stops (matches the MapDashboard heatmap gradient)
const HEATMAP_COLORS = [
  'rgba(255,239,213,0.8)',   // min — light beige
  'rgba(255,200,100,0.85)',  // 25% — light orange
  'rgba(255,140,0,0.9)',    // 50% — orange
  'rgba(255,69,0,0.95)',    // 75% — red-orange
  'rgba(178,34,34,1)',      // max — dark red
];

export default function Legend({ scale, heatmapMode = false }: LegendProps) {
  // In heatmap mode, use the heatmap gradient (red-orange) with the same
  // labels as the choropleth scale (so the value ranges still make sense).
  const gradientColors = heatmapMode
    ? HEATMAP_COLORS.join(', ')
    : scale.stops.map(([, c]) => c).join(', ');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${heatmapMode ? 'text-rose-700' : 'text-slate-700'}`}>
          <span className={`w-1 h-3 rounded-full ${heatmapMode ? 'bg-gradient-to-b from-rose-400 to-red-700' : 'bg-gradient-to-b from-emerald-400 to-teal-600'}`} />
          {scale.label}
          {heatmapMode && (
            <span className="text-[8px] text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full font-semibold ring-1 ring-rose-200 ml-1">
              HEATMAP
            </span>
          )}
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
              background: `linear-gradient(to right, ${gradientColors})`,
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
          <span className={`text-[8px] uppercase tracking-wider ${heatmapMode ? 'text-rose-300' : 'text-slate-300'}`}>Low</span>
          <span className={`text-[8px] uppercase tracking-wider ${heatmapMode ? 'text-red-400' : 'text-slate-300'}`}>High</span>
        </div>
      </div>
    </div>
  );
}
