import type { FrozenHolder } from '../../lib/refs';
import { Button } from './Button';

const list = (items: string[]) =>
  items.length > 1
    ? `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
    : (items[0] ?? '');

const masculine = (h: FrozenHolder) => h.kind === 'debt';

/** Addendum §3.1: movimiento de una cuenta, tarjeta o préstamo eliminado; su dinero queda congelado. */
export function FrozenNote({ holder, editable }: { holder: FrozenHolder; editable: string[] }) {
  const m = masculine(holder);
  return (
    <p role="note" className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
      "{holder.name}" fue {m ? 'eliminado' : 'eliminada'}: solo puedes cambiar {list(editable)}.{' '}
      {m ? 'Restáuralo' : 'Restáurala'} para cambiar el valor, la fecha o las cuentas.
    </p>
  );
}

/** Formulario sin campos editables: solo se explica y se cierra, sin guardar nada. */
export function FrozenLocked({ holder, onClose }: { holder: FrozenHolder; onClose: () => void }) {
  const m = masculine(holder);
  return (
    <div className="space-y-4">
      <p role="note" className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
        Este movimiento no se puede editar porque {holder.name} fue {m ? 'eliminado' : 'eliminada'}.{' '}
        {m ? 'Restáuralo' : 'Restáurala'} para cambiarlo.
      </p>
      <Button size="lg" variant="secondary" onClick={onClose}>
        Cerrar
      </Button>
    </div>
  );
}
