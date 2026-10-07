import type { BreakdownItem } from '@finanzas/shared';

export interface AvailableInput {
  liquid: number;
  pendingObligations: number;
  cardsCommitted: number;
  loansDue: number;
  reserve: number;
}

/** Resta sin producir `-0` (que rompe comparaciones y se vería como "-$0"). */
const minus = (v: number) => (v === 0 ? 0 : -v);

/** Spec 8.6. */
export function estimateAvailable(i: AvailableInput): {
  total: number;
  breakdown: BreakdownItem[];
} {
  const breakdown: BreakdownItem[] = [
    { key: 'liquid', label: 'Dinero líquido (sin ahorro ni inversión)', amount: i.liquid },
    {
      key: 'obligations',
      label: 'Obligaciones pendientes del mes',
      amount: minus(i.pendingObligations),
    },
    { key: 'cards', label: 'Tarjetas: deuda comprometida', amount: minus(i.cardsCommitted) },
    { key: 'loans', label: 'Cuotas de préstamos pendientes del mes', amount: minus(i.loansDue) },
    { key: 'reserve', label: 'Ahorro e inversión por separar', amount: minus(i.reserve) },
  ];
  return { total: breakdown.reduce((s, b) => s + b.amount, 0), breakdown };
}
