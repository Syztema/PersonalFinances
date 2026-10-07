import { ACCOUNT_TYPE_LABELS, type TransactionDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { FrozenNote } from '../../components/ui/FrozenNote';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { PageSpinner } from '../../components/ui/Spinner';
import { formatDate } from '../../lib/format';
import { useAccounts } from '../../lib/queries';
import { frozenHolder, refName } from '../../lib/refs';
import { useToday } from '../auth/useAuth';
import { DateChips } from './DateChips';
import { NeedsAccount } from './NeedsAccount';
import { toFormErrors } from '../../lib/formErrors';
import { useSaveTransaction } from './useSaveTransaction';

export function TransferForm({ edit, onDone }: { edit?: TransactionDTO; onDone: () => void }) {
  const today = useToday();
  const accounts = useAccounts();
  const save = useSaveTransaction(edit ? 'Transferencia actualizada' : 'Transferencia guardada');
  const [amount, setAmount] = useState<number | null>(edit?.amount ?? null);
  const [from, setFrom] = useState(edit?.account?.id ?? '');
  const [to, setTo] = useState(edit?.toAccount?.id ?? '');
  const [date, setDate] = useState(edit?.date ?? today);
  const [description, setDescription] = useState(edit?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const frozen = frozenHolder(edit);

  if (accounts.isPending) return <PageSpinner />;
  const list = (accounts.data ?? []).filter(
    (a) => a.isActive || a.id === edit?.account?.id || a.id === edit?.toAccount?.id,
  );
  if (list.length < 2)
    return (
      <NeedsAccount
        onNavigate={onDone}
        title="Necesitas al menos dos cuentas"
        description="Para transferir, registra otra cuenta (por ejemplo tu bolsillo de ahorro)."
      />
    );

  const submit = () => {
    const next: Record<string, string> = {};
    if (!amount) next.amount = 'Escribe un valor mayor que $0';
    if (!from) next.accountId = 'Elige la cuenta de origen';
    if (!to) next.toAccountId = 'Elige la cuenta de destino';
    if (from && from === to)
      next.toAccountId = 'La cuenta destino debe ser distinta de la de origen';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const body = {
      amount,
      date,
      accountId: from,
      toAccountId: to,
      description: description || null,
    };
    save.submit(
      edit
        ? {
            path: `/transactions/${edit.id}`,
            method: 'PUT',
            body: {
              type: 'TRANSFER',
              ...body,
              goalId: edit.goalId,
              tags: edit.tags,
              payee: edit.payee,
              notes: edit.notes,
            },
          }
        : { path: '/transfers', method: 'POST', body },
      {
        onSuccess: onDone,
        onError: (err) => setErrors(toFormErrors(err, ['amount', 'accountId', 'toAccountId'])),
      },
    );
  };

  const options = list.map((a) => (
    <option key={a.id} value={a.id}>
      {refName(a)} · {ACCOUNT_TYPE_LABELS[a.type]}
    </option>
  ));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {frozen && <FrozenNote holder={frozen} editable={['la descripción']} />}
      <div>
        <MoneyInput
          aria-label="Valor"
          size="lg"
          autoFocus={!edit}
          disabled={!!frozen}
          value={amount}
          onChange={setAmount}
        />
        {errors.amount && <p className="mt-1 text-center text-sm text-negative">{errors.amount}</p>}
      </div>
      <Field label="Desde" htmlFor="from" error={errors.accountId}>
        <Select
          id="from"
          value={from}
          disabled={!!frozen}
          onChange={(e) => setFrom(e.target.value)}
        >
          <option value="">Elige una cuenta</option>
          {options}
        </Select>
      </Field>
      <Field
        label="Hacia"
        htmlFor="to"
        error={errors.toAccountId}
        hint="Mover dinero entre tus cuentas no es un gasto. Si va a una cuenta de ahorro, cuenta como ahorro."
      >
        <Select id="to" value={to} disabled={!!frozen} onChange={(e) => setTo(e.target.value)}>
          <option value="">Elige una cuenta</option>
          {options}
        </Select>
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Fecha</p>
        {frozen ? (
          <p className="text-sm">{formatDate(date)}</p>
        ) : (
          <DateChips value={date} onChange={setDate} today={today} />
        )}
      </div>
      <Field label="Descripción (opcional)" htmlFor="tdesc">
        <TextInput
          id="tdesc"
          maxLength={140}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {errors._ && (
        <p role="alert" className="text-sm text-negative">
          {errors._}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar
      </Button>
    </form>
  );
}
