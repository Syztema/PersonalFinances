import type { CategoryDTO, ScheduledKind } from '@finanzas/shared';
import { useState } from 'react';
import { Chips } from '../../components/ui/Chips';
import { Field, Select } from '../../components/ui/Field';
import { useAccounts, useCards, useCategories } from '../../lib/queries';
import { refName } from '../../lib/refs';
import { sourceOptions } from './sources';

/** Categorías del tipo elegido; se conserva la actual aunque esté eliminada. */
export function categoryOptions(
  categories: CategoryDTO[],
  kind: ScheduledKind,
  keepIds: string[] = [],
) {
  return categories
    .filter((c) => c.kind === kind && (c.isActive || keepIds.includes(c.id)) && !c.isSystem)
    .map((c) => ({ value: c.id, label: refName(c, '(eliminada)')! }));
}

/** Tipo, categoría y cuenta o tarjeta: cambiar el tipo limpia las dos selecciones que dependen de él. */
export function useCategorySource(initial: {
  kind: ScheduledKind;
  categoryId: string;
  source: string;
}) {
  const [kind, setKindState] = useState(initial.kind);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [source, setSource] = useState(initial.source);
  const setKind = (next: ScheduledKind) => {
    setKindState(next);
    setCategoryId('');
    setSource('');
  };
  return { kind, setKind, categoryId, setCategoryId, source, setSource };
}

export type CategorySourceState = ReturnType<typeof useCategorySource>;

export function KindChips({
  state,
  labels,
}: {
  state: CategorySourceState;
  labels: [expense: string, income: string];
}) {
  return (
    <Chips
      ariaLabel="Tipo"
      value={state.kind}
      onChange={state.setKind}
      options={[
        { value: 'EXPENSE', label: labels[0] },
        { value: 'INCOME', label: labels[1] },
      ]}
    />
  );
}

export function CategorySourceFields({
  state,
  idPrefix,
  initialCategoryId,
  initialSource,
  errors,
  sourceLabel,
  sourceHint,
}: {
  state: CategorySourceState;
  idPrefix: string;
  /** Valores con los que se abrió el formulario: siguen disponibles aunque ya estén eliminados. */
  initialCategoryId: string;
  initialSource: string;
  errors: Record<string, string>;
  sourceLabel: string;
  sourceHint?: string;
}) {
  const accounts = useAccounts();
  const cards = useCards();
  const categories = useCategories();
  const categoryChoices = categoryOptions(categories.data ?? [], state.kind, [
    initialCategoryId,
    state.categoryId,
  ]);
  const sourceChoices = sourceOptions(accounts.data ?? [], cards.data ?? [], state.kind, [
    initialSource,
    state.source,
  ]);
  return (
    <>
      <Field label="Categoría" htmlFor={`${idPrefix}-category`} error={errors.categoryId}>
        <Select
          id={`${idPrefix}-category`}
          value={state.categoryId}
          onChange={(e) => state.setCategoryId(e.target.value)}
        >
          <option value="">Elige una categoría</option>
          {categoryChoices.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={sourceLabel}
        htmlFor={`${idPrefix}-source`}
        error={errors.accountId ?? errors.creditCardId}
        hint={sourceHint}
      >
        <Select
          id={`${idPrefix}-source`}
          value={state.source}
          onChange={(e) => state.setSource(e.target.value)}
        >
          <option value="">Elige una opción</option>
          {sourceChoices.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
