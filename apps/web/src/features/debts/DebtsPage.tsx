import type { DebtDTO } from '@finanzas/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { DeletedSection } from '../../components/ui/DeletedSection';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { formatShortDate } from '../../lib/format';
import { useDebts } from '../../lib/queries';
import { useRestore } from '../../lib/useRestore';
import { useQuickAdd } from '../quick-add/QuickAddContext';
import { DebtFormSheet } from './DebtFormSheet';
import { DisbursementSheet } from './DisbursementSheet';

export function DebtsPage() {
  const debts = useDebts();
  const { open } = useQuickAdd();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DebtDTO | undefined>();
  const [disbursing, setDisbursing] = useState<DebtDTO | null>(null);
  const { restore, isRestoring } = useRestore(
    (id) => `/debts/${id}/restore`,
    'Préstamo restaurado',
  );
  if (debts.isPending) return <PageSpinner />;
  if (debts.isError) return <ErrorState error={debts.error} onRetry={() => void debts.refetch()} />;

  const active = debts.data.filter((d) => d.isActive);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Préstamos</h1>
        <Button
          size="sm"
          aria-label="Nuevo préstamo"
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus size={16} /> Nuevo
        </Button>
      </div>
      {active.length === 0 ? (
        <EmptyState
          title="No tienes préstamos registrados"
          description="Créditos de libre inversión, vehículo o dinero que le debes a alguien."
        />
      ) : (
        <ul className="space-y-3">
          {active.map((d) => (
            <li key={d.id} className="rounded-2xl bg-surface p-4 ring-1 ring-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{d.name}</p>
                  <p className="text-xs text-muted">{d.lender ?? 'Sin acreedor'}</p>
                </div>
                <Amount value={d.balance} tone="debt" className="font-semibold" />
              </div>
              {d.monthlyPayment && (
                <p className="mt-2 text-sm text-muted">
                  Cuota <Amount value={d.monthlyPayment} />
                  {d.installmentDue > 0 && d.nextPaymentDate
                    ? ` · pendiente ${formatShortDate(d.nextPaymentDate)}`
                    : ' · al día este mes'}
                </p>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button
                  size="sm"
                  disabled={d.balance <= 0}
                  onClick={() => open({ kind: 'loan-payment', debtId: d.id })}
                >
                  Pagar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setDisbursing(d)}>
                  Desembolso
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditing(d);
                    setFormOpen(true);
                  }}
                >
                  Editar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <DeletedSection
        items={debts.data.filter((d) => !d.isActive)}
        isRestoring={isRestoring}
        onRestore={(d) => restore(d.id)}
      />
      <DebtFormSheet open={formOpen} onOpenChange={setFormOpen} debt={editing} />
      <DisbursementSheet debt={disbursing} onClose={() => setDisbursing(null)} />
    </div>
  );
}
