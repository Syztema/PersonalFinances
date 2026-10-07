/** Fecha calendario `YYYY-MM-DD` sin hora ni zona. */
export type IsoDate = string;

export const DEFAULT_TIMEZONE = 'America/Bogota';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parts(date: IsoDate): [number, number, number] {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid ISO date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isValidIsoDate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

/** Normaliza meses fuera de rango (13 → enero siguiente) y recorta el día al último del mes. */
export function makeDate(year: number, month: number, day: number): IsoDate {
  const total = year * 12 + (month - 1);
  const y = Math.floor(total / 12);
  const mo = total - y * 12 + 1;
  const d = Math.min(Math.max(day, 1), daysInMonth(y, mo));
  return `${pad(y, 4)}-${pad(mo)}-${pad(d)}`;
}

export function todayIn(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): IsoDate {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function toEpochDay(date: IsoDate): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromEpochDay(n: number): IsoDate {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Días de `from` a `to` (positivo si `to` es posterior). */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = parts(date);
  return makeDate(y, m + months, d);
}

export function startOfMonth(date: IsoDate): IsoDate {
  const [y, m] = parts(date);
  return makeDate(y, m, 1);
}

export function endOfMonth(date: IsoDate): IsoDate {
  const [y, m] = parts(date);
  return makeDate(y, m, 31);
}

export function monthKey(date: IsoDate): string {
  return date.slice(0, 7);
}

export function monthStartFromKey(key: string): IsoDate {
  return `${key}-01`;
}

export function yearMonth(date: IsoDate): { year: number; month: number } {
  const [year, month] = parts(date);
  return { year, month };
}

export function dayOfMonth(date: IsoDate): number {
  return parts(date)[2];
}

/** Meses calendario entre el mes de `a` y el mes de `b`. */
export function monthsBetween(a: IsoDate, b: IsoDate): number {
  const A = yearMonth(a);
  const B = yearMonth(b);
  return (B.year - A.year) * 12 + (B.month - A.month);
}
