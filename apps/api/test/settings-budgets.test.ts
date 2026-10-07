import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { setupFinances } from './finance-fixtures';
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
  return { api, user, f: await setupFinances(api) };
}

const spend = (api: Client, categoryId: string, amount: number, accountId: string) =>
  api.post('/api/transactions', { type: 'EXPENSE', amount, date: TODAY, accountId, categoryId });

const settings = {
  obligationsPct: 50,
  savingsPct: 20,
  investmentPct: 10,
  leisurePct: 10,
  otherPct: 10,
  monthlyIncomeEstimate: null,
  lowBalanceThreshold: 100_000,
};

describe('financial settings (spec 8.8)', () => {
  it('starts with the defaults and validates that percentages add up to 100', async () => {
    const { api } = await newUser();
    const res = await api.get('/api/settings/financial');
    expect(res.body.settings).toEqual(settings);
    expect(res.body.month).toMatchObject({ key: '2026-10', projectedIncome: 0 });
    const bad = await api.put('/api/settings/financial', { ...settings, savingsPct: 25 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.total).toBeTypeOf('string');
  });

  it('shows target and actual per bucket from the projected income', async () => {
    const { api, f } = await newUser();
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 4_000_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    await api.post('/api/scheduled', {
      kind: 'INCOME',
      name: 'Bono',
      amount: 1_000_000,
      dueDate: '2026-10-28',
      categoryId: f.cat.salary,
      accountId: f.bank,
    });
    await spend(api, f.cat.food, 300_000, f.bank);
    await spend(api, f.cat.fun, 100_000, f.bank);
    await api.post('/api/transfers', {
      amount: 800_000,
      date: TODAY,
      accountId: f.bank,
      toAccountId: f.savings,
    });

    const { body } = await api.get('/api/settings/financial');
    expect(body.month.projectedIncome).toBe(5_000_000);
    const bucket = (key: string) => body.month.buckets.find((b: { key: string }) => b.key === key);
    expect(bucket('OBLIGATIONS')).toMatchObject({ target: 2_500_000, actual: 300_000 });
    expect(bucket('SAVINGS')).toMatchObject({ target: 1_000_000, actual: 800_000 });
    expect(bucket('LEISURE')).toMatchObject({ target: 500_000, actual: 100_000 });
  });

  it('uses the monthly estimate when nothing was received yet', async () => {
    const { api } = await newUser();
    const res = await api.put('/api/settings/financial', {
      ...settings,
      savingsPct: 25,
      otherPct: 5,
      monthlyIncomeEstimate: 3_000_000,
    });
    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject({ savingsPct: 25, monthlyIncomeEstimate: 3_000_000 });
    expect(res.body.month.projectedIncome).toBe(3_000_000);
  });
});

describe('budgets (spec 8.9)', () => {
  it('a month without budget answers empty', async () => {
    const { api } = await newUser();
    const res = await api.get('/api/budgets/2026-10');
    expect(res.status).toBe(200);
    expect(res.body.budget).toEqual({
      month: '2026-10',
      totalAmount: null,
      lines: [],
      total: null,
      projection: null,
      daysLeft: 12,
      copiedFrom: null,
    });
    expect((await api.get('/api/budgets/2026-13')).status).toBe(400);
  });

  it('counts subcategories and card purchases, and projects the month', async () => {
    const { api, f } = await newUser();
    const child = (
      await api.post('/api/categories', {
        name: 'Domicilios',
        kind: 'EXPENSE',
        parentId: f.cat.food,
      })
    ).body.category.id as string;
    await spend(api, f.cat.food, 300_000, f.bank);
    await spend(api, child, 50_000, f.bank);
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 100_000,
      date: TODAY,
      categoryId: f.cat.food,
    });
    await spend(api, f.cat.fun, 250_000, f.bank);
    await spend(api, f.cat.interest, 100_000, f.bank);

    const put = await api.put('/api/budgets/2026-10', {
      totalAmount: 2_000_000,
      lines: [
        { categoryId: f.cat.food, amount: 600_000 },
        { categoryId: f.cat.fun, amount: 200_000 },
      ],
    });
    expect(put.status).toBe(200);
    const b = put.body.budget;
    expect(
      b.lines.map(
        (l: { category: { id: string }; spent: number; usage: number; remaining: number }) => [
          l.category.id,
          l.spent,
          l.usage,
          l.remaining,
        ],
      ),
    ).toEqual([
      [f.cat.food, 450_000, 0.75, 150_000],
      [f.cat.fun, 250_000, 1.25, -50_000],
    ]);
    // Con total general cuenta todo el gasto del mes.
    expect(b.total).toEqual({
      budget: 2_000_000,
      spent: 800_000,
      remaining: 1_200_000,
      usage: 0.4,
    });
    expect(b.projection).toEqual({ projectedSpend: 1_240_000, exceedsOnDay: null });

    // Solo con líneas, cuenta lo de las categorías presupuestadas (decisión 1 del plan).
    const linesOnly = await api.put('/api/budgets/2026-10', {
      totalAmount: null,
      lines: [
        { categoryId: f.cat.food, amount: 600_000 },
        { categoryId: f.cat.fun, amount: 200_000 },
      ],
    });
    expect(linesOnly.body.budget.total).toEqual({
      budget: 800_000,
      spent: 700_000,
      remaining: 100_000,
      usage: 0.875,
    });
  });

  it('a subcategory line is a sub-limit of its budgeted parent (review I1)', async () => {
    const { api, f } = await newUser();
    const sub = async (name: string) =>
      (await api.post('/api/categories', { name, kind: 'EXPENSE', parentId: f.cat.food })).body
        .category.id as string;
    const restaurants = await sub('Restaurantes');
    const delivery = await sub('Domicilios');
    await spend(api, f.cat.food, 300_000, f.bank);
    await spend(api, restaurants, 150_000, f.bank);

    const nested = await api.put('/api/budgets/2026-10', {
      totalAmount: null,
      lines: [
        { categoryId: f.cat.food, amount: 900_000 },
        { categoryId: restaurants, amount: 200_000 },
      ],
    });
    expect(nested.status).toBe(200);
    const b = nested.body.budget;
    // Restaurantes ya cuenta dentro de Alimentación: el presupuesto general es 900.000, no 1.100.000.
    expect(b.total).toEqual({ budget: 900_000, spent: 450_000, remaining: 450_000, usage: 0.5 });
    // Cada línea conserva su propio gasto y su avance.
    const line = (id: string) =>
      b.lines.find((l: { category: { id: string } }) => l.category.id === id);
    expect(line(f.cat.food)).toMatchObject({ amount: 900_000, spent: 450_000, usage: 0.5 });
    expect(line(restaurants)).toMatchObject({ amount: 200_000, spent: 150_000, usage: 0.75 });

    // El límite B de "¿Cuánto puedo gastar hoy?" usa el mismo presupuesto general.
    const d = (await api.get('/api/dashboard')).body;
    expect(d.budget).toMatchObject({ budget: 900_000, spent: 450_000 });
    expect(
      d.spendingPower.breakdown.budget.items.find((i: { key: string }) => i.key === 'budget'),
    ).toMatchObject({ amount: 900_000 });

    // Subcategorías hermanas sin su padre presupuestado sí se suman.
    const siblings = await api.put('/api/budgets/2026-10', {
      totalAmount: null,
      lines: [
        { categoryId: restaurants, amount: 200_000 },
        { categoryId: delivery, amount: 100_000 },
      ],
    });
    expect(siblings.body.budget.total).toEqual({
      budget: 300_000,
      spent: 150_000,
      remaining: 150_000,
      usage: 0.5,
    });
  });

  it('copies the latest previous budget without deleted categories, never into the past', async () => {
    const { api, f } = await newUser();
    await api.put('/api/budgets/2026-09', {
      totalAmount: 1_500_000,
      lines: [
        { categoryId: f.cat.food, amount: 600_000 },
        { categoryId: f.cat.fun, amount: 200_000 },
      ],
    });
    await api.del(`/api/categories/${f.cat.fun}`);
    const oct = (await api.get('/api/budgets/2026-10')).body.budget;
    expect(oct.copiedFrom).toBe('2026-09');
    expect(oct.totalAmount).toBe(1_500_000);
    expect(oct.lines.map((l: { category: { id: string } }) => l.category.id)).toEqual([f.cat.food]);
    // El aviso de copia sigue hasta que el usuario guarda el mes (review I2).
    expect((await api.get('/api/budgets/2026-10')).body.budget.copiedFrom).toBe('2026-09');
    const saved = await api.put('/api/budgets/2026-10', {
      totalAmount: 1_500_000,
      lines: [{ categoryId: f.cat.food, amount: 600_000 }],
    });
    expect(saved.body.budget.copiedFrom).toBeNull();
    expect((await api.get('/api/budgets/2026-10')).body.budget.copiedFrom).toBeNull();
    expect((await api.get('/api/budgets/2026-08')).body.budget.total).toBeNull();
  });

  it('keeps the copy notice when the dashboard made the copy (review I2)', async () => {
    const { api, f } = await newUser();
    await api.put('/api/budgets/2026-09', {
      totalAmount: 1_000_000,
      lines: [{ categoryId: f.cat.food, amount: 400_000 }],
    });
    // La primera petición del mes suele ser el inicio, que calcula (y copia) el presupuesto.
    expect((await api.get('/api/dashboard')).body.budget).toMatchObject({ budget: 1_000_000 });
    expect((await api.get('/api/budgets/2026-10')).body.budget).toMatchObject({
      totalAmount: 1_000_000,
      copiedFrom: '2026-09',
    });
  });

  it('a deleted month stays empty and stops the copying (review focus #4)', async () => {
    const { api, user, f } = await newUser();
    await api.put('/api/budgets/2026-09', { totalAmount: 1_000_000, lines: [] });
    expect((await api.get('/api/budgets/2026-10')).body.budget.copiedFrom).toBe('2026-09');
    expect((await api.del('/api/budgets/2026-10')).status).toBe(204);
    const stored = await app.prisma.budget.findUniqueOrThrow({
      where: { userId_month: { userId: user.id, month: new Date('2026-10-01T00:00:00Z') } },
    });
    expect(stored).toMatchObject({ totalAmount: null, copiedFrom: null });
    expect((await api.get('/api/budgets/2026-10')).body.budget.total).toBeNull();
    expect((await api.get('/api/budgets/2026-11')).body.budget.total).toBeNull();
    const bad = await api.put('/api/budgets/2026-11', {
      totalAmount: null,
      lines: [{ categoryId: f.cat.salary, amount: 1000 }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields['lines.0.categoryId']).toBeTypeOf('string');
  });
});
