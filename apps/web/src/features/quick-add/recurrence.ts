import { dayOfMonth, daysInMonth, yearMonth, type Frequency, type IsoDate } from '@finanzas/shared';

/**
 * Plan 2A, decisión 4: en la quincena, la fecha del movimiento debe ser uno de sus dos días.
 * 31 significa "último día del mes".
 */
export function semimonthlyDays(date: IsoDate): { day1: number; day2: number } {
  const d = dayOfMonth(date);
  const { year, month } = yearMonth(date);
  if (d <= 15) return { day1: d, day2: d === 15 ? 31 : d + 15 };
  return { day1: d - 15, day2: d === daysInMonth(year, month) ? 31 : d };
}

export type RecurringOnCreate =
  | { frequency: Exclude<Frequency, 'SEMIMONTHLY' | 'CUSTOM_DAYS'> }
  | { frequency: 'CUSTOM_DAYS'; intervalDays: number }
  | { frequency: 'SEMIMONTHLY'; day1: number; day2: number };

export function recurrencePayload(
  frequency: Frequency,
  date: IsoDate,
  intervalDays: string,
): RecurringOnCreate {
  if (frequency === 'SEMIMONTHLY') return { frequency, ...semimonthlyDays(date) };
  if (frequency === 'CUSTOM_DAYS') return { frequency, intervalDays: Number(intervalDays) };
  return { frequency };
}
