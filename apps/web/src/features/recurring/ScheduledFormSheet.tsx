import type { ScheduledItemDTO } from '@finanzas/shared';
import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { api, type ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { CategorySourceFields, KindChips, useCategorySource } from './CategorySourceFields';
import { sourceBody, sourceValue } from './sources';
import { useConflict } from './useConflict';

export function ScheduledFormSheet({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item?: ScheduledItemDTO;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={item ? 'Editar ocurrencia' : 'Pago único o ingreso esperado'}
    >
      {open && <ScheduledForm item={item} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function ScheduledForm({ item, onDone }: { item?: ScheduledItemDTO; onDone: () => void }) {
  const today = useToday();
  const initialSource = item ? sourceValue(item.account, item.creditCard) : '';
  const initialCategoryId = item?.category?.id ?? '';
  const choice = useCategorySource({
    kind: item?.kind ?? 'EXPENSE',
    categoryId: initialCategoryId,
    source: initialSource,
  });
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState<number | null>(item?.amount ?? null);
  const [dueDate, setDueDate] = useState(item?.dueDate ?? today);
  const [fields, setFields] = useState<Record<string, string>>({});
  const handleConflict = useConflict();
  const inFlight = useRef(false);
  const save = useCrudMutation(
    (body: Record<string, unknown>) =>
      item ? api.put(`/scheduled/${item.id}`, body) : api.post('/scheduled', body),
    item ? 'Ocurrencia actualizada' : 'Guardado en Recurrentes',
  );
  const remove = useCrudMutation(() => api.del(`/scheduled/${item!.id}`), 'Eliminado');
  const onError = (err: ApiError) => {
    if (handleConflict(err, onDone)) return;
    setFields(
      toFormErrors(err, ['name', 'amount', 'dueDate', 'categoryId', 'accountId', 'creditCardId']),
    );
  };

  const submit = () => {
    if (inFlight.current) return;
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Escribe un nombre';
    if (!amount) next.amount = 'Escribe el valor';
    if (!choice.categoryId) next.categoryId = 'Elige una categoría';
    if (!choice.source) next.accountId = 'Elige la cuenta o tarjeta';
    setFields(next);
    if (Object.keys(next).length > 0) return;
    inFlight.current = true;
    save.mutate(
      {
        ...(item ? {} : { kind: choice.kind }),
        name,
        amount,
        dueDate,
        categoryId: choice.categoryId,
        ...sourceBody(choice.source),
      },
      {
        onSuccess: onDone,
        onError,
        onSettled: () => {
          inFlight.current = false;
        },
      },
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
      {!item && <KindChips state={choice} labels={['Pago (obligación)', 'Ingreso esperado']} />}
      <Field label="Nombre" htmlFor="sch-name" error={fields.name}>
        <TextInput
          id="sch-name"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Valor" htmlFor="sch-amount" error={fields.amount}>
        <MoneyInput id="sch-amount" value={amount} onChange={setAmount} />
      </Field>
      <Field label="Fecha" htmlFor="sch-date" error={fields.dueDate}>
        <TextInput
          id="sch-date"
          type="date"
          value={dueDate}
          onChange={(e) => e.target.value && setDueDate(e.target.value)}
        />
      </Field>
      <CategorySourceFields
        state={choice}
        idPrefix="sch"
        initialCategoryId={initialCategoryId}
        initialSource={initialSource}
        errors={fields}
        sourceLabel={choice.kind === 'INCOME' ? 'Cuenta donde llega' : 'Cuenta o tarjeta'}
      />
      {fields._ && (
        <p role="alert" className="text-sm text-negative">
          {fields._}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar
      </Button>
      {item && !item.recurringRuleId && (
        <ConfirmButton
          size="lg"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}
        >
          Eliminar
        </ConfirmButton>
      )}
    </form>
  );
}
