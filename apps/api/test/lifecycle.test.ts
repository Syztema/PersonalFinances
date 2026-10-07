import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { toDbDate } from '../src/lib/db';
import { setupFinances } from './finance-fixtures';
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

const expense = (api: Client, accountId: string, categoryId: string, amount: number) =>
  api.post('/api/transactions', { type: 'EXPENSE', amount, date: TODAY, accountId, categoryId });

type Cat = { id: string; isActive: boolean; systemKey: string | null };

describe('delete and restore keep the history (addendum §3)', () => {
  it('deletes an unused account for good', async () => {
    const { api, f } = await newUser();
    const res = await api.del(`/api/accounts/${f.wallet}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 'hard' });
    expect((await api.get(`/api/accounts/${f.wallet}`)).status).toBe(404);
  });

  it('requires a zero balance and says how much is left', async () => {
    const { api, f } = await newUser();
    const res = await api.del(`/api/accounts/${f.bank}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_HAS_BALANCE');
    expect(res.body.error.message).toContain('$2.000.000');
  });

  it('freezes the money of movements that belong to a deleted account (review focus #3)', async () => {
    const { api, f } = await newUser();
    const tx = (await expense(api, f.cash, f.cat.food, 100_000)).body.transaction.id as string;
    const del = await api.del(`/api/accounts/${f.cash}`);
    expect(del.body).toEqual({ deleted: 'soft' });
    expect((await api.get(`/api/accounts/${f.cash}`)).body.account).toMatchObject({
      isActive: false,
      balance: 0,
    });

    const history = await api.get(`/api/transactions?accountId=${f.cash}`);
    expect(history.body.items[0].account).toMatchObject({ id: f.cash, isActive: false });

    const again = await expense(api, f.cash, f.cat.food, 1000);
    expect(again.status).toBe(400);
    expect(again.body.error.fields.accountId).toMatch(/eliminada/);

    const body = {
      type: 'EXPENSE',
      amount: 100_000,
      date: TODAY,
      accountId: f.cash,
      categoryId: f.cat.food,
    };
    expect(
      (await api.put(`/api/transactions/${tx}`, { ...body, description: 'Mercado' })).status,
    ).toBe(200);
    const changed = await api.put(`/api/transactions/${tx}`, { ...body, amount: 90_000 });
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe('ENTITY_DELETED');
    expect((await api.put(`/api/transactions/${tx}`, { ...body, date: '2026-10-19' })).status).toBe(
      409,
    );
    expect((await api.del(`/api/transactions/${tx}`)).status).toBe(409);
    expect((await api.get(`/api/accounts/${f.cash}`)).body.account.balance).toBe(0);
    expect((await api.put(`/api/accounts/${f.cash}`, { name: 'Caja' })).status).toBe(409);

    const restored = await api.post(`/api/accounts/${f.cash}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.account.isActive).toBe(true);
    expect((await api.put(`/api/transactions/${tx}`, { ...body, amount: 90_000 })).status).toBe(
      200,
    );
  });

  it('keeps the name of a deleted account and points to Eliminados', async () => {
    const { api, f } = await newUser();
    await expense(api, f.cash, f.cat.food, 100_000);
    await api.del(`/api/accounts/${f.cash}`);
    const dup = await api.post('/api/accounts', { name: 'Efectivo', type: 'CASH' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toContain('Restáurala desde Eliminados');
  });

  it('pauses the rules that use a deleted account and removes their pending occurrences', async () => {
    const { api, userId, f } = await newUser();
    await expense(api, f.cash, f.cat.food, 100_000);
    const rule = await app.prisma.recurringRule.create({
      data: {
        userId,
        name: 'Almuerzo',
        kind: 'EXPENSE',
        amount: 20_000n,
        categoryId: f.cat.food,
        accountId: f.cash,
        frequency: 'WEEKLY',
        startDate: toDbDate('2026-10-06'),
        activeFrom: toDbDate('2026-10-06'),
      },
    });
    const item = (date: string, status: 'PENDING' | 'SKIPPED') =>
      app.prisma.scheduledItem.create({
        data: {
          userId,
          recurringRuleId: rule.id,
          kind: 'EXPENSE',
          name: 'Almuerzo',
          amount: 20_000n,
          categoryId: f.cat.food,
          accountId: f.cash,
          ruleDate: toDbDate(date),
          dueDate: toDbDate(date),
          status,
        },
      });
    await item('2026-10-13', 'SKIPPED');
    await item('2026-10-27', 'PENDING');
    await app.prisma.scheduledItem.create({
      data: {
        userId,
        kind: 'EXPENSE',
        name: 'SOAT',
        amount: 500_000n,
        categoryId: f.cat.food,
        accountId: f.cash,
        dueDate: toDbDate('2026-11-01'),
      },
    });

    await api.del(`/api/accounts/${f.cash}`);
    expect(
      (await app.prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } })).isActive,
    ).toBe(false);
    const left = await app.prisma.scheduledItem.findMany({ where: { userId } });
    expect(left.map((i) => i.status)).toEqual(['SKIPPED']);
  });

  it('cards need zero debt; with purchases they are soft-deleted and can be restored', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 100_000,
      date: TODAY,
      categoryId: f.cat.food,
    });
    const blocked = await api.del(`/api/credit-cards/${f.card}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CARD_HAS_DEBT');
    await api.post(`/api/credit-cards/${f.card}/payment`, {
      amount: 100_000,
      date: TODAY,
      accountId: f.bank,
    });
    expect((await api.del(`/api/credit-cards/${f.card}`)).body).toEqual({ deleted: 'soft' });
    const purchase = await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 1000,
      date: TODAY,
      categoryId: f.cat.food,
    });
    expect(purchase.status).toBe(400);
    const restored = await api.post(`/api/credit-cards/${f.card}/restore`);
    expect(restored.body.card).toMatchObject({ isActive: true, debt: 0 });
  });

  it('loans need a zero balance; an unused loan is deleted for good', async () => {
    const { api, f } = await newUser();
    const blocked = await api.del(`/api/debts/${f.debt}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('DEBT_HAS_BALANCE');
    expect(blocked.body.error.message).toContain('$8.000.000');
    await api.put(`/api/debts/${f.debt}`, { initialBalance: 0 });
    expect((await api.del(`/api/debts/${f.debt}`)).body).toEqual({ deleted: 'hard' });
  });

  it('a parent category takes its subcategories with it and brings them back', async () => {
    const { api, f } = await newUser();
    const child = (
      await api.post('/api/categories', {
        name: 'Domicilios',
        kind: 'EXPENSE',
        parentId: f.cat.food,
      })
    ).body.category.id as string;
    await expense(api, f.bank, child, 30_000);
    expect((await api.del(`/api/categories/${f.cat.food}`)).body).toEqual({ deleted: 'soft' });
    const cats = (await api.get('/api/categories')).body.items as Cat[];
    expect(cats.find((c) => c.id === child)?.isActive).toBe(false);
    expect((await expense(api, f.bank, child, 1000)).status).toBe(400);

    const early = await api.post(`/api/categories/${child}/restore`);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('PARENT_DELETED');
    await api.post(`/api/categories/${f.cat.food}/restore`);
    const after = (await api.get('/api/categories')).body.items as Cat[];
    expect(after.find((c) => c.id === child)?.isActive).toBe(true);
  });

  it('drops budget lines of a deleted category from this month on, never from the past', async () => {
    const { api, userId, f } = await newUser();
    const budget = async (month: string) => {
      const b = await app.prisma.budget.create({ data: { userId, month: toDbDate(month) } });
      await app.prisma.budgetCategory.create({
        data: { userId, budgetId: b.id, categoryId: f.cat.fun, amount: 200_000n },
      });
    };
    await budget('2026-09-01');
    await budget('2026-10-01');
    expect((await api.del(`/api/categories/${f.cat.fun}`)).body).toEqual({ deleted: 'soft' });
    const lines = await app.prisma.budgetCategory.findMany({
      where: { userId },
      include: { budget: true },
    });
    expect(lines.map((l) => l.budget.month.toISOString().slice(0, 7))).toEqual(['2026-09']);
  });

  it('system categories are editable and deletable, and come back when the app needs them', async () => {
    const { api, f } = await newUser();
    const cats = (await api.get('/api/categories')).body.items as Cat[];
    const adjustment = cats.find((c) => c.systemKey === 'ADJUSTMENT_EXPENSE')!;
    expect(
      (await api.put(`/api/categories/${adjustment.id}`, { name: 'Correcciones' })).status,
    ).toBe(200);
    expect(
      (await api.put(`/api/categories/${f.cat.interest}`, { parentId: f.cat.food })).status,
    ).toBe(400);

    expect((await api.del(`/api/categories/${f.cat.interest}`)).body).toEqual({ deleted: 'soft' });
    const pay = await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 100_000,
      interest: 20_000,
      date: TODAY,
    });
    expect(pay.status).toBe(201);
    const after = (await api.get('/api/categories')).body.items as Cat[];
    expect(after.find((c) => c.id === f.cat.interest)?.isActive).toBe(true);
  });

  it('never hard-deletes a parent whose subcategory is a system category', async () => {
    const { api, f } = await newUser();
    const parent = (await api.post('/api/categories', { name: 'Financiero', kind: 'EXPENSE' })).body
      .category.id as string;
    await app.prisma.category.update({ where: { id: f.cat.interest }, data: { parentId: parent } });
    expect((await api.del(`/api/categories/${parent}`)).body).toEqual({ deleted: 'soft' });
    const pay = await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 100_000,
      interest: 20_000,
      date: TODAY,
    });
    expect(pay.status).toBe(201);
  });

  it('points to Eliminados when a subcategory name belongs to a deleted sibling', async () => {
    const { api, f } = await newUser();
    const sub = (
      await api.post('/api/categories', {
        name: 'Domicilios',
        kind: 'EXPENSE',
        parentId: f.cat.food,
      })
    ).body.category.id as string;
    await expense(api, f.bank, sub, 1000);
    await api.del(`/api/categories/${sub}`);
    const dup = await api.post('/api/categories', {
      name: 'Domicilios',
      kind: 'EXPENSE',
      parentId: f.cat.food,
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toContain('Restáurala desde Eliminados');
    const other = (
      await api.post('/api/categories', { name: 'Otro', kind: 'EXPENSE', parentId: f.cat.food })
    ).body.category.id as string;
    const renamed = await api.put(`/api/categories/${other}`, { name: 'Domicilios' });
    expect(renamed.status).toBe(409);
    expect(renamed.body.error.message).toContain('Restáurala desde Eliminados');
  });
});
