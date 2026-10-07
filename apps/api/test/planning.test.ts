import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, registerUser } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-10'; // 22 días hasta fin de mes, incluido hoy

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-10T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

type Cat = { id: string; name: string; kind: string };

describe('¿Cuánto puedo gastar hoy?, alertas y estado (spec 8.7 y 8.12)', () => {
  it('works end to end with a payday, an obligation, today expenses and a budget', async () => {
    const { api } = await registerUser(app);
    const bank = (
      await api.post('/api/accounts', { name: 'Banco', type: 'BANK', initialBalance: 300_000 })
    ).body.account.id;
    const card = (
      await api.post('/api/credit-cards', {
        name: 'Tarjeta',
        creditLimit: 2_000_000,
        statementDay: 15,
        paymentDueDay: 30,
      })
    ).body.card.id;
    const cats = (await api.get('/api/categories')).body.items as Cat[];
    const cat = (name: string, kind = 'EXPENSE') =>
      cats.find((c) => c.name === name && c.kind === kind)!.id;

    let d = (await api.get('/api/dashboard')).body;
    expect(d.spendingPower).toMatchObject({ daily: 13_600, limitedBy: 'LIQUIDITY', spentToday: 0 });

    await api.post('/api/scheduled', {
      kind: 'INCOME',
      name: 'Salario',
      amount: 3_000_000,
      dueDate: '2026-10-15',
      categoryId: cat('Salario', 'INCOME'),
      accountId: bank,
    });
    await api.post('/api/scheduled', {
      kind: 'EXPENSE',
      name: 'Arriendo',
      amount: 1_000_000,
      dueDate: '2026-10-16',
      categoryId: cat('Vivienda'),
      accountId: bank,
    });
    d = (await api.get('/api/dashboard')).body;
    // Hasta el 14 solo hay 300.000 para 5 días: no se gasta hoy el salario del 15.
    expect(d.spendingPower).toMatchObject({ daily: 60_000 });
    expect(d.spendingPower.breakdown.liquidity).toMatchObject({
      bindingDate: '2026-10-14',
      days: 5,
    });

    // Los gastos discrecionales de hoy no cambian la cifra del día.
    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 20_000,
      date: TODAY,
      accountId: bank,
      categoryId: cat('Alimentación'),
    });
    await api.post(`/api/credit-cards/${card}/purchase`, {
      amount: 200_000,
      date: TODAY,
      categoryId: cat('Compras'),
    });
    d = (await api.get('/api/dashboard')).body;
    expect(d.spendingPower).toMatchObject({
      daily: 60_000,
      spentToday: 220_000,
      remainingToday: -160_000,
    });

    // Presupuesto general de 2.000.000: (2.000.000 − 0 − 1.000.000) / 22 = 45.454 → 45.400.
    await api.put('/api/budgets/2026-10', { totalAmount: 2_000_000, lines: [] });
    d = (await api.get('/api/dashboard')).body;
    expect(d.spendingPower).toMatchObject({ daily: 45_400, limitedBy: 'BUDGET' });
    expect(d.budget).toMatchObject({ budget: 2_000_000, spent: 220_000 });
    expect(d.status).toMatchObject({ level: 'OK', title: 'Vas bien' });
    expect(d.goals).toEqual([]);
    expect(d.alerts.length).toBeLessThanOrEqual(3);
  });

  it('lists, dismisses and restores alerts', async () => {
    const { api } = await registerUser(app);
    const bank = (
      await api.post('/api/accounts', { name: 'Banco', type: 'BANK', initialBalance: 50_000 })
    ).body.account.id;
    const cats = (await api.get('/api/categories')).body.items as Cat[];
    const food = cats.find((c) => c.name === 'Alimentación')!.id;
    await api.post('/api/scheduled', {
      kind: 'EXPENSE',
      name: 'Servicios',
      amount: 80_000,
      dueDate: '2026-10-08',
      categoryId: food,
      accountId: bank,
    });
    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 10_000,
      date: TODAY,
      accountId: bank,
      categoryId: food,
    });

    const res = await api.get('/api/alerts');
    const keys = res.body.items.map((a: { key: string }) => a.key);
    expect(keys[0]).toMatch(/^obligation-overdue:/);
    expect(keys).toEqual(expect.arrayContaining(['low-balance:2026-10-10', 'overspend:2026-10']));
    expect(res.body.status.level).toBe('DANGER'); // la proyección a fin de mes es negativa

    expect((await api.post('/api/alerts/low-balance:2026-10-10/dismiss')).status).toBe(204);
    const after = (await api.get('/api/alerts')).body.items.map((a: { key: string }) => a.key);
    expect(after).not.toContain('low-balance:2026-10-10');
    expect((await api.post('/api/alerts/NO_VALIDA/dismiss')).status).toBe(400);
    expect((await api.del('/api/alerts/dismissed')).status).toBe(204);
    expect((await api.get('/api/alerts')).body.items.map((a: { key: string }) => a.key)).toContain(
      'low-balance:2026-10-10',
    );
  });

  const financial = {
    obligationsPct: 50,
    savingsPct: 20,
    investmentPct: 0,
    leisurePct: 15,
    otherPct: 15,
    monthlyIncomeEstimate: null,
    lowBalanceThreshold: 100_000,
  };

  it('does not double count a discretionary expense from a savings account (R0 base)', async () => {
    const { api } = await registerUser(app);
    await api.put('/api/settings/financial', financial);
    const bank = (
      await api.post('/api/accounts', { name: 'Banco', type: 'BANK', initialBalance: 0 })
    ).body.account.id;
    const savings = (
      await api.post('/api/accounts', { name: 'Ahorro', type: 'SAVINGS', initialBalance: 0 })
    ).body.account.id;
    const cats = (await api.get('/api/categories')).body.items as Cat[];
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 1_000_000,
      date: TODAY,
      accountId: bank,
      categoryId: cats.find((c) => c.name === 'Salario' && c.kind === 'INCOME')!.id,
    });
    await api.post('/api/transfers', {
      amount: 200_000,
      date: TODAY,
      accountId: bank,
      toAccountId: savings,
    });
    let d = (await api.get('/api/dashboard')).body;
    expect(d.spendingPower).toMatchObject({ daily: 36_300, spentToday: 0 }); // 800.000 / 22

    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 50_000,
      date: TODAY,
      accountId: savings,
      categoryId: cats.find((c) => c.name === 'Alimentación')!.id,
    });
    d = (await api.get('/api/dashboard')).body;
    expect(d.spendingPower).toMatchObject({ daily: 36_300, spentToday: 50_000 });
  });

  it('a balance adjustment is not discretionary spending', async () => {
    const { api } = await registerUser(app);
    const bank = (
      await api.post('/api/accounts', { name: 'Banco', type: 'BANK', initialBalance: 300_000 })
    ).body.account.id;
    expect((await api.get('/api/dashboard')).body.spendingPower.daily).toBe(13_600);
    expect(
      (await api.post(`/api/accounts/${bank}/adjust`, { actualBalance: 200_000 })).status,
    ).toBe(201);
    const d = (await api.get('/api/dashboard')).body;
    expect(d.spendingPower).toMatchObject({ daily: 9_000, spentToday: 0 }); // 200.000 / 22
  });

  describe('budget scope and linked movements (plan decisions 1 and 2)', () => {
    const setup = async () => {
      const { api } = await registerUser(app);
      const bank = (
        await api.post('/api/accounts', { name: 'Banco', type: 'BANK', initialBalance: 10_000_000 })
      ).body.account.id;
      const cats = (await api.get('/api/categories')).body.items as Cat[];
      const cat = (name: string) => cats.find((c) => c.name === name && c.kind === 'EXPENSE')!.id;
      await api.put('/api/budgets/2026-10', {
        totalAmount: null,
        lines: [{ categoryId: cat('Alimentación'), amount: 600_000 }],
      });
      return { api, bank, cat };
    };

    it('ignores out-of-scope spending and obligations in limit B', async () => {
      const { api, bank, cat } = await setup();
      let d = (await api.get('/api/dashboard')).body;
      expect(d.spendingPower).toMatchObject({ daily: 27_200, limitedBy: 'BUDGET' }); // 600.000 / 22

      await api.post('/api/transactions', {
        type: 'EXPENSE',
        amount: 100_000,
        date: TODAY,
        accountId: bank,
        categoryId: cat('Compras'),
      });
      await api.post('/api/scheduled', {
        kind: 'EXPENSE',
        name: 'Arriendo',
        amount: 300_000,
        dueDate: '2026-10-20',
        categoryId: cat('Vivienda'),
        accountId: bank,
      });
      d = (await api.get('/api/dashboard')).body;
      expect(d.spendingPower).toMatchObject({
        daily: 27_200,
        limitedBy: 'BUDGET',
        spentToday: 100_000,
      });

      // Control positivo: una obligación dentro del alcance sí resta.
      await api.post('/api/scheduled', {
        kind: 'EXPENSE',
        name: 'Mercado',
        amount: 22_000,
        dueDate: '2026-10-20',
        categoryId: cat('Alimentación'),
        accountId: bank,
      });
      d = (await api.get('/api/dashboard')).body;
      expect(d.spendingPower.daily).toBe(26_200); // 578.000 / 22
    });

    it('keeps an obligation completed today in G and out of spentToday', async () => {
      const { api, bank, cat } = await setup();
      const item = (
        await api.post('/api/scheduled', {
          kind: 'EXPENSE',
          name: 'Mercado',
          amount: 100_000,
          dueDate: TODAY,
          categoryId: cat('Alimentación'),
          accountId: bank,
        })
      ).body.item;
      let d = (await api.get('/api/dashboard')).body;
      expect(d.spendingPower).toMatchObject({ daily: 22_700, spentToday: 0 }); // 500.000 / 22
      expect((await api.post(`/api/scheduled/${item.id}/complete`, {})).status).toBe(201);
      d = (await api.get('/api/dashboard')).body;
      expect(d.spendingPower).toMatchObject({ daily: 22_700, spentToday: 0 });
      expect(d.budget).toMatchObject({ spent: 100_000 });
    });
  });

  it('dismissing an alert does not hide it for another user', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    for (const u of [a, b]) {
      await u.api.post('/api/accounts', { name: 'Banco', type: 'BANK', initialBalance: 50_000 });
    }
    const keys = async (u: typeof a) =>
      (await u.api.get('/api/alerts')).body.items.map((x: { key: string }) => x.key);
    const key = `low-balance:${TODAY}`;
    expect(await keys(b)).toContain(key);
    expect((await a.api.post(`/api/alerts/${key}/dismiss`)).status).toBe(204);
    expect(await keys(a)).not.toContain(key);
    expect(await keys(b)).toContain(key);
  });
});
