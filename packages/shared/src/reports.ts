import {
  addMonths,
  endOfMonth,
  monthKey,
  monthsBetween,
  startOfMonth,
  type IsoDate,
} from './dates';

export const REPORT_PRESETS = [
  'THIS_MONTH',
  'LAST_MONTH',
  'LAST_3_MONTHS',
  'LAST_6_MONTHS',
  'LAST_12_MONTHS',
] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

export const REPORT_PRESET_LABELS: Record<ReportPreset, string> = {
  THIS_MONTH: 'Este mes',
  LAST_MONTH: 'Mes anterior',
  LAST_3_MONTHS: '3 meses',
  LAST_6_MONTHS: '6 meses',
  LAST_12_MONTHS: '1 año',
};

/** Spec Fase 3 §3.1: un periodo personalizado abarca como máximo 24 meses calendario. */
export const MAX_REPORT_MONTHS = 24;

export type ReportPeriodInput = { preset: ReportPreset } | { from: IsoDate; to: IsoDate };

export interface ReportPeriod {
  preset: ReportPreset | null;
  from: IsoDate;
  to: IsoDate;
  /** Meses `YYYY-MM` que toca el periodo, en orden; un mes parcial cuenta solo sus días dentro. */
  months: string[];
}

export type ReportPeriodResult =
  { ok: true; period: ReportPeriod } | { ok: false; fields: Record<string, string> };

/** Proporción con 4 decimales (0.1395 = 13,95 %). */
export const roundShare = (value: number) => Math.round(value * 10_000) / 10_000;

/** Meses `YYYY-MM` desde el mes de `from` hasta el mes de `to`. */
export function monthsOfRange(from: IsoDate, to: IsoDate): string[] {
  const months: string[] = [];
  for (let d = startOfMonth(from); d <= to; d = addMonths(d, 1)) months.push(monthKey(d));
  return months;
}

/** Meses hacia atrás desde el mes actual; el periodo termina hoy. */
const MONTHS_BACK: Record<Exclude<ReportPreset, 'LAST_MONTH'>, number> = {
  THIS_MONTH: 0,
  LAST_3_MONTHS: 2,
  LAST_6_MONTHS: 5,
  LAST_12_MONTHS: 11,
};

/** Spec Fase 3 §3.1. `today` es la fecha de hoy en la zona del usuario (America/Bogota). */
export function resolveReportPeriod(input: ReportPeriodInput, today: IsoDate): ReportPeriodResult {
  if ('preset' in input) {
    const { preset } = input;
    const thisMonth = startOfMonth(today);
    if (preset === 'LAST_MONTH') {
      const from = addMonths(thisMonth, -1);
      const to = endOfMonth(from);
      return { ok: true, period: { preset, from, to, months: monthsOfRange(from, to) } };
    }
    const from = addMonths(thisMonth, -MONTHS_BACK[preset]);
    return { ok: true, period: { preset, from, to: today, months: monthsOfRange(from, today) } };
  }
  const { from, to } = input;
  const fields: Record<string, string> = {};
  if (from > to) fields.from = 'La fecha inicial no puede ser posterior a la final';
  else if (monthsBetween(from, to) + 1 > MAX_REPORT_MONTHS) {
    fields.from = `Elige un periodo de máximo ${MAX_REPORT_MONTHS} meses`;
  }
  if (to > today) fields.to = 'La fecha final no puede ser futura';
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, period: { preset: null, from, to, months: monthsOfRange(from, to) } };
}

/**
 * Spec Fase 3 §3.3: las `n` filas mayores y el resto sumado en "Otros" (la interfaz pone la
 * etiqueta). `other` es null si no hay resto o si el resto suma 0.
 */
export function groupTop<T extends { amount: number; share: number }>(
  rows: readonly T[],
  n = 6,
): { top: T[]; other: { amount: number; share: number } | null } {
  const sorted = [...rows].sort((a, b) => b.amount - a.amount);
  const rest = sorted.slice(n);
  const amount = rest.reduce((s, r) => s + r.amount, 0);
  return {
    top: sorted.slice(0, n),
    other: amount > 0 ? { amount, share: roundShare(rest.reduce((s, r) => s + r.share, 0)) } : null,
  };
}
