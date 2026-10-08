import { formatCOP, groupTop, type ReportDTO } from '@finanzas/shared';
import { refName } from '../../../lib/refs';
import { ChartCard, ChartEmpty } from './ChartCard';
import { formatShare, OTHER_COLOR, seriesColor } from './chartTheme';
import { HorizontalBars, type BarRow } from './HorizontalBars';

/** 2. Gastos por categoría: las 6 mayores y "Otros" (groupTop, spec Fase 3 §3.3). */
export function CategoryBarsChart({
  report,
  printMode = false,
}: {
  report: ReportDTO;
  printMode?: boolean;
}) {
  const { top, other } = groupTop(report.expenseByCategory, 6);
  const rows = [
    ...top.map((r, i) => ({
      name: refName(r.category) ?? '',
      value: r.amount,
      share: r.share,
      color: seriesColor(i),
    })),
    ...(other
      ? [{ name: 'Otros', value: other.amount, share: other.share, color: OTHER_COLOR }]
      : []),
  ] satisfies Array<BarRow & { share: number }>;
  return (
    <ChartCard
      title="Gastos por categoría"
      alwaysShowTable={printMode}
      table={{
        columns: ['Categoría', 'Valor', 'Porcentaje'],
        rows: rows.map((r) => [r.name, formatCOP(r.value), formatShare(r.share)]),
      }}
    >
      {rows.length === 0 ? (
        <ChartEmpty>Sin gastos en este periodo.</ChartEmpty>
      ) : (
        <HorizontalBars rows={rows} printMode={printMode} />
      )}
    </ChartCard>
  );
}
