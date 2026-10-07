import type { AccountDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { NegativeToggle } from '../../components/ui/NegativeToggle';
import { Sheet } from '../../components/ui/Sheet';
import { api } from '../../lib/api';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { DateChips } from '../quick-add/DateChips';

/** Spec 8.13: el usuario indica el saldo real y se registra la diferencia como "Ajuste de saldo". */
export function AdjustBalanceSheet({
  account,
  onClose,
}: {
  account: AccountDTO | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={account !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Ajustar saldo"
      description='Registramos la diferencia como "Ajuste de saldo"; después puedes editarlo o eliminarlo.'
    >
      {account && <AdjustForm account={account} onDone={onClose} />}
    </Sheet>
  );
}

function AdjustForm({ account, onDone }: { account: AccountDTO; onDone: () => void }) {
  const today = useToday();
  const [actual, setActual] = useState<number | null>(null);
  const [negative, setNegative] = useState(false);
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const save = useCrudMutation(
    (body: { actualBalance: number; date: string }) =>
      api.post(`/accounts/${account.id}/adjust`, body),
    'Saldo ajustado',
  );
  const target = actual === null ? null : negative ? -actual : actual;
  const diff = target === null ? 0 : target - account.balance;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (save.isPending) return;
        setError(null);
        setFieldError(undefined);
        if (target === null) return setError('Escribe el saldo real');
        save.mutate(
          { actualBalance: target, date },
          {
            onSuccess: onDone,
            onError: (err) => {
              if (err.fields?.actualBalance) setFieldError(err.fields.actualBalance);
              else setError(err.message);
            },
          },
        );
      }}
    >
      <p className="text-sm text-muted">
        Saldo en la app ({account.name}):{' '}
        <Amount value={account.balance} tone="balance" className="font-medium text-fg" />
      </p>
      <Field label="Saldo real hoy" htmlFor="adj-actual" error={fieldError}>
        <MoneyInput id="adj-actual" value={actual} onChange={setActual} />
      </Field>
      <NegativeToggle checked={negative} onChange={setNegative} />
      {diff !== 0 && (
        <p className="text-sm">
          Se registrará {diff > 0 ? 'un ingreso' : 'un gasto'} de{' '}
          <Amount value={Math.abs(diff)} className="font-semibold" />.
        </p>
      )}
      <DateChips value={date} onChange={setDate} today={today} />
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar ajuste
      </Button>
    </form>
  );
}
