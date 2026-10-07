import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { todayIn } from '@finanzas/shared';
import { createTestApp, registerUser } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await createTestApp());
});

afterAll(async () => {
  await app.close();
});

describe('accounts', () => {
  it('creates, lists and reads an account with its balance', async () => {
    const { api } = await registerUser(app);
    const created = await api.post('/api/accounts', {
      name: 'Bancolombia',
      type: 'BANK',
      initialBalance: 2_000_000,
    });
    expect(created.status).toBe(201);
    expect(created.body.account).toMatchObject({
      name: 'Bancolombia',
      type: 'BANK',
      balance: 2_000_000,
      isActive: true,
      openingDate: todayIn('America/Bogota'),
    });

    const list = await api.get('/api/accounts');
    expect(list.body.items).toHaveLength(1);
    const one = await api.get(`/api/accounts/${created.body.account.id}`);
    expect(one.body.account.balance).toBe(2_000_000);
  });

  it('rejects duplicate names and invalid data', async () => {
    const { api } = await registerUser(app);
    await api.post('/api/accounts', { name: 'Nequi', type: 'DIGITAL_WALLET' });
    const dup = await api.post('/api/accounts', { name: 'Nequi', type: 'DIGITAL_WALLET' });
    expect(dup.status).toBe(409);
    const bad = await api.post('/api/accounts', { name: 'X', type: 'BANK', color: 'rojo' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.color).toBeTypeOf('string');
  });

  it('does not accept isActive in updates (DELETE and /restore manage it)', async () => {
    const { api } = await registerUser(app);
    const { body } = await api.post('/api/accounts', { name: 'Efectivo', type: 'CASH' });
    expect((await api.put(`/api/accounts/${body.account.id}`, { isActive: false })).status).toBe(
      400,
    );
  });

  it('deletes unused accounts and answers 404 for unknown or malformed ids', async () => {
    const { api } = await registerUser(app);
    const { body } = await api.post('/api/accounts', { name: 'Daviplata', type: 'DIGITAL_WALLET' });
    expect((await api.del(`/api/accounts/${body.account.id}`)).status).toBe(200);
    expect((await api.get(`/api/accounts/${body.account.id}`)).status).toBe(404);
    expect((await api.get('/api/accounts/no-es-uuid')).status).toBe(404);
  });
});
