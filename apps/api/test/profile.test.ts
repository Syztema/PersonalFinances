import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { MemoryMailer } from '../src/lib/mailer';
import { setupFinances } from './finance-fixtures';
import { client, createTestApp, registerUser, SESSION_COOKIE } from './helpers';

let app: FastifyInstance;
let mailer: MemoryMailer;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app, mailer } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

describe('profile (addendum §4 and §5)', () => {
  it('new users start with the dark theme and can change it', async () => {
    const { api } = await registerUser(app);
    expect((await api.get('/api/auth/me')).body.user.theme).toBe('DARK');
    expect((await api.patch('/api/me', { theme: 'LIGHT' })).body.user.theme).toBe('LIGHT');
  });

  it('changes the email only with the current password', async () => {
    const { api, password } = await registerUser(app);
    const other = await registerUser(app);
    const noPassword = await api.patch('/api/me', { email: 'nuevo@correo.co' });
    expect(noPassword.status).toBe(400);
    expect(noPassword.body.error.code).toBe('PASSWORD_REQUIRED');
    const wrong = await api.patch('/api/me', {
      email: 'nuevo@correo.co',
      currentPassword: 'otra-clave-000',
    });
    expect(wrong.body.error.code).toBe('INVALID_PASSWORD');
    const taken = await api.patch('/api/me', { email: other.email, currentPassword: password });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('EMAIL_TAKEN');

    const email = `${randomUUID()}@Correo.CO`;
    const ok = await api.patch('/api/me', { email, currentPassword: password });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(email.toLowerCase());
    const login = await client(app).post('/api/auth/login', { email, password });
    expect(login.status).toBe(200);
  });

  it('changing the email closes the other sessions and the pending reset links (review M7)', async () => {
    const { api, email, password } = await registerUser(app);
    const login = await client(app).post('/api/auth/login', { email, password });
    const other = client(app, login.cookies.find((c) => c.name === SESSION_COOKIE)!.value);
    await client(app).post('/api/auth/forgot-password', { email });
    const token = /#token=([A-Za-z0-9_-]+)/.exec(mailer.messages.at(-1)!.text)![1]!;

    // Cambiar solo el tema no cierra nada.
    expect((await api.patch('/api/me', { theme: 'LIGHT' })).status).toBe(200);
    expect((await other.get('/api/auth/me')).status).toBe(200);

    const ok = await api.patch('/api/me', {
      email: `${randomUUID()}@correo.co`,
      currentPassword: password,
    });
    expect(ok.status).toBe(200);
    expect((await api.get('/api/auth/me')).status).toBe(200);
    expect((await other.get('/api/auth/me')).status).toBe(401);
    const reset = await client(app).post('/api/auth/reset-password', {
      token,
      password: 'otra-clave-789',
    });
    expect(reset.status).toBe(400);
    expect(reset.body.error.code).toBe('INVALID_TOKEN');
  });

  it('renames tags and keeps them unique', async () => {
    const { api } = await registerUser(app);
    const f = await setupFinances(api);
    const tx = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
      tags: ['viaje', 'trabajo'],
    });
    const tags = (await api.get('/api/tags')).body.items as Array<{ id: string; name: string }>;
    const viaje = tags.find((t) => t.name === 'viaje')!;
    const renamed = await api.put(`/api/tags/${viaje.id}`, { name: 'Vacaciones' });
    expect(renamed.body.tag).toMatchObject({ name: 'vacaciones', usageCount: 1 });
    expect((await api.put(`/api/tags/${viaje.id}`, { name: 'trabajo' })).status).toBe(409);
    const read = await api.get(`/api/transactions/${tx.body.transaction.id}`);
    expect(read.body.transaction.tags).toEqual(['trabajo', 'vacaciones']);
  });
});

describe('DELETE /api/me (review focus #5)', () => {
  it('deletes the user and absolutely everything they own, and nothing else', async () => {
    const { api, password, user } = await registerUser(app);
    const f = await setupFinances(api);
    const keep = await registerUser(app);
    const keepFinances = await setupFinances(keep.api);

    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 50_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
      tags: ['casa'],
    });
    await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 300_000,
      interest: 50_000,
      date: TODAY,
    });
    const goal = (
      await api.post('/api/goals', { name: 'Viaje', targetAmount: 1_000_000, accountId: f.savings })
    ).body.goal;
    await api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.bank,
      amount: 100_000,
      date: TODAY,
    });
    await api.post('/api/recurring', {
      name: 'Internet',
      kind: 'EXPENSE',
      amount: 90_000,
      categoryId: f.cat.food,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-25',
    });
    const item = (
      (await api.get('/api/scheduled')).body.items as Array<{ id: string; name: string }>
    ).find((i) => i.name === 'Internet')!;
    await api.post(`/api/scheduled/${item.id}/complete`, {});
    await api.put('/api/budgets/2026-10', {
      totalAmount: 1_000_000,
      lines: [{ categoryId: f.cat.food, amount: 500_000 }],
    });
    await api.post('/api/alerts/budget:2026-10:total:50/dismiss');

    expect(
      (await api.del('/api/me', { password: 'otra-clave-000', confirmation: 'ELIMINAR' })).status,
    ).toBe(400);
    expect((await api.del('/api/me', { password, confirmation: 'eliminar' })).status).toBe(400);
    const res = await api.del('/api/me', { password, confirmation: 'ELIMINAR' });
    expect(res.status).toBe(204);
    expect(res.cookies.find((c) => c.name === 'fz_session')?.value).toBe('');
    expect((await api.get('/api/auth/me')).status).toBe(401);

    const userId = user.id;
    const p = app.prisma;
    const counts = await Promise.all([
      p.user.count({ where: { id: userId } }),
      p.session.count({ where: { userId } }),
      p.financialConfiguration.count({ where: { userId } }),
      p.account.count({ where: { userId } }),
      p.creditCard.count({ where: { userId } }),
      p.debt.count({ where: { userId } }),
      p.category.count({ where: { userId } }),
      p.tag.count({ where: { userId } }),
      p.transaction.count({ where: { userId } }),
      p.transactionTag.count({ where: { userId } }),
      p.budget.count({ where: { userId } }),
      p.budgetCategory.count({ where: { userId } }),
      p.goal.count({ where: { userId } }),
      p.recurringRule.count({ where: { userId } }),
      p.scheduledItem.count({ where: { userId } }),
      p.dismissedAlert.count({ where: { userId } }),
    ]);
    expect(counts.every((c) => c === 0)).toBe(true);
    expect((await keep.api.get(`/api/accounts/${keepFinances.bank}`)).body.account.balance).toBe(
      2_000_000,
    );
  });
});

describe('attempt limit on the routes that check the password (review I3)', () => {
  const WRONG = 'otra-clave-000';
  const TOO_MANY = {
    error: {
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.',
    },
  };

  it('PATCH /api/me blocks the email change after 5 wrong passwords, even with the right one', async () => {
    const { api, email, password } = await registerUser(app);
    const change = (currentPassword: string) =>
      api.patch('/api/me', { email: `${randomUUID()}@correo.co`, currentPassword });
    for (let i = 0; i < 5; i++) {
      expect((await change(WRONG)).body.error.code).toBe('INVALID_PASSWORD');
    }
    const blocked = await change(WRONG);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual(TOO_MANY);
    expect((await change(password)).status).toBe(429);
    expect((await api.get('/api/auth/me')).body.user.email).toBe(email);
    // Sin cambio de email no se pide la contraseña: el resto del perfil sigue disponible.
    expect((await api.patch('/api/me', { theme: 'LIGHT' })).status).toBe(200);
  });

  it('DELETE /api/me keeps the account after 5 wrong passwords, even with the right one', async () => {
    const { api, password } = await registerUser(app);
    const remove = (pw: string) => api.del('/api/me', { password: pw, confirmation: 'ELIMINAR' });
    for (let i = 0; i < 5; i++) {
      expect((await remove(WRONG)).body.error.code).toBe('INVALID_PASSWORD');
    }
    const blocked = await remove(WRONG);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual(TOO_MANY);
    expect((await remove(password)).status).toBe(429);
    expect((await api.get('/api/auth/me')).status).toBe(200);
  });

  it('change-password blocks after 5 wrong passwords, even with the right one', async () => {
    const { api, email, password } = await registerUser(app);
    const changePw = (currentPassword: string) =>
      api.post('/api/auth/change-password', { currentPassword, newPassword: 'nueva-clave-456' });
    for (let i = 0; i < 5; i++) {
      expect((await changePw(WRONG)).body.error.code).toBe('INVALID_PASSWORD');
    }
    const blocked = await changePw(WRONG);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual(TOO_MANY);
    expect((await changePw(password)).status).toBe(429);
    expect((await client(app).post('/api/auth/login', { email, password })).status).toBe(200);
  });

  it('the three routes share one count per user and a right password resets it', async () => {
    const { api, password } = await registerUser(app);
    const other = await registerUser(app);
    const changeEmail = (currentPassword: string) =>
      api.patch('/api/me', { email: `${randomUUID()}@correo.co`, currentPassword });
    const remove = (pw: string) => api.del('/api/me', { password: pw, confirmation: 'ELIMINAR' });
    const changePw = (currentPassword: string) =>
      api.post('/api/auth/change-password', { currentPassword, newPassword: 'nueva-clave-456' });

    for (const attempt of [changeEmail, remove, changePw, changeEmail]) {
      expect((await attempt(WRONG)).status).toBe(400);
    }
    // Acertar reinicia la cuenta: vuelven a caber 5 fallos.
    expect((await changeEmail(password)).status).toBe(200);
    for (const attempt of [remove, changePw, changeEmail, remove, changePw]) {
      expect((await attempt(WRONG)).status).toBe(400);
    }
    expect((await changeEmail(WRONG)).status).toBe(429);
    expect((await remove(password)).status).toBe(429);
    expect((await changePw(password)).status).toBe(429);
    // La cuenta es por usuario: otro usuario no queda bloqueado.
    expect(
      (await other.api.del('/api/me', { password: WRONG, confirmation: 'ELIMINAR' })).status,
    ).toBe(400);
  });
});
