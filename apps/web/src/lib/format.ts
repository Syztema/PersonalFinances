import { addDays, type IsoDate } from '@finanzas/shared';

export { formatCOP, formatCOPCompact } from '@finanzas/shared';

const MONTHS_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const monthIndex = (iso: string) => Number(iso.slice(5, 7)) - 1;

export const formatShortDate = (iso: IsoDate) =>
  `${iso.slice(8, 10)} ${MONTHS_SHORT[monthIndex(iso)]}`;
export const formatDate = (iso: IsoDate) =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const monthLabel = (key: string) => MONTHS[monthIndex(key)] ?? key;
export const formatPercent = (ratio: number) => `${Math.round(ratio * 100)}%`;

export function dayHeading(iso: IsoDate, today: IsoDate): string {
  if (iso === today) return 'Hoy';
  if (iso === addDays(today, -1)) return 'Ayer';
  const weekday = WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
  const year = iso.slice(0, 4) !== today.slice(0, 4) ? ` de ${iso.slice(0, 4)}` : '';
  return `${weekday} ${Number(iso.slice(8, 10))} de ${MONTHS[monthIndex(iso)]}${year}`;
}
