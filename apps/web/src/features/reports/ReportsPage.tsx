import type { ReportDTO, ReportPeriodInput } from '@finanzas/shared';
import { ChartColumn } from 'lucide-react';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { ChunkBoundary } from '../../components/ui/ChunkBoundary';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { OfflineState } from '../../components/ui/OfflineState';
import { useReport } from '../../lib/queries';
import { ExportButtons } from './ExportButtons';
import { PeriodPicker } from './PeriodPicker';
import { PrintHeader } from './PrintHeader';
import { ReportTotals } from './ReportTotals';
import { usePrintMode } from './usePrintMode';

// Recharts va en un chunk aparte (spec Fase 3 §5.1 y §7.2).
const ReportCharts = lazy(() => import('./charts/ReportCharts'));

/** Hubo movimientos en el periodo (los saldos que vienen de antes no cuentan). */
export function hasMovements(report: ReportDTO): boolean {
  const t = report.totals;
  return (
    t.income !== 0 ||
    t.expense !== 0 ||
    t.savings !== 0 ||
    t.investment !== 0 ||
    report.accounts.some((a) => a.inflow !== 0 || a.outflow !== 0) ||
    report.cards.some((c) => c.purchases !== 0 || c.payments !== 0)
  );
}

function ReportSkeleton() {
  return (
    <div role="status" aria-label="Cargando reporte" className="space-y-4">
      <div className="h-56 animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-72 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando gráficos"
      className="h-72 animate-pulse rounded-2xl bg-surface-2"
    />
  );
}

export function ReportsPage() {
  // Spec Fase 3 §5.1: el periodo vive en el estado de la pantalla, nunca en la URL.
  const [period, setPeriod] = useState<ReportPeriodInput>({ preset: 'THIS_MONTH' });
  const report = useReport(period);
  const ready = report.data !== undefined && !report.isPlaceholderData; // datos del periodo mostrado
  const { printMode, print } = usePrintMode();

  let content: ReactNode;
  if (report.isError) {
    content = <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  } else if (!ready && report.fetchStatus === 'paused') {
    content = <OfflineState onRetry={() => void report.refetch()} />;
  } else if (!ready || !report.data) {
    // Review Focus 1: mientras llegan los datos del periodo nuevo no se muestran los del anterior.
    content = <ReportSkeleton />;
  } else if (!hasMovements(report.data)) {
    content = (
      <EmptyState
        icon={<ChartColumn />}
        title="Sin movimientos en este periodo"
        description="Elige otro periodo o registra tus ingresos y gastos."
      />
    );
  } else {
    content = (
      <>
        <ReportTotals report={report.data} />
        <ChunkBoundary>
          <Suspense fallback={<ChartsSkeleton />}>
            <ReportCharts report={report.data} printMode={printMode} />
          </Suspense>
        </ChunkBoundary>
      </>
    );
  }

  return (
    <div className="space-y-4">
      {ready && report.data && (
        <PrintHeader from={report.data.period.from} to={report.data.period.to} />
      )}
      {/* Spec Fase 3 §5.3: lo que no se imprime lleva `print:hidden` (los Button ya lo traen). */}
      <h1 className="text-2xl font-semibold print:hidden">Reportes</h1>
      <div className="print:hidden">
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      {content}
      {/* Review Focus 1: exportar e imprimir solo con los datos del periodo elegido. */}
      <ExportButtons period={period} disabled={!ready} onPrint={print} />
    </div>
  );
}
