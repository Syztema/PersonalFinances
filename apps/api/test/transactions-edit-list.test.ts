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

describe('update', () => {
  it('edits amount, account and tags and recalculates balances', async () => {
    const { api, f } = await newUser();
    const { body } = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 50_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
      tags: ['a'],
    });
    const id = body.transaction.id;
    const res = await api.put(`/api/transactions/${id}`, {
      type: 'EXPENSE',
      amount: 80_000,
      date: '2026-10-19',
      accountId: f.cash,
      categoryId: f.cat.fun,
      tags: ['b', 'c'],
    });
    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({
      amount: 80_000,
      date: '2026-10-19',
      tags: ['b', 'c'],
    });
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
    expect(await balanceOf(api, f.cash)).toBe(20_000);
  });

  it('never changes the type of a movement', async () => {
    const { api, f } = await newUser();
    const { body } = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    const res = await api.put(`/api/transactions/${body.transaction.id}`, {
      type: 'INCOME',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TYPE_CHANGE_NOT_ALLOWED');
  });

  it('a card payment can be edited up to the debt excluding itself', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 500_000,
      date: TODAY,
      categoryId: f.cat.food,
    });
    const pay = await api.post(`/api/credit-cards/${f.card}/payment`, {
      amount: 200_000,
      date: TODAY,
      accountId: f.bank,
    });
    const id = pay.body.transaction.id;
    const ok = await api.put(`/api/transactions/${id}`, {
      type: 'CARD_PAYMENT',
      amount: 500_000,
      date: TODAY,
      accountId: f.bank,
      creditCardId: f.card,
    });
    expect(ok.status).toBe(200);
    const over = await api.put(`/api/transactions/${id}`, {
      type: 'CARD_PAYMENT',
      amount: 500_001,
      date: TODAY,
      accountId: f.bank,
      creditCardId: f.card,
    });
    expect(over.status).toBe(400);
  });

  it('editing a paid purchase can leave a credit balance but never a negative payment due (review focus #4)', async () => {
    const { api, f } = await newUser();
    const purchase = await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 300_000,
      date: '2026-10-10',
      categoryId: f.cat.food,
    });
    await api.post(`/api/credit-cards/${f.card}/payment`, {
      amount: 300_000,
      date: TODAY,
      accountId: f.bank,
    });
    await api.put(`/api/transactions/${purchase.body.transaction.id}`, {
      type: 'CARD_PURCHASE',
      amount: 100_000,
      date: '2026-10-10',
      creditCardId: f.card,
      categoryId: f.cat.food,
      installments: 1,
    });
    const card = await cardOf(api, f.card);
    expect(card.debt).toBe(-200_000);
    expect(card.amountDue).toBe(0);
  });

  it('keeps an archived account when it is unchanged but rejects switching to one (review focus #5)', async () => {
    const { api, f } = await newUser();
    const old = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 100_000,
      date: TODAY,
      accountId: f.cash,
      categoryId: f.cat.food,
    });
    await api.del(`/api/accounts/${f.cash}`);
    const sameAccount = await api.put(`/api/transactions/${old.body.transaction.id}`, {
      type: 'EXPENSE',
      amount: 100_000,
      date: TODAY,
      accountId: f.cash,
      categoryId: f.cat.food,
      description: 'Mercado',
    });
    expect(sameAccount.status).toBe(200);

    const other = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    const switched = await api.put(`/api/transactions/${other.body.transaction.id}`, {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.cash,
      categoryId: f.cat.food,
    });
    expect(switched.status).toBe(400);
  });

  it('updates the interest child of a loan payment and blocks editing the child directly', async () => {
    const { api, f } = await newUser();
    const pay = await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 380_000,
      interest: 70_000,
      date: TODAY,
    });
    const id = pay.body.transaction.id;
    const res = await api.put(`/api/transactions/${id}`, {
      type: 'DEBT_PAYMENT',
      amount: 400_000,
      interest: 50_000,
      date: TODAY,
      accountId: f.bank,
      debtId: f.debt,
    });
    expect(res.body.transaction).toMatchObject({ amount: 400_000, interest: 50_000 });
    expect(await balanceOf(api, f.bank)).toBe(1_550_000);

    const child = await app.prisma.transaction.findFirstOrThrow({ where: { parentId: id } });
    const direct = await api.put(`/api/transactions/${child.id}`, {
      type: 'EXPENSE',
      amount: 1,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    expect(direct.status).toBe(400);

    await api.put(`/api/transactions/${id}`, {
      type: 'DEBT_PAYMENT',
      amount: 400_000,
      interest: 0,
      date: TODAY,
      accountId: f.bank,
      debtId: f.debt,
    });
    expect(await app.prisma.transaction.count({ where: { parentId: id } })).toBe(0);
  });
});

describe('list', () => {
  async function seeded() {
    const ctx = await newUser();
    const { api, f } = ctx;
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 4_000_000,
      date: '2026-10-05',
      accountId: f.bank,
      categoryId: f.cat.salary,
      description: 'Salario',
    });
    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 25_000,
      date: '2026-10-06',
      accountId: f.wallet,
      categoryId: f.cat.food,
      description: 'Almuerzo',
      tags: ['trabajo'],
    });
    await api.post('/api/transfers', {
      amount: 200_000,
      date: '2026-10-04',
      accountId: f.bank,
      toAccountId: f.wallet,
    });
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 150_000,
      date: '2026-10-03',
      categoryId: f.cat.fun,
      description: 'Amazon',
    });
    await api.post(`/api/credit-cards/${f.card}/payment`, {
      amount: 100_000,
      date: '2026-10-07',
      accountId: f.bank,
    });
    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 60_000,
      date: '2026-10-06',
      accountId: f.cash,
      categoryId: f.cat.food,
      description: 'Mercado',
      paymentMethod: 'DEBIT_CARD',
    });
    return ctx;
  }

  it('orders by date (newest first) and paginates with a cursor', async () => {
    const { api } = await seeded();
    const first = await api.get('/api/transactions?limit=4');
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(4);
    expect(first.body.items[0].date).toBe('2026-10-07');
    expect(first.body.nextCursor).toBeTypeOf('string');
    const second = await api.get(`/api/transactions?limit=4&cursor=${first.body.nextCursor}`);
    expect(second.body.items).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();
    const ids = [...first.body.items, ...second.body.items].map((t: { id: string }) => t.id);
    expect(new Set(ids).size).toBe(6);
    expect((await api.get('/api/transactions?cursor=basura')).status).toBe(400);
  });

  it('filters by type, account (both sides), card, category, tag, amount, text, dates and method', async () => {
    const { api, f } = await seeded();
    const count = async (qs: string) =>
      (await api.get(`/api/transactions?${qs}`)).body.items.length;
    expect(await count('type=EXPENSE,CARD_PURCHASE')).toBe(3);
    expect(await count(`accountId=${f.wallet}`)).toBe(2);
    expect(await count(`creditCardId=${f.card}`)).toBe(2);
    expect(await count(`categoryId=${f.cat.food}`)).toBe(2);
    expect(await count('tag=trabajo')).toBe(1);
    expect(await count('minAmount=100000&maxAmount=200000')).toBe(3);
    expect(await count('q=almu')).toBe(1);
    expect(await count('from=2026-10-05&to=2026-10-06')).toBe(3);
    expect(await count('method=CREDIT_CARD')).toBe(1);
    expect(await count('method=DIGITAL_WALLET')).toBe(1);
    expect(await count('method=DEBIT_CARD')).toBe(1);
  });

  it('includes subcategories when filtering by a parent category', async () => {
    const { api, f } = await newUser();
    const child = (
      await api.post('/api/categories', {
        name: 'Restaurantes',
        kind: 'EXPENSE',
        parentId: f.cat.food,
      })
    ).body.category.id;
    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: child,
    });
    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 2000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    expect((await api.get(`/api/transactions?categoryId=${f.cat.food}`)).body.items).toHaveLength(
      2,
    );
  });

  it('rejects a date range whose end is before its start', async () => {
    const { api } = await newUser();
    const res = await api.get('/api/transactions?from=2026-10-20&to=2026-10-01');
    expect(res.status).toBe(400);
    expect(res.body.error.fields.to).toBeTypeOf('string');
  });
});
