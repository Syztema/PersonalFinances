import { describe, expect, it } from 'vitest';
import type {
  AccountRefDTO,
  AccountType,
  CategoryRefDTO,
  PaymentMethod,
  RefDTO,
  TransactionType,
} from '@finanzas/shared';
import { buildReport, type ReportEntry, type ReportInput } from './report';

const accountRef = (
  id: string,
  name: string,
  type: AccountType,
  isActive = true,
): AccountRefDTO => ({
  id,
  name,
  type,
  icon: 'wallet',
  color: '#0f766e',
  isActive,
});
const cardRef = (id: string, name: string): RefDTO => ({
  id,
  name,
  icon: 'credit-card',
  color: '#7c3aed',
  isActive: true,
});
const categoryRef = (
  id: string,
  name: string,
  kind: 'INCOME' | 'EXPENSE',
  parentId: string | null = null,
  isActive = true,
): CategoryRefDTO => ({ id, name, kind, parentId, icon: 'tag', color: '#64748b', isActive });

const CATEGORIES = [
  categoryRef('food', 'Alimentación', 'EXPENSE'),
  categoryRef('rest', 'Restaurantes', 'EXPENSE', 'food'),
  categoryRef('fun', 'Entretenimiento', 'EXPENSE', null, false),
  categoryRef('interest', 'Intereses y comisiones', 'EXPENSE'),
  categoryRef('adj', 'Ajuste de saldo', 'EXPENSE'),
  categoryRef('salary', 'Salario', 'INCOME'),
  categoryRef('extra', 'Ingreso extra', 'INCOME'),
];
const cat = (id: string) => CATEGORIES.find((c) => c.id === id)!;

interface EntryInput {
  accountId?: string;
  toAccountId?: string;
  creditCardId?: string;
  debtId?: string;
  categoryId?: string;
  paymentMethod?: PaymentMethod;
}
const entry = (
  date: string,
  type: TransactionType,
  amount: number,
  refs: EntryInput = {},
): ReportEntry => ({
  date,
  type,
  amount,
  accountId: refs.accountId ?? null,
  toAccountId: refs.toAccountId ?? null,
  creditCardId: refs.creditCardId ?? null,
  debtId: refs.debtId ?? null,
  categoryId: refs.categoryId ?? null,
  paymentMethod: refs.paymentMethod ?? null,
});

/**
 * Periodo personalizado del 15 de agosto al 10 de octubre (meses parciales en los dos extremos).
 * Banco $1.000.000, Ahorro $0, Efectivo $50.000 (eliminada después de quedar en $0), Nequi
 * $200.000 (nueva: su primer movimiento es a mitad del periodo), Otra $0 sin movimientos;
 * tarjeta con deuda inicial $100.000 y préstamo de $5.000.000.
 */
function sample(): ReportInput {
  return {
    period: {
      preset: null,
      from: '2026-08-15',
      to: '2026-10-10',
      months: ['2026-08', '2026-09', '2026-10'],
    },
    accounts: [
      { ref: accountRef('bank', 'Banco', 'BANK'), initialBalance: 1_000_000 },
      { ref: accountRef('sav', 'Ahorro', 'SAVINGS'), initialBalance: 0 },
      { ref: accountRef('cash', 'Efectivo', 'CASH', false), initialBalance: 50_000 },
      { ref: accountRef('new', 'Nequi', 'DIGITAL_WALLET'), initialBalance: 200_000 },
      { ref: accountRef('idle', 'Otra', 'OTHER'), initialBalance: 0 },
    ],
    cards: [
      { ref: cardRef('card', 'Visa'), initialDebt: 100_000 },
      { ref: cardRef('idle-card', 'Sin uso'), initialDebt: 0 },
    ],
    loans: [{ id: 'loan', initialBalance: 5_000_000 }],
    categories: new Map(CATEGORIES.map((c) => [c.id, c])),
    entries: [
      // Antes del periodo: solo cuentan para los saldos de apertura.
      entry('2026-08-01', 'INCOME', 500_000, { accountId: 'bank', categoryId: 'salary' }),
      entry('2026-08-10', 'EXPENSE', 30_000, { accountId: 'cash', categoryId: 'food' }),
      // Agosto (desde el 15).
      entry('2026-08-20', 'INCOME', 2_000_000, { accountId: 'bank', categoryId: 'salary' }),
      entry('2026-08-25', 'EXPENSE', 100_000, {
        accountId: 'bank',
        categoryId: 'rest',
        paymentMethod: 'DEBIT_CARD',
      }),
      entry('2026-08-31', 'TRANSFER', 300_000, { accountId: 'bank', toAccountId: 'sav' }),
      // Septiembre.
      entry('2026-09-05', 'CARD_PURCHASE', 600_000, { creditCardId: 'card', categoryId: 'fun' }),
      entry('2026-09-10', 'CARD_PAYMENT', 200_000, { accountId: 'bank', creditCardId: 'card' }),
      entry('2026-09-15', 'DEBT_PAYMENT', 400_000, { accountId: 'bank', debtId: 'loan' }),
      entry('2026-09-15', 'EXPENSE', 50_000, { accountId: 'bank', categoryId: 'interest' }),
      entry('2026-09-20', 'EXPENSE', 20_000, { accountId: 'cash', categoryId: 'food' }),
      entry('2026-09-25', 'EXPENSE', 10_000, { accountId: 'new', categoryId: 'adj' }),
      // Octubre (hasta el 10).
      entry('2026-10-01', 'INCOME', 150_000, { accountId: 'new', categoryId: 'extra' }),
      entry('2026-10-05', 'EXPENSE', 80_000, { accountId: 'bank', categoryId: 'food' }),
      entry('2026-10-08', 'DEBT_DISBURSEMENT', 1_000_000, { accountId: 'bank', debtId: 'loan' }),
    ],
  };
}

describe('buildReport — totals (spec Fase 3 §3.2.1)', () => {
  it('applies the money rules of every movement type', () => {
    // Gasto = 100.000 + 600.000 (compra completa) + 50.000 (intereses) + 20.000 + 10.000 (ajuste)
    // + 80.000; la transferencia, el pago de tarjeta, el abono al préstamo y el desembolso no cuentan.
    expect(buildReport(sample()).totals).toEqual({
      income: 2_150_000,
      expense: 860_000,
      savings: 300_000,
      investment: 0,
      remaining: 990_000,
      savingsRate: 0.1395,
    });
  });

  it('returns a null savings rate when there is no income', () => {
    const input = sample();
    input.period = { preset: null, from: '2026-09-01', to: '2026-09-30', months: ['2026-09'] };
    expect(buildReport(input).totals).toEqual({
      income: 0,
      expense: 680_000,
      savings: 0,
      investment: 0,
      remaining: -680_000,
      savingsRate: null,
    });
  });

  it('ignores movements after the end of the period', () => {
    const input = sample();
    input.entries.push(
      entry('2026-10-11', 'EXPENSE', 999, { accountId: 'bank', categoryId: 'food' }),
    );
    expect(buildReport(input).totals.expense).toBe(860_000);
  });
});

describe('buildReport — categories and payment methods (spec Fase 3 §3.2.2 and §3.2.5)', () => {
  it('groups subcategories in their main category, sorted by amount with shares', () => {
    const report = buildReport(sample());
    expect(report.expenseByCategory).toEqual([
      { category: cat('fun'), amount: 600_000, share: 0.6977 },
      { category: cat('food'), amount: 200_000, share: 0.2326 },
      { category: cat('interest'), amount: 50_000, share: 0.0581 },
      { category: cat('adj'), amount: 10_000, share: 0.0116 },
    ]);
    expect(report.incomeByCategory).toEqual([
      { category: cat('salary'), amount: 2_000_000, share: 0.9302 },
      { category: cat('extra'), amount: 150_000, share: 0.0698 },
    ]);
  });

  it('breaks ties by name', () => {
    const input = sample();
    input.period = { preset: null, from: '2026-10-11', to: '2026-10-11', months: ['2026-10'] };
    input.entries.push(
      entry('2026-10-11', 'EXPENSE', 5_000, { accountId: 'bank', categoryId: 'interest' }),
      entry('2026-10-11', 'EXPENSE', 5_000, { accountId: 'bank', categoryId: 'adj' }),
    );
    expect(buildReport(input).expenseByCategory.map((r) => r.category.name)).toEqual([
      'Ajuste de saldo',
      'Intereses y comisiones',
    ]);
  });

  it('groups spending by derived payment method', () => {
    expect(buildReport(sample()).paymentMethods).toEqual([
      { method: 'CREDIT_CARD', amount: 600_000, share: 0.6977 },
      { method: 'BANK', amount: 130_000, share: 0.1512 },
      { method: 'DEBIT_CARD', amount: 100_000, share: 0.1163 },
      { method: 'CASH', amount: 20_000, share: 0.0233 },
      { method: 'DIGITAL_WALLET', amount: 10_000, share: 0.0116 },
    ]);
  });
});

describe('buildReport — accounts and cards (spec Fase 3 §3.2.3 and §3.2.4)', () => {
  it('keeps opening + inflow − outflow = closing for every account, deleted or new (review focus 1)', () => {
    const { accounts } = buildReport(sample());
    expect(accounts).toEqual([
      {
        account: accountRef('bank', 'Banco', 'BANK'),
        opening: 1_500_000,
        inflow: 3_000_000,
        outflow: 1_130_000,
        closing: 3_370_000,
      },
      {
        account: accountRef('sav', 'Ahorro', 'SAVINGS'),
        opening: 0,
        inflow: 300_000,
        outflow: 0,
        closing: 300_000,
      },
      {
        account: accountRef('cash', 'Efectivo', 'CASH', false),
        opening: 20_000,
        inflow: 0,
        outflow: 20_000,
        closing: 0,
      },
      {
        account: accountRef('new', 'Nequi', 'DIGITAL_WALLET'),
        opening: 200_000,
        inflow: 150_000,
        outflow: 10_000,
        closing: 340_000,
      },
    ]);
    for (const a of accounts) expect(a.opening + a.inflow - a.outflow).toBe(a.closing);
  });

  it('reports card purchases, payments and closing debt with the initial debt', () => {
    expect(buildReport(sample()).cards).toEqual([
      {
        card: cardRef('card', 'Visa'),
        purchases: 600_000,
        payments: 200_000,
        closingDebt: 500_000,
      },
    ]);
  });
});

describe('buildReport — monthly series (spec Fase 3 §3.2.6)', () => {
  it('clips the partial months to the period and closes each month on its balances', () => {
    expect(buildReport(sample()).months).toEqual([
      {
        month: '2026-08',
        income: 2_000_000,
        expense: 100_000,
        savings: 300_000,
        investment: 0,
        remaining: 1_600_000,
        closing: {
          totalMoney: 3_620_000,
          debts: 5_100_000,
          netWorth: -1_480_000,
          savingsBalance: 300_000,
        },
      },
      {
        month: '2026-09',
        income: 0,
        expense: 680_000,
        savings: 0,
        investment: 0,
        remaining: -680_000,
        closing: {
          totalMoney: 2_940_000,
          debts: 5_100_000,
          netWorth: -2_160_000,
          savingsBalance: 300_000,
        },
      },
      {
        month: '2026-10',
        income: 150_000,
        expense: 80_000,
        savings: 0,
        investment: 0,
        remaining: 70_000,
        closing: {
          totalMoney: 4_010_000,
          debts: 6_100_000,
          netWorth: -2_090_000,
          savingsBalance: 300_000,
        },
      },
    ]);
  });

  it('makes the partial months add up exactly to the period totals (review focus 2)', () => {
    const { totals, months } = buildReport(sample());
    for (const key of ['income', 'expense', 'savings', 'investment', 'remaining'] as const) {
      expect(
        months.reduce((s, m) => s + m[key], 0),
        key,
      ).toBe(totals[key]);
    }
    const lastClosing = months[months.length - 1]!.closing;
    const accounts = buildReport(sample()).accounts;
    expect(lastClosing.totalMoney).toBe(accounts.reduce((s, a) => s + a.closing, 0));
  });
});
