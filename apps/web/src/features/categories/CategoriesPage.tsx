import { BUCKET_LABELS, type CategoryDTO, type CategoryKind } from '@finanzas/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chips } from '../../components/ui/Chips';
import { DeletedSection } from '../../components/ui/DeletedSection';
import { ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { cn } from '../../lib/cn';
import { Icon } from '../../lib/icons';
import { useCategories } from '../../lib/queries';
import { useRestore } from '../../lib/useRestore';
import { CategoryFormSheet } from './CategoryFormSheet';
import { TagsList } from './TagsList';

type Tab = CategoryKind | 'TAGS';

export function CategoriesPage() {
  const categories = useCategories();
  const [tab, setTab] = useState<Tab>('EXPENSE');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryDTO | undefined>();
  const { restore, isRestoring } = useRestore(
    (id) => `/categories/${id}/restore`,
    'Categoría restaurada',
  );
  if (categories.isPending) return <PageSpinner />;
  if (categories.isError)
    return <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />;

  const kind: CategoryKind = tab === 'INCOME' ? 'INCOME' : 'EXPENSE';
  const ofKind = categories.data.filter((c) => c.kind === kind);
  const visible = ofKind.filter((c) => c.isActive);
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
          <span className="block">{c.name}</span>
          {c.systemKey ? (
            <span className="block text-xs text-muted">Del sistema</span>
          ) : (
            !child &&
            c.bucket && <span className="block text-xs text-muted">{BUCKET_LABELS[c.bucket]}</span>
          )}
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categorías</h1>
        {tab !== 'TAGS' && (
          <Button size="sm" onClick={() => edit()} aria-label="Nueva categoría">
            <Plus size={16} /> Nueva
          </Button>
        )}
      </div>
      <Chips
        ariaLabel="Qué ver"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'EXPENSE', label: 'Gastos' },
          { value: 'INCOME', label: 'Ingresos' },
          { value: 'TAGS', label: 'Etiquetas' },
        ]}
      />
      {tab === 'TAGS' ? (
        <TagsList />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
            {roots.flatMap((root) => [
              row(root),
              ...visible.filter((c) => c.parentId === root.id).map((c) => row(c, true)),
            ])}
          </ul>
          <DeletedSection
            items={ofKind.filter((c) => !c.isActive)}
            isRestoring={isRestoring}
            onRestore={(c) => restore(c.id)}
          />
          <p className="px-1 text-xs text-muted">
            Ahorrar no es un gasto: para ahorrar, transfiere a una cuenta de ahorro. Pagar una
            tarjeta o un préstamo tampoco es un gasto; solo los intereses lo son.
          </p>
        </>
      )}
      <CategoryFormSheet open={open} onOpenChange={setOpen} kind={kind} category={editing} />
    </div>
  );
}
