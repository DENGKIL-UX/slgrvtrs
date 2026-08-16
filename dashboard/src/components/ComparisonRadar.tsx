'use client';

import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import type { ComparisonSeat } from '@/components/map/MapDashboard';

// ── Colors per seat index (max 3) ──────────────────────────

const SEAT_COLORS = ['#059669', '#7c3aed', '#db2777'];
const SEAT_NAMES = ['Seat 1', 'Seat 2', 'Seat 3'];

// ── Metric axes (normalized 0–100 for radar) ──────────────

interface AxisDef {
  key: string;
  label: string;
  // raw value → 0..100 normalized score (higher = "more")
  norm: (v: number) => number;
}

const AXES: AxisDef[] = [
  { key: 'total_voters', label: 'Voters', norm: (v) => Math.min(100, (v / 340000) * 100) },
  { key: 'malay_pct', label: 'Malay %', norm: (v) => v },
  { key: 'chinese_pct', label: 'Chinese %', norm: (v) => Math.min(100, (v / 70) * 100) },
  { key: 'indian_pct', label: 'Indian %', norm: (v) => Math.min(100, (v / 40) * 100) },
  { key: 'age_mean', label: 'Age', norm: (v) => Math.min(100, ((v - 35) / 15) * 100) },
  { key: 'contact_pct', label: 'Contact %', norm: (v) => Math.min(100, ((v - 70) / 15) * 100) },
];

// ── Component ──────────────────────────────────────────────

interface ComparisonRadarProps {
  seats: ComparisonSeat[];
}

export default function ComparisonRadar({ seats }: ComparisonRadarProps) {
  if (seats.length === 0) return null;

  // Build a single data array: one object per axis, with a field per seat.
  // (No useMemo — lint flagged the dynamic `seat${i}` keys as breaking memoization.)
  const data = AXES.map((axis) => {
    const row: Record<string, number | string> = { axis: axis.label };
    seats.forEach((seat, i) => {
      const raw = Number(seat.data[axis.key as keyof typeof seat.data]) || 0;
      row[`seat${i}`] = +axis.norm(raw).toFixed(1);
    });
    return row;
  });

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-slate-800">Multi-Axis Comparison</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Normalized 0–100 across 6 metrics</p>
        </div>
        <div className="flex items-center gap-1.5">
          {seats.map((seat, i) => (
            <span
              key={seat.code}
              className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${SEAT_COLORS[i]}15`, color: SEAT_COLORS[i] }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SEAT_COLORS[i] }} />
              {seat.code}
            </span>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke="#e2e8f0" strokeDasharray="2 2" />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: '#475569', fontWeight: 600 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 8, fill: '#cbd5e1' }} axisLine={false} />
          {seats.map((seat, i) => (
            <Radar
              key={seat.code}
              name={seat.code}
              dataKey={`seat${i}`}
              stroke={SEAT_COLORS[i]}
              fill={SEAT_COLORS[i]}
              fillOpacity={0.12}
              strokeWidth={2}
              dot={{ r: 2.5, fill: SEAT_COLORS[i], strokeWidth: 0 }}
            />
          ))}
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(v: number) => v.toFixed(1)}
          />
          <Legend
            wrapperStyle={{ fontSize: 9, paddingTop: 4 }}
            formatter={(value, _entry, index) => {
              const seat = seats[index];
              return seat ? `${seat.code} · ${seat.name.slice(0, 12)}` : value;
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
