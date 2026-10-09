import type { CompanionDTO } from '@finanzas/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { DeletedSection } from '../../components/ui/DeletedSection';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { Icon } from '../../lib/icons';
import { useCompanions } from '../../lib/queries';
import { useRestore } from '../../lib/useRestore';
import { CompanionFormSheet } from './CompanionFormSheet';

const usage = (n: number) => (n === 0 ? 'Sin usar' : n === 1 ? '1 gasto' : `${n} gastos`);

/** Spec con quién §3.3: las opciones de "¿Con quién?", con Eliminados y Restaurar. */
export function CompanionsList() {
  const companions = useCompanions();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CompanionDTO | undefined>();
  const { restore, isRestoring } = useRestore(
    (id) => `/companions/${id}/restore`,
    'Opción restaurada',
  );
  if (companions.isPending) return <PageSpinner />;
  if (companions.isError)
    return <ErrorState error={companions.error} onRetry={() => void companions.refetch()} />;

  const active = companions.data.filter((c) => c.isActive);
  const edit = (c?: CompanionDTO) => {
    setEditing(c);
    setOpen(true);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Elige una al registrar un gasto para ver con quién gastas.
        </p>
        <Button size="sm" onClick={() => edit()} aria-label="Nueva opción">
          <Plus size={16} /> Nueva
        </Button>
      </div>
      {active.length === 0 ? (
        <EmptyState
          title="No tienes opciones"
          description="Crea una para indicar con quién gastas."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
          {active.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => edit(c)}
                className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left"
              >
                <span
                  className="flex size-8 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: c.color }}
                >
                  <Icon name={c.icon} size={16} />
                </span>
                <span className="flex-1">{c.name}</span>
                <span className="text-xs text-muted">{usage(c.usageCount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <DeletedSection
        items={companions.data.filter((c) => !c.isActive)}
        isRestoring={isRestoring}
        onRestore={(c) => restore(c.id)}
      />
      <CompanionFormSheet open={open} onOpenChange={setOpen} companion={editing} />
    </div>
  );
}
