import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ScheduledItemDTO } from '@finanzas/shared';
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

describe('a recurring payment that already exists (spec Fase 3 §8.4, API side)', () => {
  it('flags suggestions from a rule and never accepts a link and a new rule together', async () => {
    const { api, user } = await registerUser(app);
    const f = await setupFinances(api);
    const rule = (
      await api.post('/api/recurring', {
        name: 'Arriendo',
        kind: 'EXPENSE',
        amount: 1_000_000,
        categoryId: f.cat.food,
        accountId: f.bank,
        frequency: 'MONTHLY',
        startDate: '2026-10-25',
      })
    ).body.rule;
    await api.post('/api/scheduled', {
      kind: 'EXPENSE',
      name: 'SOAT',
      amount: 1_000_000,
      dueDate: '2026-10-22',
      categoryId: f.cat.food,
      accountId: f.bank,
    });

    const suggestions = (
      await api.get<{ items: ScheduledItemDTO[] }>(
        `/api/scheduled/suggestions?kind=EXPENSE&categoryId=${f.cat.food}&amount=1000000&date=${TODAY}`,
      )
    ).body.items;
    expect(suggestions.map((s) => [s.name, s.dueDate, s.recurringRuleId])).toEqual([
      ['SOAT', '2026-10-22', null],
      ['Arriendo', '2026-10-25', rule.id],
    ]);
    const occurrence = suggestions[1]!;

    const expense = {
      type: 'EXPENSE',
      amount: 1_000_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    };
    const count = async () => ({
      transactions: await app.prisma.transaction.count({ where: { userId: user.id } }),
      rules: await app.prisma.recurringRule.count({ where: { userId: user.id } }),
    });

    const both = await api.post('/api/transactions', {
      ...expense,
      scheduledItemId: occurrence.id,
      recurring: { frequency: 'MONTHLY' },
    });
    expect(both.status).toBe(400);
    expect(both.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Elige enlazar con una obligación o marcar como recurrente.',
      fields: { recurring: 'No se puede junto con un enlace' },
    });
    expect(await count()).toEqual({ transactions: 0, rules: 1 });

    // "Sí, es este pago": se enlaza con la ocurrencia y no se crea otra regla.
    const yes = await api.post('/api/transactions', { ...expense, scheduledItemId: occurrence.id });
    expect(yes.status).toBe(201);
    const paid = await app.prisma.scheduledItem.findUniqueOrThrow({ where: { id: occurrence.id } });
    expect(paid).toMatchObject({ status: 'DONE', transactionId: yes.body.transaction.id });
    expect(await count()).toEqual({ transactions: 1, rules: 1 });

    // "No": se crea la regla nueva.
    const no = await api.post('/api/transactions', {
      ...expense,
      description: 'Arriendo bodega',
      recurring: { frequency: 'MONTHLY' },
    });
    expect(no.status).toBe(201);
    expect(await count()).toEqual({ transactions: 2, rules: 2 });
  });
});
