import { addMonths, formatCOP, monthKey, type BudgetDTO } from '@finanzas/shared';
import { ChartPie, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle } from '../../components/ui/Card';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { formatMonthYear, formatPercent } from '../../lib/format';
import { Icon } from '../../lib/icons';
import { useBudget } from '../../lib/queries';
import { refName } from '../../lib/refs';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { BudgetEditorSheet } from './BudgetEditorSheet';
import { projectionText } from './projection';

type BudgetLine = BudgetDTO['lines'][number];

export function BudgetsPage() {
  const today = useToday();
  const toast = useToast();
  const [month, setMonth] = useState(() => monthKey(today));
  const budget = useBudget(month);
  const [editing, setEditing] = useState(false);
  const clear = useCrudMutation(() => api.del(`/budgets/${month}`), 'Presupuesto eliminado');
  const shift = (n: number) => setMonth((m) => monthKey(addMonths(`${m}-01`, n)));
  // Mientras llega el mes nuevo, `budget.data` es el del mes anterior: no se muestra ni se edita.
  const ready = budget.data && !budget.isPlaceholderData ? budget.data : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Presupuestos</h1>
      <div className="flex items-center justify-between rounded-2xl bg-surface p-1 ring-1 ring-border">
        <Button variant="ghost" aria-label="Mes anterior" onClick={() => shift(-1)}>
          <ChevronLeft size={18} />
        </Button>
        <span className="font-medium">{formatMonthYear(month)}</span>
        <Button variant="ghost" aria-label="Mes siguiente" onClick={() => shift(1)}>
          <ChevronRight size={18} />
        </Button>
      </div>
      {budget.isError ? (
        <ErrorState error={budget.error} onRetry={() => void budget.refetch()} />
      ) : !ready ? (
        <PageSpinner />
      ) : (
        <BudgetView
          budget={ready}
          onEdit={() => setEditing(true)}
          onClear={() =>
            clear.mutate(undefined, {
              onError: (err) => toast.show({ message: err.message, tone: 'error' }),
            })
          }
          clearing={clear.isPending}
        />
      )}
      {ready && (
        <BudgetEditorSheet open={editing} onOpenChange={setEditing} month={month} budget={ready} />
      )}
    </div>
  );
}

/** Las líneas de subcategoría cuyo padre también tiene línea van debajo de él, como sublímites. */
function orderLines(lines: BudgetLine[]): { line: BudgetLine; parent: BudgetLine | null }[] {
  const byCategory = new Map(lines.map((l) => [l.category.id, l]));
  const parentOf = (l: BudgetLine) =>
    (l.category.parentId && byCategory.get(l.category.parentId)) || null;
  return lines
    .filter((l) => !parentOf(l))
    .flatMap((top) => [
      { line: top, parent: null },
      ...lines.filter((l) => parentOf(l) === top).map((line) => ({ line, parent: top })),
    ]);
}

function BudgetView({
  budget,
  onEdit,
  onClear,
  clearing,
}: {
  budget: BudgetDTO;
  onEdit: () => void;
  onClear: () => void;
  clearing: boolean;
}) {
  if (!budget.total) {
    return (
      <EmptyState
        icon={<ChartPie />}
        title={`Sin presupuesto para ${formatMonthYear(budget.month)}`}
        description="Define un presupuesto general y por categoría. Te avisaremos al 50, 75, 90 y 100 %."
        action={<Button onClick={onEdit}>Crear presupuesto</Button>}
      />
    );
  }
  const { total } = budget;
  return (
    <>
      {budget.copiedFrom && (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
          Copiamos el presupuesto de {formatMonthYear(budget.copiedFrom)}. Ajústalo si lo necesitas.
        </p>
      )}
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle>Presupuesto del mes</CardTitle>
          <Amount value={total.budget} className="font-semibold" />
        </div>
        <p className="mt-2 text-sm">
          Gastado <Amount value={total.spent} className="font-medium" /> ·{' '}
          {total.remaining >= 0 ? (
            <>
              quedan <Amount value={total.remaining} className="font-medium" />
            </>
          ) : (
            <>
              te pasaste <Amount value={-total.remaining} tone="debt" className="font-medium" />
            </>
          )}
        </p>
        <div className="mt-2">
          <ProgressBar value={total.usage} label="Uso del presupuesto del mes" />
        </div>
        <p className="mt-2 text-xs text-muted">
          {formatPercent(total.usage)} usado
          {budget.daysLeft !== null
            ? ` · ${budget.daysLeft === 1 ? 'queda 1 día' : `quedan ${budget.daysLeft} días`}`
            : ''}
        </p>
        {budget.projection?.exceedsOnDay && (
          <p className="mt-2 text-sm text-warning">
            {projectionText(budget.projection.exceedsOnDay)}
          </p>
        )}
        {budget.totalAmount === null && (
          <p className="mt-2 text-xs text-muted">
            Sin total general: el presupuesto es la suma de las categorías y solo cuenta su gasto.
          </p>
        )}
      </Card>
      {budget.lines.length > 0 && (
        <section>
          <CardTitle className="mb-2 px-1">Por categoría</CardTitle>
          <ul className="space-y-2">
            {orderLines(budget.lines).map(({ line: l, parent }) => (
              <li
                key={l.id}
                className={
                  parent
                    ? 'ml-6 rounded-2xl bg-surface p-4 ring-1 ring-border'
                    : 'rounded-2xl bg-surface p-4 ring-1 ring-border'
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon name={l.category.icon} size={16} />
                    <span className="truncate font-medium">{refName(l.category)}</span>
                  </span>
                  <span className="text-sm">
                    <Amount value={l.spent} /> de <Amount value={l.amount} />
                  </span>
                </div>
                {parent && (
                  <p className="mt-1 text-xs text-muted">dentro de {parent.category.name}</p>
                )}
                <div className="mt-2">
                  <ProgressBar value={l.usage} label={`Uso de ${l.category.name}`} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {l.remaining >= 0
                    ? `Quedan ${formatCOP(l.remaining)}`
                    : `Te pasaste ${formatCOP(-l.remaining)}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onEdit}>
          Editar presupuesto
        </Button>
        <ConfirmButton loading={clearing} onConfirm={onClear}>
          Eliminar presupuesto
        </ConfirmButton>
      </div>
    </>
  );
}
