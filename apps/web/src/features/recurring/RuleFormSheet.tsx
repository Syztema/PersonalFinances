import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  type Frequency,
  type RecurringRuleDTO,
} from '@finanzas/shared';
import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { api, type ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { CategorySourceFields, KindChips, useCategorySource } from './CategorySourceFields';
import { sourceBody, sourceValue } from './sources';

const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

export function RuleFormSheet({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rule?: RecurringRuleDTO;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={rule ? 'Editar regla' : 'Nueva regla recurrente'}
    >
      {open && <RuleForm rule={rule} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function RuleForm({ rule, onDone }: { rule?: RecurringRuleDTO; onDone: () => void }) {
  const today = useToday();
  const initialSource = rule ? sourceValue(rule.account, rule.creditCard) : '';
  const initialCategoryId = rule?.category.id ?? '';
  const choice = useCategorySource({
    kind: rule?.kind ?? 'EXPENSE',
    categoryId: initialCategoryId,
    source: initialSource,
  });
  const [name, setName] = useState(rule?.name ?? '');
  const [amount, setAmount] = useState<number | null>(rule?.amount ?? null);
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'MONTHLY');
  const [intervalDays, setIntervalDays] = useState(String(rule?.intervalDays ?? 30));
  const [day1, setDay1] = useState(String(rule?.day1 ?? 15));
  const [day2, setDay2] = useState(String(rule?.day2 ?? 31));
  const [startDate, setStartDate] = useState(rule?.startDate ?? today);
  const [endDate, setEndDate] = useState(rule?.endDate ?? '');
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const inFlight = useRef(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useCrudMutation(
    (body: Record<string, unknown>) =>
      rule ? api.put(`/recurring/${rule.id}`, body) : api.post('/recurring', body),
    rule ? 'Regla actualizada' : 'Regla creada',
  );
  const remove = useCrudMutation(() => api.del(`/recurring/${rule!.id}`), 'Regla eliminada');
  const onError = (err: ApiError) =>
    setFields(
      toFormErrors(err, [
        'name',
        'amount',
        'categoryId',
        'accountId',
        'creditCardId',
        'intervalDays',
        'day1',
        'day2',
        'endDate',
      ]),
    );

  const submit = () => {
    if (inFlight.current) return;
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Escribe un nombre';
    if (!amount) next.amount = 'Escribe el valor';
    if (!choice.categoryId) next.categoryId = 'Elige una categoría';
    if (!choice.source) next.accountId = 'Elige la cuenta o tarjeta';
    if (frequency === 'SEMIMONTHLY') {
      const d1 = Number(day1);
      const d2 = Number(day2);
      if (!(d1 >= 1 && d1 <= 31)) next.day1 = 'Un día entre 1 y 31';
      if (!(d2 >= 1 && d2 <= 31)) next.day2 = 'Un día entre 1 y 31';
      if (!next.day1 && !next.day2 && d1 >= d2) next.day2 = 'Debe ser posterior al primer día';
    }
    setFields(next);
    if (Object.keys(next).length > 0) return;
    inFlight.current = true;
    save.mutate(
      {
        name,
        kind: choice.kind,
        amount,
        categoryId: choice.categoryId,
        ...sourceBody(choice.source),
        frequency,
        intervalDays: frequency === 'CUSTOM_DAYS' ? Number(intervalDays) : null,
        day1: frequency === 'SEMIMONTHLY' ? Number(day1) : null,
        day2: frequency === 'SEMIMONTHLY' ? Number(day2) : null,
        startDate,
        endDate: endDate || null,
        ...(rule ? { isActive } : {}),
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
      <KindChips state={choice} labels={['Gasto', 'Ingreso']} />
      <Field label="Nombre" htmlFor="rule-name" error={fields.name}>
        <TextInput
          id="rule-name"
          maxLength={60}
          placeholder="Arriendo, Netflix, Salario…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Valor" htmlFor="rule-amount" error={fields.amount}>
        <MoneyInput id="rule-amount" value={amount} onChange={setAmount} />
      </Field>
      <CategorySourceFields
        state={choice}
        idPrefix="rule"
        initialCategoryId={initialCategoryId}
        initialSource={initialSource}
        errors={fields}
        sourceLabel="Cuenta o tarjeta"
        sourceHint={
          choice.kind === 'EXPENSE'
            ? 'Para pagar tarjetas o préstamos no hace falta una regla: sus vencimientos se calculan solos.'
            : undefined
        }
      />
      <Field label="Frecuencia" htmlFor="rule-frequency">
        <Select
          id="rule-frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABELS[f]}
            </option>
          ))}
        </Select>
      </Field>
      {frequency === 'CUSTOM_DAYS' && (
        <Field label="Cada cuántos días" htmlFor="rule-interval" error={fields.intervalDays}>
          <TextInput
            id="rule-interval"
            inputMode="numeric"
            value={intervalDays}
            onChange={(e) => setIntervalDays(digits(e.target.value, 3))}
          />
        </Field>
      )}
      {frequency === 'SEMIMONTHLY' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Primer día" htmlFor="rule-day1" error={fields.day1}>
            <TextInput
              id="rule-day1"
              inputMode="numeric"
              value={day1}
              onChange={(e) => setDay1(digits(e.target.value, 2))}
            />
          </Field>
          <Field
            label="Segundo día"
            htmlFor="rule-day2"
            error={fields.day2}
            hint="31 = último día del mes."
          >
            <TextInput
              id="rule-day2"
              inputMode="numeric"
              value={day2}
              onChange={(e) => setDay2(digits(e.target.value, 2))}
            />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Desde" htmlFor="rule-start">
          <TextInput
            id="rule-start"
            type="date"
            value={startDate}
            onChange={(e) => e.target.value && setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Hasta (opcional)" htmlFor="rule-end" error={fields.endDate}>
          <TextInput
            id="rule-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
      </div>
      {rule && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Activa (si la pausas, no genera nuevas ocurrencias)
        </label>
      )}
      {fields._ && (
        <p role="alert" className="text-sm text-negative">
          {fields._}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar regla
      </Button>
      {rule && (
        <div className="space-y-2">
          <ConfirmButton
            size="lg"
            loading={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}
          >
            Eliminar regla
          </ConfirmButton>
          <p className="text-xs text-muted">
            Se borran sus ocurrencias pendientes, incluso las vencidas; las pagadas u omitidas se
            conservan en el historial.
          </p>
        </div>
      )}
    </form>
  );
}
