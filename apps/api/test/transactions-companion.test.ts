import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { CompanionDTO, TransactionDTO } from '@finanzas/shared';
import { setupFinances } from './finance-fixtures';
import { createTestApp, registerUser, type Client } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

async function newUser() {
  const reg = await registerUser(app);
  const f = await setupFinances(reg.api);
  const options = (await reg.api.get<{ items: CompanionDTO[] }>('/api/companions')).body.items;
  const who = (name: string) => options.find((c) => c.name === name)!.id;
  return { ...reg, f, who };
}

type F = Awaited<ReturnType<typeof newUser>>['f'];

const expenseBody = (f: F, extra: Record<string, unknown> = {}) => ({
  type: 'EXPENSE',
  amount: 40_000,
  date: '2026-10-10',
  accountId: f.bank,
  categoryId: f.cat.food,
  ...extra,
});

async function create(api: Client, body: unknown) {
  const res = await api.post<{ transaction: TransactionDTO }>('/api/transactions', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.transaction;
}

/** Crea una opción, la usa en un gasto y la elimina (queda con historial). */
async function usedAndDeleted(api: Client, f: F, name: string) {
  const id = (await api.post('/api/companions', { name })).body.companion.id as string;
  const tx = await create(api, expenseBody(f, { companionId: id }));
  expect((await api.del(`/api/companions/${id}`)).body).toEqual({ deleted: 'soft' });
  return { id, tx };
}

describe('who on a movement (spec con quién §2.3)', () => {
  it('saves who an expense and a card purchase were with, and shows it', async () => {
    const { api, f, who } = await newUser();
    const lunch = await create(api, expenseBody(f, { companionId: who('Amigos') }));
    expect(lunch.companion).toEqual({
      id: who('Amigos'),
      name: 'Amigos',
      icon: 'users',
      color: '#c2410c',
      isActive: true,
    });
    const purchase = await api.post<{ transaction: TransactionDTO }>(
      `/api/credit-cards/${f.card}/purchase`,
      { amount: 90_000, date: '2026-10-10', categoryId: f.cat.fun, companionId: who('Pareja') },
    );
    expect(purchase.status).toBe(201);
    expect(purchase.body.transaction.companion?.name).toBe('Pareja');
    expect((await create(api, expenseBody(f))).companion).toBeNull();
    expect((await create(api, expenseBody(f, { companionId: null }))).companion).toBeNull();
    const usage = (await api.get<{ items: CompanionDTO[] }>('/api/companions')).body.items;
    expect(usage.find((c) => c.name === 'Amigos')?.usageCount).toBe(1);
  });

  it('refuses who on movements that are not spending (fields.companionId)', async () => {
    const { api, f, who } = await newUser();
    const companionId = who('Solo');
    const bodies = [
      {
        type: 'INCOME',
        amount: 1000,
        date: '2026-10-10',
        accountId: f.bank,
        categoryId: f.cat.salary,
      },
      {
        type: 'TRANSFER',
        amount: 1000,
        date: '2026-10-10',
        accountId: f.bank,
        toAccountId: f.wallet,
      },
      {
        type: 'CARD_PAYMENT',
        amount: 1000,
        date: '2026-10-10',
        accountId: f.bank,
        creditCardId: f.card,
      },
      { type: 'DEBT_PAYMENT', amount: 1000, date: '2026-10-10', accountId: f.bank, debtId: f.debt },
      {
        type: 'DEBT_DISBURSEMENT',
        amount: 1000,
        date: '2026-10-10',
        accountId: f.bank,
        debtId: f.debt,
      },
    ];
    for (const body of bodies) {
      const res = await api.post('/api/transactions', { ...body, companionId });
      expect(res.status, body.type).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields).toEqual({ companionId: 'Campo no permitido' });
    }
  });

  it("refuses a deleted option or another user's on create (INVALID_REFERENCE)", async () => {
    const a = await newUser();
    const b = await newUser();
    const foreign = await a.api.post(
      '/api/transactions',
      expenseBody(a.f, { companionId: b.who('Solo') }),
    );
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe('INVALID_REFERENCE');
    expect(foreign.body.error.fields).toEqual({ companionId: 'Opción no encontrada' });

    const { id } = await usedAndDeleted(a.api, a.f, 'Vecinos');
    const deleted = await a.api.post('/api/transactions', expenseBody(a.f, { companionId: id }));
    expect(deleted.status).toBe(400);
    expect(deleted.body.error.fields).toEqual({ companionId: 'La opción fue eliminada' });

    // B tampoco ve los gastos de A al filtrar por la opción de A.
    await create(a.api, expenseBody(a.f, { companionId: a.who('Amigos') }));
    const peek = await b.api.get(`/api/transactions?companionId=${a.who('Amigos')}`);
    expect(peek.status).toBe(200);
    expect(peek.body.items).toEqual([]);
  });

  it('keeps a deleted option on edit and refuses switching to another deleted one', async () => {
    const { api, f } = await newUser();
    const { id, tx } = await usedAndDeleted(api, f, 'Vecinos');
    const keep = await api.put<{ transaction: TransactionDTO }>(
      `/api/transactions/${tx.id}`,
      expenseBody(f, { companionId: id, description: 'Asado' }),
    );
    expect(keep.status).toBe(200);
    expect(keep.body.transaction.companion).toMatchObject({ id, isActive: false });

    const other = await usedAndDeleted(api, f, 'Primos');
    const swap = await api.put(
      `/api/transactions/${tx.id}`,
      expenseBody(f, { companionId: other.id }),
    );
    expect(swap.status).toBe(400);
    expect(swap.body.error.fields).toEqual({ companionId: 'La opción fue eliminada' });

    const clear = await api.put<{ transaction: TransactionDTO }>(
      `/api/transactions/${tx.id}`,
      expenseBody(f, { companionId: null }),
    );
    expect(clear.body.transaction.companion).toBeNull();
  });

  it('lets a frozen movement change only who it was with (descriptive field)', async () => {
    const { api, f, who } = await newUser();
    await api.post('/api/transfers', {
      amount: 50_000,
      date: '2026-10-09',
      accountId: f.bank,
      toAccountId: f.wallet,
    });
    const body = expenseBody(f, { accountId: f.wallet, amount: 50_000, companionId: who('Solo') });
    const tx = await create(api, body);
    expect((await api.del(`/api/accounts/${f.wallet}`)).body).toEqual({ deleted: 'soft' });

    const res = await api.put<{ transaction: TransactionDTO }>(`/api/transactions/${tx.id}`, {
      ...body,
      companionId: who('Amigos'),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.transaction.companion?.name).toBe('Amigos');
    expect(res.body.transaction.amount).toBe(50_000);
    // Control: el dinero sigue congelado.
    const money = await api.put(`/api/transactions/${tx.id}`, { ...body, amount: 60_000 });
    expect(money.status).toBe(409);
    expect(money.body.error.code).toBe('ENTITY_DELETED');
  });

  it('keeps who on the EXPENSE ⇄ CARD_PURCHASE switch', async () => {
    const { api, f, who } = await newUser();
    const tx = await create(api, expenseBody(f, { companionId: who('Familia') }));
    const toCard = await api.put<{ transaction: TransactionDTO }>(`/api/transactions/${tx.id}`, {
      type: 'CARD_PURCHASE',
      amount: 40_000,
      date: '2026-10-10',
      creditCardId: f.card,
      categoryId: f.cat.food,
      installments: 1,
      companionId: who('Familia'),
    });
    expect(toCard.status, JSON.stringify(toCard.body)).toBe(200);
    expect(toCard.body.transaction).toMatchObject({
      type: 'CARD_PURCHASE',
      companion: { name: 'Familia' },
    });
    const back = await api.put<{ transaction: TransactionDTO }>(
      `/api/transactions/${tx.id}`,
      expenseBody(f, { companionId: who('Familia') }),
    );
    expect(back.body.transaction).toMatchObject({
      type: 'EXPENSE',
      companion: { name: 'Familia' },
    });
  });

  it('filters by who; "none" is spending without who, interest included', async () => {
    const { api, f, who } = await newUser();
    const friends = await create(api, expenseBody(f, { companionId: who('Amigos') }));
    const alone = await create(api, expenseBody(f, { description: 'Sin decir' }));
    await create(api, {
      type: 'INCOME',
      amount: 1_000_000,
      date: '2026-10-10',
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    await create(api, {
      type: 'DEBT_PAYMENT',
      amount: 400_000,
      interest: 30_000,
      date: '2026-10-10',
      accountId: f.bank,
      debtId: f.debt,
    });
    const byFriends = await api.get<{ items: TransactionDTO[] }>(
      `/api/transactions?companionId=${who('Amigos')}`,
    );
    expect(byFriends.body.items.map((t) => t.id)).toEqual([friends.id]);
    const none = await api.get<{ items: TransactionDTO[] }>('/api/transactions?companionId=none');
    expect(none.body.items.map((t) => t.type).sort()).toEqual(['EXPENSE', 'EXPENSE']);
    expect(none.body.items.map((t) => t.description).sort()).toEqual([
      'Intereses Libre inversión',
      'Sin decir',
    ]);
    expect(none.body.items.some((t) => t.id === alone.id)).toBe(true);
    expect((await api.get('/api/transactions?companionId=otra-cosa')).status).toBe(400);
  });

  it('deletes a used option keeping its history and restores it', async () => {
    const { api, f } = await newUser();
    const { id, tx } = await usedAndDeleted(api, f, 'Vecinos');
    const options = (await api.get<{ items: CompanionDTO[] }>('/api/companions')).body.items;
    expect(options.find((c) => c.id === id)).toMatchObject({ isActive: false, usageCount: 1 });
    const shown = await api.get<{ transaction: TransactionDTO }>(`/api/transactions/${tx.id}`);
    expect(shown.body.transaction.companion).toMatchObject({ name: 'Vecinos', isActive: false });
    expect((await api.post(`/api/companions/${id}/restore`)).body.companion.isActive).toBe(true);
    expect((await create(api, expenseBody(f, { companionId: id }))).companion?.name).toBe(
      'Vecinos',
    );
  });

  it('deletes a whole user whose expenses use options (review focus 5)', async () => {
    const { api, f, who, password, user } = await newUser();
    await create(api, expenseBody(f, { companionId: who('Amigos') }));
    const res = await api.del('/api/me', { password, confirmation: 'ELIMINAR' });
    expect(res.status).toBe(204);
    expect(await app.prisma.companion.count({ where: { userId: user.id } })).toBe(0);
    expect(await app.prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
  });
});
