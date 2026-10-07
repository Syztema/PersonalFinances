import type { TransactionDTO } from '@finanzas/shared';

/** Addendum §3.1: lo eliminado se sigue viendo en el historial, marcado. */
export function refName(
  ref: { name: string; isActive?: boolean } | null | undefined,
  deleted = '(eliminada)',
): string | null {
  if (!ref) return null;
  return ref.isActive === false ? `${ref.name} ${deleted}` : ref.name;
}

export interface FrozenHolder {
  name: string;
  kind: 'account' | 'card' | 'debt';
}

/**
 * Addendum §3.1: si la cuenta, la tarjeta o el préstamo de un movimiento fue eliminado, su dinero
 * queda congelado. Devuelve el primero eliminado, o null si no hay ninguno.
 */
export function frozenHolder(
  edit: Pick<TransactionDTO, 'account' | 'toAccount' | 'creditCard' | 'debt'> | null | undefined,
): FrozenHolder | null {
  if (!edit) return null;
  const holders: Array<[FrozenHolder['kind'], { name: string; isActive?: boolean } | null]> = [
    ['account', edit.account],
    ['account', edit.toAccount],
    ['card', edit.creditCard],
    ['debt', edit.debt],
  ];
  const found = holders.find(([, r]) => r?.isActive === false);
  return found ? { name: found[1]!.name, kind: found[0] } : null;
}
