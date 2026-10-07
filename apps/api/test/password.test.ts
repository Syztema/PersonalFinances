import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { MemoryMailer } from '../src/lib/mailer';
import { client, createTestApp, registerUser } from './helpers';

let app: FastifyInstance;
let mailer: MemoryMailer;

beforeAll(async () => {
  ({ app, mailer } = await createTestApp());
});

afterAll(async () => {
  await app.close();
});

const tokenFromMail = (text: string) => /#token=([A-Za-z0-9_-]+)/.exec(text)![1]!;

describe('change password', () => {
  it('requires the current password and revokes other sessions', async () => {
    const { api, email, password } = await registerUser(app);
    const other = await client(app).post('/api/auth/login', { email, password });
    const otherCookie = other.cookies.find((c) => c.name === 'fz_session')!.value;

    const wrong = await api.post('/api/auth/change-password', {
      currentPassword: 'no-es-la-clave',
      newPassword: 'nueva-clave-456',
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('INVALID_PASSWORD');

    const ok = await api.post('/api/auth/change-password', {
      currentPassword: password,
      newPassword: 'nueva-clave-456',
    });
    expect(ok.status).toBe(204);
    expect((await api.get('/api/auth/me')).status).toBe(200);
    expect((await client(app, otherCookie).get('/api/auth/me')).status).toBe(401);
    expect((await client(app).post('/api/auth/login', { email, password })).status).toBe(401);
    expect(
      (await client(app).post('/api/auth/login', { email, password: 'nueva-clave-456' })).status,
    ).toBe(200);
  });
});

describe('forgot and reset password', () => {
  it('answers the same for unknown emails and sends no mail', async () => {
    const before = mailer.messages.length;
    const res = await client(app).post('/api/auth/forgot-password', {
      email: `${randomUUID()}@t.co`,
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Si el email existe/);
    expect(mailer.messages.length).toBe(before);
  });

  it('sends a one-time link that resets the password and closes all sessions', async () => {
    const { api, email } = await registerUser(app);
    const res = await client(app).post('/api/auth/forgot-password', { email });
    expect(res.status).toBe(200);
    const mail = mailer.messages.at(-1)!;
    expect(mail.to).toBe(email);
    expect(mail.text).toContain('http://localhost:5173/reset-password#token=');
    const token = tokenFromMail(mail.text);

    const reset = await client(app).post('/api/auth/reset-password', {
      token,
      password: 'otra-clave-789',
    });
    expect(reset.status).toBe(204);
    expect((await api.get('/api/auth/me')).status).toBe(401);
    expect(
      (await client(app).post('/api/auth/login', { email, password: 'otra-clave-789' })).status,
    ).toBe(200);

    const reuse = await client(app).post('/api/auth/reset-password', {
      token,
      password: 'otra-clave-000',
    });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects expired tokens', async () => {
    const { email, user } = await registerUser(app);
    await client(app).post('/api/auth/forgot-password', { email });
    const token = tokenFromMail(mailer.messages.at(-1)!.text);
    await app.prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await client(app).post('/api/auth/reset-password', {
      token,
      password: 'otra-clave-789',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('lets only one of two concurrent resets with the same token succeed', async () => {
    const { email } = await registerUser(app);
    await client(app).post('/api/auth/forgot-password', { email });
    const token = tokenFromMail(mailer.messages.at(-1)!.text);
    const results = await Promise.all([
      client(app).post('/api/auth/reset-password', { token, password: 'clave-uno-123' }),
      client(app).post('/api/auth/reset-password', { token, password: 'clave-dos-456' }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([204, 400]);
    expect(results.find((r) => r.status === 400)!.body.error.code).toBe('INVALID_TOKEN');
  });

  it('invalidates pending reset links when the password is changed', async () => {
    const { api, email, password } = await registerUser(app);
    await client(app).post('/api/auth/forgot-password', { email });
    const token = tokenFromMail(mailer.messages.at(-1)!.text);
    const ok = await api.post('/api/auth/change-password', {
      currentPassword: password,
      newPassword: 'nueva-clave-456',
    });
    expect(ok.status).toBe(204);
    const res = await client(app).post('/api/auth/reset-password', {
      token,
      password: 'otra-clave-789',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
});

describe('PATCH /api/me', () => {
  it('updates name and theme', async () => {
    const { api } = await registerUser(app);
    const res = await api.patch('/api/me', { name: 'Cristian', theme: 'DARK' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Cristian', theme: 'DARK' });
    expect((await api.patch('/api/me', { email: 'x@y.co' })).status).toBe(400);
  });
});
