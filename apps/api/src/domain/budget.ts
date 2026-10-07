import { dayOfMonth, daysInMonth, yearMonth, type IsoDate } from '@finanzas/shared';

export interface BudgetProjection {
  projectedSpend: number;
  /** Día del mes en que, a este ritmo, se superaría el presupuesto; null si no aplica. */
  exceedsOnDay: number | null;
}

/** Spec 8.9: ritmo = gastado ÷ días transcurridos (incluido hoy); proyectado = ritmo × días del mes. */
export function budgetProjection(i: {
  budget: number;
  spent: number;
  today: IsoDate;
}): BudgetProjection {
  const { year, month } = yearMonth(i.today);
  const total = daysInMonth(year, month);
  const rate = i.spent / dayOfMonth(i.today);
  const projectedSpend = Math.round(rate * total);
  if (rate <= 0 || i.spent > i.budget || projectedSpend <= i.budget) {
    return { projectedSpend, exceedsOnDay: null };
  }
  return { projectedSpend, exceedsOnDay: Math.min(total, Math.floor(i.budget / rate) + 1) };
}

export const usageOf = (spent: number, budget: number) => (budget > 0 ? spent / budget : 0);
