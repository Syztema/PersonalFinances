import { formatCOP, type BudgetDTO } from '@finanzas/shared';
import { X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Select } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { api } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { formatMonthYear } from '../../lib/format';
import { useCategories } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';

interface Line {
  categoryId: string;
  amount: number | null;
}

export function BudgetEditorSheet({
  open,
  onOpenChange,
  month,
  budget,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  month: string;
  budget: BudgetDTO;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Presupuesto de ${formatMonthYear(month)}`}
    >
      {open && <BudgetEditor month={month} budget={budget} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function BudgetEditor({
  month,
  budget,
  onDone,
}: {
  month: string;
  budget: BudgetDTO;
  onDone: () => void;
}) {
  const categories = useCategories();
  const [total, setTotal] = useState<number | null>(budget.totalAmount);
  const [lines, setLines] = useState<Line[]>(
    budget.lines.map((l) => ({ categoryId: l.category.id, amount: l.amount })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useCrudMutation(
    (body: Record<string, unknown>) => api.put(`/budgets/${month}`, body),
    'Presupuesto guardado',
  );
  const all = categories.data ?? [];
  const known = (id: string) =>
    all.find((c) => c.id === id) ?? budget.lines.find((l) => l.category.id === id)?.category;
  const nameOf = (id: string) => known(id)?.name ?? 'Categoría';
  const available = all.filter(
    (c) =>
      c.kind === 'EXPENSE' &&
      c.isActive &&
      !c.isSystem &&
      !lines.some((l) => l.categoryId === c.id),
  );
  const linesSum = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const alertText = [errors.lines, errors._].filter(Boolean).join(' ');

  const submit = () => {
    if (lines.some((l) => !l.amount)) return setErrors({ _: 'Escribe el valor de cada categoría' });
    if (!total && lines.length === 0)
      return setErrors({ _: 'Escribe un total o agrega al menos una categoría' });
    setErrors({});
    save.mutate(
      {
        totalAmount: total || null,
        lines: lines.map((l) => ({ categoryId: l.categoryId, amount: l.amount })),
      },
      {
        onSuccess: onDone,
        onError: (err) =>
          setErrors(
            toFormErrors(
              err,
              lines.map((_, i) => `lines.${i}.categoryId`),
            ),
          ),
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
      <Field
        label="Presupuesto general (opcional)"
        htmlFor="budget-total"
        hint={`Si lo dejas vacío, el presupuesto es la suma de las categorías (${formatCOP(linesSum)}) y solo cuenta su gasto.`}
      >
        <MoneyInput id="budget-total" value={total} onChange={setTotal} />
      </Field>
      <div className="space-y-3">
        <p className="text-sm font-medium">Por categoría</p>
        {lines.map((l, i) => {
          const category = known(l.categoryId);
          const deleted = category?.isActive === false;
          const parentId = category?.parentId ?? null;
          const parentLine = parentId !== null && lines.some((x) => x.categoryId === parentId);
          const rowError = errors[`lines.${i}.categoryId`];
          return (
            <div key={l.categoryId} className="space-y-1">
              <div className="flex items-center gap-2">
                <label htmlFor={`line-${l.categoryId}`} className="w-32 shrink-0 truncate text-sm">
                  {deleted ? `${nameOf(l.categoryId)} (eliminada)` : nameOf(l.categoryId)}
                </label>
                <MoneyInput
                  id={`line-${l.categoryId}`}
                  value={l.amount}
                  onChange={(v) =>
                    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, amount: v } : x)))
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Quitar ${nameOf(l.categoryId)}`}
                  onClick={() => {
                    setLines((ls) => ls.filter((_, j) => j !== i));
                    setErrors({});
                  }}
                >
                  <X size={16} />
                </Button>
              </div>
              {deleted && <p className="text-xs text-muted">Quítala para guardar</p>}
              {parentLine && (
                <p className="text-xs text-muted">
                  Es un sublímite dentro de {nameOf(parentId)}: su gasto ya cuenta en esa categoría.
                </p>
              )}
              {rowError && <p className="text-sm text-negative">{rowError}</p>}
            </div>
          );
        })}
        {available.length > 0 && (
          <Select
            aria-label="Agregar categoría"
            value=""
            onChange={(e) =>
              e.target.value &&
              setLines((ls) => [...ls, { categoryId: e.target.value, amount: null }])
            }
          >
            <option value="">+ Agregar categoría</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? `— ${c.name}` : c.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      {alertText && (
        <p role="alert" className="text-sm text-negative">
          {alertText}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar presupuesto
      </Button>
    </form>
  );
}
