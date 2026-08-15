'use client';

import dynamic from 'next/dynamic';

const MapDashboard = dynamic(() => import('@/components/map/MapDashboard'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-slate-100">
      <div className="animate-spin h-7 w-7 border-3 border-emerald-500 border-t-transparent rounded-full" />
      <span className="ml-3 text-sm text-slate-500">
        Loading Selangor Voter Map…
      </span>
    </div>
  ),
});

export default function MapDashboardClient() {
  return <MapDashboard />;
}
