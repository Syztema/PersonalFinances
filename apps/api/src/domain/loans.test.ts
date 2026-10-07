import { describe, expect, it } from 'vitest';
import { loanInstallmentDue, nextLoanPaymentDate, type LoanTerms } from './loans';

const loan = (overrides: Partial<LoanTerms> = {}): LoanTerms => ({
  balance: 8_000_000,
  monthlyPayment: 450_000,
  paymentDay: 5,
  paidThisMonth: 0,
  openingDate: '2026-01-01',
  ...overrides,
});

describe('loanInstallmentDue', () => {
  it('returns the pending part of the monthly installment', () => {
    expect(loanInstallmentDue(loan(), '2026-10-06', '2026-10-31')).toBe(450_000);
    expect(loanInstallmentDue(loan({ paidThisMonth: 380_000 }), '2026-10-06', '2026-10-31')).toBe(
      70_000,
    );
    expect(loanInstallmentDue(loan({ paidThisMonth: 450_000 }), '2026-10-06', '2026-10-31')).toBe(
      0,
    );
  });

  it('is capped by the balance and zero without terms', () => {
    expect(loanInstallmentDue(loan({ balance: 100_000 }), '2026-10-06', '2026-10-31')).toBe(
      100_000,
    );
    expect(loanInstallmentDue(loan({ monthlyPayment: null }), '2026-10-06', '2026-10-31')).toBe(0);
    expect(loanInstallmentDue(loan({ balance: 0 }), '2026-10-06', '2026-10-31')).toBe(0);
  });

  it('ignores the installment if its date is after the horizon', () => {
    expect(loanInstallmentDue(loan(), '2026-10-02', '2026-10-04')).toBe(0);
  });

  it('day 31 falls on the last day of February', () => {
    expect(loanInstallmentDue(loan({ paymentDay: 31 }), '2026-02-10', '2026-02-28')).toBe(450_000);
  });
});

describe('loan opened after the payment day of the month', () => {
  it('has no installment due and moves to next month', () => {
    const l = loan({ openingDate: '2026-10-20' });
    expect(loanInstallmentDue(l, '2026-10-20', '2026-10-31')).toBe(0);
    expect(nextLoanPaymentDate(l, '2026-10-20')).toBe('2026-11-05');
  });

  it('is unchanged when opened on or before the payment date', () => {
    const l = loan({ openingDate: '2026-10-05' });
    expect(loanInstallmentDue(l, '2026-10-20', '2026-10-31')).toBe(450_000);
    expect(nextLoanPaymentDate(l, '2026-10-20')).toBe('2026-10-05');
  });
});

describe('nextLoanPaymentDate', () => {
  it('stays in the current month while the installment is pending', () => {
    expect(nextLoanPaymentDate(loan(), '2026-10-06')).toBe('2026-10-05');
    expect(nextLoanPaymentDate(loan({ paidThisMonth: 450_000 }), '2026-10-06')).toBe('2026-11-05');
    expect(nextLoanPaymentDate(loan({ paymentDay: null }), '2026-10-06')).toBeNull();
  });
});
