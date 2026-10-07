import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { balanceOf, cardOf, setupFinances } from './finance-fixtures';
import { createTestApp, registerUser } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

async function newUser() {
  const { api } = await registerUser(app);
  return { api, f: await setupFinances(api) };
}

type Cat = { id: string; systemKey: string | null };

describe('editing movements (addendum §4)', () => {
  it('switches an expense to a card purchase and back, recalculating everything', async () => {
    const { api, f } = await newUser();
    const { body } = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 300_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
      paymentMethod: 'DEBIT_CARD',
    });
    const id = body.transaction.id;

    const toCard = await api.put(`/api/transactions/${id}`, {
      type: 'CARD_PURCHASE',
      amount: 300_000,
      date: TODAY,
      creditCardId: f.card,
      categoryId: f.cat.food,
      installments: 3,
    });
    expect(toCard.status).toBe(200);
    expect(toCard.body.transaction).toMatchObject({
      type: 'CARD_PURCHASE',
      account: null,
      paymentMethod: null,
      installments: 3,
    });
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
    expect((await cardOf(api, f.card)).debt).toBe(300_000);

    const back = await api.put(`/api/transactions/${id}`, {
      type: 'EXPENSE',
      amount: 300_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    expect(back.body.transaction).toMatchObject({
      type: 'EXPENSE',
      creditCard: null,
      installments: null,
    });
    expect(await balanceOf(api, f.bank)).toBe(1_700_000);
    expect((await cardOf(api, f.card)).debt).toBe(0);
    expect((await api.get('/api/dashboard')).body.thisMonth.expense).toBe(300_000);
  });

  it('only links an obligation or marks recurring when registering', async () => {
    const { api, f } = await newUser();
    const { body } = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    const res = await api.put(`/api/transactions/${body.transaction.id}`, {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
      recurring: { frequency: 'MONTHLY' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LINK_ON_EDIT');
  });

  it('still answers ENTITY_DELETED when switching the type of a movement whose account is deleted', async () => {
    const { api, f } = await newUser();
    const { body } = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 100_000,
      date: TODAY,
      accountId: f.cash,
      categoryId: f.cat.food,
    });
    expect((await api.del('/api/accounts/' + f.cash)).status).toBe(200);
    const res = await api.put(`/api/transactions/${body.transaction.id}`, {
      type: 'CARD_PURCHASE',
      amount: 100_000,
      date: TODAY,
      creditCardId: f.card,
      categoryId: f.cat.food,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ENTITY_DELETED');
  });

  it('edits a loan disbursement (amount and account)', async () => {
    const { api, f } = await newUser();
    const d = await api.post(`/api/debts/${f.debt}/disbursements`, {
      accountId: f.bank,
      amount: 1_000_000,
      date: TODAY,
    });
    const res = await api.put(`/api/transactions/${d.body.transaction.id}`, {
      type: 'DEBT_DISBURSEMENT',
      amount: 1_500_000,
      date: TODAY,
      accountId: f.wallet,
      debtId: f.debt,
    });
    expect(res.status).toBe(200);
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
    expect(await balanceOf(api, f.wallet)).toBe(1_500_000);
    expect((await api.get(`/api/debts/${f.debt}`)).body.debt.balance).toBe(9_500_000);
  });
});

describe('balance adjustment (spec 8.13)', () => {
  it('records the difference as an editable and deletable system movement', async () => {
    const { api, f } = await newUser();
    const up = await api.post(`/api/accounts/${f.bank}/adjust`, { actualBalance: 2_150_000 });
    expect(up.status).toBe(201);
    expect(up.body.transaction).toMatchObject({
      type: 'INCOME',
      amount: 150_000,
      date: TODAY,
      description: 'Ajuste de saldo',
      category: { name: 'Ajuste de saldo' },
    });
    expect(up.body.account.balance).toBe(2_150_000);

    const down = await api.post(`/api/accounts/${f.bank}/adjust`, {
      actualBalance: 1_900_000,
      date: '2026-10-19',
    });
    expect(down.body.transaction).toMatchObject({
      type: 'EXPENSE',
      amount: 250_000,
      date: '2026-10-19',
    });

    const same = await api.post(`/api/accounts/${f.bank}/adjust`, { actualBalance: 1_900_000 });
    expect(same.status).toBe(400);
    expect(same.body.error.code).toBe('NO_CHANGE');

    const edit = await api.put(`/api/transactions/${down.body.transaction.id}`, {
      type: 'EXPENSE',
      amount: 200_000,
      date: '2026-10-19',
      accountId: f.bank,
      categoryId: down.body.transaction.category.id,
    });
    expect(edit.status).toBe(200);
    expect((await api.del(`/api/transactions/${up.body.transaction.id}`)).status).toBe(204);
    expect(await balanceOf(api, f.bank)).toBe(1_800_000);
  });

  it('brings back a deleted adjustment category', async () => {
    const { api, f } = await newUser();
    const cats = (await api.get('/api/categories')).body.items as Cat[];
    const incomeAdjustment = cats.find((c) => c.systemKey === 'ADJUSTMENT_INCOME')!;
    await api.del(`/api/categories/${incomeAdjustment.id}`);
    const res = await api.post(`/api/accounts/${f.bank}/adjust`, { actualBalance: 2_100_000 });
    expect(res.status).toBe(201);
    expect(res.body.transaction.category).toMatchObject({
      id: incomeAdjustment.id,
      isActive: true,
    });
  });

  it('a double submit records a single adjustment (review M3)', async () => {
    const { api, f } = await newUser();
    const results = await Promise.all([
      api.post(`/api/accounts/${f.bank}/adjust`, { actualBalance: 2_150_000 }),
      api.post(`/api/accounts/${f.bank}/adjust`, { actualBalance: 2_150_000 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(results.find((r) => r.status === 400)!.body.error.code).toBe('NO_CHANGE');
    expect(await balanceOf(api, f.bank)).toBe(2_150_000);
    const list = await api.get(`/api/transactions?accountId=${f.bank}`);
    expect(
      list.body.items.filter((t: { description: string }) => t.description === 'Ajuste de saldo'),
    ).toHaveLength(1);
  });
});
