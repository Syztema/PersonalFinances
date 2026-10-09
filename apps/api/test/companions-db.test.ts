import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { toDbDate } from '../src/lib/db';
import { createPrisma } from '../src/lib/prisma';
import { createTestApp, registerUser } from './helpers';

const prisma = createPrisma(process.env.DATABASE_URL!);
let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await createTestApp());
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

/** Usuario creado directo en la base (sin opciones iniciales), con lo mínimo para un gasto. */
async function makeUser() {
  const user = await prisma.user.create({
    data: { name: 'Test', email: `${randomUUID()}@test.local`, passwordHash: 'x' },
  });
  const account = (name: string) =>
    prisma.account.create({
      data: {
        userId: user.id,
        name,
        type: 'BANK',
        openingDate: toDbDate('2026-10-01'),
        icon: 'wallet',
        color: '#123456',
      },
    });
  const bank = await account('Banco');
  const wallet = await account('Nequi');
  const food = await prisma.category.create({
    data: {
      userId: user.id,
      name: 'Comida',
      kind: 'EXPENSE',
      bucket: 'OBLIGATIONS',
      icon: 'x',
      color: '#123456',
    },
  });
  const salary = await prisma.category.create({
    data: { userId: user.id, name: 'Salario', kind: 'INCOME', icon: 'x', color: '#123456' },
  });
  const friends = await prisma.companion.create({
    data: { userId: user.id, name: 'Amigos', icon: 'users', color: '#c2410c' },
  });
  return { user, bank, wallet, food, salary, friends };
}

type U = Awaited<ReturnType<typeof makeUser>>;

const expense = (u: U, extra: Record<string, unknown> = {}) =>
  prisma.transaction.create({
    data: {
      userId: u.user.id,
      type: 'EXPENSE',
      amount: 10_000n,
      date: toDbDate('2026-10-05'),
      accountId: u.bank.id,
      categoryId: u.food.id,
      ...extra,
    },
  });

describe('Companion constraints (spec con quién §2.1)', () => {
  it('accepts an expense with an option of the same user', async () => {
    const a = await makeUser();
    await expect(expense(a, { companionId: a.friends.id })).resolves.toMatchObject({
      companionId: a.friends.id,
    });
  });

  it('rejects an option on an income, a transfer and an interest child', async () => {
    const a = await makeUser();
    const income = {
      userId: a.user.id,
      type: 'INCOME' as const,
      amount: 10_000n,
      date: toDbDate('2026-10-05'),
      accountId: a.bank.id,
      categoryId: a.salary.id,
    };
    const transfer = {
      userId: a.user.id,
      type: 'TRANSFER' as const,
      amount: 10_000n,
      date: toDbDate('2026-10-05'),
      accountId: a.bank.id,
      toAccountId: a.wallet.id,
    };
    // Control: sin compañía se aceptan; con compañía, el CHECK las rechaza.
    await expect(prisma.transaction.create({ data: income })).resolves.toBeTruthy();
    await expect(prisma.transaction.create({ data: transfer })).resolves.toBeTruthy();
    await expect(
      prisma.transaction.create({ data: { ...income, companionId: a.friends.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.transaction.create({ data: { ...transfer, companionId: a.friends.id } }),
    ).rejects.toThrow();
    const parent = await expense(a);
    await expect(expense(a, { parentId: parent.id })).resolves.toBeTruthy();
    await expect(expense(a, { parentId: parent.id, companionId: a.friends.id })).rejects.toThrow();
  });

  it("rejects a movement that points to another user's option", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await expect(expense(a, { companionId: b.friends.id })).rejects.toThrow();
  });

  it('keeps names unique per user, but two users can share one', async () => {
    const a = await makeUser();
    const b = await makeUser();
    expect(b.friends.name).toBe(a.friends.name);
    await expect(
      prisma.companion.create({
        data: { userId: a.user.id, name: 'Amigos', icon: 'users', color: '#c2410c' },
      }),
    ).rejects.toThrow();
  });
});

describe('Starting options (spec con quién §2.2)', () => {
  const STARTING = [
    { name: 'Solo', icon: 'user', color: '#475569', sortOrder: 0, isActive: true },
    { name: 'Pareja', icon: 'heart', color: '#be185d', sortOrder: 1, isActive: true },
    { name: 'Familia', icon: 'home', color: '#2563eb', sortOrder: 2, isActive: true },
    { name: 'Amigos', icon: 'users', color: '#c2410c', sortOrder: 3, isActive: true },
  ];
  const optionsOf = (userId: string) =>
    prisma.companion.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
      select: { name: true, icon: true, color: true, sortOrder: true, isActive: true },
    });

  it('creates the four options when someone signs up', async () => {
    const { user } = await registerUser(app);
    expect(await optionsOf(user.id)).toEqual(STARTING);
  });

  it('the migration adds them to existing users once, even if it runs again', async () => {
    const user = await prisma.user.create({
      data: { name: 'Antes', email: `${randomUUID()}@test.local`, passwordHash: 'x' },
    });
    const file = fileURLToPath(
      new URL('../prisma/migrations/20261008000200_con_quien/migration.sql', import.meta.url),
    );
    const sql = readFileSync(file, 'utf8');
    const backfill = sql.slice(sql.indexOf('INSERT INTO "Companion"'));
    // Solo para este usuario: no se tocan los datos de otros archivos de prueba.
    const scoped = backfill.replace(
      'FROM "User" u',
      `FROM "User" u WHERE u."id" = '${user.id}'::uuid`,
    );
    expect(scoped).not.toBe(backfill);
    await prisma.$executeRawUnsafe(scoped);
    await prisma.$executeRawUnsafe(scoped);
    expect(await optionsOf(user.id)).toEqual(STARTING);
  });
});
