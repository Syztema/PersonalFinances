import { describe, expect, it } from 'vitest';
import { transactionListQuerySchema, transactionSchema, transferBodySchema } from './transactions';

const ACC_A = '11111111-1111-4111-8111-111111111111';
const ACC_B = '22222222-2222-4222-8222-222222222222';
const CAT = '33333333-3333-4333-8333-333333333333';
const CARD = '44444444-4444-4444-8444-444444444444';

describe('transactionSchema', () => {
  it('parses an expense and normalizes optional fields and tags', () => {
    const r = transactionSchema.parse({
      type: 'EXPENSE',
      amount: 25000,
      date: '2026-10-06',
      accountId: ACC_A,
      categoryId: CAT,
      description: '  Almuerzo ',
      tags: [' Trabajo ', 'COMIDA'],
    });
    expect(r).toMatchObject({
      description: 'Almuerzo',
      payee: null,
      notes: null,
      tags: ['trabajo', 'comida'],
    });
  });

  it('defaults card purchase installments to 1 and rejects 49', () => {
    const base = {
      type: 'CARD_PURCHASE',
      amount: 80000,
      date: '2026-10-06',
      creditCardId: CARD,
      categoryId: CAT,
    };
    expect(transactionSchema.parse(base)).toMatchObject({ installments: 1 });
    expect(transactionSchema.safeParse({ ...base, installments: 49 }).success).toBe(false);
  });

  it('rejects transfers to the same account', () => {
    const body = { amount: 200000, date: '2026-10-06', accountId: ACC_A, toAccountId: ACC_A };
    expect(transactionSchema.safeParse({ type: 'TRANSFER', ...body }).success).toBe(false);
    expect(transferBodySchema.safeParse(body).success).toBe(false);
    expect(transferBodySchema.safeParse({ ...body, toAccountId: ACC_B }).success).toBe(true);
  });

  it('rejects zero, decimal and oversized amounts, unknown keys and invalid dates', () => {
    const ok = {
      type: 'INCOME',
      amount: 1000,
      date: '2026-10-06',
      accountId: ACC_A,
      categoryId: CAT,
    };
    expect(transactionSchema.safeParse(ok).success).toBe(true);
    expect(transactionSchema.safeParse({ ...ok, amount: 0 }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...ok, amount: 10.5 }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...ok, amount: 1_000_000_000_001 }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...ok, creditCardId: CARD }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...ok, date: '2026-02-30' }).success).toBe(false);
  });
});

describe('transactionListQuerySchema', () => {
  it('splits types, coerces numbers and applies the default limit', () => {
    const q = transactionListQuerySchema.parse({ type: 'INCOME,EXPENSE', minAmount: '1000' });
    expect(q).toMatchObject({ type: ['INCOME', 'EXPENSE'], minAmount: 1000, limit: 30 });
    expect(transactionListQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
    expect(transactionListQuerySchema.safeParse({ type: 'GIFT' }).success).toBe(false);
  });

  it('bounds minAmount and maxAmount to MAX_AMOUNT', () => {
    expect(transactionListQuerySchema.safeParse({ minAmount: '1e30' }).success).toBe(false);
    expect(transactionListQuerySchema.safeParse({ maxAmount: '1000000000000' }).success).toBe(true);
    expect(transactionListQuerySchema.safeParse({ maxAmount: '1000000000001' }).success).toBe(
      false,
    );
  });
});
