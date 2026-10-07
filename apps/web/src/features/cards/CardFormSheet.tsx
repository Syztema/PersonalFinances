import { formatCOP, type CreditCardDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { ColorPicker } from '../../components/ui/Pickers';
import { Sheet } from '../../components/ui/Sheet';
import { api, type ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';

export function CardFormSheet({
  open,
  onOpenChange,
  card,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  card?: CreditCardDTO;
  onDeleted?: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={card ? 'Editar tarjeta' : 'Nueva tarjeta'}
    >
      {open && <CardForm card={card} onDone={() => onOpenChange(false)} onDeleted={onDeleted} />}
    </Sheet>
  );
}

const day = (v: string) => v.replace(/\D/g, '').slice(0, 2);

function CardForm({
  card,
  onDone,
  onDeleted,
}: {
  card?: CreditCardDTO;
  onDone: () => void;
  onDeleted?: () => void;
}) {
  const today = useToday();
  const [name, setName] = useState(card?.name ?? '');
  const [issuer, setIssuer] = useState(card?.issuer ?? '');
  const [creditLimit, setCreditLimit] = useState<number | null>(card?.creditLimit ?? null);
  const [statementDay, setStatementDay] = useState(String(card?.statementDay ?? ''));
  const [paymentDueDay, setPaymentDueDay] = useState(String(card?.paymentDueDay ?? ''));
  const [initialDebt, setInitialDebt] = useState<number | null>(card?.initialDebt ?? null);
  const [initialInstallments, setInitialInstallments] = useState(
    String(card?.initialDebtInstallments ?? 1),
  );
  const [openingDate, setOpeningDate] = useState(card?.openingDate ?? today);
  const [color, setColor] = useState(card?.color ?? '#820ad1');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const save = useCrudMutation(
    (body: Record<string, unknown>) =>
      card ? api.put(`/credit-cards/${card.id}`, body) : api.post('/credit-cards', body),
    card ? 'Tarjeta actualizada' : 'Tarjeta creada',
  );
  const archive = useCrudMutation(
    () => api.put(`/credit-cards/${card!.id}`, { isActive: !card!.isActive }),
    card?.isActive ? 'Tarjeta archivada' : 'Tarjeta reactivada',
  );
  const remove = useCrudMutation(() => api.del(`/credit-cards/${card!.id}`), 'Tarjeta eliminada');
  const onError = (err: ApiError) => {
    const mapped = toFormErrors(err, ['name', 'creditLimit', 'statementDay', 'paymentDueDay']);
    setFields(mapped);
    setError(mapped._ ?? null);
  };

  const submit = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Escribe un nombre';
    if (!creditLimit) next.creditLimit = 'Escribe el cupo total';
    const s = Number(statementDay);
    const p = Number(paymentDueDay);
    if (!(s >= 1 && s <= 31)) next.statementDay = 'Día entre 1 y 31';
    if (!(p >= 1 && p <= 31)) next.paymentDueDay = 'Día entre 1 y 31';
    setFields(next);
    if (Object.keys(next).length > 0) return;
    save.mutate(
      {
        name,
        issuer: issuer || null,
        creditLimit,
        statementDay: s,
        paymentDueDay: p,
        initialDebt: initialDebt ?? 0,
        initialDebtInstallments: Number(initialInstallments) || 1,
        openingDate,
        color,
        icon: 'credit-card',
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
      <Field label="Nombre" htmlFor="card-name" error={fields.name}>
        <TextInput
          id="card-name"
          maxLength={60}
          placeholder="Nu Crédito"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Banco o plataforma (opcional)" htmlFor="card-issuer">
        <TextInput
          id="card-issuer"
          maxLength={60}
          value={issuer}
          onChange={(e) => setIssuer(e.target.value)}
        />
      </Field>
      <Field label="Cupo total" htmlFor="card-limit" error={fields.creditLimit}>
        <MoneyInput id="card-limit" value={creditLimit} onChange={setCreditLimit} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Día de corte" htmlFor="card-cut" error={fields.statementDay}>
          <TextInput
            id="card-cut"
            inputMode="numeric"
            value={statementDay}
            onChange={(e) => setStatementDay(day(e.target.value))}
          />
        </Field>
        <Field label="Día límite de pago" htmlFor="card-due" error={fields.paymentDueDay}>
          <TextInput
            id="card-due"
            inputMode="numeric"
            value={paymentDueDay}
            onChange={(e) => setPaymentDueDay(day(e.target.value))}
          />
        </Field>
      </div>
      <Field
        label={card ? 'Deuda inicial (al registrar la tarjeta)' : 'Deuda actual al registrarla'}
        htmlFor="card-debt"
        hint={
          card
            ? `Tu deuda de hoy es ${formatCOP(Math.max(card.debt, 0))}. Cambia este valor solo si quedó mal registrado.`
            : 'Lo que ya debes hoy en esta tarjeta (no se cuenta como gasto de este mes).'
        }
      >
        <MoneyInput id="card-debt" value={initialDebt} onChange={setInitialDebt} />
      </Field>
      {(initialDebt ?? 0) > 0 && (
        <Field
          label="Cuotas pendientes de esa deuda"
          htmlFor="card-inst"
          hint="Si la pagas completa el próximo mes, deja 1."
        >
          <TextInput
            id="card-inst"
            inputMode="numeric"
            value={initialInstallments}
            onChange={(e) => setInitialInstallments(e.target.value.replace(/\D/g, '').slice(0, 2))}
          />
        </Field>
      )}
      <Field label="Fecha de registro" htmlFor="card-date">
        <TextInput
          id="card-date"
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
        Guardar tarjeta
      </Button>
      {card && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            loading={archive.isPending}
            onClick={() => archive.mutate(undefined, { onSuccess: onDone, onError })}
          >
            {card.isActive ? 'Archivar' : 'Reactivar'}
          </Button>
          <ConfirmButton
            loading={remove.isPending}
            onConfirm={() =>
              remove.mutate(undefined, {
                onSuccess: () => {
                  onDone();
                  onDeleted?.();
                },
                onError,
              })
            }
          >
            Eliminar
          </ConfirmButton>
        </div>
      )}
    </form>
  );
}
