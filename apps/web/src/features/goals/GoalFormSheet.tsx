import type { GoalDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { ColorPicker, IconPicker } from '../../components/ui/Pickers';
import { Sheet } from '../../components/ui/Sheet';
import { PageSpinner } from '../../components/ui/Spinner';
import { api, type ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { useAccounts } from '../../lib/queries';
import { refName } from '../../lib/refs';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { NeedsAccount } from '../quick-add/NeedsAccount';

export function GoalFormSheet({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  goal?: GoalDTO;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={goal ? 'Editar meta' : 'Nueva meta'}>
      {open && <GoalForm goal={goal} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function GoalForm({ goal, onDone }: { goal?: GoalDTO; onDone: () => void }) {
  const today = useToday();
  const accounts = useAccounts();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState<number | null>(goal?.targetAmount ?? null);
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [accountId, setAccountId] = useState(goal?.account.id ?? '');
  const [initial, setInitial] = useState<number | null>(goal?.initialAmount ?? null);
  const [icon, setIcon] = useState(goal?.icon ?? 'target');
  const [color, setColor] = useState(goal?.color ?? '#0ea5e9');
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useCrudMutation(
    (body: Record<string, unknown>) =>
      goal ? api.put(`/goals/${goal.id}`, body) : api.post('/goals', body),
    goal ? 'Meta actualizada' : 'Meta creada',
  );
  const remove = useCrudMutation(() => api.del(`/goals/${goal!.id}`), 'Meta eliminada');
  const onError = (err: ApiError) =>
    setFields(
      toFormErrors(err, ['name', 'targetAmount', 'targetDate', 'accountId', 'initialAmount']),
    );

  if (accounts.isPending) return <PageSpinner />;
  const reserved = (accounts.data ?? []).filter(
    (a) =>
      (a.isActive && (a.type === 'SAVINGS' || a.type === 'INVESTMENT')) ||
      a.id === goal?.account.id,
  );
  if (reserved.length === 0)
    return (
      <NeedsAccount
        onNavigate={onDone}
        title="Primero crea una cuenta de ahorro o inversión"
        description="El dinero de una meta vive en una cuenta de ahorro o inversión: abonar es transferir a esa cuenta, no gastar."
      />
    );
  const chosenAccount = accountId || reserved[0]!.id;

  const submit = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Escribe un nombre';
    if (!target) next.targetAmount = 'Escribe cuánto quieres reunir';
    setFields(next);
    if (Object.keys(next).length > 0) return;
    save.mutate(
      {
        name,
        targetAmount: target,
        targetDate: targetDate || null,
        accountId: chosenAccount,
        initialAmount: initial ?? 0,
        icon,
        color,
      },
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
      <Field label="Nombre" htmlFor="goal-name" error={fields.name}>
        <TextInput
          id="goal-name"
          maxLength={60}
          placeholder="Comprar computador"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Valor objetivo" htmlFor="goal-target" error={fields.targetAmount}>
        <MoneyInput id="goal-target" value={target} onChange={setTarget} />
      </Field>
      <Field
        label="Fecha objetivo (opcional)"
        htmlFor="goal-date"
        error={fields.targetDate}
        hint="Con fecha te decimos cuánto ahorrar cada mes y cada semana."
      >
        <TextInput
          id="goal-date"
          type="date"
          min={goal && goal.targetDate && goal.targetDate < today ? goal.targetDate : today}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </Field>
      <Field label="Cuenta donde guardas el dinero" htmlFor="goal-account" error={fields.accountId}>
        <Select
          id="goal-account"
          value={chosenAccount}
          onChange={(e) => setAccountId(e.target.value)}
        >
          {reserved.map((a) => (
            <option key={a.id} value={a.id}>
              {refName(a)}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Ya tengo ahorrado (opcional)"
        htmlFor="goal-initial"
        error={fields.initialAmount}
        hint="Lo que ya tienes para esta meta. No crea movimientos."
      >
        <MoneyInput id="goal-initial" value={initial} onChange={setInitial} />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Ícono</p>
        <IconPicker value={icon} onChange={setIcon} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Color</p>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {fields._ && (
        <p role="alert" className="text-sm text-negative">
          {fields._}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar meta
      </Button>
      {goal && (
        <div className="space-y-2">
          <ConfirmButton
            size="lg"
            loading={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}
          >
            Eliminar meta
          </ConfirmButton>
          <p className="text-xs text-muted">
            Sus abonos y retiros quedan en el historial como transferencias normales.
          </p>
        </div>
      )}
    </form>
  );
}
