import {
  DERIVED_METHOD_LABELS,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPES,
  type DerivedMethod,
  type TagDTO,
  type TransactionType,
} from '@finanzas/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chips } from '../../components/ui/Chips';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { qk, useAccounts, useCards, useCategories } from '../../lib/queries';
import { refName } from '../../lib/refs';
import { EMPTY_FILTERS, type TxFilters } from './filters';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: TxFilters;
  onApply: (filters: TxFilters) => void;
}

export function FiltersSheet({ open, onOpenChange, value, onApply }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Filtrar movimientos">
      {open && (
        <FiltersForm
          value={value}
          onApply={(f) => {
            onApply(f);
            onOpenChange(false);
          }}
        />
      )}
    </Sheet>
  );
}

function FiltersForm({ value, onApply }: { value: TxFilters; onApply: (f: TxFilters) => void }) {
  const [draft, setDraft] = useState(value);
  const accounts = useAccounts();
  const cards = useCards();
  const categories = useCategories();
  const tags = useQuery({
    queryKey: qk.tags,
    queryFn: () => api.get<{ items: TagDTO[] }>('/tags').then((r) => r.items),
  });
  const set = <K extends keyof TxFilters>(key: K, v: TxFilters[K]) =>
    setDraft((d) => ({ ...d, [key]: v }));
  const toggleType = (t: TransactionType) =>
    set(
      'types',
      draft.types.includes(t) ? draft.types.filter((x) => x !== t) : [...draft.types, t],
    );
  const invalidRange =
    draft.period === 'custom' && !!draft.from && !!draft.to && draft.from > draft.to;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">Periodo</p>
        <Chips
          ariaLabel="Periodo"
          value={draft.period}
          onChange={(p) => set('period', p)}
          options={[
            { value: 'all', label: 'Todo' },
            { value: 'this-month', label: 'Este mes' },
            { value: 'last-month', label: 'Mes anterior' },
            { value: 'custom', label: 'Personalizado' },
          ]}
        />
        {draft.period === 'custom' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <TextInput
                type="date"
                aria-label="Desde"
                value={draft.from}
                onChange={(e) => set('from', e.target.value)}
              />
              <TextInput
                type="date"
                aria-label="Hasta"
                value={draft.to}
                onChange={(e) => set('to', e.target.value)}
              />
            </div>
            {invalidRange && (
              <p role="alert" className="text-sm text-negative">
                La fecha final debe ser igual o posterior a la inicial.
              </p>
            )}
          </>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Tipo</p>
        <div className="flex flex-wrap gap-2">
          {TRANSACTION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={draft.types.includes(t)}
              onClick={() => toggleType(t)}
              className={cn(
                'min-h-11 rounded-full border px-3 text-sm',
                draft.types.includes(t)
                  ? 'border-primary bg-primary/10 font-medium text-primary'
                  : 'border-border',
              )}
            >
              {TRANSACTION_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <Field label="Cuenta" htmlFor="f-account">
        <Select
          id="f-account"
          value={draft.accountId}
          onChange={(e) => set('accountId', e.target.value)}
        >
          <option value="">Todas</option>
          {(accounts.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {refName(a)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tarjeta" htmlFor="f-card">
        <Select
          id="f-card"
          value={draft.creditCardId}
          onChange={(e) => set('creditCardId', e.target.value)}
        >
          <option value="">Todas</option>
          {(cards.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {refName(c)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Categoría" htmlFor="f-category" hint="Incluye sus subcategorías.">
        <Select
          id="f-category"
          value={draft.categoryId}
          onChange={(e) => set('categoryId', e.target.value)}
        >
          <option value="">Todas</option>
          {(categories.data ?? [])
            .filter((c) => !c.parentId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.kind === 'INCOME' ? 'Ingreso · ' : ''}
                {refName(c)}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Etiqueta" htmlFor="f-tag">
        <Select id="f-tag" value={draft.tag} onChange={(e) => set('tag', e.target.value)}>
          <option value="">Todas</option>
          {(tags.data ?? []).map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Método de pago" htmlFor="f-method">
        <Select
          id="f-method"
          value={draft.method}
          onChange={(e) => set('method', e.target.value as DerivedMethod | '')}
        >
          <option value="">Todos</option>
          {Object.entries(DERIVED_METHOD_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Valor mínimo" htmlFor="f-min">
          <MoneyInput id="f-min" value={draft.minAmount} onChange={(v) => set('minAmount', v)} />
        </Field>
        <Field label="Valor máximo" htmlFor="f-max">
          <MoneyInput id="f-max" value={draft.maxAmount} onChange={(v) => set('maxAmount', v)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onApply(EMPTY_FILTERS)}>
          Limpiar
        </Button>
        <Button disabled={invalidRange} onClick={() => onApply(draft)}>
          Aplicar
        </Button>
      </div>
    </div>
  );
}
