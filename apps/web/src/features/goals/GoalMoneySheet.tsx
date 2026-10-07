import { formatCOP, type GoalDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/EmptyState';
import { Field, Select } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { PageSpinner } from '../../components/ui/Spinner';
import { toFormErrors } from '../../lib/formErrors';
import { useAccounts } from '../../lib/queries';
import { refName } from '../../lib/refs';
import { useToday } from '../auth/useAuth';
import { DateChips } from '../quick-add/DateChips';
import { useSaveTransaction } from '../quick-add/useSaveTransaction';

export type GoalMoneyMode = 'contribute' | 'withdraw';

export function GoalMoneySheet({
  target,
  onClose,
}: {
  target: { goal: GoalDTO; mode: GoalMoneyMode } | null;
  onClose: () => void;
}) {
  const title = !target
    ? ''
    : target.mode === 'contribute'
      ? `Abonar a ${target.goal.name}`
      : `Retirar de ${target.goal.name}`;
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description="Es una transferencia entre tus cuentas: no es un gasto ni un ingreso."
    >
      {target && <GoalMoneyForm goal={target.goal} mode={target.mode} onDone={onClose} />}
    </Sheet>
  );
}

function GoalMoneyForm({
  goal,
  mode,
  onDone,
}: {
  goal: GoalDTO;
  mode: GoalMoneyMode;
  onDone: () => void;
}) {
  const today = useToday();
  const accounts = useAccounts();
  const [amount, setAmount] = useState<number | null>(null);
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(today);
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useSaveTransaction(mode === 'contribute' ? 'Abono registrado' : 'Retiro registrado');
  const others = (accounts.data ?? []).filter((a) => a.isActive && a.id !== goal.account.id);
  const noOthers = !accounts.isPending && !accounts.isError && others.length === 0;
  const accountKey = mode === 'contribute' ? 'fromAccountId' : 'toAccountId';

  if (accounts.isPending) return <PageSpinner />;
  if (accounts.isError)
    return <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const next: Record<string, string> = {};
        if (!amount) next.amount = 'Escribe el valor';
        if (!accountId) next[accountKey] = 'Elige una cuenta';
        setFields(next);
        if (Object.keys(next).length > 0) return;
        save.submit(
          {
            path: `/goals/${goal.id}/${mode === 'contribute' ? 'contributions' : 'withdrawals'}`,
            method: 'POST',
            body:
              mode === 'contribute'
                ? { fromAccountId: accountId, amount, date }
                : { toAccountId: accountId, amount, date },
          },
          {
            onSuccess: onDone,
            onError: (err) =>
              setFields(toFormErrors(err, ['amount', 'fromAccountId', 'toAccountId'])),
          },
        );
      }}
    >
      <Field
        label="Valor"
        htmlFor="goal-money-amount"
        error={fields.amount}
        hint={mode === 'withdraw' ? `Máximo ${formatCOP(goal.progress)}` : undefined}
      >
        <MoneyInput id="goal-money-amount" value={amount} onChange={setAmount} />
      </Field>
      {noOthers ? (
        <p className="text-sm text-muted">Necesitas otra cuenta activa para abonar o retirar.</p>
      ) : (
        <Field
          label={mode === 'contribute' ? 'Desde la cuenta' : 'Hacia la cuenta'}
          htmlFor="goal-money-account"
          error={fields[accountKey]}
        >
          <Select
            id="goal-money-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Elige una cuenta</option>
            {others.map((a) => (
              <option key={a.id} value={a.id}>
                {refName(a)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <DateChips value={date} onChange={setDate} today={today} />
      {fields._ && (
        <p role="alert" className="text-sm text-negative">
          {fields._}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        loading={save.isPending}
        disabled={save.isPending || noOthers}
      >
        Guardar
      </Button>
    </form>
  );
}
