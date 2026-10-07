import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DashboardDTO } from '@finanzas/shared';
import { balanceOf, setupFinances } from './finance-fixtures';
import { createTestApp, registerUser, type Client } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

async function newUser() {
  const { api, user } = await registerUser(app);
  return { api, userId: user.id, f: await setupFinances(api) };
}

const dashboard = async (api: Client) => (await api.get('/api/dashboard')).body as DashboardDTO;
const expenseCount = (userId: string) =>
  app.prisma.transaction.count({ where: { userId, type: 'EXPENSE' } });

describe('spec section 38 — financial correctness', () => {
  it('1. a transfer is not an expense and does not change the total', async () => {
    const { api, f } = await newUser();
    const before = await dashboard(api);
    await api.post('/api/transfers', {
      amount: 200_000,
      date: TODAY,
      accountId: f.bank,
      toAccountId: f.wallet,
    });
    const after = await dashboard(api);
    expect(after.thisMonth.expense).toBe(0);
    expect(after.thisMonth.income).toBe(0);
    expect(after.money.total).toBe(before.money.total);
  });

  it('2. a card purchase is an expense plus debt, and 3–4. paying it lowers debt and bank but adds no expense', async () => {
    const { api, f, userId } = await newUser();
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 300_000,
      date: TODAY,
      categoryId: f.cat.food,
    });
    let d = await dashboard(api);
    expect(d.thisMonth.expense).toBe(300_000);
    expect(d.debts.cards).toBe(300_000);
    expect(d.money.total).toBe(2_100_000);
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);

    await api.post(`/api/credit-cards/${f.card}/payment`, {
      amount: 300_000,
      date: TODAY,
      accountId: f.bank,
    });
    d = await dashboard(api);
    expect(await balanceOf(api, f.bank)).toBe(1_700_000);
    expect(d.debts.cards).toBe(0);
    expect(d.thisMonth.expense).toBe(300_000);
    // la compra es CARD_PURCHASE y el pago CARD_PAYMENT: ninguno es una fila EXPENSE
    expect(await expenseCount(userId)).toBe(0);
  });

  it('5. a transfer to a savings account is not an expense; it is savings', async () => {
    const { api, f } = await newUser();
    await api.post('/api/transfers', {
      amount: 500_000,
      date: TODAY,
      accountId: f.bank,
      toAccountId: f.savings,
    });
    const d = await dashboard(api);
    expect(d.thisMonth.expense).toBe(0);
    expect(d.thisMonth.savings).toBe(500_000);
    expect(d.money.total).toBe(2_100_000);
    expect(d.money.liquid).toBe(1_600_000);
    expect(d.money.savings).toBe(500_000);
  });

  it('6. the total money adds every account (spec section 10 example)', async () => {
    const { api } = await registerUser(app);
    for (const [name, type, initialBalance] of [
      ['Efectivo', 'CASH', 100_000],
      ['Bancolombia', 'BANK', 1_500_000],
      ['Nequi', 'DIGITAL_WALLET', 300_000],
      ['Nu', 'BANK', 600_000],
    ] as const) {
      await api.post('/api/accounts', { name, type, initialBalance });
    }
    const d = await dashboard(api);
    expect(d.money.total).toBe(2_500_000);
    expect(d.money.accounts.map((a) => a.balance)).toEqual([100_000, 1_500_000, 300_000, 600_000]);
  });

  it('7. credit cards never count as money and 8. debts are shown apart', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 800_000,
      date: TODAY,
      categoryId: f.cat.food,
    });
    const d = await dashboard(api);
    expect(d.money.total).toBe(2_100_000);
    expect(d.cards[0]!.available).toBe(4_200_000);
    expect(d.debts).toEqual({ cards: 800_000, loans: 8_000_000, total: 8_800_000 });
    expect(d.netWorth).toBe(2_100_000 - 8_800_000);
    const cardsLine = d.available.breakdown.find((b) => b.key === 'cards')!;
    expect(cardsLine.amount).toBe(-800_000);
  });

  it('the month balance matches the spec (4.000.000 − 2.100.000 − 800.000 = 1.100.000)', async () => {
    const { api, f } = await newUser();
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 4_000_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1_300_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 800_000,
      date: TODAY,
      categoryId: f.cat.fun,
    });
    await api.post('/api/transfers', {
      amount: 800_000,
      date: TODAY,
      accountId: f.bank,
      toAccountId: f.savings,
    });
    const d = await dashboard(api);
    expect(d.thisMonth).toMatchObject({
      income: 4_000_000,
      expense: 2_100_000,
      savings: 800_000,
      remaining: 1_100_000,
      savingsRate: 0.2,
    });
  });

  it('a loan disbursement is debt, not income; principal payments are not expenses', async () => {
    const { api, f, userId } = await newUser();
    await api.post(`/api/debts/${f.debt}/disbursements`, {
      accountId: f.bank,
      amount: 1_000_000,
      date: TODAY,
    });
    await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 380_000,
      interest: 70_000,
      date: TODAY,
    });
    const d = await dashboard(api);
    expect(d.thisMonth.income).toBe(0);
    expect(d.thisMonth.expense).toBe(70_000);
    expect(d.debts.loans).toBe(8_620_000);
    // solo el hijo de intereses es una fila EXPENSE; el capital no lo es
    expect(await expenseCount(userId)).toBe(1);
  });

  it('the estimated available money subtracts committed card debt, loan installment and the savings reserve', async () => {
    const { api, f } = await newUser();
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 1_000_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 120_000,
      date: TODAY,
      categoryId: f.cat.food,
      installments: 12,
    });
    const d = await dashboard(api);
    // líquido: 3.000.000 + 100.000 (efectivo) = 3.100.000; tarjeta comprometida: 1 cuota de 10.000;
    // préstamo: 0 (se registró el 20, después del día de pago 5); reserva: 20 % + 10 % de 1.000.000 = 300.000
    expect(d.available.breakdown.map((b) => [b.key, b.amount])).toEqual([
      ['liquid', 3_100_000],
      ['obligations', 0],
      ['cards', -10_000],
      ['loans', 0],
      ['reserve', -300_000],
    ]);
    expect(d.available.total).toBe(2_790_000);
  });

  it('a card credit balance counts as zero debt and net worth stays consistent', async () => {
    const { api, f } = await newUser();
    const purchase = await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 300_000,
      date: TODAY,
      categoryId: f.cat.food,
    });
    await api.post(`/api/credit-cards/${f.card}/payment`, {
      amount: 300_000,
      date: TODAY,
      accountId: f.bank,
    });
    const txId = purchase.body.transaction.id;
    expect((await api.del(`/api/transactions/${txId}`)).status).toBe(204);
    const d = await dashboard(api);
    expect(d.debts.cards).toBe(0);
    expect(d.netWorth).toBe(d.money.total - d.debts.total);
  });
});
