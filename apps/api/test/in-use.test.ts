import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { balanceOf, setupFinances } from './finance-fixtures';
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

describe('in-use guards', () => {
  it('an account with money cannot be deleted', async () => {
    const { api, f } = await newUser();
    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    const res = await api.del(`/api/accounts/${f.bank}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_HAS_BALANCE');
  });

  it('a category used by a movement is deleted logically and stays in the history', async () => {
    const { api, f } = await newUser();
    const tx = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.fun,
    });
    const res = await api.del(`/api/categories/${f.cat.fun}`);
    expect(res.body).toEqual({ deleted: 'soft' });
    const read = await api.get(`/api/transactions/${tx.body.transaction.id}`);
    expect(read.body.transaction.category).toMatchObject({ id: f.cat.fun, isActive: false });
  });

  it('protects credit cards with debt', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 100_000,
      date: TODAY,
      categoryId: f.cat.food,
    });
    const del = await api.del(`/api/credit-cards/${f.card}`);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('CARD_HAS_DEBT');
  });

  it('protects loans with balance', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 100_000,
      date: TODAY,
    });
    const del = await api.del(`/api/debts/${f.debt}`);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('DEBT_HAS_BALANCE');
  });

  it('account balance = initial + income - expense - out + in', async () => {
    const { api, f } = await newUser();
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 500_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 120_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    await api.post('/api/transfers', {
      amount: 300_000,
      date: TODAY,
      accountId: f.bank,
      toAccountId: f.wallet,
    });
    await api.post('/api/transfers', {
      amount: 50_000,
      date: TODAY,
      accountId: f.wallet,
      toAccountId: f.bank,
    });
    expect(await balanceOf(api, f.bank)).toBe(2_000_000 + 500_000 - 120_000 - 300_000 + 50_000);
    expect(await balanceOf(api, f.wallet)).toBe(250_000);
  });
});
