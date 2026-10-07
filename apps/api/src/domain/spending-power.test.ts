import { describe, expect, it } from 'vitest';
import { spendingPower, type SpendingPowerInput } from './spending-power';

const base: SpendingPowerInput = {
  today: '2026-10-10', // octubre: 22 días de hoy a fin de mes, incluido hoy
  liquidBase: 0,
  reserve: 0,
  savingsPct: 20,
  investmentPct: 10,
  expectedIncomes: [],
  obligations: [],
  cards: [],
  loans: [],
  budget: null,
  spentToday: 0,
};
const run = (i: Partial<SpendingPowerInput>) => spendingPower({ ...base, ...i });

describe('spendingPower (spec 8.7)', () => {
  it('spreads liquid money over the rest of the month', () => {
    const r = run({ liquidBase: 2_200_000 });
    expect(r).toMatchObject({
      daily: 100_000,
      limitedBy: 'LIQUIDITY',
      reason: null,
      endOfMonthBalance: 2_200_000,
    });
    expect(r.breakdown.liquidity).toMatchObject({
      daily: 100_000,
      bindingDate: '2026-10-31',
      days: 22,
    });
    expect(r.breakdown.budget).toBeNull();
  });

  it('does not let you spend today the salary that arrives on the 15th', () => {
    const r = run({
      liquidBase: 100_000,
      expectedIncomes: [{ date: '2026-10-15', amount: 3_000_000 }],
    });
    // Hasta el 14 solo hay 100.000 para 5 días.
    expect(r.daily).toBe(20_000);
    expect(r.breakdown.liquidity).toMatchObject({ bindingDate: '2026-10-14', days: 5 });
  });

  it('counts expected income net of the savings and investment percentages', () => {
    const r = run({ liquidBase: 0, expectedIncomes: [{ date: '2026-10-11', amount: 2_200_000 }] });
    // Hoy no hay nada: la cifra es 0 aunque mañana lleguen 2.200.000 × 70 %.
    expect(r.daily).toBe(0);
    const later = run({
      liquidBase: 22_000,
      expectedIncomes: [{ date: '2026-10-11', amount: 2_200_000 }],
    });
    expect(later.breakdown.liquidity.bindingDate).toBe('2026-10-10');
    expect(later.endOfMonthBalance).toBe(22_000 + 1_540_000);
  });

  it('subtracts overdue obligations from today', () => {
    const r = run({ liquidBase: 500_000, obligations: [{ date: '2026-10-05', amount: 300_000 }] });
    expect(r.daily).toBe(9_000); // 200.000 / 22 = 9.090 → 9.000
  });

  it('returns 0 with the main cause when obligations exceed the money', () => {
    const r = run({
      liquidBase: 100_000,
      obligations: [{ date: '2026-10-20', amount: 400_000 }],
      spentToday: 15_000,
    });
    expect(r).toMatchObject({
      daily: 0,
      remainingToday: -15_000,
      reason: 'Tus obligaciones pendientes del mes no dejan margen.',
    });
  });

  it('applies the budget limit when it is lower', () => {
    const r = run({
      liquidBase: 10_000_000,
      budget: { amount: 1_000_000, spentBase: 560_000, pendingObligations: 0 },
      spentToday: 5_000,
    });
    expect(r).toMatchObject({ daily: 20_000, remainingToday: 15_000, limitedBy: 'BUDGET' });
    expect(r.breakdown.budget).toMatchObject({ daily: 20_000, days: 22 });
    const withObligations = run({
      liquidBase: 10_000_000,
      budget: { amount: 1_000_000, spentBase: 560_000, pendingObligations: 200_000 },
    });
    expect(withObligations.daily).toBe(10_900);
    const exhausted = run({
      liquidBase: 10_000_000,
      budget: { amount: 1_000_000, spentBase: 1_200_000, pendingObligations: 0 },
    });
    expect(exhausted).toMatchObject({
      daily: 0,
      reason: 'Tu presupuesto del mes no deja margen para hoy.',
    });
  });

  it('charges the card payment on its due date and the committed debt at month end', () => {
    const r = run({
      liquidBase: 1_000_000,
      cards: [
        {
          terms: { statementDay: 15, paymentDueDay: 30 },
          charges: [{ date: '2026-10-03', amount: 600_000, installments: 1 }],
          totalPayments: 0,
          debt: 600_000,
          today: '2026-10-10',
        },
      ],
    });
    expect(r.daily).toBe(18_100); // 400.000 / 22
    const cards = r.breakdown.liquidity.items.find((x) => x.key === 'cards');
    expect(cards?.amount).toBe(-600_000);
  });

  it('ignores a loan installment dated before the loan was registered', () => {
    const loan = { balance: 8_000_000, monthlyPayment: 450_000, paidThisMonth: 0 };
    expect(
      run({ liquidBase: 2_200_000, loans: [{ ...loan, paymentDay: 5, openingDate: '2026-10-08' }] })
        .daily,
    ).toBe(100_000);
    expect(
      run({
        liquidBase: 2_200_000,
        loans: [{ ...loan, paymentDay: 25, openingDate: '2026-01-01' }],
      }).daily,
    ).toBe(79_500); // 1.750.000 / 22
  });

  it('keeps the savings reserve apart', () => {
    expect(run({ liquidBase: 2_200_000, reserve: 220_000 }).daily).toBe(90_000);
  });

  it('works on the last day of the month', () => {
    const r = run({ today: '2026-10-31', liquidBase: 50_000 });
    expect(r.breakdown.liquidity).toMatchObject({
      daily: 50_000,
      days: 1,
      bindingDate: '2026-10-31',
    });
  });
});
