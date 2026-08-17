'use client';

import dynamic from 'next/dynamic';

const MapDashboard = dynamic(() => import('@/components/map/MapDashboard'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-emerald-50/40 to-teal-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/40 transition-colors">
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-xl animate-pulse" aria-hidden="true" />
        <div className="relative animate-spin h-9 w-9 border-[3px] border-emerald-500 border-t-transparent rounded-full" />
      </div>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200 tracking-tight">
        Loading Selangor Voter Map
      </span>
      <span className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
        3,971,650 voters · 22 parliaments · 945 DMs
      </span>
    </div>
  ),
});

export default function MapDashboardClient() {
  return <MapDashboard />;
}
