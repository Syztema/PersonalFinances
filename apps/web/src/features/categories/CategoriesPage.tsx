import { BUCKET_LABELS, type CategoryDTO, type CategoryKind } from '@finanzas/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chips } from '../../components/ui/Chips';
import { ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { cn } from '../../lib/cn';
import { Icon } from '../../lib/icons';
import { useCategories } from '../../lib/queries';
import { CategoryFormSheet } from './CategoryFormSheet';

export function CategoriesPage() {
  const categories = useCategories();
  const [kind, setKind] = useState<CategoryKind>('EXPENSE');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryDTO | undefined>();
  if (categories.isPending) return <PageSpinner />;
  if (categories.isError)
    return <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />;

  const visible = categories.data.filter((c) => c.kind === kind && !c.isSystem);
  const roots = visible.filter((c) => !c.parentId);
  const edit = (c?: CategoryDTO) => {
    setEditing(c);
    setOpen(true);
  };
  const row = (c: CategoryDTO, child = false) => (
    <li key={c.id}>
      <button
        type="button"
        onClick={() => edit(c)}
        className={cn(
          'flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left',
          child && 'pl-12',
        )}
      >
        <span
          className="flex size-8 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: c.color }}
        >
          <Icon name={c.icon} size={16} />
        </span>
        <span className="flex-1">
          <span className={cn('block', !c.isActive && 'text-muted line-through')}>{c.name}</span>
          {!child && c.bucket && (
            <span className="block text-xs text-muted">{BUCKET_LABELS[c.bucket]}</span>
          )}
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categorías</h1>
        <Button size="sm" onClick={() => edit()} aria-label="Nueva categoría">
          <Plus size={16} /> Nueva
        </Button>
      </div>
      <Chips
        ariaLabel="Tipo de categoría"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'EXPENSE', label: 'Gastos' },
          { value: 'INCOME', label: 'Ingresos' },
        ]}
      />
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        {roots.flatMap((root) => [
          row(root),
          ...visible.filter((c) => c.parentId === root.id).map((c) => row(c, true)),
        ])}
      </ul>
      <p className="px-1 text-xs text-muted">
        Ahorrar no es un gasto: para ahorrar, transfiere a una cuenta de ahorro. Pagar una tarjeta o
        un préstamo tampoco es un gasto; solo los intereses lo son.
      </p>
      <CategoryFormSheet open={open} onOpenChange={setOpen} kind={kind} category={editing} />
    </div>
  );
}
