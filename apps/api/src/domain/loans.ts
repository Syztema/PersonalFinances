import { makeDate, yearMonth, type IsoDate } from '@finanzas/shared';

export interface LoanTerms {
  balance: number;
  monthlyPayment: number | null;
  paymentDay: number | null;
  /** Capital + intereses pagados en el mes calendario de `today`. */
  paidThisMonth: number;
  /** Fecha de registro del préstamo: no hay cuota antes de ella. */
  openingDate: IsoDate;
}

function paymentDateInMonth(paymentDay: number, today: IsoDate, offset = 0): IsoDate {
  const { year, month } = yearMonth(today);
  return makeDate(year, month + offset, paymentDay);
}

/** Spec 8.4: cuota pendiente del mes si su fecha de pago es ≤ `until`. */
export function loanInstallmentDue(loan: LoanTerms, today: IsoDate, until: IsoDate): number {
  if (!loan.monthlyPayment || !loan.paymentDay || loan.balance <= 0) return 0;
  const date = paymentDateInMonth(loan.paymentDay, today);
  if (date > until || date < loan.openingDate) return 0;
  return Math.min(loan.balance, Math.max(0, loan.monthlyPayment - loan.paidThisMonth));
}

export function nextLoanPaymentDate(loan: LoanTerms, today: IsoDate): IsoDate | null {
  if (!loan.paymentDay || loan.balance <= 0) return null;
  const thisMonth = paymentDateInMonth(loan.paymentDay, today);
  if (thisMonth < loan.openingDate) return paymentDateInMonth(loan.paymentDay, today, 1);
  const pending = loan.monthlyPayment
    ? loan.paidThisMonth < loan.monthlyPayment
    : thisMonth >= today;
  return pending ? thisMonth : paymentDateInMonth(loan.paymentDay, today, 1);
}
