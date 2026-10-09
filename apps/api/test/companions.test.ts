import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { CompanionDTO } from '@finanzas/shared';
import { createTestApp, registerUser, type Client } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await createTestApp());
});

afterAll(async () => {
  await app.close();
});

const list = async (api: Client) =>
  (await api.get<{ items: CompanionDTO[] }>('/api/companions')).body.items;

/** Elimina lógicamente sin pasar por un gasto (la Tarea 3 cubre el camino real). */
const softDelete = (userId: string, id: string) =>
  app.prisma.companion.update({ where: { id_userId: { id, userId } }, data: { isActive: false } });

describe('GET/POST/PUT /api/companions (spec con quién §2.4)', () => {
  it('lists the four starting options, unused', async () => {
    const { api } = await registerUser(app);
    const items = await list(api);
    expect(items.map(({ id: _id, ...rest }) => rest)).toEqual([
      { name: 'Solo', icon: 'user', color: '#475569', isActive: true, sortOrder: 0, usageCount: 0 },
      {
        name: 'Pareja',
        icon: 'heart',
        color: '#be185d',
        isActive: true,
        sortOrder: 1,
        usageCount: 0,
      },
      {
        name: 'Familia',
        icon: 'home',
        color: '#2563eb',
        isActive: true,
        sortOrder: 2,
        usageCount: 0,
      },
      {
        name: 'Amigos',
        icon: 'users',
        color: '#c2410c',
        isActive: true,
        sortOrder: 3,
        usageCount: 0,
      },
    ]);
  });

  it('creates an option at the end of the list and edits it', async () => {
    const { api } = await registerUser(app);
    const created = await api.post('/api/companions', { name: '  Compañeros de trabajo ' });
    expect(created.status).toBe(201);
    expect(created.body.companion).toMatchObject({
      name: 'Compañeros de trabajo',
      icon: 'user',
      color: '#64748b',
      isActive: true,
      sortOrder: 4,
      usageCount: 0,
    });
    const id = created.body.companion.id as string;
    const edited = await api.put(`/api/companions/${id}`, {
      name: 'Trabajo',
      icon: 'briefcase',
      color: '#0f766e',
    });
    expect(edited.status).toBe(200);
    expect(edited.body.companion).toMatchObject({
      id,
      name: 'Trabajo',
      icon: 'briefcase',
      color: '#0f766e',
    });
    expect((await list(api)).map((c) => c.name)).toEqual([
      'Solo',
      'Pareja',
      'Familia',
      'Amigos',
      'Trabajo',
    ]);
  });

  it('refuses a repeated name, ignoring case, also against a deleted option', async () => {
    const { api, user } = await registerUser(app);
    const same = await api.post('/api/companions', { name: 'amigos' });
    expect(same.status).toBe(409);
    expect(same.body.error).toEqual({
      code: 'COMPANION_NAME_TAKEN',
      message: 'Ya tienes una opción con ese nombre.',
    });
    const solo = (await list(api)).find((c) => c.name === 'Solo')!;
    const rename = await api.put(`/api/companions/${solo.id}`, { name: 'PAREJA' });
    expect(rename.status).toBe(409);
    expect(rename.body.error.code).toBe('COMPANION_NAME_TAKEN');
    // Renombrarse a sí misma (otro uso de mayúsculas) sí se puede.
    expect((await api.put(`/api/companions/${solo.id}`, { name: 'SOLO' })).status).toBe(200);

    const neighbors = (await api.post('/api/companions', { name: 'Vecinos' })).body.companion;
    await softDelete(user.id, neighbors.id);
    const again = await api.post('/api/companions', { name: 'VECINOS' });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe(
      'Ya existe una opción eliminada con ese nombre; restáurala.',
    );
  });

  it('validates the name, the icon and the color', async () => {
    const { api } = await registerUser(app);
    const cases: Array<[unknown, string]> = [
      [{ name: '   ' }, 'name'],
      [{ name: 'x'.repeat(31) }, 'name'],
      [{ name: 'Ok', color: 'red' }, 'color'],
      [{ name: 'Ok', icon: '' }, 'icon'],
      [{ name: 'Ok', sortOrder: 2 }, 'sortOrder'],
    ];
    for (const [body, field] of cases) {
      const res = await api.post('/api/companions', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(res.body.error.fields)).toContain(field);
    }
  });
});

describe('DELETE and restore /api/companions/:id (spec con quién §2.3)', () => {
  it('deletes an unused option for good', async () => {
    const { api } = await registerUser(app);
    const id = (await api.post('/api/companions', { name: 'Primos' })).body.companion.id;
    const res = await api.del(`/api/companions/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 'hard' });
    expect((await list(api)).some((c) => c.id === id)).toBe(false);
    expect((await api.del(`/api/companions/${id}`)).status).toBe(404);
  });

  it('keeps a deleted option read-only until it is restored', async () => {
    const { api, user } = await registerUser(app);
    const pareja = (await list(api)).find((c) => c.name === 'Pareja')!;
    await softDelete(user.id, pareja.id);
    expect((await api.del(`/api/companions/${pareja.id}`)).body).toEqual({ deleted: 'soft' });
    const edit = await api.put(`/api/companions/${pareja.id}`, { color: '#0f766e' });
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe('ENTITY_DELETED');
    const restored = await api.post(`/api/companions/${pareja.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.companion).toMatchObject({ id: pareja.id, isActive: true });
    expect((await api.put(`/api/companions/${pareja.id}`, { color: '#0f766e' })).status).toBe(200);
  });
});

describe('isolation (spec con quién §2.4)', () => {
  it("never shows, edits, deletes or restores another user's options", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const theirs = (await list(a.api))[0]!;
    expect((await list(b.api)).some((c) => c.id === theirs.id)).toBe(false);
    expect((await b.api.put(`/api/companions/${theirs.id}`, { name: 'Mío' })).status).toBe(404);
    expect((await b.api.del(`/api/companions/${theirs.id}`)).status).toBe(404);
    expect((await b.api.post(`/api/companions/${theirs.id}/restore`)).status).toBe(404);
    expect((await list(a.api))[0]).toEqual(theirs);
  });

  it('answers 404 for a malformed id', async () => {
    const { api } = await registerUser(app);
    expect((await api.del('/api/companions/no-es-un-uuid')).status).toBe(404);
  });
});
