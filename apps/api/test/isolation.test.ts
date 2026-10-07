import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { setupFinances } from './finance-fixtures';
import { createTestApp, registerUser } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

describe("spec section 38.9 — a user can never reach another user's data", () => {
  it('blocks reads, writes, references and listings across users', async () => {
    const a = await registerUser(app);
    const fa = await setupFinances(a.api);
    const tx = (
      await a.api.post('/api/transactions', {
        type: 'EXPENSE',
        amount: 50_000,
        date: TODAY,
        accountId: fa.bank,
        categoryId: fa.cat.food,
        tags: ['privado'],
      })
    ).body.transaction.id as string;
    const tagId = (await a.api.get('/api/tags')).body.items[0].id as string;

    const b = await registerUser(app);
    const fb = await setupFinances(b.api);

    // Lectura, edición y borrado directos → 404
    for (const url of [
      `/api/accounts/${fa.bank}`,
      `/api/credit-cards/${fa.card}`,
      `/api/credit-cards/${fa.card}/statement`,
      `/api/debts/${fa.debt}`,
      `/api/transactions/${tx}`,
    ]) {
      expect((await b.api.get(url)).status, url).toBe(404);
    }
    expect((await b.api.put(`/api/accounts/${fa.bank}`, { name: 'Hack' })).status).toBe(404);
    expect((await b.api.put(`/api/credit-cards/${fa.card}`, { name: 'Hack' })).status).toBe(404);
    expect((await b.api.put(`/api/debts/${fa.debt}`, { name: 'Hack' })).status).toBe(404);
    expect((await b.api.put(`/api/categories/${fa.cat.food}`, { name: 'Hack' })).status).toBe(404);
    expect(
      (
        await b.api.put(`/api/transactions/${tx}`, {
          type: 'EXPENSE',
          amount: 1,
          date: TODAY,
          accountId: fb.bank,
          categoryId: fb.cat.food,
        })
      ).status,
    ).toBe(404);
    for (const url of [
      `/api/accounts/${fa.bank}`,
      `/api/credit-cards/${fa.card}`,
      `/api/debts/${fa.debt}`,
      `/api/transactions/${tx}`,
      `/api/categories/${fa.cat.food}`,
      `/api/tags/${tagId}`,
    ]) {
      expect((await b.api.del(url)).status, url).toBe(404);
    }

    // Referencias ajenas en el cuerpo → 400; en la ruta → 404
    const withAccount = await b.api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: fa.bank,
      categoryId: fb.cat.food,
    });
    expect(withAccount.status).toBe(400);
    expect(withAccount.body.error.code).toBe('INVALID_REFERENCE');
    const withCategory = await b.api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: fb.bank,
      categoryId: fa.cat.food,
    });
    expect(withCategory.status).toBe(400);
    expect(withCategory.body.error.code).toBe('INVALID_REFERENCE');
    const withToAccount = await b.api.post('/api/transfers', {
      amount: 1000,
      date: TODAY,
      accountId: fb.bank,
      toAccountId: fa.bank,
    });
    expect(withToAccount.status).toBe(400);
    expect(withToAccount.body.error.code).toBe('INVALID_REFERENCE');
    expect(
      (
        await b.api.post('/api/transactions', {
          type: 'CARD_PAYMENT',
          amount: 1000,
          date: TODAY,
          accountId: fb.bank,
          creditCardId: fa.card,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await b.api.post(`/api/credit-cards/${fa.card}/payment`, {
          amount: 1000,
          date: TODAY,
          accountId: fb.bank,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await b.api.post(`/api/debts/${fa.debt}/payments`, {
          accountId: fb.bank,
          principal: 1000,
          date: TODAY,
        })
      ).status,
    ).toBe(404);

    // Listados y filtros nunca incluyen datos de A
    const idsOf = async (url: string) =>
      ((await b.api.get(url)).body.items as Array<{ id: string }>).map((i) => i.id);
    expect(await idsOf('/api/accounts')).not.toContain(fa.bank);
    expect(await idsOf('/api/credit-cards')).not.toContain(fa.card);
    expect(await idsOf('/api/debts')).not.toContain(fa.debt);
    expect(await idsOf('/api/categories')).not.toContain(fa.cat.food);
    expect(await idsOf('/api/tags')).not.toContain(tagId);
    expect(await idsOf('/api/transactions')).not.toContain(tx);
    expect(await idsOf(`/api/transactions?accountId=${fa.bank}`)).toEqual([]);

    // El dashboard de B solo tiene lo suyo
    const d = (await b.api.get('/api/dashboard')).body;
    expect(d.money.total).toBe(2_100_000);
    expect(d.thisMonth.expense).toBe(0);

    // Los datos de A siguen intactos
    expect((await a.api.get(`/api/accounts/${fa.bank}`)).body.account.balance).toBe(1_950_000);
    expect((await a.api.get(`/api/transactions/${tx}`)).status).toBe(200);
  });
});
