import { describe, expect, it } from 'vitest';
import {
  billedThrough,
  cardStatus,
  cutoffOnOrAfter,
  cutoffOnOrBefore,
  dueDateForCutoff,
  exigibleAt,
  initialDebtCharge,
  splitInstallments,
  upcomingInstallments,
  type CardCharge,
  type CardTerms,
} from './card-billing';

const T15: CardTerms = { statementDay: 15, paymentDueDay: 30 };
const T31: CardTerms = { statementDay: 31, paymentDueDay: 15 };

describe('cutoffs and due dates', () => {
  it('finds the cutoff on or after / before a date', () => {
    expect(cutoffOnOrAfter('2026-10-15', T15)).toBe('2026-10-15');
    expect(cutoffOnOrAfter('2026-10-16', T15)).toBe('2026-11-15');
    expect(cutoffOnOrBefore('2026-10-14', T15)).toBe('2026-09-15');
    expect(cutoffOnOrBefore('2026-10-15', T15)).toBe('2026-10-15');
  });

  it('uses the last day of short months for day 31 (review focus #1)', () => {
    expect(cutoffOnOrAfter('2026-02-10', T31)).toBe('2026-02-28');
    expect(cutoffOnOrAfter('2026-04-30', T31)).toBe('2026-04-30');
    expect(dueDateForCutoff('2026-02-28', T31)).toBe('2026-03-15');
    expect(dueDateForCutoff('2026-02-15', T15)).toBe('2026-02-28');
    expect(dueDateForCutoff('2026-12-31', T31)).toBe('2027-01-15');
  });

  it('due date is in the same month when the due day is after the statement day', () => {
    expect(dueDateForCutoff('2026-10-15', T15)).toBe('2026-10-30');
  });
});

describe('installments', () => {
  it('splits and puts the remainder in the last installment', () => {
    expect(splitInstallments(100_000, 3)).toEqual([33_333, 33_333, 33_334]);
    expect(splitInstallments(1_200_000, 12).every((x) => x === 100_000)).toBe(true);
  });

  it('bills one installment per cutoff starting at the first cutoff on or after the purchase', () => {
    const laptop: CardCharge = { date: '2026-10-03', amount: 1_200_000, installments: 12 };
    expect(billedThrough([laptop], '2026-09-15', T15)).toBe(0);
    expect(billedThrough([laptop], '2026-10-15', T15)).toBe(100_000);
    expect(billedThrough([laptop], '2026-11-15', T15)).toBe(200_000);
    expect(billedThrough([laptop], '2027-09-15', T15)).toBe(1_200_000);
    expect(billedThrough([laptop], '2030-01-15', T15)).toBe(1_200_000);
  });

  it('a purchase on the cutoff day is billed in that cutoff', () => {
    expect(
      billedThrough([{ date: '2026-10-15', amount: 50_000, installments: 1 }], '2026-10-15', T15),
    ).toBe(50_000);
  });

  it('keeps the remainder for the last installment', () => {
    const c: CardCharge = { date: '2026-10-01', amount: 100_000, installments: 3 };
    expect(billedThrough([c], '2026-11-15', T15)).toBe(66_666);
    expect(billedThrough([c], '2026-12-15', T15)).toBe(100_000);
  });
});

describe('cardStatus', () => {
  const laptop: CardCharge = { date: '2026-10-03', amount: 1_200_000, installments: 12 };

  it('spec example: 1.200.000 at 12 installments → monthly payment 100.000 due on the 30th', () => {
    const s = cardStatus({
      terms: T15,
      charges: [laptop],
      totalPayments: 0,
      debt: 1_200_000,
      today: '2026-10-20',
    });
    expect(s).toMatchObject({
      lastCutoff: '2026-10-15',
      lastDueDate: '2026-10-30',
      amountDue: 100_000,
      isOverdue: false,
    });
    expect(s.committed).toBe(200_000);
    expect(s.nextCutoff).toBe('2026-11-15');
    expect(s.nextDueDate).toBe('2026-11-30');
  });

  it('before the first cutoff nothing is due yet but the first installment is committed', () => {
    const s = cardStatus({
      terms: T15,
      charges: [laptop],
      totalPayments: 0,
      debt: 1_200_000,
      today: '2026-10-06',
    });
    expect(s.amountDue).toBe(0);
    expect(s.committed).toBe(100_000);
  });

  it('partial payments carry over and an unpaid past due date is overdue', () => {
    const charges: CardCharge[] = [{ date: '2026-09-20', amount: 1_000_000, installments: 1 }];
    const afterPartial = cardStatus({
      terms: T15,
      charges,
      totalPayments: 300_000,
      debt: 700_000,
      today: '2026-10-26',
    });
    expect(afterPartial.amountDue).toBe(700_000);
    expect(afterPartial.isOverdue).toBe(false);

    const late = cardStatus({
      terms: T15,
      charges,
      totalPayments: 300_000,
      debt: 700_000,
      today: '2026-11-01',
    });
    expect(late.isOverdue).toBe(true);

    const withNew = [...charges, { date: '2026-11-01', amount: 200_000, installments: 1 }];
    const next = cardStatus({
      terms: T15,
      charges: withNew,
      totalPayments: 300_000,
      debt: 900_000,
      today: '2026-11-20',
    });
    expect(next.amountDue).toBe(900_000);
  });

  it('overpayments reduce the next statement', () => {
    const charges: CardCharge[] = [
      { date: '2026-09-20', amount: 1_000_000, installments: 1 },
      { date: '2026-11-01', amount: 200_000, installments: 1 },
    ];
    const s = cardStatus({
      terms: T15,
      charges,
      totalPayments: 1_100_000,
      debt: 100_000,
      today: '2026-11-20',
    });
    expect(s.amountDue).toBe(100_000);
  });

  it('never reports a negative payment, even with a credit balance (review focus #4)', () => {
    const s = cardStatus({
      terms: T15,
      charges: [],
      totalPayments: 300_000,
      debt: -300_000,
      today: '2026-11-20',
    });
    expect(s.amountDue).toBe(0);
    expect(s.committed).toBe(0);
  });

  it('treats the initial debt as already billed at the last cutoff before opening', () => {
    const charge = initialDebtCharge(
      { initialDebt: 800_000, initialDebtInstallments: 1, openingDate: '2026-10-06' },
      T31,
    );
    expect(charge).toEqual({ date: '2026-09-30', amount: 800_000, installments: 1 });
    const s = cardStatus({
      terms: T31,
      charges: [charge!],
      totalPayments: 0,
      debt: 800_000,
      today: '2026-10-06',
    });
    expect(s.amountDue).toBe(800_000);
    expect(s.lastDueDate).toBe('2026-10-15');
    expect(
      initialDebtCharge(
        { initialDebt: 0, initialDebtInstallments: 1, openingDate: '2026-10-06' },
        T31,
      ),
    ).toBeNull();
  });
});

describe('exigibleAt and upcomingInstallments', () => {
  it('only counts statements whose due date has arrived', () => {
    const input = {
      terms: T15,
      charges: [{ date: '2026-10-03', amount: 500_000, installments: 1 }],
      totalPayments: 0,
      debt: 500_000,
      today: '2026-10-06',
    };
    expect(exigibleAt(input, '2026-10-29')).toBe(0);
    expect(exigibleAt(input, '2026-10-30')).toBe(500_000);
  });

  it('lists the future installments by cutoff', () => {
    const laptop: CardCharge = { date: '2026-10-03', amount: 1_200_000, installments: 12 };
    const up = upcomingInstallments([laptop], '2026-10-15', T15, 3);
    expect(up).toEqual([
      { cutoff: '2026-11-15', dueDate: '2026-11-30', amount: 100_000 },
      { cutoff: '2026-12-15', dueDate: '2026-12-30', amount: 100_000 },
      { cutoff: '2027-01-15', dueDate: '2027-01-30', amount: 100_000 },
    ]);
  });
});
