import {
  addDays,
  FREQUENCY_LABELS,
  type RecurringRuleDTO,
  type ScheduledItemDTO,
} from '@finanzas/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { CardTitle } from '../../components/ui/Card';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { api, type ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatShortDate } from '../../lib/format';
import { useRules, useScheduled } from '../../lib/queries';
import { refName } from '../../lib/refs';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { useQuickAdd } from '../quick-add/QuickAddContext';
import { CompleteSheet } from './CompleteSheet';
import { RuleFormSheet } from './RuleFormSheet';
import { ScheduledFormSheet } from './ScheduledFormSheet';
import { sourceBody, sourceValue } from './sources';
import { useConflict } from './useConflict';

/** El servidor exige la regla completa (esquema estricto) para cambiar `isActive`. */
const ruleBody = (r: RecurringRuleDTO, isActive: boolean) => ({
  name: r.name,
  kind: r.kind,
  amount: r.amount,
  categoryId: r.category.id,
  ...sourceBody(sourceValue(r.account, r.creditCard)),
  frequency: r.frequency,
  intervalDays: r.intervalDays,
  day1: r.day1,
  day2: r.day2,
  startDate: r.startDate,
  endDate: r.endDate,
  isActive,
});

export function RecurringPage() {
  const today = useToday();
  const upcoming = useScheduled(`to=${addDays(today, 30)}`);
  const rules = useRules();
  const { open } = useQuickAdd();
  const [ruleForm, setRuleForm] = useState<{ open: boolean; rule?: RecurringRuleDTO }>({
    open: false,
  });
  const [itemForm, setItemForm] = useState<{ open: boolean; item?: ScheduledItemDTO }>({
    open: false,
  });
  const [completing, setCompleting] = useState<ScheduledItemDTO | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Recurrentes y obligaciones</h1>
      <div className="grid grid-cols-2 gap-2">
        <Button aria-label="Nueva regla" onClick={() => setRuleForm({ open: true })}>
          <Plus size={16} /> Regla
        </Button>
        <Button
          variant="secondary"
          aria-label="Nuevo pago único"
          onClick={() => setItemForm({ open: true })}
        >
          <Plus size={16} /> Pago único
        </Button>
      </div>

      <section>
        <CardTitle className="mb-2 px-1">Próximos 30 días</CardTitle>
        {upcoming.isPending ? (
          <PageSpinner />
        ) : upcoming.isError ? (
          <ErrorState error={upcoming.error} onRetry={() => void upcoming.refetch()} />
        ) : upcoming.data.length === 0 ? (
          <EmptyState title="Nada pendiente en los próximos 30 días" />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
            {upcoming.data.map((item) => (
              <UpcomingRow
                key={item.id}
                item={item}
                today={today}
                onComplete={() => setCompleting(item)}
                onEdit={() => setItemForm({ open: true, item })}
                onPayDerived={() =>
                  item.derived === 'CARD'
                    ? open({ kind: 'card-payment', cardId: item.sourceId ?? undefined })
                    : open({ kind: 'loan-payment', debtId: item.sourceId ?? undefined })
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <CardTitle className="mb-2 px-1">Reglas</CardTitle>
        {rules.isPending ? (
          <PageSpinner />
        ) : rules.isError ? (
          <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />
        ) : rules.data.length === 0 ? (
          <EmptyState
            title="Sin reglas todavía"
            description="Crea reglas para el arriendo, los servicios, las suscripciones o tu salario."
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
            {rules.data.map((r) => (
              <RuleRow key={r.id} rule={r} onEdit={() => setRuleForm({ open: true, rule: r })} />
            ))}
          </ul>
        )}
        <p className="mt-2 px-1 text-xs text-muted">
          Los pagos de tarjetas y las cuotas de préstamos se calculan solos: no crees reglas para
          ellos.
        </p>
      </section>

      <RuleFormSheet
        open={ruleForm.open}
        onOpenChange={(o) => setRuleForm((f) => ({ ...f, open: o }))}
        rule={ruleForm.rule}
      />
      <ScheduledFormSheet
        open={itemForm.open}
        onOpenChange={(o) => setItemForm((f) => ({ ...f, open: o }))}
        item={itemForm.item}
      />
      <CompleteSheet item={completing} onClose={() => setCompleting(null)} />
    </div>
  );
}

function RuleRow({ rule: r, onEdit }: { rule: RecurringRuleDTO; onEdit: () => void }) {
  const toast = useToast();
  const handleConflict = useConflict();
  const togglePause = useCrudMutation(
    () => api.put(`/recurring/${r.id}`, ruleBody(r, !r.isActive)),
    'Regla actualizada',
  );
  return (
    <li className="flex items-center gap-1 pr-2">
      <button
        type="button"
        onClick={onEdit}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate font-medium', !r.isActive && 'text-muted')}>
            {r.name}
          </span>
          <span className="block text-xs text-muted">
            {FREQUENCY_LABELS[r.frequency]} ·{' '}
            {r.isActive
              ? r.nextDate
                ? `próxima ${formatShortDate(r.nextDate)}`
                : 'terminada'
              : 'pausada'}
          </span>
        </span>
        <Amount
          value={r.amount}
          tone={r.kind === 'INCOME' ? 'income' : 'neutral'}
          className="font-semibold"
        />
      </button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`${r.isActive ? 'Pausar' : 'Reanudar'} ${r.name}`}
        loading={togglePause.isPending}
        onClick={() =>
          togglePause.mutate(undefined, {
            onError: (err) => {
              if (!handleConflict(err)) toast.show({ message: err.message, tone: 'error' });
            },
          })
        }
      >
        {r.isActive ? 'Pausar' : 'Reanudar'}
      </Button>
    </li>
  );
}

function UpcomingRow({
  item,
  today,
  onComplete,
  onEdit,
  onPayDerived,
}: {
  item: ScheduledItemDTO;
  today: string;
  onComplete: () => void;
  onEdit: () => void;
  onPayDerived: () => void;
}) {
  const overdue = item.dueDate < today;
  const income = item.kind === 'INCOME';
  const source = refName(item.creditCard) ?? refName(item.account);
  const toast = useToast();
  const handleConflict = useConflict();
  const skip = useCrudMutation(() => api.post(`/scheduled/${item.id}/skip`), 'Omitido');
  const remove = useCrudMutation(() => api.del(`/scheduled/${item.id}`), 'Eliminado');
  const skipping = skip.isPending;
  const removing = remove.isPending;
  const busy = skipping || removing;
  const onError = (err: ApiError) => {
    if (!handleConflict(err)) toast.show({ message: err.message, tone: 'error' });
  };
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.name}</p>
          <p className={cn('text-xs', overdue ? 'font-medium text-negative' : 'text-muted')}>
            {overdue
              ? `${income ? 'Esperado desde el' : 'Vencida el'} ${formatShortDate(item.dueDate)}`
              : `Vence ${formatShortDate(item.dueDate)}`}
            {source ? ` · ${source}` : ''}
          </p>
        </div>
        <Amount
          value={item.amount}
          tone={income ? 'income' : 'neutral'}
          className="font-semibold"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {item.derived ? (
          <>
            <Button size="sm" aria-label={`Pagar ${item.name}`} onClick={onPayDerived}>
              Pagar
            </Button>
            <Link
              to={item.derived === 'CARD' ? `/cards/${item.sourceId}` : '/debts'}
              className="inline-flex min-h-11 items-center px-2 text-sm text-primary"
            >
              {item.derived === 'CARD' ? 'Ver tarjeta' : 'Ver préstamo'}
            </Link>
          </>
        ) : (
          <>
            <Button
              size="sm"
              aria-label={`${income ? 'Recibir' : 'Pagar'} ${item.name}`}
              disabled={busy}
              onClick={onComplete}
            >
              {income ? 'Recibir' : 'Pagar'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Omitir ${item.name}`}
              loading={skipping}
              disabled={busy}
              onClick={() => skip.mutate(undefined, { onError })}
            >
              Omitir
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Editar ${item.name}`}
              disabled={busy}
              onClick={onEdit}
            >
              Editar
            </Button>
            {!item.recurringRuleId && (
              <ConfirmButton
                size="sm"
                aria-label={`Eliminar ${item.name}`}
                loading={removing}
                disabled={busy}
                onConfirm={() => remove.mutate(undefined, { onError })}
              >
                Eliminar
              </ConfirmButton>
            )}
          </>
        )}
      </div>
    </li>
  );
}
