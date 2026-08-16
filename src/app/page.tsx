import ErrorBoundary from '@/components/ErrorBoundary';
import MapDashboardClient from '@/components/map/MapDashboardClient';

export default function Home() {
  return (
    <ErrorBoundary>
      <MapDashboardClient />
    </ErrorBoundary>
  );
}
