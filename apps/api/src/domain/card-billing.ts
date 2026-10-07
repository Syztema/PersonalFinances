import { makeDate, monthsBetween, yearMonth, type IsoDate } from '@finanzas/shared';

export interface CardTerms {
  statementDay: number;
  paymentDueDay: number;
}

export interface CardCharge {
  date: IsoDate;
  amount: number;
  installments: number;
}

export function cutoffForMonth(year: number, month: number, terms: CardTerms): IsoDate {
  return makeDate(year, month, terms.statementDay);
}

export function cutoffOnOrAfter(date: IsoDate, terms: CardTerms): IsoDate {
  const { year, month } = yearMonth(date);
  const c = cutoffForMonth(year, month, terms);
  return c >= date ? c : cutoffForMonth(year, month + 1, terms);
}

export function cutoffOnOrBefore(date: IsoDate, terms: CardTerms): IsoDate {
  const { year, month } = yearMonth(date);
  const c = cutoffForMonth(year, month, terms);
  return c <= date ? c : cutoffForMonth(year, month - 1, terms);
}

export function shiftCutoff(cutoff: IsoDate, months: number, terms: CardTerms): IsoDate {
  const { year, month } = yearMonth(cutoff);
  return cutoffForMonth(year, month + months, terms);
}

/** Spec 8.3: mismo mes si el día de pago es posterior al de corte; si no, el mes siguiente. */
export function dueDateForCutoff(cutoff: IsoDate, terms: CardTerms): IsoDate {
  const { year, month } = yearMonth(cutoff);
  return terms.paymentDueDay > terms.statementDay
    ? makeDate(year, month, terms.paymentDueDay)
    : makeDate(year, month + 1, terms.paymentDueDay);
}

export function splitInstallments(amount: number, n: number): number[] {
  const base = Math.floor(amount / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? amount - base * (n - 1) : base));
}

/** Suma de cuotas facturadas en cortes ≤ `cutoff`. */
export function billedThrough(charges: CardCharge[], cutoff: IsoDate, terms: CardTerms): number {
  let total = 0;
  for (const c of charges) {
    const first = cutoffOnOrAfter(c.date, terms);
    if (first > cutoff) continue;
    const count = Math.min(c.installments, monthsBetween(first, cutoff) + 1);
    total += count >= c.installments ? c.amount : Math.floor(c.amount / c.installments) * count;
  }
  return total;
}

/** La deuda que ya tenía la tarjeta al registrarla se considera facturada en el último corte previo. */
export function initialDebtCharge(
  card: { initialDebt: number; initialDebtInstallments: number; openingDate: IsoDate },
  terms: CardTerms,
): CardCharge | null {
  if (card.initialDebt <= 0) return null;
  return {
    date: cutoffOnOrBefore(card.openingDate, terms),
    amount: card.initialDebt,
    installments: card.initialDebtInstallments,
  };
}

export interface CardBillingInput {
  terms: CardTerms;
  charges: CardCharge[];
  totalPayments: number;
  debt: number;
  today: IsoDate;
}

export interface CardStatus {
  lastCutoff: IsoDate;
  lastDueDate: IsoDate;
  amountDue: number;
  isOverdue: boolean;
  nextCutoff: IsoDate;
  nextDueDate: IsoDate;
  committed: number;
}

const clampDue = (value: number, debt: number) => Math.min(Math.max(value, 0), Math.max(debt, 0));

export function cardStatus(input: CardBillingInput): CardStatus {
  const { terms, charges, totalPayments, debt, today } = input;
  const lastCutoff = cutoffOnOrBefore(today, terms);
  const lastDueDate = dueDateForCutoff(lastCutoff, terms);
  const amountDue = clampDue(billedThrough(charges, lastCutoff, terms) - totalPayments, debt);
  const nextCutoff = shiftCutoff(lastCutoff, 1, terms);
  const committed = clampDue(
    billedThrough(charges, cutoffOnOrAfter(today, terms), terms) - totalPayments,
    debt,
  );
  return {
    lastCutoff,
    lastDueDate,
    amountDue,
    isOverdue: amountDue > 0 && lastDueDate < today,
    nextCutoff,
    nextDueDate: dueDateForCutoff(nextCutoff, terms),
    committed,
  };
}

/** Pago exigible acumulado a la fecha `t`: estados de cuenta cuya fecha de pago ya llegó. */
export function exigibleAt(input: CardBillingInput, t: IsoDate): number {
  const { terms, charges, totalPayments, debt } = input;
  let cutoff = cutoffOnOrBefore(t, terms);
  while (dueDateForCutoff(cutoff, terms) > t) cutoff = shiftCutoff(cutoff, -1, terms);
  return clampDue(billedThrough(charges, cutoff, terms) - totalPayments, debt);
}

export function upcomingInstallments(
  charges: CardCharge[],
  afterCutoff: IsoDate,
  terms: CardTerms,
  months = 12,
): Array<{ cutoff: IsoDate; dueDate: IsoDate; amount: number }> {
  const result: Array<{ cutoff: IsoDate; dueDate: IsoDate; amount: number }> = [];
  let previous = billedThrough(charges, afterCutoff, terms);
  for (let k = 1; k <= months; k++) {
    const cutoff = shiftCutoff(afterCutoff, k, terms);
    const billed = billedThrough(charges, cutoff, terms);
    if (billed > previous)
      result.push({ cutoff, dueDate: dueDateForCutoff(cutoff, terms), amount: billed - previous });
    previous = billed;
  }
  return result;
}
