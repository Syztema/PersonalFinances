import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { setupFinances } from './finance-fixtures';
import { client, createTestApp, registerUser, type ApiResponse } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

type User = Awaited<ReturnType<typeof registerUser>>;
type Finances = Awaited<ReturnType<typeof setupFinances>>;

let a: User;
let b: User;
let fa: Finances;
let fb: Finances;
let goal: string;
let rule: string;
let item: string;
let overdueItem: string;
let tag: string;
let deletedCard: string;
let deletedLoan: string;
let baseline: Awaited<ReturnType<typeof victimState>>;

const A_SETTINGS = {
  obligationsPct: 40,
  savingsPct: 25,
  investmentPct: 10,
  leisurePct: 15,
  otherPct: 10,
  monthlyIncomeEstimate: 3_000_000,
  lowBalanceThreshold: 123_456,
};

/** Cada respuesta de error lleva el estado y el código esperados (nada de filtrar datos ajenos). */
function expectError(res: ApiResponse, status: number, code: string) {
  expect({ status: res.status, code: res.body?.error?.code }).toEqual({ status, code });
}
const notFound = (res: ApiResponse) => expectError(res, 404, 'NOT_FOUND');
const invalidRef = (res: ApiResponse) => expectError(res, 400, 'INVALID_REFERENCE');

/** Todo lo que el usuario A posee y que B podría tocar; se compara antes y después. */
async function victimState() {
  const api = a.api;
  const g = (await api.get(`/api/goals/${goal}`)).body.goal;
  const r = (await api.get(`/api/recurring/${rule}`)).body.rule;
  const scheduled = (await api.get('/api/scheduled?status=PENDING,DONE,SKIPPED')).body.items;
  const bank = (await api.get(`/api/accounts/${fa.bank}`)).body.account;
  const savings = (await api.get(`/api/accounts/${fa.savings}`)).body.account;
  const categories = (await api.get('/api/categories')).body.items;
  return {
    goal: {
      name: g.name,
      targetAmount: g.targetAmount,
      contributed: g.contributed,
      withdrawn: g.withdrawn,
      progress: g.progress,
      status: g.status,
    },
    rule: { id: r.id, isActive: r.isActive, amount: r.amount, name: r.name },
    scheduled: scheduled.map((s: Record<string, unknown>) => ({
      id: s.id,
      status: s.status,
      amount: s.amount,
      dueDate: s.dueDate,
    })),
    budget: (await api.get('/api/budgets/2026-10')).body.budget,
    bank: { isActive: bank.isActive, balance: bank.balance, name: bank.name },
    savings: { isActive: savings.isActive, balance: savings.balance },
    food: categories.find((c: { id: string }) => c.id === fa.cat.food),
    tags: (await api.get('/api/tags')).body.items,
    settings: (await api.get('/api/settings/financial')).body.settings,
    alerts: (await api.get('/api/alerts')).body.items,
    card: (await api.get(`/api/credit-cards/${deletedCard}`)).body.card.isActive,
    loan: (await api.get(`/api/debts/${deletedLoan}`)).body.debt.isActive,
    me: (await api.get('/api/auth/me')).body.user,
  };
}

/** Tras las llamadas de B, la información de A es idéntica a la inicial. */
async function expectVictimUntouched() {
  expect(await victimState()).toEqual(baseline);
}

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date(`${TODAY}T15:00:00Z`) }));

  a = await registerUser(app);
  fa = await setupFinances(a.api);
  goal = (
    await a.api.post('/api/goals', { name: 'Moto', targetAmount: 1_000_000, accountId: fa.savings })
  ).body.goal.id;
  await a.api.post(`/api/goals/${goal}/contributions`, {
    fromAccountId: fa.bank,
    amount: 200_000,
    date: TODAY,
  });
  rule = (
    await a.api.post('/api/recurring', {
      name: 'Arriendo',
      kind: 'EXPENSE',
      amount: 1_000_000,
      categoryId: fa.cat.food,
      accountId: fa.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-25',
    })
  ).body.rule.id;
  item = (
    await a.api.post('/api/scheduled', {
      kind: 'EXPENSE',
      name: 'SOAT',
      amount: 500_000,
      dueDate: '2026-10-28',
      categoryId: fa.cat.food,
      accountId: fa.bank,
    })
  ).body.item.id;
  // Control positivo de alertas: una obligación vencida seguro dispara una alerta para A.
  overdueItem = (
    await a.api.post('/api/scheduled', {
      kind: 'EXPENSE',
      name: 'Predial',
      amount: 300_000,
      dueDate: '2026-10-10',
      categoryId: fa.cat.food,
      accountId: fa.bank,
    })
  ).body.item.id;
  await a.api.put('/api/budgets/2026-10', {
    totalAmount: 900_000,
    lines: [{ categoryId: fa.cat.food, amount: 400_000 }],
  });
  await a.api.post('/api/transactions', {
    type: 'EXPENSE',
    amount: 1000,
    date: TODAY,
    accountId: fa.bank,
    categoryId: fa.cat.food,
    tags: ['privado'],
  });
  tag = (await a.api.get('/api/tags')).body.items[0].id;
  expect((await a.api.put('/api/settings/financial', A_SETTINGS)).status).toBe(200);

  // Una tarjeta y un préstamo de A, saldados y eliminados (con historial → borrado suave).
  deletedCard = (
    await a.api.post('/api/credit-cards', {
      name: 'Vieja',
      creditLimit: 1_000_000,
      statementDay: 10,
      paymentDueDay: 25,
    })
  ).body.card.id;
  await a.api.post(`/api/credit-cards/${deletedCard}/purchase`, {
    amount: 50_000,
    date: '2026-10-01',
    categoryId: fa.cat.food,
  });
  await a.api.post(`/api/credit-cards/${deletedCard}/payment`, {
    amount: 50_000,
    date: '2026-10-02',
    accountId: fa.bank,
  });
  expect((await a.api.del(`/api/credit-cards/${deletedCard}`)).body).toEqual({ deleted: 'soft' });
  deletedLoan = (
    await a.api.post('/api/debts', { name: 'Préstamo viejo', initialBalance: 100_000 })
  ).body.debt.id;
  await a.api.post(`/api/debts/${deletedLoan}/payments`, {
    accountId: fa.bank,
    principal: 100_000,
    date: '2026-10-03',
  });
  expect((await a.api.del(`/api/debts/${deletedLoan}`)).body).toEqual({ deleted: 'soft' });

  b = await registerUser(app);
  fb = await setupFinances(b.api);
  baseline = await victimState();
});

afterAll(async () => {
  await app.close();
});

describe('Fase 2: a user can never reach another user’s planning data', () => {
  it('sanity: A sees its own data, including the positive-control alert', () => {
    expect(baseline.goal.contributed).toBe(200_000);
    expect(baseline.settings).toEqual(A_SETTINGS);
    expect(baseline.card).toBe(false);
    expect(baseline.loan).toBe(false);
    expect(baseline.alerts.map((x: { key: string }) => x.key)).toContain(
      `obligation-overdue:${overdueItem}:2026-10-10`,
    );
  });

  it('goals: read, edit, delete, contribute and withdraw are 404; foreign accounts are 400', async () => {
    notFound(await b.api.get(`/api/goals/${goal}`));
    notFound(await b.api.put(`/api/goals/${goal}`, { name: 'X', targetAmount: 1 }));
    notFound(await b.api.del(`/api/goals/${goal}`));
    notFound(
      await b.api.post(`/api/goals/${goal}/contributions`, {
        fromAccountId: fb.bank,
        amount: 1,
        date: TODAY,
      }),
    );
    notFound(
      await b.api.post(`/api/goals/${goal}/withdrawals`, {
        toAccountId: fb.bank,
        amount: 1,
        date: TODAY,
      }),
    );
    invalidRef(
      await b.api.post('/api/goals', { name: 'X', targetAmount: 1, accountId: fa.savings }),
    );
    expect((await b.api.get('/api/goals')).body.items).toEqual([]);

    // Con una meta propia de B, las cuentas de A siguen siendo referencias inválidas.
    const own = (
      await b.api.post('/api/goals', { name: 'Mía', targetAmount: 500_000, accountId: fb.savings })
    ).body.goal.id as string;
    expect(
      (
        await b.api.post(`/api/goals/${own}/contributions`, {
          fromAccountId: fb.bank,
          amount: 10_000,
          date: TODAY,
        })
      ).status,
    ).toBe(201);
    invalidRef(
      await b.api.post(`/api/goals/${own}/contributions`, {
        fromAccountId: fa.bank,
        amount: 1,
        date: TODAY,
      }),
    );
    invalidRef(
      await b.api.post(`/api/goals/${own}/withdrawals`, {
        toAccountId: fa.bank,
        amount: 1,
        date: TODAY,
      }),
    );
    invalidRef(await b.api.put(`/api/goals/${own}`, { accountId: fa.savings }));
    await expectVictimUntouched();
  });

  it('recurring: read, edit (pause/resume), delete are 404; foreign references are 400', async () => {
    notFound(await b.api.get(`/api/recurring/${rule}`));
    // El cuerpo es válido y solo usa referencias de B: lo único ajeno es el id de la regla.
    const full = {
      name: 'Arriendo',
      kind: 'EXPENSE',
      amount: 1,
      categoryId: fb.cat.food,
      accountId: fb.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-25',
    };
    notFound(await b.api.put(`/api/recurring/${rule}`, { ...full, isActive: false }));
    notFound(await b.api.put(`/api/recurring/${rule}`, { ...full, isActive: true }));
    notFound(await b.api.del(`/api/recurring/${rule}`));
    const base = { name: 'X', kind: 'EXPENSE', amount: 1, frequency: 'WEEKLY', startDate: TODAY };
    invalidRef(
      await b.api.post('/api/recurring', { ...base, categoryId: fb.cat.food, accountId: fa.bank }),
    );
    // La categoría ajena, por sí sola, provoca el 400 (la cuenta es de B).
    invalidRef(
      await b.api.post('/api/recurring', { ...base, categoryId: fa.cat.food, accountId: fb.bank }),
    );
    invalidRef(
      await b.api.post('/api/recurring', {
        ...base,
        categoryId: fb.cat.food,
        creditCardId: fa.card,
      }),
    );
    expect((await b.api.get('/api/recurring')).body.items).toEqual([]);
    await expectVictimUntouched();
  });

  it('scheduled: read, edit, complete, skip, delete are 404; suggestions and foreign refs are isolated', async () => {
    notFound(await b.api.put(`/api/scheduled/${item}`, { amount: 1 }));
    notFound(await b.api.post(`/api/scheduled/${item}/complete`, {}));
    notFound(await b.api.post(`/api/scheduled/${item}/skip`));
    notFound(await b.api.del(`/api/scheduled/${item}`));
    const base = { kind: 'EXPENSE', name: 'X', amount: 1, dueDate: '2026-10-30' };
    invalidRef(
      await b.api.post('/api/scheduled', { ...base, categoryId: fa.cat.food, accountId: fb.bank }),
    );
    invalidRef(
      await b.api.post('/api/scheduled', { ...base, categoryId: fb.cat.food, accountId: fa.bank }),
    );
    invalidRef(
      await b.api.post('/api/scheduled', {
        ...base,
        categoryId: fb.cat.food,
        creditCardId: fa.card,
      }),
    );
    invalidRef(
      await b.api.post('/api/transactions', {
        type: 'EXPENSE',
        amount: 1,
        date: TODAY,
        accountId: fb.bank,
        categoryId: fb.cat.food,
        scheduledItemId: item,
      }),
    );
    expect((await b.api.get('/api/scheduled?status=PENDING,DONE,SKIPPED')).body.items).toEqual([]);
    // La consulta es la que casaría con la obligación de A (misma categoría, monto y fecha): B no la ve.
    const own = (
      await a.api.get(
        `/api/scheduled/suggestions?kind=EXPENSE&categoryId=${fa.cat.food}&amount=500000&date=2026-10-28`,
      )
    ).body.items;
    expect(own.map((s: { id: string }) => s.id)).toContain(item);
    const foreign = await b.api.get(
      `/api/scheduled/suggestions?kind=EXPENSE&categoryId=${fa.cat.food}&amount=500000&date=2026-10-28`,
    );
    expect(foreign.body.items ?? []).toEqual([]);
    const sameForB = await b.api.get(
      `/api/scheduled/suggestions?kind=EXPENSE&categoryId=${fb.cat.food}&amount=500000&date=2026-10-28`,
    );
    expect(sameForB.body.items).toEqual([]);
    await expectVictimUntouched();
  });

  it('settings and budgets: B sees its own defaults and cannot change or clear A’s', async () => {
    const mine = (await b.api.get('/api/settings/financial')).body.settings;
    expect(mine).not.toEqual(A_SETTINGS);
    expect(mine.lowBalanceThreshold).not.toBe(A_SETTINGS.lowBalanceThreshold);
    expect(
      (
        await b.api.put('/api/settings/financial', {
          obligationsPct: 50,
          savingsPct: 20,
          investmentPct: 10,
          leisurePct: 10,
          otherPct: 10,
          monthlyIncomeEstimate: null,
          lowBalanceThreshold: 1,
        })
      ).status,
    ).toBe(200);
    expect((await b.api.get('/api/budgets/2026-10')).body.budget.total).toBeNull();
    invalidRef(
      await b.api.put('/api/budgets/2026-10', {
        totalAmount: null,
        lines: [{ categoryId: fa.cat.food, amount: 1 }],
      }),
    );
    expect((await b.api.del('/api/budgets/2026-10')).status).toBe(204);
    expect((await b.api.get('/api/budgets/2026-10')).body.budget.total).toBeNull();
    const dash = (await b.api.get('/api/dashboard')).body;
    expect(dash.goals.every((x: { name: string }) => x.name !== 'Moto')).toBe(true);
    expect(dash.budget).toBeNull();
    await expectVictimUntouched();
    expect((await a.api.get('/api/budgets/2026-10')).body.budget.total.budget).toBe(900_000);
  });

  it('alerts: B neither sees A’s alerts nor can dismiss or restore them', async () => {
    const keyA = `obligation-overdue:${overdueItem}:2026-10-10`;
    const keysOf = async (c: User) =>
      (await c.api.get('/api/alerts')).body.items.map((x: { key: string }) => x.key) as string[];
    expect(await keysOf(a)).toContain(keyA);
    const bKeys = (await keysOf(b)).join(' ');
    for (const id of [item, overdueItem, rule, goal, fa.bank, fa.card, fa.cat.food])
      expect(bKeys).not.toContain(id);

    expect((await b.api.post(`/api/alerts/${encodeURIComponent(keyA)}/dismiss`)).status).toBe(204);
    expect(await keysOf(a)).toContain(keyA);

    // A descarta su alerta; el DELETE de B no la restaura.
    expect((await a.api.post(`/api/alerts/${encodeURIComponent(keyA)}/dismiss`)).status).toBe(204);
    expect(await keysOf(a)).not.toContain(keyA);
    expect((await b.api.del('/api/alerts/dismissed')).status).toBe(204);
    expect(await keysOf(a)).not.toContain(keyA);
    // El descarte de A es solo de A: A restaura lo suyo y vuelve el estado inicial.
    expect((await a.api.del('/api/alerts/dismissed')).status).toBe(204);
    expect(await keysOf(a)).toContain(keyA);
    await expectVictimUntouched();
  });

  it('restore and adjust: another user’s accounts, categories, cards and loans are 404', async () => {
    notFound(await b.api.post(`/api/accounts/${fa.bank}/restore`));
    notFound(await b.api.post(`/api/accounts/${fa.bank}/adjust`, { actualBalance: 0 }));
    notFound(await b.api.post(`/api/categories/${fa.cat.food}/restore`));
    notFound(await b.api.post(`/api/credit-cards/${deletedCard}/restore`));
    notFound(await b.api.post(`/api/debts/${deletedLoan}/restore`));
    await expectVictimUntouched();
    expect((await a.api.get(`/api/credit-cards/${deletedCard}`)).body.card.isActive).toBe(false);
    expect((await a.api.get(`/api/debts/${deletedLoan}`)).body.debt.isActive).toBe(false);
  });

  it('tags and me: B cannot rename A’s tag, take A’s email, and deleting B leaves A intact', async () => {
    notFound(await b.api.put(`/api/tags/${tag}`, { name: 'hack' }));
    notFound(await b.api.del(`/api/tags/${tag}`));
    expect((await b.api.get('/api/tags')).body.items).toEqual([]);

    const taken = await b.api.patch('/api/me', { email: a.email, currentPassword: b.password });
    expectError(taken, 409, 'EMAIL_TAKEN');
    const login = await client(app).post('/api/auth/login', {
      email: a.email,
      password: a.password,
    });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe(a.email);
    await expectVictimUntouched();

    // Lo último: B elimina su cuenta y todo lo de A sigue igual.
    const gone = await b.api.del('/api/me', { password: b.password, confirmation: 'ELIMINAR' });
    expect(gone.status).toBe(204);
    expect((await b.api.get('/api/auth/me')).status).toBe(401);
    await expectVictimUntouched();
    expect((await a.api.get(`/api/goals/${goal}`)).status).toBe(200);
    expect((await a.api.get(`/api/recurring/${rule}`)).status).toBe(200);
    expect((await a.api.get(`/api/accounts/${fa.bank}`)).status).toBe(200);
  });
});
