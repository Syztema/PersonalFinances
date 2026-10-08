import { formatCOP, type ReportDTO } from '@finanzas/shared';
import { refName } from '../../../lib/refs';
import { ChartCard, ChartEmpty } from './ChartCard';
import { NEGATIVE_COLOR, seriesColor } from './chartTheme';
import { HorizontalBars } from './HorizontalBars';

/** 4. Dónde está tu dinero: saldo final por cuenta; un sobregiro se ve negativo. */
export function AccountsChart({
  report,
  printMode = false,
}: {
  report: ReportDTO;
  printMode?: boolean;
}) {
  const accounts = report.accounts.map((a) => ({ ...a, name: refName(a.account) ?? '' }));
  return (
    <ChartCard
      title="Dónde está tu dinero"
      alwaysShowTable={printMode}
      table={{
        columns: ['Cuenta', 'Saldo inicial', 'Entradas', 'Salidas', 'Saldo final'],
        rows: accounts.map((a) => [
          a.name,
          formatCOP(a.opening),
          formatCOP(a.inflow),
          formatCOP(a.outflow),
          formatCOP(a.closing),
        ]),
      }}
    >
      {accounts.length === 0 ? (
        <ChartEmpty>Sin cuentas con saldo en este periodo.</ChartEmpty>
      ) : (
        <HorizontalBars
          printMode={printMode}
          rows={accounts.map((a, i) => ({
            name: a.name,
            value: a.closing,
            color: a.closing < 0 ? NEGATIVE_COLOR : seriesColor(i),
          }))}
        />
      )}
    </ChartCard>
  );
}
