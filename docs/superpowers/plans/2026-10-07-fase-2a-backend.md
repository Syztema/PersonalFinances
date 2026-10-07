# Fase 2A — Backend de planificación y "todo editable o eliminable": plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La API de la Fase 2: eliminar y restaurar con historial, cambio gasto ⇄ compra con tarjeta, ajuste de saldo, configuración financiera, presupuestos, metas, recurrentes y obligaciones, "¿Cuánto puedo gastar hoy?", alertas y estado general, perfil completo (email, eliminar mi cuenta) y tema oscuro por defecto.

**Architecture:** Igual que la Fase 1: rutas delgadas → servicios (todas las consultas con `userId`) → dominio puro (`src/domain`). Lo nuevo de cálculo (recurrencias, presupuestos, metas, cuánto puedo gastar hoy, alertas) es dominio puro con tests sin base de datos. Un "snapshot de planificación" (`modules/planning/snapshot.ts`) carga una sola vez lo que necesitan el dashboard y las alertas. Las ocurrencias de las reglas recurrentes se generan de forma perezosa e idempotente al consultar.

**Tech Stack:** Node 22, TypeScript 5.9.3, Fastify 5.12, Zod 4.6, Prisma 7.10 (`prisma-client` + `@prisma/adapter-pg`), PostgreSQL 17, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-07-fase-2-design.md` (addendum de la Fase 2, manda donde dice "Reemplaza") y `docs/superpowers/specs/2026-10-06-finanzas-design.md` (spec principal: reglas 8.5 a 8.12).

## Global Constraints

- Dinero: enteros en pesos; `bigint` en Postgres, `number` en TS; rango por valor 1 a 1.000.000.000.000.
- Formato COP en mensajes: `formatCOP` de `@finanzas/shared` (`$1.500.000`, `-$25.000`).
- Fechas: `IsoDate` (`YYYY-MM-DD`); "hoy" siempre es `req.auth.today` (zona del usuario, default `America/Bogota`); los tests fijan el reloj con `createTestApp({}, { now: () => new Date('…') })`.
- Toda consulta de negocio filtra por `userId` de la sesión; recurso ajeno → 404; referencia ajena en el cuerpo → 400 `INVALID_REFERENCE`.
- Errores: `{ error: { code, message, fields? } }`, mensajes en español de Colombia; código e identificadores en inglés.
- Logs: nunca cuerpos, montos, emails, tokens ni query strings (ya resuelto en `app.ts`; no agregar logs nuevos con datos).
- Eliminación lógica = `isActive = false`. Un elemento eliminado es **de solo lectura** hasta restaurarlo (409 `ENTITY_DELETED`).
- Porcentajes de uso y avance en los DTOs son **fracciones** (`0.75` = 75 %); la interfaz los formatea.
- Nunca ejecutar `prisma migrate reset` ni definir `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. Las migraciones se aplican con `prisma migrate deploy`. Nunca hacer commit de archivos `.env`.
- Commits: se trabaja en la rama `fase-2` (creada en la Task 1). Cada tarea termina con un commit de trabajo en esa rama (sin push); al final del plan 2B todo se aplasta en **un único commit** en `main` (código, addendum y planes), con mensaje de una frase, seguido de `git push origin main`.
- Antes de dar por terminada cada tarea: `npm run typecheck` (raíz, todos los workspaces) y los tests indicados en verde.

### Decisiones de este plan (precisan el addendum sin cambiar lo aprobado)

1. **Presupuesto sin total general:** si el mes solo tiene líneas por categoría, el "presupuesto general" es la suma de las líneas y lo gastado cuenta solo las categorías presupuestadas y sus subcategorías (alcance del presupuesto). Con total general, cuenta todo el gasto del mes. El mismo alcance se usa en "¿Cuánto puedo gastar hoy?" (límite B) y en el estado general.
2. **Base del límite por presupuesto:** `G` = gasto del mes dentro del alcance − gastos discrecionales de hoy (no solo "fecha < hoy"), para que un gasto de hoy enlazado a una obligación sí cuente.
3. **Reglas recurrentes:** nueva columna `RecurringRule.activeFrom` (fecha desde la que genera su versión actual). Crear una regla desde la pantalla de recurrentes la activa desde hoy (no genera ocurrencias pasadas que el usuario ya pagó); marcar "Recurrente" al registrar un movimiento la activa desde la fecha del movimiento; editar o reanudar la activa desde hoy. La generación va de `max(startDate, activeFrom, hoy − 31 días)` al fin del mes siguiente.
4. **Quincenal al registrar:** con "Recurrente" quincenal, la fecha del movimiento debe ser uno de los dos días de la quincena (la interfaz los propone a partir de la fecha).
5. **Metas:** se pueden mover a otra cuenta solo si no tienen abonos ni retiros (409 `GOAL_HAS_MOVEMENTS`); si los tienen, se eliminan (sus transferencias quedan como normales) o se crea otra meta.
6. **Categorías del sistema** (`systemKey` no nulo) nunca se borran del todo (siempre eliminación lógica, para poder restaurarlas automáticamente) y no pueden volverse subcategorías.
7. **Restaurar una categoría principal** restaura también sus subcategorías; restaurar una subcategoría con la principal eliminada responde 409 `PARENT_DELETED`.
8. **`DELETE`** de cuentas, tarjetas, préstamos y categorías responde **200** con `{ deleted: 'hard' | 'soft' }` (antes 204). Repetirlo sobre algo ya eliminado responde lo mismo sin cambios.
9. **Alertas:** de cada presupuesto solo se muestra el umbral más alto alcanzado (50/75/90/100); "Dinero bajo" usa la clave del día (`low-balance:YYYY-MM-DD`).

## Review Focus

1. **Completar dos veces la misma obligación** (doble toque o dos pestañas, peticiones simultáneas) → se crea exactamente un movimiento; la segunda responde 409 `NOT_PENDING`. *(Test en Task 11.)*
2. **Mover la fecha de una ocurrencia de una regla y volver a abrir el dashboard** → la regeneración perezosa no crea un duplicado en la fecha original. *(Test en Task 11.)*
3. **Editar el valor o eliminar un movimiento de una cuenta eliminada** → 409 `ENTITY_DELETED` y la cuenta sigue en $0; editar solo la descripción sí se permite. *(Test en Task 8.)*
4. **Eliminar el presupuesto del mes y volver a abrirlo** → sigue vacío (no se vuelve a copiar del mes anterior); el mes siguiente tampoco hereda un presupuesto más antiguo. *(Test en Task 12.)*
5. **"Eliminar mi cuenta" de un usuario con de todo** (pago de préstamo con intereses, meta con abonos, regla con ocurrencia enlazada, presupuesto, alerta descartada, etiquetas) → se borra todo sin errores de llaves foráneas y los datos de otro usuario quedan intactos. *(Test en Task 15.)*

---

## Estructura de archivos (Fase 2A)

```
packages/shared/src/
  schemas/planning.ts (+ planning.test.ts)   configuración, presupuestos, metas, recurrentes, programados, alertas
  schemas/tags.ts                            renombrar etiqueta
  schemas/transactions.ts                    enlace al crear (scheduledItemId, recurring); filtro desde ≤ hasta
  schemas/auth.ts                            PATCH /me con email; DELETE /me
  schemas/accounts.ts, categories.ts, credit-cards.ts, debts.ts   sin isActive en los PUT; ajuste de saldo
  dto.ts, enums.ts, index.ts
apps/api/
  prisma/schema.prisma, prisma/migrations/20261008000000_fase2/migration.sql
  prisma/seed-demo.ts                        presupuesto, meta, recurrentes; sin saldos negativos
  src/domain/recurrence.ts, budget.ts, goals.ts, spending-power.ts, alerts.ts (+ tests)
  src/domain/card-billing.ts                 deuda inicial no vencida al registrar
  src/domain/available.ts                    exporta `minus`
  src/modules/auth/sessions.ts (+ sessions.test.ts)   renovación con updateMany
  src/modules/planning/cascade.ts            efectos en cadena de una eliminación lógica
  src/modules/planning/snapshot.ts           datos del mes para dashboard y alertas
  src/modules/accounts|credit-cards|debts|categories/{routes,service}.ts   eliminar/restaurar
  src/modules/transactions/{service,refs,mapper,routes}.ts, adjust.ts      composición, cambio de tipo, ajuste
  src/modules/recurring/{routes,service}.ts
  src/modules/scheduled/{routes,service,link}.ts
  src/modules/settings/{routes,service}.ts
  src/modules/budgets/{routes,service}.ts
  src/modules/goals/{routes,service}.ts
  src/modules/alerts/{routes,service}.ts
  src/modules/dashboard/service.ts
  src/modules/me/{routes,service}.ts
  src/modules/tags/{routes,service}.ts
  src/app.ts
  test/*.test.ts (nuevos y actualizados), test/helpers.ts
apps/web/src/**/*.test.tsx                   solo fixtures de tipos (isActive en referencias, campos nuevos del dashboard)
```

---

### Task 1: Rama de trabajo y contratos compartidos de la Fase 2

**Files:**
- Create: `packages/shared/src/schemas/planning.ts`
- Create: `packages/shared/src/schemas/tags.ts`
- Create: `packages/shared/src/schemas/planning.test.ts`
- Modify: `packages/shared/src/schemas/transactions.ts`
- Modify: `packages/shared/src/schemas/auth.ts`
- Modify: `packages/shared/src/schemas/accounts.ts`
- Modify: `packages/shared/src/enums.ts`
- Modify: `packages/shared/src/dto.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/modules/transactions/mapper.ts:5`
- Modify (solo fixtures): `apps/web/src/features/transactions/TransactionRow.test.tsx`, `apps/web/src/features/transactions/TransactionDetailSheet.test.tsx` y cualquier otro test que `tsc` reporte.

**Interfaces:**
- Consumes: piezas Zod de `schemas/common.ts` (`zAmount`, `zId`, `zIsoDate`, `zName`, `zIcon`, `zColor`, `zDayOfMonth`, `zNonNegativeAmount`, `zSignedAmount`, `zOptionalText`), `zEmail` de `schemas/auth.ts`, enums `FREQUENCIES`, `SCHEDULED_KINDS`, `SCHEDULED_STATUSES`, `THEMES`.
- Produces (todo exportado desde `@finanzas/shared`):
  - Esquemas: `zMonth`, `monthParamsSchema`, `financialSettingsSchema`, `budgetPutSchema`, `goalCreateSchema`, `goalUpdateSchema`, `goalContributionSchema`, `goalWithdrawalSchema`, `recurringRuleCreateSchema`, `recurringRuleUpdateSchema`, `recurringOnCreateSchema`, `scheduledCreateSchema`, `scheduledUpdateSchema`, `scheduledCompleteSchema`, `scheduledListQuerySchema`, `scheduledSuggestionsQuerySchema`, `alertKeyParamsSchema`, `tagUpdateSchema`, `adjustBalanceSchema`, `deleteMeSchema`; `updateMeSchema` acepta `email` y `currentPassword`; `incomeSchema`, `expenseSchema` y `cardPurchaseSchema` aceptan `scheduledItemId?` y `recurring?`.
  - Tipos de entrada: `FinancialSettingsInput`, `BudgetPutInput`, `GoalCreateInput`, `GoalUpdateInput`, `GoalContributionInput`, `GoalWithdrawalInput`, `RecurringRuleCreateInput`, `RecurringRuleUpdateInput`, `RecurringOnCreateInput`, `ScheduledCreateInput`, `ScheduledUpdateInput`, `ScheduledCompleteInput`, `ScheduledListQuery`, `ScheduledSuggestionsQuery`, `AdjustBalanceInput`, `DeleteMeInput`, `TagUpdateInput`.
  - DTOs: `RefDTO.isActive: boolean`; `FinancialSettingsDTO`, `BucketKey`, `BucketProgressDTO`, `FinancialSettingsResponse`, `BudgetLineDTO`, `BudgetDTO`, `GoalDTO`, `RecurringRuleDTO`, `ScheduledItemDTO`, `AlertLevel`, `AlertDTO`, `StatusDTO`, `SpendingPowerDTO`, `DashboardBudgetDTO`, `AdjustBalanceResultDTO`, `DeleteResultDTO`; `DashboardDTO` **no cambia en esta tarea** (se amplía en la Task 14).
  - Etiquetas: `FREQUENCY_LABELS`, `THEME_LABELS`.

- [ ] **Step 1: Crear la rama de trabajo**

Run (raíz del repo, con el árbol limpio salvo `docs/superpowers/`):

```bash
git checkout -b fase-2
git status --short
```

Expected: rama `fase-2`; solo aparecen como no rastreados el addendum y los planes de la Fase 2.

- [ ] **Step 2: Escribir los tests de los esquemas nuevos**

Create `packages/shared/src/schemas/planning.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
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
    expect(issuesOf(recurringRuleCreateSchema.safeParse({ ...rule, frequency: 'CUSTOM_DAYS' }))).toContain(
      'intervalDays',
    );
    expect(
      issuesOf(
        recurringRuleCreateSchema.safeParse({ ...rule, frequency: 'SEMIMONTHLY', day1: 20, day2: 5 }),
      ),
    ).toContain('day2');
  });
  it('validates where the money comes from', () => {
    expect(
      issuesOf(recurringRuleCreateSchema.safeParse({ ...rule, kind: 'INCOME', accountId: null, creditCardId: ID2 })),
    ).toEqual(expect.arrayContaining(['accountId', 'creditCardId']));
    expect(
      issuesOf(recurringRuleCreateSchema.safeParse({ ...rule, creditCardId: ID })),
    ).toContain('accountId');
    expect(issuesOf(recurringRuleCreateSchema.safeParse({ ...rule, endDate: '2026-09-01' }))).toContain(
      'endDate',
    );
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
    const base = { kind: 'EXPENSE', name: 'SOAT', amount: 500_000, dueDate: '2026-11-01', categoryId: ID };
    expect(scheduledCreateSchema.safeParse(base).success).toBe(false);
    expect(scheduledCreateSchema.safeParse({ ...base, accountId: ID2 }).success).toBe(true);
  });
  it('cannot complete with an account and a card at once', () => {
    expect(scheduledCompleteSchema.safeParse({ accountId: ID, creditCardId: ID2 }).success).toBe(false);
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
    expect(deleteMeSchema.safeParse({ password: 'x', confirmation: 'eliminar' }).success).toBe(false);
    expect(deleteMeSchema.safeParse({ password: 'x', confirmation: 'ELIMINAR' }).success).toBe(true);
  });
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `npm test -w @finanzas/shared`
Expected: FAIL — `Cannot find module './planning'`.

- [ ] **Step 4: Crear `packages/shared/src/schemas/planning.ts`**

```ts
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
    ctx.addIssue({ code: 'custom', path: ['accountId'], message: 'Elige una cuenta o una tarjeta' });
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
```

Si `tsc` no encuentra `z.RefinementCtx`, usar `z.core.$RefinementCtx` (es el mismo tipo).

- [ ] **Step 5: Crear `packages/shared/src/schemas/tags.ts`**

```ts
import { z } from 'zod';

export const tagUpdateSchema = z.strictObject({
  name: z.string().trim().toLowerCase().min(1, 'Requerido').max(30),
});

export type TagUpdateInput = z.output<typeof tagUpdateSchema>;
```

- [ ] **Step 6: Ampliar `schemas/transactions.ts` (enlace al registrar)**

En `packages/shared/src/schemas/transactions.ts`, agregar el import y los campos de enlace:

```ts
import { recurringOnCreateSchema } from './planning';
```

Debajo de `const base = { … };` agregar:

```ts
/** Solo al registrar: enlazar con una ocurrencia programada o crear la regla recurrente (spec 8.11). */
const linkFields = {
  scheduledItemId: zId.nullish(),
  recurring: recurringOnCreateSchema.nullish(),
};
```

y usarlos en los tres tipos que pueden ser recurrentes:

```ts
export const incomeSchema = z.strictObject({
  type: z.literal('INCOME'),
  ...base,
  ...linkFields,
  accountId: zId,
  categoryId: zId,
});
export const expenseSchema = z.strictObject({
  type: z.literal('EXPENSE'),
  ...base,
  ...linkFields,
  accountId: zId,
  categoryId: zId,
  paymentMethod: z.enum(PAYMENT_METHODS).nullish(),
});
```

```ts
const cardPurchaseFields = {
  ...base,
  ...linkFields,
  creditCardId: zId,
  categoryId: zId,
  installments: zInstallments.default(1),
};
```

- [ ] **Step 7: Perfil, cuenta y ajuste de saldo**

En `packages/shared/src/schemas/auth.ts` reemplazar `updateMeSchema` y agregar `deleteMeSchema`:

```ts
export const updateMeSchema = z.strictObject({
  name: zName(80).optional(),
  theme: z.enum(THEMES).optional(),
  email: zEmail.optional(),
  /** Obligatoria para cambiar el email. */
  currentPassword: z.string().min(1).max(128).optional(),
});
export const deleteMeSchema = z.strictObject({
  password: z.string().min(1, 'Requerida').max(128),
  confirmation: z.literal('ELIMINAR', 'Escribe ELIMINAR para confirmar'),
});
```

y al final:

```ts
export type DeleteMeInput = z.output<typeof deleteMeSchema>;
```

En `packages/shared/src/schemas/accounts.ts` agregar (antes de los tipos):

```ts
/** Spec 8.13: el usuario indica el saldo real; se registra la diferencia. */
export const adjustBalanceSchema = z.strictObject({
  actualBalance: zSignedAmount,
  date: zIsoDate.optional(),
});
```

y `export type AdjustBalanceInput = z.output<typeof adjustBalanceSchema>;`.

- [ ] **Step 8: Etiquetas en `enums.ts`**

Al final de `packages/shared/src/enums.ts`:

```ts
export const FREQUENCY_LABELS: Record<Frequency, string> = {
  WEEKLY: 'Semanal',
  SEMIMONTHLY: 'Quincenal',
  MONTHLY: 'Mensual',
  YEARLY: 'Anual',
  CUSTOM_DAYS: 'Cada N días',
};

export const THEME_LABELS: Record<Theme, string> = {
  DARK: 'Oscuro',
  LIGHT: 'Claro',
  SYSTEM: 'Según el sistema',
};
```

- [ ] **Step 9: DTOs en `dto.ts`**

En `packages/shared/src/dto.ts`, ampliar el import de enums con `Frequency`, `GoalStatus`, `ScheduledKind`, `ScheduledStatus` y cambiar `RefDTO`:

```ts
export interface RefDTO {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** false si fue eliminada (la interfaz muestra "(eliminada)"). */
  isActive: boolean;
}
```

Agregar al final del archivo (sin tocar `DashboardDTO` todavía):

```ts
export interface DeleteResultDTO {
  deleted: 'hard' | 'soft';
}

export interface AdjustBalanceResultDTO {
  transaction: TransactionDTO;
  account: AccountDTO;
}

export interface FinancialSettingsDTO {
  obligationsPct: number;
  savingsPct: number;
  investmentPct: number;
  leisurePct: number;
  otherPct: number;
  monthlyIncomeEstimate: number | null;
  lowBalanceThreshold: number;
}

export type BucketKey = 'OBLIGATIONS' | 'SAVINGS' | 'INVESTMENT' | 'LEISURE' | 'OTHER';

export interface BucketProgressDTO {
  key: BucketKey;
  label: string;
  pct: number;
  /** pct × ingreso proyectado del mes. */
  target: number;
  actual: number;
}

export interface FinancialSettingsResponse {
  settings: FinancialSettingsDTO;
  month: { key: string; projectedIncome: number; buckets: BucketProgressDTO[] };
}

export interface BudgetLineDTO {
  id: string;
  category: CategoryRefDTO;
  amount: number;
  spent: number;
  remaining: number;
  usage: number;
}

export interface BudgetDTO {
  month: string;
  totalAmount: number | null;
  lines: BudgetLineDTO[];
  /** null si el mes no tiene presupuesto. */
  total: { budget: number; spent: number; remaining: number; usage: number } | null;
  /** Solo en el mes en curso. */
  projection: { projectedSpend: number; exceedsOnDay: number | null } | null;
  daysLeft: number | null;
  /** Mes del que se copió en esta consulta, o null. */
  copiedFrom: string | null;
}

export interface GoalDTO {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: IsoDate | null;
  account: AccountRefDTO;
  initialAmount: number;
  status: GoalStatus;
  icon: string;
  color: string;
  contributed: number;
  withdrawn: number;
  progress: number;
  pct: number;
  remaining: number;
  monthlyNeeded: number | null;
  weeklyNeeded: number | null;
}

export interface RecurringRuleDTO {
  id: string;
  name: string;
  kind: ScheduledKind;
  amount: number;
  category: CategoryRefDTO;
  account: AccountRefDTO | null;
  creditCard: RefDTO | null;
  frequency: Frequency;
  intervalDays: number | null;
  day1: number | null;
  day2: number | null;
  startDate: IsoDate;
  endDate: IsoDate | null;
  isActive: boolean;
  nextDate: IsoDate | null;
}

export interface ScheduledItemDTO {
  /** UUID; en los derivados, `card:<id>` o `loan:<id>`. */
  id: string;
  kind: ScheduledKind;
  name: string;
  amount: number;
  dueDate: IsoDate;
  ruleDate: IsoDate | null;
  status: ScheduledStatus;
  category: CategoryRefDTO | null;
  account: AccountRefDTO | null;
  creditCard: RefDTO | null;
  recurringRuleId: string | null;
  transactionId: string | null;
  /** Vencimientos calculados de tarjetas y préstamos (solo lectura). */
  derived: 'CARD' | 'LOAN' | null;
  sourceId: string | null;
}

export type AlertLevel = 'INFO' | 'WARNING' | 'DANGER';

export interface AlertDTO {
  key: string;
  level: AlertLevel;
  title: string;
  message: string;
  href: string | null;
}

export interface StatusDTO {
  level: 'OK' | 'WARNING' | 'DANGER';
  title: string;
  message: string;
}

export interface SpendingPowerDTO {
  daily: number;
  spentToday: number;
  /** daily − spentToday; negativo = "Hoy te pasaste". */
  remainingToday: number;
  limitedBy: 'LIQUIDITY' | 'BUDGET';
  /** Causa principal cuando daily = 0. */
  reason: string | null;
  breakdown: {
    liquidity: { daily: number; bindingDate: IsoDate; days: number; items: BreakdownItem[] };
    budget: { daily: number; days: number; items: BreakdownItem[] } | null;
  };
}

export interface DashboardBudgetDTO {
  budget: number;
  spent: number;
  usage: number;
  projectionExceedsOnDay: number | null;
}
```

- [ ] **Step 10: Exportar todo desde `index.ts`**

Agregar a `packages/shared/src/index.ts`:

```ts
export * from './schemas/planning';
export * from './schemas/tags';
```

- [ ] **Step 11: Referencias con `isActive` en la API**

En `apps/api/src/modules/transactions/mapper.ts` cambiar la línea 5:

```ts
const refSelect = { id: true, name: true, icon: true, color: true, isActive: true } as const;
```

- [ ] **Step 12: Correr los tests del paquete compartido**

Run: `npm test -w @finanzas/shared`
Expected: PASS (los 17 tests anteriores y los nuevos de `planning.test.ts`).

- [ ] **Step 13: Arreglar los fixtures de tipos del frontend**

Run: `npm run typecheck`
Expected: la API compila; la web reporta "Property 'isActive' is missing" en fixtures de tests.

En `apps/web/src/features/transactions/TransactionRow.test.tsx` cambiar el helper:

```ts
const ref = (id: string, name: string) => ({ id, name, icon: 'wallet', color: '#123456', isActive: true });
```

En `apps/web/src/features/transactions/TransactionDetailSheet.test.tsx` y en cada archivo que reporte `tsc`, agregar `isActive: true` a cada objeto de referencia (`account`, `toAccount`, `creditCard`, `debt`, `category`). No cambiar nada más.

Run: `npm run typecheck && npm test -w @finanzas/web`
Expected: PASS (los 51 tests web siguen verdes).

---

### Task 2: Migración de la Fase 2 (tema oscuro, `activeFrom`, `ruleDate`)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (modelos `User`, `RecurringRule`, `ScheduledItem`)
- Create: `apps/api/prisma/migrations/20261008000000_fase2/migration.sql`
- Test: `apps/api/test/db-constraints.test.ts`

**Interfaces:**
- Consumes: esquema de la Fase 1.
- Produces: `User.theme` con default `DARK`; `RecurringRule.activeFrom: Date` (obligatorio, `@db.Date`); `ScheduledItem.ruleDate: Date | null` (`@db.Date`) con único `(recurringRuleId, ruleDate)` (clave Prisma `recurringRuleId_ruleDate`) y `CHECK` "regla ⇔ ruleDate". El único `(recurringRuleId, dueDate)` desaparece.

- [ ] **Step 1: Escribir los tests de base de datos**

En `apps/api/test/db-constraints.test.ts`, dentro del `describe('database constraints', …)`, agregar:

```ts
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
```

- [ ] **Step 2: Actualizar `schema.prisma`**

En `model User` cambiar la línea del tema:

```prisma
  theme        Theme    @default(DARK)
```

En `model RecurringRule`, debajo de `endDate`:

```prisma
  /// Desde cuándo genera ocurrencias la versión actual de la regla (se mueve al editarla).
  activeFrom   DateTime      @db.Date
```

En `model ScheduledItem`, debajo de `dueDate`:

```prisma
  /// Fecha que generó la regla; no cambia aunque se mueva `dueDate`. Nula en las únicas.
  ruleDate        DateTime?       @db.Date
```

y reemplazar `@@unique([recurringRuleId, dueDate])` por:

```prisma
  @@unique([recurringRuleId, ruleDate])
```

- [ ] **Step 3: Escribir la migración a mano**

Create `apps/api/prisma/migrations/20261008000000_fase2/migration.sql`:

```sql
-- Fase 2 (addendum §5 y §6.4)

-- Tema oscuro por defecto
ALTER TABLE "User" ALTER COLUMN "theme" SET DEFAULT 'DARK';
UPDATE "User" SET "theme" = 'DARK' WHERE "theme" = 'SYSTEM';

-- Desde cuándo genera ocurrencias la versión actual de cada regla
ALTER TABLE "RecurringRule" ADD COLUMN "activeFrom" DATE;
UPDATE "RecurringRule" SET "activeFrom" = "startDate";
ALTER TABLE "RecurringRule" ALTER COLUMN "activeFrom" SET NOT NULL;

-- Fecha que generó la regla (inmutable); dueDate pasa a ser editable
ALTER TABLE "ScheduledItem" ADD COLUMN "ruleDate" DATE;
UPDATE "ScheduledItem" SET "ruleDate" = "dueDate" WHERE "recurringRuleId" IS NOT NULL;
DROP INDEX "ScheduledItem_recurringRuleId_dueDate_key";
CREATE UNIQUE INDEX "ScheduledItem_recurringRuleId_ruleDate_key" ON "ScheduledItem"("recurringRuleId", "ruleDate");
ALTER TABLE "ScheduledItem" ADD CONSTRAINT "ScheduledItem_rule_date_check"
  CHECK (("recurringRuleId" IS NULL) = ("ruleDate" IS NULL));
```

- [ ] **Step 4: Aplicar en desarrollo y verificar que no hay deriva**

Run (desde `apps/api`, con `npm run dev:db` corriendo):

```bash
npx prisma migrate deploy
npx prisma migrate dev --create-only --name drift_check
npx prisma generate
```

Expected: `migrate deploy` aplica `20261008000000_fase2`; `migrate dev --create-only` responde que no hay cambios (Prisma no gestiona los `CHECK`). Si crea una carpeta `*_drift_check` vacía, borrarla. Si propone cambios reales, el `schema.prisma` no coincide con el SQL: corregir el esquema (no la base) y repetir. **Nunca** aceptar un reset.

- [ ] **Step 5: Correr los tests de base de datos**

Run: `npm test -w @finanzas/api -- test/db-constraints.test.ts`
Expected: PASS (el `global-setup` aplica la migración a la base de pruebas).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Nada usa todavía `activeFrom` ni `ruleDate`; el seed no crea reglas.)

---

### Task 3: Correcciones del núcleo heredadas de la Fase 1

**Files:**
- Modify: `apps/api/src/modules/auth/sessions.ts:27-35`
- Create: `apps/api/src/modules/auth/sessions.test.ts`
- Modify: `apps/api/src/domain/card-billing.ts:60-71`
- Modify: `apps/api/src/domain/card-billing.test.ts`
- Modify: `packages/shared/src/schemas/transactions.ts` (`transactionListQuerySchema`)
- Test: `apps/api/test/transactions-edit-list.test.ts`

**Interfaces:**
- Consumes: `cutoffOnOrBefore`, `dueDateForCutoff`, `shiftCutoff` (ya existen en `card-billing.ts`).
- Produces: `validateSession` devuelve `null` si la sesión desaparece mientras se renueva; `initialDebtCharge` factura la deuda inicial en el corte siguiente cuando el pago del último corte ya venció al registrar la tarjeta (addendum §2); `GET /api/transactions` con `from > to` → 400.

- [ ] **Step 1: Test de la renovación de sesión**

Create `apps/api/src/modules/auth/sessions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DbClient } from '../../lib/prisma';
import { validateSession } from './sessions';

describe('validateSession', () => {
  it('returns null when the session disappears while it is being renewed (logout race)', async () => {
    const old = new Date(Date.now() - 2 * 3_600_000);
    const db = {
      session: {
        findUnique: async () => ({
          id: 's1',
          userId: 'u1',
          lastUsedAt: old,
          expiresAt: new Date(Date.now() + 86_400_000),
          user: { timezone: 'America/Bogota' },
        }),
        updateMany: async () => ({ count: 0 }),
        deleteMany: async () => ({ count: 0 }),
      },
    } as unknown as DbClient;
    expect(await validateSession(db, 'token', 30)).toBeNull();
  });
});
```

Run: `npm test -w @finanzas/api -- src/modules/auth/sessions.test.ts`
Expected: FAIL (`db.session.update is not a function`).

- [ ] **Step 2: Renovar con `updateMany`**

En `apps/api/src/modules/auth/sessions.ts` reemplazar el bloque de renovación:

```ts
  let renewed = false;
  if (now - session.lastUsedAt.getTime() > RENEW_AFTER_MS) {
    // updateMany no falla si un logout simultáneo ya borró la sesión: en ese caso ya no es válida.
    const { count } = await db.session.updateMany({
      where: { id: session.id },
      data: { lastUsedAt: new Date(now), expiresAt: new Date(now + ttlDays * DAY_MS) },
    });
    if (count === 0) return null;
    renewed = true;
  }
  return { session, timezone: session.user.timezone, renewed };
```

Run: `npm test -w @finanzas/api -- src/modules/auth/sessions.test.ts`
Expected: PASS.

- [ ] **Step 3: Test de la deuda inicial que no queda vencida**

En `apps/api/src/domain/card-billing.test.ts`, dentro del `describe` que contiene `'treats the initial debt as already billed at the last cutoff before opening'`, agregar:

```ts
  it('bills the initial debt at the next cutoff when the last due date already passed (addendum §2)', () => {
    // Corte 31, pago 15: el último corte antes del 20 de octubre es el 30 de septiembre,
    // cuyo pago venció el 15 de octubre. Al registrar la tarjeta se asume que está al día.
    const charge = initialDebtCharge(
      { initialDebt: 800_000, initialDebtInstallments: 1, openingDate: '2026-10-20' },
      T31,
    );
    expect(charge).toEqual({ date: '2026-10-31', amount: 800_000, installments: 1 });
    const s = cardStatus({
      terms: T31,
      charges: [charge!],
      totalPayments: 0,
      debt: 800_000,
      today: '2026-10-20',
    });
    expect(s.amountDue).toBe(0);
    expect(s.isOverdue).toBe(false);
    expect(s.committed).toBe(800_000);
    expect(s.nextDueDate).toBe('2026-11-15');
  });
```

Run: `npm test -w @finanzas/api -- src/domain/card-billing.test.ts`
Expected: FAIL (la fecha sale `2026-09-30`).

- [ ] **Step 4: Ajustar `initialDebtCharge`**

En `apps/api/src/domain/card-billing.ts` reemplazar la función:

```ts
/**
 * La deuda que ya tenía la tarjeta al registrarla se factura en el último corte previo; si el pago
 * de ese corte ya venció, se asume que la tarjeta está al día y se factura en el corte siguiente.
 */
export function initialDebtCharge(
  card: { initialDebt: number; initialDebtInstallments: number; openingDate: IsoDate },
  terms: CardTerms,
): CardCharge | null {
  if (card.initialDebt <= 0) return null;
  const last = cutoffOnOrBefore(card.openingDate, terms);
  const date =
    dueDateForCutoff(last, terms) < card.openingDate ? shiftCutoff(last, 1, terms) : last;
  return { date, amount: card.initialDebt, installments: card.initialDebtInstallments };
}
```

Run: `npm test -w @finanzas/api -- src/domain/card-billing.test.ts`
Expected: PASS (incluido el test anterior con apertura el 6 de octubre, cuyo pago del 15 aún no vence).

- [ ] **Step 5: Test del filtro "desde ≤ hasta"**

En `apps/api/test/transactions-edit-list.test.ts`, dentro del `describe` principal, agregar:

```ts
  it('rejects a date range whose end is before its start', async () => {
    const { api } = await newUser();
    const res = await api.get('/api/transactions?from=2026-10-20&to=2026-10-01');
    expect(res.status).toBe(400);
    expect(res.body.error.fields.to).toBeTypeOf('string');
  });
```

Run: `npm test -w @finanzas/api -- test/transactions-edit-list.test.ts`
Expected: FAIL (responde 200).

- [ ] **Step 6: Validar el rango en el esquema compartido**

En `packages/shared/src/schemas/transactions.ts`, encadenar al final de `transactionListQuerySchema` (después del `z.object({ … })`):

```ts
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    path: ['to'],
    message: 'La fecha final debe ser igual o posterior a la inicial',
  });
```

Run: `npm test -w @finanzas/api -- test/transactions-edit-list.test.ts && npm run typecheck`
Expected: PASS.

---

### Task 4: Dominio — recurrencias

**Files:**
- Create: `apps/api/src/domain/recurrence.ts`
- Test: `apps/api/src/domain/recurrence.test.ts`

**Interfaces:**
- Consumes: `addDays`, `addMonths`, `dayOfMonth`, `diffDays`, `makeDate`, `yearMonth`, `Frequency`, `IsoDate` de `@finanzas/shared`.
- Produces:
  - `interface RecurrenceTerms { frequency: Frequency; intervalDays: number | null; day1: number | null; day2: number | null; startDate: IsoDate; endDate: IsoDate | null }`
  - `occurrences(rule: RecurrenceTerms, from: IsoDate, to: IsoDate): IsoDate[]` — fechas en `[from, to]`, nunca antes de `startDate` ni después de `endDate`, ordenadas y sin duplicados.
  - `nextOccurrence(rule: RecurrenceTerms, from: IsoDate): IsoDate | null`
  - `isOccurrence(rule: RecurrenceTerms, date: IsoDate): boolean`

- [ ] **Step 1: Escribir los tests**

Create `apps/api/src/domain/recurrence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isOccurrence, nextOccurrence, occurrences, type RecurrenceTerms } from './recurrence';

const rule = (r: Partial<RecurrenceTerms>): RecurrenceTerms => ({
  frequency: 'MONTHLY',
  intervalDays: null,
  day1: null,
  day2: null,
  startDate: '2026-01-01',
  endDate: null,
  ...r,
});

describe('occurrences', () => {
  it('MONTHLY on the 31st uses the last day of shorter months without drifting', () => {
    expect(occurrences(rule({ startDate: '2026-01-31' }), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('SEMIMONTHLY on the 15th and the last day', () => {
    const r = rule({ frequency: 'SEMIMONTHLY', day1: 15, day2: 31, startDate: '2026-02-01' });
    expect(occurrences(r, '2026-02-01', '2026-03-31')).toEqual([
      '2026-02-15',
      '2026-02-28',
      '2026-03-15',
      '2026-03-31',
    ]);
  });

  it('SEMIMONTHLY never returns dates before the start date', () => {
    const r = rule({ frequency: 'SEMIMONTHLY', day1: 15, day2: 31, startDate: '2026-10-20' });
    expect(occurrences(r, '2026-10-01', '2026-11-30')).toEqual([
      '2026-10-31',
      '2026-11-15',
      '2026-11-30',
    ]);
  });

  it('SEMIMONTHLY with both days collapsing in February returns the day once', () => {
    const r = rule({ frequency: 'SEMIMONTHLY', day1: 30, day2: 31 });
    expect(occurrences(r, '2026-02-01', '2026-02-28')).toEqual(['2026-02-28']);
  });

  it('WEEKLY keeps the weekday of the start date', () => {
    expect(occurrences(rule({ frequency: 'WEEKLY', startDate: '2026-10-01' }), '2026-10-10', '2026-10-31')).toEqual(
      ['2026-10-15', '2026-10-22', '2026-10-29'],
    );
  });

  it('CUSTOM_DAYS repeats every N days', () => {
    const r = rule({ frequency: 'CUSTOM_DAYS', intervalDays: 10, startDate: '2026-10-01' });
    expect(occurrences(r, '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-01',
      '2026-10-11',
      '2026-10-21',
      '2026-10-31',
    ]);
  });

  it('YEARLY on February 29 falls on the 28th in common years', () => {
    expect(occurrences(rule({ frequency: 'YEARLY', startDate: '2024-02-29' }), '2025-01-01', '2028-12-31')).toEqual(
      ['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29'],
    );
  });

  it('stops at the end date and starts at the start date', () => {
    const r = rule({ startDate: '2026-01-10', endDate: '2026-03-10' });
    expect(occurrences(r, '2025-06-01', '2026-12-31')).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
    ]);
    expect(occurrences(r, '2026-04-01', '2026-12-31')).toEqual([]);
  });
});

describe('nextOccurrence and isOccurrence', () => {
  it('finds the next date on or after a day', () => {
    expect(nextOccurrence(rule({ startDate: '2026-01-10' }), '2026-10-11')).toBe('2026-11-10');
    expect(nextOccurrence(rule({ frequency: 'YEARLY', startDate: '2026-03-01' }), '2026-03-02')).toBe(
      '2027-03-01',
    );
    expect(nextOccurrence(rule({ startDate: '2026-01-10', endDate: '2026-02-10' }), '2026-03-01')).toBeNull();
  });

  it('tells whether a date belongs to the rule', () => {
    const r = rule({ frequency: 'SEMIMONTHLY', day1: 15, day2: 31 });
    expect(isOccurrence(r, '2026-11-30')).toBe(true);
    expect(isOccurrence(r, '2026-11-15')).toBe(true);
    expect(isOccurrence(r, '2026-11-14')).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- src/domain/recurrence.test.ts`
Expected: FAIL — `Cannot find module './recurrence'`.

- [ ] **Step 3: Implementar**

Create `apps/api/src/domain/recurrence.ts`:

```ts
import {
  addDays,
  addMonths,
  dayOfMonth,
  diffDays,
  makeDate,
  yearMonth,
  type Frequency,
  type IsoDate,
} from '@finanzas/shared';

export interface RecurrenceTerms {
  frequency: Frequency;
  intervalDays: number | null;
  day1: number | null;
  day2: number | null;
  startDate: IsoDate;
  endDate: IsoDate | null;
}

const monthIndex = (date: IsoDate) => {
  const { year, month } = yearMonth(date);
  return year * 12 + month - 1;
};

/**
 * Spec 8.11: fechas de la regla dentro de [from, to] (incluidos), en orden y sin duplicados.
 * `MONTHLY` y `YEARLY` usan el día (y mes) de `startDate`; días 29–31 caen en el último día del mes.
 */
export function occurrences(rule: RecurrenceTerms, from: IsoDate, to: IsoDate): IsoDate[] {
  const lower = rule.startDate > from ? rule.startDate : from;
  const upper = rule.endDate !== null && rule.endDate < to ? rule.endDate : to;
  if (lower > upper) return [];
  const out: IsoDate[] = [];
  const push = (d: IsoDate) => {
    if (d >= lower && d <= upper && out[out.length - 1] !== d) out.push(d);
  };

  if (rule.frequency === 'WEEKLY' || rule.frequency === 'CUSTOM_DAYS') {
    const step = rule.frequency === 'WEEKLY' ? 7 : (rule.intervalDays ?? 0);
    if (step < 1) return [];
    const skipped = Math.ceil(diffDays(rule.startDate, lower) / step);
    for (let d = addDays(rule.startDate, skipped * step); d <= upper; d = addDays(d, step)) push(d);
    return out;
  }

  const day = dayOfMonth(rule.startDate);
  const startMonth = yearMonth(rule.startDate).month;
  for (let i = monthIndex(lower); i <= monthIndex(upper); i++) {
    const year = Math.floor(i / 12);
    const month = (i % 12) + 1;
    if (rule.frequency === 'MONTHLY') {
      push(makeDate(year, month, day));
    } else if (rule.frequency === 'YEARLY') {
      if (month === startMonth) push(makeDate(year, month, day));
    } else {
      push(makeDate(year, month, rule.day1 ?? 15));
      push(makeDate(year, month, rule.day2 ?? 31));
    }
  }
  return out;
}

/** Próxima fecha ≥ `from`; busca 13 meses adelante (cubre anual y cada 366 días). */
export function nextOccurrence(rule: RecurrenceTerms, from: IsoDate): IsoDate | null {
  return occurrences(rule, from, addMonths(from, 13))[0] ?? null;
}

export function isOccurrence(rule: RecurrenceTerms, date: IsoDate): boolean {
  return occurrences(rule, date, date).length === 1;
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w @finanzas/api -- src/domain/recurrence.test.ts`
Expected: PASS (10 tests).

---

### Task 5: Dominio — proyección de presupuestos y avance de metas

**Files:**
- Create: `apps/api/src/domain/budget.ts`
- Create: `apps/api/src/domain/goals.ts`
- Test: `apps/api/src/domain/budget.test.ts`, `apps/api/src/domain/goals.test.ts`

**Interfaces:**
- Produces:
  - `budgetProjection(i: { budget: number; spent: number; today: IsoDate }): { projectedSpend: number; exceedsOnDay: number | null }`
  - `usageOf(spent: number, budget: number): number` (0 si `budget` ≤ 0)
  - `goalProgress(g: { targetAmount: number; initialAmount: number; contributed: number; withdrawn: number; targetDate: IsoDate | null; today: IsoDate }): { progress: number; pct: number; remaining: number; monthlyNeeded: number | null; weeklyNeeded: number | null }`

- [ ] **Step 1: Escribir los tests**

Create `apps/api/src/domain/budget.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { budgetProjection, usageOf } from './budget';

describe('budgetProjection (spec 8.9)', () => {
  it('projects the month and tells the day the budget would be exceeded', () => {
    // 600.000 en 10 días = 60.000/día; 31 días → 1.860.000; el día 17 se llega a 1.020.000.
    expect(budgetProjection({ budget: 1_000_000, spent: 600_000, today: '2026-10-10' })).toEqual({
      projectedSpend: 1_860_000,
      exceedsOnDay: 17,
    });
  });

  it('gives no day when the projection fits or the budget is already exceeded', () => {
    expect(budgetProjection({ budget: 2_000_000, spent: 600_000, today: '2026-10-10' }).exceedsOnDay).toBeNull();
    expect(budgetProjection({ budget: 500_000, spent: 600_000, today: '2026-10-10' }).exceedsOnDay).toBeNull();
    expect(budgetProjection({ budget: 500_000, spent: 0, today: '2026-10-10' })).toEqual({
      projectedSpend: 0,
      exceedsOnDay: null,
    });
  });

  it('computes usage as a fraction', () => {
    expect(usageOf(750_000, 1_000_000)).toBe(0.75);
    expect(usageOf(10, 0)).toBe(0);
  });
});
```

Create `apps/api/src/domain/goals.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { goalProgress } from './goals';

describe('goalProgress (spec 8.10)', () => {
  it('computes progress and the monthly and weekly saving needed', () => {
    expect(
      goalProgress({
        targetAmount: 5_000_000,
        initialAmount: 1_000_000,
        contributed: 500_000,
        withdrawn: 100_000,
        targetDate: '2027-06-30',
        today: '2026-10-07',
      }),
    ).toEqual({
      progress: 1_400_000,
      pct: 0.28,
      remaining: 3_600_000,
      monthlyNeeded: 450_000, // 8 meses
      weeklyNeeded: 94_737, // 266 días = 38 semanas
    });
  });

  it('caps at 100 % and asks for nothing when reached', () => {
    const g = goalProgress({
      targetAmount: 1_000_000,
      initialAmount: 0,
      contributed: 1_200_000,
      withdrawn: 0,
      targetDate: '2027-01-31',
      today: '2026-10-07',
    });
    expect(g).toMatchObject({ pct: 1, remaining: 0, monthlyNeeded: 0, weeklyNeeded: 0 });
  });

  it('without a date gives no monthly target; past the date asks for everything now', () => {
    const base = { targetAmount: 1_000_000, initialAmount: 0, contributed: 0, withdrawn: 0, today: '2026-10-07' };
    expect(goalProgress({ ...base, targetDate: null })).toMatchObject({
      monthlyNeeded: null,
      weeklyNeeded: null,
    });
    expect(goalProgress({ ...base, targetDate: '2026-09-30' })).toMatchObject({
      monthlyNeeded: 1_000_000,
      weeklyNeeded: 1_000_000,
    });
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- src/domain/budget.test.ts src/domain/goals.test.ts`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar**

Create `apps/api/src/domain/budget.ts`:

```ts
import { dayOfMonth, daysInMonth, yearMonth, type IsoDate } from '@finanzas/shared';

export interface BudgetProjection {
  projectedSpend: number;
  /** Día del mes en que, a este ritmo, se superaría el presupuesto; null si no aplica. */
  exceedsOnDay: number | null;
}

/** Spec 8.9: ritmo = gastado ÷ días transcurridos (incluido hoy); proyectado = ritmo × días del mes. */
export function budgetProjection(i: { budget: number; spent: number; today: IsoDate }): BudgetProjection {
  const { year, month } = yearMonth(i.today);
  const total = daysInMonth(year, month);
  const rate = i.spent / dayOfMonth(i.today);
  const projectedSpend = Math.round(rate * total);
  if (rate <= 0 || i.spent > i.budget || projectedSpend <= i.budget) {
    return { projectedSpend, exceedsOnDay: null };
  }
  return { projectedSpend, exceedsOnDay: Math.min(total, Math.floor(i.budget / rate) + 1) };
}

export const usageOf = (spent: number, budget: number) => (budget > 0 ? spent / budget : 0);
```

Create `apps/api/src/domain/goals.ts`:

```ts
import { diffDays, monthsBetween, type IsoDate } from '@finanzas/shared';

export interface GoalProgress {
  progress: number;
  /** Fracción 0–1. */
  pct: number;
  remaining: number;
  monthlyNeeded: number | null;
  weeklyNeeded: number | null;
}

/** Spec 8.10: progreso = inicial + abonos − retiros; necesario = ⌈faltante ÷ max(1, periodos restantes)⌉. */
export function goalProgress(g: {
  targetAmount: number;
  initialAmount: number;
  contributed: number;
  withdrawn: number;
  targetDate: IsoDate | null;
  today: IsoDate;
}): GoalProgress {
  const progress = g.initialAmount + g.contributed - g.withdrawn;
  const remaining = Math.max(0, g.targetAmount - progress);
  const pct = Math.min(1, Math.max(0, progress) / g.targetAmount);
  if (!g.targetDate) return { progress, pct, remaining, monthlyNeeded: null, weeklyNeeded: null };
  const months = Math.max(1, monthsBetween(g.today, g.targetDate));
  const weeks = Math.max(1, Math.ceil(diffDays(g.today, g.targetDate) / 7));
  return {
    progress,
    pct,
    remaining,
    monthlyNeeded: Math.ceil(remaining / months),
    weeklyNeeded: Math.ceil(remaining / weeks),
  };
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w @finanzas/api -- src/domain/budget.test.ts src/domain/goals.test.ts`
Expected: PASS.

---

### Task 6: Dominio — ¿Cuánto puedo gastar hoy?

**Files:**
- Create: `apps/api/src/domain/spending-power.ts`
- Modify: `apps/api/src/domain/available.ts:12` (exportar `minus`)
- Test: `apps/api/src/domain/spending-power.test.ts`

**Interfaces:**
- Consumes: `exigibleAt`, `cardStatus`, `CardBillingInput` (`card-billing.ts`); `loanInstallmentDue`, `LoanTerms` (`loans.ts`); `pctOf` (`savings.ts`); `minus` (`available.ts`).
- Produces:
  - `interface DatedAmount { date: IsoDate; amount: number }`
  - `interface SpendingPowerInput { today; liquidBase; reserve; savingsPct; investmentPct; expectedIncomes: DatedAmount[]; obligations: DatedAmount[]; cards: CardBillingInput[]; loans: LoanTerms[]; budget: { amount: number; spentBase: number; pendingObligations: number } | null; spentToday: number }`
  - `interface SpendingPowerResult extends SpendingPowerDTO { endOfMonthBalance: number }` (`SpendingPowerDTO` de `@finanzas/shared`)
  - `spendingPower(i: SpendingPowerInput): SpendingPowerResult`

Reglas (spec 8.7 con las decisiones 1 y 2 de este plan): para cada día `t` de hoy a fin de mes, `F(t) = liquidBase − reserve + ingresos esperados (hoy < fecha ≤ t) × (1 − ahorro% − inversión%) − obligaciones (fecha ≤ t) − Σ PagoTarjeta(t) [en t = fin de mes: Σ deuda comprometida] − Σ CuotaPréstamo(t)`; `A = min F(t) ÷ (t − hoy + 1)`; `B = max(0, presupuesto − gastadoBase − obligacionesDelAlcance) ÷ días restantes`; `diario` = redondeo hacia abajo a $100 de `max(0, min(A, B))`.

- [ ] **Step 1: Escribir los tests**

Create `apps/api/src/domain/spending-power.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { spendingPower, type SpendingPowerInput } from './spending-power';

const base: SpendingPowerInput = {
  today: '2026-10-10', // octubre: 22 días de hoy a fin de mes, incluido hoy
  liquidBase: 0,
  reserve: 0,
  savingsPct: 20,
  investmentPct: 10,
  expectedIncomes: [],
  obligations: [],
  cards: [],
  loans: [],
  budget: null,
  spentToday: 0,
};
const run = (i: Partial<SpendingPowerInput>) => spendingPower({ ...base, ...i });

describe('spendingPower (spec 8.7)', () => {
  it('spreads liquid money over the rest of the month', () => {
    const r = run({ liquidBase: 2_200_000 });
    expect(r).toMatchObject({ daily: 100_000, limitedBy: 'LIQUIDITY', reason: null, endOfMonthBalance: 2_200_000 });
    expect(r.breakdown.liquidity).toMatchObject({ daily: 100_000, bindingDate: '2026-10-31', days: 22 });
    expect(r.breakdown.budget).toBeNull();
  });

  it('does not let you spend today the salary that arrives on the 15th', () => {
    const r = run({
      liquidBase: 100_000,
      expectedIncomes: [{ date: '2026-10-15', amount: 3_000_000 }],
    });
    // Hasta el 14 solo hay 100.000 para 5 días.
    expect(r.daily).toBe(20_000);
    expect(r.breakdown.liquidity).toMatchObject({ bindingDate: '2026-10-14', days: 5 });
  });

  it('counts expected income net of the savings and investment percentages', () => {
    const r = run({ liquidBase: 0, expectedIncomes: [{ date: '2026-10-11', amount: 2_200_000 }] });
    // Hoy no hay nada: la cifra es 0 aunque mañana lleguen 2.200.000 × 70 %.
    expect(r.daily).toBe(0);
    const later = run({ liquidBase: 22_000, expectedIncomes: [{ date: '2026-10-11', amount: 2_200_000 }] });
    expect(later.breakdown.liquidity.bindingDate).toBe('2026-10-10');
    expect(later.endOfMonthBalance).toBe(22_000 + 1_540_000);
  });

  it('subtracts overdue obligations from today', () => {
    const r = run({ liquidBase: 500_000, obligations: [{ date: '2026-10-05', amount: 300_000 }] });
    expect(r.daily).toBe(9_000); // 200.000 / 22 = 9.090 → 9.000
  });

  it('returns 0 with the main cause when obligations exceed the money', () => {
    const r = run({
      liquidBase: 100_000,
      obligations: [{ date: '2026-10-20', amount: 400_000 }],
      spentToday: 15_000,
    });
    expect(r).toMatchObject({
      daily: 0,
      remainingToday: -15_000,
      reason: 'Tus obligaciones pendientes del mes no dejan margen.',
    });
  });

  it('applies the budget limit when it is lower', () => {
    const r = run({
      liquidBase: 10_000_000,
      budget: { amount: 1_000_000, spentBase: 560_000, pendingObligations: 0 },
      spentToday: 5_000,
    });
    expect(r).toMatchObject({ daily: 20_000, remainingToday: 15_000, limitedBy: 'BUDGET' });
    expect(r.breakdown.budget).toMatchObject({ daily: 20_000, days: 22 });
    const withObligations = run({
      liquidBase: 10_000_000,
      budget: { amount: 1_000_000, spentBase: 560_000, pendingObligations: 200_000 },
    });
    expect(withObligations.daily).toBe(10_900);
    const exhausted = run({
      liquidBase: 10_000_000,
      budget: { amount: 1_000_000, spentBase: 1_200_000, pendingObligations: 0 },
    });
    expect(exhausted).toMatchObject({ daily: 0, reason: 'Ya usaste el presupuesto de este mes.' });
  });

  it('charges the card payment on its due date and the committed debt at month end', () => {
    const r = run({
      liquidBase: 1_000_000,
      cards: [
        {
          terms: { statementDay: 15, paymentDueDay: 30 },
          charges: [{ date: '2026-10-03', amount: 600_000, installments: 1 }],
          totalPayments: 0,
          debt: 600_000,
          today: '2026-10-10',
        },
      ],
    });
    expect(r.daily).toBe(18_100); // 400.000 / 22
    const cards = r.breakdown.liquidity.items.find((x) => x.key === 'cards');
    expect(cards?.amount).toBe(-600_000);
  });

  it('ignores a loan installment dated before the loan was registered', () => {
    const loan = { balance: 8_000_000, monthlyPayment: 450_000, paidThisMonth: 0 };
    expect(
      run({ liquidBase: 2_200_000, loans: [{ ...loan, paymentDay: 5, openingDate: '2026-10-08' }] }).daily,
    ).toBe(100_000);
    expect(
      run({ liquidBase: 2_200_000, loans: [{ ...loan, paymentDay: 25, openingDate: '2026-01-01' }] }).daily,
    ).toBe(79_500); // 1.750.000 / 22
  });

  it('keeps the savings reserve apart', () => {
    expect(run({ liquidBase: 2_200_000, reserve: 220_000 }).daily).toBe(90_000);
  });

  it('works on the last day of the month', () => {
    const r = run({ today: '2026-10-31', liquidBase: 50_000 });
    expect(r.breakdown.liquidity).toMatchObject({ daily: 50_000, days: 1, bindingDate: '2026-10-31' });
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- src/domain/spending-power.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Exportar `minus`**

En `apps/api/src/domain/available.ts` cambiar la línea 12:

```ts
export const minus = (v: number) => (v === 0 ? 0 : -v);
```

- [ ] **Step 4: Implementar**

Create `apps/api/src/domain/spending-power.ts`:

```ts
import {
  addDays,
  diffDays,
  endOfMonth,
  type BreakdownItem,
  type IsoDate,
  type SpendingPowerDTO,
} from '@finanzas/shared';
import { minus } from './available';
import { cardStatus, exigibleAt, type CardBillingInput } from './card-billing';
import { loanInstallmentDue, type LoanTerms } from './loans';
import { pctOf } from './savings';

export interface DatedAmount {
  date: IsoDate;
  amount: number;
}

export interface SpendingPowerInput {
  today: IsoDate;
  /** Dinero líquido sin los gastos discrecionales de hoy (base del día). */
  liquidBase: number;
  /** R0: ahorro e inversión por separar de lo ya recibido (spec 8.5). */
  reserve: number;
  savingsPct: number;
  investmentPct: number;
  /** Ingresos esperados PENDING; solo cuentan los de hoy < fecha ≤ t. */
  expectedIncomes: DatedAmount[];
  /** Obligaciones PENDING con fecha ≤ fin de mes (incluye vencidas). */
  obligations: DatedAmount[];
  /** Tarjetas sin las compras discrecionales de hoy. */
  cards: CardBillingInput[];
  loans: LoanTerms[];
  /** null si el mes no tiene presupuesto. */
  budget: { amount: number; spentBase: number; pendingObligations: number } | null;
  spentToday: number;
}

export interface SpendingPowerResult extends SpendingPowerDTO {
  /** F(fin de mes): para la alerta de proyección negativa. */
  endOfMonthBalance: number;
}

interface Terms {
  liquid: number;
  reserve: number;
  incomes: number;
  obligations: number;
  cards: number;
  loans: number;
}

const floor100 = (v: number) => Math.floor(v / 100) * 100;
const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
const balanceOf = (x: Terms) => x.liquid - x.reserve + x.incomes - x.obligations - x.cards - x.loans;

function termsAt(i: SpendingPowerInput, t: IsoDate, monthEnd: IsoDate): Terms {
  const incoming = sum(
    i.expectedIncomes.filter((x) => x.date > i.today && x.date <= t).map((x) => x.amount),
  );
  return {
    liquid: i.liquidBase,
    reserve: i.reserve,
    incomes: incoming - pctOf(incoming, i.savingsPct + i.investmentPct),
    obligations: sum(i.obligations.filter((x) => x.date <= t).map((x) => x.amount)),
    cards: sum(i.cards.map((c) => (t < monthEnd ? exigibleAt(c, t) : cardStatus(c).committed))),
    loans: sum(i.loans.map((l) => loanInstallmentDue(l, i.today, t))),
  };
}

const REASONS = {
  obligations: 'Tus obligaciones pendientes del mes no dejan margen.',
  cards: 'Los pagos de tus tarjetas no dejan margen.',
  loans: 'Las cuotas de tus préstamos no dejan margen.',
  reserve: 'Lo que debes separar para ahorro e inversión no deja margen.',
} as const;

/** Spec 8.7: "el término que más resta". */
function mainReason(x: Terms): string {
  const candidates: Array<[keyof typeof REASONS, number]> = [
    ['obligations', x.obligations],
    ['cards', x.cards],
    ['loans', x.loans],
    ['reserve', x.reserve],
  ];
  const [key, amount] = candidates.reduce((a, b) => (b[1] > a[1] ? b : a));
  return amount > 0 ? REASONS[key] : 'No tienes dinero disponible en tus cuentas.';
}

function liquidityItems(x: Terms): BreakdownItem[] {
  return [
    { key: 'liquid', label: 'Dinero líquido', amount: x.liquid },
    { key: 'reserve', label: 'Ahorro e inversión por separar', amount: minus(x.reserve) },
    { key: 'incomes', label: 'Ingresos esperados (sin el % de ahorro)', amount: x.incomes },
    { key: 'obligations', label: 'Obligaciones pendientes', amount: minus(x.obligations) },
    { key: 'cards', label: 'Pagos de tarjetas', amount: minus(x.cards) },
    { key: 'loans', label: 'Cuotas de préstamos', amount: minus(x.loans) },
  ];
}

export function spendingPower(i: SpendingPowerInput): SpendingPowerResult {
  const monthEnd = endOfMonth(i.today);
  const daysLeft = diffDays(i.today, monthEnd) + 1;

  let binding: { date: IsoDate; days: number; terms: Terms; daily: number } | null = null;
  let endOfMonthBalance = 0;
  for (let t = i.today; t <= monthEnd; t = addDays(t, 1)) {
    const terms = termsAt(i, t, monthEnd);
    const days = diffDays(i.today, t) + 1;
    const daily = balanceOf(terms) / days;
    if (!binding || daily < binding.daily) binding = { date: t, days, terms, daily };
    if (t === monthEnd) endOfMonthBalance = balanceOf(terms);
  }
  const b = binding!;

  const budgetRaw = i.budget
    ? Math.max(0, i.budget.amount - i.budget.spentBase - i.budget.pendingObligations) / daysLeft
    : null;
  const daily = floor100(Math.max(0, Math.min(b.daily, budgetRaw ?? Infinity)));
  const limitedBy = budgetRaw !== null && budgetRaw < b.daily ? 'BUDGET' : 'LIQUIDITY';
  const reason =
    daily > 0
      ? null
      : limitedBy === 'BUDGET'
        ? 'Ya usaste el presupuesto de este mes.'
        : mainReason(b.terms);

  return {
    daily,
    spentToday: i.spentToday,
    remainingToday: daily - i.spentToday,
    limitedBy,
    reason,
    breakdown: {
      liquidity: {
        daily: floor100(Math.max(0, b.daily)),
        bindingDate: b.date,
        days: b.days,
        items: liquidityItems(b.terms),
      },
      budget:
        i.budget && budgetRaw !== null
          ? {
              daily: floor100(budgetRaw),
              days: daysLeft,
              items: [
                { key: 'budget', label: 'Presupuesto del mes', amount: i.budget.amount },
                { key: 'spent', label: 'Ya gastado este mes', amount: minus(i.budget.spentBase) },
                {
                  key: 'obligations',
                  label: 'Obligaciones pendientes del mes',
                  amount: minus(i.budget.pendingObligations),
                },
              ],
            }
          : null,
    },
    endOfMonthBalance,
  };
}
```

- [ ] **Step 5: Verificar que pasan**

Run: `npm test -w @finanzas/api -- src/domain/spending-power.test.ts src/domain/available.test.ts`
Expected: PASS.

---

### Task 7: Dominio — alertas y estado general

**Files:**
- Create: `apps/api/src/domain/alerts.ts`
- Test: `apps/api/src/domain/alerts.test.ts`

**Interfaces:**
- Consumes: `AlertDTO`, `AlertLevel`, `StatusDTO`, `formatCOP` y utilidades de fecha de `@finanzas/shared`.
- Produces:
  - `shortDate(date: IsoDate): string` (`05 oct`)
  - `median(values: number[]): number`
  - `interface UnusualExpense { id: string; categoryName: string; description: string | null; amount: number }`
  - `unusualExpenses(recent: Array<UnusualExpense & { categoryId: string }>, history: ReadonlyMap<string, number[]>): UnusualExpense[]`
  - `interface AlertsInput` (campos abajo) y `computeAlerts(i: AlertsInput): AlertDTO[]` ordenadas DANGER → WARNING → INFO
  - `interface StatusInput { today; budget: { budget: number; spent: number; projectedSpend: number } | null; monthExpense; projectedIncome; projectionNegative: boolean }` y `overallStatus(i: StatusInput): StatusDTO`

Claves (incluyen el periodo; descartar guarda la clave): `budget:<mes>:total|<categoryId>:<50|75|90|100>`, `savings:<mes>`, `card-limit:<mes>:<id>:<80|95>`, `card-due:<id>:<fecha>`, `card-overdue:<id>:<fecha>`, `obligation-due:<id>:<fecha>`, `obligation-overdue:<id>:<fecha>`, `overspend:<mes>`, `unusual:<transactionId>`, `low-balance:<hoy>`, `projection:<mes>`, `income-late:<id>:<fecha>`, `negative-balance:<accountId>:<mes>`.

- [ ] **Step 1: Escribir los tests**

Create `apps/api/src/domain/alerts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  computeAlerts,
  median,
  overallStatus,
  shortDate,
  unusualExpenses,
  type AlertsInput,
} from './alerts';

const base: AlertsInput = {
  today: '2026-10-20',
  hasAccounts: true,
  budget: { total: null, lines: [] },
  savings: { target: 0, actual: 0 },
  cards: [],
  obligations: [],
  expectedIncomes: [],
  monthIncome: 0,
  monthExpense: 0,
  unusual: [],
  available: 1_000_000,
  lowBalanceThreshold: 100_000,
  projectedEndBalance: 0,
  negativeAccounts: [],
};
const alerts = (i: Partial<AlertsInput>) => computeAlerts({ ...base, ...i });
const keys = (i: Partial<AlertsInput>) => alerts(i).map((a) => a.key);
const card = {
  id: 'c1',
  name: 'Nu',
  utilization: 0.1,
  amountDue: 0,
  dueDate: '2026-10-30',
  isOverdue: false,
};

describe('computeAlerts (spec 8.12)', () => {
  it('is quiet when everything is fine', () => {
    expect(alerts({})).toEqual([]);
  });

  it('shows only the highest budget threshold reached', () => {
    const total = (spent: number) => ({ budget: { total: { budget: 1_000_000, spent }, lines: [] } });
    expect(keys(total(490_000))).toEqual([]);
    expect(alerts(total(500_000))[0]).toMatchObject({ key: 'budget:2026-10:total:50', level: 'INFO' });
    expect(alerts(total(750_000))[0]).toMatchObject({ key: 'budget:2026-10:total:75', level: 'WARNING' });
    expect(alerts(total(900_000))[0]).toMatchObject({ key: 'budget:2026-10:total:90', level: 'WARNING' });
    expect(alerts(total(1_000_000))[0]).toMatchObject({
      key: 'budget:2026-10:total:100',
      level: 'DANGER',
      title: 'Superaste el presupuesto',
    });
    const line = alerts({
      budget: {
        total: null,
        lines: [{ categoryId: 'cat1', name: 'Mercado', budget: 400_000, spent: 380_000 }],
      },
    });
    expect(line[0]).toMatchObject({
      key: 'budget:2026-10:cat1:90',
      title: 'Llevas el 95 % del presupuesto de Mercado',
    });
  });

  it('warns about savings after the middle of the month', () => {
    expect(keys({ savings: { target: 800_000, actual: 300_000 } })).toEqual(['savings:2026-10']);
    expect(keys({ savings: { target: 800_000, actual: 400_000 } })).toEqual([]);
    expect(keys({ today: '2026-10-15', savings: { target: 800_000, actual: 0 } })).toEqual([]);
  });

  it('warns about card limits, upcoming and overdue payments', () => {
    expect(alerts({ cards: [{ ...card, utilization: 0.8 }] })[0]).toMatchObject({
      key: 'card-limit:2026-10:c1:80',
      level: 'WARNING',
    });
    expect(alerts({ cards: [{ ...card, utilization: 0.96 }] })[0]).toMatchObject({
      key: 'card-limit:2026-10:c1:95',
      level: 'DANGER',
    });
    expect(keys({ cards: [{ ...card, amountDue: 300_000, dueDate: '2026-10-25' }] })).toEqual([
      'card-due:c1:2026-10-25',
    ]);
    expect(keys({ cards: [{ ...card, amountDue: 300_000, dueDate: '2026-10-26' }] })).toEqual([]);
    expect(
      alerts({ cards: [{ ...card, amountDue: 300_000, dueDate: '2026-10-15', isOverdue: true }] })[0],
    ).toMatchObject({ key: 'card-overdue:c1:2026-10-15', level: 'DANGER' });
  });

  it('warns about obligations due in 3 days and overdue ones', () => {
    const o = (dueDate: string) => ({ obligations: [{ id: 'o1', name: 'Arriendo', dueDate, amount: 1_000_000 }] });
    expect(alerts(o('2026-10-23'))[0]).toMatchObject({
      key: 'obligation-due:o1:2026-10-23',
      title: 'Arriendo vence el 23 oct',
    });
    expect(alerts(o('2026-10-20'))[0]?.title).toBe('Arriendo vence hoy');
    expect(keys(o('2026-10-24'))).toEqual([]);
    expect(alerts(o('2026-10-19'))[0]).toMatchObject({
      key: 'obligation-overdue:o1:2026-10-19',
      level: 'DANGER',
    });
  });

  it('covers overspending, unusual expenses, low money, negative projection, late income and negative balances', () => {
    expect(keys({ monthIncome: 1_000_000, monthExpense: 1_200_000 })).toEqual(['overspend:2026-10']);
    expect(
      keys({ unusual: [{ id: 't1', categoryName: 'Compras', description: 'TV', amount: 2_000_000 }] }),
    ).toEqual(['unusual:t1']);
    expect(keys({ available: 50_000 })).toEqual(['low-balance:2026-10-20']);
    expect(keys({ available: 50_000, hasAccounts: false })).toEqual([]);
    expect(keys({ projectedEndBalance: -10_000 })).toEqual(['projection:2026-10']);
    const income = (dueDate: string) => ({
      expectedIncomes: [{ id: 'i1', name: 'Salario', dueDate, amount: 2_000_000 }],
    });
    expect(keys(income('2026-10-15'))).toEqual(['income-late:i1:2026-10-15']);
    expect(keys(income('2026-10-25'))).toEqual([]);
    expect(keys({ negativeAccounts: [{ id: 'a1', name: 'Nequi', balance: -5_000 }] })).toEqual([
      'negative-balance:a1:2026-10',
    ]);
  });

  it('sorts danger first, then warnings, then information', () => {
    const levels = alerts({
      unusual: [{ id: 't1', categoryName: 'Compras', description: null, amount: 1 }],
      monthIncome: 0,
      monthExpense: 10,
      projectedEndBalance: -1,
    }).map((a) => a.level);
    expect(levels).toEqual(['DANGER', 'WARNING', 'INFO']);
  });
});

describe('unusualExpenses and helpers', () => {
  const history = new Map([['cat', [10_000, 12_000, 11_000, 9_000, 13_000]]]);
  const recent = (amount: number, categoryId = 'cat') => [
    { id: 't', categoryId, categoryName: 'Comida', description: null, amount },
  ];
  it('flags more than 3 × the median with at least 5 data points', () => {
    expect(unusualExpenses(recent(40_000), history)).toHaveLength(1);
    expect(unusualExpenses(recent(30_000), history)).toHaveLength(0);
    expect(unusualExpenses(recent(40_000), new Map([['cat', [1, 1, 1, 1]]]))).toHaveLength(0);
    expect(unusualExpenses(recent(40_000, 'otra'), history)).toHaveLength(0);
  });
  it('computes medians and short dates', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(shortDate('2026-10-05')).toBe('05 oct');
  });
});

describe('overallStatus (spec 8.12)', () => {
  const s = (i: Partial<Parameters<typeof overallStatus>[0]>) =>
    overallStatus({
      today: '2026-10-20',
      budget: null,
      monthExpense: 0,
      projectedIncome: 0,
      projectionNegative: false,
      ...i,
    });

  it('asks for data when there is nothing to compare', () => {
    expect(s({})).toEqual({
      level: 'OK',
      title: 'Vas bien',
      message: 'Registra tus ingresos y gastos para ver cómo vas este mes.',
    });
  });

  it('uses the budget usage and the projection', () => {
    expect(s({ budget: { budget: 1_000_000, spent: 950_000, projectedSpend: 1_200_000 } }).level).toBe('DANGER');
    expect(s({ budget: { budget: 1_000_000, spent: 760_000, projectedSpend: 900_000 } }).level).toBe('WARNING');
    expect(s({ budget: { budget: 1_000_000, spent: 400_000, projectedSpend: 620_000 } })).toEqual({
      level: 'OK',
      title: 'Vas bien',
      message: 'Has utilizado el 40 % de tu presupuesto y quedan 12 días.',
    });
    expect(s({ budget: { budget: 1_000_000, spent: 300_000, projectedSpend: 1_100_000 } }).level).toBe(
      'WARNING',
    );
    expect(
      s({ today: '2026-10-05', budget: { budget: 1_000_000, spent: 500_000, projectedSpend: 900_000 } }).level,
    ).toBe('WARNING');
    expect(s({ projectionNegative: true }).level).toBe('DANGER');
  });

  it('without a budget compares expenses with the projected income', () => {
    expect(s({ monthExpense: 1_000_000, projectedIncome: 2_000_000 })).toEqual({
      level: 'OK',
      title: 'Vas bien',
      message: 'Has gastado el 50 % de tu ingreso del mes y quedan 12 días.',
    });
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- src/domain/alerts.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Create `apps/api/src/domain/alerts.ts`:

```ts
import {
  dayOfMonth,
  daysInMonth,
  diffDays,
  endOfMonth,
  formatCOP,
  monthKey,
  yearMonth,
  type AlertDTO,
  type AlertLevel,
  type IsoDate,
  type StatusDTO,
} from '@finanzas/shared';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `05 oct` (spec 8.14). */
export function shortDate(date: IsoDate): string {
  const { month } = yearMonth(date);
  return `${String(dayOfMonth(date)).padStart(2, '0')} ${MONTHS[month - 1]!}`;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface UnusualExpense {
  id: string;
  categoryName: string;
  description: string | null;
  amount: number;
}

/** Spec 8.12: más de 3 × la mediana de su categoría en los 90 días previos, con al menos 5 datos. */
export function unusualExpenses(
  recent: Array<UnusualExpense & { categoryId: string }>,
  history: ReadonlyMap<string, number[]>,
): UnusualExpense[] {
  return recent
    .filter((r) => {
      const values = history.get(r.categoryId) ?? [];
      return values.length >= 5 && r.amount > 3 * median(values);
    })
    .map((r) => ({
      id: r.id,
      categoryName: r.categoryName,
      description: r.description,
      amount: r.amount,
    }));
}

export interface BudgetUsage {
  budget: number;
  spent: number;
}

export interface AlertsInput {
  today: IsoDate;
  /** Sin cuentas no se avisa "dinero bajo" (usuario nuevo). */
  hasAccounts: boolean;
  budget: {
    total: BudgetUsage | null;
    lines: Array<BudgetUsage & { categoryId: string; name: string }>;
  };
  /** Objetivo de ahorro del mes (% × ingreso proyectado) y ahorro real. */
  savings: { target: number; actual: number };
  cards: Array<{
    id: string;
    name: string;
    utilization: number;
    amountDue: number;
    dueDate: IsoDate;
    isOverdue: boolean;
  }>;
  /** Obligaciones PENDING. */
  obligations: Array<{ id: string; name: string; dueDate: IsoDate; amount: number }>;
  /** Ingresos esperados PENDING. */
  expectedIncomes: Array<{ id: string; name: string; dueDate: IsoDate; amount: number }>;
  monthIncome: number;
  monthExpense: number;
  unusual: UnusualExpense[];
  available: number;
  lowBalanceThreshold: number;
  /** F(fin de mes) − gasto discrecional diario promedio × días restantes. */
  projectedEndBalance: number;
  negativeAccounts: Array<{ id: string; name: string; balance: number }>;
}

const LEVEL_ORDER: Record<AlertLevel, number> = { DANGER: 0, WARNING: 1, INFO: 2 };
const BUDGET_STEPS: Array<[number, AlertLevel]> = [
  [1, 'DANGER'],
  [0.9, 'WARNING'],
  [0.75, 'WARNING'],
  [0.5, 'INFO'],
];
const pct = (v: number) => `${Math.round(v * 100)} %`;
const when = (days: number, date: IsoDate) =>
  days === 0 ? 'hoy' : days === 1 ? 'mañana' : `el ${shortDate(date)}`;

function budgetAlert(month: string, id: string, label: string, u: BudgetUsage): AlertDTO | null {
  if (u.budget <= 0) return null;
  const usage = u.spent / u.budget;
  const step = BUDGET_STEPS.find(([threshold]) => usage >= threshold);
  if (!step) return null;
  const [threshold, level] = step;
  return {
    key: `budget:${month}:${id}:${Math.round(threshold * 100)}`,
    level,
    title:
      threshold >= 1
        ? `Superaste el presupuesto${label}`
        : `Llevas el ${pct(usage)} del presupuesto${label}`,
    message: `Has gastado ${formatCOP(u.spent)} de ${formatCOP(u.budget)}.`,
    href: '/budgets',
  };
}

export function computeAlerts(i: AlertsInput): AlertDTO[] {
  const month = monthKey(i.today);
  const { year, month: m } = yearMonth(i.today);
  const out: AlertDTO[] = [];
  const add = (a: AlertDTO | null) => {
    if (a) out.push(a);
  };

  if (i.budget.total) add(budgetAlert(month, 'total', '', i.budget.total));
  for (const line of i.budget.lines) add(budgetAlert(month, line.categoryId, ` de ${line.name}`, line));

  if (
    dayOfMonth(i.today) > daysInMonth(year, m) / 2 &&
    i.savings.target > 0 &&
    i.savings.actual < i.savings.target / 2
  ) {
    add({
      key: `savings:${month}`,
      level: 'WARNING',
      title: 'Tu ahorro va por debajo del objetivo',
      message: `Llevas ${formatCOP(i.savings.actual)} de ${formatCOP(i.savings.target)} este mes.`,
      href: '/settings',
    });
  }

  for (const c of i.cards) {
    if (c.utilization >= 0.95 || c.utilization >= 0.8) {
      const high = c.utilization >= 0.95;
      add({
        key: `card-limit:${month}:${c.id}:${high ? 95 : 80}`,
        level: high ? 'DANGER' : 'WARNING',
        title: `${c.name} está cerca del límite`,
        message: `Usas el ${pct(c.utilization)} del cupo.`,
        href: `/cards/${c.id}`,
      });
    }
    if (c.amountDue <= 0) continue;
    const days = diffDays(i.today, c.dueDate);
    if (c.isOverdue) {
      add({
        key: `card-overdue:${c.id}:${c.dueDate}`,
        level: 'DANGER',
        title: `El pago de ${c.name} está vencido`,
        message: `Debías pagar ${formatCOP(c.amountDue)} el ${shortDate(c.dueDate)}.`,
        href: `/cards/${c.id}`,
      });
    } else if (days >= 0 && days <= 5) {
      add({
        key: `card-due:${c.id}:${c.dueDate}`,
        level: 'WARNING',
        title: `El pago de ${c.name} vence ${when(days, c.dueDate)}`,
        message: `Pago del mes: ${formatCOP(c.amountDue)}.`,
        href: `/cards/${c.id}`,
      });
    }
  }

  for (const o of i.obligations) {
    const days = diffDays(i.today, o.dueDate);
    if (days < 0) {
      add({
        key: `obligation-overdue:${o.id}:${o.dueDate}`,
        level: 'DANGER',
        title: `${o.name} está vencida`,
        message: `Vencía el ${shortDate(o.dueDate)}: ${formatCOP(o.amount)}.`,
        href: '/recurring',
      });
    } else if (days <= 3) {
      add({
        key: `obligation-due:${o.id}:${o.dueDate}`,
        level: 'WARNING',
        title: `${o.name} vence ${when(days, o.dueDate)}`,
        message: `${formatCOP(o.amount)}.`,
        href: '/recurring',
      });
    }
  }

  if (i.monthExpense > i.monthIncome) {
    add({
      key: `overspend:${month}`,
      level: 'WARNING',
      title: 'Gastas más de lo que ganas este mes',
      message: `Gastos ${formatCOP(i.monthExpense)} · Ingresos ${formatCOP(i.monthIncome)}.`,
      href: '/transactions',
    });
  }

  for (const u of i.unusual) {
    add({
      key: `unusual:${u.id}`,
      level: 'INFO',
      title: `Gasto inusual en ${u.categoryName}`,
      message: `${u.description ?? 'Un movimiento'} de ${formatCOP(u.amount)} supera 3 veces lo normal en esa categoría.`,
      href: '/transactions',
    });
  }

  if (i.hasAccounts && i.available < i.lowBalanceThreshold) {
    add({
      key: `low-balance:${i.today}`,
      level: 'WARNING',
      title: 'Tu dinero disponible está bajo',
      message: `Disponible estimado: ${formatCOP(i.available)}.`,
      href: null,
    });
  }

  if (i.projectedEndBalance < 0) {
    add({
      key: `projection:${month}`,
      level: 'DANGER',
      title: 'A este ritmo terminarás el mes en negativo',
      message: `Proyección a fin de mes: ${formatCOP(i.projectedEndBalance)}.`,
      href: null,
    });
  }

  for (const x of i.expectedIncomes) {
    if (x.dueDate >= i.today) continue;
    add({
      key: `income-late:${x.id}:${x.dueDate}`,
      level: 'INFO',
      title: `¿Ya recibiste ${x.name}?`,
      message: `Esperabas ${formatCOP(x.amount)} el ${shortDate(x.dueDate)}. Márcalo como recibido u omítelo.`,
      href: '/recurring',
    });
  }

  for (const a of i.negativeAccounts) {
    add({
      key: `negative-balance:${a.id}:${month}`,
      level: 'WARNING',
      title: `${a.name} tiene saldo negativo`,
      message: `Saldo: ${formatCOP(a.balance)}.`,
      href: '/accounts',
    });
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

export interface StatusInput {
  today: IsoDate;
  /** Presupuesto general del mes (o Σ de líneas) con lo gastado en su alcance; null si no hay. */
  budget: { budget: number; spent: number; projectedSpend: number } | null;
  monthExpense: number;
  projectedIncome: number;
  projectionNegative: boolean;
}

/** Spec 8.12 "Estado general". */
export function overallStatus(i: StatusInput): StatusDTO {
  const { year, month } = yearMonth(i.today);
  const progress = dayOfMonth(i.today) / daysInMonth(year, month);
  const daysLeft = diffDays(i.today, endOfMonth(i.today)) + 1;
  const usage = i.budget
    ? i.budget.budget > 0
      ? i.budget.spent / i.budget.budget
      : null
    : i.projectedIncome > 0
      ? i.monthExpense / i.projectedIncome
      : null;
  const left = daysLeft === 1 ? 'queda 1 día' : `quedan ${daysLeft} días`;
  const message =
    usage === null
      ? 'Registra tus ingresos y gastos para ver cómo vas este mes.'
      : i.budget
        ? `Has utilizado el ${pct(usage)} de tu presupuesto y ${left}.`
        : `Has gastado el ${pct(usage)} de tu ingreso del mes y ${left}.`;

  if ((usage !== null && usage >= 0.9) || i.projectionNegative) {
    return { level: 'DANGER', title: 'Debes controlar tus gastos', message };
  }
  if (
    (usage !== null && (usage >= 0.75 || usage > progress + 0.1)) ||
    (i.budget !== null && i.budget.projectedSpend > i.budget.budget)
  ) {
    return { level: 'WARNING', title: 'Cuidado', message };
  }
  return { level: 'OK', title: 'Vas bien', message };
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w @finanzas/api -- src/domain/alerts.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

---

### Task 8: Eliminar y restaurar con historial (addendum §3)

**Files:**
- Modify: `packages/shared/src/schemas/accounts.ts`, `categories.ts`, `credit-cards.ts`, `debts.ts` (quitar `isActive` de los esquemas de actualización)
- Modify: `apps/api/src/lib/errors.ts`
- Create: `apps/api/src/modules/planning/cascade.ts`
- Modify: `apps/api/src/modules/accounts/service.ts`, `apps/api/src/modules/accounts/routes.ts`
- Modify: `apps/api/src/modules/credit-cards/service.ts`, `apps/api/src/modules/credit-cards/routes.ts`
- Modify: `apps/api/src/modules/debts/service.ts`, `apps/api/src/modules/debts/routes.ts`
- Modify: `apps/api/src/modules/categories/service.ts`, `apps/api/src/modules/categories/routes.ts`
- Modify: `apps/api/src/modules/transactions/refs.ts:68-71`, `apps/api/src/modules/transactions/service.ts`
- Create: `apps/api/test/lifecycle.test.ts`
- Modify (tests existentes): `apps/api/test/accounts.test.ts`, `cards-debts.test.ts`, `in-use.test.ts`, `transactions.test.ts`, `transactions-edit-list.test.ts`, `categories.test.ts`

**Interfaces:**
- Consumes: `formatCOP`, `startOfMonth`, `DeleteResultDTO` de `@finanzas/shared`; `accountBalance`, `cardDebt`, `loanBalance` (ya existen).
- Produces:
  - `entityDeleted(name: string, action: string): AppError` (409 `ENTITY_DELETED`) en `lib/errors.ts`.
  - `type DeletedRef = { accountId: string } | { creditCardId: string } | { categoryIds: string[] }` y `cascadeSoftDelete(tx: Prisma.TransactionClient, userId: string, ref: DeletedRef, today: IsoDate): Promise<void>` en `modules/planning/cascade.ts`.
  - Servicios: `deleteAccount(db: PrismaClient, auth: AuthContext, id): Promise<DeleteResultDTO>`, `restoreAccount(db: DbClient, userId, id): Promise<AccountDTO>`; `deleteCreditCard(db: PrismaClient, auth, id)`, `restoreCreditCard(db: DbClient, auth, id): Promise<CreditCardDTO>`; `deleteDebt(db: DbClient, auth, id)`, `restoreDebt(db: DbClient, auth, id): Promise<DebtDTO>`; `deleteCategory(db: PrismaClient, auth, id)`, `restoreCategory(db: DbClient, userId, id): Promise<CategoryDTO>`.
  - `findSystemCategory` restaura automáticamente la categoría del sistema si estaba eliminada.
  - En `transactions/service.ts`: `fullRowData(input: TransactionInput)` (fila completa con `null` en los campos que no aplican) — la Task 9 la reutiliza.
  - Rutas: `DELETE /api/{accounts|credit-cards|debts|categories}/:id` → 200 `{ deleted }`; `POST /api/{accounts|credit-cards|debts|categories}/:id/restore` → 200 `{ account | card | debt | category }`.

- [ ] **Step 1: Escribir los tests del nuevo modelo**

Create `apps/api/test/lifecycle.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { toDbDate } from '../src/lib/db';
import { setupFinances } from './finance-fixtures';
import { createTestApp, registerUser, type Client } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

async function newUser() {
  const { api, user } = await registerUser(app);
  return { api, userId: user.id, f: await setupFinances(api) };
}

const expense = (api: Client, accountId: string, categoryId: string, amount: number) =>
  api.post('/api/transactions', { type: 'EXPENSE', amount, date: TODAY, accountId, categoryId });

type Cat = { id: string; isActive: boolean; systemKey: string | null };

describe('delete and restore keep the history (addendum §3)', () => {
  it('deletes an unused account for good', async () => {
    const { api, f } = await newUser();
    const res = await api.del(`/api/accounts/${f.wallet}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 'hard' });
    expect((await api.get(`/api/accounts/${f.wallet}`)).status).toBe(404);
  });

  it('requires a zero balance and says how much is left', async () => {
    const { api, f } = await newUser();
    const res = await api.del(`/api/accounts/${f.bank}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_HAS_BALANCE');
    expect(res.body.error.message).toContain('$2.000.000');
  });

  it('freezes the money of movements that belong to a deleted account (review focus #3)', async () => {
    const { api, f } = await newUser();
    const tx = (await expense(api, f.cash, f.cat.food, 100_000)).body.transaction.id as string;
    const del = await api.del(`/api/accounts/${f.cash}`);
    expect(del.body).toEqual({ deleted: 'soft' });
    expect((await api.get(`/api/accounts/${f.cash}`)).body.account).toMatchObject({
      isActive: false,
      balance: 0,
    });

    const history = await api.get(`/api/transactions?accountId=${f.cash}`);
    expect(history.body.items[0].account).toMatchObject({ id: f.cash, isActive: false });

    const again = await expense(api, f.cash, f.cat.food, 1000);
    expect(again.status).toBe(400);
    expect(again.body.error.fields.accountId).toMatch(/eliminada/);

    const body = { type: 'EXPENSE', amount: 100_000, date: TODAY, accountId: f.cash, categoryId: f.cat.food };
    expect((await api.put(`/api/transactions/${tx}`, { ...body, description: 'Mercado' })).status).toBe(200);
    const changed = await api.put(`/api/transactions/${tx}`, { ...body, amount: 90_000 });
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe('ENTITY_DELETED');
    expect((await api.put(`/api/transactions/${tx}`, { ...body, date: '2026-10-19' })).status).toBe(409);
    expect((await api.del(`/api/transactions/${tx}`)).status).toBe(409);
    expect((await api.get(`/api/accounts/${f.cash}`)).body.account.balance).toBe(0);
    expect((await api.put(`/api/accounts/${f.cash}`, { name: 'Caja' })).status).toBe(409);

    const restored = await api.post(`/api/accounts/${f.cash}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.account.isActive).toBe(true);
    expect((await api.put(`/api/transactions/${tx}`, { ...body, amount: 90_000 })).status).toBe(200);
  });

  it('keeps the name of a deleted account and points to Eliminados', async () => {
    const { api, f } = await newUser();
    await expense(api, f.cash, f.cat.food, 100_000);
    await api.del(`/api/accounts/${f.cash}`);
    const dup = await api.post('/api/accounts', { name: 'Efectivo', type: 'CASH' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toContain('Restáurala desde Eliminados');
  });

  it('pauses the rules that use a deleted account and removes their pending occurrences', async () => {
    const { api, userId, f } = await newUser();
    await expense(api, f.cash, f.cat.food, 100_000);
    const rule = await app.prisma.recurringRule.create({
      data: {
        userId,
        name: 'Almuerzo',
        kind: 'EXPENSE',
        amount: 20_000n,
        categoryId: f.cat.food,
        accountId: f.cash,
        frequency: 'WEEKLY',
        startDate: toDbDate('2026-10-06'),
        activeFrom: toDbDate('2026-10-06'),
      },
    });
    const item = (date: string, status: 'PENDING' | 'SKIPPED') =>
      app.prisma.scheduledItem.create({
        data: {
          userId,
          recurringRuleId: rule.id,
          kind: 'EXPENSE',
          name: 'Almuerzo',
          amount: 20_000n,
          categoryId: f.cat.food,
          accountId: f.cash,
          ruleDate: toDbDate(date),
          dueDate: toDbDate(date),
          status,
        },
      });
    await item('2026-10-13', 'SKIPPED');
    await item('2026-10-27', 'PENDING');
    await app.prisma.scheduledItem.create({
      data: {
        userId,
        kind: 'EXPENSE',
        name: 'SOAT',
        amount: 500_000n,
        categoryId: f.cat.food,
        accountId: f.cash,
        dueDate: toDbDate('2026-11-01'),
      },
    });

    await api.del(`/api/accounts/${f.cash}`);
    expect((await app.prisma.recurringRule.findUniqueOrThrow({ where: { id: rule.id } })).isActive).toBe(
      false,
    );
    const left = await app.prisma.scheduledItem.findMany({ where: { userId } });
    expect(left.map((i) => i.status)).toEqual(['SKIPPED']);
  });

  it('cards need zero debt; with purchases they are soft-deleted and can be restored', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 100_000,
      date: TODAY,
      categoryId: f.cat.food,
    });
    const blocked = await api.del(`/api/credit-cards/${f.card}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CARD_HAS_DEBT');
    await api.post(`/api/credit-cards/${f.card}/payment`, { amount: 100_000, date: TODAY, accountId: f.bank });
    expect((await api.del(`/api/credit-cards/${f.card}`)).body).toEqual({ deleted: 'soft' });
    const purchase = await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 1000,
      date: TODAY,
      categoryId: f.cat.food,
    });
    expect(purchase.status).toBe(400);
    const restored = await api.post(`/api/credit-cards/${f.card}/restore`);
    expect(restored.body.card).toMatchObject({ isActive: true, debt: 0 });
  });

  it('loans need a zero balance; an unused loan is deleted for good', async () => {
    const { api, f } = await newUser();
    const blocked = await api.del(`/api/debts/${f.debt}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('DEBT_HAS_BALANCE');
    expect(blocked.body.error.message).toContain('$8.000.000');
    await api.put(`/api/debts/${f.debt}`, { initialBalance: 0 });
    expect((await api.del(`/api/debts/${f.debt}`)).body).toEqual({ deleted: 'hard' });
  });

  it('a parent category takes its subcategories with it and brings them back', async () => {
    const { api, f } = await newUser();
    const child = (
      await api.post('/api/categories', { name: 'Domicilios', kind: 'EXPENSE', parentId: f.cat.food })
    ).body.category.id as string;
    await expense(api, f.bank, child, 30_000);
    expect((await api.del(`/api/categories/${f.cat.food}`)).body).toEqual({ deleted: 'soft' });
    const cats = (await api.get('/api/categories')).body.items as Cat[];
    expect(cats.find((c) => c.id === child)?.isActive).toBe(false);
    expect((await expense(api, f.bank, child, 1000)).status).toBe(400);

    const early = await api.post(`/api/categories/${child}/restore`);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('PARENT_DELETED');
    await api.post(`/api/categories/${f.cat.food}/restore`);
    const after = (await api.get('/api/categories')).body.items as Cat[];
    expect(after.find((c) => c.id === child)?.isActive).toBe(true);
  });

  it('drops budget lines of a deleted category from this month on, never from the past', async () => {
    const { api, userId, f } = await newUser();
    const budget = async (month: string) => {
      const b = await app.prisma.budget.create({ data: { userId, month: toDbDate(month) } });
      await app.prisma.budgetCategory.create({
        data: { userId, budgetId: b.id, categoryId: f.cat.fun, amount: 200_000n },
      });
    };
    await budget('2026-09-01');
    await budget('2026-10-01');
    expect((await api.del(`/api/categories/${f.cat.fun}`)).body).toEqual({ deleted: 'soft' });
    const lines = await app.prisma.budgetCategory.findMany({
      where: { userId },
      include: { budget: true },
    });
    expect(lines.map((l) => l.budget.month.toISOString().slice(0, 7))).toEqual(['2026-09']);
  });

  it('system categories are editable and deletable, and come back when the app needs them', async () => {
    const { api, f } = await newUser();
    const cats = (await api.get('/api/categories')).body.items as Cat[];
    const adjustment = cats.find((c) => c.systemKey === 'ADJUSTMENT_EXPENSE')!;
    expect((await api.put(`/api/categories/${adjustment.id}`, { name: 'Correcciones' })).status).toBe(200);
    expect((await api.put(`/api/categories/${f.cat.interest}`, { parentId: f.cat.food })).status).toBe(400);

    expect((await api.del(`/api/categories/${f.cat.interest}`)).body).toEqual({ deleted: 'soft' });
    const pay = await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 100_000,
      interest: 20_000,
      date: TODAY,
    });
    expect(pay.status).toBe(201);
    const after = (await api.get('/api/categories')).body.items as Cat[];
    expect(after.find((c) => c.id === f.cat.interest)?.isActive).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- test/lifecycle.test.ts`
Expected: FAIL (los `DELETE` responden 204/409 con el modelo anterior; no existen las rutas `/restore`).

- [ ] **Step 3: Quitar `isActive` de los esquemas de actualización**

En `packages/shared/src/schemas/accounts.ts`, `categories.ts`, `credit-cards.ts` y `debts.ts`, borrar la línea `isActive: z.boolean().optional(),` del esquema `…UpdateSchema`. (Solo `DELETE` y `/restore` cambian `isActive`.)

- [ ] **Step 4: Error de elemento eliminado**

En `apps/api/src/lib/errors.ts`, debajo de `conflict`:

```ts
/** Addendum §3.1: lo eliminado es de solo lectura hasta restaurarlo. */
export const entityDeleted = (name: string, action: string) =>
  conflict('ENTITY_DELETED', `Restaura "${name}" desde Eliminados para ${action}.`);
```

- [ ] **Step 5: Efectos en cadena**

Create `apps/api/src/modules/planning/cascade.ts`:

```ts
import { startOfMonth, type IsoDate } from '@finanzas/shared';
import type { Prisma } from '../../generated/prisma/client';
import { toDbDate } from '../../lib/db';

export type DeletedRef = { accountId: string } | { creditCardId: string } | { categoryIds: string[] };

/**
 * Addendum §3.3: al eliminar lógicamente una cuenta, una tarjeta o categorías se pausan las reglas que
 * las usan y se borran las ocurrencias pendientes; para categorías, también sus líneas de presupuesto
 * del mes actual en adelante. El historial (movimientos, DONE/SKIPPED, meses pasados) no cambia.
 */
export async function cascadeSoftDelete(
  tx: Prisma.TransactionClient,
  userId: string,
  ref: DeletedRef,
  today: IsoDate,
) {
  const match =
    'accountId' in ref
      ? { accountId: ref.accountId }
      : 'creditCardId' in ref
        ? { creditCardId: ref.creditCardId }
        : { categoryId: { in: ref.categoryIds } };
  const rules = await tx.recurringRule.findMany({ where: { userId, ...match }, select: { id: true } });
  const ruleIds = rules.map((r) => r.id);
  if (ruleIds.length > 0) {
    await tx.recurringRule.updateMany({
      where: { userId, id: { in: ruleIds } },
      data: { isActive: false },
    });
  }
  await tx.scheduledItem.deleteMany({
    where: { userId, status: 'PENDING', OR: [{ recurringRuleId: { in: ruleIds } }, match] },
  });
  if ('categoryIds' in ref) {
    await tx.budgetCategory.deleteMany({
      where: {
        userId,
        categoryId: { in: ref.categoryIds },
        budget: { month: { gte: toDbDate(startOfMonth(today)) } },
      },
    });
  }
}
```

- [ ] **Step 6: Cuentas**

En `apps/api/src/modules/accounts/service.ts`:

1. Imports:

```ts
import {
  formatCOP,
  type AccountCreateInput,
  type AccountDTO,
  type AccountUpdateInput,
  type DeleteResultDTO,
} from '@finanzas/shared';
import { applyLedger } from '../../domain/ledger';
import type { Account, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { conflict, entityDeleted, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import { ledgerEntries } from '../ledger/repository';
import { cascadeSoftDelete } from '../planning/cascade';
```

2. Debajo de `NAME_TAKEN`:

```ts
/** Un nombre ocupado por una cuenta eliminada se recupera restaurándola (addendum §3.1). */
async function nameTaken(db: DbClient, userId: string, name: string) {
  const other = await db.account.findUnique({
    where: { userId_name: { userId, name } },
    select: { isActive: true },
  });
  return other && !other.isActive
    ? conflict(
        'ACCOUNT_NAME_TAKEN',
        'Ya tienes una cuenta eliminada con ese nombre. Restáurala desde Eliminados.',
      )
    : NAME_TAKEN();
}
```

3. En `createAccount`, el `catch` queda: `if (isUniqueViolation(err)) throw await nameTaken(db, auth.userId, input.name);`

4. Reemplazar `updateAccount` y `deleteAccount` por:

```ts
export async function updateAccount(
  db: DbClient,
  userId: string,
  id: string,
  input: AccountUpdateInput,
): Promise<AccountDTO> {
  const account = await findAccount(db, userId, id);
  if (!account.isActive) throw entityDeleted(account.name, 'editarla');
  if (input.type && input.type !== 'SAVINGS' && input.type !== 'INVESTMENT') {
    if ((await db.goal.count({ where: { userId, accountId: id } })) > 0) {
      throw conflict(
        'ACCOUNT_HAS_GOALS',
        'Esta cuenta guarda metas: debe seguir siendo de ahorro o inversión.',
      );
    }
  }
  try {
    const updated = await db.account.update({
      where: { id_userId: { id, userId } },
      data: {
        name: input.name,
        type: input.type,
        institution: input.institution,
        initialBalance:
          input.initialBalance !== undefined ? BigInt(input.initialBalance) : undefined,
        openingDate: input.openingDate ? toDbDate(input.openingDate) : undefined,
        icon: input.icon,
        color: input.color,
        sortOrder: input.sortOrder,
      },
    });
    return toAccountDTO(updated, await accountBalance(db, userId, updated));
  } catch (err) {
    if (isUniqueViolation(err)) throw await nameTaken(db, userId, input.name ?? account.name);
    throw err;
  }
}

/** Addendum §3: sin referencias se borra; con historial se elimina lógicamente. Exige saldo $0. */
export async function deleteAccount(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
): Promise<DeleteResultDTO> {
  const { userId } = auth;
  const account = await findAccount(db, userId, id);
  if (!account.isActive) return { deleted: 'soft' };
  const balance = await accountBalance(db, userId, account);
  if (balance !== 0) {
    throw conflict(
      'ACCOUNT_HAS_BALANCE',
      `La cuenta tiene un saldo de ${formatCOP(balance)}. Déjala en $0 antes de eliminarla: transfiere el dinero, ajusta el saldo o corrige el saldo inicial.`,
    );
  }
  if ((await db.goal.count({ where: { userId, accountId: id } })) > 0) {
    throw conflict(
      'ACCOUNT_HAS_GOALS',
      'Esta cuenta guarda metas. Elimínalas o muévelas a otra cuenta antes de eliminarla.',
    );
  }
  const [transactions, rules, items] = await Promise.all([
    db.transaction.count({ where: { userId, OR: [{ accountId: id }, { toAccountId: id }] } }),
    db.recurringRule.count({ where: { userId, accountId: id } }),
    db.scheduledItem.count({ where: { userId, accountId: id } }),
  ]);
  if (transactions + rules + items === 0) {
    await db.account.delete({ where: { id_userId: { id, userId } } });
    return { deleted: 'hard' };
  }
  await db.$transaction(async (tx) => {
    await tx.account.update({ where: { id_userId: { id, userId } }, data: { isActive: false } });
    await cascadeSoftDelete(tx, userId, { accountId: id }, auth.today);
  });
  return { deleted: 'soft' };
}

export async function restoreAccount(db: DbClient, userId: string, id: string): Promise<AccountDTO> {
  await findAccount(db, userId, id);
  const account = await db.account.update({
    where: { id_userId: { id, userId } },
    data: { isActive: true },
  });
  return toAccountDTO(account, await accountBalance(db, userId, account));
}
```

En `apps/api/src/modules/accounts/routes.ts`, importar `restoreAccount` y reemplazar la ruta `DELETE`:

```ts
  app.delete('/accounts/:id', async (req) =>
    deleteAccount(app.prisma, req.auth, parseId(req.params)),
  );

  app.post('/accounts/:id/restore', async (req) => ({
    account: await restoreAccount(app.prisma, req.auth.userId, parseId(req.params)),
  }));
```

- [ ] **Step 7: Tarjetas**

En `apps/api/src/modules/credit-cards/service.ts`:

1. Agregar a los imports `formatCOP` y `type DeleteResultDTO` (de `@finanzas/shared`), `type PrismaClient` (del cliente generado), `entityDeleted` (de `lib/errors`) y `import { cascadeSoftDelete } from '../planning/cascade';`.

2. Debajo de `NAME_TAKEN`:

```ts
async function nameTaken(db: DbClient, userId: string, name: string) {
  const other = await db.creditCard.findUnique({
    where: { userId_name: { userId, name } },
    select: { isActive: true },
  });
  return other && !other.isActive
    ? conflict(
        'CARD_NAME_TAKEN',
        'Ya tienes una tarjeta eliminada con ese nombre. Restáurala desde Eliminados.',
      )
    : NAME_TAKEN();
}
```

3. En `createCreditCard`, el `catch` queda: `if (isUniqueViolation(err)) throw await nameTaken(db, auth.userId, input.name);`

4. En `updateCreditCard`, reemplazar el bloque `if (input.isActive === false && card.isActive) { … }` por:

```ts
  if (!card.isActive) throw entityDeleted(card.name, 'editarla');
```

borrar `isActive: input.isActive,` del `data`, y cambiar su `catch` a `if (isUniqueViolation(err)) throw await nameTaken(db, auth.userId, input.name ?? card.name);`.

5. Reemplazar `deleteCreditCard` por:

```ts
export async function deleteCreditCard(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
): Promise<DeleteResultDTO> {
  const { userId } = auth;
  const card = await findCreditCard(db, userId, id);
  if (!card.isActive) return { deleted: 'soft' };
  const debt = await cardDebt(db, userId, card);
  if (debt !== 0) {
    throw conflict(
      'CARD_HAS_DEBT',
      debt > 0
        ? `La tarjeta tiene una deuda de ${formatCOP(debt)}. Págala o corrige la deuda inicial antes de eliminarla.`
        : `La tarjeta tiene un saldo a favor de ${formatCOP(-debt)}. Déjala en $0 antes de eliminarla.`,
    );
  }
  const counts = await Promise.all([
    db.transaction.count({ where: { userId, creditCardId: id } }),
    db.recurringRule.count({ where: { userId, creditCardId: id } }),
    db.scheduledItem.count({ where: { userId, creditCardId: id } }),
  ]);
  if (counts.every((c) => c === 0)) {
    await db.creditCard.delete({ where: { id_userId: { id, userId } } });
    return { deleted: 'hard' };
  }
  await db.$transaction(async (tx) => {
    await tx.creditCard.update({ where: { id_userId: { id, userId } }, data: { isActive: false } });
    await cascadeSoftDelete(tx, userId, { creditCardId: id }, auth.today);
  });
  return { deleted: 'soft' };
}

export async function restoreCreditCard(db: DbClient, auth: AuthContext, id: string) {
  await findCreditCard(db, auth.userId, id);
  await db.creditCard.update({
    where: { id_userId: { id, userId: auth.userId } },
    data: { isActive: true },
  });
  return getCreditCard(db, auth.userId, id, auth.today);
}
```

En `apps/api/src/modules/credit-cards/routes.ts`, importar `restoreCreditCard` y reemplazar la ruta `DELETE`:

```ts
  app.delete('/credit-cards/:id', async (req) =>
    deleteCreditCard(app.prisma, req.auth, parseId(req.params)),
  );

  app.post('/credit-cards/:id/restore', async (req) => ({
    card: await restoreCreditCard(app.prisma, req.auth, parseId(req.params)),
  }));
```

- [ ] **Step 8: Préstamos**

En `apps/api/src/modules/debts/service.ts`:

1. Agregar a los imports `formatCOP` y `type DeleteResultDTO`, y `entityDeleted` de `lib/errors`.

2. Debajo de `NAME_TAKEN`:

```ts
async function nameTaken(db: DbClient, userId: string, name: string) {
  const other = await db.debt.findUnique({
    where: { userId_name: { userId, name } },
    select: { isActive: true },
  });
  return other && !other.isActive
    ? conflict(
        'DEBT_NAME_TAKEN',
        'Ya tienes un préstamo eliminado con ese nombre. Restáuralo desde Eliminados.',
      )
    : NAME_TAKEN();
}
```

3. En `createDebt`, el `catch` queda: `if (isUniqueViolation(err)) throw await nameTaken(db, auth.userId, input.name);`

4. En `updateDebt`, reemplazar el bloque `if (input.isActive === false && debt.isActive) { … }` por:

```ts
  if (!debt.isActive) throw entityDeleted(debt.name, 'editarlo');
```

borrar `isActive: input.isActive,` del `data` y cambiar su `catch` a `if (isUniqueViolation(err)) throw await nameTaken(db, auth.userId, input.name ?? debt.name);`.

5. Reemplazar `deleteDebt` por:

```ts
export async function deleteDebt(
  db: DbClient,
  auth: AuthContext,
  id: string,
): Promise<DeleteResultDTO> {
  const { userId } = auth;
  const debt = await findDebt(db, userId, id);
  if (!debt.isActive) return { deleted: 'soft' };
  const balance = await loanBalance(db, userId, debt);
  if (balance !== 0) {
    throw conflict(
      'DEBT_HAS_BALANCE',
      `El préstamo tiene un saldo de ${formatCOP(balance)}. Págalo, corrige el saldo inicial o elimina sus movimientos antes de eliminarlo.`,
    );
  }
  if ((await db.transaction.count({ where: { userId, debtId: id } })) === 0) {
    await db.debt.delete({ where: { id_userId: { id, userId } } });
    return { deleted: 'hard' };
  }
  await db.debt.update({ where: { id_userId: { id, userId } }, data: { isActive: false } });
  return { deleted: 'soft' };
}

export async function restoreDebt(db: DbClient, auth: AuthContext, id: string) {
  await findDebt(db, auth.userId, id);
  await db.debt.update({
    where: { id_userId: { id, userId: auth.userId } },
    data: { isActive: true },
  });
  return getDebt(db, auth.userId, id, auth.today);
}
```

En `apps/api/src/modules/debts/routes.ts`, importar `restoreDebt` y reemplazar la ruta `DELETE`:

```ts
  app.delete('/debts/:id', async (req) => deleteDebt(app.prisma, req.auth, parseId(req.params)));

  app.post('/debts/:id/restore', async (req) => ({
    debt: await restoreDebt(app.prisma, req.auth, parseId(req.params)),
  }));
```

- [ ] **Step 9: Categorías**

Reemplazar el contenido de `apps/api/src/modules/categories/service.ts` por:

```ts
import type {
  CategoryCreateInput,
  CategoryDTO,
  CategoryKind,
  CategoryUpdateInput,
  DeleteResultDTO,
} from '@finanzas/shared';
import type { Category, PrismaClient } from '../../generated/prisma/client';
import { badRequest, conflict, entityDeleted, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import { cascadeSoftDelete } from '../planning/cascade';

const NAME_TAKEN = () => conflict('CATEGORY_NAME_TAKEN', 'Ya tienes una categoría con ese nombre.');

export function toCategoryDTO(c: Category): CategoryDTO {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    parentId: c.parentId,
    bucket: c.bucket,
    icon: c.icon,
    color: c.color,
    isSystem: c.isSystem,
    systemKey: c.systemKey,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
  };
}

async function findCategory(db: DbClient, userId: string, id: string): Promise<Category> {
  const category = await db.category.findUnique({ where: { id_userId: { id, userId } } });
  if (!category) throw notFound('Categoría no encontrada.');
  return category;
}

/** Addendum §3.4: si la app necesita una categoría del sistema eliminada, la restaura. */
export async function findSystemCategory(
  db: DbClient,
  userId: string,
  systemKey: string,
): Promise<Category> {
  const category = await db.category.findUnique({
    where: { userId_systemKey: { userId, systemKey } },
  });
  if (!category) throw new Error(`Missing system category ${systemKey} for user`);
  if (category.isActive) return category;
  return db.category.update({
    where: { id_userId: { id: category.id, userId } },
    data: { isActive: true },
  });
}

async function validParent(
  db: DbClient,
  userId: string,
  parentId: string,
  kind: CategoryKind,
  selfId?: string,
) {
  const parent = await db.category.findUnique({ where: { id_userId: { id: parentId, userId } } });
  if (!parent)
    throw badRequest('INVALID_REFERENCE', 'Revisa la categoría padre.', {
      parentId: 'Categoría padre no encontrada',
    });
  if (parent.id === selfId)
    throw badRequest('INVALID_PARENT', 'Una categoría no puede ser su propia subcategoría.', {
      parentId: 'Inválida',
    });
  if (!parent.isActive)
    throw badRequest('INVALID_PARENT', 'La categoría principal fue eliminada.', {
      parentId: 'Categoría eliminada',
    });
  if (parent.parentId)
    throw badRequest('INVALID_PARENT', 'Solo se permite un nivel de subcategorías.', {
      parentId: 'Elige una categoría principal',
    });
  if (parent.kind !== kind)
    throw badRequest(
      'INVALID_PARENT',
      'La subcategoría debe ser del mismo tipo que su categoría principal.',
      { parentId: 'Tipo distinto' },
    );
  if (parent.isSystem)
    throw badRequest(
      'INVALID_PARENT',
      'No se pueden crear subcategorías de una categoría del sistema.',
      { parentId: 'No permitida' },
    );
  return parent;
}

async function assertRootNameFree(
  db: DbClient,
  userId: string,
  kind: CategoryKind,
  name: string,
  exceptId?: string,
) {
  const existing = await db.category.findFirst({
    where: {
      userId,
      kind,
      parentId: null,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId && { id: { not: exceptId } }),
    },
    select: { isActive: true },
  });
  if (!existing) return;
  if (!existing.isActive) {
    throw conflict(
      'CATEGORY_NAME_TAKEN',
      'Ya tienes una categoría eliminada con ese nombre. Restáurala desde Eliminados.',
    );
  }
  throw NAME_TAKEN();
}

export async function listCategories(db: DbClient, userId: string): Promise<CategoryDTO[]> {
  const items = await db.category.findMany({
    where: { userId },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return items.map(toCategoryDTO);
}

export async function createCategory(
  db: DbClient,
  userId: string,
  input: CategoryCreateInput,
): Promise<CategoryDTO> {
  let bucket = input.kind === 'EXPENSE' ? (input.bucket ?? 'OTHER') : null;
  if (input.parentId) {
    const parent = await validParent(db, userId, input.parentId, input.kind);
    if (input.kind === 'EXPENSE') bucket = input.bucket ?? parent.bucket ?? 'OTHER';
  } else {
    await assertRootNameFree(db, userId, input.kind, input.name);
  }
  const sortOrder = await db.category.count({ where: { userId } });
  try {
    const created = await db.category.create({
      data: {
        userId,
        name: input.name,
        kind: input.kind,
        parentId: input.parentId,
        bucket,
        icon: input.icon,
        color: input.color,
        sortOrder,
      },
    });
    return toCategoryDTO(created);
  } catch (err) {
    if (isUniqueViolation(err)) throw NAME_TAKEN();
    throw err;
  }
}

export async function updateCategory(
  db: DbClient,
  userId: string,
  id: string,
  input: CategoryUpdateInput,
): Promise<CategoryDTO> {
  const current = await findCategory(db, userId, id);
  if (!current.isActive) throw entityDeleted(current.name, 'editarla');
  if (input.bucket && current.kind === 'INCOME') {
    throw badRequest('INVALID_BUCKET', 'Las categorías de ingreso no tienen bolsa.', {
      bucket: 'No aplica',
    });
  }
  if (input.parentId && current.systemKey) {
    throw badRequest('INVALID_PARENT', 'Las categorías del sistema no pueden ser subcategorías.', {
      parentId: 'No permitida',
    });
  }
  if (input.parentId) {
    await validParent(db, userId, input.parentId, current.kind, id);
    if ((await db.category.count({ where: { userId, parentId: id } })) > 0) {
      throw badRequest(
        'INVALID_PARENT',
        'Una categoría con subcategorías no puede volverse subcategoría.',
        { parentId: 'No permitida' },
      );
    }
  }
  const finalParent = input.parentId !== undefined ? input.parentId : current.parentId;
  if (!finalParent && (input.name || input.parentId === null)) {
    await assertRootNameFree(db, userId, current.kind, input.name ?? current.name, id);
  }
  try {
    const updated = await db.category.update({
      where: { id_userId: { id, userId } },
      data: {
        name: input.name,
        parentId: input.parentId,
        bucket: input.bucket,
        icon: input.icon,
        color: input.color,
        sortOrder: input.sortOrder,
      },
    });
    return toCategoryDTO(updated);
  } catch (err) {
    if (isUniqueViolation(err)) throw NAME_TAKEN();
    throw err;
  }
}

/**
 * Addendum §3: una categoría principal se elimina con sus subcategorías. Sin referencias se borran;
 * con historial (o si es del sistema) se eliminan lógicamente y se aplican los efectos en cadena.
 */
export async function deleteCategory(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
): Promise<DeleteResultDTO> {
  const { userId } = auth;
  const category = await findCategory(db, userId, id);
  if (!category.isActive) return { deleted: 'soft' };
  const children = await db.category.findMany({
    where: { userId, parentId: id },
    select: { id: true },
  });
  const ids = [id, ...children.map((c) => c.id)];
  const counts = await Promise.all([
    db.transaction.count({ where: { userId, categoryId: { in: ids } } }),
    db.budgetCategory.count({ where: { userId, categoryId: { in: ids } } }),
    db.recurringRule.count({ where: { userId, categoryId: { in: ids } } }),
    db.scheduledItem.count({ where: { userId, categoryId: { in: ids } } }),
  ]);
  if (!category.systemKey && counts.every((c) => c === 0)) {
    await db.$transaction([
      db.category.deleteMany({ where: { userId, parentId: id } }),
      db.category.delete({ where: { id_userId: { id, userId } } }),
    ]);
    return { deleted: 'hard' };
  }
  await db.$transaction(async (tx) => {
    await tx.category.updateMany({ where: { userId, id: { in: ids } }, data: { isActive: false } });
    await cascadeSoftDelete(tx, userId, { categoryIds: ids }, auth.today);
  });
  return { deleted: 'soft' };
}

/** Restaurar una principal restaura sus subcategorías; una subcategoría exige su principal activa. */
export async function restoreCategory(
  db: DbClient,
  userId: string,
  id: string,
): Promise<CategoryDTO> {
  const category = await findCategory(db, userId, id);
  if (category.parentId) {
    const parent = await findCategory(db, userId, category.parentId);
    if (!parent.isActive) {
      throw conflict('PARENT_DELETED', `Restaura primero "${parent.name}".`);
    }
  }
  await db.category.updateMany({
    where: { userId, OR: [{ id }, { parentId: id }] },
    data: { isActive: true },
  });
  return toCategoryDTO(await findCategory(db, userId, id));
}
```

En `apps/api/src/modules/categories/routes.ts`, importar `restoreCategory` y reemplazar la ruta `DELETE`:

```ts
  app.delete('/categories/:id', async (req) =>
    deleteCategory(app.prisma, req.auth, parseId(req.params)),
  );

  app.post('/categories/:id/restore', async (req) => ({
    category: await restoreCategory(app.prisma, req.auth.userId, parseId(req.params)),
  }));
```

- [ ] **Step 10: Movimientos de elementos eliminados**

En `apps/api/src/modules/transactions/refs.ts` cambiar los mensajes (líneas 68–71):

```ts
  checkActive('accountId', account, 'Cuenta no encontrada', 'La cuenta fue eliminada');
  checkActive('toAccountId', toAccount, 'Cuenta no encontrada', 'La cuenta fue eliminada');
  checkActive('creditCardId', card, 'Tarjeta no encontrada', 'La tarjeta fue eliminada');
  checkActive('debtId', debt, 'Préstamo no encontrado', 'El préstamo fue eliminado');
```

En `apps/api/src/modules/transactions/service.ts`:

1. Imports: `import type { Prisma, PrismaClient, Transaction } from '../../generated/prisma/client';` y `import { badRequest, entityDeleted, notFound } from '../../lib/errors';`.

2. Debajo de `rowData` agregar:

```ts
const NO_REFS = {
  accountId: null,
  toAccountId: null,
  creditCardId: null,
  debtId: null,
  categoryId: null,
  goalId: null,
  installments: null,
  paymentMethod: null,
};

/** Fila completa del tipo: los campos que no aplican quedan en null (para editar y comparar). */
export function fullRowData(input: TransactionInput) {
  return { ...NO_REFS, type: input.type, ...rowData(input) };
}

const holder = { select: { name: true, isActive: true } } as const;
type Holder = { name: string; isActive: boolean } | null;

/** Nombre del primer elemento eliminado que toca el movimiento (su dinero queda congelado). */
function deletedHolder(row: {
  account: Holder;
  toAccount: Holder;
  creditCard: Holder;
  debt: Holder;
}): string | null {
  return [row.account, row.toAccount, row.creditCard, row.debt].find((h) => h && !h.isActive)?.name ?? null;
}

/** ¿La edición cambia algo que afecta saldos o deudas? */
function changesMoney(
  existing: Transaction & { children: Array<{ amount: bigint }> },
  input: TransactionInput,
): boolean {
  const next = fullRowData(input);
  return (
    existing.type !== input.type ||
    num(existing.amount) !== input.amount ||
    fromDbDate(existing.date) !== input.date ||
    existing.accountId !== next.accountId ||
    existing.toAccountId !== next.toAccountId ||
    existing.creditCardId !== next.creditCardId ||
    existing.debtId !== next.debtId ||
    existing.installments !== next.installments ||
    (input.type === 'DEBT_PAYMENT' &&
      existing.children.reduce((s, c) => s + num(c.amount), 0) !== input.interest)
  );
}
```

3. En `deleteTransaction`, cambiar la consulta y agregar la verificación:

```ts
  const row = await db.transaction.findUnique({
    where: { id_userId: { id, userId } },
    select: { parentId: true, account: holder, toAccount: holder, creditCard: holder, debt: holder },
  });
  if (!row) throw notFound('Movimiento no encontrado.');
  if (row.parentId) {
    throw badRequest(
      'EDIT_PARENT',
      'Este movimiento es parte de un pago de préstamo. Edita o elimina el pago principal.',
    );
  }
  const frozen = deletedHolder(row);
  if (frozen) throw entityDeleted(frozen, 'eliminar este movimiento');
```

4. En `updateTransaction`, cambiar la consulta inicial y verificar después del control de tipo:

```ts
  const existing = await db.transaction.findUnique({
    where: { id_userId: { id, userId: auth.userId } },
    include: {
      account: holder,
      toAccount: holder,
      creditCard: holder,
      debt: holder,
      children: { select: { amount: true } },
    },
  });
```

y, justo después del `if (existing.type !== input.type) { … }`:

```ts
  const frozen = deletedHolder(existing);
  if (frozen && changesMoney(existing, input)) {
    throw entityDeleted(frozen, 'modificar este movimiento');
  }
```

- [ ] **Step 11: Actualizar los tests existentes al nuevo modelo**

`apps/api/test/accounts.test.ts` — reemplazar el test `'only archives accounts with a zero balance'` por:

```ts
  it('does not accept isActive in updates (DELETE and /restore manage it)', async () => {
    const { api } = await registerUser(app);
    const { body } = await api.post('/api/accounts', { name: 'Efectivo', type: 'CASH' });
    expect((await api.put(`/api/accounts/${body.account.id}`, { isActive: false })).status).toBe(400);
  });
```

y en `'deletes unused accounts and answers 404 …'` cambiar `toBe(204)` por `toBe(200)`.

`apps/api/test/cards-debts.test.ts` — reemplazar `'archives only without debt and deletes only without movements'` por:

```ts
  it('deletes only without debt; an unused card is deleted for good', async () => {
    const { api } = await registerUser(app);
    const { body } = await api.post('/api/credit-cards', { ...card, initialDebt: 100_000 });
    const id = body.card.id;
    const blocked = await api.del(`/api/credit-cards/${id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CARD_HAS_DEBT');
    await api.put(`/api/credit-cards/${id}`, { initialDebt: 0 });
    const res = await api.del(`/api/credit-cards/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 'hard' });
  });
```

`apps/api/test/in-use.test.ts` — reemplazar los cuatro primeros tests (`'refuses to delete an account that has a movement'` … `'protects loans with payments or balance'`) por:

```ts
  it('an account with money cannot be deleted', async () => {
    const { api, f } = await newUser();
    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    const res = await api.del(`/api/accounts/${f.bank}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_HAS_BALANCE');
  });

  it('a category used by a movement is deleted logically and stays in the history', async () => {
    const { api, f } = await newUser();
    const tx = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.fun,
    });
    const res = await api.del(`/api/categories/${f.cat.fun}`);
    expect(res.body).toEqual({ deleted: 'soft' });
    const read = await api.get(`/api/transactions/${tx.body.transaction.id}`);
    expect(read.body.transaction.category).toMatchObject({ id: f.cat.fun, isActive: false });
  });

  it('protects credit cards with debt', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 100_000,
      date: TODAY,
      categoryId: f.cat.food,
    });
    const del = await api.del(`/api/credit-cards/${f.card}`);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('CARD_HAS_DEBT');
  });

  it('protects loans with balance', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 100_000,
      date: TODAY,
    });
    const del = await api.del(`/api/debts/${f.debt}`);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('DEBT_HAS_BALANCE');
  });
```

`apps/api/test/transactions.test.ts` — en `'rejects a category of the wrong kind and archived accounts'`, reemplazar `await api.put(\`/api/accounts/${f.wallet}\`, { isActive: false });` por (Nequi necesita historial para eliminarse lógicamente):

```ts
    await api.post('/api/transfers', { amount: 1000, date: TODAY, accountId: f.bank, toAccountId: f.wallet });
    await api.post('/api/transfers', { amount: 1000, date: TODAY, accountId: f.wallet, toAccountId: f.bank });
    await api.del(`/api/accounts/${f.wallet}`);
```

y cambiar `toMatch(/archivada/)` por `toMatch(/eliminada/)`.

`apps/api/test/transactions-edit-list.test.ts` — en `'keeps an archived account when it is unchanged …'`, reemplazar `await api.put(\`/api/accounts/${f.cash}\`, { isActive: false });` por `await api.del(\`/api/accounts/${f.cash}\`);`.

`apps/api/test/categories.test.ts` — reemplazar `'protects system categories and categories in use'` por:

```ts
  it('system categories are editable; unused categories are deleted with their subcategories', async () => {
    const { api } = await registerUser(app);
    const items = (await api.get('/api/categories')).body.items as Cat[];
    const adjustment = items.find((c) => c.systemKey === 'ADJUSTMENT_EXPENSE')!;
    const interest = items.find((c) => c.systemKey === 'INTEREST')!;
    const food = items.find((c) => c.name === 'Alimentación')!;

    expect((await api.put(`/api/categories/${adjustment.id}`, { name: 'Otro' })).status).toBe(200);
    expect((await api.put(`/api/categories/${interest.id}`, { name: 'Intereses' })).status).toBe(200);

    const child = await api.post('/api/categories', {
      name: 'Domicilios',
      kind: 'EXPENSE',
      parentId: food.id,
    });
    expect((await api.del(`/api/categories/${food.id}`)).body).toEqual({ deleted: 'hard' });
    const after = (await api.get('/api/categories')).body.items as Cat[];
    expect(after.find((c) => c.id === child.body.category.id)).toBeUndefined();
  });
```

- [ ] **Step 12: Correr todo el backend**

Run: `npm test -w @finanzas/api && npm run typecheck`
Expected: PASS. (La web envía esos `PUT` sin tipos de entrada, así que sigue compilando; sus botones "Archivar" se reemplazan en el plan 2B.)

---

### Task 9: Movimientos — composición, gasto ⇄ compra con tarjeta y ajuste de saldo

**Files:**
- Modify: `apps/api/src/modules/transactions/refs.ts`
- Modify: `apps/api/src/modules/transactions/service.ts`
- Create: `apps/api/src/modules/transactions/adjust.ts`
- Modify: `apps/api/src/modules/transactions/routes.ts`
- Create: `apps/api/test/transactions-phase2.test.ts`

**Interfaces:**
- Consumes: `fullRowData` (Task 8), `findSystemCategory` (restaura automáticamente, Task 8), `adjustBalanceSchema`, `SYSTEM_CATEGORY_KEYS`, `MAX_AMOUNT`.
- Produces (en `transactions/service.ts`):
  - `interface PreparedTransaction { input: TransactionInput; refs: ResolvedRefs; interestCategoryId: string | null }`
  - `prepareTransaction(db: DbClient, auth: AuthContext, input: TransactionInput, options?: ResolveOptions): Promise<PreparedTransaction>` — validaciones de lectura.
  - `insertTransaction(tx: Prisma.TransactionClient, userId: string, p: PreparedTransaction): Promise<string>` — escribe movimiento, etiquetas e intereses; devuelve el id.
  - `transactionResult(db: DbClient, userId: string, id: string, p: PreparedTransaction): Promise<TransactionResultDTO>`
  - `linkFieldsOf(input: TransactionInput): { scheduledItemId: string | null; recurring: RecurringOnCreateInput | null }`
  - En `refs.ts`: `interface ResolveOptions { allowSystemCategory?: boolean }` como 5.º parámetro opcional de `resolveRefs`.
  - `adjustBalance(db: PrismaClient, auth: AuthContext, accountId: string, input: AdjustBalanceInput): Promise<AdjustBalanceResultDTO>` y la ruta `POST /api/accounts/:id/adjust` → 201.
  - `PUT /api/transactions/:id` permite `EXPENSE` ⇄ `CARD_PURCHASE`; rechaza `scheduledItemId`/`recurring` con 400 `LINK_ON_EDIT`.

- [ ] **Step 1: Escribir los tests**

Create `apps/api/test/transactions-phase2.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { balanceOf, cardOf, setupFinances } from './finance-fixtures';
import { createTestApp, registerUser } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

async function newUser() {
  const { api } = await registerUser(app);
  return { api, f: await setupFinances(api) };
}

type Cat = { id: string; systemKey: string | null };

describe('editing movements (addendum §4)', () => {
  it('switches an expense to a card purchase and back, recalculating everything', async () => {
    const { api, f } = await newUser();
    const { body } = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 300_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
      paymentMethod: 'DEBIT_CARD',
    });
    const id = body.transaction.id;

    const toCard = await api.put(`/api/transactions/${id}`, {
      type: 'CARD_PURCHASE',
      amount: 300_000,
      date: TODAY,
      creditCardId: f.card,
      categoryId: f.cat.food,
      installments: 3,
    });
    expect(toCard.status).toBe(200);
    expect(toCard.body.transaction).toMatchObject({
      type: 'CARD_PURCHASE',
      account: null,
      paymentMethod: null,
      installments: 3,
    });
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
    expect((await cardOf(api, f.card)).debt).toBe(300_000);

    const back = await api.put(`/api/transactions/${id}`, {
      type: 'EXPENSE',
      amount: 300_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    expect(back.body.transaction).toMatchObject({ type: 'EXPENSE', creditCard: null, installments: null });
    expect(await balanceOf(api, f.bank)).toBe(1_700_000);
    expect((await cardOf(api, f.card)).debt).toBe(0);
    expect((await api.get('/api/dashboard')).body.thisMonth.expense).toBe(300_000);
  });

  it('only links an obligation or marks recurring when registering', async () => {
    const { api, f } = await newUser();
    const { body } = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    });
    const res = await api.put(`/api/transactions/${body.transaction.id}`, {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
      recurring: { frequency: 'MONTHLY' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LINK_ON_EDIT');
  });

  it('edits a loan disbursement (amount and account)', async () => {
    const { api, f } = await newUser();
    const d = await api.post(`/api/debts/${f.debt}/disbursements`, {
      accountId: f.bank,
      amount: 1_000_000,
      date: TODAY,
    });
    const res = await api.put(`/api/transactions/${d.body.transaction.id}`, {
      type: 'DEBT_DISBURSEMENT',
      amount: 1_500_000,
      date: TODAY,
      accountId: f.wallet,
      debtId: f.debt,
    });
    expect(res.status).toBe(200);
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
    expect(await balanceOf(api, f.wallet)).toBe(1_500_000);
    expect((await api.get(`/api/debts/${f.debt}`)).body.debt.balance).toBe(9_500_000);
  });
});

describe('balance adjustment (spec 8.13)', () => {
  it('records the difference as an editable and deletable system movement', async () => {
    const { api, f } = await newUser();
    const up = await api.post(`/api/accounts/${f.bank}/adjust`, { actualBalance: 2_150_000 });
    expect(up.status).toBe(201);
    expect(up.body.transaction).toMatchObject({
      type: 'INCOME',
      amount: 150_000,
      date: TODAY,
      description: 'Ajuste de saldo',
      category: { name: 'Ajuste de saldo' },
    });
    expect(up.body.account.balance).toBe(2_150_000);

    const down = await api.post(`/api/accounts/${f.bank}/adjust`, {
      actualBalance: 1_900_000,
      date: '2026-10-19',
    });
    expect(down.body.transaction).toMatchObject({ type: 'EXPENSE', amount: 250_000, date: '2026-10-19' });

    const same = await api.post(`/api/accounts/${f.bank}/adjust`, { actualBalance: 1_900_000 });
    expect(same.status).toBe(400);
    expect(same.body.error.code).toBe('NO_CHANGE');

    const edit = await api.put(`/api/transactions/${down.body.transaction.id}`, {
      type: 'EXPENSE',
      amount: 200_000,
      date: '2026-10-19',
      accountId: f.bank,
      categoryId: down.body.transaction.category.id,
    });
    expect(edit.status).toBe(200);
    expect((await api.del(`/api/transactions/${up.body.transaction.id}`)).status).toBe(204);
    expect(await balanceOf(api, f.bank)).toBe(1_800_000);
  });

  it('brings back a deleted adjustment category', async () => {
    const { api, f } = await newUser();
    const cats = (await api.get('/api/categories')).body.items as Cat[];
    const incomeAdjustment = cats.find((c) => c.systemKey === 'ADJUSTMENT_INCOME')!;
    await api.del(`/api/categories/${incomeAdjustment.id}`);
    const res = await api.post(`/api/accounts/${f.bank}/adjust`, { actualBalance: 2_100_000 });
    expect(res.status).toBe(201);
    expect(res.body.transaction.category).toMatchObject({ id: incomeAdjustment.id, isActive: true });
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- test/transactions-phase2.test.ts`
Expected: FAIL (`TYPE_CHANGE_NOT_ALLOWED`, ruta `/adjust` inexistente).

- [ ] **Step 3: Opción para categorías del sistema en `refs.ts`**

En `apps/api/src/modules/transactions/refs.ts`, agregar debajo de `ExistingRefs`:

```ts
export interface ResolveOptions {
  /** Ajuste de saldo: usa una categoría del sistema. */
  allowSystemCategory?: boolean;
}
```

cambiar la firma a:

```ts
export async function resolveRefs(
  db: DbClient,
  userId: string,
  input: TransactionInput,
  existing?: ExistingRefs,
  options: ResolveOptions = {},
): Promise<ResolvedRefs> {
```

y la condición de la categoría a:

```ts
    else if (
      ((category.isSystem && !options.allowSystemCategory) || !category.isActive) &&
      !unchanged('categoryId')
    )
      fields.categoryId = 'Categoría no disponible';
```

- [ ] **Step 4: Componer la creación de movimientos**

En `apps/api/src/modules/transactions/service.ts`:

1. Imports: agregar `type RecurringOnCreateInput` y `type TransactionType` a los de `@finanzas/shared`, y `type ResolveOptions` al import de `./refs`.

2. Reemplazar `createTransaction` por:

```ts
export interface PreparedTransaction {
  input: TransactionInput;
  refs: ResolvedRefs;
  interestCategoryId: string | null;
}

/** Validaciones que solo leen (antes de abrir la transacción de base de datos). */
export async function prepareTransaction(
  db: DbClient,
  auth: AuthContext,
  input: TransactionInput,
  options: ResolveOptions = {},
): Promise<PreparedTransaction> {
  assertNotFuture(input.date, auth.today);
  const refs = await resolveRefs(db, auth.userId, input, undefined, options);
  await checkRules(db, auth.userId, input, refs, []);
  return { input, refs, interestCategoryId: await interestCategoryFor(db, auth.userId, input) };
}

/** Escribe el movimiento con sus etiquetas e intereses; se compone con otras escrituras. */
export async function insertTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  p: PreparedTransaction,
): Promise<string> {
  const { input, refs } = p;
  const row = await tx.transaction.create({
    data: { userId, type: input.type, ...rowData(input) },
    select: { id: true, date: true },
  });
  await syncTags(tx, userId, row.id, input.tags);
  if (input.type === 'DEBT_PAYMENT') {
    await syncInterest(
      tx,
      userId,
      { id: row.id, date: row.date, accountId: input.accountId, debtName: refs.debt!.name },
      input.interest,
      p.interestCategoryId,
    );
  }
  return row.id;
}

export async function transactionResult(
  db: DbClient,
  userId: string,
  id: string,
  p: PreparedTransaction,
): Promise<TransactionResultDTO> {
  return {
    transaction: await getTransaction(db, userId, id),
    warnings: await computeWarnings(db, userId, p.input, p.refs),
  };
}

/** Campos que solo se aceptan al registrar (spec 8.11). */
export function linkFieldsOf(input: TransactionInput): {
  scheduledItemId: string | null;
  recurring: RecurringOnCreateInput | null;
} {
  return input.type === 'INCOME' || input.type === 'EXPENSE' || input.type === 'CARD_PURCHASE'
    ? { scheduledItemId: input.scheduledItemId ?? null, recurring: input.recurring ?? null }
    : { scheduledItemId: null, recurring: null };
}

export async function createTransaction(
  db: PrismaClient,
  auth: AuthContext,
  input: TransactionInput,
): Promise<TransactionResultDTO> {
  const p = await prepareTransaction(db, auth, input);
  const id = await db.$transaction((tx) => insertTransaction(tx, auth.userId, p));
  return transactionResult(db, auth.userId, id, p);
}
```

3. En `updateTransaction`:

- Declarar antes de la función:

```ts
/** Addendum §4: elegir una cuenta o una tarjeta convierte el gasto en compra con tarjeta y viceversa. */
const SWITCHABLE = new Set<TransactionType>(['EXPENSE', 'CARD_PURCHASE']);
```

- Reemplazar el bloque `if (existing.type !== input.type) { … }` por:

```ts
  if (
    existing.type !== input.type &&
    !(SWITCHABLE.has(existing.type) && SWITCHABLE.has(input.type))
  ) {
    throw badRequest(
      'TYPE_CHANGE_NOT_ALLOWED',
      'Elimina el movimiento y regístralo de nuevo con el tipo correcto.',
    );
  }
  const link = linkFieldsOf(input);
  if (link.scheduledItemId || link.recurring) {
    throw badRequest(
      'LINK_ON_EDIT',
      'Solo puedes enlazar una obligación o marcarlo como recurrente al registrarlo.',
    );
  }
```

- En la escritura, cambiar `data: rowData(input),` por `data: fullRowData(input),` (los campos del tipo anterior quedan en `null`).

- [ ] **Step 5: Ajuste de saldo**

Create `apps/api/src/modules/transactions/adjust.ts`:

```ts
import {
  MAX_AMOUNT,
  SYSTEM_CATEGORY_KEYS,
  type AdjustBalanceInput,
  type AdjustBalanceResultDTO,
  type TransactionInput,
} from '@finanzas/shared';
import type { PrismaClient } from '../../generated/prisma/client';
import { badRequest, entityDeleted } from '../../lib/errors';
import type { AuthContext } from '../../types/fastify';
import { accountBalance, findAccount, getAccount } from '../accounts/service';
import { findSystemCategory } from '../categories/service';
import { getTransaction, insertTransaction, prepareTransaction } from './service';

/** Spec 8.13: el usuario indica el saldo real y se registra la diferencia como ingreso o gasto. */
export async function adjustBalance(
  db: PrismaClient,
  auth: AuthContext,
  accountId: string,
  input: AdjustBalanceInput,
): Promise<AdjustBalanceResultDTO> {
  const account = await findAccount(db, auth.userId, accountId);
  if (!account.isActive) throw entityDeleted(account.name, 'ajustar su saldo');
  const diff = input.actualBalance - (await accountBalance(db, auth.userId, account));
  if (diff === 0) {
    throw badRequest('NO_CHANGE', 'Ese ya es el saldo de la cuenta.', {
      actualBalance: 'Es el saldo actual',
    });
  }
  if (Math.abs(diff) > MAX_AMOUNT) {
    throw badRequest('VALIDATION_ERROR', 'Revisa los datos ingresados.', {
      actualBalance: 'La diferencia es demasiado grande',
    });
  }
  const category = await findSystemCategory(
    db,
    auth.userId,
    diff > 0 ? SYSTEM_CATEGORY_KEYS.ADJUSTMENT_INCOME : SYSTEM_CATEGORY_KEYS.ADJUSTMENT_EXPENSE,
  );
  const base = {
    amount: Math.abs(diff),
    date: input.date ?? auth.today,
    accountId,
    categoryId: category.id,
    description: 'Ajuste de saldo',
    payee: null,
    notes: null,
    tags: [],
  };
  const txInput: TransactionInput =
    diff > 0 ? { type: 'INCOME', ...base } : { type: 'EXPENSE', ...base, paymentMethod: null };
  const prepared = await prepareTransaction(db, auth, txInput, { allowSystemCategory: true });
  const id = await db.$transaction((tx) => insertTransaction(tx, auth.userId, prepared));
  return {
    transaction: await getTransaction(db, auth.userId, id),
    account: await getAccount(db, auth.userId, accountId),
  };
}
```

En `apps/api/src/modules/transactions/routes.ts`, importar `adjustBalanceSchema` y `adjustBalance` (`./adjust`) y agregar:

```ts
  app.post('/accounts/:id/adjust', async (req, reply) =>
    reply
      .status(201)
      .send(
        await adjustBalance(
          app.prisma,
          req.auth,
          parseId(req.params),
          parse(adjustBalanceSchema, req.body),
        ),
      ),
  );
```

- [ ] **Step 6: Verificar**

Run: `npm test -w @finanzas/api && npm run typecheck`
Expected: PASS (incluido `'never changes the type of a movement'`: gasto → ingreso sigue rechazado).

---

### Task 10: Reglas recurrentes y generación perezosa de ocurrencias

**Files:**
- Create: `apps/api/src/lib/selects.ts`
- Modify: `apps/api/src/modules/transactions/mapper.ts` (usar `lib/selects.ts`)
- Create: `apps/api/src/modules/planning/refs.ts`
- Create: `apps/api/src/modules/recurring/service.ts`
- Create: `apps/api/src/modules/recurring/routes.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/recurring.test.ts`

**Interfaces:**
- Consumes: `occurrences`, `nextOccurrence`, `RecurrenceTerms` (Task 4); `recurringRuleCreateSchema`, `recurringRuleUpdateSchema` (Task 1); columnas `activeFrom` y `ruleDate` (Task 2).
- Produces:
  - `lib/selects.ts`: `refSelect`, `accountRefSelect`, `categoryRefSelect` (objetos `select` de Prisma con `isActive`).
  - `planning/refs.ts`: `checkScheduleRefs(db: DbClient, userId: string, v: { kind: ScheduledKind; categoryId: string; accountId: string | null; creditCardId: string | null }): Promise<void>` → 400 `INVALID_REFERENCE`.
  - `recurring/service.ts`: `termsOf(rule: RecurringRule): RecurrenceTerms`, `ensureScheduled(db: DbClient, userId: string, today: IsoDate, ruleIds?: string[]): Promise<void>`, `listRules(db, auth): Promise<RecurringRuleDTO[]>`, `getRule(db, auth, id)`, `createRule(db: PrismaClient, auth, input)`, `updateRule(db: PrismaClient, auth, id, input)`, `deleteRule(db: PrismaClient, userId, id)`.
  - Rutas: `GET/POST /api/recurring`, `GET/PUT/DELETE /api/recurring/:id` (`{ items }`, `{ rule }`, 204).

Reglas: crear activa la regla desde hoy (`activeFrom` = hoy); editar o reanudar borra las ocurrencias `PENDING` con `ruleDate ≥ hoy`, mueve `activeFrom` a hoy y regenera; pausar solo borra esas pendientes; eliminar borra las pendientes y deja las `DONE`/`SKIPPED` sin regla (`recurringRuleId` y `ruleDate` en null). Generación: de `max(startDate, activeFrom, hoy − 31)` al fin del mes siguiente, `createMany(…, skipDuplicates: true)`.

- [ ] **Step 1: Escribir los tests**

Create `apps/api/test/recurring.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { fromDbDate } from '../src/lib/db';
import { ensureScheduled } from '../src/modules/recurring/service';
import { setupFinances } from './finance-fixtures';
import { createTestApp, registerUser } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

async function newUser() {
  const { api, user } = await registerUser(app);
  return { api, userId: user.id, f: await setupFinances(api) };
}

const itemsOf = async (ruleId: string) =>
  (
    await app.prisma.scheduledItem.findMany({
      where: { recurringRuleId: ruleId },
      orderBy: { ruleDate: 'asc' },
    })
  ).map((i) => ({
    ruleDate: fromDbDate(i.ruleDate!),
    status: i.status,
    amount: Number(i.amount),
  }));

describe('recurring rules (spec 8.11, decision 3 of the plan)', () => {
  it('creates a monthly rule that starts generating from today', async () => {
    const { api, f } = await newUser();
    const res = await api.post('/api/recurring', {
      name: 'Internet',
      kind: 'EXPENSE',
      amount: 90_000,
      categoryId: f.cat.food,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-10',
    });
    expect(res.status).toBe(201);
    expect(res.body.rule).toMatchObject({
      name: 'Internet',
      nextDate: '2026-11-10',
      isActive: true,
      account: { id: f.bank },
    });
    // El 10 de octubre ya pasó cuando se creó la regla: no aparece como obligación vencida.
    expect(await itemsOf(res.body.rule.id)).toEqual([
      { ruleDate: '2026-11-10', status: 'PENDING', amount: 90_000 },
    ]);
  });

  it('generates a semimonthly salary and is idempotent', async () => {
    const { api, userId, f } = await newUser();
    const { body } = await api.post('/api/recurring', {
      name: 'Salario',
      kind: 'INCOME',
      amount: 2_000_000,
      categoryId: f.cat.salary,
      accountId: f.bank,
      frequency: 'SEMIMONTHLY',
      startDate: TODAY,
    });
    await ensureScheduled(app.prisma, userId, TODAY);
    await ensureScheduled(app.prisma, userId, TODAY);
    expect((await itemsOf(body.rule.id)).map((i) => i.ruleDate)).toEqual([
      '2026-10-31',
      '2026-11-15',
      '2026-11-30',
    ]);
  });

  it('editing regenerates pending occurrences and keeps the history', async () => {
    const { api, f } = await newUser();
    const rule = {
      name: 'Gimnasio',
      kind: 'EXPENSE',
      amount: 80_000,
      categoryId: f.cat.fun,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-25',
    };
    const { body } = await api.post('/api/recurring', rule);
    const id = body.rule.id;
    await app.prisma.scheduledItem.updateMany({
      where: { recurringRuleId: id, dueDate: new Date('2026-10-25T00:00:00Z') },
      data: { status: 'SKIPPED' },
    });

    const edited = await api.put(`/api/recurring/${id}`, {
      ...rule,
      amount: 100_000,
      startDate: '2026-10-27',
      isActive: true,
    });
    expect(edited.status).toBe(200);
    expect(await itemsOf(id)).toEqual([
      { ruleDate: '2026-10-25', status: 'SKIPPED', amount: 80_000 },
      { ruleDate: '2026-10-27', status: 'PENDING', amount: 100_000 },
      { ruleDate: '2026-11-27', status: 'PENDING', amount: 100_000 },
    ]);

    const paused = await api.put(`/api/recurring/${id}`, { ...rule, startDate: '2026-10-27', isActive: false });
    expect(paused.body.rule).toMatchObject({ isActive: false, nextDate: null });
    expect((await itemsOf(id)).map((i) => i.status)).toEqual(['SKIPPED']);
  });

  it('deleting a rule keeps finished occurrences without the rule', async () => {
    const { api, userId, f } = await newUser();
    const { body } = await api.post('/api/recurring', {
      name: 'Arriendo',
      kind: 'EXPENSE',
      amount: 1_000_000,
      categoryId: f.cat.food,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-28',
    });
    await app.prisma.scheduledItem.updateMany({
      where: { recurringRuleId: body.rule.id, dueDate: new Date('2026-10-28T00:00:00Z') },
      data: { status: 'SKIPPED' },
    });
    expect((await api.del(`/api/recurring/${body.rule.id}`)).status).toBe(204);
    const left = await app.prisma.scheduledItem.findMany({ where: { userId } });
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ status: 'SKIPPED', recurringRuleId: null, ruleDate: null });
  });

  it('validates the category kind and that the account is not deleted', async () => {
    const { api, f } = await newUser();
    const base = {
      name: 'X',
      kind: 'EXPENSE',
      amount: 1000,
      categoryId: f.cat.salary,
      accountId: f.bank,
      frequency: 'WEEKLY',
      startDate: TODAY,
    };
    const wrongKind = await api.post('/api/recurring', base);
    expect(wrongKind.status).toBe(400);
    expect(wrongKind.body.error.fields.categoryId).toBeTypeOf('string');
    await api.post('/api/transfers', { amount: 1000, date: TODAY, accountId: f.bank, toAccountId: f.wallet });
    await api.post('/api/transfers', { amount: 1000, date: TODAY, accountId: f.wallet, toAccountId: f.bank });
    await api.del(`/api/accounts/${f.wallet}`);
    const deleted = await api.post('/api/recurring', { ...base, categoryId: f.cat.food, accountId: f.wallet });
    expect(deleted.status).toBe(400);
    expect(deleted.body.error.fields.accountId).toMatch(/eliminada/);
    const list = await api.get('/api/recurring');
    expect(list.body.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- test/recurring.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/recurring/service'`.

- [ ] **Step 3: Selects compartidos**

Create `apps/api/src/lib/selects.ts`:

```ts
/** Referencias que viajan en los DTOs (con `isActive` para mostrar "(eliminada)"). */
export const refSelect = { id: true, name: true, icon: true, color: true, isActive: true } as const;
export const accountRefSelect = { ...refSelect, type: true } as const;
export const categoryRefSelect = { ...refSelect, kind: true, parentId: true } as const;
```

En `apps/api/src/modules/transactions/mapper.ts`, borrar la constante local `refSelect`, importar `{ accountRefSelect, categoryRefSelect, refSelect } from '../../lib/selects'` y usar:

```ts
export const transactionInclude = {
  account: { select: accountRefSelect },
  toAccount: { select: accountRefSelect },
  creditCard: { select: refSelect },
  debt: { select: refSelect },
  category: { select: categoryRefSelect },
  tags: { select: { tag: { select: { name: true } } } },
  children: { select: { amount: true } },
} satisfies Prisma.TransactionInclude;
```

- [ ] **Step 4: Validación de referencias de lo programado**

Create `apps/api/src/modules/planning/refs.ts`:

```ts
import type { ScheduledKind } from '@finanzas/shared';
import { badRequest } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';

/** Reglas y ocurrencias: categoría del tipo correcto, activa y no del sistema; cuenta o tarjeta activas. */
export async function checkScheduleRefs(
  db: DbClient,
  userId: string,
  v: { kind: ScheduledKind; categoryId: string; accountId: string | null; creditCardId: string | null },
) {
  const key = (id: string) => ({ id_userId: { id, userId } });
  const [category, account, card] = await Promise.all([
    db.category.findUnique({ where: key(v.categoryId) }),
    v.accountId ? db.account.findUnique({ where: key(v.accountId) }) : null,
    v.creditCardId ? db.creditCard.findUnique({ where: key(v.creditCardId) }) : null,
  ]);
  const fields: Record<string, string> = {};
  if (!category) fields.categoryId = 'Categoría no encontrada';
  else if (category.kind !== v.kind) fields.categoryId = 'La categoría no corresponde al tipo';
  else if (!category.isActive || category.isSystem) fields.categoryId = 'Categoría no disponible';
  if (v.accountId && !account) fields.accountId = 'Cuenta no encontrada';
  else if (account && !account.isActive) fields.accountId = 'La cuenta fue eliminada';
  if (v.creditCardId && !card) fields.creditCardId = 'Tarjeta no encontrada';
  else if (card && !card.isActive) fields.creditCardId = 'La tarjeta fue eliminada';
  if (Object.keys(fields).length > 0) {
    throw badRequest('INVALID_REFERENCE', 'Revisa la categoría, la cuenta o la tarjeta.', fields);
  }
}
```

- [ ] **Step 5: Servicio de reglas**

Create `apps/api/src/modules/recurring/service.ts`:

```ts
import {
  addDays,
  addMonths,
  endOfMonth,
  type IsoDate,
  type RecurringRuleCreateInput,
  type RecurringRuleDTO,
  type RecurringRuleUpdateInput,
} from '@finanzas/shared';
import { nextOccurrence, occurrences, type RecurrenceTerms } from '../../domain/recurrence';
import type { Prisma, PrismaClient, RecurringRule } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import { accountRefSelect, categoryRefSelect, refSelect } from '../../lib/selects';
import type { AuthContext } from '../../types/fastify';
import { checkScheduleRefs } from '../planning/refs';

const ruleInclude = {
  category: { select: categoryRefSelect },
  account: { select: accountRefSelect },
  creditCard: { select: refSelect },
} satisfies Prisma.RecurringRuleInclude;
type RuleRow = Prisma.RecurringRuleGetPayload<{ include: typeof ruleInclude }>;

export function termsOf(r: RecurringRule): RecurrenceTerms {
  return {
    frequency: r.frequency,
    intervalDays: r.intervalDays,
    day1: r.day1,
    day2: r.day2,
    startDate: fromDbDate(r.startDate),
    endDate: r.endDate ? fromDbDate(r.endDate) : null,
  };
}

function toRuleDTO(r: RuleRow, today: IsoDate): RecurringRuleDTO {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    amount: num(r.amount),
    category: r.category,
    account: r.account,
    creditCard: r.creditCard,
    frequency: r.frequency,
    intervalDays: r.intervalDays,
    day1: r.day1,
    day2: r.day2,
    startDate: fromDbDate(r.startDate),
    endDate: r.endDate ? fromDbDate(r.endDate) : null,
    isActive: r.isActive,
    nextDate: r.isActive ? nextOccurrence(termsOf(r), today) : null,
  };
}

/** Plan, decisión 3: genera desde max(startDate, activeFrom, hoy − 31) hasta el fin del mes siguiente. */
function itemsFor(rule: RecurringRule, today: IsoDate) {
  const activeFrom = fromDbDate(rule.activeFrom);
  const floor = addDays(today, -31);
  const from = activeFrom > floor ? activeFrom : floor;
  return occurrences(termsOf(rule), from, endOfMonth(addMonths(today, 1))).map((d) => ({
    userId: rule.userId,
    recurringRuleId: rule.id,
    kind: rule.kind,
    name: rule.name,
    amount: rule.amount,
    categoryId: rule.categoryId,
    accountId: rule.accountId,
    creditCardId: rule.creditCardId,
    ruleDate: toDbDate(d),
    dueDate: toDbDate(d),
  }));
}

/** Spec 8.11: generación perezosa e idempotente (ON CONFLICT DO NOTHING sobre regla + ruleDate). */
export async function ensureScheduled(
  db: DbClient,
  userId: string,
  today: IsoDate,
  ruleIds?: string[],
) {
  const rules = await db.recurringRule.findMany({
    where: { userId, isActive: true, ...(ruleIds && { id: { in: ruleIds } }) },
  });
  const data = rules.flatMap((r) => itemsFor(r, today));
  if (data.length > 0) await db.scheduledItem.createMany({ data, skipDuplicates: true });
}

async function findRule(db: DbClient, userId: string, id: string) {
  const rule = await db.recurringRule.findUnique({ where: { id_userId: { id, userId } } });
  if (!rule) throw notFound('Regla no encontrada.');
  return rule;
}

function ruleData(input: RecurringRuleCreateInput) {
  return {
    name: input.name,
    kind: input.kind,
    amount: BigInt(input.amount),
    categoryId: input.categoryId,
    accountId: input.accountId,
    creditCardId: input.creditCardId,
    frequency: input.frequency,
    intervalDays: input.intervalDays,
    day1: input.day1,
    day2: input.day2,
    startDate: toDbDate(input.startDate),
    endDate: input.endDate ? toDbDate(input.endDate) : null,
  };
}

export async function listRules(db: DbClient, auth: AuthContext): Promise<RecurringRuleDTO[]> {
  const rules = await db.recurringRule.findMany({
    where: { userId: auth.userId },
    include: ruleInclude,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  return rules.map((r) => toRuleDTO(r, auth.today));
}

export async function getRule(db: DbClient, auth: AuthContext, id: string): Promise<RecurringRuleDTO> {
  const rule = await db.recurringRule.findUnique({
    where: { id_userId: { id, userId: auth.userId } },
    include: ruleInclude,
  });
  if (!rule) throw notFound('Regla no encontrada.');
  return toRuleDTO(rule, auth.today);
}

export async function createRule(
  db: PrismaClient,
  auth: AuthContext,
  input: RecurringRuleCreateInput,
): Promise<RecurringRuleDTO> {
  await checkScheduleRefs(db, auth.userId, input);
  const rule = await db.recurringRule.create({
    data: { userId: auth.userId, ...ruleData(input), activeFrom: toDbDate(auth.today) },
  });
  await ensureScheduled(db, auth.userId, auth.today, [rule.id]);
  return getRule(db, auth, rule.id);
}

export async function updateRule(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
  input: RecurringRuleUpdateInput,
): Promise<RecurringRuleDTO> {
  const { userId, today } = auth;
  await findRule(db, userId, id);
  if (input.isActive) await checkScheduleRefs(db, userId, input);
  await db.$transaction(async (tx) => {
    await tx.recurringRule.update({
      where: { id_userId: { id, userId } },
      data: { ...ruleData(input), isActive: input.isActive, activeFrom: toDbDate(today) },
    });
    await tx.scheduledItem.deleteMany({
      where: { userId, recurringRuleId: id, status: 'PENDING', ruleDate: { gte: toDbDate(today) } },
    });
  });
  if (input.isActive) await ensureScheduled(db, userId, today, [id]);
  return getRule(db, auth, id);
}

export async function deleteRule(db: PrismaClient, userId: string, id: string): Promise<void> {
  await findRule(db, userId, id);
  await db.$transaction([
    db.scheduledItem.deleteMany({ where: { userId, recurringRuleId: id, status: 'PENDING' } }),
    db.scheduledItem.updateMany({
      where: { userId, recurringRuleId: id },
      data: { recurringRuleId: null, ruleDate: null },
    }),
    db.recurringRule.delete({ where: { id_userId: { id, userId } } }),
  ]);
}
```

- [ ] **Step 6: Rutas y registro**

Create `apps/api/src/modules/recurring/routes.ts`:

```ts
import { recurringRuleCreateSchema, recurringRuleUpdateSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import { createRule, deleteRule, getRule, listRules, updateRule } from './service';

export async function recurringRoutes(app: FastifyInstance) {
  app.get('/recurring', async (req) => ({ items: await listRules(app.prisma, req.auth) }));

  app.post('/recurring', async (req, reply) => {
    const rule = await createRule(app.prisma, req.auth, parse(recurringRuleCreateSchema, req.body));
    return reply.status(201).send({ rule });
  });

  app.get('/recurring/:id', async (req) => ({
    rule: await getRule(app.prisma, req.auth, parseId(req.params)),
  }));

  app.put('/recurring/:id', async (req) => ({
    rule: await updateRule(
      app.prisma,
      req.auth,
      parseId(req.params),
      parse(recurringRuleUpdateSchema, req.body),
    ),
  }));

  app.delete('/recurring/:id', async (req, reply) => {
    await deleteRule(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });
}
```

En `apps/api/src/app.ts`, importar `recurringRoutes` y registrarla dentro del bloque autenticado, después de `dashboardRoutes`:

```ts
      await api.register(recurringRoutes);
```

- [ ] **Step 7: Verificar**

Run: `npm test -w @finanzas/api -- test/recurring.test.ts && npm run typecheck`
Expected: PASS.

---

### Task 11: Ocurrencias programadas, completar y enlazar al registrar

**Files:**
- Create: `apps/api/src/modules/scheduled/link.ts`
- Create: `apps/api/src/modules/scheduled/service.ts`
- Create: `apps/api/src/modules/scheduled/routes.ts`
- Modify: `apps/api/src/modules/transactions/service.ts` (`createTransaction`)
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/scheduled.test.ts`

**Interfaces:**
- Consumes: `prepareTransaction`, `insertTransaction`, `transactionResult`, `linkFieldsOf` (Task 9); `ensureScheduled` (Task 10); `checkScheduleRefs`, selects (Task 10); `isOccurrence` (Task 4); `listCreditCards`, `listDebts`.
- Produces:
  - `scheduled/link.ts`: `interface LinkPlan { scheduledItemId: string | null; recurring: RecurringOnCreateInput | null }`, `prepareLink(db: DbClient, userId: string, input: TransactionInput, link: LinkPlan): Promise<LinkPlan>`, `applyLink(tx: Prisma.TransactionClient, userId: string, transactionId: string, input: TransactionInput, link: LinkPlan, name: string): Promise<void>`.
  - `scheduled/service.ts`: `toScheduledDTO`, `listScheduled(db: PrismaClient, auth, q: ScheduledListQuery): Promise<ScheduledItemDTO[]>`, `createScheduled`, `updateScheduled`, `completeScheduled(db: PrismaClient, auth, id, input): Promise<TransactionResultDTO>`, `skipScheduled`, `deleteScheduled`, `suggestScheduled(db, auth, q): Promise<ScheduledItemDTO[]>`.
  - Rutas: `GET /api/scheduled` (`{ items }`), `POST /api/scheduled` (201 `{ item }`), `PUT /api/scheduled/:id` (`{ item }`), `POST /api/scheduled/:id/complete` (201, `TransactionResultDTO`), `POST /api/scheduled/:id/skip` (`{ item }`), `DELETE /api/scheduled/:id` (204), `GET /api/scheduled/suggestions` (`{ items }`).

- [ ] **Step 1: Escribir los tests**

Create `apps/api/test/scheduled.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { balanceOf, cardOf, setupFinances } from './finance-fixtures';
import { createTestApp, registerUser, type Client } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

async function newUser() {
  const { api, user } = await registerUser(app);
  return { api, userId: user.id, f: await setupFinances(api) };
}

type F = Awaited<ReturnType<typeof setupFinances>>;
type Item = { id: string; name: string; dueDate: string; ruleDate: string | null; status: string; derived: string | null };

const oneOff = async (api: Client, f: F, dueDate = '2026-10-25', amount = 500_000) =>
  (
    await api.post('/api/scheduled', {
      kind: 'EXPENSE',
      name: 'SOAT',
      amount,
      dueDate,
      categoryId: f.cat.food,
      accountId: f.bank,
    })
  ).body.item as Item;

describe('scheduled occurrences (spec 8.11)', () => {
  it('lists pending items with the derived card due, in date order', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 300_000,
      date: '2026-10-10',
      categoryId: f.cat.food,
    });
    await oneOff(api, f);
    const items = (await api.get('/api/scheduled')).body.items as Item[];
    expect(items.map((i) => [i.name, i.dueDate, i.derived])).toEqual([
      ['SOAT', '2026-10-25', null],
      ['Pago Nu Crédito', '2026-10-30', 'CARD'],
    ]);
  });

  it('completing twice at once creates exactly one movement (review focus #1)', async () => {
    const { api, f } = await newUser();
    const item = await oneOff(api, f);
    const results = await Promise.all([
      api.post(`/api/scheduled/${item.id}/complete`, {}),
      api.post(`/api/scheduled/${item.id}/complete`, {}),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const created = results.find((r) => r.status === 201)!.body.transaction;
    // La fecha de la obligación es futura: se registra hoy.
    expect(created).toMatchObject({ type: 'EXPENSE', amount: 500_000, date: TODAY, description: 'SOAT' });
    expect(await balanceOf(api, f.bank)).toBe(1_500_000);
    const list = await api.get('/api/transactions?q=SOAT');
    expect(list.body.items).toHaveLength(1);
    const done = (await api.get('/api/scheduled?status=DONE')).body.items as Array<Item & { transactionId: string }>;
    expect(done[0]).toMatchObject({ id: item.id, transactionId: created.id });
  });

  it('completes with a card and a different amount, and reopens when the movement is deleted', async () => {
    const { api, f } = await newUser();
    const item = await oneOff(api, f);
    const res = await api.post(`/api/scheduled/${item.id}/complete`, {
      creditCardId: f.card,
      amount: 480_000,
    });
    expect(res.status).toBe(201);
    expect(res.body.transaction).toMatchObject({ type: 'CARD_PURCHASE', amount: 480_000, installments: 1 });
    expect((await cardOf(api, f.card)).debt).toBe(480_000);
    await api.del(`/api/transactions/${res.body.transaction.id}`);
    const pending = (await api.get('/api/scheduled')).body.items as Item[];
    expect(pending.find((i) => i.id === item.id)?.status).toBe('PENDING');
  });

  it('receives an expected income on its date', async () => {
    const { api, f } = await newUser();
    const { body } = await api.post('/api/scheduled', {
      kind: 'INCOME',
      name: 'Bono',
      amount: 700_000,
      dueDate: '2026-10-15',
      categoryId: f.cat.salary,
      accountId: f.bank,
    });
    const res = await api.post(`/api/scheduled/${body.item.id}/complete`, {});
    expect(res.body.transaction).toMatchObject({ type: 'INCOME', amount: 700_000, date: '2026-10-15' });
  });

  it('skips, reopens, edits only pending items and deletes only one-offs', async () => {
    const { api, f } = await newUser();
    const item = await oneOff(api, f);
    expect((await api.post(`/api/scheduled/${item.id}/skip`)).body.item.status).toBe('SKIPPED');
    const blocked = await api.put(`/api/scheduled/${item.id}`, { amount: 1000 });
    expect(blocked.status).toBe(409);
    expect((await api.put(`/api/scheduled/${item.id}`, { status: 'PENDING' })).body.item.status).toBe('PENDING');
    const edited = await api.put(`/api/scheduled/${item.id}`, { amount: 450_000, dueDate: '2026-10-26' });
    expect(edited.body.item).toMatchObject({ dueDate: '2026-10-26' });
    expect((await api.del(`/api/scheduled/${item.id}`)).status).toBe(204);

    const rule = await api.post('/api/recurring', {
      name: 'Internet',
      kind: 'EXPENSE',
      amount: 90_000,
      categoryId: f.cat.food,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-25',
    });
    const ruleItem = ((await api.get('/api/scheduled')).body.items as Item[]).find(
      (i) => i.name === 'Internet',
    )!;
    const del = await api.del(`/api/scheduled/${ruleItem.id}`);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('USE_SKIP');
    expect(rule.status).toBe(201);
  });

  it('moving the date of a rule occurrence never duplicates it (review focus #2)', async () => {
    const { api, f } = await newUser();
    await api.post('/api/recurring', {
      name: 'Internet',
      kind: 'EXPENSE',
      amount: 90_000,
      categoryId: f.cat.food,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-25',
    });
    const first = ((await api.get('/api/scheduled')).body.items as Item[]).find(
      (i) => i.dueDate === '2026-10-25',
    )!;
    await api.put(`/api/scheduled/${first.id}`, { dueDate: '2026-10-28' });
    const again = ((await api.get('/api/scheduled')).body.items as Item[]).filter(
      (i) => i.name === 'Internet',
    );
    expect(again.map((i) => [i.dueDate, i.ruleDate])).toEqual([
      ['2026-10-28', '2026-10-25'],
      ['2026-11-25', '2026-11-25'],
    ]);
  });

  it('suggests a pending occurrence within ±20 % and ±7 days', async () => {
    const { api, f } = await newUser();
    await api.post('/api/recurring', {
      name: 'Internet',
      kind: 'EXPENSE',
      amount: 90_000,
      categoryId: f.cat.food,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-22',
    });
    const q = (amount: number) =>
      api.get(
        `/api/scheduled/suggestions?kind=EXPENSE&categoryId=${f.cat.food}&amount=${amount}&date=${TODAY}`,
      );
    expect(((await q(95_000)).body.items as Item[]).map((i) => i.name)).toEqual(['Internet']);
    expect((await q(120_000)).body.items).toEqual([]);
  });
});

describe('linking when registering a movement', () => {
  it('links an existing occurrence once', async () => {
    const { api, f } = await newUser();
    const item = await oneOff(api, f, '2026-10-18');
    const body = {
      type: 'EXPENSE',
      amount: 510_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
      scheduledItemId: item.id,
    };
    expect((await api.post('/api/transactions', body)).status).toBe(201);
    const second = await api.post('/api/transactions', body);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('NOT_PENDING');
    const wrongKind = await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.salary,
      scheduledItemId: (await oneOff(api, f, '2026-10-30')).id,
    });
    expect(wrongKind.status).toBe(400);
  });

  it('creates the rule from a recurring salary with its first occurrence done', async () => {
    const { api, f } = await newUser();
    const salary = {
      type: 'INCOME',
      amount: 2_000_000,
      date: '2026-10-15',
      accountId: f.bank,
      categoryId: f.cat.salary,
      description: 'Salario',
      recurring: { frequency: 'SEMIMONTHLY', day1: 15, day2: 31 },
    };
    const res = await api.post('/api/transactions', salary);
    expect(res.status).toBe(201);
    const rules = (await api.get('/api/recurring')).body.items;
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ name: 'Salario', kind: 'INCOME', startDate: '2026-10-15', nextDate: '2026-10-31' });
    const all = (await api.get('/api/scheduled?status=PENDING,DONE')).body.items as Item[];
    expect(all.map((i) => [i.ruleDate, i.status])).toEqual([
      ['2026-10-15', 'DONE'],
      ['2026-10-31', 'PENDING'],
      ['2026-11-15', 'PENDING'],
      ['2026-11-30', 'PENDING'],
    ]);

    const offDay = await api.post('/api/transactions', { ...salary, date: '2026-10-14' });
    expect(offDay.status).toBe(400);
    expect(offDay.body.error.fields['recurring.day1']).toBeTypeOf('string');
  });

  it('a recurring card purchase creates a rule paid with the card', async () => {
    const { api, f } = await newUser();
    const res = await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 38_900,
      date: '2026-10-12',
      categoryId: f.cat.fun,
      description: 'Netflix',
      recurring: { frequency: 'MONTHLY' },
    });
    expect(res.status).toBe(201);
    const rules = (await api.get('/api/recurring')).body.items;
    expect(rules[0]).toMatchObject({ name: 'Netflix', creditCard: { id: f.card }, account: null, nextDate: '2026-11-12' });
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- test/scheduled.test.ts`
Expected: FAIL (rutas inexistentes).

- [ ] **Step 3: Enlace al registrar**

Create `apps/api/src/modules/scheduled/link.ts`:

```ts
import type { RecurringOnCreateInput, TransactionInput } from '@finanzas/shared';
import { isOccurrence } from '../../domain/recurrence';
import type { Prisma } from '../../generated/prisma/client';
import { toDbDate } from '../../lib/db';
import { badRequest, conflict } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';

export interface LinkPlan {
  scheduledItemId: string | null;
  recurring: RecurringOnCreateInput | null;
}

const NOT_PENDING = () => conflict('NOT_PENDING', 'Esta ocurrencia ya fue pagada u omitida.');

/** Spec 8.11: valida el enlace con una ocurrencia o la regla recurrente antes de escribir. */
export async function prepareLink(
  db: DbClient,
  userId: string,
  input: TransactionInput,
  link: LinkPlan,
): Promise<LinkPlan> {
  if (link.scheduledItemId && link.recurring) {
    throw badRequest('VALIDATION_ERROR', 'Elige enlazar con una obligación o marcar como recurrente.', {
      recurring: 'No se puede junto con un enlace',
    });
  }
  if (link.scheduledItemId) {
    const item = await db.scheduledItem.findFirst({ where: { id: link.scheduledItemId, userId } });
    if (!item) {
      throw badRequest('INVALID_REFERENCE', 'Revisa la obligación seleccionada.', {
        scheduledItemId: 'Ocurrencia no encontrada',
      });
    }
    if (item.status !== 'PENDING') throw NOT_PENDING();
    if (item.kind !== (input.type === 'INCOME' ? 'INCOME' : 'EXPENSE')) {
      throw badRequest('INVALID_REFERENCE', 'Revisa la obligación seleccionada.', {
        scheduledItemId: 'No corresponde al tipo de movimiento',
      });
    }
  }
  if (link.recurring) {
    const r = link.recurring;
    if (r.endDate && r.endDate < input.date) {
      throw badRequest('VALIDATION_ERROR', 'Revisa los datos ingresados.', {
        'recurring.endDate': 'Debe ser igual o posterior a la fecha del movimiento',
      });
    }
    // Plan, decisión 4: en la quincena, la fecha del movimiento es uno de sus dos días.
    if (r.frequency === 'SEMIMONTHLY' && !isOccurrence({ ...r, startDate: input.date, endDate: null }, input.date)) {
      throw badRequest('VALIDATION_ERROR', 'Revisa los datos ingresados.', {
        'recurring.day1': 'La fecha del movimiento debe ser uno de los dos días de la quincena',
      });
    }
  }
  return link;
}

/** Escribe el enlace en la misma transacción de base de datos que el movimiento. */
export async function applyLink(
  tx: Prisma.TransactionClient,
  userId: string,
  transactionId: string,
  input: TransactionInput,
  link: LinkPlan,
  name: string,
) {
  if (link.scheduledItemId) {
    const { count } = await tx.scheduledItem.updateMany({
      where: { id: link.scheduledItemId, userId, status: 'PENDING' },
      data: { status: 'DONE', transactionId },
    });
    if (count !== 1) throw NOT_PENDING();
  }
  if (
    link.recurring &&
    (input.type === 'INCOME' || input.type === 'EXPENSE' || input.type === 'CARD_PURCHASE')
  ) {
    const r = link.recurring;
    const date = toDbDate(input.date);
    const common = {
      userId,
      kind: input.type === 'INCOME' ? ('INCOME' as const) : ('EXPENSE' as const),
      name,
      amount: BigInt(input.amount),
      categoryId: input.categoryId,
      accountId: input.type === 'CARD_PURCHASE' ? null : input.accountId,
      creditCardId: input.type === 'CARD_PURCHASE' ? input.creditCardId : null,
    };
    const rule = await tx.recurringRule.create({
      data: {
        ...common,
        frequency: r.frequency,
        intervalDays: r.intervalDays,
        day1: r.day1,
        day2: r.day2,
        startDate: date,
        endDate: r.endDate ? toDbDate(r.endDate) : null,
        activeFrom: date,
      },
    });
    await tx.scheduledItem.create({
      data: {
        ...common,
        recurringRuleId: rule.id,
        ruleDate: date,
        dueDate: date,
        status: 'DONE',
        transactionId,
      },
    });
  }
}
```

En `apps/api/src/modules/transactions/service.ts`, importar `{ applyLink, prepareLink } from '../scheduled/link'` y reemplazar `createTransaction` por:

```ts
export async function createTransaction(
  db: PrismaClient,
  auth: AuthContext,
  input: TransactionInput,
): Promise<TransactionResultDTO> {
  const p = await prepareTransaction(db, auth, input);
  const link = await prepareLink(db, auth.userId, input, linkFieldsOf(input));
  const name = (input.description ?? p.refs.category?.name ?? 'Recurrente').slice(0, 60);
  const id = await db.$transaction(async (tx) => {
    const created = await insertTransaction(tx, auth.userId, p);
    await applyLink(tx, auth.userId, created, input, link, name);
    return created;
  });
  return transactionResult(db, auth.userId, id, p);
}
```

- [ ] **Step 4: Servicio de ocurrencias**

Create `apps/api/src/modules/scheduled/service.ts`:

```ts
import {
  addDays,
  addMonths,
  diffDays,
  endOfMonth,
  type IsoDate,
  type ScheduledCompleteInput,
  type ScheduledCreateInput,
  type ScheduledItemDTO,
  type ScheduledListQuery,
  type ScheduledSuggestionsQuery,
  type ScheduledUpdateInput,
  type TransactionInput,
  type TransactionResultDTO,
} from '@finanzas/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { badRequest, conflict, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import { accountRefSelect, categoryRefSelect, refSelect } from '../../lib/selects';
import type { AuthContext } from '../../types/fastify';
import { listCreditCards } from '../credit-cards/service';
import { listDebts } from '../debts/service';
import { checkScheduleRefs } from '../planning/refs';
import { ensureScheduled } from '../recurring/service';
import { insertTransaction, prepareTransaction, transactionResult } from '../transactions/service';

const itemInclude = {
  category: { select: categoryRefSelect },
  account: { select: accountRefSelect },
  creditCard: { select: refSelect },
} satisfies Prisma.ScheduledItemInclude;
type ItemRow = Prisma.ScheduledItemGetPayload<{ include: typeof itemInclude }>;

const NOT_PENDING = () => conflict('NOT_PENDING', 'Esta ocurrencia ya fue pagada u omitida.');

export function toScheduledDTO(r: ItemRow): ScheduledItemDTO {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    amount: num(r.amount),
    dueDate: fromDbDate(r.dueDate),
    ruleDate: r.ruleDate ? fromDbDate(r.ruleDate) : null,
    status: r.status,
    category: r.category,
    account: r.account,
    creditCard: r.creditCard,
    recurringRuleId: r.recurringRuleId,
    transactionId: r.transactionId,
    derived: null,
    sourceId: null,
  };
}

async function findItem(db: DbClient, userId: string, id: string) {
  const item = await db.scheduledItem.findFirst({ where: { id, userId } });
  if (!item) throw notFound('Ocurrencia no encontrada.');
  return item;
}

const readItem = async (db: DbClient, id: string) =>
  toScheduledDTO(await db.scheduledItem.findUniqueOrThrow({ where: { id }, include: itemInclude }));

/** Vencimientos calculados de tarjetas (pago del mes) y préstamos (cuota pendiente): solo lectura. */
async function derivedItems(
  db: DbClient,
  auth: AuthContext,
  from: IsoDate | undefined,
  to: IsoDate,
): Promise<ScheduledItemDTO[]> {
  const [cards, debts] = await Promise.all([
    listCreditCards(db, auth.userId, auth.today),
    listDebts(db, auth.userId, auth.today),
  ]);
  const inRange = (d: IsoDate) => d <= to && (!from || d >= from);
  const empty = {
    kind: 'EXPENSE' as const,
    ruleDate: null,
    status: 'PENDING' as const,
    category: null,
    account: null,
    recurringRuleId: null,
    transactionId: null,
  };
  const cardItems = cards
    .filter((c) => c.isActive && c.amountDue > 0 && inRange(c.dueDate))
    .map(
      (c): ScheduledItemDTO => ({
        ...empty,
        id: `card:${c.id}`,
        name: `Pago ${c.name}`,
        amount: c.amountDue,
        dueDate: c.dueDate,
        creditCard: { id: c.id, name: c.name, icon: c.icon, color: c.color, isActive: c.isActive },
        derived: 'CARD',
        sourceId: c.id,
      }),
    );
  const loanItems = debts
    .filter((d) => d.isActive && d.installmentDue > 0 && d.nextPaymentDate && inRange(d.nextPaymentDate))
    .map(
      (d): ScheduledItemDTO => ({
        ...empty,
        id: `loan:${d.id}`,
        name: `Cuota ${d.name}`,
        amount: d.installmentDue,
        dueDate: d.nextPaymentDate!,
        creditCard: null,
        derived: 'LOAN',
        sourceId: d.id,
      }),
    );
  return [...cardItems, ...loanItems];
}

export async function listScheduled(
  db: PrismaClient,
  auth: AuthContext,
  q: ScheduledListQuery,
): Promise<ScheduledItemDTO[]> {
  await ensureScheduled(db, auth.userId, auth.today);
  const to = q.to ?? endOfMonth(addMonths(auth.today, 1));
  const statuses = q.status ?? ['PENDING'];
  const rows = await db.scheduledItem.findMany({
    where: {
      userId: auth.userId,
      status: { in: statuses },
      dueDate: { lte: toDbDate(to), ...(q.from && { gte: toDbDate(q.from) }) },
    },
    include: itemInclude,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
  });
  const items = rows.map(toScheduledDTO);
  if (statuses.includes('PENDING')) items.push(...(await derivedItems(db, auth, q.from, to)));
  return items.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}

/** Obligación única o ingreso esperado (sin regla). */
export async function createScheduled(
  db: DbClient,
  auth: AuthContext,
  input: ScheduledCreateInput,
): Promise<ScheduledItemDTO> {
  await checkScheduleRefs(db, auth.userId, input);
  const item = await db.scheduledItem.create({
    data: {
      userId: auth.userId,
      kind: input.kind,
      name: input.name,
      amount: BigInt(input.amount),
      dueDate: toDbDate(input.dueDate),
      categoryId: input.categoryId,
      accountId: input.accountId,
      creditCardId: input.creditCardId,
    },
    include: itemInclude,
  });
  return toScheduledDTO(item);
}

export async function updateScheduled(
  db: DbClient,
  auth: AuthContext,
  id: string,
  input: ScheduledUpdateInput,
): Promise<ScheduledItemDTO> {
  const { userId } = auth;
  const item = await findItem(db, userId, id);
  if (item.status === 'DONE') {
    throw conflict('SCHEDULED_DONE', 'Ya está pagada: edita el movimiento enlazado.');
  }
  const editsFields = Object.keys(input).some((k) => k !== 'status');
  if (item.status === 'SKIPPED' && editsFields) {
    throw conflict('SCHEDULED_SKIPPED', 'Reabre la ocurrencia para editarla.');
  }
  const next = {
    kind: item.kind,
    categoryId: input.categoryId ?? item.categoryId,
    accountId: input.accountId !== undefined ? input.accountId : item.accountId,
    creditCardId: input.creditCardId !== undefined ? input.creditCardId : item.creditCardId,
  };
  const validShape =
    next.kind === 'INCOME'
      ? Boolean(next.accountId) && !next.creditCardId
      : Boolean(next.accountId) !== Boolean(next.creditCardId);
  if (!validShape) {
    throw badRequest('VALIDATION_ERROR', 'Revisa los datos ingresados.', {
      accountId: 'Elige una cuenta o una tarjeta',
    });
  }
  if (input.categoryId || input.accountId || input.creditCardId) {
    await checkScheduleRefs(db, userId, next);
  }
  await db.scheduledItem.update({
    where: { id },
    data: {
      name: input.name,
      amount: input.amount !== undefined ? BigInt(input.amount) : undefined,
      dueDate: input.dueDate ? toDbDate(input.dueDate) : undefined,
      categoryId: input.categoryId,
      accountId: next.accountId,
      creditCardId: next.creditCardId,
      status: input.status,
    },
  });
  return readItem(db, id);
}

/** Spec 8.11: crea el movimiento real y marca la ocurrencia DONE, de forma atómica. */
export async function completeScheduled(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
  input: ScheduledCompleteInput,
): Promise<TransactionResultDTO> {
  const { userId, today } = auth;
  const item = await findItem(db, userId, id);
  if (item.status !== 'PENDING') throw NOT_PENDING();
  if (item.kind === 'INCOME' && input.creditCardId) {
    throw badRequest('VALIDATION_ERROR', 'Un ingreso no puede llegar a una tarjeta.', {
      creditCardId: 'No aplica',
    });
  }
  const due = fromDbDate(item.dueDate);
  const accountId = input.accountId ?? (input.creditCardId ? null : item.accountId);
  const creditCardId = input.creditCardId ?? (input.accountId ? null : item.creditCardId);
  const base = {
    amount: input.amount ?? num(item.amount),
    date: input.date ?? (due > today ? today : due),
    description: input.description ?? item.name,
    payee: null,
    notes: null,
    tags: [],
  };
  const txInput: TransactionInput =
    item.kind === 'INCOME'
      ? { type: 'INCOME', ...base, accountId: accountId!, categoryId: item.categoryId }
      : creditCardId
        ? { type: 'CARD_PURCHASE', ...base, creditCardId, categoryId: item.categoryId, installments: 1 }
        : {
            type: 'EXPENSE',
            ...base,
            accountId: accountId!,
            categoryId: item.categoryId,
            paymentMethod: null,
          };
  const prepared = await prepareTransaction(db, auth, txInput);
  const transactionId = await db.$transaction(async (tx) => {
    // El primero en marcarla gana: una segunda petición simultánea no crea otro movimiento.
    const claimed = await tx.scheduledItem.updateMany({
      where: { id, userId, status: 'PENDING' },
      data: { status: 'DONE' },
    });
    if (claimed.count !== 1) throw NOT_PENDING();
    const created = await insertTransaction(tx, userId, prepared);
    await tx.scheduledItem.update({ where: { id }, data: { transactionId: created } });
    return created;
  });
  return transactionResult(db, userId, transactionId, prepared);
}

export async function skipScheduled(
  db: DbClient,
  userId: string,
  id: string,
): Promise<ScheduledItemDTO> {
  const { count } = await db.scheduledItem.updateMany({
    where: { id, userId, status: 'PENDING' },
    data: { status: 'SKIPPED' },
  });
  if (count === 0) {
    await findItem(db, userId, id);
    throw NOT_PENDING();
  }
  return readItem(db, id);
}

export async function deleteScheduled(db: DbClient, userId: string, id: string): Promise<void> {
  const item = await findItem(db, userId, id);
  if (item.recurringRuleId) {
    throw conflict(
      'USE_SKIP',
      'Esta ocurrencia es de una regla recurrente: omítela en lugar de eliminarla.',
    );
  }
  await db.scheduledItem.delete({ where: { id } });
}

/** Spec 8.11: "¿Es el pago de X?" — misma categoría, ±20 % del valor y ±7 días. */
export async function suggestScheduled(
  db: PrismaClient,
  auth: AuthContext,
  q: ScheduledSuggestionsQuery,
): Promise<ScheduledItemDTO[]> {
  await ensureScheduled(db, auth.userId, auth.today);
  const rows = await db.scheduledItem.findMany({
    where: {
      userId: auth.userId,
      status: 'PENDING',
      kind: q.kind,
      categoryId: q.categoryId,
      dueDate: { gte: toDbDate(addDays(q.date, -7)), lte: toDbDate(addDays(q.date, 7)) },
    },
    include: itemInclude,
  });
  const distance = (r: ItemRow) => Math.abs(diffDays(q.date, fromDbDate(r.dueDate)));
  return rows
    .filter((r) => Math.abs(num(r.amount) - q.amount) <= 0.2 * num(r.amount))
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, 3)
    .map(toScheduledDTO);
}
```

- [ ] **Step 5: Rutas y registro**

Create `apps/api/src/modules/scheduled/routes.ts`:

```ts
import {
  scheduledCompleteSchema,
  scheduledCreateSchema,
  scheduledListQuerySchema,
  scheduledSuggestionsQuerySchema,
  scheduledUpdateSchema,
} from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import {
  completeScheduled,
  createScheduled,
  deleteScheduled,
  listScheduled,
  skipScheduled,
  suggestScheduled,
  updateScheduled,
} from './service';

export async function scheduledRoutes(app: FastifyInstance) {
  app.get('/scheduled', async (req) => ({
    items: await listScheduled(app.prisma, req.auth, parse(scheduledListQuerySchema, req.query)),
  }));

  app.get('/scheduled/suggestions', async (req) => ({
    items: await suggestScheduled(
      app.prisma,
      req.auth,
      parse(scheduledSuggestionsQuerySchema, req.query),
    ),
  }));

  app.post('/scheduled', async (req, reply) => {
    const item = await createScheduled(app.prisma, req.auth, parse(scheduledCreateSchema, req.body));
    return reply.status(201).send({ item });
  });

  app.put('/scheduled/:id', async (req) => ({
    item: await updateScheduled(
      app.prisma,
      req.auth,
      parseId(req.params),
      parse(scheduledUpdateSchema, req.body),
    ),
  }));

  app.post('/scheduled/:id/complete', async (req, reply) =>
    reply
      .status(201)
      .send(
        await completeScheduled(
          app.prisma,
          req.auth,
          parseId(req.params),
          parse(scheduledCompleteSchema, req.body),
        ),
      ),
  );

  app.post('/scheduled/:id/skip', async (req) => ({
    item: await skipScheduled(app.prisma, req.auth.userId, parseId(req.params)),
  }));

  app.delete('/scheduled/:id', async (req, reply) => {
    await deleteScheduled(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });
}
```

En `apps/api/src/app.ts`, importar `scheduledRoutes` y registrarla después de `recurringRoutes`.

- [ ] **Step 6: Verificar**

Run: `npm test -w @finanzas/api && npm run typecheck`
Expected: PASS (todo el backend, incluidas las pruebas de correctitud de la Fase 1).

---

### Task 12: Configuración financiera y presupuestos

**Files:**
- Modify: `apps/api/src/domain/balances.ts` (+ `balances.test.ts`)
- Create: `apps/api/src/modules/settings/service.ts`, `apps/api/src/modules/settings/routes.ts`
- Create: `apps/api/src/modules/budgets/service.ts`, `apps/api/src/modules/budgets/routes.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/settings-budgets.test.ts`

**Interfaces:**
- Consumes: `budgetProjection`, `usageOf` (Task 5); `ensureScheduled` (Task 10); `categoryRefSelect` (Task 10); `financialSettingsSchema`, `budgetPutSchema`, `monthParamsSchema` (Task 1).
- Produces:
  - `projectedIncome(received: number, expectedPending: number, estimate: number | null): number` en `domain/balances.ts` (spec 8.8).
  - `settings/service.ts`: `toSettingsDTO(c: FinancialConfiguration): FinancialSettingsDTO`, `getFinancialSettings(db: PrismaClient, auth): Promise<FinancialSettingsResponse>`, `updateFinancialSettings(db: PrismaClient, auth, input): Promise<FinancialSettingsResponse>`.
  - `budgets/service.ts`: `interface BudgetComputation { dto: BudgetDTO; scope: Set<string> | null }`, `computeBudget(db: PrismaClient, auth, month: string): Promise<BudgetComputation>`, `getBudget(db, auth, month): Promise<BudgetDTO>`, `putBudget(db: PrismaClient, auth, month, input): Promise<BudgetDTO>`, `clearBudget(db: PrismaClient, userId, month): Promise<void>`.
  - Rutas: `GET/PUT /api/settings/financial`; `GET/PUT/DELETE /api/budgets/:month` (`{ budget }`; `DELETE` → 204).

- [ ] **Step 1: Escribir los tests**

En `apps/api/src/domain/balances.test.ts`, agregar al final:

```ts
describe('projectedIncome (spec 8.8)', () => {
  it('adds received and expected income, and falls back to the estimate', () => {
    expect(projectedIncome(4_000_000, 1_000_000, 3_000_000)).toBe(5_000_000);
    expect(projectedIncome(0, 0, 3_000_000)).toBe(3_000_000);
    expect(projectedIncome(0, 0, null)).toBe(0);
  });
});
```

(agregar `projectedIncome` al import de `./balances`).

Create `apps/api/test/settings-budgets.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { setupFinances } from './finance-fixtures';
import { createTestApp, registerUser, type Client } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

async function newUser() {
  const { api } = await registerUser(app);
  return { api, f: await setupFinances(api) };
}

const spend = (api: Client, categoryId: string, amount: number, accountId: string) =>
  api.post('/api/transactions', { type: 'EXPENSE', amount, date: TODAY, accountId, categoryId });

const settings = {
  obligationsPct: 50,
  savingsPct: 20,
  investmentPct: 10,
  leisurePct: 10,
  otherPct: 10,
  monthlyIncomeEstimate: null,
  lowBalanceThreshold: 100_000,
};

describe('financial settings (spec 8.8)', () => {
  it('starts with the defaults and validates that percentages add up to 100', async () => {
    const { api } = await newUser();
    const res = await api.get('/api/settings/financial');
    expect(res.body.settings).toEqual(settings);
    expect(res.body.month).toMatchObject({ key: '2026-10', projectedIncome: 0 });
    const bad = await api.put('/api/settings/financial', { ...settings, savingsPct: 25 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.total).toBeTypeOf('string');
  });

  it('shows target and actual per bucket from the projected income', async () => {
    const { api, f } = await newUser();
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 4_000_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    await api.post('/api/scheduled', {
      kind: 'INCOME',
      name: 'Bono',
      amount: 1_000_000,
      dueDate: '2026-10-28',
      categoryId: f.cat.salary,
      accountId: f.bank,
    });
    await spend(api, f.cat.food, 300_000, f.bank);
    await spend(api, f.cat.fun, 100_000, f.bank);
    await api.post('/api/transfers', { amount: 800_000, date: TODAY, accountId: f.bank, toAccountId: f.savings });

    const { body } = await api.get('/api/settings/financial');
    expect(body.month.projectedIncome).toBe(5_000_000);
    const bucket = (key: string) => body.month.buckets.find((b: { key: string }) => b.key === key);
    expect(bucket('OBLIGATIONS')).toMatchObject({ target: 2_500_000, actual: 300_000 });
    expect(bucket('SAVINGS')).toMatchObject({ target: 1_000_000, actual: 800_000 });
    expect(bucket('LEISURE')).toMatchObject({ target: 500_000, actual: 100_000 });
  });

  it('uses the monthly estimate when nothing was received yet', async () => {
    const { api } = await newUser();
    const res = await api.put('/api/settings/financial', {
      ...settings,
      savingsPct: 25,
      otherPct: 5,
      monthlyIncomeEstimate: 3_000_000,
    });
    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject({ savingsPct: 25, monthlyIncomeEstimate: 3_000_000 });
    expect(res.body.month.projectedIncome).toBe(3_000_000);
  });
});

describe('budgets (spec 8.9)', () => {
  it('a month without budget answers empty', async () => {
    const { api } = await newUser();
    const res = await api.get('/api/budgets/2026-10');
    expect(res.status).toBe(200);
    expect(res.body.budget).toEqual({
      month: '2026-10',
      totalAmount: null,
      lines: [],
      total: null,
      projection: null,
      daysLeft: 12,
      copiedFrom: null,
    });
    expect((await api.get('/api/budgets/2026-13')).status).toBe(400);
  });

  it('counts subcategories and card purchases, and projects the month', async () => {
    const { api, f } = await newUser();
    const child = (
      await api.post('/api/categories', { name: 'Domicilios', kind: 'EXPENSE', parentId: f.cat.food })
    ).body.category.id as string;
    await spend(api, f.cat.food, 300_000, f.bank);
    await spend(api, child, 50_000, f.bank);
    await api.post(`/api/credit-cards/${f.card}/purchase`, { amount: 100_000, date: TODAY, categoryId: f.cat.food });
    await spend(api, f.cat.fun, 250_000, f.bank);
    await spend(api, f.cat.interest, 100_000, f.bank);

    const put = await api.put('/api/budgets/2026-10', {
      totalAmount: 2_000_000,
      lines: [
        { categoryId: f.cat.food, amount: 600_000 },
        { categoryId: f.cat.fun, amount: 200_000 },
      ],
    });
    expect(put.status).toBe(200);
    const b = put.body.budget;
    expect(b.lines.map((l: { category: { id: string }; spent: number; usage: number; remaining: number }) => [l.category.id, l.spent, l.usage, l.remaining])).toEqual([
      [f.cat.food, 450_000, 0.75, 150_000],
      [f.cat.fun, 250_000, 1.25, -50_000],
    ]);
    // Con total general cuenta todo el gasto del mes.
    expect(b.total).toEqual({ budget: 2_000_000, spent: 800_000, remaining: 1_200_000, usage: 0.4 });
    expect(b.projection).toEqual({ projectedSpend: 1_240_000, exceedsOnDay: null });

    // Solo con líneas, cuenta lo de las categorías presupuestadas (decisión 1 del plan).
    const linesOnly = await api.put('/api/budgets/2026-10', {
      totalAmount: null,
      lines: [
        { categoryId: f.cat.food, amount: 600_000 },
        { categoryId: f.cat.fun, amount: 200_000 },
      ],
    });
    expect(linesOnly.body.budget.total).toEqual({ budget: 800_000, spent: 700_000, remaining: 100_000, usage: 0.875 });
  });

  it('copies the latest previous budget without deleted categories, never into the past', async () => {
    const { api, f } = await newUser();
    await api.put('/api/budgets/2026-09', {
      totalAmount: 1_500_000,
      lines: [
        { categoryId: f.cat.food, amount: 600_000 },
        { categoryId: f.cat.fun, amount: 200_000 },
      ],
    });
    await api.del(`/api/categories/${f.cat.fun}`);
    const oct = (await api.get('/api/budgets/2026-10')).body.budget;
    expect(oct.copiedFrom).toBe('2026-09');
    expect(oct.totalAmount).toBe(1_500_000);
    expect(oct.lines.map((l: { category: { id: string } }) => l.category.id)).toEqual([f.cat.food]);
    expect((await api.get('/api/budgets/2026-10')).body.budget.copiedFrom).toBeNull();
    expect((await api.get('/api/budgets/2026-08')).body.budget.total).toBeNull();
  });

  it('a deleted month stays empty and stops the copying (review focus #4)', async () => {
    const { api, f } = await newUser();
    await api.put('/api/budgets/2026-09', { totalAmount: 1_000_000, lines: [] });
    expect((await api.get('/api/budgets/2026-10')).body.budget.copiedFrom).toBe('2026-09');
    expect((await api.del('/api/budgets/2026-10')).status).toBe(204);
    expect((await api.get('/api/budgets/2026-10')).body.budget.total).toBeNull();
    expect((await api.get('/api/budgets/2026-11')).body.budget.total).toBeNull();
    const bad = await api.put('/api/budgets/2026-11', {
      totalAmount: null,
      lines: [{ categoryId: f.cat.salary, amount: 1000 }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields['lines.0.categoryId']).toBeTypeOf('string');
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- test/settings-budgets.test.ts src/domain/balances.test.ts`
Expected: FAIL (rutas y función inexistentes).

- [ ] **Step 3: Ingreso proyectado**

En `apps/api/src/domain/balances.ts`, al final:

```ts
/** Spec 8.8: recibido + esperado pendiente del mes; si ambos son 0, la estimación del usuario. */
export function projectedIncome(
  received: number,
  expectedPending: number,
  estimate: number | null,
): number {
  const total = received + expectedPending;
  return total > 0 ? total : (estimate ?? 0);
}
```

- [ ] **Step 4: Configuración financiera**

Create `apps/api/src/modules/settings/service.ts`:

```ts
import {
  endOfMonth,
  monthKey,
  startOfMonth,
  type BucketKey,
  type BucketProgressDTO,
  type FinancialSettingsDTO,
  type FinancialSettingsInput,
  type FinancialSettingsResponse,
} from '@finanzas/shared';
import { monthFlows, projectedIncome } from '../../domain/balances';
import { pctOf } from '../../domain/savings';
import type { FinancialConfiguration, PrismaClient } from '../../generated/prisma/client';
import { num, toDbDate } from '../../lib/db';
import type { AuthContext } from '../../types/fastify';
import { listAccounts } from '../accounts/service';
import { ledgerEntries } from '../ledger/repository';
import { ensureScheduled } from '../recurring/service';

export function toSettingsDTO(c: FinancialConfiguration): FinancialSettingsDTO {
  return {
    obligationsPct: c.obligationsPct,
    savingsPct: c.savingsPct,
    investmentPct: c.investmentPct,
    leisurePct: c.leisurePct,
    otherPct: c.otherPct,
    monthlyIncomeEstimate: c.monthlyIncomeEstimate != null ? num(c.monthlyIncomeEstimate) : null,
    lowBalanceThreshold: num(c.lowBalanceThreshold),
  };
}

/** Spec 8.8: objetivo = % × ingreso proyectado; real = gasto por bolsa, ahorro e inversión del mes. */
export async function getFinancialSettings(
  db: PrismaClient,
  auth: AuthContext,
): Promise<FinancialSettingsResponse> {
  const { userId, today } = auth;
  await ensureScheduled(db, userId, today);
  const month = { gte: toDbDate(startOfMonth(today)), lte: toDbDate(endOfMonth(today)) };
  const [config, accounts, entries, pending, byCategory] = await Promise.all([
    db.financialConfiguration.findUniqueOrThrow({ where: { userId } }),
    listAccounts(db, userId),
    ledgerEntries(db, userId, { from: startOfMonth(today), to: endOfMonth(today) }),
    db.scheduledItem.aggregate({
      where: { userId, kind: 'INCOME', status: 'PENDING', dueDate: month },
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, type: { in: ['EXPENSE', 'CARD_PURCHASE'] }, date: month },
      _sum: { amount: true },
    }),
  ]);
  const flows = monthFlows(entries, new Map(accounts.map((a) => [a.id, a.type])));
  const settings = toSettingsDTO(config);
  const income = projectedIncome(flows.income, num(pending._sum.amount), settings.monthlyIncomeEstimate);

  const categories = await db.category.findMany({
    where: { userId, id: { in: byCategory.flatMap((r) => (r.categoryId ? [r.categoryId] : [])) } },
    select: { id: true, bucket: true },
  });
  const bucketOf = new Map(categories.map((c) => [c.id, c.bucket ?? 'OTHER']));
  const spent = { OBLIGATIONS: 0, LEISURE: 0, OTHER: 0 };
  for (const row of byCategory) {
    const bucket = (row.categoryId ? bucketOf.get(row.categoryId) : undefined) ?? 'OTHER';
    spent[bucket] += num(row._sum.amount);
  }

  const bucket = (key: BucketKey, label: string, pct: number, actual: number): BucketProgressDTO => ({
    key,
    label,
    pct,
    target: pctOf(income, pct),
    actual,
  });
  return {
    settings,
    month: {
      key: monthKey(today),
      projectedIncome: income,
      buckets: [
        bucket('OBLIGATIONS', 'Obligaciones', settings.obligationsPct, spent.OBLIGATIONS),
        bucket('SAVINGS', 'Ahorro', settings.savingsPct, flows.savings),
        bucket('INVESTMENT', 'Inversión', settings.investmentPct, flows.investment),
        bucket('LEISURE', 'Entretenimiento', settings.leisurePct, spent.LEISURE),
        bucket('OTHER', 'Otros', settings.otherPct, spent.OTHER),
      ],
    },
  };
}

export async function updateFinancialSettings(
  db: PrismaClient,
  auth: AuthContext,
  input: FinancialSettingsInput,
): Promise<FinancialSettingsResponse> {
  await db.financialConfiguration.update({
    where: { userId: auth.userId },
    data: {
      ...input,
      monthlyIncomeEstimate:
        input.monthlyIncomeEstimate !== null ? BigInt(input.monthlyIncomeEstimate) : null,
      lowBalanceThreshold: BigInt(input.lowBalanceThreshold),
    },
  });
  return getFinancialSettings(db, auth);
}
```

Create `apps/api/src/modules/settings/routes.ts`:

```ts
import { financialSettingsSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse } from '../../lib/validation';
import { getFinancialSettings, updateFinancialSettings } from './service';

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/settings/financial', async (req) => getFinancialSettings(app.prisma, req.auth));

  app.put('/settings/financial', async (req) =>
    updateFinancialSettings(app.prisma, req.auth, parse(financialSettingsSchema, req.body)),
  );
}
```

- [ ] **Step 5: Presupuestos**

Create `apps/api/src/modules/budgets/service.ts`:

```ts
import {
  diffDays,
  endOfMonth,
  monthKey,
  monthStartFromKey,
  startOfMonth,
  type BudgetDTO,
  type BudgetLineDTO,
  type BudgetPutInput,
  type IsoDate,
} from '@finanzas/shared';
import { budgetProjection, usageOf } from '../../domain/budget';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { badRequest, isUniqueViolation } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import { categoryRefSelect } from '../../lib/selects';
import type { AuthContext } from '../../types/fastify';

const budgetInclude = {
  categories: { include: { category: { select: { ...categoryRefSelect, sortOrder: true } } } },
} satisfies Prisma.BudgetInclude;
type BudgetRow = Prisma.BudgetGetPayload<{ include: typeof budgetInclude }>;

export interface BudgetComputation {
  dto: BudgetDTO;
  /** Categorías que cuenta el presupuesto; null = todo el gasto (hay total general). */
  scope: Set<string> | null;
}

const loadRow = (db: DbClient, userId: string, monthStart: IsoDate) =>
  db.budget.findUnique({
    where: { userId_month: { userId, month: toDbDate(monthStart) } },
    include: budgetInclude,
  });

const isEmpty = (row: BudgetRow) => row.totalAmount === null && row.categories.length === 0;

/**
 * Spec 8.9: un mes actual o futuro sin fila copia el último mes anterior que tenga fila, sin las
 * categorías eliminadas. Si esa fila está vacía (se eliminó), no se copia nada (review focus #4).
 */
async function copyPrevious(db: PrismaClient, userId: string, monthStart: IsoDate): Promise<string | null> {
  const prev = await db.budget.findFirst({
    where: { userId, month: { lt: toDbDate(monthStart) } },
    orderBy: { month: 'desc' },
    include: { categories: { include: { category: { select: { isActive: true } } } } },
  });
  if (!prev) return null;
  const lines = prev.categories.filter((l) => l.category.isActive);
  if (prev.totalAmount === null && lines.length === 0) return null;
  try {
    await db.$transaction(async (tx) => {
      const created = await tx.budget.create({
        data: { userId, month: toDbDate(monthStart), totalAmount: prev.totalAmount },
      });
      if (lines.length > 0) {
        await tx.budgetCategory.createMany({
          data: lines.map((l) => ({
            userId,
            budgetId: created.id,
            categoryId: l.categoryId,
            amount: l.amount,
          })),
        });
      }
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err; // otra petición ya lo copió
  }
  return monthKey(fromDbDate(prev.month));
}

export async function computeBudget(
  db: PrismaClient,
  auth: AuthContext,
  month: string,
): Promise<BudgetComputation> {
  const { userId, today } = auth;
  const monthStart = monthStartFromKey(month);
  const monthEnd = endOfMonth(monthStart);
  let row = await loadRow(db, userId, monthStart);
  let copiedFrom: string | null = null;
  if (!row && monthStart >= startOfMonth(today)) {
    copiedFrom = await copyPrevious(db, userId, monthStart);
    if (copiedFrom) row = await loadRow(db, userId, monthStart);
  }
  const isCurrent = monthStart === startOfMonth(today);
  const daysLeft = isCurrent ? diffDays(today, monthEnd) + 1 : null;
  if (!row || isEmpty(row)) {
    return {
      dto: { month, totalAmount: null, lines: [], total: null, projection: null, daysLeft, copiedFrom: null },
      scope: null,
    };
  }

  const lineIds = row.categories.map((l) => l.categoryId);
  const [spentRows, children] = await Promise.all([
    db.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: { in: ['EXPENSE', 'CARD_PURCHASE'] },
        date: { gte: toDbDate(monthStart), lte: toDbDate(monthEnd) },
      },
      _sum: { amount: true },
    }),
    db.category.findMany({
      where: { userId, parentId: { in: lineIds } },
      select: { id: true, parentId: true },
    }),
  ]);
  const spentBy = new Map(spentRows.map((r) => [r.categoryId ?? '', num(r._sum.amount)]));
  const childrenOf = new Map<string, string[]>();
  for (const c of children) {
    if (c.parentId) childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c.id]);
  }
  const spentIn = (id: string) =>
    (spentBy.get(id) ?? 0) + (childrenOf.get(id) ?? []).reduce((s, cid) => s + (spentBy.get(cid) ?? 0), 0);

  const lines: BudgetLineDTO[] = [...row.categories]
    .sort((a, b) => a.category.sortOrder - b.category.sortOrder)
    .map((l) => {
      const { sortOrder: _sortOrder, ...category } = l.category;
      const amount = num(l.amount);
      const spent = spentIn(l.categoryId);
      return { id: l.id, category, amount, spent, remaining: amount - spent, usage: usageOf(spent, amount) };
    });

  // Plan, decisión 1: sin total general, cuenta solo lo presupuestado y sus subcategorías.
  const scope = row.totalAmount !== null ? null : new Set([...lineIds, ...children.map((c) => c.id)]);
  const budget = row.totalAmount !== null ? num(row.totalAmount) : lines.reduce((s, l) => s + l.amount, 0);
  const spent = scope
    ? [...scope].reduce((s, id) => s + (spentBy.get(id) ?? 0), 0)
    : [...spentBy.values()].reduce((s, v) => s + v, 0);
  return {
    dto: {
      month,
      totalAmount: row.totalAmount !== null ? num(row.totalAmount) : null,
      lines,
      total: { budget, spent, remaining: budget - spent, usage: usageOf(spent, budget) },
      projection: isCurrent ? budgetProjection({ budget, spent, today }) : null,
      daysLeft,
      copiedFrom,
    },
    scope,
  };
}

export async function getBudget(db: PrismaClient, auth: AuthContext, month: string): Promise<BudgetDTO> {
  return (await computeBudget(db, auth, month)).dto;
}

export async function putBudget(
  db: PrismaClient,
  auth: AuthContext,
  month: string,
  input: BudgetPutInput,
): Promise<BudgetDTO> {
  const { userId } = auth;
  const categories = await db.category.findMany({
    where: { userId, id: { in: input.lines.map((l) => l.categoryId) } },
  });
  const byId = new Map(categories.map((c) => [c.id, c]));
  const fields: Record<string, string> = {};
  input.lines.forEach((l, i) => {
    const c = byId.get(l.categoryId);
    if (!c) fields[`lines.${i}.categoryId`] = 'Categoría no encontrada';
    else if (c.kind !== 'EXPENSE') fields[`lines.${i}.categoryId`] = 'Debe ser una categoría de gasto';
    else if (!c.isActive || c.isSystem) fields[`lines.${i}.categoryId`] = 'Categoría no disponible';
  });
  if (Object.keys(fields).length > 0) {
    throw badRequest('INVALID_REFERENCE', 'Revisa las categorías del presupuesto.', fields);
  }
  const monthDate = toDbDate(monthStartFromKey(month));
  const totalAmount = input.totalAmount !== null ? BigInt(input.totalAmount) : null;
  await db.$transaction(async (tx) => {
    const budget = await tx.budget.upsert({
      where: { userId_month: { userId, month: monthDate } },
      create: { userId, month: monthDate, totalAmount },
      update: { totalAmount },
    });
    await tx.budgetCategory.deleteMany({ where: { userId, budgetId: budget.id } });
    if (input.lines.length > 0) {
      await tx.budgetCategory.createMany({
        data: input.lines.map((l) => ({
          userId,
          budgetId: budget.id,
          categoryId: l.categoryId,
          amount: BigInt(l.amount),
        })),
      });
    }
  });
  return getBudget(db, auth, month);
}

/** Deja el mes vacío (conserva la fila) para que no se vuelva a copiar. */
export async function clearBudget(db: PrismaClient, userId: string, month: string): Promise<void> {
  const monthDate = toDbDate(monthStartFromKey(month));
  await db.$transaction(async (tx) => {
    const budget = await tx.budget.upsert({
      where: { userId_month: { userId, month: monthDate } },
      create: { userId, month: monthDate },
      update: { totalAmount: null },
    });
    await tx.budgetCategory.deleteMany({ where: { userId, budgetId: budget.id } });
  });
}
```

Create `apps/api/src/modules/budgets/routes.ts`:

```ts
import { budgetPutSchema, monthParamsSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse } from '../../lib/validation';
import { clearBudget, getBudget, putBudget } from './service';

export async function budgetRoutes(app: FastifyInstance) {
  app.get('/budgets/:month', async (req) => ({
    budget: await getBudget(app.prisma, req.auth, parse(monthParamsSchema, req.params).month),
  }));

  app.put('/budgets/:month', async (req) => ({
    budget: await putBudget(
      app.prisma,
      req.auth,
      parse(monthParamsSchema, req.params).month,
      parse(budgetPutSchema, req.body),
    ),
  }));

  app.delete('/budgets/:month', async (req, reply) => {
    await clearBudget(app.prisma, req.auth.userId, parse(monthParamsSchema, req.params).month);
    return reply.status(204).send();
  });
}
```

En `apps/api/src/app.ts`, importar y registrar `settingsRoutes` y `budgetRoutes` después de `scheduledRoutes`.

- [ ] **Step 6: Verificar**

Run: `npm test -w @finanzas/api -- test/settings-budgets.test.ts src/domain/balances.test.ts && npm run typecheck`
Expected: PASS. (Proyección del test: 800.000 en 20 días = 40.000/día × 31 = 1.240.000 ≤ 2.000.000.)

---

### Task 13: Metas con abonos y retiros

**Files:**
- Create: `apps/api/src/modules/goals/service.ts`, `apps/api/src/modules/goals/routes.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/goals.test.ts`

**Interfaces:**
- Consumes: `goalProgress` (Task 5); `createTransaction` (Task 9/11); `accountRefSelect` (Task 10); esquemas de metas (Task 1).
- Produces:
  - `listGoals(db: DbClient, auth): Promise<GoalDTO[]>` (sin `ARCHIVED`; activas primero), `getGoal`, `createGoal(db: DbClient, auth, input)`, `updateGoal(db: DbClient, auth, id, input)`, `deleteGoal(db: PrismaClient, userId, id)`, `contributeToGoal(db: PrismaClient, auth, id, input)`, `withdrawFromGoal(db: PrismaClient, auth, id, input)` (estas dos devuelven `TransactionResultDTO & { goal: GoalDTO }`).
  - Rutas: `GET/POST /api/goals`, `GET/PUT/DELETE /api/goals/:id`, `POST /api/goals/:id/contributions`, `POST /api/goals/:id/withdrawals` (201).

- [ ] **Step 1: Escribir los tests**

Create `apps/api/test/goals.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { balanceOf, setupFinances } from './finance-fixtures';
import { createTestApp, registerUser } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

async function newUser() {
  const { api } = await registerUser(app);
  const f = await setupFinances(api);
  const goal = (await api.post('/api/goals', {
    name: 'Comprar computador',
    targetAmount: 5_000_000,
    targetDate: '2027-06-30',
    accountId: f.savings,
    initialAmount: 1_000_000,
  })).body.goal;
  return { api, f, goal };
}

describe('goals (spec 8.10)', () => {
  it('lives in a savings or investment account', async () => {
    const { api, f, goal } = await newUser();
    expect(goal).toMatchObject({ progress: 1_000_000, pct: 0.2, status: 'ACTIVE', account: { id: f.savings } });
    const bad = await api.post('/api/goals', { name: 'Viaje', targetAmount: 1000, accountId: f.bank });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.accountId).toBeTypeOf('string');
  });

  it('contributions and withdrawals are transfers, never expenses', async () => {
    const { api, f, goal } = await newUser();
    const add = await api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.bank,
      amount: 500_000,
      date: TODAY,
    });
    expect(add.status).toBe(201);
    expect(add.body.transaction).toMatchObject({ type: 'TRANSFER', goalId: goal.id, description: 'Abono a Comprar computador' });
    const out = await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 100_000,
      date: TODAY,
    });
    expect(out.body.goal).toMatchObject({
      contributed: 500_000,
      withdrawn: 100_000,
      progress: 1_400_000,
      remaining: 3_600_000,
      monthlyNeeded: 450_000,
    });
    const d = (await api.get('/api/dashboard')).body;
    expect(d.thisMonth).toMatchObject({ expense: 0, income: 0, savings: 400_000 });
    expect(await balanceOf(api, f.bank)).toBe(1_600_000);
    const same = await api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.savings,
      amount: 1000,
      date: TODAY,
    });
    expect(same.status).toBe(400);
  });

  it('completes and reopens, but never archives', async () => {
    const { api, goal } = await newUser();
    expect((await api.put(`/api/goals/${goal.id}`, { status: 'COMPLETED' })).body.goal.status).toBe('COMPLETED');
    expect((await api.put(`/api/goals/${goal.id}`, { status: 'ACTIVE' })).body.goal.status).toBe('ACTIVE');
    expect((await api.put(`/api/goals/${goal.id}`, { status: 'ARCHIVED' })).status).toBe(400);
  });

  it('moves to another account only without movements (decision 5)', async () => {
    const { api, f, goal } = await newUser();
    const other = (await api.post('/api/accounts', { name: 'CDT', type: 'INVESTMENT' })).body.account.id;
    expect((await api.put(`/api/goals/${goal.id}`, { accountId: other })).body.goal.account.id).toBe(other);
    await api.post(`/api/goals/${goal.id}/contributions`, { fromAccountId: f.bank, amount: 1000, date: TODAY });
    const moved = await api.put(`/api/goals/${goal.id}`, { accountId: f.savings });
    expect(moved.status).toBe(409);
    expect(moved.body.error.code).toBe('GOAL_HAS_MOVEMENTS');
  });

  it('deleting a goal keeps its transfers as normal transfers; its account cannot be deleted before', async () => {
    const { api, f, goal } = await newUser();
    const add = await api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.bank,
      amount: 200_000,
      date: TODAY,
    });
    await api.post(`/api/goals/${goal.id}/withdrawals`, { toAccountId: f.bank, amount: 200_000, date: TODAY });
    const blocked = await api.del(`/api/accounts/${f.savings}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ACCOUNT_HAS_GOALS');

    expect((await api.del(`/api/goals/${goal.id}`)).status).toBe(204);
    const tx = (await api.get(`/api/transactions/${add.body.transaction.id}`)).body.transaction;
    expect(tx).toMatchObject({ type: 'TRANSFER', goalId: null });
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
    expect((await api.get('/api/goals')).body.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- test/goals.test.ts`
Expected: FAIL (rutas inexistentes).

- [ ] **Step 3: Servicio de metas**

Create `apps/api/src/modules/goals/service.ts`:

```ts
import type {
  GoalContributionInput,
  GoalCreateInput,
  GoalDTO,
  GoalUpdateInput,
  GoalWithdrawalInput,
  IsoDate,
  TransactionResultDTO,
} from '@finanzas/shared';
import { goalProgress } from '../../domain/goals';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { badRequest, conflict, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import { accountRefSelect } from '../../lib/selects';
import type { AuthContext } from '../../types/fastify';
import { createTransaction } from '../transactions/service';

const goalInclude = { account: { select: accountRefSelect } } satisfies Prisma.GoalInclude;
type GoalRow = Prisma.GoalGetPayload<{ include: typeof goalInclude }>;
interface GoalFlows {
  contributed: number;
  withdrawn: number;
}

/** Abono = transferencia con goalId que entra a la cuenta de la meta; retiro = la que sale. */
async function flowsOf(db: DbClient, userId: string, goals: GoalRow[]) {
  const flows = new Map<string, GoalFlows>(goals.map((g) => [g.id, { contributed: 0, withdrawn: 0 }]));
  if (goals.length === 0) return flows;
  const accountOf = new Map(goals.map((g) => [g.id, g.accountId]));
  const rows = await db.transaction.groupBy({
    by: ['goalId', 'toAccountId'],
    where: { userId, type: 'TRANSFER', goalId: { in: goals.map((g) => g.id) } },
    _sum: { amount: true },
  });
  for (const r of rows) {
    const f = r.goalId ? flows.get(r.goalId) : undefined;
    if (!f) continue;
    if (r.toAccountId === accountOf.get(r.goalId!)) f.contributed += num(r._sum.amount);
    else f.withdrawn += num(r._sum.amount);
  }
  return flows;
}

function toGoalDTO(g: GoalRow, f: GoalFlows, today: IsoDate): GoalDTO {
  const targetAmount = num(g.targetAmount);
  const initialAmount = num(g.initialAmount);
  const targetDate = g.targetDate ? fromDbDate(g.targetDate) : null;
  return {
    id: g.id,
    name: g.name,
    targetAmount,
    targetDate,
    account: g.account,
    initialAmount,
    status: g.status,
    icon: g.icon,
    color: g.color,
    contributed: f.contributed,
    withdrawn: f.withdrawn,
    ...goalProgress({
      targetAmount,
      initialAmount,
      contributed: f.contributed,
      withdrawn: f.withdrawn,
      targetDate,
      today,
    }),
  };
}

async function findGoal(db: DbClient, userId: string, id: string): Promise<GoalRow> {
  const goal = await db.goal.findUnique({ where: { id_userId: { id, userId } }, include: goalInclude });
  if (!goal) throw notFound('Meta no encontrada.');
  return goal;
}

export async function listGoals(db: DbClient, auth: AuthContext): Promise<GoalDTO[]> {
  const goals = await db.goal.findMany({
    where: { userId: auth.userId, status: { not: 'ARCHIVED' } },
    include: goalInclude,
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  });
  const flows = await flowsOf(db, auth.userId, goals);
  return goals.map((g) => toGoalDTO(g, flows.get(g.id)!, auth.today));
}

export async function getGoal(db: DbClient, auth: AuthContext, id: string): Promise<GoalDTO> {
  const goal = await findGoal(db, auth.userId, id);
  return toGoalDTO(goal, (await flowsOf(db, auth.userId, [goal])).get(id)!, auth.today);
}

/** Spec 7.3: el dinero de la meta vive en una cuenta de ahorro o inversión (activa y del usuario). */
async function checkGoalAccount(db: DbClient, userId: string, accountId: string) {
  const account = await db.account.findUnique({ where: { id_userId: { id: accountId, userId } } });
  if (!account || !account.isActive || (account.type !== 'SAVINGS' && account.type !== 'INVESTMENT')) {
    throw badRequest('INVALID_REFERENCE', 'Revisa la cuenta de la meta.', {
      accountId: 'Elige una cuenta de ahorro o inversión',
    });
  }
}

export async function createGoal(
  db: DbClient,
  auth: AuthContext,
  input: GoalCreateInput,
): Promise<GoalDTO> {
  await checkGoalAccount(db, auth.userId, input.accountId);
  const goal = await db.goal.create({
    data: {
      userId: auth.userId,
      name: input.name,
      targetAmount: BigInt(input.targetAmount),
      targetDate: input.targetDate ? toDbDate(input.targetDate) : null,
      accountId: input.accountId,
      initialAmount: BigInt(input.initialAmount),
      icon: input.icon,
      color: input.color,
    },
  });
  return getGoal(db, auth, goal.id);
}

export async function updateGoal(
  db: DbClient,
  auth: AuthContext,
  id: string,
  input: GoalUpdateInput,
): Promise<GoalDTO> {
  const { userId } = auth;
  const goal = await findGoal(db, userId, id);
  if (input.accountId && input.accountId !== goal.accountId) {
    await checkGoalAccount(db, userId, input.accountId);
    if ((await db.transaction.count({ where: { userId, goalId: id } })) > 0) {
      throw conflict(
        'GOAL_HAS_MOVEMENTS',
        'Esta meta ya tiene abonos o retiros en su cuenta. Para usar otra cuenta, crea una meta nueva.',
      );
    }
  }
  await db.goal.update({
    where: { id_userId: { id, userId } },
    data: {
      name: input.name,
      targetAmount: input.targetAmount !== undefined ? BigInt(input.targetAmount) : undefined,
      targetDate:
        input.targetDate === undefined ? undefined : input.targetDate ? toDbDate(input.targetDate) : null,
      accountId: input.accountId,
      initialAmount: input.initialAmount !== undefined ? BigInt(input.initialAmount) : undefined,
      icon: input.icon,
      color: input.color,
      status: input.status,
    },
  });
  return getGoal(db, auth, id);
}

/** Addendum §3.5: sus abonos y retiros quedan como transferencias normales. */
export async function deleteGoal(db: PrismaClient, userId: string, id: string): Promise<void> {
  await findGoal(db, userId, id);
  await db.$transaction([
    db.transaction.updateMany({ where: { userId, goalId: id }, data: { goalId: null } }),
    db.goal.delete({ where: { id_userId: { id, userId } } }),
  ]);
}

export async function contributeToGoal(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
  input: GoalContributionInput,
): Promise<TransactionResultDTO & { goal: GoalDTO }> {
  const goal = await findGoal(db, auth.userId, id);
  if (input.fromAccountId === goal.accountId) {
    throw badRequest('VALIDATION_ERROR', 'Revisa los datos ingresados.', {
      fromAccountId: 'Elige una cuenta distinta a la de la meta',
    });
  }
  const result = await createTransaction(db, auth, {
    type: 'TRANSFER',
    amount: input.amount,
    date: input.date,
    accountId: input.fromAccountId,
    toAccountId: goal.accountId,
    goalId: goal.id,
    description: input.description ?? `Abono a ${goal.name}`,
    payee: null,
    notes: null,
    tags: [],
  });
  return { ...result, goal: await getGoal(db, auth, id) };
}

export async function withdrawFromGoal(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
  input: GoalWithdrawalInput,
): Promise<TransactionResultDTO & { goal: GoalDTO }> {
  const goal = await findGoal(db, auth.userId, id);
  if (input.toAccountId === goal.accountId) {
    throw badRequest('VALIDATION_ERROR', 'Revisa los datos ingresados.', {
      toAccountId: 'Elige una cuenta distinta a la de la meta',
    });
  }
  const result = await createTransaction(db, auth, {
    type: 'TRANSFER',
    amount: input.amount,
    date: input.date,
    accountId: goal.accountId,
    toAccountId: input.toAccountId,
    goalId: goal.id,
    description: input.description ?? `Retiro de ${goal.name}`,
    payee: null,
    notes: null,
    tags: [],
  });
  return { ...result, goal: await getGoal(db, auth, id) };
}
```

Create `apps/api/src/modules/goals/routes.ts`:

```ts
import {
  goalContributionSchema,
  goalCreateSchema,
  goalUpdateSchema,
  goalWithdrawalSchema,
} from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import {
  contributeToGoal,
  createGoal,
  deleteGoal,
  getGoal,
  listGoals,
  updateGoal,
  withdrawFromGoal,
} from './service';

export async function goalRoutes(app: FastifyInstance) {
  app.get('/goals', async (req) => ({ items: await listGoals(app.prisma, req.auth) }));

  app.post('/goals', async (req, reply) => {
    const goal = await createGoal(app.prisma, req.auth, parse(goalCreateSchema, req.body));
    return reply.status(201).send({ goal });
  });

  app.get('/goals/:id', async (req) => ({
    goal: await getGoal(app.prisma, req.auth, parseId(req.params)),
  }));

  app.put('/goals/:id', async (req) => ({
    goal: await updateGoal(app.prisma, req.auth, parseId(req.params), parse(goalUpdateSchema, req.body)),
  }));

  app.delete('/goals/:id', async (req, reply) => {
    await deleteGoal(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });

  app.post('/goals/:id/contributions', async (req, reply) =>
    reply
      .status(201)
      .send(
        await contributeToGoal(
          app.prisma,
          req.auth,
          parseId(req.params),
          parse(goalContributionSchema, req.body),
        ),
      ),
  );

  app.post('/goals/:id/withdrawals', async (req, reply) =>
    reply
      .status(201)
      .send(
        await withdrawFromGoal(
          app.prisma,
          req.auth,
          parseId(req.params),
          parse(goalWithdrawalSchema, req.body),
        ),
      ),
  );
}
```

En `apps/api/src/app.ts`, importar y registrar `goalRoutes` después de `budgetRoutes`.

- [ ] **Step 4: Verificar**

Run: `npm test -w @finanzas/api -- test/goals.test.ts && npm run typecheck`
Expected: PASS.

---

### Task 14: Snapshot de planificación, alertas y dashboard completo

**Files:**
- Modify: `apps/api/src/modules/credit-cards/service.ts` (`loadCardLedgers` con exclusiones; `cardBillings`)
- Modify: `apps/api/src/modules/debts/service.ts` (`loanTermsOf`, `debtsWithTerms`)
- Create: `apps/api/src/modules/planning/snapshot.ts`
- Create: `apps/api/src/modules/alerts/service.ts`, `apps/api/src/modules/alerts/routes.ts`
- Modify: `apps/api/src/modules/dashboard/service.ts`
- Modify: `packages/shared/src/dto.ts` (`DashboardDTO`)
- Modify: `apps/web/src/features/dashboard/DashboardPage.test.tsx` (solo el fixture `base`)
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/planning.test.ts`

**Interfaces:**
- Consumes: `spendingPower` (Task 6), `computeAlerts`, `overallStatus`, `unusualExpenses` (Task 7), `computeBudget` (Task 12), `listGoals` (Task 13), `ensureScheduled` (Task 10), `projectedIncome` (Task 12), `estimateAvailable`, `savingsReserve`, `monthFlows`, `summarizeMoney`, `summarizeDebts`.
- Produces:
  - `cardBillings(db: DbClient, userId: string, today: IsoDate, excludeIds?: string[]): Promise<Array<{ card: CreditCardDTO; billing: CardBillingInput }>>`
  - `loanTermsOf(debt: Debt, ledger: DebtLedger | undefined): LoanTerms`, `debtsWithTerms(db: DbClient, userId, today): Promise<Array<{ debt: DebtDTO; terms: LoanTerms }>>`
  - `planning/snapshot.ts`: `interface PendingItem { id; name; dueDate; amount; categoryId }`, `interface PlanningSnapshot`, `loadPlanning(db: PrismaClient, auth): Promise<PlanningSnapshot>`
  - `alerts/service.ts`: `planningStatus(snap: PlanningSnapshot): StatusDTO`, `activeAlerts(db: PrismaClient, auth, snap): Promise<AlertDTO[]>`, `dismissAlert(db, userId, key)`, `restoreAlerts(db, userId)`
  - Rutas: `GET /api/alerts` → `{ items: AlertDTO[], status: StatusDTO }`; `POST /api/alerts/:key/dismiss` → 204; `DELETE /api/alerts/dismissed` → 204.
  - `DashboardDTO` agrega `spendingPower: SpendingPowerDTO`, `status: StatusDTO`, `alerts: AlertDTO[]` (máx. 3), `goals: GoalDTO[]` (activas, máx. 3), `budget: DashboardBudgetDTO | null`.

- [ ] **Step 1: Escribir los tests de punta a punta**

Create `apps/api/test/planning.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, registerUser } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-10'; // 22 días hasta fin de mes, incluido hoy

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-10T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

type Cat = { id: string; name: string; kind: string };

describe('¿Cuánto puedo gastar hoy?, alertas y estado (spec 8.7 y 8.12)', () => {
  it('works end to end with a payday, an obligation, today expenses and a budget', async () => {
    const { api } = await registerUser(app);
    const bank = (await api.post('/api/accounts', { name: 'Banco', type: 'BANK', initialBalance: 300_000 })).body
      .account.id;
    const card = (
      await api.post('/api/credit-cards', { name: 'Tarjeta', creditLimit: 2_000_000, statementDay: 15, paymentDueDay: 30 })
    ).body.card.id;
    const cats = (await api.get('/api/categories')).body.items as Cat[];
    const cat = (name: string, kind = 'EXPENSE') => cats.find((c) => c.name === name && c.kind === kind)!.id;

    let d = (await api.get('/api/dashboard')).body;
    expect(d.spendingPower).toMatchObject({ daily: 13_600, limitedBy: 'LIQUIDITY', spentToday: 0 });

    await api.post('/api/scheduled', {
      kind: 'INCOME',
      name: 'Salario',
      amount: 3_000_000,
      dueDate: '2026-10-15',
      categoryId: cat('Salario', 'INCOME'),
      accountId: bank,
    });
    await api.post('/api/scheduled', {
      kind: 'EXPENSE',
      name: 'Arriendo',
      amount: 1_000_000,
      dueDate: '2026-10-16',
      categoryId: cat('Vivienda'),
      accountId: bank,
    });
    d = (await api.get('/api/dashboard')).body;
    // Hasta el 14 solo hay 300.000 para 5 días: no se gasta hoy el salario del 15.
    expect(d.spendingPower).toMatchObject({ daily: 60_000 });
    expect(d.spendingPower.breakdown.liquidity).toMatchObject({ bindingDate: '2026-10-14', days: 5 });

    // Los gastos discrecionales de hoy no cambian la cifra del día.
    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 20_000,
      date: TODAY,
      accountId: bank,
      categoryId: cat('Alimentación'),
    });
    await api.post(`/api/credit-cards/${card}/purchase`, {
      amount: 200_000,
      date: TODAY,
      categoryId: cat('Compras'),
    });
    d = (await api.get('/api/dashboard')).body;
    expect(d.spendingPower).toMatchObject({ daily: 60_000, spentToday: 220_000, remainingToday: -160_000 });

    // Presupuesto general de 2.000.000: (2.000.000 − 0 − 1.000.000) / 22 = 45.454 → 45.400.
    await api.put('/api/budgets/2026-10', { totalAmount: 2_000_000, lines: [] });
    d = (await api.get('/api/dashboard')).body;
    expect(d.spendingPower).toMatchObject({ daily: 45_400, limitedBy: 'BUDGET' });
    expect(d.budget).toMatchObject({ budget: 2_000_000, spent: 220_000 });
    expect(d.status).toMatchObject({ level: 'OK', title: 'Vas bien' });
    expect(d.goals).toEqual([]);
    expect(d.alerts.length).toBeLessThanOrEqual(3);
  });

  it('lists, dismisses and restores alerts', async () => {
    const { api } = await registerUser(app);
    const bank = (await api.post('/api/accounts', { name: 'Banco', type: 'BANK', initialBalance: 50_000 })).body
      .account.id;
    const cats = (await api.get('/api/categories')).body.items as Cat[];
    const food = cats.find((c) => c.name === 'Alimentación')!.id;
    await api.post('/api/scheduled', {
      kind: 'EXPENSE',
      name: 'Servicios',
      amount: 80_000,
      dueDate: '2026-10-08',
      categoryId: food,
      accountId: bank,
    });
    await api.post('/api/transactions', { type: 'EXPENSE', amount: 10_000, date: TODAY, accountId: bank, categoryId: food });

    const res = await api.get('/api/alerts');
    const keys = res.body.items.map((a: { key: string }) => a.key);
    expect(keys[0]).toMatch(/^obligation-overdue:/);
    expect(keys).toEqual(expect.arrayContaining(['low-balance:2026-10-10', 'overspend:2026-10']));
    expect(res.body.status.level).toBe('DANGER'); // la proyección a fin de mes es negativa

    expect((await api.post('/api/alerts/low-balance:2026-10-10/dismiss')).status).toBe(204);
    const after = (await api.get('/api/alerts')).body.items.map((a: { key: string }) => a.key);
    expect(after).not.toContain('low-balance:2026-10-10');
    expect((await api.post('/api/alerts/NO_VALIDA/dismiss')).status).toBe(400);
    expect((await api.del('/api/alerts/dismissed')).status).toBe(204);
    expect((await api.get('/api/alerts')).body.items.map((a: { key: string }) => a.key)).toContain(
      'low-balance:2026-10-10',
    );
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- test/planning.test.ts`
Expected: FAIL (`spendingPower` no existe en el dashboard; `/api/alerts` no existe).

- [ ] **Step 3: Entradas de facturación y de préstamos**

En `apps/api/src/modules/credit-cards/service.ts`:

1. Agregar a los imports `type CardBillingInput` (de `../../domain/card-billing`).

2. Cambiar la firma de `loadCardLedgers` y excluir movimientos en las cuatro consultas:

```ts
export async function loadCardLedgers(
  db: DbClient,
  userId: string,
  today: IsoDate,
  cardIds?: string[],
  excludeIds: string[] = [],
) {
  const creditCardId = cardIds ? { in: cardIds } : { not: null };
  const notExcluded = excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {};
```

y en cada `where` de las cuatro consultas agregar `...notExcluded,` (por ejemplo `where: { userId, creditCardId, ...notExcluded }`).

3. Agregar al final:

```ts
/** Estado de cada tarjeta y su entrada de facturación, para simular pagos futuros (spec 8.7). */
export async function cardBillings(
  db: DbClient,
  userId: string,
  today: IsoDate,
  excludeIds: string[] = [],
): Promise<Array<{ card: CreditCardDTO; billing: CardBillingInput }>> {
  const [cards, ledgers] = await Promise.all([
    db.creditCard.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    loadCardLedgers(db, userId, today, undefined, excludeIds),
  ]);
  return cards.map((c) => {
    const ledger = ledgers.get(c.id);
    const b = billingOf(c, ledger);
    return {
      card: toCreditCardDTO(c, ledger, today),
      billing: { terms: b.terms, charges: b.charges, totalPayments: b.payments, debt: b.debt, today },
    };
  });
}
```

En `apps/api/src/modules/debts/service.ts`:

1. Import: `import { loanInstallmentDue, nextLoanPaymentDate, type LoanTerms } from '../../domain/loans';`

2. Reemplazar `toDebtDTO` por:

```ts
export function loanTermsOf(debt: Debt, ledger: DebtLedger | undefined): LoanTerms {
  const l = ledger ?? { disbursed: 0, paid: 0, paidThisMonth: 0 };
  return {
    balance: num(debt.initialBalance) + l.disbursed - l.paid,
    monthlyPayment: debt.monthlyPayment != null ? num(debt.monthlyPayment) : null,
    paymentDay: debt.paymentDay,
    paidThisMonth: l.paidThisMonth,
    openingDate: fromDbDate(debt.openingDate),
  };
}

export function toDebtDTO(debt: Debt, ledger: DebtLedger | undefined, today: IsoDate): DebtDTO {
  const terms = loanTermsOf(debt, ledger);
  return {
    id: debt.id,
    name: debt.name,
    lender: debt.lender,
    initialBalance: num(debt.initialBalance),
    openingDate: fromDbDate(debt.openingDate),
    monthlyPayment: terms.monthlyPayment,
    paymentDay: debt.paymentDay,
    icon: debt.icon,
    color: debt.color,
    isActive: debt.isActive,
    balance: terms.balance,
    installmentDue: loanInstallmentDue(terms, today, endOfMonth(today)),
    nextPaymentDate: nextLoanPaymentDate(terms, today),
  };
}
```

3. Debajo de `listDebts`:

```ts
export async function debtsWithTerms(
  db: DbClient,
  userId: string,
  today: IsoDate,
): Promise<Array<{ debt: DebtDTO; terms: LoanTerms }>> {
  const [debts, ledgers] = await Promise.all([
    db.debt.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    loadDebtLedgers(db, userId, today),
  ]);
  return debts.map((d) => ({
    debt: toDebtDTO(d, ledgers.get(d.id), today),
    terms: loanTermsOf(d, ledgers.get(d.id)),
  }));
}
```

- [ ] **Step 4: Snapshot de planificación**

Create `apps/api/src/modules/planning/snapshot.ts`:

```ts
import {
  addDays,
  endOfMonth,
  isLiquidAccount,
  monthKey,
  startOfMonth,
  type AccountDTO,
  type BreakdownItem,
  type CreditCardDTO,
  type DebtDTO,
  type IsoDate,
} from '@finanzas/shared';
import { estimateAvailable } from '../../domain/available';
import {
  monthFlows,
  projectedIncome,
  summarizeMoney,
  type MoneySummary,
  type MonthFlows,
} from '../../domain/balances';
import { savingsReserve } from '../../domain/savings';
import { spendingPower, type SpendingPowerResult } from '../../domain/spending-power';
import type { FinancialConfiguration, Prisma, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import type { AuthContext } from '../../types/fastify';
import { listAccounts } from '../accounts/service';
import { computeBudget, type BudgetComputation } from '../budgets/service';
import { cardBillings } from '../credit-cards/service';
import { debtsWithTerms } from '../debts/service';
import { ledgerEntries } from '../ledger/repository';
import { ensureScheduled } from '../recurring/service';

export interface PendingItem {
  id: string;
  name: string;
  dueDate: IsoDate;
  amount: number;
  categoryId: string;
}

export interface PlanningSnapshot {
  today: IsoDate;
  config: FinancialConfiguration;
  accounts: AccountDTO[];
  money: MoneySummary;
  flows: MonthFlows;
  cards: CreditCardDTO[];
  loans: DebtDTO[];
  /** Obligaciones PENDING hasta fin de mes (o hoy + 3 si es más tarde), incluidas las vencidas. */
  obligations: PendingItem[];
  /** Ingresos esperados PENDING en el mismo horizonte. */
  incomes: PendingItem[];
  budget: BudgetComputation;
  available: { total: number; breakdown: BreakdownItem[] };
  projectedIncome: number;
  spendingPower: SpendingPowerResult;
  /** Gasto discrecional del mes hasta hoy (incluye hoy). */
  discretionaryMonth: number;
}

/** Spec 8.7: gastos discrecionales = sin hijo de préstamo y sin enlace a una ocurrencia. */
const discretionary = (userId: string, from: IsoDate, to: IsoDate): Prisma.TransactionWhereInput => ({
  userId,
  type: { in: ['EXPENSE', 'CARD_PURCHASE'] },
  parentId: null,
  scheduledItem: { is: null },
  date: { gte: toDbDate(from), lte: toDbDate(to) },
});

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);

export async function loadPlanning(db: PrismaClient, auth: AuthContext): Promise<PlanningSnapshot> {
  const { userId, today } = auth;
  await ensureScheduled(db, userId, today);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const soon = addDays(today, 3);
  const horizon = soon > monthEnd ? soon : monthEnd;

  const [config, accounts, monthEntries, cards, loans, pendingRows, budget, todayRows, monthSpend] =
    await Promise.all([
      db.financialConfiguration.findUniqueOrThrow({ where: { userId } }),
      listAccounts(db, userId),
      ledgerEntries(db, userId, { from: monthStart, to: monthEnd }),
      cardBillings(db, userId, today),
      debtsWithTerms(db, userId, today),
      db.scheduledItem.findMany({
        where: { userId, status: 'PENDING', dueDate: { lte: toDbDate(horizon) } },
        select: { id: true, kind: true, name: true, dueDate: true, amount: true, categoryId: true },
        orderBy: { dueDate: 'asc' },
      }),
      computeBudget(db, auth, monthKey(today)),
      db.transaction.findMany({
        where: discretionary(userId, today, today),
        select: { id: true, type: true, amount: true, accountId: true, categoryId: true },
      }),
      db.transaction.aggregate({
        where: discretionary(userId, monthStart, today),
        _sum: { amount: true },
      }),
    ]);

  const money = summarizeMoney(accounts);
  const flows = monthFlows(monthEntries, new Map(accounts.map((a) => [a.id, a.type])));
  const reserve = savingsReserve({
    savingsPct: config.savingsPct,
    investmentPct: config.investmentPct,
    incomeReceived: flows.income,
    savingsFlow: flows.savings,
    investmentFlow: flows.investment,
  });
  const toItem = (r: (typeof pendingRows)[number]): PendingItem => ({
    id: r.id,
    name: r.name,
    dueDate: fromDbDate(r.dueDate),
    amount: num(r.amount),
    categoryId: r.categoryId,
  });
  const obligations = pendingRows.filter((r) => r.kind === 'EXPENSE').map(toItem);
  const incomes = pendingRows.filter((r) => r.kind === 'INCOME').map(toItem);
  const thisMonth = (x: PendingItem) => x.dueDate <= monthEnd;

  const available = estimateAvailable({
    liquid: money.liquid,
    pendingObligations: sum(obligations.filter(thisMonth).map((o) => o.amount)),
    cardsCommitted: sum(cards.map((c) => c.card.committed)),
    loansDue: sum(loans.map((l) => l.debt.installmentDue)),
    reserve,
  });
  const income = projectedIncome(
    flows.income,
    sum(incomes.filter((x) => x.dueDate >= monthStart && thisMonth(x)).map((x) => x.amount)),
    config.monthlyIncomeEstimate != null ? num(config.monthlyIncomeEstimate) : null,
  );

  // Base del día (spec 8.7): sin los gastos discrecionales de hoy.
  const liquidIds = new Set(accounts.filter((a) => isLiquidAccount(a.type)).map((a) => a.id));
  const spentToday = sum(todayRows.map((t) => num(t.amount)));
  const liquidAddBack = sum(
    todayRows
      .filter((t) => t.type === 'EXPENSE' && t.accountId !== null && liquidIds.has(t.accountId))
      .map((t) => num(t.amount)),
  );
  const todayCardIds = todayRows.filter((t) => t.type === 'CARD_PURCHASE').map((t) => t.id);
  const baseCards = todayCardIds.length > 0 ? await cardBillings(db, userId, today, todayCardIds) : cards;

  // Plan, decisiones 1 y 2: el límite por presupuesto usa su alcance y excluye lo discrecional de hoy.
  const inScope = (categoryId: string | null) =>
    budget.scope === null || (categoryId !== null && budget.scope.has(categoryId));
  const total = budget.dto.total;
  const power = spendingPower({
    today,
    liquidBase: money.liquid + liquidAddBack,
    reserve,
    savingsPct: config.savingsPct,
    investmentPct: config.investmentPct,
    expectedIncomes: incomes.map((x) => ({ date: x.dueDate, amount: x.amount })),
    obligations: obligations.map((o) => ({ date: o.dueDate, amount: o.amount })),
    cards: baseCards.map((c) => c.billing),
    loans: loans.map((l) => l.terms),
    budget: total
      ? {
          amount: total.budget,
          spentBase:
            total.spent - sum(todayRows.filter((t) => inScope(t.categoryId)).map((t) => num(t.amount))),
          pendingObligations: sum(
            obligations.filter((o) => thisMonth(o) && inScope(o.categoryId)).map((o) => o.amount),
          ),
        }
      : null,
    spentToday,
  });

  return {
    today,
    config,
    accounts,
    money,
    flows,
    cards: cards.map((c) => c.card),
    loans: loans.map((l) => l.debt),
    obligations,
    incomes,
    budget,
    available,
    projectedIncome: income,
    spendingPower: power,
    discretionaryMonth: num(monthSpend._sum.amount),
  };
}
```

- [ ] **Step 5: Servicio y rutas de alertas**

Create `apps/api/src/modules/alerts/service.ts`:

```ts
import {
  addDays,
  dayOfMonth,
  diffDays,
  endOfMonth,
  type AlertDTO,
  type IsoDate,
  type StatusDTO,
} from '@finanzas/shared';
import { computeAlerts, overallStatus, unusualExpenses } from '../../domain/alerts';
import { pctOf } from '../../domain/savings';
import type { PrismaClient } from '../../generated/prisma/client';
import { num, toDbDate } from '../../lib/db';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import type { PlanningSnapshot } from '../planning/snapshot';

const EXPENSES = { in: ['EXPENSE' as const, 'CARD_PURCHASE' as const] };

/** Spec 8.12: movimientos de los últimos 7 días contra la mediana de su categoría en los 90 previos. */
async function loadUnusual(db: DbClient, userId: string, today: IsoDate) {
  const recent = await db.transaction.findMany({
    where: {
      userId,
      type: EXPENSES,
      parentId: null,
      date: { gte: toDbDate(addDays(today, -6)), lte: toDbDate(today) },
    },
    select: {
      id: true,
      amount: true,
      description: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  });
  const categoryIds = [...new Set(recent.flatMap((r) => (r.categoryId ? [r.categoryId] : [])))];
  if (categoryIds.length === 0) return [];
  const history = await db.transaction.findMany({
    where: {
      userId,
      type: EXPENSES,
      parentId: null,
      categoryId: { in: categoryIds },
      date: { gte: toDbDate(addDays(today, -96)), lte: toDbDate(addDays(today, -7)) },
    },
    select: { categoryId: true, amount: true },
  });
  const byCategory = new Map<string, number[]>();
  for (const h of history) {
    if (h.categoryId) byCategory.set(h.categoryId, [...(byCategory.get(h.categoryId) ?? []), num(h.amount)]);
  }
  return unusualExpenses(
    recent.flatMap((r) =>
      r.categoryId
        ? [
            {
              id: r.id,
              categoryId: r.categoryId,
              categoryName: r.category?.name ?? '',
              description: r.description,
              amount: num(r.amount),
            },
          ]
        : [],
    ),
    byCategory,
  );
}

/** F(fin de mes) − gasto discrecional diario promedio × días restantes (spec 8.12). */
function projectedEnd(snap: PlanningSnapshot): number {
  const daysLeft = diffDays(snap.today, endOfMonth(snap.today)) + 1;
  const averageDaily = snap.discretionaryMonth / dayOfMonth(snap.today);
  return snap.spendingPower.endOfMonthBalance - Math.round(averageDaily * daysLeft);
}

export function planningStatus(snap: PlanningSnapshot): StatusDTO {
  const total = snap.budget.dto.total;
  return overallStatus({
    today: snap.today,
    budget: total
      ? {
          budget: total.budget,
          spent: total.spent,
          projectedSpend: snap.budget.dto.projection?.projectedSpend ?? total.spent,
        }
      : null,
    monthExpense: snap.flows.expense,
    projectedIncome: snap.projectedIncome,
    projectionNegative: projectedEnd(snap) < 0,
  });
}

export async function activeAlerts(
  db: PrismaClient,
  auth: AuthContext,
  snap: PlanningSnapshot,
): Promise<AlertDTO[]> {
  const [dismissed, unusual] = await Promise.all([
    db.dismissedAlert.findMany({ where: { userId: auth.userId }, select: { key: true } }),
    loadUnusual(db, auth.userId, auth.today),
  ]);
  const hidden = new Set(dismissed.map((d) => d.key));
  const total = snap.budget.dto.total;
  return computeAlerts({
    today: snap.today,
    hasAccounts: snap.accounts.some((a) => a.isActive),
    budget: {
      total: total ? { budget: total.budget, spent: total.spent } : null,
      lines: snap.budget.dto.lines.map((l) => ({
        categoryId: l.category.id,
        name: l.category.name,
        budget: l.amount,
        spent: l.spent,
      })),
    },
    savings: { target: pctOf(snap.projectedIncome, snap.config.savingsPct), actual: snap.flows.savings },
    cards: snap.cards.filter((c) => c.isActive),
    obligations: snap.obligations,
    expectedIncomes: snap.incomes,
    monthIncome: snap.flows.income,
    monthExpense: snap.flows.expense,
    unusual,
    available: snap.available.total,
    lowBalanceThreshold: num(snap.config.lowBalanceThreshold),
    projectedEndBalance: projectedEnd(snap),
    negativeAccounts: snap.accounts.filter((a) => a.balance < 0),
  }).filter((a) => !hidden.has(a.key));
}

export async function dismissAlert(db: DbClient, userId: string, key: string): Promise<void> {
  await db.dismissedAlert.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key },
    update: {},
  });
}

export async function restoreAlerts(db: DbClient, userId: string): Promise<void> {
  await db.dismissedAlert.deleteMany({ where: { userId } });
}
```

Create `apps/api/src/modules/alerts/routes.ts`:

```ts
import { alertKeyParamsSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse } from '../../lib/validation';
import { loadPlanning } from '../planning/snapshot';
import { activeAlerts, dismissAlert, planningStatus, restoreAlerts } from './service';

export async function alertRoutes(app: FastifyInstance) {
  app.get('/alerts', async (req) => {
    const snap = await loadPlanning(app.prisma, req.auth);
    return { items: await activeAlerts(app.prisma, req.auth, snap), status: planningStatus(snap) };
  });

  app.post('/alerts/:key/dismiss', async (req, reply) => {
    await dismissAlert(app.prisma, req.auth.userId, parse(alertKeyParamsSchema, req.params).key);
    return reply.status(204).send();
  });

  app.delete('/alerts/dismissed', async (req, reply) => {
    await restoreAlerts(app.prisma, req.auth.userId);
    return reply.status(204).send();
  });
}
```

En `apps/api/src/app.ts`, importar y registrar `alertRoutes` después de `goalRoutes`.

- [ ] **Step 6: Dashboard completo**

En `packages/shared/src/dto.ts`, agregar al final de `DashboardDTO` (después de `loans: DebtDTO[];`):

```ts
  spendingPower: SpendingPowerDTO;
  status: StatusDTO;
  /** Las 3 alertas principales no descartadas. */
  alerts: AlertDTO[];
  /** Metas activas (máximo 3). */
  goals: GoalDTO[];
  budget: DashboardBudgetDTO | null;
```

Reemplazar el contenido de `apps/api/src/modules/dashboard/service.ts` por:

```ts
import { monthKey, type DashboardDTO } from '@finanzas/shared';
import { summarizeDebts } from '../../domain/balances';
import type { PrismaClient } from '../../generated/prisma/client';
import type { AuthContext } from '../../types/fastify';
import { activeAlerts, planningStatus } from '../alerts/service';
import { listGoals } from '../goals/service';
import { loadPlanning } from '../planning/snapshot';

export async function getDashboard(db: PrismaClient, auth: AuthContext): Promise<DashboardDTO> {
  const snap = await loadPlanning(db, auth);
  const [user, alerts, goals] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { name: true } }),
    activeAlerts(db, auth, snap),
    listGoals(db, auth),
  ]);
  const debts = summarizeDebts(
    snap.cards.map((c) => c.debt),
    snap.loans.map((l) => l.balance),
  );
  const total = snap.budget.dto.total;
  const { endOfMonthBalance: _endOfMonthBalance, ...spendingPower } = snap.spendingPower;

  return {
    greetingName: user.name.trim().split(/\s+/)[0] ?? user.name,
    today: auth.today,
    month: monthKey(auth.today),
    money: { ...snap.money, accounts: snap.accounts.filter((a) => a.isActive) },
    available: snap.available,
    debts,
    netWorth: snap.money.total - debts.total,
    thisMonth: {
      ...snap.flows,
      savingsRate: snap.flows.income > 0 ? snap.flows.savings / snap.flows.income : null,
      savingsTargetPct: snap.config.savingsPct,
    },
    cards: snap.cards.filter((c) => c.isActive),
    loans: snap.loans.filter((l) => l.isActive),
    spendingPower,
    status: planningStatus(snap),
    alerts: alerts.slice(0, 3),
    goals: goals.filter((g) => g.status === 'ACTIVE').slice(0, 3),
    budget: total
      ? {
          budget: total.budget,
          spent: total.spent,
          usage: total.usage,
          projectionExceedsOnDay: snap.budget.dto.projection?.exceedsOnDay ?? null,
        }
      : null,
  };
}
```

- [ ] **Step 7: Fixture del dashboard en la web**

En `apps/web/src/features/dashboard/DashboardPage.test.tsx`, agregar al objeto `base` (después de `loans: [],`):

```ts
  spendingPower: {
    daily: 0,
    spentToday: 0,
    remainingToday: 0,
    limitedBy: 'LIQUIDITY',
    reason: null,
    breakdown: {
      liquidity: { daily: 0, bindingDate: '2026-10-31', days: 12, items: [] },
      budget: null,
    },
  },
  status: { level: 'OK', title: 'Vas bien', message: '' },
  alerts: [],
  goals: [],
  budget: null,
```

Si `tsc` reporta otros fixtures de `DashboardDTO` en la web, agregarles los mismos campos.

- [ ] **Step 8: Verificar**

Run: `npm test -w @finanzas/api && npm run typecheck && npm test -w @finanzas/web`
Expected: PASS. Cálculo del primer test: 300.000 ÷ 22 = 13.636 → 13.600; con salario el 15 y arriendo el 16, el día que limita es el 14 (300.000 ÷ 5 = 60.000); las compras de hoy (20.000 + 200.000) no cambian la base; con presupuesto: (2.000.000 − (220.000 − 220.000) − 1.000.000) ÷ 22 = 45.454 → 45.400. En el segundo: obligación vencida → DANGER primero; disponible < 100.000 → "dinero bajo"; gastos 10.000 > ingresos 0 → "gastas más de lo que ganas"; F(fin de mes) = 50.000 − 80.000 < 0 → estado DANGER.

---

### Task 15: Perfil (email, eliminar mi cuenta) y renombrar etiquetas

**Files:**
- Create: `apps/api/src/modules/me/service.ts`
- Modify: `apps/api/src/modules/me/routes.ts`
- Modify: `apps/api/src/modules/tags/service.ts`, `apps/api/src/modules/tags/routes.ts`
- Modify: `apps/api/test/helpers.ts` (`del` con cuerpo opcional)
- Create: `apps/api/test/profile.test.ts`

**Interfaces:**
- Consumes: `updateMeSchema`, `deleteMeSchema`, `tagUpdateSchema` (Task 1); `verifyPassword`, `getUser`, `toUserDTO`, `clearSessionCookie`.
- Produces:
  - `updateMe(db: PrismaClient, auth, input: UpdateMeInput): Promise<UserDTO>` — email exige `currentPassword` (400 `PASSWORD_REQUIRED` / `INVALID_PASSWORD`; 409 `EMAIL_TAKEN`).
  - `deleteMe(db: PrismaClient, auth, input: DeleteMeInput): Promise<void>` — borra el usuario en cascada.
  - `renameTag(db: DbClient, userId, id, name): Promise<TagDTO>` (409 `TAG_NAME_TAKEN`).
  - Rutas: `PATCH /api/me` (`{ user }`), `DELETE /api/me` (204 y borra la cookie), `PUT /api/tags/:id` (`{ tag }`).
  - Helper de tests: `api.del(url, body?)`.

- [ ] **Step 1: Cuerpo opcional en `del` de los tests**

En `apps/api/test/helpers.ts` cambiar la línea de `del`:

```ts
    del: <T = any>(url: string, body?: unknown) => call<T>('DELETE', url, body),
```

- [ ] **Step 2: Escribir los tests**

Create `apps/api/test/profile.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { setupFinances } from './finance-fixtures';
import { client, createTestApp, registerUser } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

describe('profile (addendum §4 and §5)', () => {
  it('new users start with the dark theme and can change it', async () => {
    const { api } = await registerUser(app);
    expect((await api.get('/api/auth/me')).body.user.theme).toBe('DARK');
    expect((await api.patch('/api/me', { theme: 'LIGHT' })).body.user.theme).toBe('LIGHT');
  });

  it('changes the email only with the current password', async () => {
    const { api, password } = await registerUser(app);
    const other = await registerUser(app);
    const noPassword = await api.patch('/api/me', { email: 'nuevo@correo.co' });
    expect(noPassword.status).toBe(400);
    expect(noPassword.body.error.code).toBe('PASSWORD_REQUIRED');
    const wrong = await api.patch('/api/me', { email: 'nuevo@correo.co', currentPassword: 'otra-clave-000' });
    expect(wrong.body.error.code).toBe('INVALID_PASSWORD');
    const taken = await api.patch('/api/me', { email: other.email, currentPassword: password });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('EMAIL_TAKEN');

    const email = `${randomUUID()}@Correo.CO`;
    const ok = await api.patch('/api/me', { email, currentPassword: password });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(email.toLowerCase());
    const login = await client(app).post('/api/auth/login', { email, password });
    expect(login.status).toBe(200);
  });

  it('renames tags and keeps them unique', async () => {
    const { api } = await registerUser(app);
    const f = await setupFinances(api);
    const tx = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
      tags: ['viaje', 'trabajo'],
    });
    const tags = (await api.get('/api/tags')).body.items as Array<{ id: string; name: string }>;
    const viaje = tags.find((t) => t.name === 'viaje')!;
    const renamed = await api.put(`/api/tags/${viaje.id}`, { name: 'Vacaciones' });
    expect(renamed.body.tag).toMatchObject({ name: 'vacaciones', usageCount: 1 });
    expect((await api.put(`/api/tags/${viaje.id}`, { name: 'trabajo' })).status).toBe(409);
    const read = await api.get(`/api/transactions/${tx.body.transaction.id}`);
    expect(read.body.transaction.tags).toEqual(['trabajo', 'vacaciones']);
  });
});

describe('DELETE /api/me (review focus #5)', () => {
  it('deletes the user and absolutely everything they own, and nothing else', async () => {
    const { api, password, user } = await registerUser(app);
    const f = await setupFinances(api);
    const keep = await registerUser(app);
    const keepFinances = await setupFinances(keep.api);

    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 50_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
      tags: ['casa'],
    });
    await api.post(`/api/debts/${f.debt}/payments`, { accountId: f.bank, principal: 300_000, interest: 50_000, date: TODAY });
    const goal = (
      await api.post('/api/goals', { name: 'Viaje', targetAmount: 1_000_000, accountId: f.savings })
    ).body.goal;
    await api.post(`/api/goals/${goal.id}/contributions`, { fromAccountId: f.bank, amount: 100_000, date: TODAY });
    await api.post('/api/recurring', {
      name: 'Internet',
      kind: 'EXPENSE',
      amount: 90_000,
      categoryId: f.cat.food,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-25',
    });
    const item = ((await api.get('/api/scheduled')).body.items as Array<{ id: string; name: string }>).find(
      (i) => i.name === 'Internet',
    )!;
    await api.post(`/api/scheduled/${item.id}/complete`, {});
    await api.put('/api/budgets/2026-10', { totalAmount: 1_000_000, lines: [{ categoryId: f.cat.food, amount: 500_000 }] });
    await api.post('/api/alerts/budget:2026-10:total:50/dismiss');

    expect((await api.del('/api/me', { password: 'otra-clave-000', confirmation: 'ELIMINAR' })).status).toBe(400);
    expect((await api.del('/api/me', { password, confirmation: 'eliminar' })).status).toBe(400);
    const res = await api.del('/api/me', { password, confirmation: 'ELIMINAR' });
    expect(res.status).toBe(204);
    expect(res.cookies.find((c) => c.name === 'fz_session')?.value).toBe('');
    expect((await api.get('/api/auth/me')).status).toBe(401);

    const userId = user.id;
    const p = app.prisma;
    const counts = await Promise.all([
      p.user.count({ where: { id: userId } }),
      p.session.count({ where: { userId } }),
      p.financialConfiguration.count({ where: { userId } }),
      p.account.count({ where: { userId } }),
      p.creditCard.count({ where: { userId } }),
      p.debt.count({ where: { userId } }),
      p.category.count({ where: { userId } }),
      p.tag.count({ where: { userId } }),
      p.transaction.count({ where: { userId } }),
      p.transactionTag.count({ where: { userId } }),
      p.budget.count({ where: { userId } }),
      p.budgetCategory.count({ where: { userId } }),
      p.goal.count({ where: { userId } }),
      p.recurringRule.count({ where: { userId } }),
      p.scheduledItem.count({ where: { userId } }),
      p.dismissedAlert.count({ where: { userId } }),
    ]);
    expect(counts.every((c) => c === 0)).toBe(true);
    expect((await keep.api.get(`/api/accounts/${keepFinances.bank}`)).body.account.balance).toBe(2_000_000);
  });
});
```

- [ ] **Step 3: Verificar que fallan**

Run: `npm test -w @finanzas/api -- test/profile.test.ts`
Expected: FAIL (`PATCH /api/me` con email responde 400 de validación; `DELETE /api/me` y `PUT /api/tags/:id` no existen).

- [ ] **Step 4: Servicio de perfil**

Create `apps/api/src/modules/me/service.ts`:

```ts
import type { DeleteMeInput, UpdateMeInput, UserDTO } from '@finanzas/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { badRequest, conflict, isUniqueViolation } from '../../lib/errors';
import { verifyPassword } from '../../lib/password';
import type { AuthContext } from '../../types/fastify';
import { getUser, toUserDTO } from '../auth/service';

export async function updateMe(
  db: PrismaClient,
  auth: AuthContext,
  input: UpdateMeInput,
): Promise<UserDTO> {
  const user = await getUser(db, auth.userId);
  const data: Prisma.UserUpdateInput = { name: input.name, theme: input.theme };
  if (input.email !== undefined && input.email !== user.email) {
    if (!input.currentPassword) {
      throw badRequest('PASSWORD_REQUIRED', 'Confirma tu contraseña para cambiar el email.', {
        currentPassword: 'Requerida para cambiar el email',
      });
    }
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw badRequest('INVALID_PASSWORD', 'La contraseña actual no es correcta.', {
        currentPassword: 'La contraseña actual no es correcta',
      });
    }
    data.email = input.email;
  }
  try {
    return toUserDTO(await db.user.update({ where: { id: user.id }, data }));
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('EMAIL_TAKEN', 'Ya existe una cuenta con ese email.');
    throw err;
  }
}

/** Addendum §3.5: irreversible; la base de datos borra todo lo del usuario en cascada. */
export async function deleteMe(db: PrismaClient, auth: AuthContext, input: DeleteMeInput): Promise<void> {
  const user = await getUser(db, auth.userId);
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw badRequest('INVALID_PASSWORD', 'La contraseña no es correcta.', {
      password: 'La contraseña no es correcta',
    });
  }
  await db.user.delete({ where: { id: user.id } });
}
```

Reemplazar `apps/api/src/modules/me/routes.ts` por:

```ts
import { deleteMeSchema, updateMeSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse } from '../../lib/validation';
import { clearSessionCookie } from '../../plugins/session';
import { deleteMe, updateMe } from './service';

export async function meRoutes(app: FastifyInstance) {
  app.patch('/me', async (req) => ({
    user: await updateMe(app.prisma, req.auth, parse(updateMeSchema, req.body)),
  }));

  app.delete('/me', async (req, reply) => {
    await deleteMe(app.prisma, req.auth, parse(deleteMeSchema, req.body));
    clearSessionCookie(reply);
    return reply.status(204).send();
  });
}
```

- [ ] **Step 5: Renombrar etiquetas**

En `apps/api/src/modules/tags/service.ts`, agregar (y los imports `conflict`, `isUniqueViolation`):

```ts
export async function renameTag(
  db: DbClient,
  userId: string,
  id: string,
  name: string,
): Promise<TagDTO> {
  try {
    const { count } = await db.tag.updateMany({ where: { id, userId }, data: { name } });
    if (count === 0) throw notFound('Etiqueta no encontrada.');
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('TAG_NAME_TAKEN', 'Ya tienes una etiqueta con ese nombre.');
    throw err;
  }
  const tag = await db.tag.findUniqueOrThrow({
    where: { id_userId: { id, userId } },
    include: { _count: { select: { transactions: true } } },
  });
  return { id: tag.id, name: tag.name, usageCount: tag._count.transactions };
}
```

En `apps/api/src/modules/tags/routes.ts`, importar `tagUpdateSchema`, `parse` y `renameTag`, y agregar:

```ts
  app.put('/tags/:id', async (req) => ({
    tag: await renameTag(
      app.prisma,
      req.auth.userId,
      parseId(req.params),
      parse(tagUpdateSchema, req.body).name,
    ),
  }));
```

- [ ] **Step 6: Verificar**

Run: `npm test -w @finanzas/api -- test/profile.test.ts test/password.test.ts && npm run typecheck`
Expected: PASS (`password.test.ts` sigue esperando 400 al cambiar el email sin contraseña).

---

### Task 16: Aislamiento de lo nuevo, seed de demostración y verificación del backend

**Files:**
- Create: `apps/api/test/isolation-planning.test.ts`
- Modify: `apps/api/prisma/seed-demo.ts`
- Modify: `apps/api/test/seed.test.ts`

**Interfaces:**
- Consumes: todos los endpoints nuevos; `createGoal` (Task 13), `putBudget` (Task 12), `ensureScheduled` (Task 10).
- Produces: aislamiento probado en cada endpoint nuevo; seed con presupuesto, meta y recurrentes enlazados, sin saldos negativos en ningún momento.

- [ ] **Step 1: Test de aislamiento de los endpoints nuevos**

Create `apps/api/test/isolation-planning.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { setupFinances } from './finance-fixtures';
import { createTestApp, registerUser } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

describe('Fase 2: a user can never reach another user’s planning data', () => {
  it('blocks goals, rules, occurrences, budgets, alerts, restore, adjust and tags across users', async () => {
    const a = await registerUser(app);
    const fa = await setupFinances(a.api);
    const goal = (await a.api.post('/api/goals', { name: 'Moto', targetAmount: 1_000_000, accountId: fa.savings })).body
      .goal.id as string;
    const rule = (
      await a.api.post('/api/recurring', {
        name: 'Arriendo',
        kind: 'EXPENSE',
        amount: 1_000_000,
        categoryId: fa.cat.food,
        accountId: fa.bank,
        frequency: 'MONTHLY',
        startDate: '2026-10-25',
      })
    ).body.rule.id as string;
    const item = (
      await a.api.post('/api/scheduled', {
        kind: 'EXPENSE',
        name: 'SOAT',
        amount: 500_000,
        dueDate: '2026-10-28',
        categoryId: fa.cat.food,
        accountId: fa.bank,
      })
    ).body.item.id as string;
    await a.api.put('/api/budgets/2026-10', { totalAmount: 900_000, lines: [{ categoryId: fa.cat.food, amount: 400_000 }] });
    await a.api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: fa.bank,
      categoryId: fa.cat.food,
      tags: ['privado'],
    });
    const tag = (await a.api.get('/api/tags')).body.items[0].id as string;

    const b = await registerUser(app);
    const fb = await setupFinances(b.api);

    // Lectura, edición, borrado y acciones sobre recursos ajenos → 404
    expect((await b.api.get(`/api/goals/${goal}`)).status).toBe(404);
    expect((await b.api.put(`/api/goals/${goal}`, { name: 'X' })).status).toBe(404);
    expect((await b.api.del(`/api/goals/${goal}`)).status).toBe(404);
    expect(
      (await b.api.post(`/api/goals/${goal}/contributions`, { fromAccountId: fb.bank, amount: 1, date: TODAY })).status,
    ).toBe(404);
    expect((await b.api.get(`/api/recurring/${rule}`)).status).toBe(404);
    expect((await b.api.del(`/api/recurring/${rule}`)).status).toBe(404);
    expect((await b.api.put(`/api/scheduled/${item}`, { amount: 1 })).status).toBe(404);
    expect((await b.api.post(`/api/scheduled/${item}/complete`, {})).status).toBe(404);
    expect((await b.api.post(`/api/scheduled/${item}/skip`)).status).toBe(404);
    expect((await b.api.del(`/api/scheduled/${item}`)).status).toBe(404);
    expect((await b.api.post(`/api/accounts/${fa.bank}/restore`)).status).toBe(404);
    expect((await b.api.post(`/api/accounts/${fa.bank}/adjust`, { actualBalance: 0 })).status).toBe(404);
    expect((await b.api.post(`/api/categories/${fa.cat.food}/restore`)).status).toBe(404);
    expect((await b.api.put(`/api/tags/${tag}`, { name: 'hack' })).status).toBe(404);

    // Referencias ajenas en el cuerpo → 400
    expect((await b.api.post('/api/goals', { name: 'X', targetAmount: 1, accountId: fa.savings })).status).toBe(400);
    expect(
      (
        await b.api.post('/api/recurring', {
          name: 'X',
          kind: 'EXPENSE',
          amount: 1,
          categoryId: fa.cat.food,
          accountId: fb.bank,
          frequency: 'WEEKLY',
          startDate: TODAY,
        })
      ).status,
    ).toBe(400);
    expect(
      (await b.api.put('/api/budgets/2026-10', { totalAmount: null, lines: [{ categoryId: fa.cat.food, amount: 1 }] }))
        .status,
    ).toBe(400);
    expect(
      (
        await b.api.post('/api/transactions', {
          type: 'EXPENSE',
          amount: 1,
          date: TODAY,
          accountId: fb.bank,
          categoryId: fb.cat.food,
          scheduledItemId: item,
        })
      ).status,
    ).toBe(400);

    // Listados de B sin datos de A
    expect((await b.api.get('/api/goals')).body.items).toEqual([]);
    expect((await b.api.get('/api/recurring')).body.items).toEqual([]);
    expect((await b.api.get('/api/scheduled?status=PENDING,DONE,SKIPPED')).body.items).toEqual([]);
    expect((await b.api.get('/api/budgets/2026-10')).body.budget.total).toBeNull();
    const alertKeys = (await b.api.get('/api/alerts')).body.items.map((x: { key: string }) => x.key).join(' ');
    expect(alertKeys).not.toContain(item);
    const d = (await b.api.get('/api/dashboard')).body;
    expect(d.goals).toEqual([]);
    expect(d.budget).toBeNull();

    // A sigue intacto
    expect((await a.api.get(`/api/goals/${goal}`)).status).toBe(200);
  });
});
```

Run: `npm test -w @finanzas/api -- test/isolation-planning.test.ts`
Expected: PASS (si algo falla, el defecto está en el servicio correspondiente: toda consulta debe filtrar por `userId`).

- [ ] **Step 2: Tests del seed ampliado**

En `apps/api/test/seed.test.ts`, agregar el import `import { effectsOf } from '../src/domain/ledger';` y, dentro del `describe('demo seed', …)`, agregar:

```ts
  it('adds a budget, the computer goal and linked recurring items (spec 16)', async () => {
    const { userId } = await seedDemo(app.prisma, NOW);
    const login = await client(app).post('/api/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    const api = client(app, login.cookies.find((c) => c.name === 'fz_session')!.value);

    const goals = (await api.get('/api/goals')).body.items;
    expect(goals[0]).toMatchObject({ name: 'Comprar computador', targetAmount: 5_000_000, targetDate: '2027-06-30' });
    expect(goals[0].contributed).toBeGreaterThan(0);
    expect((await api.get('/api/budgets/2026-10')).body.budget.total.budget).toBe(4_200_000);
    expect(await app.prisma.recurringRule.count({ where: { userId } })).toBe(4);
    // Lo ya ocurrido está enlazado a su movimiento: no hay obligaciones "vencidas" falsas.
    expect(
      await app.prisma.scheduledItem.count({
        where: { userId, status: 'PENDING', dueDate: { lt: new Date('2026-10-20T00:00:00Z') } },
      }),
    ).toBe(0);
    expect(await app.prisma.scheduledItem.count({ where: { userId, status: 'DONE' } })).toBeGreaterThan(0);
  });

  it('never leaves an account below zero at any point of the history', async () => {
    const { userId } = await seedDemo(app.prisma, NOW);
    const accounts = await app.prisma.account.findMany({ where: { userId } });
    const balance = new Map(accounts.map((a) => [a.id, Number(a.initialBalance)]));
    const transactions = await app.prisma.transaction.findMany({
      where: { userId },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    for (const t of transactions) {
      const fx = effectsOf({
        type: t.type,
        amount: Number(t.amount),
        accountId: t.accountId,
        toAccountId: t.toAccountId,
        creditCardId: t.creditCardId,
        debtId: t.debtId,
      });
      for (const e of fx.accounts) {
        balance.set(e.accountId, balance.get(e.accountId)! + e.delta);
        expect(balance.get(e.accountId), `${t.description} ${t.date.toISOString()}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
```

Run: `npm test -w @finanzas/api -- test/seed.test.ts`
Expected: FAIL (no hay metas, presupuesto ni reglas; Bancolombia queda en negativo el día 2 del primer mes).

- [ ] **Step 3: Ampliar el seed**

En `apps/api/prisma/seed-demo.ts`:

1. Imports: agregar `monthKey` a los de `@finanzas/shared`; y

```ts
import { toDbDate } from '../src/lib/db';
import { putBudget } from '../src/modules/budgets/service';
import { createGoal } from '../src/modules/goals/service';
import { ensureScheduled } from '../src/modules/recurring/service';
```

2. Cambiar el saldo inicial de Bancolombia a `2_500_000` (antes `1_200_000`), para que ninguna cuenta quede en negativo en ningún momento.

3. Después de crear `debt`, crear la meta:

```ts
  const goal = await createGoal(prisma, auth, {
    name: 'Comprar computador',
    targetAmount: 5_000_000,
    targetDate: '2027-06-30',
    accountId: savings.id,
    initialAmount: 1_500_000,
    icon: 'laptop',
    color: '#0ea5e9',
  });
```

4. En el evento `'Ahorro quincena'` (día 16), agregar `goalId: goal.id,` al objeto del `TRANSFER`.

5. Después de `for (const event of events) await event.run();`, agregar:

```ts
  await putBudget(prisma, auth, monthKey(today), {
    totalAmount: 4_200_000,
    lines: [
      { categoryId: cat('Alimentación'), amount: 900_000 },
      { categoryId: cat('Transporte'), amount: 250_000 },
      { categoryId: cat('Entretenimiento'), amount: 200_000 },
      { categoryId: cat('Servicios'), amount: 150_000 },
      { categoryId: cat('Suscripciones'), amount: 60_000 },
    ],
  });

  const { year: startYear, month: startMonth } = yearMonth(start);
  const rule = (r: {
    name: string;
    kind: 'INCOME' | 'EXPENSE';
    amount: number;
    categoryId: string;
    accountId?: string;
    creditCardId?: string;
    frequency: 'MONTHLY' | 'SEMIMONTHLY';
    day: number;
  }) =>
    prisma.recurringRule.create({
      data: {
        userId: user.id,
        name: r.name,
        kind: r.kind,
        amount: BigInt(r.amount),
        categoryId: r.categoryId,
        accountId: r.accountId ?? null,
        creditCardId: r.creditCardId ?? null,
        frequency: r.frequency,
        day1: r.frequency === 'SEMIMONTHLY' ? 15 : null,
        day2: r.frequency === 'SEMIMONTHLY' ? 31 : null,
        startDate: toDbDate(makeDate(startYear, startMonth, r.day)),
        activeFrom: toDbDate(start),
      },
    });
  await rule({ name: 'Arriendo', kind: 'EXPENSE', amount: 1_000_000, categoryId: cat('Vivienda'), accountId: bank.id, frequency: 'MONTHLY', day: 1 });
  await rule({ name: 'Internet', kind: 'EXPENSE', amount: 90_000, categoryId: cat('Servicios'), accountId: bank.id, frequency: 'MONTHLY', day: 10 });
  await rule({ name: 'Netflix', kind: 'EXPENSE', amount: 38_900, categoryId: cat('Suscripciones'), creditCardId: card.id, frequency: 'MONTHLY', day: 12 });
  await rule({ name: 'Salario', kind: 'INCOME', amount: 2_000_000, categoryId: cat('Salario', 'INCOME'), accountId: bank.id, frequency: 'SEMIMONTHLY', day: 15 });
  await ensureScheduled(prisma, user.id, today);
  await linkPastOccurrences(prisma, user.id, today);
```

6. Al final del archivo:

```ts
/** Las ocurrencias pasadas del demo ya se pagaron: se enlazan con el movimiento sembrado ese día. */
async function linkPastOccurrences(prisma: PrismaClient, userId: string, today: IsoDate) {
  const items = await prisma.scheduledItem.findMany({
    where: { userId, status: 'PENDING', dueDate: { lte: toDbDate(today) } },
  });
  for (const item of items) {
    const tx = await prisma.transaction.findFirst({
      where: {
        userId,
        categoryId: item.categoryId,
        date: item.dueDate,
        amount: item.amount,
        accountId: item.accountId,
        creditCardId: item.creditCardId,
        scheduledItem: { is: null },
      },
    });
    if (tx) {
      await prisma.scheduledItem.update({
        where: { id: item.id },
        data: { status: 'DONE', transactionId: tx.id },
      });
    }
  }
}
```

Run: `npm test -w @finanzas/api -- test/seed.test.ts`
Expected: PASS.

- [ ] **Step 4: Verificación completa del backend**

Run (raíz):

```bash
npm test -w @finanzas/shared && npm test -w @finanzas/api && npm run typecheck && npm run lint && npm run format:check
```

Expected: todo en verde. Si `format:check` falla, correr `npm run format` y repetir. Luego `npm run db:seed -w @finanzas/api` contra la base de desarrollo debe terminar con "Usuario demo listo".

## Cierre del plan 2A

Al terminar, la API cubre todo el addendum. El plan 2B continúa en la misma rama `fase-2`; el commit único de la Fase 2 en `main` se hace al final del plan 2B.
