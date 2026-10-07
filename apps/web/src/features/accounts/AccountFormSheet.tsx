import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  formatCOP,
  type AccountDTO,
  type AccountType,
} from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { ColorPicker, IconPicker } from '../../components/ui/Pickers';
import { Sheet } from '../../components/ui/Sheet';
import { api, type ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';

const DEFAULT_ICON: Record<AccountType, string> = {
  CASH: 'banknote',
  BANK: 'landmark',
  DIGITAL_WALLET: 'smartphone',
  SAVINGS: 'piggy-bank',
  INVESTMENT: 'trending-up',
  OTHER: 'wallet',
};

export function AccountFormSheet({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account?: AccountDTO;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={account ? 'Editar cuenta' : 'Nueva cuenta'}
    >
      {open && <AccountForm account={account} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function AccountForm({ account, onDone }: { account?: AccountDTO; onDone: () => void }) {
  const today = useToday();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'BANK');
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [initialBalance, setInitialBalance] = useState<number | null>(
    account?.initialBalance ?? null,
  );
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? today);
  const [icon, setIcon] = useState(account?.icon ?? DEFAULT_ICON.BANK);
  const [iconTouched, setIconTouched] = useState(!!account);
  const [color, setColor] = useState(account?.color ?? '#0f766e');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const save = useCrudMutation(
    (body: Record<string, unknown>) =>
      account ? api.put(`/accounts/${account.id}`, body) : api.post('/accounts', body),
    account ? 'Cuenta actualizada' : 'Cuenta creada',
  );
  const archive = useCrudMutation(
    () => api.put(`/accounts/${account!.id}`, { isActive: !account!.isActive }),
    account?.isActive ? 'Cuenta archivada' : 'Cuenta reactivada',
  );
  const remove = useCrudMutation(() => api.del(`/accounts/${account!.id}`), 'Cuenta eliminada');
  const onError = (err: ApiError) => {
    const mapped = toFormErrors(err, ['name', 'initialBalance']);
    setFields(mapped);
    setError(mapped._ ?? null);
  };

  const submit = () => {
    if (!name.trim()) return setFields({ name: 'Escribe un nombre' });
    save.mutate(
      {
        name,
        type,
        institution: institution || null,
        initialBalance: initialBalance ?? 0,
        openingDate,
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
      <Field label="Nombre" htmlFor="acc-name" error={fields.name}>
        <TextInput
          id="acc-name"
          maxLength={60}
          placeholder="Bancolombia, Nequi, Efectivo…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        label="Tipo"
        htmlFor="acc-type"
        hint={
          type === 'SAVINGS' || type === 'INVESTMENT'
            ? 'Cuenta en el dinero total, pero no en el disponible.'
            : undefined
        }
      >
        <Select
          id="acc-type"
          value={type}
          onChange={(e) => {
            const next = e.target.value as AccountType;
            setType(next);
            if (!iconTouched) setIcon(DEFAULT_ICON[next]);
          }}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Entidad (opcional)" htmlFor="acc-inst">
        <TextInput
          id="acc-inst"
          maxLength={60}
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
        />
      </Field>
      <Field
        label={account ? 'Saldo inicial (al registrar la cuenta)' : 'Saldo actual'}
        htmlFor="acc-balance"
        error={fields.initialBalance}
        hint={
          account
            ? `Tu saldo de hoy es ${formatCOP(account.balance)}. Cambia este valor solo si el saldo inicial quedó mal registrado.`
            : 'El saldo que tiene hoy. Los movimientos que registres lo irán ajustando.'
        }
      >
        <MoneyInput id="acc-balance" value={initialBalance} onChange={setInitialBalance} />
      </Field>
      <Field
        label="Fecha de apertura en la app"
        htmlFor="acc-date"
        hint="Movimientos anteriores a esta fecha ya están incluidos en el saldo."
      >
        <TextInput
          id="acc-date"
          type="date"
          max={today}
          value={openingDate}
          onChange={(e) => e.target.value && setOpeningDate(e.target.value)}
        />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Ícono</p>
        <IconPicker
          value={icon}
          onChange={(i) => {
            setIcon(i);
            setIconTouched(true);
          }}
        />
      </div>
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
        Guardar cuenta
      </Button>
      {account && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            loading={archive.isPending}
            onClick={() => archive.mutate(undefined, { onSuccess: onDone, onError })}
          >
            {account.isActive ? 'Archivar' : 'Reactivar'}
          </Button>
          <ConfirmButton
            loading={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}
          >
            Eliminar
          </ConfirmButton>
        </div>
      )}
    </form>
  );
}
