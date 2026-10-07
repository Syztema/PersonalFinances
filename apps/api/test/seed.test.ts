import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from '../prisma/seed-demo';
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
  });
});
