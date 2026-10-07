import { describe, expect, it } from 'vitest';
import { FREQUENCY_LABELS, THEME_LABELS } from '../enums';
import { deleteMeSchema, updateMeSchema } from './auth';
import {
  budgetPutSchema,
  financialSettingsSchema,
  recurringOnCreateSchema,
  recurringRuleCreateSchema,
  scheduledCompleteSchema,
  scheduledCreateSchema,
  scheduledListQuerySchema,
} from './planning';
import { expenseSchema } from './transactions';

const ID = '7f1c0d1e-5b7a-4c39-9a51-2f3c4d5e6f70';
const ID2 = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const issuesOf = (r: { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.path.join('.'));

describe('financialSettingsSchema', () => {
  const ok = {
    obligationsPct: 50,
    savingsPct: 20,
    investmentPct: 10,
    leisurePct: 10,
    otherPct: 10,
    monthlyIncomeEstimate: null,
    lowBalanceThreshold: 100_000,
  };
  it('accepts percentages that add up to 100', () => {
    expect(financialSettingsSchema.safeParse(ok).success).toBe(true);
  });
  it('rejects a total different from 100 under the "total" field', () => {
    const r = financialSettingsSchema.safeParse({ ...ok, savingsPct: 25 });
    expect(issuesOf(r)).toContain('total');
  });
});

describe('budgetPutSchema', () => {
  it('rejects the same category twice', () => {
    const r = budgetPutSchema.safeParse({
      totalAmount: null,
      lines: [
        { categoryId: ID, amount: 1000 },
        { categoryId: ID, amount: 2000 },
      ],
    });
    expect(issuesOf(r)).toContain('lines');
  });
});

describe('recurrence schemas', () => {
  const rule = {
    name: 'Arriendo',
    kind: 'EXPENSE',
    amount: 1_000_000,
    categoryId: ID,
    accountId: ID2,
    frequency: 'MONTHLY',
    startDate: '2026-10-01',
  };
  it('clears the fields the frequency does not use', () => {
    const r = recurringRuleCreateSchema.parse({ ...rule, day1: 3, intervalDays: 9 });
    expect(r).toMatchObject({ day1: null, day2: null, intervalDays: null, creditCardId: null });
  });
  it('defaults a semimonthly rule to the 15th and the last day', () => {
    const r = recurringRuleCreateSchema.parse({ ...rule, frequency: 'SEMIMONTHLY' });
    expect(r).toMatchObject({ day1: 15, day2: 31 });
  });
  it('requires the interval for CUSTOM_DAYS and ordered semimonthly days', () => {
    expect(
      issuesOf(recurringRuleCreateSchema.safeParse({ ...rule, frequency: 'CUSTOM_DAYS' })),
    ).toContain('intervalDays');
    expect(
      issuesOf(
        recurringRuleCreateSchema.safeParse({
          ...rule,
          frequency: 'SEMIMONTHLY',
          day1: 20,
          day2: 5,
        }),
      ),
    ).toContain('day2');
  });
  it('validates where the money comes from', () => {
    expect(
      issuesOf(
        recurringRuleCreateSchema.safeParse({
          ...rule,
          kind: 'INCOME',
          accountId: null,
          creditCardId: ID2,
        }),
      ),
    ).toEqual(expect.arrayContaining(['accountId', 'creditCardId']));
    expect(issuesOf(recurringRuleCreateSchema.safeParse({ ...rule, creditCardId: ID }))).toContain(
      'accountId',
    );
    expect(
      issuesOf(recurringRuleCreateSchema.safeParse({ ...rule, endDate: '2026-09-01' })),
    ).toContain('endDate');
  });
  it('accepts "recurring" when registering an expense', () => {
    const r = expenseSchema.parse({
      type: 'EXPENSE',
      amount: 90_000,
      date: '2026-10-10',
      accountId: ID2,
      categoryId: ID,
      recurring: { frequency: 'MONTHLY' },
    });
    expect(r.recurring).toEqual({
      frequency: 'MONTHLY',
      intervalDays: null,
      day1: null,
      day2: null,
      endDate: null,
    });
    expect(recurringOnCreateSchema.safeParse({ frequency: 'CUSTOM_DAYS' }).success).toBe(false);
  });
});

describe('scheduled schemas', () => {
  it('needs exactly one source for an obligation', () => {
    const base = {
      kind: 'EXPENSE',
      name: 'SOAT',
      amount: 500_000,
      dueDate: '2026-11-01',
      categoryId: ID,
    };
    expect(scheduledCreateSchema.safeParse(base).success).toBe(false);
    expect(scheduledCreateSchema.safeParse({ ...base, accountId: ID2 }).success).toBe(true);
  });
  it('cannot complete with an account and a card at once', () => {
    expect(scheduledCompleteSchema.safeParse({ accountId: ID, creditCardId: ID2 }).success).toBe(
      false,
    );
    expect(scheduledCompleteSchema.parse({})).toEqual({ description: null });
  });
  it('parses a comma separated status filter', () => {
    expect(scheduledListQuerySchema.parse({ status: 'PENDING,SKIPPED' }).status).toEqual([
      'PENDING',
      'SKIPPED',
    ]);
  });
});

describe('profile schemas', () => {
  it('normalizes the new email and requires typing ELIMINAR', () => {
    expect(updateMeSchema.parse({ email: ' Nuevo@Correo.CO ' }).email).toBe('nuevo@correo.co');
    expect(deleteMeSchema.safeParse({ password: 'x', confirmation: 'eliminar' }).success).toBe(
      false,
    );
    expect(deleteMeSchema.safeParse({ password: 'x', confirmation: 'ELIMINAR' }).success).toBe(
      true,
    );
  });
});

describe('labels', () => {
  it('keep their accents', () => {
    expect(FREQUENCY_LABELS.CUSTOM_DAYS).toBe('Cada N días');
    expect(THEME_LABELS.SYSTEM).toBe('Según el sistema');
  });
});
