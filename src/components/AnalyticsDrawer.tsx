'use client';

import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Cell as BarCell,
} from 'recharts';
import type { ParliamentStats, DunStats } from '@/lib/map/join-stats';

// ── Types ──────────────────────────────────────────────────

interface AnalyticsDrawerProps {
  open: boolean;
  onClose: () => void;
  parliamentStats: Record<string, ParliamentStats>;
  dunStats: Record<string, DunStats>;
  activeMetric: string;
}

// ── Colors ─────────────────────────────────────────────────

const RACE_COLORS: Record<string, string> = {
  Malay: '#ef4444',
  Chinese: '#f59e0b',
  Indian: '#3b82f6',
  Others: '#8b5cf6',
};
const GENDER_COLORS: Record<string, string> = {
  Male: '#3b82f6',
  Female: '#ec4899',
};

// ── Metric meta (label + formatter) ────────────────────────

const METRIC_META: Record<string, { label: string; fmt: (v: number) => string }> = {
  total_voters: { label: 'Total Voters', fmt: (v) => v.toLocaleString() },
  male_pct: { label: 'Male %', fmt: (v) => `${v.toFixed(1)}%` },
  female_pct: { label: 'Female %', fmt: (v) => `${v.toFixed(1)}%` },
  malay_pct: { label: 'Malay %', fmt: (v) => `${v.toFixed(1)}%` },
  chinese_pct: { label: 'Chinese %', fmt: (v) => `${v.toFixed(1)}%` },
  indian_pct: { label: 'Indian %', fmt: (v) => `${v.toFixed(1)}%` },
  other_pct: { label: 'Others %', fmt: (v) => `${v.toFixed(1)}%` },
  age_mean: { label: 'Mean Age', fmt: (v) => v.toFixed(1) },
  age_median: { label: 'Median Age', fmt: (v) => v.toFixed(1) },
  contact_pct: { label: 'Contact %', fmt: (v) => `${v.toFixed(1)}%` },
};

// ── Component ──────────────────────────────────────────────

export default function AnalyticsDrawer({
  open, onClose, parliamentStats, dunStats, activeMetric,
}: AnalyticsDrawerProps) {
  // Aggregate race distribution (voter-weighted across all parliaments)
  const raceData = useMemo(() => {
    const all = Object.values(parliamentStats);
    const totalVoters = all.reduce((s, p) => s + p.total_voters, 0);
    if (!totalVoters) return [];
    const malay = all.reduce((s, p) => s + (p.malay_pct / 100) * p.total_voters, 0);
    const chinese = all.reduce((s, p) => s + (p.chinese_pct / 100) * p.total_voters, 0);
    const indian = all.reduce((s, p) => s + (p.indian_pct / 100) * p.total_voters, 0);
    const other = all.reduce((s, p) => s + (p.other_pct / 100) * p.total_voters, 0);
    return [
      { name: 'Malay', value: Math.round(malay), pct: (malay / totalVoters) * 100 },
      { name: 'Chinese', value: Math.round(chinese), pct: (chinese / totalVoters) * 100 },
      { name: 'Indian', value: Math.round(indian), pct: (indian / totalVoters) * 100 },
      { name: 'Others', value: Math.round(other), pct: (other / totalVoters) * 100 },
    ];
  }, [parliamentStats]);

  // Aggregate gender split
  const genderData = useMemo(() => {
    const all = Object.values(parliamentStats);
    const male = all.reduce((s, p) => s + p.male, 0);
    const female = all.reduce((s, p) => s + p.female, 0);
    return [
      { name: 'Male', value: male },
      { name: 'Female', value: female },
    ];
  }, [parliamentStats]);

  // Top 5 + Bottom 5 parliaments by the active metric
  const ranked = useMemo(() => {
    const all = Object.values(parliamentStats);
    const meta = METRIC_META[activeMetric] ?? METRIC_META.total_voters;
    const prop = activeMetric as keyof ParliamentStats;
    const sorted = [...all].sort((a, b) => (b[prop] as number) - (a[prop] as number));
    const top = sorted.slice(0, 5).map((p) => ({ name: p.code_parlimen, value: p[prop] as number, fullName: p.name }));
    const bottom = sorted.slice(-5).reverse().map((p) => ({ name: p.code_parlimen, value: p[prop] as number, fullName: p.name }));
    return { top, bottom, meta };
  }, [parliamentStats, activeMetric]);

  // Age distribution per parliament (mean age)
  const ageData = useMemo(() => {
    return Object.values(parliamentStats)
      .map((p) => ({ name: p.code_parlimen, age: p.age_mean }))
      .sort((a, b) => a.age - b.age);
  }, [parliamentStats]);

  // DUN count vs voters scatter-ish (bar)
  const dunCounts = useMemo(() => {
    return Object.values(parliamentStats)
      .map((p) => ({ name: p.code_parlimen, duns: p.child_dun_count, voters: p.total_voters }))
      .sort((a, b) => b.voters - a.voters);
  }, [parliamentStats]);

  const totalDms = useMemo(() => Object.values(dunStats).reduce((s, d) => s + d.dm_count, 0), [dunStats]);

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
        className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col animate-[slideInRight_0.25s_ease-out] border-l border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Statewide Analytics</h2>
              <p className="text-[10px] text-emerald-100">Selangor aggregate insights</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white"
            aria-label="Close analytics"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Headline KPI cards */}
          <div className="grid grid-cols-3 gap-2">
            <KpiCard label="Parliaments" value={String(Object.keys(parliamentStats).length)} accent="emerald" />
            <KpiCard label="DUNs" value={String(Object.keys(dunStats).length)} accent="teal" />
            <KpiCard label="DMs" value={totalDms.toLocaleString()} accent="rose" />
          </div>

          {/* Race distribution pie */}
          <Section title="Ethnic Distribution" subtitle="Voter-weighted across all 22 parliaments">
            <div className="flex items-center gap-3">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={raceData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={32} outerRadius={62} paddingAngle={2}>
                    {raceData.map((e) => (
                      <Cell key={e.name} fill={RACE_COLORS[e.name]} stroke="#fff" strokeWidth={1.5} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, _n, p: any) => [`${v.toLocaleString()} (${p.payload.pct.toFixed(1)}%)`, p.payload.name]}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {raceData.map((e) => (
                  <div key={e.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: RACE_COLORS[e.name] }} />
                    <span className="text-slate-600 flex-1">{e.name}</span>
                    <span className="font-semibold text-slate-800 tabular-nums">{e.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* Gender split donut */}
          <Section title="Gender Split" subtitle="Aggregate male / female voters">
            <div className="flex items-center gap-3">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={genderData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={2}>
                    {genderData.map((e) => (
                      <Cell key={e.name} fill={GENDER_COLORS[e.name]} stroke="#fff" strokeWidth={1.5} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => v.toLocaleString()}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {genderData.map((e) => {
                  const total = genderData[0].value + genderData[1].value;
                  const pct = (e.value / total) * 100;
                  return (
                    <div key={e.name}>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: GENDER_COLORS[e.name] }} />
                        <span className="text-slate-600 flex-1">{e.name}</span>
                        <span className="font-semibold text-slate-800 tabular-nums">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="text-[10px] text-slate-400 pl-4.5 tabular-nums">{e.value.toLocaleString()} voters</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>

          {/* Top 5 by metric */}
          <Section title={`Top 5 — ${ranked.meta.label}`} subtitle="Highest-scoring parliaments">
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={ranked.top} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(v: number) => ranked.meta.fmt(v)}
                  labelFormatter={(_l, p) => p?.[0]?.payload?.fullName ?? ''}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                  {ranked.top.map((_, i) => (
                    <BarCell key={i} fill={['#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>

          {/* Bottom 5 by metric */}
          <Section title={`Bottom 5 — ${ranked.meta.label}`} subtitle="Lowest-scoring parliaments">
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={ranked.bottom} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(v: number) => ranked.meta.fmt(v)}
                  labelFormatter={(_l, p) => p?.[0]?.payload?.fullName ?? ''}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                  {ranked.bottom.map((_, i) => (
                    <BarCell key={i} fill={['#be123c', '#f43f5e', '#fb7185', '#fda4af', '#fecdd3'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>

          {/* Age distribution */}
          <Section title="Mean Age by Parliament" subtitle="Sorted ascending — youngest to oldest">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={ageData} margin={{ left: -16, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} angle={-45} textAnchor="end" height={50} tickMargin={4} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[38, 48]} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(v: number) => v.toFixed(1)}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="age" radius={[3, 3, 0, 0]} barSize={12}>
                  {ageData.map((d, i) => (
                    <BarCell key={i} fill={d.age > 45 ? '#9333ea' : d.age > 43 ? '#c026d3' : d.age > 41 ? '#db2777' : '#f59e0b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>

          {/* DUN count per parliament */}
          <Section title="DUN Seats per Parliament" subtitle="Parliament → child DUN count">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={dunCounts} margin={{ left: -16, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} angle={-45} textAnchor="end" height={50} tickMargin={4} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(v: number) => `${v} DUNs`}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="duns" radius={[3, 3, 0, 0]} barSize={12} fill="#14b8a6" />
              </BarChart>
            </ResponsiveContainer>
          </Section>

          <p className="text-[9px] text-slate-400 text-center pt-2 pb-1">
            Aggregates computed client-side from pre-computed voter stats JSON.
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

// ── Sub-components ─────────────────────────────────────────

function KpiCard({ label, value, accent }: { label: string; value: string; accent: 'emerald' | 'teal' | 'rose' }) {
  const colors = {
    emerald: 'from-emerald-50 to-emerald-100/50 border-emerald-200 text-emerald-700',
    teal: 'from-teal-50 to-teal-100/50 border-teal-200 text-teal-700',
    rose: 'from-rose-50 to-rose-100/50 border-rose-200 text-rose-700',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[accent]} rounded-lg p-2.5 border text-center`}>
      <div className="text-lg font-extrabold tabular-nums leading-tight">{value}</div>
      <div className="text-[9px] uppercase tracking-wider font-semibold opacity-80 mt-0.5">{label}</div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
      <div className="mb-2.5">
        <h3 className="text-xs font-bold text-slate-800">{title}</h3>
        {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
