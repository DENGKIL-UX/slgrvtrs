'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { ComparisonSeat } from '@/components/map/MapDashboard';

interface ComparisonBarChartProps {
  seats: ComparisonSeat[];
}

const SEAT_COLORS = ['#059669', '#7c3aed', '#db2777'];

const METRICS = [
  { key: 'malay_pct', label: 'Malay %' },
  { key: 'chinese_pct', label: 'Chinese %' },
  { key: 'indian_pct', label: 'Indian %' },
  { key: 'other_pct', label: 'Others %' },
] as const;

/**
 * Grouped bar chart comparing race percentages across up to 3 seats.
 */
export default function ComparisonBarChart({ seats }: ComparisonBarChartProps) {
  if (seats.length === 0) return null;

  // Build data: one row per metric, with a field per seat
  const data = METRICS.map((m) => {
    const row: Record<string, number | string> = { metric: m.label };
    seats.forEach((seat, i) => {
      row[`seat${i}`] = Number(seat.data[m.key]) || 0;
    });
    return row;
  });

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
      <div className="mb-2">
        <h3 className="text-xs font-bold text-slate-800">Race Composition Comparison</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">Side-by-side ethnic breakdown (%)</p>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="metric" tick={{ fontSize: 9, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            cursor={{ fill: '#f8fafc' }}
            formatter={(v: number) => `${v.toFixed(1)}%`}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          <Legend
            wrapperStyle={{ fontSize: 9, paddingTop: 4 }}
            formatter={(value, _entry, index) => {
              const seat = seats[index];
              return seat ? `${seat.code}` : value;
            }}
          />
          {seats.map((seat, i) => (
            <Bar
              key={seat.code}
              dataKey={`seat${i}`}
              fill={SEAT_COLORS[i]}
              radius={[3, 3, 0, 0]}
              barSize={Math.max(8, 24 / seats.length)}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
