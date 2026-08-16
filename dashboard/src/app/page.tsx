import ErrorBoundary from '@/components/ErrorBoundary';
import MapDashboardClient from '@/components/map/MapDashboardClient';
import { ToastProvider } from '@/components/Toast';

export default function Home() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <MapDashboardClient />
      </ToastProvider>
    </ErrorBoundary>
  );
}
