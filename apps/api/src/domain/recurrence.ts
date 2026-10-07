import {
  addDays,
  addMonths,
  dayOfMonth,
  diffDays,
  makeDate,
  yearMonth,
  type Frequency,
  type IsoDate,
} from '@finanzas/shared';

export interface RecurrenceTerms {
  frequency: Frequency;
  intervalDays: number | null;
  day1: number | null;
  day2: number | null;
  startDate: IsoDate;
  endDate: IsoDate | null;
}

const monthIndex = (date: IsoDate) => {
  const { year, month } = yearMonth(date);
  return year * 12 + month - 1;
};

/**
 * Spec 8.11: fechas de la regla dentro de [from, to] (incluidos), en orden y sin duplicados.
 * `MONTHLY` y `YEARLY` usan el día (y mes) de `startDate`; días 29–31 caen en el último día del mes.
 */
export function occurrences(rule: RecurrenceTerms, from: IsoDate, to: IsoDate): IsoDate[] {
  const lower = rule.startDate > from ? rule.startDate : from;
  const upper = rule.endDate !== null && rule.endDate < to ? rule.endDate : to;
  if (lower > upper) return [];
  const out: IsoDate[] = [];
  const push = (d: IsoDate) => {
    if (d >= lower && d <= upper && out[out.length - 1] !== d) out.push(d);
  };

  if (rule.frequency === 'WEEKLY' || rule.frequency === 'CUSTOM_DAYS') {
    const step = rule.frequency === 'WEEKLY' ? 7 : (rule.intervalDays ?? 0);
    if (step < 1) return [];
    const skipped = Math.ceil(diffDays(rule.startDate, lower) / step);
    for (let d = addDays(rule.startDate, skipped * step); d <= upper; d = addDays(d, step)) push(d);
    return out;
  }

  const day = dayOfMonth(rule.startDate);
  const startMonth = yearMonth(rule.startDate).month;
  for (let i = monthIndex(lower); i <= monthIndex(upper); i++) {
    const year = Math.floor(i / 12);
    const month = (i % 12) + 1;
    if (rule.frequency === 'MONTHLY') {
      push(makeDate(year, month, day));
    } else if (rule.frequency === 'YEARLY') {
      if (month === startMonth) push(makeDate(year, month, day));
    } else {
      push(makeDate(year, month, rule.day1 ?? 15));
      push(makeDate(year, month, rule.day2 ?? 31));
    }
  }
  return out;
}

/** Próxima fecha ≥ `from`; busca 13 meses adelante (cubre anual y cada 366 días). */
export function nextOccurrence(rule: RecurrenceTerms, from: IsoDate): IsoDate | null {
  return occurrences(rule, from, addMonths(from, 13))[0] ?? null;
}

export function isOccurrence(rule: RecurrenceTerms, date: IsoDate): boolean {
  return occurrences(rule, date, date).length === 1;
}
