import { formatCOP, type ReportDTO } from '@finanzas/shared';
import { refName } from '../../../lib/refs';
import { ChartCard, ChartEmpty } from './ChartCard';
import { POSITIVE_COLOR, seriesColor } from './chartTheme';
import { HorizontalBars } from './HorizontalBars';

/** 5. Deuda de tarjetas: deuda al final del periodo (negativa = saldo a favor). */
export function CardDebtChart({
  report,
  printMode = false,
}: {
  report: ReportDTO;
  printMode?: boolean;
}) {
  const cards = report.cards.map((c) => ({ ...c, name: refName(c.card) ?? '' }));
  return (
    <ChartCard
      title="Deuda de tarjetas"
      table={{
        columns: ['Tarjeta', 'Compras', 'Pagos', 'Deuda final'],
        rows: cards.map((c) => [
          c.name,
          formatCOP(c.purchases),
          formatCOP(c.payments),
          formatCOP(c.closingDebt),
        ]),
      }}
    >
      {cards.length === 0 ? (
        <ChartEmpty>Sin tarjetas con deuda ni movimientos en este periodo.</ChartEmpty>
      ) : (
        <HorizontalBars
          printMode={printMode}
          rows={cards.map((c, i) => ({
            name: c.name,
            value: c.closingDebt,
            color: c.closingDebt < 0 ? POSITIVE_COLOR : seriesColor(i + 2),
          }))}
        />
      )}
    </ChartCard>
  );
}
