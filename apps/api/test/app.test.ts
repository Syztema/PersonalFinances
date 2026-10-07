import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config/env';
import { AppError } from '../src/lib/errors';
import { MemoryMailer } from '../src/lib/mailer';
import { parse } from '../src/lib/validation';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(loadConfig(), { mailer: new MemoryMailer() });
  app.post('/api/test/echo', async (req) =>
    parse(z.strictObject({ amount: z.number().int() }), req.body),
  );
  app.get('/api/test/app-error', async () => {
    throw new AppError(409, 'SOMETHING', 'Algo en conflicto.');
  });
  app.get('/api/test/crash', async () => {
    throw new Error('secret internal detail');
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('app skeleton', () => {
  it('reports health with database access', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('formats validation errors with field messages', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/test/echo',
      payload: { amount: 'x' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(res.json().error.fields.amount).toBeTypeOf('string');
  });

  it('formats AppError and hides internal errors', async () => {
    const conflict = await app.inject({ method: 'GET', url: '/api/test/app-error' });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({
      error: { code: 'SOMETHING', message: 'Algo en conflicto.' },
    });

    const crash = await app.inject({ method: 'GET', url: '/api/test/crash' });
    expect(crash.statusCode).toBe(500);
    expect(crash.body).not.toContain('secret');
    expect(crash.json().error.code).toBe('INTERNAL');
  });

  it('rejects mutating requests from foreign origins', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/test/echo',
      payload: { amount: 1 },
      headers: { origin: 'https://evil.example.com' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ORIGIN_NOT_ALLOWED');

    const ok = await app.inject({
      method: 'POST',
      url: '/api/test/echo',
      payload: { amount: 1 },
      headers: { origin: 'http://localhost:5173' },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('rejects text/plain bodies (CSRF simple requests)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/test/echo',
      payload: '{"amount":1}',
      headers: { 'content-type': 'text/plain' },
    });
    expect(res.statusCode).toBe(415);
  });

  it('sets security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('rate limiting', () => {
  it('returns a 429 with the standard error shape', async () => {
    const limited = await buildApp(loadConfig({ ...process.env, RATE_LIMIT_MAX: '1' }), {
      mailer: new MemoryMailer(),
    });
    limited.get('/api/test/limited', async () => ({ ok: true }));
    await limited.ready();
    try {
      expect((await limited.inject({ method: 'GET', url: '/api/test/limited' })).statusCode).toBe(
        200,
      );
      const res = await limited.inject({ method: 'GET', url: '/api/test/limited' });
      expect(res.statusCode).toBe(429);
      expect(res.json()).toEqual({
        error: {
          code: 'RATE_LIMITED',
          message: 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
        },
      });
    } finally {
      await limited.close();
    }
  });
});

describe('trust proxy hops', () => {
  async function ipFor(hops: string, xff: string, remoteAddress: string): Promise<string> {
    const a = await buildApp(loadConfig({ ...process.env, TRUST_PROXY_HOPS: hops }), {
      mailer: new MemoryMailer(),
    });
    a.get('/api/test/ip', async (req) => ({ ip: req.ip }));
    await a.ready();
    try {
      const res = await a.inject({
        method: 'GET',
        url: '/api/test/ip',
        remoteAddress,
        headers: { 'x-forwarded-for': xff },
      });
      return res.json().ip;
    } finally {
      await a.close();
    }
  }

  it('with 2 hops ignores spoofed leftmost entries', async () => {
    expect(await ipFor('2', '1.2.3.4, 203.0.113.9, 10.0.0.2', '10.0.0.3')).toBe('203.0.113.9');
  });

  it('with 1 hop takes the last forwarded entry', async () => {
    expect(await ipFor('1', '1.2.3.4, 203.0.113.9', '10.0.0.3')).toBe('203.0.113.9');
  });
});
