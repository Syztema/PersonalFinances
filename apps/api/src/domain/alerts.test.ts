import { describe, expect, it } from 'vitest';
import {
  computeAlerts,
  median,
  overallStatus,
  shortDate,
  unusualExpenses,
  type AlertsInput,
} from './alerts';

const base: AlertsInput = {
  today: '2026-10-20',
  hasAccounts: true,
  budget: { total: null, lines: [] },
  savings: { target: 0, actual: 0 },
  cards: [],
  obligations: [],
  expectedIncomes: [],
  monthIncome: 0,
  monthExpense: 0,
  unusual: [],
  available: 1_000_000,
  lowBalanceThreshold: 100_000,
  projectedEndBalance: 0,
  negativeAccounts: [],
};
const alerts = (i: Partial<AlertsInput>) => computeAlerts({ ...base, ...i });
const keys = (i: Partial<AlertsInput>) => alerts(i).map((a) => a.key);
const card = {
  id: 'c1',
  name: 'Nu',
  utilization: 0.1,
  amountDue: 0,
  dueDate: '2026-10-30',
  isOverdue: false,
};

describe('computeAlerts (spec 8.12)', () => {
  it('is quiet when everything is fine', () => {
    expect(alerts({})).toEqual([]);
  });

  it('shows only the highest budget threshold reached', () => {
    const total = (spent: number) => ({
      budget: { total: { budget: 1_000_000, spent }, lines: [] },
    });
    expect(keys(total(490_000))).toEqual([]);
    expect(alerts(total(500_000))[0]).toMatchObject({
      key: 'budget:2026-10:total:50',
      level: 'INFO',
    });
    expect(alerts(total(750_000))[0]).toMatchObject({
      key: 'budget:2026-10:total:75',
      level: 'WARNING',
    });
    expect(alerts(total(900_000))[0]).toMatchObject({
      key: 'budget:2026-10:total:90',
      level: 'WARNING',
    });
    expect(alerts(total(1_000_000))[0]).toMatchObject({
      key: 'budget:2026-10:total:100',
      level: 'DANGER',
      title: 'Superaste el presupuesto',
    });
    const line = alerts({
      budget: {
        total: null,
        lines: [{ categoryId: 'cat1', name: 'Mercado', budget: 400_000, spent: 380_000 }],
      },
    });
    expect(line[0]).toMatchObject({
      key: 'budget:2026-10:cat1:90',
      title: 'Llevas el 95 % del presupuesto de Mercado',
    });
  });

  it('warns about savings after the middle of the month', () => {
    expect(keys({ savings: { target: 800_000, actual: 300_000 } })).toEqual(['savings:2026-10']);
    expect(keys({ savings: { target: 800_000, actual: 400_000 } })).toEqual([]);
    expect(keys({ today: '2026-10-15', savings: { target: 800_000, actual: 0 } })).toEqual([]);
  });

  it('warns about card limits, upcoming and overdue payments', () => {
    expect(alerts({ cards: [{ ...card, utilization: 0.8 }] })[0]).toMatchObject({
      key: 'card-limit:2026-10:c1:80',
      level: 'WARNING',
    });
    expect(alerts({ cards: [{ ...card, utilization: 0.96 }] })[0]).toMatchObject({
      key: 'card-limit:2026-10:c1:95',
      level: 'DANGER',
    });
    expect(keys({ cards: [{ ...card, amountDue: 300_000, dueDate: '2026-10-25' }] })).toEqual([
      'card-due:c1:2026-10-25',
    ]);
    expect(keys({ cards: [{ ...card, amountDue: 300_000, dueDate: '2026-10-26' }] })).toEqual([]);
    expect(
      alerts({
        cards: [{ ...card, amountDue: 300_000, dueDate: '2026-10-15', isOverdue: true }],
      })[0],
    ).toMatchObject({ key: 'card-overdue:c1:2026-10-15', level: 'DANGER' });
  });

  it('warns about obligations due in 3 days and overdue ones', () => {
    const o = (dueDate: string) => ({
      obligations: [{ id: 'o1', name: 'Arriendo', dueDate, amount: 1_000_000 }],
    });
    expect(alerts(o('2026-10-23'))[0]).toMatchObject({
      key: 'obligation-due:o1:2026-10-23',
      title: 'Arriendo vence el 23 oct',
    });
    expect(alerts(o('2026-10-20'))[0]?.title).toBe('Arriendo vence hoy');
    expect(keys(o('2026-10-24'))).toEqual([]);
    expect(alerts(o('2026-10-19'))[0]).toMatchObject({
      key: 'obligation-overdue:o1:2026-10-19',
      level: 'DANGER',
    });
  });

  it('covers overspending, unusual expenses, low money, negative projection, late income and negative balances', () => {
    expect(keys({ monthIncome: 1_000_000, monthExpense: 1_200_000 })).toEqual([
      'overspend:2026-10',
    ]);
    expect(
      keys({
        unusual: [{ id: 't1', categoryName: 'Compras', description: 'TV', amount: 2_000_000 }],
      }),
    ).toEqual(['unusual:t1']);
    expect(keys({ available: 50_000 })).toEqual(['low-balance:2026-10-20']);
    expect(keys({ available: 50_000, hasAccounts: false })).toEqual([]);
    expect(keys({ projectedEndBalance: -10_000 })).toEqual(['projection:2026-10']);
    const income = (dueDate: string) => ({
      expectedIncomes: [{ id: 'i1', name: 'Salario', dueDate, amount: 2_000_000 }],
    });
    expect(keys(income('2026-10-15'))).toEqual(['income-late:i1:2026-10-15']);
    expect(keys(income('2026-10-25'))).toEqual([]);
    expect(keys({ negativeAccounts: [{ id: 'a1', name: 'Nequi', balance: -5_000 }] })).toEqual([
      'negative-balance:a1:2026-10',
    ]);
  });

  it('sorts danger first, then warnings, then information', () => {
    const levels = alerts({
      unusual: [{ id: 't1', categoryName: 'Compras', description: null, amount: 1 }],
      monthIncome: 0,
      monthExpense: 10,
      projectedEndBalance: -1,
    }).map((a) => a.level);
    expect(levels).toEqual(['DANGER', 'WARNING', 'INFO']);
  });
});

describe('unusualExpenses and helpers', () => {
  const history = new Map([['cat', [10_000, 12_000, 11_000, 9_000, 13_000]]]);
  const recent = (amount: number, categoryId = 'cat') => [
    { id: 't', categoryId, categoryName: 'Comida', description: null, amount },
  ];
  it('flags more than 3 × the median with at least 5 data points', () => {
    expect(unusualExpenses(recent(40_000), history)).toHaveLength(1);
    expect(unusualExpenses(recent(30_000), history)).toHaveLength(0);
    expect(unusualExpenses(recent(40_000), new Map([['cat', [1, 1, 1, 1]]]))).toHaveLength(0);
    expect(unusualExpenses(recent(40_000, 'otra'), history)).toHaveLength(0);
  });
  it('computes medians and short dates', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(shortDate('2026-10-05')).toBe('05 oct');
  });
});

describe('overallStatus (spec 8.12)', () => {
  const s = (i: Partial<Parameters<typeof overallStatus>[0]>) =>
    overallStatus({
      today: '2026-10-20',
      budget: null,
      monthExpense: 0,
      projectedIncome: 0,
      projectionNegative: false,
      ...i,
    });

  it('asks for data when there is nothing to compare', () => {
    expect(s({})).toEqual({
      level: 'OK',
      title: 'Vas bien',
      message: 'Registra tus ingresos y gastos para ver cómo vas este mes.',
    });
  });

  it('uses the budget usage and the projection', () => {
    expect(
      s({ budget: { budget: 1_000_000, spent: 950_000, projectedSpend: 1_200_000 } }).level,
    ).toBe('DANGER');
    expect(
      s({ budget: { budget: 1_000_000, spent: 760_000, projectedSpend: 900_000 } }).level,
    ).toBe('WARNING');
    expect(s({ budget: { budget: 1_000_000, spent: 400_000, projectedSpend: 620_000 } })).toEqual({
      level: 'OK',
      title: 'Vas bien',
      message: 'Has utilizado el 40 % de tu presupuesto y quedan 12 días.',
    });
    expect(
      s({ budget: { budget: 1_000_000, spent: 300_000, projectedSpend: 1_100_000 } }).level,
    ).toBe('WARNING');
    expect(
      s({
        today: '2026-10-05',
        budget: { budget: 1_000_000, spent: 500_000, projectedSpend: 900_000 },
      }).level,
    ).toBe('WARNING');
    expect(s({ projectionNegative: true }).level).toBe('DANGER');
  });

  it('without a budget compares expenses with the projected income', () => {
    expect(s({ monthExpense: 1_000_000, projectedIncome: 2_000_000 })).toEqual({
      level: 'OK',
      title: 'Vas bien',
      message: 'Has gastado el 50 % de tu ingreso del mes y quedan 12 días.',
    });
  });
});
