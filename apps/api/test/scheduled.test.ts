import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { balanceOf, cardOf, setupFinances } from './finance-fixtures';
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

type F = Awaited<ReturnType<typeof setupFinances>>;
type Item = {
  id: string;
  name: string;
  dueDate: string;
  ruleDate: string | null;
  status: string;
  derived: string | null;
};

const oneOff = async (api: Client, f: F, dueDate = '2026-10-25', amount = 500_000) =>
  (
    await api.post('/api/scheduled', {
      kind: 'EXPENSE',
      name: 'SOAT',
      amount,
      dueDate,
      categoryId: f.cat.food,
      accountId: f.bank,
    })
  ).body.item as Item;

describe('scheduled occurrences (spec 8.11)', () => {
  it('lists pending items with the derived card due, in date order', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 300_000,
      date: '2026-10-10',
      categoryId: f.cat.food,
    });
    await oneOff(api, f);
    const items = (await api.get('/api/scheduled')).body.items as Item[];
    expect(items.map((i) => [i.name, i.dueDate, i.derived])).toEqual([
      ['SOAT', '2026-10-25', null],
      ['Pago Nu Crédito', '2026-10-30', 'CARD'],
    ]);
  });

  it('completing twice at once creates exactly one movement (review focus #1)', async () => {
    const { api, f } = await newUser();
    const item = await oneOff(api, f);
    const results = await Promise.all([
      api.post(`/api/scheduled/${item.id}/complete`, {}),
      api.post(`/api/scheduled/${item.id}/complete`, {}),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const created = results.find((r) => r.status === 201)!.body.transaction;
    // La fecha de la obligación es futura: se registra hoy.
    expect(created).toMatchObject({
      type: 'EXPENSE',
      amount: 500_000,
      date: TODAY,
      description: 'SOAT',
    });
    expect(await balanceOf(api, f.bank)).toBe(1_500_000);
    const list = await api.get('/api/transactions?q=SOAT');
    expect(list.body.items).toHaveLength(1);
    const done = (await api.get('/api/scheduled?status=DONE')).body.items as Array<
      Item & { transactionId: string }
    >;
    expect(done[0]).toMatchObject({ id: item.id, transactionId: created.id });
  });

  it('completes with a card and a different amount, and reopens when the movement is deleted', async () => {
    const { api, f } = await newUser();
    const item = await oneOff(api, f);
    const res = await api.post(`/api/scheduled/${item.id}/complete`, {
      creditCardId: f.card,
      amount: 480_000,
    });
    expect(res.status).toBe(201);
    expect(res.body.transaction).toMatchObject({
      type: 'CARD_PURCHASE',
      amount: 480_000,
      installments: 1,
    });
    expect((await cardOf(api, f.card)).debt).toBe(480_000);
    await api.del(`/api/transactions/${res.body.transaction.id}`);
    const pending = (await api.get('/api/scheduled')).body.items as Item[];
    expect(pending.find((i) => i.id === item.id)?.status).toBe('PENDING');
  });

  it('receives an expected income on its date', async () => {
    const { api, f } = await newUser();
    const { body } = await api.post('/api/scheduled', {
      kind: 'INCOME',
      name: 'Bono',
      amount: 700_000,
      dueDate: '2026-10-15',
      categoryId: f.cat.salary,
      accountId: f.bank,
    });
    const res = await api.post(`/api/scheduled/${body.item.id}/complete`, {});
    expect(res.body.transaction).toMatchObject({
      type: 'INCOME',
      amount: 700_000,
      date: '2026-10-15',
    });
  });

  it('skips, reopens, edits only pending items and deletes only one-offs', async () => {
    const { api, f } = await newUser();
    const item = await oneOff(api, f);
    expect((await api.post(`/api/scheduled/${item.id}/skip`)).body.item.status).toBe('SKIPPED');
    const blocked = await api.put(`/api/scheduled/${item.id}`, { amount: 1000 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('SCHEDULED_SKIPPED');
    expect(
      (await api.put(`/api/scheduled/${item.id}`, { status: 'PENDING' })).body.item.status,
    ).toBe('PENDING');
    const edited = await api.put(`/api/scheduled/${item.id}`, {
      amount: 450_000,
      dueDate: '2026-10-26',
    });
    expect(edited.body.item).toMatchObject({ dueDate: '2026-10-26' });
    expect((await api.del(`/api/scheduled/${item.id}`)).status).toBe(204);

    const rule = await api.post('/api/recurring', {
      name: 'Internet',
      kind: 'EXPENSE',
      amount: 90_000,
      categoryId: f.cat.food,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-25',
    });
    const ruleItem = ((await api.get('/api/scheduled')).body.items as Item[]).find(
      (i) => i.name === 'Internet',
    )!;
    const del = await api.del(`/api/scheduled/${ruleItem.id}`);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('USE_SKIP');
    expect(rule.status).toBe(201);
  });

  it('moving the date of a rule occurrence never duplicates it (review focus #2)', async () => {
    const { api, f } = await newUser();
    await api.post('/api/recurring', {
      name: 'Internet',
      kind: 'EXPENSE',
      amount: 90_000,
      categoryId: f.cat.food,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-25',
    });
    const first = ((await api.get('/api/scheduled')).body.items as Item[]).find(
      (i) => i.dueDate === '2026-10-25',
    )!;
    await api.put(`/api/scheduled/${first.id}`, { dueDate: '2026-10-28' });
    const again = ((await api.get('/api/scheduled')).body.items as Item[]).filter(
      (i) => i.name === 'Internet',
    );
    expect(again.map((i) => [i.dueDate, i.ruleDate])).toEqual([
      ['2026-10-28', '2026-10-25'],
      ['2026-11-25', '2026-11-25'],
    ]);
  });

  it('suggests a pending occurrence within ±20 % and ±7 days', async () => {
    const { api, f } = await newUser();
    await api.post('/api/recurring', {
      name: 'Internet',
      kind: 'EXPENSE',
      amount: 90_000,
      categoryId: f.cat.food,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-22',
    });
    const q = (amount: number) =>
      api.get(
        `/api/scheduled/suggestions?kind=EXPENSE&categoryId=${f.cat.food}&amount=${amount}&date=${TODAY}`,
      );
    expect(((await q(95_000)).body.items as Item[]).map((i) => i.name)).toEqual(['Internet']);
    expect((await q(120_000)).body.items).toEqual([]);
  });
});

describe('scheduled guards', () => {
  it('rejects editing or reopening a DONE occurrence', async () => {
    const { api, f } = await newUser();
    const item = await oneOff(api, f);
    await api.post(`/api/scheduled/${item.id}/complete`, {});
    for (const body of [{ amount: 1000 }, { status: 'PENDING' }]) {
      const res = await api.put(`/api/scheduled/${item.id}`, body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SCHEDULED_DONE');
    }
    const done = (await api.get('/api/scheduled?status=DONE')).body.items as Item[];
    expect(done.map((i) => i.status)).toEqual(['DONE']);
  });

  it("another user's occurrence is not found", async () => {
    const owner = await newUser();
    const other = await newUser();
    const item = await oneOff(owner.api, owner.f);
    const responses = [
      await other.api.put(`/api/scheduled/${item.id}`, { amount: 1000 }),
      await other.api.post(`/api/scheduled/${item.id}/complete`, {}),
      await other.api.post(`/api/scheduled/${item.id}/skip`),
      await other.api.del(`/api/scheduled/${item.id}`),
    ];
    expect(responses.map((r) => r.status)).toEqual([404, 404, 404, 404]);
    const mine = (await owner.api.get('/api/scheduled')).body.items as Item[];
    expect(mine.find((i) => i.id === item.id)?.status).toBe('PENDING');
  });
});

describe('linking when registering a movement', () => {
  it("rejects another user's occurrence and combining it with recurring", async () => {
    const owner = await newUser();
    const other = await newUser();
    const item = await oneOff(owner.api, owner.f);
    const base = {
      type: 'EXPENSE',
      amount: 500_000,
      date: TODAY,
      accountId: other.f.bank,
      categoryId: other.f.cat.food,
    };
    const foreign = await other.api.post('/api/transactions', {
      ...base,
      scheduledItemId: item.id,
    });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe('INVALID_REFERENCE');
    const mine = await oneOff(other.api, other.f);
    const both = await other.api.post('/api/transactions', {
      ...base,
      scheduledItemId: mine.id,
      recurring: { frequency: 'MONTHLY' },
    });
    expect(both.status).toBe(400);
  });

  it('links an existing occurrence once', async () => {
    const { api, f } = await newUser();
    const item = await oneOff(api, f, '2026-10-18');
    const body = {
      type: 'EXPENSE',
      amount: 510_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
      scheduledItemId: item.id,
    };
    expect((await api.post('/api/transactions', body)).status).toBe(201);
    const second = await api.post('/api/transactions', body);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('NOT_PENDING');
    const wrongKind = await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.salary,
      scheduledItemId: (await oneOff(api, f, '2026-10-30')).id,
    });
    expect(wrongKind.status).toBe(400);
    expect(wrongKind.body.error.code).toBe('INVALID_REFERENCE');
  });

  it('creates the rule from a recurring salary with its first occurrence done', async () => {
    const { api, f } = await newUser();
    const salary = {
      type: 'INCOME',
      amount: 2_000_000,
      date: '2026-10-15',
      accountId: f.bank,
      categoryId: f.cat.salary,
      description: 'Salario',
      recurring: { frequency: 'SEMIMONTHLY', day1: 15, day2: 31 },
    };
    const res = await api.post('/api/transactions', salary);
    expect(res.status).toBe(201);
    const rules = (await api.get('/api/recurring')).body.items;
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      name: 'Salario',
      kind: 'INCOME',
      startDate: '2026-10-15',
      nextDate: '2026-10-31',
    });
    const all = (await api.get('/api/scheduled?status=PENDING,DONE')).body.items as Item[];
    expect(all.map((i) => [i.ruleDate, i.status])).toEqual([
      ['2026-10-15', 'DONE'],
      ['2026-10-31', 'PENDING'],
      ['2026-11-15', 'PENDING'],
      ['2026-11-30', 'PENDING'],
    ]);

    const offDay = await api.post('/api/transactions', { ...salary, date: '2026-10-14' });
    expect(offDay.status).toBe(400);
    expect(offDay.body.error.code).toBe('VALIDATION_ERROR');
    expect(offDay.body.error.fields['recurring.day1']).toBeTypeOf('string');
  });

  it('a recurring card purchase creates a rule paid with the card', async () => {
    const { api, f } = await newUser();
    const res = await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 38_900,
      date: '2026-10-12',
      categoryId: f.cat.fun,
      description: 'Netflix',
      recurring: { frequency: 'MONTHLY' },
    });
    expect(res.status).toBe(201);
    const rules = (await api.get('/api/recurring')).body.items;
    expect(rules[0]).toMatchObject({
      name: 'Netflix',
      creditCard: { id: f.card },
      account: null,
      nextDate: '2026-11-12',
    });
  });
});
