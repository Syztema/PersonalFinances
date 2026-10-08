import type { ReportDTO } from '@finanzas/shared';
import { Amount, type AmountTone } from '../../components/ui/Amount';
import { Card, CardTitle } from '../../components/ui/Card';
import { formatDate, formatPercent } from '../../lib/format';

/** Spec Fase 3 §5.1: ingresos, gastos, ahorro e inversión, restante y tasa de ahorro del periodo. */
export function ReportTotals({ report }: { report: ReportDTO }) {
  const { totals, period } = report;
  const rows: Array<[string, number, AmountTone]> = [
    ['Ingresos', totals.income, 'income'],
    ['Gastos', totals.expense, 'expense'],
    ['Ahorro', totals.savings, 'balance'],
    ['Inversión', totals.investment, 'balance'],
  ];
  return (
    <Card className="break-inside-avoid">
      <CardTitle>Totales</CardTitle>
      <p className="mt-1 text-sm text-muted">
        Del {formatDate(period.from)} al {formatDate(period.to)}
      </p>
      <dl className="mt-3 space-y-2">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="flex items-center justify-between">
            <dt className="text-sm">{label}</dt>
            <dd className="font-medium">
              <Amount value={value} tone={value === 0 && tone !== 'balance' ? 'neutral' : tone} />
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <dt className="text-sm font-medium">Restante</dt>
          <dd className="font-semibold">
            <Amount value={totals.remaining} tone="balance" />
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-sm">Tasa de ahorro</dt>
          <dd className="font-medium tabular-nums">
            {totals.savingsRate === null ? 'Sin ingresos' : formatPercent(totals.savingsRate)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
