import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { client, createTestApp, registerUser } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await createTestApp());
});

afterAll(async () => {
  await app.close();
});

describe('register', () => {
  it('creates the user, opens a session and seeds defaults', async () => {
    const email = `${randomUUID()}@Test.Local`;
    const res = await client(app).post('/api/auth/register', {
      name: 'Cristian',
      email,
      password: 'clave-segura-123',
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      name: 'Cristian',
      email: email.toLowerCase(),
      timezone: 'America/Bogota',
    });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = res.cookies.find((c) => c.name === 'fz_session');
    expect(cookie?.value).toBeTruthy();

    const userId = res.body.user.id as string;
    const categories = await app.prisma.category.findMany({ where: { userId } });
    expect(categories.map((c) => c.name)).toContain('Intereses y comisiones');
    expect(categories.some((c) => c.name === 'Ahorro/Inversión' || c.name === 'Deudas')).toBe(
      false,
    );
    expect(await app.prisma.financialConfiguration.count({ where: { userId } })).toBe(1);
  });

  it('rejects duplicate emails and weak passwords', async () => {
    const { email } = await registerUser(app);
    const dup = await client(app).post('/api/auth/register', {
      name: 'X',
      email,
      password: 'clave-segura-123',
    });
    expect(dup.status).toBe(409);
    const weak = await client(app).post('/api/auth/register', {
      name: 'X',
      email: `${randomUUID()}@t.co`,
      password: 'corta',
    });
    expect(weak.status).toBe(400);
    expect(weak.body.error.fields.password).toBeTypeOf('string');
  });

  it('is closed when ALLOW_REGISTRATION=false', async () => {
    const { app: closed } = await createTestApp({ ALLOW_REGISTRATION: 'false' });
    const res = await client(closed).post('/api/auth/register', {
      name: 'X',
      email: `${randomUUID()}@t.co`,
      password: 'clave-segura-123',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('REGISTRATION_CLOSED');
    await closed.close();
  });
});

describe('login, me and logout', () => {
  it('logs in with valid credentials and returns the user from /me', async () => {
    const { email, password } = await registerUser(app);
    const login = await client(app).post('/api/auth/login', {
      email: email.toUpperCase(),
      password,
    });
    expect(login.status).toBe(200);
    const cookie = login.cookies.find((c) => c.name === 'fz_session')!.value;
    const me = await client(app, cookie).get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });

  it('uses the same generic error for unknown email and wrong password', async () => {
    const { email } = await registerUser(app);
    const wrong = await client(app).post('/api/auth/login', { email, password: 'incorrecta-123' });
    const unknown = await client(app).post('/api/auth/login', {
      email: `${randomUUID()}@t.co`,
      password: 'incorrecta-123',
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
  });

  it('logout revokes the session', async () => {
    const { api } = await registerUser(app);
    expect((await api.post('/api/auth/logout')).status).toBe(204);
    const me = await api.get('/api/auth/me');
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('requires a session for protected routes', async () => {
    const res = await client(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects expired sessions', async () => {
    const { api, user } = await registerUser(app);
    await app.prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await api.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
    expect(await app.prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('renews an idle session (sliding expiration)', async () => {
    const { api, user } = await registerUser(app);
    const old = new Date(Date.now() - 2 * 3600_000);
    await app.prisma.session.updateMany({
      where: { userId: user.id },
      data: { lastUsedAt: old, expiresAt: new Date(Date.now() + 3600_000) },
    });
    expect((await api.get('/api/auth/me')).status).toBe(200);
    const s = await app.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it('rate-limits repeated failed logins per IP and email', async () => {
    const { app: strict } = await createTestApp({ LOGIN_MAX_ATTEMPTS: '2' });
    const { email, password } = await registerUser(strict);
    const c = client(strict);
    await c.post('/api/auth/login', { email, password: 'mala-clave-1' });
    await c.post('/api/auth/login', { email, password: 'mala-clave-2' });
    const blocked = await c.post('/api/auth/login', { email, password });
    expect(blocked.status).toBe(429);
    await strict.close();
  });
});
