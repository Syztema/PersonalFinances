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
  const f = await setupFinances(api);
  const goal = (
    await api.post('/api/goals', {
      name: 'Comprar computador',
      targetAmount: 5_000_000,
      targetDate: '2027-06-30',
      accountId: f.savings,
      initialAmount: 1_000_000,
    })
  ).body.goal;
  return { api, f, goal };
}

describe('goals (spec 8.10)', () => {
  it('lives in a savings or investment account', async () => {
    const { api, f, goal } = await newUser();
    expect(goal).toMatchObject({
      progress: 1_000_000,
      pct: 0.2,
      status: 'ACTIVE',
      account: { id: f.savings },
    });
    const bad = await api.post('/api/goals', {
      name: 'Viaje',
      targetAmount: 1000,
      accountId: f.bank,
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.accountId).toBeTypeOf('string');
  });

  it('contributions and withdrawals are transfers, never expenses', async () => {
    const { api, f, goal } = await newUser();
    const add = await api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.bank,
      amount: 500_000,
      date: TODAY,
    });
    expect(add.status).toBe(201);
    expect(add.body.transaction).toMatchObject({
      type: 'TRANSFER',
      goalId: goal.id,
      description: 'Abono a Comprar computador',
    });
    const out = await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 100_000,
      date: TODAY,
    });
    expect(out.body.goal).toMatchObject({
      contributed: 500_000,
      withdrawn: 100_000,
      progress: 1_400_000,
      remaining: 3_600_000,
      monthlyNeeded: 450_000,
    });
    const d = (await api.get('/api/dashboard')).body;
    expect(d.thisMonth).toMatchObject({ expense: 0, income: 0, savings: 400_000 });
    expect(await balanceOf(api, f.bank)).toBe(1_600_000);
    const same = await api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.savings,
      amount: 1000,
      date: TODAY,
    });
    expect(same.status).toBe(400);
  });

  it('completes and reopens, but never archives', async () => {
    const { api, goal } = await newUser();
    expect((await api.put(`/api/goals/${goal.id}`, { status: 'COMPLETED' })).body.goal.status).toBe(
      'COMPLETED',
    );
    expect((await api.put(`/api/goals/${goal.id}`, { status: 'ACTIVE' })).body.goal.status).toBe(
      'ACTIVE',
    );
    expect((await api.put(`/api/goals/${goal.id}`, { status: 'ARCHIVED' })).status).toBe(400);
  });

  it('moves to another account only without movements (decision 5)', async () => {
    const { api, f, goal } = await newUser();
    const other = (await api.post('/api/accounts', { name: 'CDT', type: 'INVESTMENT' })).body
      .account.id;
    expect(
      (await api.put(`/api/goals/${goal.id}`, { accountId: other })).body.goal.account.id,
    ).toBe(other);
    await api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.bank,
      amount: 1000,
      date: TODAY,
    });
    const moved = await api.put(`/api/goals/${goal.id}`, { accountId: f.savings });
    expect(moved.status).toBe(409);
    expect(moved.body.error.code).toBe('GOAL_HAS_MOVEMENTS');
  });

  it('deleting a goal keeps its transfers as normal transfers; its account cannot be deleted before', async () => {
    const { api, f, goal } = await newUser();
    const add = await api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.bank,
      amount: 200_000,
      date: TODAY,
    });
    await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 200_000,
      date: TODAY,
    });
    const blocked = await api.del(`/api/accounts/${f.savings}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ACCOUNT_HAS_GOALS');

    expect((await api.del(`/api/goals/${goal.id}`)).status).toBe(204);
    const tx = (await api.get(`/api/transactions/${add.body.transaction.id}`)).body.transaction;
    expect(tx).toMatchObject({ type: 'TRANSFER', goalId: null });
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
    expect((await api.get('/api/goals')).body.items).toEqual([]);
  });
});

describe('goals fix round 1', () => {
  it('caps withdrawals to what the goal holds', async () => {
    const { api, f, goal } = await newUser();
    const over = await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 1_000_001,
      date: TODAY,
    });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('WITHDRAWAL_EXCEEDS_GOAL');
    expect(over.body.error.fields.amount).toBeTypeOf('string');
    const exact = await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 1_000_000,
      date: TODAY,
    });
    expect(exact.status).toBe(201);
    expect(exact.body.goal.progress).toBe(0);
  });

  it('isolates goals between users', async () => {
    const a = await newUser();
    const b = await newUser();
    const id = a.goal.id;
    expect((await b.api.get(`/api/goals/${id}`)).status).toBe(404);
    expect((await b.api.put(`/api/goals/${id}`, { name: 'x' })).status).toBe(404);
    expect((await b.api.del(`/api/goals/${id}`)).status).toBe(404);
    const c = { fromAccountId: b.f.bank, amount: 1000, date: TODAY };
    expect((await b.api.post(`/api/goals/${id}/contributions`, c)).status).toBe(404);
    const w = { toAccountId: b.f.bank, amount: 1000, date: TODAY };
    expect((await b.api.post(`/api/goals/${id}/withdrawals`, w)).status).toBe(404);
    expect((await a.api.get(`/api/goals/${id}`)).status).toBe(200);
  });

  it("rejects another user's accounts", async () => {
    const a = await newUser();
    const b = await newUser();
    const created = await a.api.post('/api/goals', {
      name: 'X',
      targetAmount: 1000,
      accountId: b.f.savings,
    });
    expect(created.status).toBe(400);
    expect(created.body.error.code).toBe('INVALID_REFERENCE');
    const add = await a.api.post(`/api/goals/${a.goal.id}/contributions`, {
      fromAccountId: b.f.bank,
      amount: 1000,
      date: TODAY,
    });
    expect(add.status).toBe(400);
    expect(add.body.error.code).toBe('INVALID_REFERENCE');
    const out = await a.api.post(`/api/goals/${a.goal.id}/withdrawals`, {
      toAccountId: b.f.bank,
      amount: 1000,
      date: TODAY,
    });
    expect(out.status).toBe(400);
    expect(out.body.error.code).toBe('INVALID_REFERENCE');
  });

  it('rejects non-savings and inactive accounts on update', async () => {
    const { api, f, goal } = await newUser();
    const bank = await api.put(`/api/goals/${goal.id}`, { accountId: f.bank });
    expect(bank.status).toBe(400);
    expect(bank.body.error.code).toBe('INVALID_REFERENCE');
    const old = (await api.post('/api/accounts', { name: 'Viejo', type: 'SAVINGS' })).body.account
      .id;
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 1000,
      date: TODAY,
      accountId: old,
      categoryId: f.cat.salary,
    });
    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: old,
      categoryId: f.cat.food,
    });
    expect((await api.del(`/api/accounts/${old}`)).body.deleted).toBe('soft');
    expect((await api.put(`/api/goals/${goal.id}`, { accountId: old })).status).toBe(400);
  });

  it('GOAL_HAS_MOVEMENTS also triggers after a withdrawal', async () => {
    const { api, f, goal } = await newUser();
    const other = (await api.post('/api/accounts', { name: 'CDT', type: 'INVESTMENT' })).body
      .account.id;
    await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 1000,
      date: TODAY,
    });
    const moved = await api.put(`/api/goals/${goal.id}`, { accountId: other });
    expect(moved.status).toBe(409);
    expect(moved.body.error.code).toBe('GOAL_HAS_MOVEMENTS');
  });
});
