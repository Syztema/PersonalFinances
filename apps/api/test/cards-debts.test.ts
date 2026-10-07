import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, registerUser } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  // Hoy fijo: 2026-10-20 en Bogotá.
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

const card = {
  name: 'Nu Crédito',
  issuer: 'Nu',
  creditLimit: 5_000_000,
  statementDay: 15,
  paymentDueDay: 30,
};

describe('credit cards', () => {
  it('computes debt, available credit and the payment due from the initial debt', async () => {
    const { api } = await registerUser(app);
    const res = await api.post('/api/credit-cards', { ...card, initialDebt: 800_000 });
    expect(res.status).toBe(201);
    expect(res.body.card).toMatchObject({
      openingDate: '2026-10-20',
      debt: 800_000,
      available: 4_200_000,
      utilization: 0.16,
      amountDue: 800_000,
      dueDate: '2026-10-30',
      isOverdue: false,
      lastCutoff: '2026-10-15',
      nextCutoff: '2026-11-15',
      committed: 800_000,
    });
    const list = await api.get('/api/credit-cards');
    expect(list.body.items).toHaveLength(1);
    const statement = await api.get(`/api/credit-cards/${res.body.card.id}/statement`);
    expect(statement.status).toBe(200);
    expect(statement.body.upcoming).toEqual([]);
  });

  it('validates input and unique names', async () => {
    const { api } = await registerUser(app);
    expect((await api.post('/api/credit-cards', { ...card, statementDay: 32 })).status).toBe(400);
    expect((await api.post('/api/credit-cards', card)).status).toBe(201);
    expect((await api.post('/api/credit-cards', card)).status).toBe(409);
  });

  it('archives only without debt and deletes only without movements', async () => {
    const { api } = await registerUser(app);
    const { body } = await api.post('/api/credit-cards', { ...card, initialDebt: 100_000 });
    const id = body.card.id;
    expect((await api.put(`/api/credit-cards/${id}`, { isActive: false })).status).toBe(409);
    const archived = await api.put(`/api/credit-cards/${id}`, { initialDebt: 0, isActive: false });
    expect(archived.status).toBe(200);
    expect(archived.body.card.isActive).toBe(false);
    expect((await api.del(`/api/credit-cards/${id}`)).status).toBe(204);
  });
});

describe('debts', () => {
  it('computes balance and the pending monthly installment', async () => {
    const { api } = await registerUser(app);
    const res = await api.post('/api/debts', {
      name: 'Libre inversión',
      lender: 'Bancolombia',
      initialBalance: 8_000_000,
      monthlyPayment: 450_000,
      paymentDay: 5,
    });
    expect(res.status).toBe(201);
    expect(res.body.debt).toMatchObject({
      balance: 8_000_000,
      installmentDue: 0,
      nextPaymentDate: '2026-11-05',
    });
  });

  it('records the money received as a disbursement, not as income', async () => {
    const { api } = await registerUser(app);
    const account = (
      await api.post('/api/accounts', {
        name: 'Bancolombia',
        type: 'BANK',
        initialBalance: 100_000,
      })
    ).body.account;
    const res = await api.post('/api/debts', {
      name: 'Crédito carro',
      initialBalance: 3_000_000,
      receivedInAccountId: account.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.debt).toMatchObject({ initialBalance: 0, balance: 3_000_000 });
    expect((await api.get(`/api/accounts/${account.id}`)).body.account.balance).toBe(3_100_000);
    const txs = await app.prisma.transaction.findMany({ where: { debtId: res.body.debt.id } });
    expect(txs.map((t) => t.type)).toEqual(['DEBT_DISBURSEMENT']);
  });

  it("rejects receiving the loan in another user's account", async () => {
    const owner = await registerUser(app);
    const intruder = await registerUser(app);
    const account = (
      await owner.api.post('/api/accounts', { name: 'Nequi', type: 'DIGITAL_WALLET' })
    ).body.account;
    const res = await intruder.api.post('/api/debts', {
      name: 'X',
      initialBalance: 1000,
      receivedInAccountId: account.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REFERENCE');
  });
});
