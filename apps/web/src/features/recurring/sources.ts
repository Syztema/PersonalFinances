import type { AccountDTO, CreditCardDTO, RefDTO, ScheduledKind } from '@finanzas/shared';
import { refName } from '../../lib/refs';

/** Valor de un select de "Cuenta o tarjeta": `account:<id>` o `card:<id>`. */
export function sourceValue(account: RefDTO | null, creditCard: RefDTO | null): string {
  if (creditCard) return `card:${creditCard.id}`;
  if (account) return `account:${account.id}`;
  return '';
}

export function sourceBody(value: string): {
  accountId: string | null;
  creditCardId: string | null;
} {
  const [kind, id = ''] = value.split(':');
  return kind === 'card'
    ? { accountId: null, creditCardId: id }
    : { accountId: id || null, creditCardId: null };
}

/** Un ingreso llega a una cuenta; un gasto sale de una cuenta o de una tarjeta. Se conserva la actual aunque esté eliminada. */
export function sourceOptions(
  accounts: AccountDTO[],
  cards: CreditCardDTO[],
  kind: ScheduledKind,
  keepValues: string[] = [],
): Array<{ value: string; label: string }> {
  const keep = (value: string, active: boolean) => active || keepValues.includes(value);
  return [
    ...accounts
      .filter((a) => keep(`account:${a.id}`, a.isActive))
      .map((a) => ({ value: `account:${a.id}`, label: refName(a)! })),
    ...(kind === 'EXPENSE'
      ? cards
          .filter((c) => keep(`card:${c.id}`, c.isActive))
          .map((c) => ({ value: `card:${c.id}`, label: `Tarjeta ${refName(c)}` }))
      : []),
  ];
}
