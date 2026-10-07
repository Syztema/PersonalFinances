import type { DashboardBudgetDTO, DashboardDTO } from '@finanzas/shared';
import { Link } from 'react-router';
import { Amount } from '../../components/ui/Amount';
import { Card, CardTitle } from '../../components/ui/Card';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { formatPercent } from '../../lib/format';
import { projectionText } from '../budgets/projection';

export function MonthCard({
  data,
  budget,
}: {
  data: DashboardDTO['thisMonth'];
  budget: DashboardBudgetDTO | null;
}) {
  const rows: Array<[string, number, 'income' | 'expense' | 'balance']> = [
    ['Ingresos', data.income, 'income'],
    ['Gastos', data.expense, 'expense'],
    ['Ahorro', data.savings, 'balance'],
  ];
  if (data.investment !== 0) rows.push(['Inversión', data.investment, 'balance']);
  return (
    <Card>
      <CardTitle>Este mes</CardTitle>
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
          <dt className="text-sm font-medium">Restante del mes</dt>
          <dd className="font-semibold">
            <Amount value={data.remaining} tone="balance" />
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted">
        {data.savingsRate === null
          ? `Aún no registras ingresos este mes. Tu objetivo de ahorro es ${data.savingsTargetPct}%.`
          : `Ahorro actual: ${formatPercent(data.savingsRate)} de tus ingresos · objetivo ${data.savingsTargetPct}%.`}
      </p>
      {budget ? (
        <div className="mt-3 space-y-1 border-t border-border pt-3">
          <div className="flex items-center justify-between text-sm">
            <span>Presupuesto</span>
            <span>
              <Amount value={budget.spent} /> de <Amount value={budget.budget} />
            </span>
          </div>
          <ProgressBar value={budget.usage} label="Uso del presupuesto" />
          {budget.projectionExceedsOnDay !== null && (
            <p className="text-sm text-warning">{projectionText(budget.projectionExceedsOnDay)}</p>
          )}
        </div>
      ) : (
        <Link to="/budgets" className="mt-2 inline-flex min-h-11 items-center text-sm text-primary">
          Crear un presupuesto para este mes
        </Link>
      )}
    </Card>
  );
}
