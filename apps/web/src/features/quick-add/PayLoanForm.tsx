import type { TransactionDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { FrozenLocked } from '../../components/ui/FrozenNote';
import { Chips } from '../../components/ui/Chips';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field, Select } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { PageSpinner } from '../../components/ui/Spinner';
import { useAccounts, useDebts } from '../../lib/queries';
import { frozenHolder } from '../../lib/refs';
import { useToday } from '../auth/useAuth';
import { DateChips } from './DateChips';
import { NeedsAccount } from './NeedsAccount';
import { toFormErrors } from '../../lib/formErrors';
import { useSaveTransaction } from './useSaveTransaction';

export function PayLoanForm({
  debtId,
  edit,
  onDone,
}: {
  debtId?: string;
  edit?: TransactionDTO;
  onDone: () => void;
}) {
  const today = useToday();
  const debts = useDebts();
  const accounts = useAccounts();
  const save = useSaveTransaction(edit ? 'Pago actualizado' : 'Pago de préstamo registrado');
  const [selected, setSelected] = useState(edit?.debt?.id ?? debtId ?? '');
  const [accountId, setAccountId] = useState(edit?.account?.id ?? '');
  const [principal, setPrincipal] = useState<number | null>(edit?.amount ?? null);
  const [interest, setInterest] = useState<number | null>(edit?.interest || null);
  const [date, setDate] = useState(edit?.date ?? today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const frozen = frozenHolder(edit);

  if (debts.isPending || accounts.isPending) return <PageSpinner />;
  if (frozen) return <FrozenLocked holder={frozen} onClose={onDone} />;
  const debtList = (debts.data ?? []).filter((d) => d.isActive || d.id === edit?.debt?.id);
  const accountList = (accounts.data ?? []).filter((a) => a.isActive || a.id === edit?.account?.id);
  if (debtList.length === 0)
    return (
      <EmptyState
        title="No tienes préstamos registrados"
        description="Agrégalos en Más → Préstamos."
      />
    );
  if (accountList.length === 0) return <NeedsAccount onNavigate={onDone} />;
  const debt = debtList.find((d) => d.id === (selected || debtList[0]!.id))!;

  const submit = () => {
    const next: Record<string, string> = {};
    if (!principal) next.amount = 'Escribe el abono a capital';
    if (!accountId) next.accountId = 'Elige la cuenta desde la que pagas';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    save.submit(
      edit
        ? {
            path: `/transactions/${edit.id}`,
            method: 'PUT',
            body: {
              type: 'DEBT_PAYMENT',
              amount: principal,
              interest: interest ?? 0,
              date,
              accountId,
              debtId: debt.id,
              description: edit.description,
              tags: edit.tags,
              payee: edit.payee,
              notes: edit.notes,
            },
          }
        : {
            path: `/debts/${debt.id}/payments`,
            method: 'POST',
            body: { accountId, principal, interest: interest ?? 0, date },
          },
      {
        onSuccess: onDone,
        onError: (err) => {
          const mapped = toFormErrors(err, ['amount', 'principal', 'interest', 'accountId']);
          setErrors(mapped.principal ? { ...mapped, amount: mapped.principal } : mapped);
        },
      },
    );
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {debtList.length > 1 && (
        <Chips
          ariaLabel="Préstamo"
          value={debt.id}
          onChange={setSelected}
          options={debtList.map((d) => ({ value: d.id, label: d.name }))}
        />
      )}
      <dl className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-3 text-sm">
        <div>
          <dt className="text-muted">Saldo</dt>
          <dd className="text-lg font-semibold">
            <Amount value={debt.balance} tone="debt" />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Cuota pendiente</dt>
          <dd className="text-lg font-semibold">
            <Amount value={debt.installmentDue} />
          </dd>
        </div>
      </dl>
      <Field
        label="Abono a capital"
        htmlFor="principal"
        error={errors.amount}
        hint="Baja el saldo del préstamo. No es un gasto."
      >
        <MoneyInput id="principal" value={principal} onChange={setPrincipal} />
      </Field>
      <Field
        label="Intereses (opcional)"
        htmlFor="interest"
        error={errors.interest}
        hint="Se registran como gasto en Intereses y comisiones."
      >
        <MoneyInput id="interest" value={interest} onChange={setInterest} />
      </Field>
      <Field label="Pagar desde" htmlFor="loanFrom" error={errors.accountId}>
        <Select id="loanFrom" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Elige una cuenta</option>
          {accountList.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Fecha</p>
        <DateChips value={date} onChange={setDate} today={today} />
      </div>
      {errors._ && (
        <p role="alert" className="text-sm text-negative">
          {errors._}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Registrar pago
      </Button>
    </form>
  );
}
