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

  // Contact-rate distribution (how reachable voters are per parliament)
  const contactData = useMemo(() => {
    return Object.values(parliamentStats)
      .map((p) => ({ name: p.code_parlimen, contact: p.contact_pct, fullName: p.name }))
      .sort((a, b) => b.contact - a.contact);
  }, [parliamentStats]);

  // Headline stats: voter density (voters per DM) and avg contact rate
  const headline = useMemo(() => {
    const all = Object.values(parliamentStats);
    const totalVoters = all.reduce((s, p) => s + p.total_voters, 0);
    // contact_pct is stored as a percentage (e.g. 69.53). Voter-weighted
    // average = Σ(pct × voters) / Σ(voters). No extra /100 — keep it in %.
    const avgContact = all.reduce((s, p) => s + p.contact_pct * p.total_voters, 0) / (totalVoters || 1);
    // age_mean is stored as years (e.g. 41.2). Voter-weighted average.
    const avgAge = all.reduce((s, p) => s + p.age_mean * p.total_voters, 0) / (totalVoters || 1);
    const voterDensity = totalDms > 0 ? totalVoters / totalDms : 0;
    return {
      totalVoters,
      avgContact: avgContact || 0,
      avgAge: avgAge || 0,
      voterDensity: Math.round(voterDensity),
    };
  }, [parliamentStats, totalDms]);

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

          {/* Voter-weighted headline metrics */}
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="Total Voters"
              value={headline.totalVoters.toLocaleString()}
              sub="across Selangor"
              accent="emerald"
              icon={
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              }
            />
            <MetricCard
              label="Avg Contact %"
              value={`${headline.avgContact.toFixed(1)}%`}
              sub="voter-weighted"
              accent="violet"
              icon={
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              }
            />
            <MetricCard
              label="Avg Mean Age"
              value={headline.avgAge.toFixed(1)}
              sub="years"
              accent="amber"
              icon={
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <MetricCard
              label="Voter Density"
              value={headline.voterDensity.toLocaleString()}
              sub="voters / DM"
              accent="rose"
              icon={
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              }
            />
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

          {/* Contact rate per parliament (sorted desc) */}
          <Section title="Contact Rate by Parliament" subtitle="Highest → lowest voter reachability">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={contactData} margin={{ left: -16, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} angle={-45} textAnchor="end" height={50} tickMargin={4} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[60, 90]} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(v: number) => `${v.toFixed(1)}%`}
                  labelFormatter={(_l, p) => p?.[0]?.payload?.fullName ?? ''}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="contact" radius={[3, 3, 0, 0]} barSize={12}>
                  {contactData.map((d, i) => (
                    <BarCell key={i} fill={d.contact > 80 ? '#10b981' : d.contact > 75 ? '#34d399' : d.contact > 70 ? '#fbbf24' : '#f43f5e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex items-center justify-center gap-3 text-[9px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> ≥80%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> 70-80%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> &lt;70%</span>
            </div>
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

function MetricCard({
  label, value, sub, accent, icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: 'emerald' | 'violet' | 'amber' | 'rose';
  icon?: React.ReactNode;
}) {
  const accentMap = {
    emerald: { ring: 'ring-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', iconBg: 'bg-emerald-100 text-emerald-600' },
    violet: { ring: 'ring-violet-200', bg: 'bg-violet-50', text: 'text-violet-700', iconBg: 'bg-violet-100 text-violet-600' },
    amber: { ring: 'ring-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', iconBg: 'bg-amber-100 text-amber-600' },
    rose: { ring: 'ring-rose-200', bg: 'bg-rose-50', text: 'text-rose-700', iconBg: 'bg-rose-100 text-rose-600' },
  };
  const a = accentMap[accent];
  return (
    <div className={`relative ${a.bg} rounded-xl p-2.5 border ${a.ring} ring-1 overflow-hidden hover-lift`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-base font-extrabold tabular-nums leading-tight ${a.text}`}>{value}</div>
          <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-500 mt-0.5">{label}</div>
          {sub && <div className="text-[8px] text-slate-400 mt-0.5">{sub}</div>}
        </div>
        {icon && (
          <div className={`w-7 h-7 rounded-lg ${a.iconBg} flex items-center justify-center flex-shrink-0`}>
            {icon}
          </div>
        )}
      </div>
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
