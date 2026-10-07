import type { DebtDTO } from '@finanzas/shared';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle } from '../../components/ui/Card';
import { formatShortDate } from '../../lib/format';
import { useQuickAdd } from '../quick-add/QuickAddContext';

export function LoansSection({ loans }: { loans: DebtDTO[] }) {
  const { open } = useQuickAdd();
  if (loans.length === 0) return null;
  return (
    <Card>
      <CardTitle>Préstamos</CardTitle>
      <ul className="mt-3 space-y-3">
        {loans.map((l) => (
          <li key={l.id} className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{l.name}</span>
              <span className="block text-xs text-muted">
                {l.installmentDue > 0 && l.nextPaymentDate
                  ? `Cuota pendiente ${formatShortDate(l.nextPaymentDate)}: `
                  : 'Saldo pendiente'}
                {l.installmentDue > 0 && <Amount value={l.installmentDue} />}
              </span>
            </span>
            <Amount
              value={l.balance}
              tone={l.balance > 0 ? 'debt' : 'neutral'}
              className="text-sm font-medium"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={l.balance <= 0}
              aria-label={`Pagar préstamo ${l.name}`}
              onClick={() => open({ kind: 'loan-payment', debtId: l.id })}
            >
              Pagar
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
