import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, registerUser } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await createTestApp());
});

afterAll(async () => {
  await app.close();
});

type Cat = {
  id: string;
  name: string;
  kind: string;
  bucket: string | null;
  systemKey: string | null;
  isSystem: boolean;
};

describe('categories', () => {
  it('lists the defaults of a new user', async () => {
    const { api } = await registerUser(app);
    const { body } = await api.get('/api/categories');
    const items = body.items as Cat[];
    expect(items).toHaveLength(20);
    expect(items.find((c) => c.systemKey === 'INTEREST')?.name).toBe('Intereses y comisiones');
  });

  it('creates root and child categories with the right buckets', async () => {
    const { api } = await registerUser(app);
    const items = (await api.get('/api/categories')).body.items as Cat[];
    const food = items.find((c) => c.name === 'Alimentación')!;

    const root = await api.post('/api/categories', { name: 'Mascotas', kind: 'EXPENSE' });
    expect(root.status).toBe(201);
    expect(root.body.category.bucket).toBe('OTHER');

    const child = await api.post('/api/categories', {
      name: 'Restaurantes',
      kind: 'EXPENSE',
      parentId: food.id,
    });
    expect(child.body.category).toMatchObject({ parentId: food.id, bucket: 'OBLIGATIONS' });

    const grandChild = await api.post('/api/categories', {
      name: 'Sushi',
      kind: 'EXPENSE',
      parentId: child.body.category.id,
    });
    expect(grandChild.status).toBe(400);

    const salary = items.find((c) => c.name === 'Salario')!;
    const mixed = await api.post('/api/categories', {
      name: 'Extra',
      kind: 'EXPENSE',
      parentId: salary.id,
    });
    expect(mixed.status).toBe(400);

    const dup = await api.post('/api/categories', { name: 'mascotas', kind: 'EXPENSE' });
    expect(dup.status).toBe(409);
    const otherKind = await api.post('/api/categories', { name: 'Mascotas', kind: 'INCOME' });
    expect(otherKind.status).toBe(201);
    expect(otherKind.body.category.bucket).toBeNull();
  });

  it('system categories are editable; unused categories are deleted with their subcategories', async () => {
    const { api } = await registerUser(app);
    const items = (await api.get('/api/categories')).body.items as Cat[];
    const adjustment = items.find((c) => c.systemKey === 'ADJUSTMENT_EXPENSE')!;
    const interest = items.find((c) => c.systemKey === 'INTEREST')!;
    const food = items.find((c) => c.name === 'Alimentación')!;

    expect((await api.put(`/api/categories/${adjustment.id}`, { name: 'Otro' })).status).toBe(200);
    expect((await api.put(`/api/categories/${interest.id}`, { name: 'Intereses' })).status).toBe(
      200,
    );

    const child = await api.post('/api/categories', {
      name: 'Domicilios',
      kind: 'EXPENSE',
      parentId: food.id,
    });
    expect((await api.del(`/api/categories/${food.id}`)).body).toEqual({ deleted: 'hard' });
    const after = (await api.get('/api/categories')).body.items as Cat[];
    expect(after.find((c) => c.id === child.body.category.id)).toBeUndefined();
  });

  it('lists tags (empty for a new user)', async () => {
    const { api } = await registerUser(app);
    expect((await api.get('/api/tags')).body.items).toEqual([]);
  });
});
