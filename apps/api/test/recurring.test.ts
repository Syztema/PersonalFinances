import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { fromDbDate } from '../src/lib/db';
import { ensureScheduled } from '../src/modules/recurring/service';
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

async function newUser() {
  const { api, user } = await registerUser(app);
  return { api, userId: user.id, f: await setupFinances(api) };
}

const itemsOf = async (ruleId: string) =>
  (
    await app.prisma.scheduledItem.findMany({
      where: { recurringRuleId: ruleId },
      orderBy: { ruleDate: 'asc' },
    })
  ).map((i) => ({
    ruleDate: fromDbDate(i.ruleDate!),
    status: i.status,
    amount: Number(i.amount),
  }));

describe('recurring rules (spec 8.11, decision 3 of the plan)', () => {
  it('creates a monthly rule that starts generating from today', async () => {
    const { api, f } = await newUser();
    const res = await api.post('/api/recurring', {
      name: 'Internet',
      kind: 'EXPENSE',
      amount: 90_000,
      categoryId: f.cat.food,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-10',
    });
    expect(res.status).toBe(201);
    expect(res.body.rule).toMatchObject({
      name: 'Internet',
      nextDate: '2026-11-10',
      isActive: true,
      account: { id: f.bank },
    });
    // El 10 de octubre ya pasó cuando se creó la regla: no aparece como obligación vencida.
    expect(await itemsOf(res.body.rule.id)).toEqual([
      { ruleDate: '2026-11-10', status: 'PENDING', amount: 90_000 },
    ]);
  });

  it('generates a semimonthly salary and is idempotent', async () => {
    const { api, userId, f } = await newUser();
    const { body } = await api.post('/api/recurring', {
      name: 'Salario',
      kind: 'INCOME',
      amount: 2_000_000,
      categoryId: f.cat.salary,
      accountId: f.bank,
      frequency: 'SEMIMONTHLY',
      startDate: TODAY,
    });
    await ensureScheduled(app.prisma, userId, TODAY);
    await ensureScheduled(app.prisma, userId, TODAY);
    expect((await itemsOf(body.rule.id)).map((i) => i.ruleDate)).toEqual([
      '2026-10-31',
      '2026-11-15',
      '2026-11-30',
    ]);
  });

  it('editing regenerates pending occurrences and keeps the history', async () => {
    const { api, f } = await newUser();
    const rule = {
      name: 'Gimnasio',
      kind: 'EXPENSE',
      amount: 80_000,
      categoryId: f.cat.fun,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-25',
    };
    const { body } = await api.post('/api/recurring', rule);
    const id = body.rule.id;
    await app.prisma.scheduledItem.updateMany({
      where: { recurringRuleId: id, dueDate: new Date('2026-10-25T00:00:00Z') },
      data: { status: 'SKIPPED' },
    });

    const edited = await api.put(`/api/recurring/${id}`, {
      ...rule,
      amount: 100_000,
      startDate: '2026-10-27',
      isActive: true,
    });
    expect(edited.status).toBe(200);
    expect(await itemsOf(id)).toEqual([
      { ruleDate: '2026-10-25', status: 'SKIPPED', amount: 80_000 },
      { ruleDate: '2026-10-27', status: 'PENDING', amount: 100_000 },
      { ruleDate: '2026-11-27', status: 'PENDING', amount: 100_000 },
    ]);

    const paused = await api.put(`/api/recurring/${id}`, {
      ...rule,
      startDate: '2026-10-27',
      isActive: false,
    });
    expect(paused.body.rule).toMatchObject({ isActive: false, nextDate: null });
    expect((await itemsOf(id)).map((i) => i.status)).toEqual(['SKIPPED']);
  });

  it('deleting a rule keeps finished occurrences without the rule', async () => {
    const { api, userId, f } = await newUser();
    const { body } = await api.post('/api/recurring', {
      name: 'Arriendo',
      kind: 'EXPENSE',
      amount: 1_000_000,
      categoryId: f.cat.food,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-28',
    });
    await app.prisma.scheduledItem.updateMany({
      where: { recurringRuleId: body.rule.id, dueDate: new Date('2026-10-28T00:00:00Z') },
      data: { status: 'SKIPPED' },
    });
    expect((await api.del(`/api/recurring/${body.rule.id}`)).status).toBe(204);
    const left = await app.prisma.scheduledItem.findMany({ where: { userId } });
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ status: 'SKIPPED', recurringRuleId: null, ruleDate: null });
  });

  it('validates the category kind and that the account is not deleted', async () => {
    const { api, f } = await newUser();
    const base = {
      name: 'X',
      kind: 'EXPENSE',
      amount: 1000,
      categoryId: f.cat.salary,
      accountId: f.bank,
      frequency: 'WEEKLY',
      startDate: TODAY,
    };
    const wrongKind = await api.post('/api/recurring', base);
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
    const deleted = await api.post('/api/recurring', {
      ...base,
      categoryId: f.cat.food,
      accountId: f.wallet,
    });
    expect(deleted.status).toBe(400);
    expect(deleted.body.error.fields.accountId).toMatch(/eliminada/);
    const list = await api.get('/api/recurring');
    expect(list.body.items).toEqual([]);
  });

  it('isolates rules between users', async () => {
    const a = await newUser();
    const b = await newUser();
    const { body } = await a.api.post('/api/recurring', {
      name: 'Privada',
      kind: 'EXPENSE',
      amount: 1000,
      categoryId: a.f.cat.food,
      accountId: a.f.bank,
      frequency: 'MONTHLY',
      startDate: TODAY,
    });
    const url = `/api/recurring/${body.rule.id}`;
    expect((await b.api.get(url)).status).toBe(404);
    expect(
      (
        await b.api.put(url, {
          name: 'Privada',
          kind: 'EXPENSE',
          amount: 1000,
          categoryId: b.f.cat.food,
          accountId: b.f.bank,
          frequency: 'MONTHLY',
          startDate: TODAY,
          isActive: true,
        })
      ).status,
    ).toBe(404);
    expect((await b.api.del(url)).status).toBe(404);
  });

  it('validates references when saving a paused rule with changed references', async () => {
    const a = await newUser();
    const b = await newUser();
    const rule = {
      name: 'Pausada',
      kind: 'EXPENSE',
      amount: 1000,
      categoryId: a.f.cat.food,
      accountId: a.f.bank,
      frequency: 'MONTHLY',
      startDate: TODAY,
    };
    const { body } = await a.api.post('/api/recurring', rule);
    const res = await a.api.put(`/api/recurring/${body.rule.id}`, {
      ...rule,
      categoryId: b.f.cat.food,
      isActive: false,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REFERENCE');

    const wrongKind = await a.api.put(`/api/recurring/${body.rule.id}`, {
      ...rule,
      categoryId: a.f.cat.salary,
      isActive: false,
    });
    expect(wrongKind.status).toBe(400);
    expect(wrongKind.body.error.fields.categoryId).toBeTypeOf('string');
  });

  it('lets a paused rule with a deleted account be renamed when references are unchanged', async () => {
    const { api, f } = await newUser();
    const rule = {
      name: 'Vieja',
      kind: 'EXPENSE',
      amount: 1000,
      categoryId: f.cat.food,
      accountId: f.wallet,
      frequency: 'MONTHLY',
      startDate: TODAY,
    };
    const { body } = await api.post('/api/recurring', rule);
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
    const res = await api.put(`/api/recurring/${body.rule.id}`, {
      ...rule,
      name: 'Renombrada',
      isActive: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.rule).toMatchObject({ name: 'Renombrada', isActive: false });
  });
});
