import type { DashboardDTO } from '@finanzas/shared';
import { Amount } from '../../components/ui/Amount';
import { Card, CardTitle } from '../../components/ui/Card';
import { formatPercent } from '../../lib/format';

export function MonthCard({ data }: { data: DashboardDTO['thisMonth'] }) {
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
    </Card>
  );
}
