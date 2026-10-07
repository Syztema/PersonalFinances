import { formatCOP, type GoalDTO } from '@finanzas/shared';
import { Plus, Target } from 'lucide-react';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { CardTitle } from '../../components/ui/Card';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { formatDate, formatPercent } from '../../lib/format';
import { Icon } from '../../lib/icons';
import { useGoals } from '../../lib/queries';
import { refName } from '../../lib/refs';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { GoalFormSheet } from './GoalFormSheet';
import { GoalMoneySheet, type GoalMoneyMode } from './GoalMoneySheet';

export function GoalsPage() {
  const goals = useGoals();
  const toast = useToast();
  const [form, setForm] = useState<{ open: boolean; goal?: GoalDTO }>({ open: false });
  const [money, setMoney] = useState<{ goal: GoalDTO; mode: GoalMoneyMode } | null>(null);
  const setStatus = useCrudMutation(
    (v: { id: string; status: 'ACTIVE' | 'COMPLETED' }) =>
      api.put(`/goals/${v.id}`, { status: v.status }),
    'Meta actualizada',
  );
  if (goals.isPending) return <PageSpinner />;
  if (goals.isError) return <ErrorState error={goals.error} onRetry={() => void goals.refetch()} />;
  const active = goals.data.filter((g) => g.status === 'ACTIVE');
  const done = goals.data.filter((g) => g.status === 'COMPLETED');
  const pendingFor = (id: string) => setStatus.isPending && setStatus.variables?.id === id;
  const changeStatus = (id: string, status: 'ACTIVE' | 'COMPLETED') => {
    if (setStatus.isPending) return;
    setStatus.mutate(
      { id, status },
      { onError: (err) => toast.show({ message: err.message, tone: 'error' }) },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Metas</h1>
        <Button size="sm" aria-label="Nueva meta" onClick={() => setForm({ open: true })}>
          <Plus size={16} /> Nueva
        </Button>
      </div>
      {goals.data.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="Aún no tienes metas"
          description="Una meta vive en una cuenta de ahorro o inversión: abonar es transferir, no gastar."
        />
      ) : (
        <ul className="space-y-3">
          {active.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              completing={pendingFor(g.id)}
              onContribute={() => setMoney({ goal: g, mode: 'contribute' })}
              onWithdraw={() => setMoney({ goal: g, mode: 'withdraw' })}
              onEdit={() => setForm({ open: true, goal: g })}
              onComplete={() => changeStatus(g.id, 'COMPLETED')}
            />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <section>
          <CardTitle className="mb-2 px-1">Completadas</CardTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
            {done.map((g) => (
              <li key={g.id} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
                <span className="min-w-0 truncate">
                  {g.name} · <Amount value={g.progress} tone="balance" />
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={pendingFor(g.id)}
                  onClick={() => changeStatus(g.id, 'ACTIVE')}
                >
                  Reabrir
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <GoalFormSheet
        open={form.open}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        goal={form.goal}
      />
      <GoalMoneySheet target={money} onClose={() => setMoney(null)} />
    </div>
  );
}

function GoalCard({
  goal,
  completing,
  onContribute,
  onWithdraw,
  onEdit,
  onComplete,
}: {
  goal: GoalDTO;
  completing: boolean;
  onContribute: () => void;
  onWithdraw: () => void;
  onEdit: () => void;
  onComplete: () => void;
}) {
  const today = useToday();
  return (
    <li className="rounded-2xl bg-surface p-4 ring-1 ring-border">
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: goal.color }}
        >
          <Icon name={goal.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{goal.name}</p>
          <p className="text-xs text-muted">
            En {refName(goal.account)}
            {goal.targetDate ? ` · para el ${formatDate(goal.targetDate)}` : ''}
          </p>
        </div>
        <span className="text-sm font-medium">{formatPercent(goal.pct)}</span>
      </div>
      <p className="mt-3 text-sm">
        <Amount value={goal.progress} tone="balance" className="font-semibold" /> de{' '}
        <Amount value={goal.targetAmount} />
      </p>
      <div className="mt-2">
        <ProgressBar value={goal.pct} label={`Avance de ${goal.name}`} tone="positive" />
      </div>
      {goal.pct >= 1 ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-positive/10 p-3 text-sm text-positive">
          ¡Llegaste a la meta!
          <Button size="sm" loading={completing} onClick={onComplete}>
            Marcar como completada
          </Button>
        </div>
      ) : goal.monthlyNeeded !== null ? (
        <p className="mt-2 text-xs text-muted">
          Te faltan {formatCOP(goal.remaining)}: ahorra {formatCOP(goal.monthlyNeeded)} al mes (
          {formatCOP(goal.weeklyNeeded ?? 0)} a la semana).
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">Te faltan {formatCOP(goal.remaining)}.</p>
      )}
      {goal.pct < 1 && goal.targetDate && goal.targetDate < today && (
        <p className="mt-1 text-xs text-warning">La fecha objetivo ya pasó.</p>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button size="sm" onClick={onContribute}>
          Abonar
        </Button>
        <Button size="sm" variant="secondary" disabled={goal.progress <= 0} onClick={onWithdraw}>
          Retirar
        </Button>
        <Button size="sm" variant="secondary" onClick={onEdit}>
          Editar
        </Button>
      </div>
    </li>
  );
}
