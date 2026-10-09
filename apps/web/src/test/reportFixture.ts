import type {
  AccountRefDTO,
  AccountType,
  CategoryKind,
  CategoryRefDTO,
  CompanionRefDTO,
  ReportDTO,
} from '@finanzas/shared';

export const categoryRef = (
  id: string,
  name: string,
  kind: CategoryKind = 'EXPENSE',
): CategoryRefDTO => ({
  id,
  name,
  kind,
  parentId: null,
  icon: 'tag',
  color: '#0f766e',
  isActive: true,
});

export const accountRef = (
  id: string,
  name: string,
  type: AccountType = 'BANK',
): AccountRefDTO => ({
  id,
  name,
  type,
  icon: 'wallet',
  color: '#2563eb',
  isActive: true,
});

export const companionRef = (id: string, name: string, isActive = true): CompanionRefDTO => ({
  id,
  name,
  icon: 'users',
  color: '#c2410c',
  isActive,
});

/**
 * Reporte de octubre de 2026 (hasta el 20) que cuadra: gastos = categorías = métodos de pago,
 * opening + inflow − outflow = closing y restante = ingresos − gastos − ahorro − inversión.
 */
export function makeReport(overrides: Partial<ReportDTO> = {}): ReportDTO {
  return {
    period: { preset: 'THIS_MONTH', from: '2026-10-01', to: '2026-10-20', months: ['2026-10'] },
    totals: {
      income: 4_000_000,
      expense: 2_150_000,
      savings: 600_000,
      investment: 0,
      remaining: 1_250_000,
      savingsRate: 0.15,
    },
    expenseByCategory: [
      { category: categoryRef('c-rent', 'Arriendo'), amount: 1_000_000, share: 0.4651 },
      { category: categoryRef('c-food', 'Mercado'), amount: 820_000, share: 0.3814 },
      { category: categoryRef('c-transport', 'Transporte'), amount: 180_000, share: 0.0837 },
      { category: categoryRef('c-dining', 'Restaurantes'), amount: 150_000, share: 0.0698 },
    ],
    incomeByCategory: [
      { category: categoryRef('c-salary', 'Salario', 'INCOME'), amount: 4_000_000, share: 1 },
    ],
    accounts: [
      {
        account: accountRef('a-bank', 'Bancolombia'),
        opening: 1_000_000,
        inflow: 4_000_000,
        outflow: 2_600_000,
        closing: 2_400_000,
      },
      {
        account: accountRef('a-savings', 'Ahorro', 'SAVINGS'),
        opening: 1_000_000,
        inflow: 600_000,
        outflow: 0,
        closing: 1_600_000,
      },
    ],
    cards: [
      {
        card: { id: 'k-nu', name: 'Nu', icon: 'credit-card', color: '#820ad1', isActive: true },
        purchases: 350_000,
        payments: 200_000,
        closingDebt: 900_000,
      },
    ],
    paymentMethods: [
      { method: 'BANK', amount: 1_800_000, share: 0.8372 },
      { method: 'CREDIT_CARD', amount: 350_000, share: 0.1628 },
    ],
    expenseByCompanion: [
      { companion: companionRef('p-friends', 'Amigos'), amount: 900_000, share: 0.4186 },
      { companion: companionRef('p-partner', 'Pareja'), amount: 500_000, share: 0.2326 },
      { companion: companionRef('p-family', 'Familia', false), amount: 250_000, share: 0.1163 },
      { companion: null, amount: 500_000, share: 0.2326 },
    ],
    companionMonths: [
      {
        month: '2026-10',
        items: [
          { companionId: 'p-friends', amount: 900_000 },
          { companionId: 'p-partner', amount: 500_000 },
          { companionId: 'p-family', amount: 250_000 },
          { companionId: null, amount: 500_000 },
        ],
      },
    ],
    months: [
      {
        month: '2026-10',
        income: 4_000_000,
        expense: 2_150_000,
        savings: 600_000,
        investment: 0,
        remaining: 1_250_000,
        closing: {
          totalMoney: 4_000_000,
          debts: 900_000,
          netWorth: 3_100_000,
          savingsBalance: 1_600_000,
        },
      },
    ],
    budget: {
      months: [{ month: '2026-10', budget: 2_500_000, spent: 2_150_000 }],
      lines: [
        { category: categoryRef('c-rent', 'Arriendo'), amount: 1_000_000, spent: 1_000_000 },
        { category: categoryRef('c-food', 'Mercado'), amount: 900_000, spent: 820_000 },
      ],
    },
    ...overrides,
  };
}

/** Mismo periodo sin ningún movimiento: solo saldos que vienen de antes. */
export function makeEmptyReport(overrides: Partial<ReportDTO> = {}): ReportDTO {
  return makeReport({
    totals: { income: 0, expense: 0, savings: 0, investment: 0, remaining: 0, savingsRate: null },
    expenseByCategory: [],
    incomeByCategory: [],
    accounts: [
      {
        account: accountRef('a-bank', 'Bancolombia'),
        opening: 2_400_000,
        inflow: 0,
        outflow: 0,
        closing: 2_400_000,
      },
    ],
    cards: [],
    paymentMethods: [],
    expenseByCompanion: [],
    companionMonths: [{ month: '2026-10', items: [] }],
    months: [
      {
        month: '2026-10',
        income: 0,
        expense: 0,
        savings: 0,
        investment: 0,
        remaining: 0,
        closing: { totalMoney: 2_400_000, debts: 0, netWorth: 2_400_000, savingsBalance: 0 },
      },
    ],
    budget: { months: [{ month: '2026-10', budget: null, spent: 0 }], lines: [] },
    ...overrides,
  });
}
