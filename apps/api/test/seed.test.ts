import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from '../prisma/seed-demo';
import { effectsOf } from '../src/domain/ledger';
import { client, createTestApp } from './helpers';

let app: FastifyInstance;
const NOW = new Date('2026-10-20T15:00:00Z');

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => NOW }));
});

afterAll(async () => {
  await app.close();
});

describe('demo seed', () => {
  it('creates a realistic, consistent demo user and can run twice', async () => {
    await seedDemo(app.prisma, NOW);
    const { userId } = await seedDemo(app.prisma, NOW);
    expect(await app.prisma.user.count({ where: { email: DEMO_EMAIL } })).toBe(1);

    const login = await client(app).post('/api/auth/login', {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    expect(login.status).toBe(200);
    const api = client(app, login.cookies.find((c) => c.name === 'fz_session')!.value);

    const d = (await api.get('/api/dashboard')).body;
    expect(d.money.accounts.map((a: { name: string }) => a.name)).toEqual([
      'Bancolombia',
      'Nequi',
      'Efectivo',
      'Nu',
      'Bolsillo ahorro',
    ]);
    expect(d.money.accounts.every((a: { balance: number }) => a.balance >= 0)).toBe(true);
    expect(d.cards[0].debt).toBeGreaterThan(0);
    expect(d.loans[0].balance).toBeLessThan(8_000_000);
    expect(d.thisMonth.income).toBeGreaterThan(0);

    const types = await app.prisma.transaction.groupBy({
      by: ['type'],
      where: { userId },
      _count: true,
    });
    expect(types.map((t) => t.type).sort()).toEqual(
      ['CARD_PAYMENT', 'CARD_PURCHASE', 'DEBT_PAYMENT', 'EXPENSE', 'INCOME', 'TRANSFER'].sort(),
    );
    expect(
      await app.prisma.transaction.count({
        where: { userId, type: 'CARD_PURCHASE', installments: { gt: 1 } },
      }),
    ).toBe(1);
    expect(
      await app.prisma.transaction.count({ where: { userId, companionId: { not: null } } }),
    ).toBeGreaterThan(0);
  });

  it('adds a budget, the computer goal and linked recurring items (spec 16)', async () => {
    const { userId } = await seedDemo(app.prisma, NOW);
    const login = await client(app).post('/api/auth/login', {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    const api = client(app, login.cookies.find((c) => c.name === 'fz_session')!.value);

    const goals = (await api.get('/api/goals')).body.items;
    expect(goals[0]).toMatchObject({
      name: 'Comprar computador',
      targetAmount: 5_000_000,
      targetDate: '2027-06-30',
    });
    // Tres "Ahorro quincena" de $400.000 (16 de ago, sep y oct) enlazados a la meta.
    expect(goals[0].contributed).toBe(1_200_000);
    expect((await api.get('/api/budgets/2026-10')).body.budget.total.budget).toBe(4_200_000);
    expect(await app.prisma.recurringRule.count({ where: { userId } })).toBe(4);
    // Lo ya ocurrido está enlazado a su movimiento: no hay obligaciones "vencidas" falsas.
    expect(
      await app.prisma.scheduledItem.count({
        where: {
          userId,
          status: 'PENDING',
          dueDate: { lt: new Date(`${NOW.toISOString().slice(0, 10)}T00:00:00Z`) },
        },
      }),
    ).toBe(0);
    expect(
      await app.prisma.scheduledItem.count({ where: { userId, status: 'DONE' } }),
    ).toBeGreaterThan(0);
  });

  it('never leaves an account below zero at any point of the history', async () => {
    const { userId } = await seedDemo(app.prisma, NOW);
    const accounts = await app.prisma.account.findMany({ where: { userId } });
    const balance = new Map(accounts.map((a) => [a.id, Number(a.initialBalance)]));
    const transactions = await app.prisma.transaction.findMany({
      where: { userId },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    for (const t of transactions) {
      const fx = effectsOf({
        type: t.type,
        amount: Number(t.amount),
        accountId: t.accountId,
        toAccountId: t.toAccountId,
        creditCardId: t.creditCardId,
        debtId: t.debtId,
      });
      for (const e of fx.accounts) {
        balance.set(e.accountId, balance.get(e.accountId)! + e.delta);
        expect(
          balance.get(e.accountId),
          `${t.description} ${t.date.toISOString()}`,
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
