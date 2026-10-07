import type { DebtDTO, TransactionDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { FrozenNote } from '../../components/ui/FrozenNote';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { formatDate } from '../../lib/format';
import { useAccounts } from '../../lib/queries';
import { frozenHolder, refName } from '../../lib/refs';
import { useToday } from '../auth/useAuth';
import { DateChips } from '../quick-add/DateChips';
import { useSaveTransaction } from '../quick-add/useSaveTransaction';

export function DisbursementSheet({
  debt,
  onClose,
}: {
  debt: DebtDTO | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={debt !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Registrar desembolso"
      description="Dinero adicional del préstamo que entra a tu cuenta. No es un ingreso."
    >
      {debt && <DisbursementForm debtId={debt.id} onDone={onClose} />}
    </Sheet>
  );
}

/** Crear (desde Préstamos) o editar (desde el historial) un desembolso. */
export function DisbursementForm({
  debtId,
  edit,
  onDone,
}: {
  debtId: string;
  edit?: TransactionDTO;
  onDone: () => void;
}) {
  const today = useToday();
  const accounts = useAccounts();
  const [amount, setAmount] = useState<number | null>(edit?.amount ?? null);
  const [accountId, setAccountId] = useState(edit?.account?.id ?? '');
  const [date, setDate] = useState(edit?.date ?? today);
  const [description, setDescription] = useState(edit?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useSaveTransaction(edit ? 'Desembolso actualizado' : 'Desembolso registrado');
  const frozen = frozenHolder(edit);
  const options = (accounts.data ?? []).filter((a) => a.isActive || a.id === edit?.account?.id);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!amount || !accountId) return setError('Escribe el valor y elige la cuenta');
        const body = { amount, accountId, date, description: description || null };
        save.submit(
          edit
            ? {
                path: `/transactions/${edit.id}`,
                method: 'PUT',
                body: {
                  type: 'DEBT_DISBURSEMENT',
                  ...body,
                  debtId,
                  payee: edit.payee,
                  notes: edit.notes,
                  tags: edit.tags,
                },
              }
            : { path: `/debts/${debtId}/disbursements`, method: 'POST', body },
          { onSuccess: onDone, onError: (err) => setError(err.message) },
        );
      }}
    >
      {frozen && <FrozenNote holder={frozen} editable={['la descripción']} />}
      <Field label="Valor" htmlFor="disb-amount">
        <MoneyInput id="disb-amount" value={amount} onChange={setAmount} disabled={!!frozen} />
      </Field>
      <Field label="Recibido en" htmlFor="disb-account">
        <Select
          id="disb-account"
          value={accountId}
          disabled={!!frozen}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">Elige una cuenta</option>
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {refName(a)}
            </option>
          ))}
        </Select>
      </Field>
      {frozen ? (
        <p className="text-sm">{formatDate(date)}</p>
      ) : (
        <DateChips value={date} onChange={setDate} today={today} />
      )}
      <Field label="Descripción (opcional)" htmlFor="disb-description">
        <TextInput
          id="disb-description"
          maxLength={140}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar
      </Button>
    </form>
  );
}
