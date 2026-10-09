import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DashboardDTO, ReportDTO } from '@finanzas/shared';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { loadReport } from '../src/modules/reports/service';
import type { AuthContext } from '../src/types/fastify';
import { balanceOf, setupFinances } from './finance-fixtures';
import { client, createTestApp, registerUser, type Client } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

async function newUser() {
  const { api, user, cookie } = await registerUser(app);
  return { api, cookie, userId: user.id, f: await setupFinances(api) };
}

const report = async (api: Client, query: string) => {
  const res = await api.get<ReportDTO>(`/api/reports?${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
};

const expense = (
  api: Client,
  date: string,
  amount: number,
  accountId: string,
  categoryId: string,
) => api.post('/api/transactions', { type: 'EXPENSE', amount, date, accountId, categoryId });

describe('GET /api/reports — coherence (spec Fase 3 §9.2)', () => {
  it('THIS_MONTH totals are the dashboard "thisMonth"', async () => {
    const { api, f } = await newUser();
    await expense(api, '2026-09-28', 70_000, f.cash, f.cat.food); // mes anterior: no cuenta
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 3_000_000,
      date: '2026-10-01',
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    await expense(api, '2026-10-05', 150_000, f.bank, f.cat.food);
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 1_200_000,
      date: '2026-10-06',
      categoryId: f.cat.fun,
      installments: 12,
    });
    await api.post('/api/transfers', {
      amount: 500_000,
      date: '2026-10-07',
      accountId: f.bank,
      toAccountId: f.savings,
    });
    await api.post(`/api/credit-cards/${f.card}/payment`, {
      amount: 200_000,
      date: '2026-10-08',
      accountId: f.bank,
    });
    await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 400_000,
      interest: 50_000,
      date: '2026-10-10',
    });

    const r = await report(api, 'preset=THIS_MONTH');
    const d = (await api.get<DashboardDTO>('/api/dashboard')).body;
    expect(r.period).toEqual({
      preset: 'THIS_MONTH',
      from: '2026-10-01',
      to: TODAY,
      months: ['2026-10'],
    });
    expect(r.totals).toEqual({
      income: d.thisMonth.income,
      expense: d.thisMonth.expense,
      savings: d.thisMonth.savings,
      investment: d.thisMonth.investment,
      remaining: d.thisMonth.remaining,
      savingsRate: d.thisMonth.savingsRate,
    });
    expect(r.totals).toEqual({
      income: 3_000_000,
      expense: 1_400_000,
      savings: 500_000,
      investment: 0,
      remaining: 1_100_000,
      savingsRate: 0.1667,
    });
    expect(r.budget).toEqual({
      months: [{ month: '2026-10', budget: null, spent: 1_400_000 }],
      lines: [],
    });
  });

  it('keeps opening + inflow − outflow = closing and closes each month on its balances', async () => {
    const { api, f } = await newUser();
    await expense(api, '2026-07-15', 100_000, f.bank, f.cat.food); // antes del periodo
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 3_000_000,
      date: '2026-08-10',
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    await api.post('/api/transfers', {
      amount: 500_000,
      date: '2026-08-20',
      accountId: f.bank,
      toAccountId: f.savings,
    });
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 300_000,
      date: '2026-09-05',
      categoryId: f.cat.fun,
    });
    await api.post(`/api/credit-cards/${f.card}/payment`, {
      amount: 300_000,
      date: '2026-09-30',
      accountId: f.bank,
    });
    await expense(api, '2026-10-03', 100_000, f.cash, f.cat.food);
    // Efectivo queda en $0 y se elimina con historial.
    expect((await api.del(`/api/accounts/${f.cash}`)).body).toEqual({ deleted: 'soft' });
    await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 450_000,
      date: '2026-10-15',
    });

    const r = await report(api, 'preset=LAST_3_MONTHS');
    expect(r.period.months).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(r.totals).toEqual({
      income: 3_000_000,
      expense: 400_000,
      savings: 500_000,
      investment: 0,
      remaining: 2_100_000,
      savingsRate: 0.1667,
    });
    expect(
      r.accounts.map((a) => [
        a.account.name,
        a.account.isActive,
        a.opening,
        a.inflow,
        a.outflow,
        a.closing,
      ]),
    ).toEqual([
      ['Bancolombia', true, 1_900_000, 3_000_000, 1_250_000, 3_650_000],
      ['Bolsillo ahorro', true, 0, 500_000, 0, 500_000],
      ['Efectivo', false, 100_000, 0, 100_000, 0],
    ]);
    for (const a of r.accounts) {
      expect(a.opening + a.inflow - a.outflow, a.account.name).toBe(a.closing);
      expect(await balanceOf(api, a.account.id), a.account.name).toBe(a.closing);
    }
    expect(r.cards).toEqual([
      {
        card: expect.objectContaining({ id: f.card, name: 'Nu Crédito' }),
        purchases: 300_000,
        payments: 300_000,
        closingDebt: 0,
      },
    ]);
    expect(r.months.map((m) => ({ month: m.month, ...m.closing }))).toEqual([
      {
        month: '2026-08',
        totalMoney: 5_000_000,
        debts: 8_000_000,
        netWorth: -3_000_000,
        savingsBalance: 500_000,
      },
      {
        month: '2026-09',
        totalMoney: 4_700_000,
        debts: 8_000_000,
        netWorth: -3_300_000,
        savingsBalance: 500_000,
      },
      {
        month: '2026-10',
        totalMoney: 4_150_000,
        debts: 7_550_000,
        netWorth: -3_400_000,
        savingsBalance: 500_000,
      },
    ]);
    // El cierre del último mes (hoy) es lo que muestra el dashboard.
    const d = (await api.get<DashboardDTO>('/api/dashboard')).body;
    expect(r.months[2]!.closing).toEqual({
      totalMoney: d.money.total,
      debts: d.debts.total,
      netWorth: d.netWorth,
      savingsBalance: d.money.savings + d.money.investment,
    });
    expect(r.budget.months).toEqual([
      { month: '2026-08', budget: null, spent: 0 },
      { month: '2026-09', budget: null, spent: 300_000 },
      { month: '2026-10', budget: null, spent: 100_000 },
    ]);
  });
});

describe('GET /api/reports — money rules (spec Fase 3 §3.2)', () => {
  it('counts installments in full, groups subcategories and keeps deleted references', async () => {
    const { api, f } = await newUser();
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 1_000_000,
      date: '2026-10-01',
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 1_200_000,
      date: '2026-10-02',
      categoryId: f.cat.fun,
      installments: 12,
    });
    await api.post(`/api/credit-cards/${f.card}/payment`, {
      amount: 100_000,
      date: '2026-10-03',
      accountId: f.bank,
    });
    await api.post('/api/transfers', {
      amount: 300_000,
      date: '2026-10-04',
      accountId: f.bank,
      toAccountId: f.wallet,
    });
    const goal = (
      await api.post('/api/goals', { name: 'Viaje', targetAmount: 2_000_000, accountId: f.savings })
    ).body.goal;
    await api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.bank,
      amount: 200_000,
      date: '2026-10-05',
    });
    await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 400_000,
      interest: 50_000,
      date: '2026-10-06',
    });
    const restaurants = (
      await api.post('/api/categories', {
        name: 'Restaurantes',
        kind: 'EXPENSE',
        parentId: f.cat.food,
      })
    ).body.category.id;
    await expense(api, '2026-10-07', 80_000, f.bank, restaurants);
    await expense(api, '2026-10-08', 20_000, f.bank, f.cat.food);
    // Banco: 2.000.000 + 1.000.000 − 100.000 − 300.000 − 200.000 − 450.000 − 100.000 = 1.850.000.
    const adjust = await api.post(`/api/accounts/${f.bank}/adjust`, {
      actualBalance: 1_820_000,
      date: '2026-10-09',
    });
    expect(adjust.status).toBe(201);
    expect((await api.del(`/api/categories/${f.cat.fun}`)).body).toEqual({ deleted: 'soft' });

    const r = await report(api, 'preset=THIS_MONTH');
    expect(r.totals).toEqual({
      income: 1_000_000,
      expense: 1_380_000,
      savings: 200_000,
      investment: 0,
      remaining: -580_000,
      savingsRate: 0.2,
    });
    expect(
      r.expenseByCategory.map((c) => [c.category.name, c.category.isActive, c.amount, c.share]),
    ).toEqual([
      ['Entretenimiento', false, 1_200_000, 0.8696],
      ['Alimentación', true, 100_000, 0.0725],
      ['Intereses y comisiones', true, 50_000, 0.0362],
      ['Ajuste de saldo', true, 30_000, 0.0217],
    ]);
    expect(r.expenseByCategory.every((c) => c.category.parentId === null)).toBe(true);
    expect(r.incomeByCategory.map((c) => [c.category.name, c.amount, c.share])).toEqual([
      ['Salario', 1_000_000, 1],
    ]);
    expect(r.paymentMethods).toEqual([
      { method: 'CREDIT_CARD', amount: 1_200_000, share: 0.8696 },
      { method: 'BANK', amount: 180_000, share: 0.1304 },
    ]);
    expect(r.cards.map((c) => [c.card.name, c.purchases, c.payments, c.closingDebt])).toEqual([
      ['Nu Crédito', 1_200_000, 100_000, 1_100_000],
    ]);
    expect(
      r.accounts.map((a) => [a.account.name, a.opening, a.inflow, a.outflow, a.closing]),
    ).toEqual([
      ['Bancolombia', 2_000_000, 1_000_000, 1_180_000, 1_820_000],
      ['Nequi', 0, 300_000, 0, 300_000],
      ['Bolsillo ahorro', 0, 200_000, 0, 200_000],
      ['Efectivo', 100_000, 0, 0, 100_000],
    ]);
  });
});

describe('GET /api/reports — read only, validation and isolation', () => {
  it('never copies budgets nor generates occurrences (spec Fase 3 §3.2)', async () => {
    const { api, cookie, userId, f } = await newUser();
    await api.put('/api/budgets/2026-10', { totalAmount: 1_000_000, lines: [] });
    await api.post('/api/recurring', {
      name: 'Arriendo',
      kind: 'EXPENSE',
      amount: 1_000_000,
      categoryId: f.cat.food,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-25',
    });
    const later = await createTestApp({}, { now: () => new Date('2026-12-10T15:00:00Z') });
    try {
      const december = client(later.app, cookie);
      const counts = async () => ({
        budgets: await app.prisma.budget.count({ where: { userId } }),
        items: await app.prisma.scheduledItem.count({ where: { userId } }),
      });
      const before = await counts();
      expect(before.budgets).toBe(1);

      const r = await report(december, 'preset=LAST_3_MONTHS');
      expect(r.budget.months).toEqual([
        { month: '2026-10', budget: 1_000_000, spent: 0 },
        { month: '2026-11', budget: null, spent: 0 },
        { month: '2026-12', budget: null, spent: 0 },
      ]);
      expect(await counts()).toEqual(before);

      // El dashboard de diciembre sí copia el presupuesto y genera las ocurrencias pendientes.
      await december.get('/api/dashboard');
      const after = await counts();
      expect(after.budgets).toBe(2);
      expect(after.items).toBeGreaterThan(before.items);
    } finally {
      await later.app.close();
    }
  });

  it('answers 400 with fields for an invalid period', async () => {
    const { api } = await registerUser(app);
    const fieldsOf = async (query: string) => {
      const res = await api.get(`/api/reports?${query}`);
      expect(res.status, query).toBe(400);
      expect(res.body.error.code, query).toBe('VALIDATION_ERROR');
      return res.body.error.fields as Record<string, string>;
    };
    expect(await fieldsOf('from=2026-10-10&to=2026-10-01')).toEqual({
      from: 'La fecha inicial no puede ser posterior a la final',
    });
    expect(await fieldsOf('from=2026-10-01&to=2026-10-21')).toEqual({
      to: 'La fecha final no puede ser futura',
    });
    expect(await fieldsOf('from=2024-10-01&to=2026-10-20')).toEqual({
      from: 'Elige un periodo de máximo 24 meses',
    });
    expect(await fieldsOf('')).toEqual({ preset: 'Elige un periodo' });
    expect(await fieldsOf('preset=THIS_MONTH&from=2026-10-01&to=2026-10-10')).toEqual({
      preset: 'Elige un periodo',
    });
    expect(Object.keys(await fieldsOf('preset=LAST_YEAR'))).toEqual(['preset']);
    expect(Object.keys(await fieldsOf('from=2026-02-30&to=2026-03-01'))).toEqual(['from']);
    expect((await api.get('/api/reports?from=2024-11-01&to=2026-10-20')).status).toBe(200);
    expect((await client(app).get('/api/reports?preset=THIS_MONTH')).status).toBe(401);
  });

  it("never shows another user's data", async () => {
    const a = await newUser();
    await expense(a.api, '2026-10-05', 150_000, a.f.bank, a.f.cat.food);
    await a.api.put('/api/budgets/2026-10', { totalAmount: 500_000, lines: [] });
    const b = await registerUser(app);

    expect(await report(b.api, 'preset=THIS_MONTH')).toEqual({
      period: { preset: 'THIS_MONTH', from: '2026-10-01', to: TODAY, months: ['2026-10'] },
      totals: { income: 0, expense: 0, savings: 0, investment: 0, remaining: 0, savingsRate: null },
      expenseByCategory: [],
      incomeByCategory: [],
      accounts: [],
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
          closing: { totalMoney: 0, debts: 0, netWorth: 0, savingsBalance: 0 },
        },
      ],
      budget: { months: [{ month: '2026-10', budget: null, spent: 0 }], lines: [] },
    });
    const own = await report(a.api, 'preset=THIS_MONTH');
    expect(own.totals.expense).toBe(150_000);
    expect(own.budget.months).toEqual([{ month: '2026-10', budget: 500_000, spent: 150_000 }]);
  });
});

describe('GET /api/reports — one consistent snapshot (review focus 5)', () => {
  it('ignores a movement written between the first read and the rest of the report', async () => {
    const { api, userId, f } = await newUser();
    await expense(api, TODAY, 100_000, f.bank, f.cat.food);
    const auth: AuthContext = {
      userId,
      sessionId: 'report-test',
      timezone: 'America/Bogota',
      today: TODAY,
    };
    type TxOptions = { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number };
    const options: TxOptions[] = [];
    const settings: Array<{ iso: string; ro: string }> = [];
    const spy = {
      $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, opts: TxOptions) => {
        options.push(opts);
        return app.prisma.$transaction(async (tx) => {
          // Primera lectura: aquí REPEATABLE READ toma la foto de los datos.
          await tx.$queryRaw`SELECT 1`;
          // Otra conexión registra un gasto antes de que el reporte lea los movimientos.
          const concurrent = await expense(api, TODAY, 50_000, f.bank, f.cat.food);
          expect(concurrent.status).toBe(201);
          const result = await fn(tx);
          settings.push(
            ...(await tx.$queryRaw<Array<{ iso: string; ro: string }>>`
              SELECT current_setting('transaction_isolation') AS iso,
                     current_setting('transaction_read_only') AS ro`),
          );
          return result;
        }, opts);
      },
    } as unknown as PrismaClient;

    const r = await loadReport(spy, auth, { preset: 'THIS_MONTH' });
    // Review 3A M2: tiempo límite explícito de 30 s, no el de 10 s del cliente.
    expect(options).toEqual([{ isolationLevel: 'RepeatableRead', timeout: 30_000 }]);
    expect(settings).toEqual([{ iso: 'repeatable read', ro: 'on' }]);
    expect(r.totals.expense).toBe(100_000);
    expect(r.budget.months).toEqual([{ month: '2026-10', budget: null, spent: 100_000 }]);
    const bank = r.accounts.find((a) => a.account.id === f.bank)!;
    expect([bank.opening, bank.inflow, bank.outflow, bank.closing]).toEqual([
      2_000_000, 0, 100_000, 1_900_000,
    ]);

    // Fuera de esa transacción el gasto concurrente sí aparece.
    const fresh = await report(api, 'preset=THIS_MONTH');
    expect(fresh.totals.expense).toBe(150_000);
    expect(fresh.accounts.find((a) => a.account.id === f.bank)!.closing).toBe(1_850_000);
  });
});
