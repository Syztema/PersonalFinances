import { formatCOP, type DebtDTO, type DeleteResultDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { ColorPicker } from '../../components/ui/Pickers';
import { Sheet } from '../../components/ui/Sheet';
import { api, type ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { useAccounts } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';

export function DebtFormSheet({
  open,
  onOpenChange,
  debt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  debt?: DebtDTO;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={debt ? 'Editar préstamo' : 'Nuevo préstamo'}
    >
      {open && <DebtForm debt={debt} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function DebtForm({ debt, onDone }: { debt?: DebtDTO; onDone: () => void }) {
  const today = useToday();
  const accounts = useAccounts();
  const [name, setName] = useState(debt?.name ?? '');
  const [lender, setLender] = useState(debt?.lender ?? '');
  const [balance, setBalance] = useState<number | null>(debt?.initialBalance ?? null);
  const [monthlyPayment, setMonthlyPayment] = useState<number | null>(debt?.monthlyPayment ?? null);
  const [paymentDay, setPaymentDay] = useState(debt?.paymentDay ? String(debt.paymentDay) : '');
  const [receivedIn, setReceivedIn] = useState('');
  const [openingDate, setOpeningDate] = useState(debt?.openingDate ?? today);
  const [color, setColor] = useState(debt?.color ?? '#0f766e');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const save = useCrudMutation(
    (body: Record<string, unknown>) =>
      debt ? api.put(`/debts/${debt.id}`, body) : api.post('/debts', body),
    debt ? 'Préstamo actualizado' : 'Préstamo creado',
  );
  const remove = useCrudMutation(
    () => api.del<DeleteResultDTO>(`/debts/${debt!.id}`),
    (r) =>
      r.deleted === 'soft' ? 'Préstamo eliminado: se conserva su historial' : 'Préstamo eliminado',
  );
  const onError = (err: ApiError) => {
    const mapped = toFormErrors(err, ['name', 'initialBalance', 'paymentDay']);
    setFields(mapped);
    setError(mapped._ ?? null);
  };

  const submit = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Escribe un nombre';
    if (!debt && !balance)
      next.initialBalance = receivedIn ? 'Escribe el valor recibido' : 'Escribe cuánto debes hoy';
    const pDay = paymentDay ? Number(paymentDay) : null;
    if (pDay !== null && !(pDay >= 1 && pDay <= 31)) next.paymentDay = 'Día entre 1 y 31';
    setFields(next);
    if (Object.keys(next).length > 0) return;
    const common = {
      name,
      lender: lender || null,
      monthlyPayment,
      paymentDay: pDay,
      openingDate,
      color,
      icon: 'landmark',
    };
    save.mutate(
      debt
        ? { ...common, initialBalance: balance ?? 0 }
        : { ...common, initialBalance: balance ?? 0, receivedInAccountId: receivedIn || null },
      { onSuccess: onDone, onError },
    );
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Nombre" htmlFor="debt-name" error={fields.name}>
        <TextInput
          id="debt-name"
          maxLength={60}
          placeholder="Crédito libre inversión"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Acreedor (opcional)" htmlFor="debt-lender">
        <TextInput
          id="debt-lender"
          maxLength={60}
          value={lender}
          onChange={(e) => setLender(e.target.value)}
        />
      </Field>
      {!debt && (
        <Field
          label="¿Recibiste el dinero ahora?"
          htmlFor="debt-received"
          hint="Si lo recibes en una cuenta, entra como deuda, no como ingreso."
        >
          <Select
            id="debt-received"
            value={receivedIn}
            onChange={(e) => setReceivedIn(e.target.value)}
          >
            <option value="">No, ya lo debía</option>
            {(accounts.data ?? [])
              .filter((a) => a.isActive)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  Sí, en {a.name}
                </option>
              ))}
          </Select>
        </Field>
      )}
      <Field
        label={
          receivedIn
            ? 'Valor recibido'
            : debt
              ? 'Saldo inicial (al registrar el préstamo)'
              : 'Saldo que debes hoy'
        }
        hint={
          debt && !receivedIn
            ? `El saldo de hoy es ${formatCOP(debt.balance)}. Cambia este valor solo si quedó mal registrado.`
            : undefined
        }
        htmlFor="debt-balance"
        error={fields.initialBalance}
      >
        <MoneyInput id="debt-balance" value={balance} onChange={setBalance} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cuota mensual" htmlFor="debt-payment">
          <MoneyInput id="debt-payment" value={monthlyPayment} onChange={setMonthlyPayment} />
        </Field>
        <Field label="Día de pago" htmlFor="debt-day" error={fields.paymentDay}>
          <TextInput
            id="debt-day"
            inputMode="numeric"
            value={paymentDay}
            onChange={(e) => setPaymentDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
          />
        </Field>
      </div>
      <Field label="Fecha" htmlFor="debt-date">
        <TextInput
          id="debt-date"
          type="date"
          max={today}
          value={openingDate}
          onChange={(e) => e.target.value && setOpeningDate(e.target.value)}
        />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Color</p>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar préstamo
      </Button>
      {debt && (
        <div className="space-y-2">
          <ConfirmButton
            size="lg"
            loading={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}
          >
            Eliminar préstamo
          </ConfirmButton>
          <p className="text-xs text-muted">
            Para eliminarlo debe tener saldo $0. Si tiene movimientos, se oculta y su historial se
            conserva.
          </p>
        </div>
      )}
    </form>
  );
}
