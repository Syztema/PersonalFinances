import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createPrisma } from '../src/lib/prisma';
import { client, createTestApp, registerUser } from './helpers';

const base = createPrisma(process.env.DATABASE_URL!);
let race: 'delete' | 'expire' | null = null;

/** Simula lo que pasa en otra petición justo entre la lectura de la sesión y su renovación. */
const racy = base.$extends({
  query: {
    session: {
      async updateMany({ args, query }) {
        const id = (args.where as { id: string }).id;
        if (race === 'delete') await base.session.deleteMany({ where: { id } });
        if (race === 'expire') {
          await base.session.updateMany({
            where: { id },
            data: { expiresAt: new Date(Date.now() - 1_000) },
          });
        }
        return query(args);
      },
    },
  },
}) as unknown as PrismaClient;

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await createTestApp({}, { prisma: racy }));
});

afterAll(async () => {
  await app.close();
  await base.$disconnect();
});

/** Sesión usada por última vez hace 2 horas: la próxima petición la renueva. */
async function staleSession() {
  const { cookie, user } = await registerUser(app);
  await base.session.updateMany({
    where: { userId: user.id },
    data: { lastUsedAt: new Date(Date.now() - 2 * 3_600_000) },
  });
  return client(app, cookie);
}

async function during<T>(what: 'delete' | 'expire', run: () => Promise<T>): Promise<T> {
  race = what;
  try {
    return await run();
  } finally {
    race = null;
  }
}

describe('session renewal (spec Fase 3 §8.6)', () => {
  it('answers 401 SESSION_EXPIRED, not 404, when a logout deletes the session mid-renewal', async () => {
    const api = await staleSession();
    const res = await during('delete', () => api.get('/api/auth/me'));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('never renews a session that expired between the read and the renewal', async () => {
    const api = await staleSession();
    const res = await during('expire', () => api.get('/api/auth/me'));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
    expect((await api.get('/api/auth/me')).status).toBe(401);
  });

  it('still renews a valid session and refreshes the cookie', async () => {
    const api = await staleSession();
    const res = await api.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.cookies.map((c) => c.name)).toContain('fz_session');
  });
});
