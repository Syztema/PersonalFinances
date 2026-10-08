import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { budgetVsSpend } from '../src/modules/budgets/service';
import type { AuthContext } from '../src/types/fastify';
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

describe('budgetVsSpend (spec Fase 3 §3.2.7)', () => {
  it('reads budgets without copying them and falls back to all spending', async () => {
    const { api, user } = await registerUser(app);
    const f = await setupFinances(api);
    const auth: AuthContext = {
      userId: user.id,
      sessionId: 'report-test',
      timezone: 'America/Bogota',
      today: TODAY,
    };
    const expense = (date: string, amount: number, categoryId: string) =>
      api.post('/api/transactions', {
        type: 'EXPENSE',
        amount,
        date,
        accountId: f.bank,
        categoryId,
      });

    // Agosto: total general de 1.000.000 (cuenta todo el gasto del mes).
    await api.put('/api/budgets/2026-08', { totalAmount: 1_000_000, lines: [] });
    await expense('2026-08-12', 25_000, f.cat.fun);
    // Septiembre: solo una línea de Alimentación (cuenta Alimentación y sus subcategorías).
    await api.put('/api/budgets/2026-09', {
      totalAmount: null,
      lines: [{ categoryId: f.cat.food, amount: 500_000 }],
    });
    await expense('2026-09-10', 120_000, f.cat.food);
    await expense('2026-09-12', 80_000, f.cat.fun);
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 30_000,
      date: '2026-09-15',
      categoryId: f.cat.food,
    });
    // Octubre (mes actual): sin presupuesto.
    await expense('2026-10-05', 40_000, f.cat.food);
    await expense('2026-10-06', 60_000, f.cat.fun);
    const budgetRows = () => app.prisma.budget.count({ where: { userId: user.id } });
    expect(await budgetRows()).toBe(2);

    expect(await budgetVsSpend(app.prisma, auth, ['2026-09', '2026-10', '2026-11'])).toEqual({
      months: [
        { month: '2026-09', budget: 500_000, spent: 150_000 },
        { month: '2026-10', budget: null, spent: 100_000 },
        { month: '2026-11', budget: null, spent: 0 },
      ],
      lines: [],
    });
    // Ni el mes actual ni el siguiente copiaron el presupuesto de septiembre.
    expect(await budgetRows()).toBe(2);

    expect(await budgetVsSpend(app.prisma, auth, ['2026-08', '2026-09'])).toEqual({
      months: [
        { month: '2026-08', budget: 1_000_000, spent: 25_000 },
        { month: '2026-09', budget: 500_000, spent: 150_000 },
      ],
      lines: [
        {
          category: expect.objectContaining({ id: f.cat.food, name: 'Alimentación' }),
          amount: 500_000,
          spent: 150_000,
        },
      ],
    });

    // La pantalla de Presupuestos sigue copiando como en la Fase 2.
    const october = await api.get('/api/budgets/2026-10');
    expect(october.body.budget.copiedFrom).toBe('2026-09');
    expect(await budgetRows()).toBe(3);
  });
});
