import type { CompanionRefDTO } from '@finanzas/shared';
import { useId } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { Icon } from '../../lib/icons';
import { refName } from '../../lib/refs';

/**
 * Spec con quién §3.1: una opción o ninguna, sin preselección; tocar la elegida la quita. Son
 * botones con `aria-pressed` (no un grupo de radio) porque la elección se puede deshacer.
 */
export function CompanionPicker({
  options,
  value,
  onChange,
  onNavigate,
  error,
}: {
  options: CompanionRefDTO[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** "Editar opciones" sale del registro rápido: cierra la hoja. */
  onNavigate: () => void;
  error?: string;
}) {
  const labelId = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p id={labelId} className="text-sm font-medium">
          ¿Con quién?
        </p>
        <Link
          to="/categories?tab=companions"
          onClick={onNavigate}
          className="-my-2 inline-flex min-h-11 items-center px-1 text-sm text-primary"
        >
          Editar opciones
        </Link>
      </div>
      {options.length === 0 ? (
        <p className="text-sm text-muted">No tienes opciones activas.</p>
      ) : (
        <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
          {options.map((c) => {
            const pressed = value === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => onChange(pressed ? null : c.id)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50',
                  pressed
                    ? 'border-primary bg-primary font-medium text-primary-fg'
                    : 'border-border bg-surface text-fg',
                )}
              >
                <Icon name={c.icon} size={16} />
                {refName(c)}
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="text-sm text-negative">{error}</p>}
    </div>
  );
}
