import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from './Button';

/** Addendum §3.1: lo eliminado queda plegado al final de cada pantalla de gestión, con "Restaurar". */
export function DeletedSection<T extends { id: string; name: string }>({
  items,
  onRestore,
  isRestoring,
}: {
  items: T[];
  onRestore: (item: T) => void;
  isRestoring: (id: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center justify-between px-1 text-sm text-muted"
      >
        Eliminados ({items.length})
        <ChevronDown size={16} className={open ? 'rotate-180' : ''} aria-hidden />
      </button>
      {open && (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex min-h-14 items-center justify-between gap-3 px-4 py-2"
              >
                <span className="min-w-0 truncate text-muted">{item.name}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`Restaurar ${item.name}`}
                  loading={isRestoring(item.id)}
                  onClick={() => onRestore(item)}
                >
                  Restaurar
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-xs text-muted">
            Lo eliminado conserva su historial en Movimientos. Restáuralo para volver a usarlo.
          </p>
        </>
      )}
    </section>
  );
}
