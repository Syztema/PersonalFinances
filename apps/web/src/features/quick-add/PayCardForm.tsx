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
import { formatShortDate } from '../../lib/format';
import { useAccounts, useCards } from '../../lib/queries';
import { frozenHolder } from '../../lib/refs';
import { useToday } from '../auth/useAuth';
import { DateChips } from './DateChips';
import { NeedsAccount } from './NeedsAccount';
import { toFormErrors } from '../../lib/formErrors';
import { useSaveTransaction } from './useSaveTransaction';

export function PayCardForm({
  cardId,
  edit,
  onDone,
}: {
  cardId?: string;
  edit?: TransactionDTO;
  onDone: () => void;
}) {
  const today = useToday();
  const cards = useCards();
  const accounts = useAccounts();
  const save = useSaveTransaction(edit ? 'Pago actualizado' : 'Pago de tarjeta registrado');
  const [selectedCard, setSelectedCard] = useState(edit?.creditCard?.id ?? cardId ?? '');
  const [accountId, setAccountId] = useState(edit?.account?.id ?? '');
  const [amount, setAmount] = useState<number | null>(edit?.amount ?? null);
  const [date, setDate] = useState(edit?.date ?? today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const frozen = frozenHolder(edit);

  if (cards.isPending || accounts.isPending) return <PageSpinner />;
  if (frozen) return <FrozenLocked holder={frozen} onClose={onDone} />;
  const cardList = (cards.data ?? []).filter((c) => c.isActive || c.id === edit?.creditCard?.id);
  const accountList = (accounts.data ?? []).filter((a) => a.isActive || a.id === edit?.account?.id);
  if (cardList.length === 0)
    return (
      <EmptyState
        title="No tienes tarjetas registradas"
        description="Agrégalas en Más → Tarjetas."
      />
    );
  if (accountList.length === 0) return <NeedsAccount onNavigate={onDone} />;

  const card = cardList.find((c) => c.id === (selectedCard || cardList[0]!.id))!;
  // Al editar, la deuda mostrada no debe descontar el propio pago.
  const debt = card.debt + (edit?.creditCard?.id === card.id ? edit.amount : 0);

  const submit = () => {
    const next: Record<string, string> = {};
    if (!amount) next.amount = 'Escribe el valor a pagar';
    else if (amount > debt) next.amount = 'El pago no puede superar la deuda de la tarjeta';
    if (!accountId) next.accountId = 'Elige la cuenta desde la que pagas';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const body = { amount, date, accountId, description: null };
    save.submit(
      edit
        ? {
            path: `/transactions/${edit.id}`,
            method: 'PUT',
            body: {
              type: 'CARD_PAYMENT',
              ...body,
              creditCardId: card.id,
              tags: edit.tags,
              description: edit.description,
              payee: edit.payee,
              notes: edit.notes,
            },
          }
        : { path: `/credit-cards/${card.id}/payment`, method: 'POST', body },
      {
        onSuccess: onDone,
        onError: (err) => setErrors(toFormErrors(err, ['amount', 'accountId'])),
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
      {cardList.length > 1 && (
        <Chips
          ariaLabel="Tarjeta"
          value={card.id}
          onChange={setSelectedCard}
          options={cardList.map((c) => ({ value: c.id, label: c.name }))}
        />
      )}
      <dl className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-3 text-sm">
        <div>
          <dt className="text-muted">Deuda actual</dt>
          <dd className="text-lg font-semibold">
            <Amount value={Math.max(debt, 0)} tone="debt" />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Pago del mes</dt>
          <dd className="text-lg font-semibold">
            <Amount value={card.amountDue} />
          </dd>
          {card.amountDue > 0 && (
            <dd className="text-xs text-muted">vence {formatShortDate(card.dueDate)}</dd>
          )}
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={card.amountDue <= 0}
          onClick={() => setAmount(card.amountDue)}
        >
          Pago del mes
        </Button>
        <Button size="sm" variant="secondary" disabled={debt <= 0} onClick={() => setAmount(debt)}>
          Pago total
        </Button>
      </div>
      <div>
        <MoneyInput aria-label="Valor del pago" size="lg" value={amount} onChange={setAmount} />
        {errors.amount && <p className="mt-1 text-center text-sm text-negative">{errors.amount}</p>}
      </div>
      <Field label="Pagar desde" htmlFor="payFrom" error={errors.accountId}>
        <Select id="payFrom" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
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
      <p className="text-xs text-muted">
        Este pago baja tu cuenta y tu deuda. No es un gasto nuevo: las compras ya se contaron cuando
        las hiciste.
      </p>
      {errors._ && (
        <p role="alert" className="text-sm text-negative">
          {errors._}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Pagar tarjeta
      </Button>
    </form>
  );
}
