import type { DebtDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Select } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { api } from '../../lib/api';
import { useAccounts } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { DateChips } from '../quick-add/DateChips';

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
      {debt && <DisbursementForm debt={debt} onDone={onClose} />}
    </Sheet>
  );
}

function DisbursementForm({ debt, onDone }: { debt: DebtDTO; onDone: () => void }) {
  const today = useToday();
  const accounts = useAccounts();
  const [amount, setAmount] = useState<number | null>(null);
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const save = useCrudMutation(
    (body: Record<string, unknown>) => api.post(`/debts/${debt.id}/disbursements`, body),
    'Desembolso registrado',
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!amount || !accountId) return setError('Escribe el valor y elige la cuenta');
        save.mutate(
          { amount, accountId, date },
          { onSuccess: onDone, onError: (err) => setError(err.message) },
        );
      }}
    >
      <Field label="Valor" htmlFor="disb-amount">
        <MoneyInput id="disb-amount" value={amount} onChange={setAmount} />
      </Field>
      <Field label="Recibido en" htmlFor="disb-account">
        <Select id="disb-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Elige una cuenta</option>
          {(accounts.data ?? [])
            .filter((a) => a.isActive)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
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
        Guardar
      </Button>
    </form>
  );
}
