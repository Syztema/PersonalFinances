import { DERIVED_METHOD_LABELS, formatCOP, groupTop, type ReportDTO } from '@finanzas/shared';
import { ChartCard, ChartEmpty } from './ChartCard';
import { formatShare, OTHER_COLOR, seriesColor } from './chartTheme';
import { HorizontalBars, type BarRow } from './HorizontalBars';

/** 3. Gastos por método de pago: 6 y "Otros". */
export function PaymentMethodChart({
  report,
  printMode = false,
}: {
  report: ReportDTO;
  printMode?: boolean;
}) {
  const { top, other } = groupTop(report.paymentMethods, 6);
  const rows = [
    ...top.map((r, i) => ({
      name: DERIVED_METHOD_LABELS[r.method],
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
      title="Gastos por método de pago"
      table={{
        columns: ['Método', 'Valor', 'Porcentaje'],
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
