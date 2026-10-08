import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CardTitle } from '../../components/ui/Card';
import { ChunkBoundary } from '../../components/ui/ChunkBoundary';
import { ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { useReport } from '../../lib/queries';

const RecentCharts = lazy(() => import('./RecentCharts'));

/**
 * Spec §5.2: "Tus últimos 6 meses". La consulta y el chunk de gráficos solo se piden cuando la
 * sección entra en pantalla; sin IntersectionObserver se piden al montar.
 */
export function DashboardCharts() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const section = ref.current;
    if (visible || !section) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <section ref={ref} aria-labelledby="recent-charts-title" className="space-y-3">
      <CardTitle id="recent-charts-title" className="px-1">
        Tus últimos 6 meses
      </CardTitle>
      {visible ? <RecentReport /> : <div className="min-h-64" />}
    </section>
  );
}

function RecentReport() {
  const report = useReport({ preset: 'LAST_6_MONTHS' });
  if (report.isPending) return <PageSpinner />;
  if (report.isError)
    return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  return (
    <ChunkBoundary>
      <Suspense fallback={<PageSpinner />}>
        <RecentCharts report={report.data} />
      </Suspense>
    </ChunkBoundary>
  );
}
