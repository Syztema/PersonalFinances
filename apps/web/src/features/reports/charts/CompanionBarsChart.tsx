import { formatCOP, groupCompanionSeries, type ReportDTO } from '@finanzas/shared';
import { ChartCard, ChartEmpty } from './ChartCard';
import { formatShare } from './chartTheme';
import { EMPTY_WHO, hasWho, seriesFill, seriesLabel } from './companionSeries';
import { HorizontalBars, type BarRow } from './HorizontalBars';

/** Gastos por compañía en el periodo (spec con quién §4.3): 5, "Otros" y "Sin indicar". */
export function CompanionBarsChart({
  report,
  printMode = false,
}: {
  report: ReportDTO;
  printMode?: boolean;
}) {
  const { series } = groupCompanionSeries(report.expenseByCompanion, report.companionMonths);
  const empty = !hasWho(series);
  const rows = series.map((s, i) => ({
    name: seriesLabel(s),
    value: s.amount,
    share: s.share,
    color: seriesFill(s, i),
  })) satisfies Array<BarRow & { share: number }>;
  return (
    <ChartCard
      title="Gastos por compañía"
      alwaysShowTable={printMode}
      table={{
        columns: ['Con quién', 'Valor', 'Porcentaje'],
        rows: empty ? [] : rows.map((r) => [r.name, formatCOP(r.value), formatShare(r.share)]),
      }}
    >
      {empty ? (
        <ChartEmpty>{EMPTY_WHO}</ChartEmpty>
      ) : (
        <HorizontalBars rows={rows} printMode={printMode} />
      )}
    </ChartCard>
  );
}
