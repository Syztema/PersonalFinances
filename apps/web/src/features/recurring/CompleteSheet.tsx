import type { ScheduledItemDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Select } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { useAccounts, useCards } from '../../lib/queries';
import { useToday } from '../auth/useAuth';
import { DateChips } from '../quick-add/DateChips';
import { useSaveTransaction } from '../quick-add/useSaveTransaction';
import { sourceBody, sourceOptions, sourceValue } from './sources';
import { useConflict } from './useConflict';

export function CompleteSheet({
  item,
  onClose,
}: {
  item: ScheduledItemDTO | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(o) => !o && onClose()}
      title={item?.kind === 'INCOME' ? `Recibir ${item.name}` : `Pagar ${item?.name ?? ''}`}
      description="Crea el movimiento real y marca esta ocurrencia como hecha."
    >
      {item && <CompleteForm item={item} onDone={onClose} />}
    </Sheet>
  );
}

function CompleteForm({ item, onDone }: { item: ScheduledItemDTO; onDone: () => void }) {
  const today = useToday();
  const accounts = useAccounts();
  const cards = useCards();
  const initialSource = sourceValue(item.account, item.creditCard);
  const [amount, setAmount] = useState<number | null>(item.amount);
  const [source, setSource] = useState(initialSource);
  const [date, setDate] = useState(item.dueDate < today ? item.dueDate : today);
  const [error, setError] = useState<string | null>(null);
  const income = item.kind === 'INCOME';
  const save = useSaveTransaction(income ? 'Ingreso registrado' : 'Pago registrado');
  const handleConflict = useConflict();
  const options = sourceOptions(accounts.data ?? [], cards.data ?? [], item.kind, [
    initialSource,
    source,
  ]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!amount || !source) return setError('Escribe el valor y elige la cuenta');
        const { accountId, creditCardId } = sourceBody(source);
        save.submit(
          {
            path: `/scheduled/${item.id}/complete`,
            method: 'POST',
            body: { amount, date, ...(creditCardId ? { creditCardId } : { accountId }) },
          },
          {
            onSuccess: onDone,
            onError: (err) => {
              if (!handleConflict(err, onDone)) setError(err.message);
            },
          },
        );
      }}
    >
      <Field label="Valor" htmlFor="complete-amount">
        <MoneyInput id="complete-amount" value={amount} onChange={setAmount} />
      </Field>
      <Field label={income ? 'Recibido en' : 'Pagado con'} htmlFor="complete-source">
        <Select id="complete-source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Elige una opción</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <DateChips value={date} onChange={setDate} today={today} />
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        {income ? 'Guardar ingreso' : 'Guardar pago'}
      </Button>
    </form>
  );
}
