import { diffDays, monthsBetween, type IsoDate } from '@finanzas/shared';

export interface GoalProgress {
  progress: number;
  /** Fracción 0–1. */
  pct: number;
  remaining: number;
  monthlyNeeded: number | null;
  weeklyNeeded: number | null;
}

/** Spec 8.10: progreso = inicial + abonos − retiros; necesario = ⌈faltante ÷ max(1, periodos restantes)⌉. */
export function goalProgress(g: {
  targetAmount: number;
  initialAmount: number;
  contributed: number;
  withdrawn: number;
  targetDate: IsoDate | null;
  today: IsoDate;
}): GoalProgress {
  const progress = g.initialAmount + g.contributed - g.withdrawn;
  const remaining = Math.max(0, g.targetAmount - progress);
  const pct = Math.min(1, Math.max(0, progress) / g.targetAmount);
  if (!g.targetDate) return { progress, pct, remaining, monthlyNeeded: null, weeklyNeeded: null };
  const months = Math.max(1, monthsBetween(g.today, g.targetDate));
  const weeks = Math.max(1, Math.ceil(diffDays(g.today, g.targetDate) / 7));
  return {
    progress,
    pct,
    remaining,
    monthlyNeeded: Math.ceil(remaining / months),
    weeklyNeeded: Math.ceil(remaining / weeks),
  };
}
