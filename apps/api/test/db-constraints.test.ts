import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../src/lib/prisma';
import { toDbDate } from '../src/lib/db';

const prisma = createPrisma(process.env.DATABASE_URL!);

async function makeUser() {
  const user = await prisma.user.create({
    data: { name: 'Test', email: `${randomUUID()}@test.local`, passwordHash: 'x' },
  });
  const account = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Bancolombia',
      type: 'BANK',
      openingDate: toDbDate('2026-10-01'),
      icon: 'wallet',
      color: '#123456',
    },
  });
  const category = await prisma.category.create({
    data: {
      userId: user.id,
      name: 'Comida',
      kind: 'EXPENSE',
      bucket: 'OBLIGATIONS',
      icon: 'x',
      color: '#123456',
    },
  });
  return { user, account, category };
}

let a: Awaited<ReturnType<typeof makeUser>>;
let b: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  a = await makeUser();
  b = await makeUser();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('database constraints', () => {
  it('accepts a well-formed expense', async () => {
    await expect(
      prisma.transaction.create({
        data: {
          userId: a.user.id,
          type: 'EXPENSE',
          amount: 25000n,
          date: toDbDate('2026-10-06'),
          accountId: a.account.id,
          categoryId: a.category.id,
        },
      }),
    ).resolves.toBeTruthy();
  });

  it('rejects a transfer that carries a category', async () => {
    const other = await prisma.account.create({
      data: {
        userId: a.user.id,
        name: 'Nequi',
        type: 'DIGITAL_WALLET',
        openingDate: toDbDate('2026-10-01'),
        icon: 'x',
        color: '#123456',
      },
    });
    await expect(
      prisma.transaction.create({
        data: {
          userId: a.user.id,
          type: 'TRANSFER',
          amount: 1000n,
          date: toDbDate('2026-10-06'),
          accountId: a.account.id,
          toAccountId: other.id,
          categoryId: a.category.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a card payment shaped as an expense (no card)', async () => {
    await expect(
      prisma.transaction.create({
        data: {
          userId: a.user.id,
          type: 'CARD_PAYMENT',
          amount: 1000n,
          date: toDbDate('2026-10-06'),
          accountId: a.account.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects zero amounts', async () => {
    await expect(
      prisma.transaction.create({
        data: {
          userId: a.user.id,
          type: 'EXPENSE',
          amount: 0n,
          date: toDbDate('2026-10-06'),
          accountId: a.account.id,
          categoryId: a.category.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a movement that points to another user's account", async () => {
    await expect(
      prisma.transaction.create({
        data: {
          userId: b.user.id,
          type: 'EXPENSE',
          amount: 1000n,
          date: toDbDate('2026-10-06'),
          accountId: a.account.id,
          categoryId: b.category.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects financial percentages that do not add up to 100', async () => {
    await expect(
      prisma.financialConfiguration.create({ data: { userId: a.user.id, savingsPct: 30 } }),
    ).rejects.toThrow();
  });

  it('deletes a user with all their data in cascade', async () => {
    const c = await makeUser();
    await prisma.transaction.create({
      data: {
        userId: c.user.id,
        type: 'EXPENSE',
        amount: 5000n,
        date: toDbDate('2026-10-06'),
        accountId: c.account.id,
        categoryId: c.category.id,
      },
    });
    await prisma.user.delete({ where: { id: c.user.id } });
    expect(await prisma.account.count({ where: { userId: c.user.id } })).toBe(0);
  });

  it('Fase 2: new users get the dark theme by default', async () => {
    const c = await makeUser();
    expect(c.user.theme).toBe('DARK');
  });

  it('Fase 2: an occurrence keeps its rule date while its due date moves', async () => {
    const rule = await prisma.recurringRule.create({
      data: {
        userId: a.user.id,
        name: 'Internet',
        kind: 'EXPENSE',
        amount: 90_000n,
        categoryId: a.category.id,
        accountId: a.account.id,
        frequency: 'MONTHLY',
        startDate: toDbDate('2026-10-10'),
        activeFrom: toDbDate('2026-10-10'),
      },
    });
    const item = (ruleDate: string, dueDate: string) =>
      prisma.scheduledItem.create({
        data: {
          userId: a.user.id,
          recurringRuleId: rule.id,
          kind: 'EXPENSE',
          name: 'Internet',
          amount: 90_000n,
          categoryId: a.category.id,
          accountId: a.account.id,
          ruleDate: toDbDate(ruleDate),
          dueDate: toDbDate(dueDate),
        },
      });
    await item('2026-10-10', '2026-11-10');
    // Misma fecha de vencimiento con otra fecha de regla: permitido.
    await expect(item('2026-11-10', '2026-11-10')).resolves.toBeTruthy();
    // Misma fecha de regla: rechazado (la regeneración no duplica).
    await expect(item('2026-10-10', '2026-10-12')).rejects.toThrow();
    // Ocurrencia de regla sin ruleDate: rechazada.
    await expect(
      prisma.scheduledItem.create({
        data: {
          userId: a.user.id,
          recurringRuleId: rule.id,
          kind: 'EXPENSE',
          name: 'Internet',
          amount: 90_000n,
          categoryId: a.category.id,
          accountId: a.account.id,
          dueDate: toDbDate('2026-12-10'),
        },
      }),
    ).rejects.toThrow();
  });
});
