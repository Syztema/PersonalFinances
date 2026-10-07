import { z } from 'zod';
import {
  FREQUENCIES,
  SCHEDULED_KINDS,
  SCHEDULED_STATUSES,
  type Frequency,
  type ScheduledKind,
} from '../enums';
import { MAX_AMOUNT } from '../money';
import {
  zAmount,
  zColor,
  zDayOfMonth,
  zIcon,
  zId,
  zIsoDate,
  zName,
  zNonNegativeAmount,
  zOptionalText,
} from './common';

const zPct = z.number().int().min(0).max(100);

/** Mes `YYYY-MM`. */
export const zMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido');
export const monthParamsSchema = z.object({ month: zMonth });

// ── Configuración financiera (spec 8.8) ──────────────────────────────────────

export const financialSettingsSchema = z
  .strictObject({
    obligationsPct: zPct,
    savingsPct: zPct,
    investmentPct: zPct,
    leisurePct: zPct,
    otherPct: zPct,
    monthlyIncomeEstimate: zAmount.nullable(),
    lowBalanceThreshold: zNonNegativeAmount,
  })
  .refine(
    (v) => v.obligationsPct + v.savingsPct + v.investmentPct + v.leisurePct + v.otherPct === 100,
    { path: ['total'], message: 'Los porcentajes deben sumar 100 %' },
  );

// ── Presupuestos (spec 8.9) ──────────────────────────────────────────────────

export const budgetPutSchema = z
  .strictObject({
    totalAmount: zAmount.nullable(),
    lines: z.array(z.strictObject({ categoryId: zId, amount: zAmount })).max(100),
  })
  .refine((v) => new Set(v.lines.map((l) => l.categoryId)).size === v.lines.length, {
    path: ['lines'],
    message: 'Cada categoría puede aparecer una sola vez',
  });

// ── Metas (spec 8.10) ────────────────────────────────────────────────────────

export const goalCreateSchema = z.strictObject({
  name: zName(60),
  targetAmount: zAmount,
  targetDate: zIsoDate.nullish().transform((v) => v ?? null),
  accountId: zId,
  initialAmount: zNonNegativeAmount.default(0),
  icon: zIcon.default('target'),
  color: zColor.default('#0ea5e9'),
});

export const goalUpdateSchema = z.strictObject({
  name: zName(60).optional(),
  targetAmount: zAmount.optional(),
  targetDate: zIsoDate.nullable().optional(),
  accountId: zId.optional(),
  initialAmount: zNonNegativeAmount.optional(),
  icon: zIcon.optional(),
  color: zColor.optional(),
  /** Completar o reabrir. `ARCHIVED` no se usa. */
  status: z.enum(['ACTIVE', 'COMPLETED']).optional(),
});

export const goalContributionSchema = z.strictObject({
  fromAccountId: zId,
  amount: zAmount,
  date: zIsoDate,
  description: zOptionalText(140),
});

export const goalWithdrawalSchema = z.strictObject({
  toAccountId: zId,
  amount: zAmount,
  date: zIsoDate,
  description: zOptionalText(140),
});

// ── Recurrencias (spec 8.11) ─────────────────────────────────────────────────

interface RecurrenceInput {
  frequency: Frequency;
  intervalDays: number | null;
  day1: number | null;
  day2: number | null;
}

const recurrenceFields = {
  frequency: z.enum(FREQUENCIES),
  intervalDays: z
    .number()
    .int()
    .min(1)
    .max(366)
    .nullish()
    .transform((v) => v ?? null),
  day1: zDayOfMonth.nullish().transform((v) => v ?? null),
  day2: zDayOfMonth.nullish().transform((v) => v ?? null),
  endDate: zIsoDate.nullish().transform((v) => v ?? null),
};

function checkRecurrence(v: RecurrenceInput, ctx: z.RefinementCtx) {
  if (v.frequency === 'CUSTOM_DAYS' && v.intervalDays === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['intervalDays'],
      message: 'Indica cada cuántos días se repite',
    });
  }
  if (v.frequency === 'SEMIMONTHLY' && (v.day1 ?? 15) >= (v.day2 ?? 31)) {
    ctx.addIssue({
      code: 'custom',
      path: ['day2'],
      message: 'El segundo día debe ser posterior al primero',
    });
  }
}

/** Deja solo los campos que usa la frecuencia; la quincena por defecto es 15 y último día. */
function normalizeRecurrence<T extends RecurrenceInput>(v: T): T {
  return {
    ...v,
    intervalDays: v.frequency === 'CUSTOM_DAYS' ? v.intervalDays : null,
    day1: v.frequency === 'SEMIMONTHLY' ? (v.day1 ?? 15) : null,
    day2: v.frequency === 'SEMIMONTHLY' ? (v.day2 ?? 31) : null,
  };
}

interface SourceInput {
  kind: ScheduledKind;
  accountId: string | null;
  creditCardId: string | null;
}

/** Spec 7.3: un ingreso llega a una cuenta; un gasto sale de una cuenta o de una tarjeta. */
function checkSource(v: SourceInput, ctx: z.RefinementCtx) {
  if (v.kind === 'INCOME') {
    if (!v.accountId) {
      ctx.addIssue({ code: 'custom', path: ['accountId'], message: 'Elige la cuenta donde llega' });
    }
    if (v.creditCardId) {
      ctx.addIssue({
        code: 'custom',
        path: ['creditCardId'],
        message: 'Un ingreso no puede llegar a una tarjeta',
      });
    }
  } else if (!v.accountId === !v.creditCardId) {
    ctx.addIssue({
      code: 'custom',
      path: ['accountId'],
      message: 'Elige una cuenta o una tarjeta',
    });
  }
}

const ruleFields = {
  name: zName(60),
  kind: z.enum(SCHEDULED_KINDS),
  amount: zAmount,
  categoryId: zId,
  accountId: zId.nullish().transform((v) => v ?? null),
  creditCardId: zId.nullish().transform((v) => v ?? null),
  ...recurrenceFields,
  startDate: zIsoDate,
};

function checkRule(
  v: SourceInput & RecurrenceInput & { startDate: string; endDate: string | null },
  ctx: z.RefinementCtx,
) {
  checkRecurrence(v, ctx);
  checkSource(v, ctx);
  if (v.endDate && v.endDate < v.startDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'La fecha final debe ser igual o posterior a la inicial',
    });
  }
}

export const recurringRuleCreateSchema = z
  .strictObject(ruleFields)
  .superRefine(checkRule)
  .transform(normalizeRecurrence);

/** `PUT`: la regla completa; `isActive` pausa o reanuda. */
export const recurringRuleUpdateSchema = z
  .strictObject({ ...ruleFields, isActive: z.boolean() })
  .superRefine(checkRule)
  .transform(normalizeRecurrence);

/** "Recurrente" al registrar un ingreso o gasto: la regla empieza en la fecha del movimiento. */
export const recurringOnCreateSchema = z
  .strictObject(recurrenceFields)
  .superRefine(checkRecurrence)
  .transform(normalizeRecurrence);

// ── Ocurrencias programadas ──────────────────────────────────────────────────

export const scheduledCreateSchema = z
  .strictObject({
    kind: z.enum(SCHEDULED_KINDS),
    name: zName(60),
    amount: zAmount,
    dueDate: zIsoDate,
    categoryId: zId,
    accountId: zId.nullish().transform((v) => v ?? null),
    creditCardId: zId.nullish().transform((v) => v ?? null),
  })
  .superRefine(checkSource);

export const scheduledUpdateSchema = z.strictObject({
  name: zName(60).optional(),
  amount: zAmount.optional(),
  dueDate: zIsoDate.optional(),
  categoryId: zId.optional(),
  accountId: zId.nullable().optional(),
  creditCardId: zId.nullable().optional(),
  /** Reabre una ocurrencia omitida. */
  status: z.literal('PENDING').optional(),
});

export const scheduledCompleteSchema = z
  .strictObject({
    amount: zAmount.optional(),
    date: zIsoDate.optional(),
    accountId: zId.optional(),
    creditCardId: zId.optional(),
    description: zOptionalText(140),
  })
  .refine((v) => !(v.accountId && v.creditCardId), {
    path: ['creditCardId'],
    message: 'Elige una cuenta o una tarjeta, no ambas',
  });

export const scheduledListQuerySchema = z.object({
  from: zIsoDate.optional(),
  to: zIsoDate.optional(),
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : undefined))
    .pipe(z.array(z.enum(SCHEDULED_STATUSES)).optional()),
});

export const scheduledSuggestionsQuerySchema = z.object({
  kind: z.enum(SCHEDULED_KINDS),
  categoryId: zId,
  amount: z.coerce.number().int().min(1).max(MAX_AMOUNT),
  date: zIsoDate,
});

// ── Alertas (spec 8.12) ──────────────────────────────────────────────────────

export const alertKeyParamsSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9:-]+$/),
});

export type FinancialSettingsInput = z.output<typeof financialSettingsSchema>;
export type BudgetPutInput = z.output<typeof budgetPutSchema>;
export type GoalCreateInput = z.output<typeof goalCreateSchema>;
export type GoalUpdateInput = z.output<typeof goalUpdateSchema>;
export type GoalContributionInput = z.output<typeof goalContributionSchema>;
export type GoalWithdrawalInput = z.output<typeof goalWithdrawalSchema>;
export type RecurringRuleCreateInput = z.output<typeof recurringRuleCreateSchema>;
export type RecurringRuleUpdateInput = z.output<typeof recurringRuleUpdateSchema>;
export type RecurringOnCreateInput = z.output<typeof recurringOnCreateSchema>;
export type ScheduledCreateInput = z.output<typeof scheduledCreateSchema>;
export type ScheduledUpdateInput = z.output<typeof scheduledUpdateSchema>;
export type ScheduledCompleteInput = z.output<typeof scheduledCompleteSchema>;
export type ScheduledListQuery = z.output<typeof scheduledListQuerySchema>;
export type ScheduledSuggestionsQuery = z.output<typeof scheduledSuggestionsQuerySchema>;
