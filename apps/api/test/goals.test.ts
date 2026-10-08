import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../src/generated/prisma/client';
import { balanceOf, setupFinances } from './finance-fixtures';
import { createTestApp, registerUser, type Client } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

/**
 * Barrera determinista: una transacción cruda (el "mover") bloquea la fila, aplica `mutate` y espera;
 * la petición arranca y se espera a que Postgres la muestre bloqueada por el mover
 * (`pg_blocking_pids`). Luego se confirma el mover y se devuelve la respuesta.
 */
async function requestBlockedBy<T extends { status: number }>(
  mutate: (tx: Prisma.TransactionClient) => Promise<unknown>,
  start: () => Promise<T>,
  rowId: string,
  table: 'Goal' | 'Transaction' = 'Goal',
): Promise<T> {
  let release!: () => void;
  let ready!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const readyP = new Promise<void>((resolve) => (ready = resolve));
  let pid = 0;
  const mover = app.prisma.$transaction(
    async (tx) => {
      if (table === 'Goal') {
        await tx.$queryRaw`SELECT id FROM "Goal" WHERE id = ${rowId}::uuid FOR UPDATE`;
      } else {
        await tx.$queryRaw`SELECT id FROM "Transaction" WHERE id = ${rowId}::uuid FOR UPDATE`;
      }
      await mutate(tx);
      pid = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0]!.pid;
      ready();
      await held;
    },
    { timeout: 30_000 },
  );
  await Promise.race([readyP, mover]);
  const request = start();
  let settled = false;
  void request.then(
    () => (settled = true),
    () => (settled = true),
  );
  try {
    let waiting = 0;
    for (let i = 0; i < 200 && waiting === 0; i++) {
      const rows = await app.prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
      waiting = Number(rows[0]?.n ?? 0);
      if (waiting === 0) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(waiting).toBeGreaterThan(0);
    expect(settled).toBe(false);
  } finally {
    release();
    await mover;
  }
  return request;
}

async function newUser() {
  const { api } = await registerUser(app);
  const f = await setupFinances(api);
  const goal = (
    await api.post('/api/goals', {
      name: 'Comprar computador',
      targetAmount: 5_000_000,
      targetDate: '2027-06-30',
      accountId: f.savings,
      initialAmount: 1_000_000,
    })
  ).body.goal;
  return { api, f, goal };
}

describe('goals (spec 8.10)', () => {
  it('lives in a savings or investment account', async () => {
    const { api, f, goal } = await newUser();
    expect(goal).toMatchObject({
      progress: 1_000_000,
      pct: 0.2,
      status: 'ACTIVE',
      account: { id: f.savings },
    });
    const bad = await api.post('/api/goals', {
      name: 'Viaje',
      targetAmount: 1000,
      accountId: f.bank,
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.accountId).toBeTypeOf('string');
  });

  it('contributions and withdrawals are transfers, never expenses', async () => {
    const { api, f, goal } = await newUser();
    const add = await api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.bank,
      amount: 500_000,
      date: TODAY,
    });
    expect(add.status).toBe(201);
    expect(add.body.transaction).toMatchObject({
      type: 'TRANSFER',
      goalId: goal.id,
      description: 'Abono a Comprar computador',
    });
    const out = await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 100_000,
      date: TODAY,
    });
    expect(out.body.goal).toMatchObject({
      contributed: 500_000,
      withdrawn: 100_000,
      progress: 1_400_000,
      remaining: 3_600_000,
      monthlyNeeded: 450_000,
    });
    const d = (await api.get('/api/dashboard')).body;
    expect(d.thisMonth).toMatchObject({ expense: 0, income: 0, savings: 400_000 });
    expect(await balanceOf(api, f.bank)).toBe(1_600_000);
    const same = await api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.savings,
      amount: 1000,
      date: TODAY,
    });
    expect(same.status).toBe(400);
  });

  it('completes and reopens, but never archives', async () => {
    const { api, goal } = await newUser();
    expect((await api.put(`/api/goals/${goal.id}`, { status: 'COMPLETED' })).body.goal.status).toBe(
      'COMPLETED',
    );
    expect((await api.put(`/api/goals/${goal.id}`, { status: 'ACTIVE' })).body.goal.status).toBe(
      'ACTIVE',
    );
    expect((await api.put(`/api/goals/${goal.id}`, { status: 'ARCHIVED' })).status).toBe(400);
  });

  it('moves to another account only without movements (decision 5)', async () => {
    const { api, f, goal } = await newUser();
    const other = (await api.post('/api/accounts', { name: 'CDT', type: 'INVESTMENT' })).body
      .account.id;
    expect(
      (await api.put(`/api/goals/${goal.id}`, { accountId: other })).body.goal.account.id,
    ).toBe(other);
    await api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.bank,
      amount: 1000,
      date: TODAY,
    });
    const moved = await api.put(`/api/goals/${goal.id}`, { accountId: f.savings });
    expect(moved.status).toBe(409);
    expect(moved.body.error.code).toBe('GOAL_HAS_MOVEMENTS');
  });

  it('deleting a goal keeps its transfers as normal transfers; its account cannot be deleted before', async () => {
    const { api, f, goal } = await newUser();
    const add = await api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.bank,
      amount: 200_000,
      date: TODAY,
    });
    await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 200_000,
      date: TODAY,
    });
    const blocked = await api.del(`/api/accounts/${f.savings}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ACCOUNT_HAS_GOALS');

    expect((await api.del(`/api/goals/${goal.id}`)).status).toBe(204);
    const tx = (await api.get(`/api/transactions/${add.body.transaction.id}`)).body.transaction;
    expect(tx).toMatchObject({ type: 'TRANSFER', goalId: null });
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
    expect((await api.get('/api/goals')).body.items).toEqual([]);
  });
});

describe('goals fix round 1', () => {
  it('caps withdrawals to what the goal holds', async () => {
    const { api, f, goal } = await newUser();
    const over = await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 1_000_001,
      date: TODAY,
    });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('WITHDRAWAL_EXCEEDS_GOAL');
    expect(over.body.error.fields.amount).toBeTypeOf('string');
    const exact = await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 1_000_000,
      date: TODAY,
    });
    expect(exact.status).toBe(201);
    expect(exact.body.goal.progress).toBe(0);
  });

  it('isolates goals between users', async () => {
    const a = await newUser();
    const b = await newUser();
    const id = a.goal.id;
    expect((await b.api.get(`/api/goals/${id}`)).status).toBe(404);
    expect((await b.api.put(`/api/goals/${id}`, { name: 'x' })).status).toBe(404);
    expect((await b.api.del(`/api/goals/${id}`)).status).toBe(404);
    const c = { fromAccountId: b.f.bank, amount: 1000, date: TODAY };
    expect((await b.api.post(`/api/goals/${id}/contributions`, c)).status).toBe(404);
    const w = { toAccountId: b.f.bank, amount: 1000, date: TODAY };
    expect((await b.api.post(`/api/goals/${id}/withdrawals`, w)).status).toBe(404);
    expect((await a.api.get(`/api/goals/${id}`)).status).toBe(200);
  });

  it("rejects another user's accounts", async () => {
    const a = await newUser();
    const b = await newUser();
    const created = await a.api.post('/api/goals', {
      name: 'X',
      targetAmount: 1000,
      accountId: b.f.savings,
    });
    expect(created.status).toBe(400);
    expect(created.body.error.code).toBe('INVALID_REFERENCE');
    const add = await a.api.post(`/api/goals/${a.goal.id}/contributions`, {
      fromAccountId: b.f.bank,
      amount: 1000,
      date: TODAY,
    });
    expect(add.status).toBe(400);
    expect(add.body.error.code).toBe('INVALID_REFERENCE');
    const out = await a.api.post(`/api/goals/${a.goal.id}/withdrawals`, {
      toAccountId: b.f.bank,
      amount: 1000,
      date: TODAY,
    });
    expect(out.status).toBe(400);
    expect(out.body.error.code).toBe('INVALID_REFERENCE');
  });

  it('rejects non-savings and inactive accounts on update', async () => {
    const { api, f, goal } = await newUser();
    const bank = await api.put(`/api/goals/${goal.id}`, { accountId: f.bank });
    expect(bank.status).toBe(400);
    expect(bank.body.error.code).toBe('INVALID_REFERENCE');
    const old = (await api.post('/api/accounts', { name: 'Viejo', type: 'SAVINGS' })).body.account
      .id;
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 1000,
      date: TODAY,
      accountId: old,
      categoryId: f.cat.salary,
    });
    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: old,
      categoryId: f.cat.food,
    });
    expect((await api.del(`/api/accounts/${old}`)).body.deleted).toBe('soft');
    expect((await api.put(`/api/goals/${goal.id}`, { accountId: old })).status).toBe(400);
  });

  it('GOAL_HAS_MOVEMENTS also triggers after a withdrawal', async () => {
    const { api, f, goal } = await newUser();
    const other = (await api.post('/api/accounts', { name: 'CDT', type: 'INVESTMENT' })).body
      .account.id;
    await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 1000,
      date: TODAY,
    });
    const moved = await api.put(`/api/goals/${goal.id}`, { accountId: other });
    expect(moved.status).toBe(409);
    expect(moved.body.error.code).toBe('GOAL_HAS_MOVEMENTS');
  });
});

describe('goals never go below zero (spec Fase 3 §8.2)', () => {
  const NEGATIVE = {
    code: 'WITHDRAWAL_EXCEEDS_GOAL',
    message: 'Revisa los datos ingresados.',
    fields: { amount: 'No puedes retirar más de lo ahorrado en esta meta' },
  };
  const progressOf = async (api: Client, id: string) =>
    (await api.get(`/api/goals/${id}`)).body.goal.progress as number;

  it('two simultaneous withdrawals cannot take more than the goal holds', async () => {
    const { api, f, goal } = await newUser(); // avance 1.000.000
    const body = { toAccountId: f.bank, amount: 600_000, date: TODAY };
    const results = await Promise.all([
      api.post(`/api/goals/${goal.id}/withdrawals`, body),
      api.post(`/api/goals/${goal.id}/withdrawals`, body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(results.find((r) => r.status === 400)!.body.error).toEqual(NEGATIVE);
    expect(await progressOf(api, goal.id)).toBe(400_000);
  });

  it('a contribution waits for a concurrent account change and never lands in the old account', async () => {
    const { api, f, goal } = await newUser();
    const other = (await api.post('/api/accounts', { name: 'CDT', type: 'INVESTMENT' })).body
      .account.id as string;
    const res = await requestBlockedBy(
      (tx) => tx.goal.update({ where: { id: goal.id }, data: { accountId: other } }),
      () =>
        api.post(`/api/goals/${goal.id}/contributions`, {
          fromAccountId: f.bank,
          amount: 100_000,
          date: TODAY,
        }),
      goal.id,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'INVALID_REFERENCE',
      message: 'Revisa las cuentas, tarjetas o categorías seleccionadas.',
      fields: { goalId: 'La transferencia debe entrar o salir de la cuenta de la meta' },
    });
    expect(await app.prisma.transaction.count({ where: { goalId: goal.id } })).toBe(0);
  });

  it.each(['delete', 'edit'] as const)(
    'a stale %s of a movement whose goal changed meanwhile answers 409 and leaves the new goal intact',
    async (kind) => {
      const { api, f } = await newUser();
      const goalB = (
        await api.post('/api/goals', {
          name: 'Viaje',
          targetAmount: 3_000_000,
          accountId: f.savings,
        })
      ).body.goal;
      const m = (
        await api.post('/api/transactions', {
          type: 'TRANSFER',
          amount: 500_000,
          date: TODAY,
          accountId: f.bank,
          toAccountId: f.savings,
          description: 'Traslado',
        })
      ).body.transaction;
      const res = await requestBlockedBy(
        (tx) => tx.transaction.update({ where: { id: m.id }, data: { goalId: goalB.id } }),
        () =>
          kind === 'delete'
            ? api.del(`/api/transactions/${m.id}`)
            : api.put(`/api/transactions/${m.id}`, {
                type: 'TRANSFER',
                amount: 100_000,
                date: TODAY,
                accountId: f.bank,
                toAccountId: f.savings,
                description: 'Traslado',
              }),
        m.id,
        'Transaction',
      );
      expect(res.status).toBe(409);
      expect(res.body.error).toEqual({
        code: 'CONFLICT_RETRY',
        message: 'Este movimiento cambió; vuelve a cargarlo.',
      });
      const row = await app.prisma.transaction.findUnique({ where: { id: m.id } });
      expect(row).toMatchObject({ goalId: goalB.id, amount: 500_000n });
      expect(await progressOf(api, goalB.id)).toBe(500_000);
    },
  );

  it('POST /transactions with a goal transfer that would leave it negative answers 400', async () => {
    const { api, f, goal } = await newUser(); // avance 1.000.000
    const over = await api.post('/api/transactions', {
      type: 'TRANSFER',
      amount: 1_000_001,
      date: TODAY,
      accountId: f.savings,
      toAccountId: f.bank,
      goalId: goal.id,
      description: 'Retiro',
    });
    expect(over.status).toBe(400);
    expect(over.body.error).toEqual(NEGATIVE);
    expect(await progressOf(api, goal.id)).toBe(1_000_000);
  });

  it('moving a goal transfer to another goal applies the rule to both goals', async () => {
    const { api, f, goal: a } = await newUser(); // A: inicial 1.000.000
    const b = (
      await api.post('/api/goals', { name: 'Viaje', targetAmount: 3_000_000, accountId: f.savings })
    ).body.goal;
    const add = (
      await api.post(`/api/goals/${a.id}/contributions`, {
        fromAccountId: f.bank,
        amount: 500_000,
        date: TODAY,
      })
    ).body.transaction;
    const move = (to: string) =>
      api.put(`/api/transactions/${add.id}`, {
        type: 'TRANSFER',
        amount: 500_000,
        date: TODAY,
        accountId: f.bank,
        toAccountId: f.savings,
        goalId: to,
        description: add.description,
      });
    await api.post(`/api/goals/${a.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 1_400_000,
      date: TODAY,
    }); // A: 100.000
    const blocked = await move(b.id); // A quedaría en -400.000
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toEqual(NEGATIVE);
    expect(await progressOf(api, a.id)).toBe(100_000);
    expect(await progressOf(api, b.id)).toBe(0);

    const { api: api2, f: f2, goal: a2 } = await newUser();
    const b2 = (
      await api2.post('/api/goals', {
        name: 'Viaje',
        targetAmount: 3_000_000,
        accountId: f2.savings,
      })
    ).body.goal;
    const add2 = (
      await api2.post(`/api/goals/${a2.id}/contributions`, {
        fromAccountId: f2.bank,
        amount: 500_000,
        date: TODAY,
      })
    ).body.transaction;
    const ok = await api2.put(`/api/transactions/${add2.id}`, {
      type: 'TRANSFER',
      amount: 500_000,
      date: TODAY,
      accountId: f2.bank,
      toAccountId: f2.savings,
      goalId: b2.id,
      description: add2.description,
    });
    expect(ok.status).toBe(200);
    expect(await progressOf(api2, a2.id)).toBe(1_000_000);
    expect(await progressOf(api2, b2.id)).toBe(500_000);
  });

  it("another user's goalId in /transactions answers 400 and leaves that goal untouched", async () => {
    const { api, f } = await newUser();
    const { api: otherApi, goal: theirs } = await newUser();
    const res = await api.post('/api/transactions', {
      type: 'TRANSFER',
      amount: 100_000,
      date: TODAY,
      accountId: f.bank,
      toAccountId: f.savings,
      goalId: theirs.id,
      description: 'Ajeno',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REFERENCE');
    expect(await progressOf(otherApi, theirs.id)).toBe(1_000_000);
  });

  it('editing a withdrawal above what the goal holds answers 400 on "amount"', async () => {
    const { api, f, goal } = await newUser(); // avance 1.000.000
    const out = (
      await api.post(`/api/goals/${goal.id}/withdrawals`, {
        toAccountId: f.bank,
        amount: 300_000,
        date: TODAY,
      })
    ).body.transaction;
    const edit = (amount: number) =>
      api.put(`/api/transactions/${out.id}`, {
        type: 'TRANSFER',
        amount,
        date: TODAY,
        accountId: f.savings,
        toAccountId: f.bank,
        goalId: goal.id,
        description: out.description,
      });
    const over = await edit(1_000_001);
    expect(over.status).toBe(400);
    expect(over.body.error).toEqual(NEGATIVE);
    expect(await progressOf(api, goal.id)).toBe(700_000);
    const exact = await edit(1_000_000);
    expect(exact.status).toBe(200);
    expect(await progressOf(api, goal.id)).toBe(0);
  });

  it('editing a contribution down cannot leave the goal negative', async () => {
    const { api, f, goal } = await newUser(); // avance 1.000.000
    const add = (
      await api.post(`/api/goals/${goal.id}/contributions`, {
        fromAccountId: f.bank,
        amount: 500_000,
        date: TODAY,
      })
    ).body.transaction;
    await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 1_400_000,
      date: TODAY,
    }); // avance 100.000
    const edit = (amount: number) =>
      api.put(`/api/transactions/${add.id}`, {
        type: 'TRANSFER',
        amount,
        date: TODAY,
        accountId: f.bank,
        toAccountId: f.savings,
        goalId: goal.id,
        description: add.description,
      });
    const under = await edit(300_000);
    expect(under.status).toBe(400);
    expect(under.body.error).toEqual(NEGATIVE);
    expect((await edit(400_000)).status).toBe(200);
    expect(await progressOf(api, goal.id)).toBe(0);
  });

  it('deleting a contribution that leaves the goal negative answers 409', async () => {
    const { api, f, goal } = await newUser(); // avance 1.000.000
    const add = (
      await api.post(`/api/goals/${goal.id}/contributions`, {
        fromAccountId: f.bank,
        amount: 500_000,
        date: TODAY,
      })
    ).body.transaction;
    const out = (
      await api.post(`/api/goals/${goal.id}/withdrawals`, {
        toAccountId: f.bank,
        amount: 1_400_000,
        date: TODAY,
      })
    ).body.transaction; // avance 100.000

    const blocked = await api.del(`/api/transactions/${add.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toEqual({
      code: 'GOAL_PROGRESS_NEGATIVE',
      message: 'Esta meta quedaría con saldo negativo; ajusta primero sus retiros.',
    });
    expect((await api.get(`/api/transactions/${add.id}`)).status).toBe(200);
    expect(await progressOf(api, goal.id)).toBe(100_000);

    // Primero el retiro y después el abono: ambos se pueden eliminar.
    expect((await api.del(`/api/transactions/${out.id}`)).status).toBe(204);
    expect(await progressOf(api, goal.id)).toBe(1_500_000);
    expect((await api.del(`/api/transactions/${add.id}`)).status).toBe(204);
    expect(await progressOf(api, goal.id)).toBe(1_000_000);
  });

  it('lowering the initial amount below the withdrawals answers 400 on "initialAmount"', async () => {
    const { api, f, goal } = await newUser(); // inicial 1.000.000
    await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 300_000,
      date: TODAY,
    }); // avance 700.000
    const low = await api.put(`/api/goals/${goal.id}`, { initialAmount: 200_000 });
    expect(low.status).toBe(400);
    expect(low.body.error).toEqual({
      code: 'WITHDRAWAL_EXCEEDS_GOAL',
      message: 'Revisa los datos ingresados.',
      fields: { initialAmount: 'La meta quedaría con saldo negativo' },
    });
    const ok = await api.put(`/api/goals/${goal.id}`, { initialAmount: 300_000 });
    expect(ok.status).toBe(200);
    expect(ok.body.goal.progress).toBe(0);
  });
});
