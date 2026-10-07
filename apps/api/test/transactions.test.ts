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

describe('income and expense', () => {
  it('income adds to the account and expense subtracts', async () => {
    const { api, f } = await newUser();
    const income = await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 4_000_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.salary,
      payee: 'Empresa S.A.S.',
    });
    expect(income.status).toBe(201);
    expect(income.body.transaction).toMatchObject({
      type: 'INCOME',
      amount: 4_000_000,
      payee: 'Empresa S.A.S.',
      method: null,
    });
    expect(income.body.warnings).toEqual([]);

    const expense = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 25_000,
      date: TODAY,
      accountId: f.wallet,
      categoryId: f.cat.food,
      description: 'Almuerzo',
      tags: ['Trabajo'],
    });
    expect(expense.body.transaction).toMatchObject({ method: 'DIGITAL_WALLET', tags: ['trabajo'] });
    expect(expense.body.warnings).toEqual(['NEGATIVE_BALANCE']);
    expect(await balanceOf(api, f.bank)).toBe(6_000_000);
    expect(await balanceOf(api, f.wallet)).toBe(-25_000);
    expect((await api.get('/api/tags')).body.items).toMatchObject([
      { name: 'trabajo', usageCount: 1 },
    ]);
  });

  it('rejects a category of the wrong kind and archived accounts', async () => {
    const { api, f } = await newUser();
    const wrongKind = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    expect(wrongKind.status).toBe(400);
    expect(wrongKind.body.error.fields.categoryId).toBeTypeOf('string');

    await api.post('/api/transfers', {
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      toAccountId: f.wallet,
    });
    await api.post('/api/transfers', {
      amount: 1000,
      date: TODAY,
      accountId: f.wallet,
      toAccountId: f.bank,
    });
    await api.del(`/api/accounts/${f.wallet}`);
    const archived = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.wallet,
      categoryId: f.cat.food,
    });
    expect(archived.status).toBe(400);
    expect(archived.body.error.fields.accountId).toMatch(/eliminada/);
  });

  it('rejects future dates and warns about dates before the opening date', async () => {
    const { api, f } = await newUser();
    const future = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: '2026-10-21',
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    expect(future.status).toBe(400);
    expect(future.body.error.code).toBe('FUTURE_DATE');
    const old = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: '2026-10-01',
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    expect(old.status).toBe(201);
    expect(old.body.warnings).toContain('BEFORE_OPENING_DATE');
  });

  it('uses the Bogotá day for the future-date check (review focus #2)', async () => {
    // 2026-11-01 04:30 UTC = 2026-10-31 23:30 en Bogotá
    const { app: night } = await createTestApp({}, { now: () => new Date('2026-11-01T04:30:00Z') });
    const { api } = await registerUser(night);
    const f = await setupFinances(api);
    const ok = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: '2026-10-31',
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    expect(ok.status).toBe(201);
    const tomorrow = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: '2026-11-01',
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    expect(tomorrow.status).toBe(400);
    await night.close();
  });
});

describe('transfers', () => {
  it('moves money between own accounts without changing the total', async () => {
    const { api, f } = await newUser();
    const res = await api.post('/api/transfers', {
      amount: 200_000,
      date: TODAY,
      accountId: f.bank,
      toAccountId: f.wallet,
    });
    expect(res.status).toBe(201);
    expect(res.body.transaction.type).toBe('TRANSFER');
    expect(await balanceOf(api, f.bank)).toBe(1_800_000);
    expect(await balanceOf(api, f.wallet)).toBe(200_000);
    const total = (
      (await api.get('/api/accounts')).body.items as Array<{ balance: number }>
    ).reduce((s, a) => s + a.balance, 0);
    expect(total).toBe(2_100_000);
  });
});

describe('credit cards', () => {
  it('a purchase raises the card debt and leaves bank accounts untouched', async () => {
    const { api, f } = await newUser();
    const res = await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 300_000,
      date: TODAY,
      categoryId: f.cat.food,
      installments: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body.transaction).toMatchObject({
      type: 'CARD_PURCHASE',
      installments: 3,
      method: 'CREDIT_CARD',
    });
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
    expect(await cardOf(api, f.card)).toMatchObject({ debt: 300_000, available: 4_700_000 });
  });

  it('partial payments reduce debt and bank balance; overpaying is rejected', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 1_000_000,
      date: TODAY,
      categoryId: f.cat.food,
    });
    const partial = await api.post(`/api/credit-cards/${f.card}/payment`, {
      amount: 300_000,
      date: TODAY,
      accountId: f.bank,
    });
    expect(partial.status).toBe(201);
    expect(await balanceOf(api, f.bank)).toBe(1_700_000);
    expect(await cardOf(api, f.card)).toMatchObject({ debt: 700_000, available: 4_300_000 });

    const over = await api.post(`/api/credit-cards/${f.card}/payment`, {
      amount: 800_000,
      date: TODAY,
      accountId: f.bank,
    });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('PAYMENT_EXCEEDS_DEBT');
  });

  it('warns when a purchase goes over the credit limit', async () => {
    const { api, f } = await newUser();
    const res = await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 5_500_000,
      date: TODAY,
      categoryId: f.cat.food,
    });
    expect(res.status).toBe(201);
    expect(res.body.warnings).toContain('OVER_CREDIT_LIMIT');
  });

  it("answers 404 for another user's card in the path", async () => {
    const a = await newUser();
    const b = await newUser();
    const res = await b.api.post(`/api/credit-cards/${a.f.card}/purchase`, {
      amount: 1000,
      date: TODAY,
      categoryId: b.f.cat.food,
    });
    expect(res.status).toBe(404);
  });
});

describe('loans', () => {
  it('a payment splits principal (not an expense) and interest (expense child)', async () => {
    const { api, f } = await newUser();
    const res = await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 380_000,
      interest: 70_000,
      date: TODAY,
    });
    expect(res.status).toBe(201);
    expect(res.body.transaction).toMatchObject({
      type: 'DEBT_PAYMENT',
      amount: 380_000,
      interest: 70_000,
    });
    expect(await balanceOf(api, f.bank)).toBe(1_550_000);
    const debt = (await api.get(`/api/debts/${f.debt}`)).body.debt;
    expect(debt).toMatchObject({ balance: 7_620_000, installmentDue: 0 });

    const child = await app.prisma.transaction.findFirstOrThrow({
      where: { parentId: res.body.transaction.id },
    });
    expect(child).toMatchObject({ type: 'EXPENSE', categoryId: f.cat.interest });

    const delChild = await api.del(`/api/transactions/${child.id}`);
    expect(delChild.status).toBe(400);
    expect(delChild.body.error.code).toBe('EDIT_PARENT');

    expect((await api.del(`/api/transactions/${res.body.transaction.id}`)).status).toBe(204);
    expect(await app.prisma.transaction.count({ where: { id: child.id } })).toBe(0);
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
  });

  it('rejects paying more principal than the balance and records disbursements', async () => {
    const { api, f } = await newUser();
    const over = await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 9_000_000,
      date: TODAY,
    });
    expect(over.status).toBe(400);
    const disb = await api.post(`/api/debts/${f.debt}/disbursements`, {
      accountId: f.bank,
      amount: 1_000_000,
      date: TODAY,
    });
    expect(disb.status).toBe(201);
    expect(await balanceOf(api, f.bank)).toBe(3_000_000);
    expect((await api.get(`/api/debts/${f.debt}`)).body.debt.balance).toBe(9_000_000);
  });
});

describe('get and delete', () => {
  it('reads and deletes a movement, restoring balances', async () => {
    const { api, f } = await newUser();
    const { body } = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 50_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    const id = body.transaction.id;
    expect((await api.get(`/api/transactions/${id}`)).body.transaction.amount).toBe(50_000);
    expect((await api.del(`/api/transactions/${id}`)).status).toBe(204);
    expect((await api.get(`/api/transactions/${id}`)).status).toBe(404);
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
  });

  it('resets a linked scheduled item to PENDING when its movement is deleted', async () => {
    const { api, user } = await registerUser(app);
    const f = await setupFinances(api);
    const { body } = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 50_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    const item = await app.prisma.scheduledItem.create({
      data: {
        userId: user.id,
        kind: 'EXPENSE',
        name: 'Arriendo',
        amount: 50_000n,
        dueDate: new Date('2026-10-20T00:00:00.000Z'),
        categoryId: f.cat.food,
        accountId: f.bank,
        status: 'DONE',
        transactionId: body.transaction.id,
      },
    });
    expect((await api.del(`/api/transactions/${body.transaction.id}`)).status).toBe(204);
    const after = await app.prisma.scheduledItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(after).toMatchObject({ status: 'PENDING', transactionId: null });
  });
});
