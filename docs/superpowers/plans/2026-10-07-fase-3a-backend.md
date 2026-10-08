# Fase 3A — Backend de reportes y exportación: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reportes y exportación en la API: `GET /api/reports` (un `ReportDTO` por periodo) y `GET /api/reports/export` (CSV y Excel), más los pendientes de la Fase 2 del lado servidor: metas que nunca quedan con saldo negativo (bloqueo `SELECT … FOR UPDATE`) y una renovación de sesión que solo extiende sesiones vigentes.

**Architecture:** Igual que en las fases anteriores: rutas delgadas → servicios (toda consulta filtra por `userId`) → dominio puro. El periodo se resuelve en `@finanzas/shared` (`resolveReportPeriod`), así la web y la API usan las mismas reglas. El cálculo del reporte es dominio puro (`domain/report.ts`, `buildReport`), probado sin base de datos. El servicio solo carga datos dentro de una transacción de solo lectura `REPEATABLE READ` (`inReportTransaction`), que también usa la exportación. El presupuesto del reporte usa `computeBudget` en modo de solo lectura. La exportación convierte cada movimiento en una fila (`export/rows.ts`), y `export/csv.ts` y `export/xlsx.ts` (exceljs) la escriben.

**Tech Stack:** Node 22, TypeScript 5.9.3, Fastify 5.12 (+ `@fastify/rate-limit` 11.2), Zod 4.6, Prisma 7.10 (`prisma-client` + `@prisma/adapter-pg`), PostgreSQL 17, Vitest 5, exceljs 4.4 (nueva, solo en la API).

**Spec:** `docs/superpowers/specs/2026-10-07-fase-3-design.md` (addendum de la Fase 3; para este plan, §3, §4, §8.2, §8.6 y §9.2), sobre `docs/superpowers/specs/2026-10-06-finanzas-design.md` y `docs/superpowers/specs/2026-10-07-fase-2-design.md`.

**Rama:** `fase-3` (ya existe; HEAD `08add38` tiene el spec). Las pruebas de integración usan la base de pruebas de Docker: `npm run dev:db` antes de la primera tarea con tests en `apps/api/test`.

## Global Constraints

- Interfaz en español (es-CO); código, nombres y tests en inglés; fechas en `America/Bogota`; dinero en pesos enteros; formato con `formatCOP` y `formatCOPCompact` de `@finanzas/shared`.
- Prioridades: corrección financiera > seguridad > aislamiento > experiencia móvil > registro rápido > dashboard > rendimiento > diseño.
- El reporte es de solo lectura: una transacción `REPEATABLE READ` de solo lectura, sin `ensureScheduled` ni copia de presupuestos; toda consulta filtra por `userId`.
- Ningún cálculo de dinero en el navegador; la única agrupación permitida en la web es `groupTop` de `@finanzas/shared`.
- El periodo de reportes nunca viaja en la URL del navegador; la exportación se descarga con `fetch` + `URL.createObjectURL`.
- Los logs nunca contienen cuerpos, valores, nombres, notas, emails, tokens ni query strings.
- Exportación: CSV UTF-8 con BOM, separador `;`, CRLF, comillas RFC 4180; protección contra fórmulas (`=`, `+`, `-`, `@`, tab, CR → prefijo `'`) en CSV y Excel; `EXPORT_MAX_ROWS` = 20000 (400 `EXPORT_TOO_LARGE`); 10 exportaciones por minuto por usuario (429 `RATE_LIMITED`).
- PWA: nunca cachear `/api`; mutaciones de TanStack Query con `networkMode: 'always'`; `registerType: 'prompt'`; sin scripts en línea (CSP `default-src 'self'` no cambia).
- Tokens del tema claro: `muted` `#5b6779`, `warning` `#a14a06`; tokens `chart-1..6` y `chart-other` según el spec §5.1.
- Zonas de toque ≥ 44 px (`min-h-11`); contraste AA; `prefers-reduced-motion` respetado; un doble toque nunca envía dos veces.
- Dependencias nuevas permitidas, y solo estas: `recharts`, `vite-plugin-pwa`, `@vite-pwa/assets-generator` (dev), `exceljs` (api), `@playwright/test` y `@axe-core/playwright` (dev, workspace `e2e`).
- Cada tarea termina con un commit en `fase-3` con mensaje de una frase en español; el commit único en `main` lo hace el controlador al final (no lo hace ninguna tarea).
- Nunca `prisma migrate reset` ni `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`; nunca subir `.env`; archivos UTF-8 sin BOM y LF; verificación de cada tarea incluye `npm run format:check`.

## Decisiones del plan

1. Saldo en una fecha = saldo inicial + efectos de los movimientos con fecha ≤ esa fecha, como en el resto de la app (que no usa `openingDate` en los saldos): una cuenta creada a mitad del periodo abre con su saldo inicial.
2. `closing.debts` usa `summarizeDebts`, como el dashboard (una tarjeta con saldo a favor no resta), y `netWorth = totalMoney − debts`; así el cierre de hoy coincide con el dashboard.
3. `GET /api/reports` responde el `ReportDTO` sin envoltorio, igual que `GET /api/dashboard`.
4. El `derivedMethod` del spec es `deriveMethod(type, paymentMethod, accountType)`, que es el nombre real en `@finanzas/shared`.
5. `groupTop(rows, n = 6)` devuelve `{ top, other }` (esqueleto); la etiqueta "Otros" la pone la interfaz, no va como tercer argumento (spec §3.3).
6. `ReportInput.categories` es `Map<string, CategoryRefDTO>` (la referencia ya trae `parentId`); lo anterior a `from` llega sumado por tipo y referencias con fecha `from − 1`, y lo del periodo, sumado por día.
7. Presupuesto vs. gasto usa el mes calendario completo (como la pantalla de Presupuestos) aunque el periodo recorte ese mes; `lines` es el detalle del último mes.
8. `loadReportData(db, auth, period)` devuelve solo el `ReportInput`; la exportación agrega `loadExportTransactions` y cuenta los movimientos antes de cargarlos (`exportReport`).
9. La exportación escribe "Desembolso" (`EXPORT_TYPE_LABELS`), porque la etiqueta de la app (`TRANSACTION_TYPE_LABELS`) es "Desembolso de préstamo".
10. Excel: el porcentaje usa el código `0.0%` (Excel en español lo muestra "0,0 %"); "Generado el" sale en la zona del usuario (`auth.timezone`, por defecto America/Bogota) como `dd/mm/aaaa hh:mm`.
11. Orden de la exportación: fecha, `createdAt`, el pago antes que sus intereses (`parentId` nulos primero) e `id`, para que sea estable.
12. `EXPORT_MAX_ROWS` también pasa por `docker-compose.yml`, para poder cambiarlo en Dokploy.
13. El límite de exportación corre en `preHandler` (después de `authenticate`), con clave `req.auth.userId` y contador propio de la ruta.
14. El bloqueo de metas vive en `modules/goals/guard.ts` (sin ciclo de imports) y se aplica en `createTransaction`, `updateTransaction`, `deleteTransaction` y `updateGoal`; así el tope también cubre transferencias con `goalId` hechas desde Movimientos.
15. Una meta solo se rechaza si su avance baja y queda < 0; bajar el saldo inicial por debajo de los retiros también responde 400 `WITHDRAWAL_EXCEEDS_GOAL` (en `fields.initialAmount`).
16. La Fase 2 ya renovaba la sesión con `updateMany` y conteo (401, no 404); esta fase agrega el filtro de vigencia (`expiresAt > ahora`) y pruebas de integración de las dos carreras (logout y vencimiento).
17. El lado API del pendiente 4 (spec §8.4 y §9.2) ya existe desde la Fase 2 (las sugerencias traen `recurringRuleId` y `prepareLink` rechaza `scheduledItemId` con `recurring`); el esqueleto no le daba tarea, así que la Tarea 7 solo agrega su test.
18. `computeBudget(db, auth, month, options?)` usa dos sobrecargas: con copia (por defecto) exige `PrismaClient`, porque copiar abre su propia transacción; con `{ copy: false }` acepta cualquier `DbClient`, incluida la transacción del reporte.

## Review Focus

1. Una cuenta creada a mitad del periodo o eliminada con historial → `opening + inflow − outflow = closing` sigue cumpliéndose (Tarea 2: test de invariante sobre varias cuentas, incluida una inactiva).
2. Un periodo personalizado que empieza y termina a mitad de mes → los totales de los meses parciales suman exactamente los totales del periodo (Tarea 2).
3. Descripciones con `;`, comillas, saltos de línea, emojis y prefijos de fórmula → el CSV y el Excel se leen de vuelta idénticos (salvo el `'` de protección) (Tarea 5).
4. Excel abierto en otra zona horaria → la fecha de la celda no se corre de día (celdas creadas en UTC a medianoche; test que lee la celda y compara AAAA-MM-DD) (Tarea 5).
5. Escritura concurrente mientras se arma el reporte → los números del reporte cuadran entre sí (Tarea 4: crear un movimiento entre dos lecturas no rompe `opening + inflow − outflow = closing`; se verifica que el servicio use una sola transacción `REPEATABLE READ`).

Tests de cada línea: (1) `domain/report.test.ts` › "keeps opening + inflow − outflow = closing for every account, deleted or new (review focus 1)"; (2) `domain/report.test.ts` › "makes the partial months add up exactly to the period totals (review focus 2)"; (3) `test/reports-export.test.ts` › "reads back exactly, with BOM, ; CRLF, quotes, emojis and neutralized formulas (review focus 3)" y el test de Excel del mismo archivo; (4) `export/xlsx.test.ts` › "writes dates as real UTC-midnight dates so no time zone moves the day (review focus 4)" y el test de Excel de `test/reports-export.test.ts` (exporta con `TZ=Pacific/Kiritimati`); (5) `test/reports.test.ts` › "ignores a movement written between the first read and the rest of the report".

---

## Estructura de archivos (Fase 3A)

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `packages/shared/src/reports.ts` | Presets, `resolveReportPeriod`, `monthsOfRange`, `roundShare`, `groupTop` | 1 |
| `packages/shared/src/schemas/reports.ts` | `reportQuerySchema`, `reportExportQuerySchema`, `periodInputOf` | 1 |
| `packages/shared/src/reports.test.ts` | Periodos en Bogotá, errores, `groupTop`, esquemas | 1 |
| `packages/shared/src/dto.ts`, `index.ts` | `ReportDTO` exacto del spec §3.4 y exportaciones | 1 |
| `apps/api/src/domain/report.ts` (+ `.test.ts`) | `buildReport`: totales, categorías, cuentas, tarjetas, métodos y serie mensual (puro) | 2 |
| `apps/api/src/modules/budgets/service.ts` | `computeBudget(…, { copy: false })` y `budgetVsSpend` | 3 |
| `apps/api/test/budget-vs-spend.test.ts` | Presupuesto vs. gasto sin copiar presupuestos | 3 |
| `apps/api/src/modules/reports/service.ts` | Periodo → 400, transacción de solo lectura, carga de datos, `loadReport`; luego `exportReport` | 4, 5 |
| `apps/api/src/modules/reports/routes.ts` | `GET /api/reports`; luego `GET /api/reports/export` con su límite | 4, 5 |
| `apps/api/src/app.ts` | Registra `reportRoutes` después de `alertRoutes` | 4 |
| `apps/api/test/reports.test.ts` | Coherencia, reglas de dinero, solo lectura, validación, aislamiento, foto única | 4 |
| `apps/api/src/modules/reports/export/rows.ts` (+ `.test.ts`) | Movimiento → fila de 14 columnas; `guardFormula` | 5 |
| `apps/api/src/modules/reports/export/csv.ts` (+ `.test.ts`) | CSV con BOM, `;`, CRLF y comillas RFC 4180 | 5 |
| `apps/api/src/modules/reports/export/xlsx.ts` (+ `.test.ts`) | Excel de 4 hojas con exceljs; "Generado el" | 5 |
| `apps/api/src/config/env.ts` (+ `env.test.ts`) | `EXPORT_MAX_ROWS` → `config.exportMaxRows` | 5 |
| `apps/api/test/reports-export.test.ts` | CSV y Excel leídos de vuelta, límites, 429, aislamiento | 5 |
| `.env.example`, `apps/api/.env.example`, `docker-compose.yml`, `apps/api/package.json` | `EXPORT_MAX_ROWS` y la dependencia `exceljs` | 5 |
| `apps/api/src/modules/goals/guard.ts` | Bloqueo `FOR UPDATE` de metas y avance nunca negativo | 6 |
| `apps/api/src/modules/transactions/service.ts`, `goals/service.ts` | Usan el bloqueo al crear, editar, eliminar y cambiar la cuenta | 6 |
| `apps/api/test/goals.test.ts` | Retiros simultáneos, editar y eliminar abonos o retiros, cambio de cuenta | 6 |
| `apps/api/src/modules/auth/sessions.ts` (+ `sessions.test.ts`) | Renovación con filtro de vigencia | 7 |
| `apps/api/test/session-renewal.test.ts` | Carreras de logout y vencimiento durante la renovación | 7 |
| `apps/api/test/recurring-link.test.ts` | Pendiente 4, lado API: sugerencias de una regla y nunca enlace + regla nueva | 7 |

---

### Task 1: Contratos compartidos de reportes

**Files:**
- Create: `packages/shared/src/reports.ts`
- Create: `packages/shared/src/schemas/reports.ts`
- Create: `packages/shared/src/reports.test.ts`
- Modify: `packages/shared/src/dto.ts` (import de `ReportPeriod` y `ReportDTO` al final)
- Modify: `packages/shared/src/index.ts`

(No existe `packages/shared/src/schemas/index.ts`: los esquemas se exportan desde `src/index.ts`.)

**Interfaces:**
- Consumes: `addMonths`, `endOfMonth`, `monthKey`, `monthsBetween`, `startOfMonth` y `IsoDate` (`dates.ts`); `todayIn` (solo en el test); `zIsoDate` (`schemas/common.ts`); `AccountRefDTO`, `CategoryRefDTO`, `RefDTO` (`dto.ts`); `DerivedMethod` (`enums.ts`).
- Produces (todo exportado desde `@finanzas/shared`):

```ts
export const REPORT_PRESETS: readonly ['THIS_MONTH', 'LAST_MONTH', 'LAST_3_MONTHS', 'LAST_6_MONTHS', 'LAST_12_MONTHS'];
export type ReportPreset = (typeof REPORT_PRESETS)[number];
export const REPORT_PRESET_LABELS: Record<ReportPreset, string>; // Este mes, Mes anterior, 3 meses, 6 meses, 1 año
export const MAX_REPORT_MONTHS = 24;
export type ReportPeriodInput = { preset: ReportPreset } | { from: IsoDate; to: IsoDate };
export interface ReportPeriod { preset: ReportPreset | null; from: IsoDate; to: IsoDate; months: string[] }
export type ReportPeriodResult =
  { ok: true; period: ReportPeriod } | { ok: false; fields: Record<string, string> };
export function resolveReportPeriod(input: ReportPeriodInput, today: IsoDate): ReportPeriodResult;
export function monthsOfRange(from: IsoDate, to: IsoDate): string[];
export const roundShare: (value: number) => number; // 4 decimales
export function groupTop<T extends { amount: number; share: number }>(
  rows: readonly T[],
  n?: number, // 6
): { top: T[]; other: { amount: number; share: number } | null };
export const reportQuerySchema: z.ZodType<{ preset?: ReportPreset; from?: string; to?: string }>;
// = z.strictObject({ preset, from, to }).refine(un solo modo, { path: ['preset'], message: 'Elige un periodo' })
export const reportExportQuerySchema: z.ZodType<{
  preset?: ReportPreset;
  from?: string;
  to?: string;
  format: 'csv' | 'xlsx';
}>;
export type ReportQuery = z.output<typeof reportQuerySchema>;
export type ReportExportQuery = z.output<typeof reportExportQuerySchema>;
export type ExportFormat = ReportExportQuery['format']; // 'csv' | 'xlsx'
export function periodInputOf(q: { preset?: ReportPreset; from?: string; to?: string }): ReportPeriodInput;
export interface ReportDTO {
  period: ReportPeriod;
  // totals, expenseByCategory, incomeByCategory, accounts, cards, paymentMethods, months y budget:
  // exactos del spec §3.4 (código completo en el Step 5)
}
```

- [ ] **Step 1: Escribir el test que falla**

Create `packages/shared/src/reports.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { todayIn } from './dates';
import {
  groupTop,
  MAX_REPORT_MONTHS,
  REPORT_PRESET_LABELS,
  resolveReportPeriod,
  roundShare,
  type ReportPeriod,
  type ReportPeriodResult,
} from './reports';
import { periodInputOf, reportExportQuerySchema, reportQuerySchema } from './schemas/reports';

function periodOf(result: ReportPeriodResult): ReportPeriod {
  if (!result.ok) throw new Error(`unexpected error: ${JSON.stringify(result.fields)}`);
  return result.period;
}

describe('resolveReportPeriod (spec Fase 3 §3.1)', () => {
  it('resolves THIS_MONTH at 11 p.m. of the 31st in Bogotá, when UTC is already in November', () => {
    const today = todayIn('America/Bogota', new Date('2026-11-01T04:00:00.000Z'));
    expect(today).toBe('2026-10-31');
    expect(periodOf(resolveReportPeriod({ preset: 'THIS_MONTH' }, today))).toEqual({
      preset: 'THIS_MONTH',
      from: '2026-10-01',
      to: '2026-10-31',
      months: ['2026-10'],
    });
  });

  it('resolves THIS_MONTH on the first day of the month to that single day', () => {
    expect(periodOf(resolveReportPeriod({ preset: 'THIS_MONTH' }, '2026-11-01'))).toEqual({
      preset: 'THIS_MONTH',
      from: '2026-11-01',
      to: '2026-11-01',
      months: ['2026-11'],
    });
  });

  it('resolves LAST_MONTH in January to December of the previous year', () => {
    expect(periodOf(resolveReportPeriod({ preset: 'LAST_MONTH' }, '2027-01-15'))).toEqual({
      preset: 'LAST_MONTH',
      from: '2026-12-01',
      to: '2026-12-31',
      months: ['2026-12'],
    });
    expect(periodOf(resolveReportPeriod({ preset: 'LAST_MONTH' }, '2026-03-31')).to).toBe(
      '2026-02-28',
    );
  });

  it('starts the multi-month presets on day 1 and ends them today', () => {
    expect(periodOf(resolveReportPeriod({ preset: 'LAST_3_MONTHS' }, '2026-10-20'))).toEqual({
      preset: 'LAST_3_MONTHS',
      from: '2026-08-01',
      to: '2026-10-20',
      months: ['2026-08', '2026-09', '2026-10'],
    });
    expect(periodOf(resolveReportPeriod({ preset: 'LAST_6_MONTHS' }, '2026-10-20')).from).toBe(
      '2026-05-01',
    );
    const year = periodOf(resolveReportPeriod({ preset: 'LAST_12_MONTHS' }, '2026-02-10'));
    expect(year.from).toBe('2025-03-01');
    expect(year.to).toBe('2026-02-10');
    expect(year.months).toHaveLength(12);
    expect([year.months[0], year.months[11]]).toEqual(['2025-03', '2026-02']);
  });

  it('lists the partial months of a custom period', () => {
    expect(
      periodOf(resolveReportPeriod({ from: '2026-08-15', to: '2026-10-10' }, '2026-10-20')),
    ).toEqual({
      preset: null,
      from: '2026-08-15',
      to: '2026-10-10',
      months: ['2026-08', '2026-09', '2026-10'],
    });
  });

  it('accepts exactly 24 calendar months', () => {
    const period = periodOf(
      resolveReportPeriod({ from: '2024-11-01', to: '2026-10-20' }, '2026-10-20'),
    );
    expect(period.months).toHaveLength(MAX_REPORT_MONTHS);
  });

  it('rejects from after to, a future end and more than 24 months', () => {
    expect(resolveReportPeriod({ from: '2026-10-10', to: '2026-10-01' }, '2026-10-20')).toEqual({
      ok: false,
      fields: { from: 'La fecha inicial no puede ser posterior a la final' },
    });
    expect(resolveReportPeriod({ from: '2026-10-01', to: '2026-10-21' }, '2026-10-20')).toEqual({
      ok: false,
      fields: { to: 'La fecha final no puede ser futura' },
    });
    expect(resolveReportPeriod({ from: '2024-10-31', to: '2026-10-01' }, '2026-10-20')).toEqual({
      ok: false,
      fields: { from: 'Elige un periodo de máximo 24 meses' },
    });
  });

  it('labels the period buttons in Spanish', () => {
    expect(REPORT_PRESET_LABELS).toEqual({
      THIS_MONTH: 'Este mes',
      LAST_MONTH: 'Mes anterior',
      LAST_3_MONTHS: '3 meses',
      LAST_6_MONTHS: '6 meses',
      LAST_12_MONTHS: '1 año',
    });
  });
});

describe('groupTop (spec Fase 3 §3.3)', () => {
  const row = (name: string, amount: number, share: number) => ({ name, amount, share });

  it('keeps six rows or fewer as they are, sorted, without "Otros"', () => {
    const rows = [row('b', 200, 0.4), row('a', 300, 0.6)];
    expect(groupTop(rows)).toEqual({ top: [row('a', 300, 0.6), row('b', 200, 0.4)], other: null });
  });

  it('adds up everything after the sixth row', () => {
    const shares = [0.2, 0.17, 0.15, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03];
    const rows = shares.map((share, i) => row(`c${i}`, 900 - i * 100, share));
    const { top, other } = groupTop(rows);
    expect(top.map((r) => r.name)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5']);
    expect(other).toEqual({ amount: 600, share: 0.15 });
  });

  it('returns no "Otros" when the rest adds up to 0', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((n) => row(`c${n}`, n * 100, 0.1)).concat(row('z', 0, 0));
    expect(groupTop(rows).other).toBeNull();
    expect(groupTop(rows).top).toHaveLength(6);
  });

  it('rounds shares to 4 decimals', () => {
    expect(roundShare(2 / 3)).toBe(0.6667);
    expect(roundShare(300_000 / 2_150_000)).toBe(0.1395);
  });
});

describe('report query schemas', () => {
  it('accepts a preset alone, or from and to together', () => {
    expect(reportQuerySchema.parse({ preset: 'LAST_MONTH' })).toEqual({ preset: 'LAST_MONTH' });
    expect(reportQuerySchema.parse({ from: '2026-08-15', to: '2026-10-10' })).toEqual({
      from: '2026-08-15',
      to: '2026-10-10',
    });
  });

  it('asks for exactly one way to choose the period under "preset"', () => {
    for (const q of [
      {},
      { from: '2026-08-15' },
      { preset: 'THIS_MONTH', from: '2026-08-15', to: '2026-10-10' },
    ]) {
      const result = reportQuerySchema.safeParse(q);
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('preset');
    }
  });

  it('rejects unknown presets, impossible dates and unknown keys', () => {
    expect(reportQuerySchema.safeParse({ preset: 'LAST_YEAR' }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ from: '2026-02-30', to: '2026-03-01' }).success).toBe(
      false,
    );
    expect(reportQuerySchema.safeParse({ preset: 'THIS_MONTH', page: '1' }).success).toBe(false);
  });

  it('requires csv or xlsx to export', () => {
    expect(reportExportQuerySchema.parse({ preset: 'THIS_MONTH', format: 'xlsx' })).toEqual({
      preset: 'THIS_MONTH',
      format: 'xlsx',
    });
    expect(reportExportQuerySchema.safeParse({ preset: 'THIS_MONTH' }).success).toBe(false);
    expect(reportExportQuerySchema.safeParse({ preset: 'THIS_MONTH', format: 'pdf' }).success).toBe(
      false,
    );
  });

  it('turns a validated query into the period input', () => {
    expect(periodInputOf({ preset: 'LAST_6_MONTHS' })).toEqual({ preset: 'LAST_6_MONTHS' });
    expect(periodInputOf({ from: '2026-08-15', to: '2026-10-10' })).toEqual({
      from: '2026-08-15',
      to: '2026-10-10',
    });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -w @finanzas/shared -- src/reports.test.ts`
Expected: FAIL — Vitest no puede resolver `./reports` (el módulo no existe).

- [ ] **Step 3: Crear `packages/shared/src/reports.ts`**

```ts
import {
  addMonths,
  endOfMonth,
  monthKey,
  monthsBetween,
  startOfMonth,
  type IsoDate,
} from './dates';

export const REPORT_PRESETS = [
  'THIS_MONTH',
  'LAST_MONTH',
  'LAST_3_MONTHS',
  'LAST_6_MONTHS',
  'LAST_12_MONTHS',
] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

export const REPORT_PRESET_LABELS: Record<ReportPreset, string> = {
  THIS_MONTH: 'Este mes',
  LAST_MONTH: 'Mes anterior',
  LAST_3_MONTHS: '3 meses',
  LAST_6_MONTHS: '6 meses',
  LAST_12_MONTHS: '1 año',
};

/** Spec Fase 3 §3.1: un periodo personalizado abarca como máximo 24 meses calendario. */
export const MAX_REPORT_MONTHS = 24;

export type ReportPeriodInput = { preset: ReportPreset } | { from: IsoDate; to: IsoDate };

export interface ReportPeriod {
  preset: ReportPreset | null;
  from: IsoDate;
  to: IsoDate;
  /** Meses `YYYY-MM` que toca el periodo, en orden; un mes parcial cuenta solo sus días dentro. */
  months: string[];
}

export type ReportPeriodResult =
  { ok: true; period: ReportPeriod } | { ok: false; fields: Record<string, string> };

/** Proporción con 4 decimales (0.1395 = 13,95 %). */
export const roundShare = (value: number) => Math.round(value * 10_000) / 10_000;

/** Meses `YYYY-MM` desde el mes de `from` hasta el mes de `to`. */
export function monthsOfRange(from: IsoDate, to: IsoDate): string[] {
  const months: string[] = [];
  for (let d = startOfMonth(from); d <= to; d = addMonths(d, 1)) months.push(monthKey(d));
  return months;
}

/** Meses hacia atrás desde el mes actual; el periodo termina hoy. */
const MONTHS_BACK: Record<Exclude<ReportPreset, 'LAST_MONTH'>, number> = {
  THIS_MONTH: 0,
  LAST_3_MONTHS: 2,
  LAST_6_MONTHS: 5,
  LAST_12_MONTHS: 11,
};

/** Spec Fase 3 §3.1. `today` es la fecha de hoy en la zona del usuario (America/Bogota). */
export function resolveReportPeriod(input: ReportPeriodInput, today: IsoDate): ReportPeriodResult {
  if ('preset' in input) {
    const { preset } = input;
    const thisMonth = startOfMonth(today);
    if (preset === 'LAST_MONTH') {
      const from = addMonths(thisMonth, -1);
      const to = endOfMonth(from);
      return { ok: true, period: { preset, from, to, months: monthsOfRange(from, to) } };
    }
    const from = addMonths(thisMonth, -MONTHS_BACK[preset]);
    return { ok: true, period: { preset, from, to: today, months: monthsOfRange(from, today) } };
  }
  const { from, to } = input;
  const fields: Record<string, string> = {};
  if (from > to) fields.from = 'La fecha inicial no puede ser posterior a la final';
  else if (monthsBetween(from, to) + 1 > MAX_REPORT_MONTHS) {
    fields.from = `Elige un periodo de máximo ${MAX_REPORT_MONTHS} meses`;
  }
  if (to > today) fields.to = 'La fecha final no puede ser futura';
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, period: { preset: null, from, to, months: monthsOfRange(from, to) } };
}

/**
 * Spec Fase 3 §3.3: las `n` filas mayores y el resto sumado en "Otros" (la interfaz pone la
 * etiqueta). `other` es null si no hay resto o si el resto suma 0.
 */
export function groupTop<T extends { amount: number; share: number }>(
  rows: readonly T[],
  n = 6,
): { top: T[]; other: { amount: number; share: number } | null } {
  const sorted = [...rows].sort((a, b) => b.amount - a.amount);
  const rest = sorted.slice(n);
  const amount = rest.reduce((s, r) => s + r.amount, 0);
  return {
    top: sorted.slice(0, n),
    other: amount > 0 ? { amount, share: roundShare(rest.reduce((s, r) => s + r.share, 0)) } : null,
  };
}
```

- [ ] **Step 4: Crear `packages/shared/src/schemas/reports.ts`**

```ts
import { z } from 'zod';
import { REPORT_PRESETS, type ReportPeriodInput, type ReportPreset } from '../reports';
import { zIsoDate } from './common';

const periodFields = {
  preset: z.enum(REPORT_PRESETS).optional(),
  from: zIsoDate.optional(),
  to: zIsoDate.optional(),
};

interface PeriodQuery {
  preset?: ReportPreset;
  from?: string;
  to?: string;
}

/** Se envía `preset` solo, o `from` y `to` juntos (spec Fase 3 §3.1). */
const oneMode = (q: PeriodQuery) =>
  q.preset !== undefined
    ? q.from === undefined && q.to === undefined
    : q.from !== undefined && q.to !== undefined;
const oneModeIssue = { path: ['preset'], message: 'Elige un periodo' };

/** `GET /api/reports`. */
export const reportQuerySchema = z.strictObject(periodFields).refine(oneMode, oneModeIssue);

/** `GET /api/reports/export`: el mismo periodo más el formato (spec Fase 3 §4). */
export const reportExportQuerySchema = z
  .strictObject({ ...periodFields, format: z.enum(['csv', 'xlsx']) })
  .refine(oneMode, oneModeIssue);

export type ReportQuery = z.output<typeof reportQuerySchema>;
export type ReportExportQuery = z.output<typeof reportExportQuerySchema>;
export type ExportFormat = ReportExportQuery['format'];

/** Consulta ya validada → entrada de `resolveReportPeriod`. */
export function periodInputOf(q: PeriodQuery): ReportPeriodInput {
  return q.preset ? { preset: q.preset } : { from: q.from!, to: q.to! };
}
```

- [ ] **Step 5: Agregar `ReportDTO` en `packages/shared/src/dto.ts`**

Después del import de `./enums` (línea 14, `} from './enums';`), agregar:

```ts
import type { ReportPeriod } from './reports';
```

Al final del archivo, agregar:

```ts
/** Spec Fase 3 §3.4 (`GET /api/reports`): pesos enteros; `share` y `savingsRate` con 4 decimales. */
export interface ReportDTO {
  period: ReportPeriod;
  totals: {
    income: number;
    expense: number;
    savings: number;
    investment: number;
    remaining: number;
    savingsRate: number | null;
  };
  expenseByCategory: Array<{ category: CategoryRefDTO; amount: number; share: number }>;
  incomeByCategory: Array<{ category: CategoryRefDTO; amount: number; share: number }>;
  accounts: Array<{
    account: AccountRefDTO;
    opening: number;
    inflow: number;
    outflow: number;
    closing: number;
  }>;
  cards: Array<{ card: RefDTO; purchases: number; payments: number; closingDebt: number }>;
  paymentMethods: Array<{ method: DerivedMethod; amount: number; share: number }>;
  months: Array<{
    month: string;
    income: number;
    expense: number;
    savings: number;
    investment: number;
    remaining: number;
    closing: { totalMoney: number; debts: number; netWorth: number; savingsBalance: number };
  }>;
  budget: {
    months: Array<{ month: string; budget: number | null; spent: number }>;
    lines: Array<{ category: CategoryRefDTO; amount: number; spent: number }>;
  };
}
```

- [ ] **Step 6: Exportar desde `packages/shared/src/index.ts`**

Después de `export * from './dto';` agregar `export * from './reports';`, y al final del archivo agregar `export * from './schemas/reports';`. El archivo queda:

```ts
export * from './money';
export * from './dates';
export * from './enums';
export * from './dto';
export * from './reports';
export * from './schemas/common';
export * from './schemas/auth';
export * from './schemas/accounts';
export * from './schemas/categories';
export * from './schemas/credit-cards';
export * from './schemas/debts';
export * from './schemas/transactions';
export * from './schemas/planning';
export * from './schemas/tags';
export * from './schemas/reports';
```

- [ ] **Step 7: Correr los tests del paquete compartido**

Run: `npm test -w @finanzas/shared`
Expected: PASS — 47 tests (los 30 anteriores y los 17 de `reports.test.ts`).

- [ ] **Step 8: Verificar el monorepo**

Run:

```bash
npm run typecheck
npx prettier --write packages/shared/src
npm run lint
npm run format:check
```

Expected: todo en verde (la API y la web compilan: solo se agregaron tipos y funciones).

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src
git commit -m "feat: agrega los contratos compartidos de reportes con periodos, agrupación y esquemas"
```

(El mensaje es una sola frase; se agrega la línea `Co-Authored-By` si el entorno la pide. Igual en todas las tareas.)

---

### Task 2: Dominio del reporte (puro)

**Files:**
- Create: `apps/api/src/domain/report.ts`
- Create: `apps/api/src/domain/report.test.ts`

**Interfaces:**
- Consumes: `LedgerEntry`, `effectsOf`, `applyLedger` (`domain/ledger.ts`); `monthFlows`, `summarizeDebts` (`domain/balances.ts`); `deriveMethod`, `DERIVED_METHODS`, `roundShare`, `endOfMonth`, `monthStartFromKey` y los tipos `AccountRefDTO`, `AccountType`, `CategoryRefDTO`, `DerivedMethod`, `IsoDate`, `PaymentMethod`, `RefDTO`, `ReportDTO`, `ReportPeriod` (`@finanzas/shared`).
- Produces:

```ts
export interface ReportEntry extends LedgerEntry {
  date: IsoDate;
  categoryId: string | null;
  paymentMethod: PaymentMethod | null;
}
export interface ReportInput {
  period: ReportPeriod;
  accounts: Array<{ ref: AccountRefDTO; initialBalance: number }>;
  cards: Array<{ ref: RefDTO; initialDebt: number }>;
  loans: Array<{ id: string; initialBalance: number }>;
  categories: Map<string, CategoryRefDTO>;
  /** Movimientos con fecha ≤ `to`; los anteriores a `from` solo alimentan los saldos de apertura. */
  entries: ReportEntry[];
}
export type ReportBody = Omit<ReportDTO, 'budget'>;
export function buildReport(input: ReportInput): ReportBody;
```

Reglas (spec §3.2): `expense` = `EXPENSE` + `CARD_PURCHASE` (intereses y ajustes incluidos; la compra a cuotas completa en su fecha); `savings`/`investment` = efecto neto del periodo en las cuentas `SAVINGS`/`INVESTMENT` (`monthFlows`); `savingsRate` = `roundShare(savings ÷ income)` o `null`; las categorías suman en su principal y se ordenan por valor y, en empate, por nombre; las cuentas y tarjetas con todo en 0 se omiten; cada mes se recorta al periodo y cierra en el último día del mes o en `to`.

- [ ] **Step 1: Escribir el test que falla**

Create `apps/api/src/domain/report.test.ts` (los valores esperados están calculados a mano en los comentarios del `sample()`; por ejemplo, el Banco abre en 1.500.000 = 1.000.000 + 500.000 del 1 de agosto, entra 2.000.000 + 1.000.000 y sale 100.000 + 300.000 + 200.000 + 400.000 + 50.000 + 80.000 = 1.130.000):

```ts
import { describe, expect, it } from 'vitest';
import type {
  AccountRefDTO,
  AccountType,
  CategoryRefDTO,
  PaymentMethod,
  RefDTO,
  TransactionType,
} from '@finanzas/shared';
import { buildReport, type ReportEntry, type ReportInput } from './report';

const accountRef = (
  id: string,
  name: string,
  type: AccountType,
  isActive = true,
): AccountRefDTO => ({
  id,
  name,
  type,
  icon: 'wallet',
  color: '#0f766e',
  isActive,
});
const cardRef = (id: string, name: string): RefDTO => ({
  id,
  name,
  icon: 'credit-card',
  color: '#7c3aed',
  isActive: true,
});
const categoryRef = (
  id: string,
  name: string,
  kind: 'INCOME' | 'EXPENSE',
  parentId: string | null = null,
  isActive = true,
): CategoryRefDTO => ({ id, name, kind, parentId, icon: 'tag', color: '#64748b', isActive });

const CATEGORIES = [
  categoryRef('food', 'Alimentación', 'EXPENSE'),
  categoryRef('rest', 'Restaurantes', 'EXPENSE', 'food'),
  categoryRef('fun', 'Entretenimiento', 'EXPENSE', null, false),
  categoryRef('interest', 'Intereses y comisiones', 'EXPENSE'),
  categoryRef('adj', 'Ajuste de saldo', 'EXPENSE'),
  categoryRef('salary', 'Salario', 'INCOME'),
  categoryRef('extra', 'Ingreso extra', 'INCOME'),
];
const cat = (id: string) => CATEGORIES.find((c) => c.id === id)!;

interface EntryInput {
  accountId?: string;
  toAccountId?: string;
  creditCardId?: string;
  debtId?: string;
  categoryId?: string;
  paymentMethod?: PaymentMethod;
}
const entry = (
  date: string,
  type: TransactionType,
  amount: number,
  refs: EntryInput = {},
): ReportEntry => ({
  date,
  type,
  amount,
  accountId: refs.accountId ?? null,
  toAccountId: refs.toAccountId ?? null,
  creditCardId: refs.creditCardId ?? null,
  debtId: refs.debtId ?? null,
  categoryId: refs.categoryId ?? null,
  paymentMethod: refs.paymentMethod ?? null,
});

/**
 * Periodo personalizado del 15 de agosto al 10 de octubre (meses parciales en los dos extremos).
 * Banco $1.000.000, Ahorro $0, Efectivo $50.000 (eliminada después de quedar en $0), Nequi
 * $200.000 (nueva: su primer movimiento es a mitad del periodo), Otra $0 sin movimientos;
 * tarjeta con deuda inicial $100.000 y préstamo de $5.000.000.
 */
function sample(): ReportInput {
  return {
    period: {
      preset: null,
      from: '2026-08-15',
      to: '2026-10-10',
      months: ['2026-08', '2026-09', '2026-10'],
    },
    accounts: [
      { ref: accountRef('bank', 'Banco', 'BANK'), initialBalance: 1_000_000 },
      { ref: accountRef('sav', 'Ahorro', 'SAVINGS'), initialBalance: 0 },
      { ref: accountRef('cash', 'Efectivo', 'CASH', false), initialBalance: 50_000 },
      { ref: accountRef('new', 'Nequi', 'DIGITAL_WALLET'), initialBalance: 200_000 },
      { ref: accountRef('idle', 'Otra', 'OTHER'), initialBalance: 0 },
    ],
    cards: [
      { ref: cardRef('card', 'Visa'), initialDebt: 100_000 },
      { ref: cardRef('idle-card', 'Sin uso'), initialDebt: 0 },
    ],
    loans: [{ id: 'loan', initialBalance: 5_000_000 }],
    categories: new Map(CATEGORIES.map((c) => [c.id, c])),
    entries: [
      // Antes del periodo: solo cuentan para los saldos de apertura.
      entry('2026-08-01', 'INCOME', 500_000, { accountId: 'bank', categoryId: 'salary' }),
      entry('2026-08-10', 'EXPENSE', 30_000, { accountId: 'cash', categoryId: 'food' }),
      // Agosto (desde el 15).
      entry('2026-08-20', 'INCOME', 2_000_000, { accountId: 'bank', categoryId: 'salary' }),
      entry('2026-08-25', 'EXPENSE', 100_000, {
        accountId: 'bank',
        categoryId: 'rest',
        paymentMethod: 'DEBIT_CARD',
      }),
      entry('2026-08-31', 'TRANSFER', 300_000, { accountId: 'bank', toAccountId: 'sav' }),
      // Septiembre.
      entry('2026-09-05', 'CARD_PURCHASE', 600_000, { creditCardId: 'card', categoryId: 'fun' }),
      entry('2026-09-10', 'CARD_PAYMENT', 200_000, { accountId: 'bank', creditCardId: 'card' }),
      entry('2026-09-15', 'DEBT_PAYMENT', 400_000, { accountId: 'bank', debtId: 'loan' }),
      entry('2026-09-15', 'EXPENSE', 50_000, { accountId: 'bank', categoryId: 'interest' }),
      entry('2026-09-20', 'EXPENSE', 20_000, { accountId: 'cash', categoryId: 'food' }),
      entry('2026-09-25', 'EXPENSE', 10_000, { accountId: 'new', categoryId: 'adj' }),
      // Octubre (hasta el 10).
      entry('2026-10-01', 'INCOME', 150_000, { accountId: 'new', categoryId: 'extra' }),
      entry('2026-10-05', 'EXPENSE', 80_000, { accountId: 'bank', categoryId: 'food' }),
      entry('2026-10-08', 'DEBT_DISBURSEMENT', 1_000_000, { accountId: 'bank', debtId: 'loan' }),
    ],
  };
}

describe('buildReport — totals (spec Fase 3 §3.2.1)', () => {
  it('applies the money rules of every movement type', () => {
    // Gasto = 100.000 + 600.000 (compra completa) + 50.000 (intereses) + 20.000 + 10.000 (ajuste)
    // + 80.000; la transferencia, el pago de tarjeta, el abono al préstamo y el desembolso no cuentan.
    expect(buildReport(sample()).totals).toEqual({
      income: 2_150_000,
      expense: 860_000,
      savings: 300_000,
      investment: 0,
      remaining: 990_000,
      savingsRate: 0.1395,
    });
  });

  it('returns a null savings rate when there is no income', () => {
    const input = sample();
    input.period = { preset: null, from: '2026-09-01', to: '2026-09-30', months: ['2026-09'] };
    expect(buildReport(input).totals).toEqual({
      income: 0,
      expense: 680_000,
      savings: 0,
      investment: 0,
      remaining: -680_000,
      savingsRate: null,
    });
  });

  it('ignores movements after the end of the period', () => {
    const input = sample();
    input.entries.push(
      entry('2026-10-11', 'EXPENSE', 999, { accountId: 'bank', categoryId: 'food' }),
    );
    expect(buildReport(input).totals.expense).toBe(860_000);
  });
});

describe('buildReport — categories and payment methods (spec Fase 3 §3.2.2 and §3.2.5)', () => {
  it('groups subcategories in their main category, sorted by amount with shares', () => {
    const report = buildReport(sample());
    expect(report.expenseByCategory).toEqual([
      { category: cat('fun'), amount: 600_000, share: 0.6977 },
      { category: cat('food'), amount: 200_000, share: 0.2326 },
      { category: cat('interest'), amount: 50_000, share: 0.0581 },
      { category: cat('adj'), amount: 10_000, share: 0.0116 },
    ]);
    expect(report.incomeByCategory).toEqual([
      { category: cat('salary'), amount: 2_000_000, share: 0.9302 },
      { category: cat('extra'), amount: 150_000, share: 0.0698 },
    ]);
  });

  it('breaks ties by name', () => {
    const input = sample();
    input.period = { preset: null, from: '2026-10-11', to: '2026-10-11', months: ['2026-10'] };
    input.entries.push(
      entry('2026-10-11', 'EXPENSE', 5_000, { accountId: 'bank', categoryId: 'interest' }),
      entry('2026-10-11', 'EXPENSE', 5_000, { accountId: 'bank', categoryId: 'adj' }),
    );
    expect(buildReport(input).expenseByCategory.map((r) => r.category.name)).toEqual([
      'Ajuste de saldo',
      'Intereses y comisiones',
    ]);
  });

  it('groups spending by derived payment method', () => {
    expect(buildReport(sample()).paymentMethods).toEqual([
      { method: 'CREDIT_CARD', amount: 600_000, share: 0.6977 },
      { method: 'BANK', amount: 130_000, share: 0.1512 },
      { method: 'DEBIT_CARD', amount: 100_000, share: 0.1163 },
      { method: 'CASH', amount: 20_000, share: 0.0233 },
      { method: 'DIGITAL_WALLET', amount: 10_000, share: 0.0116 },
    ]);
  });
});

describe('buildReport — accounts and cards (spec Fase 3 §3.2.3 and §3.2.4)', () => {
  it('keeps opening + inflow − outflow = closing for every account, deleted or new (review focus 1)', () => {
    const { accounts } = buildReport(sample());
    expect(accounts).toEqual([
      {
        account: accountRef('bank', 'Banco', 'BANK'),
        opening: 1_500_000,
        inflow: 3_000_000,
        outflow: 1_130_000,
        closing: 3_370_000,
      },
      {
        account: accountRef('sav', 'Ahorro', 'SAVINGS'),
        opening: 0,
        inflow: 300_000,
        outflow: 0,
        closing: 300_000,
      },
      {
        account: accountRef('cash', 'Efectivo', 'CASH', false),
        opening: 20_000,
        inflow: 0,
        outflow: 20_000,
        closing: 0,
      },
      {
        account: accountRef('new', 'Nequi', 'DIGITAL_WALLET'),
        opening: 200_000,
        inflow: 150_000,
        outflow: 10_000,
        closing: 340_000,
      },
    ]);
    for (const a of accounts) expect(a.opening + a.inflow - a.outflow).toBe(a.closing);
  });

  it('reports card purchases, payments and closing debt with the initial debt', () => {
    expect(buildReport(sample()).cards).toEqual([
      {
        card: cardRef('card', 'Visa'),
        purchases: 600_000,
        payments: 200_000,
        closingDebt: 500_000,
      },
    ]);
  });
});

describe('buildReport — monthly series (spec Fase 3 §3.2.6)', () => {
  it('clips the partial months to the period and closes each month on its balances', () => {
    expect(buildReport(sample()).months).toEqual([
      {
        month: '2026-08',
        income: 2_000_000,
        expense: 100_000,
        savings: 300_000,
        investment: 0,
        remaining: 1_600_000,
        closing: {
          totalMoney: 3_620_000,
          debts: 5_100_000,
          netWorth: -1_480_000,
          savingsBalance: 300_000,
        },
      },
      {
        month: '2026-09',
        income: 0,
        expense: 680_000,
        savings: 0,
        investment: 0,
        remaining: -680_000,
        closing: {
          totalMoney: 2_940_000,
          debts: 5_100_000,
          netWorth: -2_160_000,
          savingsBalance: 300_000,
        },
      },
      {
        month: '2026-10',
        income: 150_000,
        expense: 80_000,
        savings: 0,
        investment: 0,
        remaining: 70_000,
        closing: {
          totalMoney: 4_010_000,
          debts: 6_100_000,
          netWorth: -2_090_000,
          savingsBalance: 300_000,
        },
      },
    ]);
  });

  it('makes the partial months add up exactly to the period totals (review focus 2)', () => {
    const { totals, months } = buildReport(sample());
    for (const key of ['income', 'expense', 'savings', 'investment', 'remaining'] as const) {
      expect(
        months.reduce((s, m) => s + m[key], 0),
        key,
      ).toBe(totals[key]);
    }
    const lastClosing = months[months.length - 1]!.closing;
    const accounts = buildReport(sample()).accounts;
    expect(lastClosing.totalMoney).toBe(accounts.reduce((s, a) => s + a.closing, 0));
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -w @finanzas/api -- src/domain/report.test.ts`
Expected: FAIL — Vitest no puede resolver `./report`.

- [ ] **Step 3: Implementar `apps/api/src/domain/report.ts`**

```ts
import {
  DERIVED_METHODS,
  deriveMethod,
  endOfMonth,
  monthStartFromKey,
  roundShare,
  type AccountRefDTO,
  type AccountType,
  type CategoryRefDTO,
  type DerivedMethod,
  type IsoDate,
  type PaymentMethod,
  type RefDTO,
  type ReportDTO,
  type ReportPeriod,
} from '@finanzas/shared';
import { monthFlows, summarizeDebts } from './balances';
import { applyLedger, effectsOf, type LedgerEntry } from './ledger';

/** Movimiento (o suma de movimientos iguales del mismo día) que alimenta el reporte. */
export interface ReportEntry extends LedgerEntry {
  date: IsoDate;
  categoryId: string | null;
  paymentMethod: PaymentMethod | null;
}

export interface ReportInput {
  period: ReportPeriod;
  /** Todas las cuentas del usuario, activas o eliminadas, en el orden de la app. */
  accounts: Array<{ ref: AccountRefDTO; initialBalance: number }>;
  cards: Array<{ ref: RefDTO; initialDebt: number }>;
  loans: Array<{ id: string; initialBalance: number }>;
  /** Todas las categorías del usuario, activas o eliminadas, por id. */
  categories: Map<string, CategoryRefDTO>;
  /** Movimientos con fecha ≤ `to`; los anteriores a `from` solo alimentan los saldos de apertura. */
  entries: ReportEntry[];
}

/** Todo el reporte menos el presupuesto, que se calcula aparte (`budgetVsSpend`). */
export type ReportBody = Omit<ReportDTO, 'budget'>;
type CategoryRow = ReportDTO['expenseByCategory'][number];

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
const isSpending = (e: ReportEntry) => e.type === 'EXPENSE' || e.type === 'CARD_PURCHASE';
const between = (entries: ReportEntry[], from: IsoDate, to: IsoDate) =>
  entries.filter((e) => e.date >= from && e.date <= to);
const addTo = (map: Map<string, number>, key: string, value: number) =>
  map.set(key, (map.get(key) ?? 0) + value);

/** Spec Fase 3 §3.2.2: una subcategoría suma en su principal; orden por valor y, en empate, por nombre. */
function byCategory(
  entries: ReportEntry[],
  categories: Map<string, CategoryRefDTO>,
  kind: 'INCOME' | 'EXPENSE',
): CategoryRow[] {
  const rows = new Map<string, { category: CategoryRefDTO; amount: number }>();
  for (const e of entries) {
    if (kind === 'INCOME' ? e.type !== 'INCOME' : !isSpending(e)) continue;
    const category = e.categoryId ? categories.get(e.categoryId) : undefined;
    if (!category) continue;
    const main = (category.parentId && categories.get(category.parentId)) || category;
    const row = rows.get(main.id) ?? { category: main, amount: 0 };
    row.amount += e.amount;
    rows.set(main.id, row);
  }
  const total = sum([...rows.values()].map((r) => r.amount));
  return [...rows.values()]
    .map((r) => ({ ...r, share: roundShare(r.amount / total) }))
    .sort((a, b) => b.amount - a.amount || a.category.name.localeCompare(b.category.name, 'es'));
}

/** Spec Fase 3 §3.2.5: gastos (`EXPENSE` + `CARD_PURCHASE`) por método derivado. */
function byMethod(
  entries: ReportEntry[],
  accountTypes: ReadonlyMap<string, AccountType>,
): ReportDTO['paymentMethods'] {
  const sums = new Map<DerivedMethod, number>();
  for (const e of entries) {
    if (!isSpending(e)) continue;
    const accountType = e.accountId ? (accountTypes.get(e.accountId) ?? null) : null;
    const method = deriveMethod(e.type, e.paymentMethod, accountType);
    if (method) sums.set(method, (sums.get(method) ?? 0) + e.amount);
  }
  const total = sum([...sums.values()]);
  return [...sums]
    .map(([method, amount]) => ({ method, amount, share: roundShare(amount / total) }))
    .sort(
      (a, b) =>
        b.amount - a.amount ||
        DERIVED_METHODS.indexOf(a.method) - DERIVED_METHODS.indexOf(b.method),
    );
}

/** Spec Fase 3 §3.2.3: saldo inicial (día anterior a `from`), entradas, salidas y saldo final. */
function accountRows(input: ReportInput, inPeriod: ReportEntry[]): ReportDTO['accounts'] {
  const before = applyLedger(input.entries.filter((e) => e.date < input.period.from)).accountDeltas;
  const inflow = new Map<string, number>();
  const outflow = new Map<string, number>();
  for (const e of inPeriod) {
    for (const fx of effectsOf(e).accounts) {
      if (fx.delta > 0) addTo(inflow, fx.accountId, fx.delta);
      else addTo(outflow, fx.accountId, -fx.delta);
    }
  }
  return input.accounts
    .map(({ ref, initialBalance }) => {
      const opening = initialBalance + (before.get(ref.id) ?? 0);
      const inn = inflow.get(ref.id) ?? 0;
      const out = outflow.get(ref.id) ?? 0;
      return { account: ref, opening, inflow: inn, outflow: out, closing: opening + inn - out };
    })
    .filter((r) => r.opening !== 0 || r.inflow !== 0 || r.outflow !== 0 || r.closing !== 0);
}

/** Spec Fase 3 §3.2.4: compras y pagos del periodo; deuda en `to` con la deuda inicial. */
function cardRows(input: ReportInput, inPeriod: ReportEntry[]): ReportDTO['cards'] {
  const debtDeltas = applyLedger(input.entries.filter((e) => e.date <= input.period.to)).cardDeltas;
  const purchases = new Map<string, number>();
  const payments = new Map<string, number>();
  for (const e of inPeriod) {
    if (!e.creditCardId) continue;
    if (e.type === 'CARD_PURCHASE') addTo(purchases, e.creditCardId, e.amount);
    if (e.type === 'CARD_PAYMENT') addTo(payments, e.creditCardId, e.amount);
  }
  return input.cards
    .map(({ ref, initialDebt }) => ({
      card: ref,
      purchases: purchases.get(ref.id) ?? 0,
      payments: payments.get(ref.id) ?? 0,
      closingDebt: initialDebt + (debtDeltas.get(ref.id) ?? 0),
    }))
    .filter((r) => r.purchases !== 0 || r.payments !== 0 || r.closingDebt !== 0);
}

/** Spec Fase 3 §3.2.6: dinero total, deudas, patrimonio y ahorro al cierre de `date`. */
function closingAt(input: ReportInput, date: IsoDate): ReportDTO['months'][number]['closing'] {
  const totals = applyLedger(input.entries.filter((e) => e.date <= date));
  const balances = input.accounts.map((a) => ({
    type: a.ref.type,
    balance: a.initialBalance + (totals.accountDeltas.get(a.ref.id) ?? 0),
  }));
  const totalMoney = sum(balances.map((b) => b.balance));
  // Igual que el dashboard: una tarjeta con saldo a favor no resta deuda.
  const debts = summarizeDebts(
    input.cards.map((c) => c.initialDebt + (totals.cardDeltas.get(c.ref.id) ?? 0)),
    input.loans.map((l) => l.initialBalance + (totals.loanDeltas.get(l.id) ?? 0)),
  ).total;
  const savingsBalance = sum(
    balances.filter((b) => b.type === 'SAVINGS' || b.type === 'INVESTMENT').map((b) => b.balance),
  );
  return { totalMoney, debts, netWorth: totalMoney - debts, savingsBalance };
}

/** Spec Fase 3 §3.2: reporte del periodo a partir de los saldos iniciales y los movimientos. */
export function buildReport(input: ReportInput): ReportBody {
  const { period } = input;
  const accountTypes = new Map(input.accounts.map((a) => [a.ref.id, a.ref.type]));
  const inPeriod = between(input.entries, period.from, period.to);
  const flows = monthFlows(inPeriod, accountTypes);
  return {
    period,
    totals: {
      ...flows,
      savingsRate: flows.income > 0 ? roundShare(flows.savings / flows.income) : null,
    },
    expenseByCategory: byCategory(inPeriod, input.categories, 'EXPENSE'),
    incomeByCategory: byCategory(inPeriod, input.categories, 'INCOME'),
    accounts: accountRows(input, inPeriod),
    cards: cardRows(input, inPeriod),
    paymentMethods: byMethod(inPeriod, accountTypes),
    months: period.months.map((month) => {
      const start = monthStartFromKey(month);
      const end = endOfMonth(start);
      const from = start > period.from ? start : period.from;
      const to = end < period.to ? end : period.to;
      return {
        month,
        ...monthFlows(between(input.entries, from, to), accountTypes),
        closing: closingAt(input, to),
      };
    }),
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -w @finanzas/api -- src/domain/report.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Verificar**

Run:

```bash
npm run typecheck
npx prettier --write apps/api/src/domain/report.ts apps/api/src/domain/report.test.ts
npm run lint
npm run format:check
```

Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domain/report.ts apps/api/src/domain/report.test.ts
git commit -m "feat: agrega el cálculo puro del reporte con totales, cuentas y serie mensual"
```

---

### Task 3: Presupuesto de solo lectura

**Files:**
- Modify: `apps/api/src/modules/budgets/service.ts` (import de `ReportDTO`; `computeBudget` con opciones; `budgetVsSpend` nuevo antes de `getBudget`)
- Create: `apps/api/test/budget-vs-spend.test.ts`

**Interfaces:**
- Consumes: `loadRow`, `copyPrevious`, `BudgetComputation` (mismo archivo); `ReportDTO` (Tarea 1); `toDbDate`, `fromDbDate`, `num` (`lib/db`); `DbClient` (`lib/prisma`).
- Produces:

```ts
export interface ComputeBudgetOptions {
  copy?: boolean; // false = solo lectura
}
export function computeBudget(
  db: PrismaClient,
  auth: AuthContext,
  month: string,
  options?: { copy?: true },
): Promise<BudgetComputation>; // los llamadores actuales no cambian
export function computeBudget(
  db: DbClient,
  auth: AuthContext,
  month: string,
  options: { copy: false },
): Promise<BudgetComputation>; // acepta una transacción
export async function budgetVsSpend(
  db: DbClient,
  auth: AuthContext,
  months: string[],
): Promise<ReportDTO['budget']>;
```

- [ ] **Step 1: Escribir el test que falla**

Create `apps/api/test/budget-vs-spend.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { budgetVsSpend } from '../src/modules/budgets/service';
import type { AuthContext } from '../src/types/fastify';
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

describe('budgetVsSpend (spec Fase 3 §3.2.7)', () => {
  it('reads budgets without copying them and falls back to all spending', async () => {
    const { api, user } = await registerUser(app);
    const f = await setupFinances(api);
    const auth: AuthContext = {
      userId: user.id,
      sessionId: 'report-test',
      timezone: 'America/Bogota',
      today: TODAY,
    };
    const expense = (date: string, amount: number, categoryId: string) =>
      api.post('/api/transactions', {
        type: 'EXPENSE',
        amount,
        date,
        accountId: f.bank,
        categoryId,
      });

    // Agosto: total general de 1.000.000 (cuenta todo el gasto del mes).
    await api.put('/api/budgets/2026-08', { totalAmount: 1_000_000, lines: [] });
    await expense('2026-08-12', 25_000, f.cat.fun);
    // Septiembre: solo una línea de Alimentación (cuenta Alimentación y sus subcategorías).
    await api.put('/api/budgets/2026-09', {
      totalAmount: null,
      lines: [{ categoryId: f.cat.food, amount: 500_000 }],
    });
    await expense('2026-09-10', 120_000, f.cat.food);
    await expense('2026-09-12', 80_000, f.cat.fun);
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 30_000,
      date: '2026-09-15',
      categoryId: f.cat.food,
    });
    // Octubre (mes actual): sin presupuesto.
    await expense('2026-10-05', 40_000, f.cat.food);
    await expense('2026-10-06', 60_000, f.cat.fun);
    const budgetRows = () => app.prisma.budget.count({ where: { userId: user.id } });
    expect(await budgetRows()).toBe(2);

    expect(await budgetVsSpend(app.prisma, auth, ['2026-09', '2026-10', '2026-11'])).toEqual({
      months: [
        { month: '2026-09', budget: 500_000, spent: 150_000 },
        { month: '2026-10', budget: null, spent: 100_000 },
        { month: '2026-11', budget: null, spent: 0 },
      ],
      lines: [],
    });
    // Ni el mes actual ni el siguiente copiaron el presupuesto de septiembre.
    expect(await budgetRows()).toBe(2);

    expect(await budgetVsSpend(app.prisma, auth, ['2026-08', '2026-09'])).toEqual({
      months: [
        { month: '2026-08', budget: 1_000_000, spent: 25_000 },
        { month: '2026-09', budget: 500_000, spent: 150_000 },
      ],
      lines: [
        {
          category: expect.objectContaining({ id: f.cat.food, name: 'Alimentación' }),
          amount: 500_000,
          spent: 150_000,
        },
      ],
    });

    // La pantalla de Presupuestos sigue copiando como en la Fase 2.
    const october = await api.get('/api/budgets/2026-10');
    expect(october.body.budget.copiedFrom).toBe('2026-09');
    expect(await budgetRows()).toBe(3);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run dev:db` (si la base de pruebas no está arriba) y `npm test -w @finanzas/api -- test/budget-vs-spend.test.ts`
Expected: FAIL — `TypeError: budgetVsSpend is not a function` (y `npm run typecheck` reporta que `budgetVsSpend` no existe).

- [ ] **Step 3: Importar `ReportDTO`**

En `apps/api/src/modules/budgets/service.ts`, en el import de `@finanzas/shared`, agregar `type ReportDTO,` después de `type IsoDate,`.

- [ ] **Step 4: `computeBudget` con modo de solo lectura**

Reemplazar desde `export async function computeBudget(` hasta el cierre del `if` que llama a `copyPrevious` (es decir, todo antes de `  const isCurrent = monthStart === startOfMonth(today);`) por:

```ts
export interface ComputeBudgetOptions {
  /** false: solo lectura, nunca copia del mes anterior (reportes, spec Fase 3 §3.2.7). */
  copy?: boolean;
}

export function computeBudget(
  db: PrismaClient,
  auth: AuthContext,
  month: string,
  options?: { copy?: true },
): Promise<BudgetComputation>;
export function computeBudget(
  db: DbClient,
  auth: AuthContext,
  month: string,
  options: { copy: false },
): Promise<BudgetComputation>;
export async function computeBudget(
  db: DbClient,
  auth: AuthContext,
  month: string,
  options: ComputeBudgetOptions = {},
): Promise<BudgetComputation> {
  const { userId, today } = auth;
  const monthStart = monthStartFromKey(month);
  const monthEnd = endOfMonth(monthStart);
  let row = await loadRow(db, userId, monthStart);
  if (
    !row &&
    options.copy !== false &&
    monthStart >= startOfMonth(today) &&
    // Las sobrecargas garantizan un PrismaClient cuando se permite copiar.
    (await copyPrevious(db as PrismaClient, userId, monthStart))
  ) {
    row = await loadRow(db, userId, monthStart);
  }
```

El resto de la función no cambia (todas sus consultas ya aceptan `DbClient`).

- [ ] **Step 5: Agregar `budgetVsSpend`**

Justo antes de `export async function getBudget(`, agregar:

```ts
/**
 * Spec Fase 3 §3.2.7: presupuesto vs. gasto de cada mes, de solo lectura (nunca copia). Con
 * presupuesto, `spent` usa su alcance (plan Fase 2, decisión 1); sin presupuesto, todo el gasto
 * del mes calendario. `lines` es el detalle del último mes.
 */
export async function budgetVsSpend(
  db: DbClient,
  auth: AuthContext,
  months: string[],
): Promise<ReportDTO['budget']> {
  const result: ReportDTO['budget'] = { months: [], lines: [] };
  if (months.length === 0) return result;
  const spendRows = await db.transaction.groupBy({
    by: ['date'],
    where: {
      userId: auth.userId,
      type: { in: ['EXPENSE', 'CARD_PURCHASE'] },
      date: {
        gte: toDbDate(monthStartFromKey(months[0]!)),
        lte: toDbDate(endOfMonth(monthStartFromKey(months[months.length - 1]!))),
      },
    },
    _sum: { amount: true },
  });
  const spentByMonth = new Map<string, number>();
  for (const r of spendRows) {
    const key = monthKey(fromDbDate(r.date));
    spentByMonth.set(key, (spentByMonth.get(key) ?? 0) + num(r._sum.amount));
  }
  for (const [i, month] of months.entries()) {
    const { dto } = await computeBudget(db, auth, month, { copy: false });
    result.months.push({
      month,
      budget: dto.total?.budget ?? null,
      spent: dto.total?.spent ?? spentByMonth.get(month) ?? 0,
    });
    if (i === months.length - 1) {
      result.lines = dto.lines.map((l) => ({
        category: l.category,
        amount: l.amount,
        spent: l.spent,
      }));
    }
  }
  return result;
}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npm test -w @finanzas/api -- test/budget-vs-spend.test.ts test/settings-budgets.test.ts test/planning.test.ts`
Expected: PASS (el test nuevo y los de presupuestos de la Fase 2, que siguen copiando por defecto).

- [ ] **Step 7: Verificar**

Run:

```bash
npm run typecheck
npx prettier --write apps/api/src/modules/budgets/service.ts apps/api/test/budget-vs-spend.test.ts
npm run lint
npm run format:check
```

Expected: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/budgets/service.ts apps/api/test/budget-vs-spend.test.ts
git commit -m "feat: agrega el presupuesto vs. gasto de solo lectura para los reportes"
```

---

### Task 4: Módulo de reportes (`GET /api/reports`)

**Files:**
- Create: `apps/api/src/modules/reports/service.ts`
- Create: `apps/api/src/modules/reports/routes.ts`
- Create: `apps/api/test/reports.test.ts`
- Modify: `apps/api/src/app.ts` (registrar después de `alertRoutes`)

**Interfaces:**
- Consumes: `resolveReportPeriod`, `periodInputOf`, `reportQuerySchema`, `addDays`, `ReportDTO`, `ReportPeriod`, `ReportPeriodInput` (Tarea 1); `buildReport`, `ReportEntry`, `ReportInput` (Tarea 2); `budgetVsSpend` (Tarea 3); `parse` (`lib/validation`); `badRequest` (`lib/errors`); `accountRefSelect`, `categoryRefSelect`, `refSelect` (`lib/selects`); `Prisma` y `PrismaClient` (`generated/prisma/client`).
- Produces:

```ts
export function resolvePeriodOrThrow(input: ReportPeriodInput, today: IsoDate): ReportPeriod; // 400 VALIDATION_ERROR + fields
export function inReportTransaction<T>(
  db: PrismaClient,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T>; // SET TRANSACTION READ ONLY + REPEATABLE READ
export const periodWhere: (
  userId: string,
  period: ReportPeriod,
) => { userId: string; date: { gte: Date; lte: Date } };
export async function loadReportData(db: DbClient, auth: AuthContext, period: ReportPeriod): Promise<ReportInput>;
export async function loadReport(db: PrismaClient, auth: AuthContext, input: ReportPeriodInput): Promise<ReportDTO>;
export async function reportRoutes(app: FastifyInstance): Promise<void>; // GET /api/reports → ReportDTO
```

Verificado en el código generado: `Prisma.TransactionIsolationLevel.RepeatableRead` existe (`apps/api/src/generated/prisma/internal/prismaNamespace.ts`, valor `'RepeatableRead'`), Prisma lo traduce a `REPEATABLE READ`, y `@prisma/adapter-pg` ejecuta `BEGIN` y `SET TRANSACTION ISOLATION LEVEL …` antes del callback, así `SET TRANSACTION READ ONLY` es la primera sentencia del callback. Postgres permite pasar a solo lectura aun después de la primera lectura (solo prohíbe volver a escritura), algo que usa el test de la foto única.

- [ ] **Step 1: Escribir el test que falla**

Create `apps/api/test/reports.test.ts`. Valores a mano: en "THIS_MONTH totals…" el gasto es 150.000 + 1.200.000 (compra a 12 cuotas, completa) + 50.000 (intereses) = 1.400.000, el ahorro 600.000 y la tasa 600.000 ÷ 4.000.000 = 0,15; en "keeps opening…", el Banco abre en 2.000.000 − 100.000 (julio) = 1.900.000, entra 3.000.000 y sale 500.000 + 300.000 + 450.000 = 1.250.000; en "counts installments…", el Banco queda en 1.820.000 después del ajuste de −30.000.

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DashboardDTO, ReportDTO } from '@finanzas/shared';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { loadReport } from '../src/modules/reports/service';
import type { AuthContext } from '../src/types/fastify';
import { balanceOf, setupFinances } from './finance-fixtures';
import { client, createTestApp, registerUser, type Client } from './helpers';

let app: FastifyInstance;
const TODAY = '2026-10-20';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

async function newUser() {
  const { api, user, cookie } = await registerUser(app);
  return { api, cookie, userId: user.id, f: await setupFinances(api) };
}

const report = async (api: Client, query: string) => {
  const res = await api.get<ReportDTO>(`/api/reports?${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
};

const expense = (
  api: Client,
  date: string,
  amount: number,
  accountId: string,
  categoryId: string,
) => api.post('/api/transactions', { type: 'EXPENSE', amount, date, accountId, categoryId });

describe('GET /api/reports — coherence (spec Fase 3 §9.2)', () => {
  it('THIS_MONTH totals are the dashboard "thisMonth"', async () => {
    const { api, f } = await newUser();
    await expense(api, '2026-09-28', 70_000, f.cash, f.cat.food); // mes anterior: no cuenta
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 4_000_000,
      date: '2026-10-01',
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    await expense(api, '2026-10-05', 150_000, f.bank, f.cat.food);
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 1_200_000,
      date: '2026-10-06',
      categoryId: f.cat.fun,
      installments: 12,
    });
    await api.post('/api/transfers', {
      amount: 600_000,
      date: '2026-10-07',
      accountId: f.bank,
      toAccountId: f.savings,
    });
    await api.post(`/api/credit-cards/${f.card}/payment`, {
      amount: 200_000,
      date: '2026-10-08',
      accountId: f.bank,
    });
    await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 400_000,
      interest: 50_000,
      date: '2026-10-10',
    });

    const r = await report(api, 'preset=THIS_MONTH');
    const d = (await api.get<DashboardDTO>('/api/dashboard')).body;
    expect(r.period).toEqual({
      preset: 'THIS_MONTH',
      from: '2026-10-01',
      to: TODAY,
      months: ['2026-10'],
    });
    expect(r.totals).toEqual({
      income: d.thisMonth.income,
      expense: d.thisMonth.expense,
      savings: d.thisMonth.savings,
      investment: d.thisMonth.investment,
      remaining: d.thisMonth.remaining,
      savingsRate: d.thisMonth.savingsRate,
    });
    expect(r.totals).toEqual({
      income: 4_000_000,
      expense: 1_400_000,
      savings: 600_000,
      investment: 0,
      remaining: 2_000_000,
      savingsRate: 0.15,
    });
    expect(r.budget).toEqual({
      months: [{ month: '2026-10', budget: null, spent: 1_400_000 }],
      lines: [],
    });
  });

  it('keeps opening + inflow − outflow = closing and closes each month on its balances', async () => {
    const { api, f } = await newUser();
    await expense(api, '2026-07-15', 100_000, f.bank, f.cat.food); // antes del periodo
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 3_000_000,
      date: '2026-08-10',
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    await api.post('/api/transfers', {
      amount: 500_000,
      date: '2026-08-20',
      accountId: f.bank,
      toAccountId: f.savings,
    });
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 300_000,
      date: '2026-09-05',
      categoryId: f.cat.fun,
    });
    await api.post(`/api/credit-cards/${f.card}/payment`, {
      amount: 300_000,
      date: '2026-09-30',
      accountId: f.bank,
    });
    await expense(api, '2026-10-03', 100_000, f.cash, f.cat.food);
    // Efectivo queda en $0 y se elimina con historial.
    expect((await api.del(`/api/accounts/${f.cash}`)).body).toEqual({ deleted: 'soft' });
    await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 450_000,
      date: '2026-10-15',
    });

    const r = await report(api, 'preset=LAST_3_MONTHS');
    expect(r.period.months).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(r.totals).toEqual({
      income: 3_000_000,
      expense: 400_000,
      savings: 500_000,
      investment: 0,
      remaining: 2_100_000,
      savingsRate: 0.1667,
    });
    expect(
      r.accounts.map((a) => [
        a.account.name,
        a.account.isActive,
        a.opening,
        a.inflow,
        a.outflow,
        a.closing,
      ]),
    ).toEqual([
      ['Bancolombia', true, 1_900_000, 3_000_000, 1_250_000, 3_650_000],
      ['Bolsillo ahorro', true, 0, 500_000, 0, 500_000],
      ['Efectivo', false, 100_000, 0, 100_000, 0],
    ]);
    for (const a of r.accounts) {
      expect(a.opening + a.inflow - a.outflow, a.account.name).toBe(a.closing);
      expect(await balanceOf(api, a.account.id), a.account.name).toBe(a.closing);
    }
    expect(r.cards).toEqual([
      {
        card: expect.objectContaining({ id: f.card, name: 'Nu Crédito' }),
        purchases: 300_000,
        payments: 300_000,
        closingDebt: 0,
      },
    ]);
    expect(r.months.map((m) => ({ month: m.month, ...m.closing }))).toEqual([
      {
        month: '2026-08',
        totalMoney: 5_000_000,
        debts: 8_000_000,
        netWorth: -3_000_000,
        savingsBalance: 500_000,
      },
      {
        month: '2026-09',
        totalMoney: 4_700_000,
        debts: 8_000_000,
        netWorth: -3_300_000,
        savingsBalance: 500_000,
      },
      {
        month: '2026-10',
        totalMoney: 4_150_000,
        debts: 7_550_000,
        netWorth: -3_400_000,
        savingsBalance: 500_000,
      },
    ]);
    // El cierre del último mes (hoy) es lo que muestra el dashboard.
    const d = (await api.get<DashboardDTO>('/api/dashboard')).body;
    expect(r.months[2]!.closing).toEqual({
      totalMoney: d.money.total,
      debts: d.debts.total,
      netWorth: d.netWorth,
      savingsBalance: d.money.savings + d.money.investment,
    });
    expect(r.budget.months).toEqual([
      { month: '2026-08', budget: null, spent: 0 },
      { month: '2026-09', budget: null, spent: 300_000 },
      { month: '2026-10', budget: null, spent: 100_000 },
    ]);
  });
});

describe('GET /api/reports — money rules (spec Fase 3 §3.2)', () => {
  it('counts installments in full, groups subcategories and keeps deleted references', async () => {
    const { api, f } = await newUser();
    await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 1_000_000,
      date: '2026-10-01',
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 1_200_000,
      date: '2026-10-02',
      categoryId: f.cat.fun,
      installments: 12,
    });
    await api.post(`/api/credit-cards/${f.card}/payment`, {
      amount: 100_000,
      date: '2026-10-03',
      accountId: f.bank,
    });
    await api.post('/api/transfers', {
      amount: 300_000,
      date: '2026-10-04',
      accountId: f.bank,
      toAccountId: f.wallet,
    });
    const goal = (
      await api.post('/api/goals', { name: 'Viaje', targetAmount: 2_000_000, accountId: f.savings })
    ).body.goal;
    await api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.bank,
      amount: 200_000,
      date: '2026-10-05',
    });
    await api.post(`/api/debts/${f.debt}/payments`, {
      accountId: f.bank,
      principal: 400_000,
      interest: 50_000,
      date: '2026-10-06',
    });
    const restaurants = (
      await api.post('/api/categories', {
        name: 'Restaurantes',
        kind: 'EXPENSE',
        parentId: f.cat.food,
      })
    ).body.category.id;
    await expense(api, '2026-10-07', 80_000, f.bank, restaurants);
    await expense(api, '2026-10-08', 20_000, f.bank, f.cat.food);
    // Banco: 2.000.000 + 1.000.000 − 100.000 − 300.000 − 200.000 − 450.000 − 100.000 = 1.850.000.
    const adjust = await api.post(`/api/accounts/${f.bank}/adjust`, {
      actualBalance: 1_820_000,
      date: '2026-10-09',
    });
    expect(adjust.status).toBe(201);
    expect((await api.del(`/api/categories/${f.cat.fun}`)).body).toEqual({ deleted: 'soft' });

    const r = await report(api, 'preset=THIS_MONTH');
    expect(r.totals).toEqual({
      income: 1_000_000,
      expense: 1_380_000,
      savings: 200_000,
      investment: 0,
      remaining: -580_000,
      savingsRate: 0.2,
    });
    expect(
      r.expenseByCategory.map((c) => [c.category.name, c.category.isActive, c.amount, c.share]),
    ).toEqual([
      ['Entretenimiento', false, 1_200_000, 0.8696],
      ['Alimentación', true, 100_000, 0.0725],
      ['Intereses y comisiones', true, 50_000, 0.0362],
      ['Ajuste de saldo', true, 30_000, 0.0217],
    ]);
    expect(r.expenseByCategory.every((c) => c.category.parentId === null)).toBe(true);
    expect(r.incomeByCategory.map((c) => [c.category.name, c.amount, c.share])).toEqual([
      ['Salario', 1_000_000, 1],
    ]);
    expect(r.paymentMethods).toEqual([
      { method: 'CREDIT_CARD', amount: 1_200_000, share: 0.8696 },
      { method: 'BANK', amount: 180_000, share: 0.1304 },
    ]);
    expect(r.cards.map((c) => [c.card.name, c.purchases, c.payments, c.closingDebt])).toEqual([
      ['Nu Crédito', 1_200_000, 100_000, 1_100_000],
    ]);
    expect(
      r.accounts.map((a) => [a.account.name, a.opening, a.inflow, a.outflow, a.closing]),
    ).toEqual([
      ['Bancolombia', 2_000_000, 1_000_000, 1_180_000, 1_820_000],
      ['Nequi', 0, 300_000, 0, 300_000],
      ['Bolsillo ahorro', 0, 200_000, 0, 200_000],
      ['Efectivo', 100_000, 0, 0, 100_000],
    ]);
  });
});

describe('GET /api/reports — read only, validation and isolation', () => {
  it('never copies budgets nor generates occurrences (spec Fase 3 §3.2)', async () => {
    const { api, cookie, userId, f } = await newUser();
    await api.put('/api/budgets/2026-10', { totalAmount: 1_000_000, lines: [] });
    await api.post('/api/recurring', {
      name: 'Arriendo',
      kind: 'EXPENSE',
      amount: 1_000_000,
      categoryId: f.cat.food,
      accountId: f.bank,
      frequency: 'MONTHLY',
      startDate: '2026-10-25',
    });
    const later = await createTestApp({}, { now: () => new Date('2026-12-10T15:00:00Z') });
    try {
      const december = client(later.app, cookie);
      const counts = async () => ({
        budgets: await app.prisma.budget.count({ where: { userId } }),
        items: await app.prisma.scheduledItem.count({ where: { userId } }),
      });
      const before = await counts();
      expect(before.budgets).toBe(1);

      const r = await report(december, 'preset=LAST_3_MONTHS');
      expect(r.budget.months).toEqual([
        { month: '2026-10', budget: 1_000_000, spent: 0 },
        { month: '2026-11', budget: null, spent: 0 },
        { month: '2026-12', budget: null, spent: 0 },
      ]);
      expect(await counts()).toEqual(before);

      // El dashboard de diciembre sí copia el presupuesto y genera las ocurrencias pendientes.
      await december.get('/api/dashboard');
      const after = await counts();
      expect(after.budgets).toBe(2);
      expect(after.items).toBeGreaterThan(before.items);
    } finally {
      await later.app.close();
    }
  });

  it('answers 400 with fields for an invalid period', async () => {
    const { api } = await registerUser(app);
    const fieldsOf = async (query: string) => {
      const res = await api.get(`/api/reports?${query}`);
      expect(res.status, query).toBe(400);
      expect(res.body.error.code, query).toBe('VALIDATION_ERROR');
      return res.body.error.fields as Record<string, string>;
    };
    expect(await fieldsOf('from=2026-10-10&to=2026-10-01')).toEqual({
      from: 'La fecha inicial no puede ser posterior a la final',
    });
    expect(await fieldsOf('from=2026-10-01&to=2026-10-21')).toEqual({
      to: 'La fecha final no puede ser futura',
    });
    expect(await fieldsOf('from=2024-10-01&to=2026-10-20')).toEqual({
      from: 'Elige un periodo de máximo 24 meses',
    });
    expect(await fieldsOf('')).toEqual({ preset: 'Elige un periodo' });
    expect(await fieldsOf('preset=THIS_MONTH&from=2026-10-01&to=2026-10-10')).toEqual({
      preset: 'Elige un periodo',
    });
    expect(Object.keys(await fieldsOf('preset=LAST_YEAR'))).toEqual(['preset']);
    expect(Object.keys(await fieldsOf('from=2026-02-30&to=2026-03-01'))).toEqual(['from']);
    expect((await api.get('/api/reports?from=2024-11-01&to=2026-10-20')).status).toBe(200);
    expect((await client(app).get('/api/reports?preset=THIS_MONTH')).status).toBe(401);
  });

  it("never shows another user's data", async () => {
    const a = await newUser();
    await expense(a.api, '2026-10-05', 150_000, a.f.bank, a.f.cat.food);
    await a.api.put('/api/budgets/2026-10', { totalAmount: 500_000, lines: [] });
    const b = await registerUser(app);

    expect(await report(b.api, 'preset=THIS_MONTH')).toEqual({
      period: { preset: 'THIS_MONTH', from: '2026-10-01', to: TODAY, months: ['2026-10'] },
      totals: { income: 0, expense: 0, savings: 0, investment: 0, remaining: 0, savingsRate: null },
      expenseByCategory: [],
      incomeByCategory: [],
      accounts: [],
      cards: [],
      paymentMethods: [],
      months: [
        {
          month: '2026-10',
          income: 0,
          expense: 0,
          savings: 0,
          investment: 0,
          remaining: 0,
          closing: { totalMoney: 0, debts: 0, netWorth: 0, savingsBalance: 0 },
        },
      ],
      budget: { months: [{ month: '2026-10', budget: null, spent: 0 }], lines: [] },
    });
    const own = await report(a.api, 'preset=THIS_MONTH');
    expect(own.totals.expense).toBe(150_000);
    expect(own.budget.months).toEqual([{ month: '2026-10', budget: 500_000, spent: 150_000 }]);
  });
});

describe('GET /api/reports — one consistent snapshot (review focus 5)', () => {
  it('ignores a movement written between the first read and the rest of the report', async () => {
    const { api, userId, f } = await newUser();
    await expense(api, TODAY, 100_000, f.bank, f.cat.food);
    const auth: AuthContext = {
      userId,
      sessionId: 'report-test',
      timezone: 'America/Bogota',
      today: TODAY,
    };
    type TxOptions = { isolationLevel?: Prisma.TransactionIsolationLevel };
    const options: TxOptions[] = [];
    const settings: Array<{ iso: string; ro: string }> = [];
    const spy = {
      $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, opts: TxOptions) => {
        options.push(opts);
        return app.prisma.$transaction(async (tx) => {
          // Primera lectura: aquí REPEATABLE READ toma la foto de los datos.
          await tx.$queryRaw`SELECT 1`;
          // Otra conexión registra un gasto antes de que el reporte lea los movimientos.
          const concurrent = await expense(api, TODAY, 50_000, f.bank, f.cat.food);
          expect(concurrent.status).toBe(201);
          const result = await fn(tx);
          settings.push(
            ...(await tx.$queryRaw<Array<{ iso: string; ro: string }>>`
              SELECT current_setting('transaction_isolation') AS iso,
                     current_setting('transaction_read_only') AS ro`),
          );
          return result;
        }, opts);
      },
    } as unknown as PrismaClient;

    const r = await loadReport(spy, auth, { preset: 'THIS_MONTH' });
    expect(options).toEqual([{ isolationLevel: 'RepeatableRead' }]);
    expect(settings).toEqual([{ iso: 'repeatable read', ro: 'on' }]);
    expect(r.totals.expense).toBe(100_000);
    expect(r.budget.months).toEqual([{ month: '2026-10', budget: null, spent: 100_000 }]);
    const bank = r.accounts.find((a) => a.account.id === f.bank)!;
    expect([bank.opening, bank.inflow, bank.outflow, bank.closing]).toEqual([
      2_000_000, 0, 100_000, 1_900_000,
    ]);

    // Fuera de esa transacción el gasto concurrente sí aparece.
    const fresh = await report(api, 'preset=THIS_MONTH');
    expect(fresh.totals.expense).toBe(150_000);
    expect(fresh.accounts.find((a) => a.account.id === f.bank)!.closing).toBe(1_850_000);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -w @finanzas/api -- test/reports.test.ts`
Expected: FAIL — Vitest no puede resolver `../src/modules/reports/service`.

- [ ] **Step 3: Crear `apps/api/src/modules/reports/service.ts`**

```ts
import {
  addDays,
  resolveReportPeriod,
  type IsoDate,
  type PaymentMethod,
  type ReportDTO,
  type ReportPeriod,
  type ReportPeriodInput,
  type TransactionType,
} from '@finanzas/shared';
import { buildReport, type ReportEntry, type ReportInput } from '../../domain/report';
import { Prisma, type PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { badRequest } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import { accountRefSelect, categoryRefSelect, refSelect } from '../../lib/selects';
import type { AuthContext } from '../../types/fastify';
import { budgetVsSpend } from '../budgets/service';

/** Spec Fase 3 §3.1: un periodo inválido responde 400 `VALIDATION_ERROR` con `fields`. */
export function resolvePeriodOrThrow(input: ReportPeriodInput, today: IsoDate): ReportPeriod {
  const result = resolveReportPeriod(input, today);
  if (!result.ok) {
    throw badRequest('VALIDATION_ERROR', 'Revisa los datos ingresados.', result.fields);
  }
  return result.period;
}

/**
 * Spec Fase 3 §3.2: el reporte sale de una sola transacción de solo lectura con aislamiento
 * REPEATABLE READ: una sola conexión y una misma foto de los datos, aunque haya escrituras a la vez.
 */
export function inReportTransaction<T>(
  db: PrismaClient,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return run(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

interface GroupRow {
  type: TransactionType;
  accountId: string | null;
  toAccountId: string | null;
  creditCardId: string | null;
  debtId: string | null;
  categoryId?: string | null;
  paymentMethod?: PaymentMethod | null;
  _sum: { amount: bigint | null };
}

const entryOf = (r: GroupRow, date: IsoDate): ReportEntry => ({
  date,
  type: r.type,
  amount: num(r._sum.amount),
  accountId: r.accountId,
  toAccountId: r.toAccountId,
  creditCardId: r.creditCardId,
  debtId: r.debtId,
  categoryId: r.categoryId ?? null,
  paymentMethod: r.paymentMethod ?? null,
});

/** Movimientos del periodo (para contar y exportar). */
export const periodWhere = (userId: string, period: ReportPeriod) => ({
  userId,
  date: { gte: toDbDate(period.from), lte: toDbDate(period.to) },
});

/**
 * Todo lo que necesita `buildReport`, filtrado por `userId`. Lo anterior a `from` llega sumado por
 * tipo y referencias (fechado el día anterior a `from`); lo del periodo, sumado por día.
 */
export async function loadReportData(
  db: DbClient,
  auth: AuthContext,
  period: ReportPeriod,
): Promise<ReportInput> {
  const { userId } = auth;
  const accounts = await db.account.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { ...accountRefSelect, initialBalance: true },
  });
  const cards = await db.creditCard.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { ...refSelect, initialDebt: true },
  });
  const loans = await db.debt.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, initialBalance: true },
  });
  const categories = await db.category.findMany({ where: { userId }, select: categoryRefSelect });
  const before = await db.transaction.groupBy({
    by: ['type', 'accountId', 'toAccountId', 'creditCardId', 'debtId'],
    where: { userId, date: { lt: toDbDate(period.from) } },
    _sum: { amount: true },
  });
  const inPeriod = await db.transaction.groupBy({
    by: [
      'date',
      'type',
      'accountId',
      'toAccountId',
      'creditCardId',
      'debtId',
      'categoryId',
      'paymentMethod',
    ],
    where: periodWhere(userId, period),
    _sum: { amount: true },
  });
  const dayBefore = addDays(period.from, -1);
  return {
    period,
    accounts: accounts.map(({ initialBalance, ...ref }) => ({
      ref,
      initialBalance: num(initialBalance),
    })),
    cards: cards.map(({ initialDebt, ...ref }) => ({ ref, initialDebt: num(initialDebt) })),
    loans: loans.map((l) => ({ id: l.id, initialBalance: num(l.initialBalance) })),
    categories: new Map(categories.map((c) => [c.id, c])),
    entries: [
      ...before.map((r) => entryOf(r, dayBefore)),
      ...inPeriod.map((r) => entryOf(r, fromDbDate(r.date))),
    ],
  };
}

/** `GET /api/reports` (spec Fase 3 §3.2): solo lee; no genera ocurrencias ni copia presupuestos. */
export async function loadReport(
  db: PrismaClient,
  auth: AuthContext,
  input: ReportPeriodInput,
): Promise<ReportDTO> {
  const period = resolvePeriodOrThrow(input, auth.today);
  return inReportTransaction(db, async (tx) => {
    const body = buildReport(await loadReportData(tx, auth, period));
    return { ...body, budget: await budgetVsSpend(tx, auth, period.months) };
  });
}
```

- [ ] **Step 4: Crear `apps/api/src/modules/reports/routes.ts`**

```ts
import { periodInputOf, reportQuerySchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse } from '../../lib/validation';
import { loadReport } from './service';

export async function reportRoutes(app: FastifyInstance) {
  app.get('/reports', async (req) =>
    loadReport(app.prisma, req.auth, periodInputOf(parse(reportQuerySchema, req.query))),
  );
}
```

- [ ] **Step 5: Registrar las rutas en `apps/api/src/app.ts`**

Después de `import { goalRoutes } from './modules/goals/routes';` agregar:

```ts
import { reportRoutes } from './modules/reports/routes';
```

y dentro del grupo `/api`, después de `await api.register(alertRoutes);`:

```ts
      await api.register(reportRoutes);
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npm test -w @finanzas/api -- test/reports.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Verificar**

Run:

```bash
npm run typecheck
npx prettier --write apps/api/src/modules/reports apps/api/src/app.ts apps/api/test/reports.test.ts
npm run lint
npm run format:check
```

Expected: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/reports apps/api/src/app.ts apps/api/test/reports.test.ts
git commit -m "feat: agrega el reporte por periodo en una transacción de solo lectura"
```

---

### Task 5: Exportación CSV y Excel

**Files:**
- Create: `apps/api/src/modules/reports/export/rows.ts`, `apps/api/src/modules/reports/export/rows.test.ts`
- Create: `apps/api/src/modules/reports/export/csv.ts`, `apps/api/src/modules/reports/export/csv.test.ts`
- Create: `apps/api/src/modules/reports/export/xlsx.ts`, `apps/api/src/modules/reports/export/xlsx.test.ts`
- Create: `apps/api/test/reports-export.test.ts`
- Modify: `apps/api/src/modules/reports/service.ts` (imports y `exportReport` al final)
- Modify: `apps/api/src/modules/reports/routes.ts` (ruta de exportación)
- Modify: `apps/api/src/config/env.ts`, `apps/api/src/config/env.test.ts`
- Modify: `apps/api/package.json` y `package-lock.json` (exceljs)
- Modify: `.env.example`, `apps/api/.env.example`, `docker-compose.yml`

**Interfaces:**
- Consumes: `inReportTransaction`, `loadReportData`, `periodWhere`, `resolvePeriodOrThrow` (Tarea 4); `buildReport`, `ReportBody` (Tarea 2); `reportExportQuerySchema`, `periodInputOf`, `ExportFormat`, `REPORT_PRESET_LABELS` (Tarea 1); `deriveMethod`, `DERIVED_METHOD_LABELS`, `TRANSACTION_TYPE_LABELS`, `ACCOUNT_TYPE_LABELS` (`@finanzas/shared`); `toDbDate`, `fromDbDate`, `num` (`lib/db`).
- Produces:

```ts
// export/rows.ts
export const EXPORT_COLUMNS: readonly [
  'Fecha', 'Tipo', 'Descripción', 'Categoría', 'Subcategoría', 'Cuenta', 'Cuenta destino',
  'Tarjeta', 'Préstamo', 'Cuotas', 'Método de pago', 'Valor', 'Etiquetas', 'Notas',
];
export const EXPORT_TYPE_LABELS: Record<TransactionType, string>;
export interface ExportTransaction {
  type: TransactionType; date: IsoDate; amount: number; description: string | null;
  notes: string | null; installments: number | null; paymentMethod: PaymentMethod | null;
  account: { name: string; type: AccountType } | null; toAccount: { name: string } | null;
  creditCard: { name: string } | null; debt: { name: string } | null;
  category: { name: string; parent: { name: string } | null } | null; tags: string[];
}
export interface ExportRow {
  date: IsoDate; type: string; description: string; category: string; subcategory: string;
  account: string; toAccount: string; card: string; loan: string; installments: number | null;
  method: string; amount: number; tags: string; notes: string;
}
export function toExportRow(t: ExportTransaction): ExportRow;
export function guardFormula(text: string): string;
// export/csv.ts
export const BOM: string; // U+FEFF
export function csvField(value: string): string;
export function toCsv(rows: ExportRow[]): string;
// export/xlsx.ts
export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export function formatGeneratedAt(now: Date, timeZone: string): string; // dd/mm/aaaa hh:mm
export async function toXlsx(report: ReportBody, rows: ExportRow[], generatedAt: string): Promise<Buffer>;
// reports/service.ts
export async function loadExportTransactions(db: DbClient, userId: string, period: ReportPeriod): Promise<ExportTransaction[]>;
export interface ExportFile { filename: string; contentType: string; body: string | Buffer }
export async function exportReport(
  db: PrismaClient,
  auth: AuthContext,
  input: ReportPeriodInput,
  format: ExportFormat,
  options: { maxRows: number; now: Date },
): Promise<ExportFile>;
// config/env.ts
AppConfig.exportMaxRows: number; // EXPORT_MAX_ROWS, por defecto 20000
// ruta: GET /api/reports/export?format=csv|xlsx&preset=… (o from y to)
```

Verificado: exceljs 4.4.0 es CommonJS, así que se importa con `import ExcelJS from 'exceljs'` (en ESM de Node los imports con nombre llegan `undefined`); `wb.xlsx.writeBuffer()` devuelve un `Buffer` de Node tipado como `ArrayBuffer` (se envuelve con `Buffer.from`), y `wb.xlsx.load` está tipado con `ArrayBuffer` (los tests le pasan `new Uint8Array(buffer).buffer`); `cell.numFmt` por celda; `ws.views = [{ state: 'frozen', ySplit: 1 }]`; `ws.autoFilter = { from, to }` se lee de vuelta como `'A1:N1'`; una fecha a medianoche UTC se lee de vuelta igual en cualquier `TZ`. En `@fastify/rate-limit` 11.2, una ruta con `config.rateLimit` reemplaza el límite global para esa ruta y tiene su propio contador; con `hook: 'preHandler'` el límite se agrega al `preHandler` de la ruta, que Fastify corre después del `authenticate` del grupo `/api` (por eso `req.auth` ya existe en `keyGenerator`).

- [ ] **Step 1: Instalar exceljs**

Run: `npm install exceljs@^4.4.0 -w @finanzas/api`
Expected: `apps/api/package.json` tiene `"exceljs": "^4.4.0"` en `dependencies` y `package-lock.json` cambia. (tsup la deja externa, como las demás dependencias, y la imagen de Docker la instala con `npm ci --omit=dev`.)

- [ ] **Step 2: Tests de filas y CSV**

Create `apps/api/src/modules/reports/export/rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EXPORT_TYPE_LABELS, guardFormula, toExportRow, type ExportTransaction } from './rows';

const lunch: ExportTransaction = {
  type: 'EXPENSE',
  date: '2026-10-07',
  amount: 45_000,
  description: 'Almuerzo',
  notes: null,
  installments: null,
  paymentMethod: null,
  account: { name: 'Bancolombia', type: 'BANK' },
  toAccount: null,
  creditCard: null,
  debt: null,
  category: { name: 'Restaurantes', parent: { name: 'Alimentación' } },
  tags: ['comida', 'trabajo'],
};

describe('toExportRow (spec Fase 3 §4)', () => {
  it('splits main category and subcategory and derives the payment method', () => {
    expect(toExportRow(lunch)).toEqual({
      date: '2026-10-07',
      type: 'Gasto',
      description: 'Almuerzo',
      category: 'Alimentación',
      subcategory: 'Restaurantes',
      account: 'Bancolombia',
      toAccount: '',
      card: '',
      loan: '',
      installments: null,
      method: 'Cuenta bancaria',
      amount: 45_000,
      tags: 'comida, trabajo',
      notes: '',
    });
  });

  it('uses the chosen method and leaves the subcategory empty for a main category', () => {
    const row = toExportRow({
      ...lunch,
      paymentMethod: 'DEBIT_CARD',
      category: { name: 'Alimentación', parent: null },
      tags: [],
      notes: 'con factura',
    });
    expect(row).toMatchObject({
      category: 'Alimentación',
      subcategory: '',
      method: 'Tarjeta débito',
      tags: '',
      notes: 'con factura',
    });
  });

  it('fills card, installments and the credit card method of a card purchase', () => {
    const row = toExportRow({
      ...lunch,
      type: 'CARD_PURCHASE',
      account: null,
      creditCard: { name: 'Nu Crédito' },
      installments: 12,
    });
    expect(row).toMatchObject({
      type: 'Compra con tarjeta',
      account: '',
      card: 'Nu Crédito',
      installments: 12,
      method: 'Tarjeta crédito',
    });
  });

  it('leaves the method empty for movements that are not spending', () => {
    const transfer = toExportRow({
      ...lunch,
      type: 'TRANSFER',
      category: null,
      toAccount: { name: 'Nequi' },
    });
    expect(transfer).toMatchObject({ type: 'Transferencia', toAccount: 'Nequi', method: '' });
    const disbursement = toExportRow({
      ...lunch,
      type: 'DEBT_DISBURSEMENT',
      category: null,
      debt: { name: 'Libre inversión' },
    });
    expect(disbursement).toMatchObject({ type: 'Desembolso', loan: 'Libre inversión', method: '' });
  });

  it('labels the seven types like the spec', () => {
    expect(Object.values(EXPORT_TYPE_LABELS)).toEqual([
      'Ingreso',
      'Gasto',
      'Transferencia',
      'Compra con tarjeta',
      'Pago de tarjeta',
      'Pago de préstamo',
      'Desembolso',
    ]);
  });
});

describe('guardFormula (spec Fase 3 §4)', () => {
  it('prefixes text that a spreadsheet would run as a formula', () => {
    expect(['=1+1', '+57 300', '-5', '@SUMA(A1)', '\tTab', '\rCR'].map(guardFormula)).toEqual([
      "'=1+1",
      "'+57 300",
      "'-5",
      "'@SUMA(A1)",
      "'\tTab",
      "'\rCR",
    ]);
  });

  it('leaves safe text untouched', () => {
    expect(['Almuerzo', '2026-10-07', '', ' =con espacio', 'a=b'].map(guardFormula)).toEqual([
      'Almuerzo',
      '2026-10-07',
      '',
      ' =con espacio',
      'a=b',
    ]);
  });
});
```

Create `apps/api/src/modules/reports/export/csv.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BOM, csvField, toCsv } from './csv';
import type { ExportRow } from './rows';

const HEADER =
  'Fecha;Tipo;Descripción;Categoría;Subcategoría;Cuenta;Cuenta destino;Tarjeta;Préstamo;Cuotas;Método de pago;Valor;Etiquetas;Notas\r\n';

const row: ExportRow = {
  date: '2026-10-07',
  type: 'Gasto',
  description: 'Almuerzo; "especial"',
  category: 'Alimentación',
  subcategory: 'Restaurantes',
  account: 'Bancolombia',
  toAccount: '',
  card: '',
  loan: '',
  installments: null,
  method: 'Tarjeta débito',
  amount: 45_000,
  tags: 'comida, trabajo',
  notes: '=1+1',
};

describe('csvField (RFC 4180 with ;)', () => {
  it('quotes fields with ; " CR or LF and doubles the quotes', () => {
    expect(csvField('a;b')).toBe('"a;b"');
    expect(csvField('dice "hola"')).toBe('"dice ""hola"""');
    expect(csvField('línea\notra')).toBe('"línea\notra"');
    expect(csvField('a\r\nb')).toBe('"a\r\nb"');
    expect(csvField('Café con 🍕, sin comillas')).toBe('Café con 🍕, sin comillas');
  });

  it('neutralizes formulas before quoting', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('\rCR')).toBe(`"'\rCR"`);
    expect(csvField('@nota')).toBe("'@nota");
  });
});

describe('toCsv (spec Fase 3 §4)', () => {
  it('writes the BOM, the header, ; separators and CRLF line ends', () => {
    expect(toCsv([row])).toBe(
      BOM +
        HEADER +
        '2026-10-07;Gasto;"Almuerzo; ""especial""";Alimentación;Restaurantes;Bancolombia;;;;;' +
        "Tarjeta débito;45000;comida, trabajo;'=1+1\r\n",
    );
  });

  it('writes the installments of a card purchase as a number', () => {
    const csv = toCsv([
      { ...row, type: 'Compra con tarjeta', description: 'TV', installments: 12 },
    ]);
    expect(csv.split('\r\n')[1]?.split(';')[9]).toBe('12');
  });

  it('writes only the header when there are no movements', () => {
    expect(toCsv([])).toBe(BOM + HEADER);
  });
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `npm test -w @finanzas/api -- src/modules/reports/export`
Expected: FAIL — Vitest no puede resolver `./rows` ni `./csv`.

- [ ] **Step 4: Crear `apps/api/src/modules/reports/export/rows.ts`**

```ts
import {
  DERIVED_METHOD_LABELS,
  deriveMethod,
  TRANSACTION_TYPE_LABELS,
  type AccountType,
  type IsoDate,
  type PaymentMethod,
  type TransactionType,
} from '@finanzas/shared';

/** Spec Fase 3 §4: columnas de la exportación, en este orden. */
export const EXPORT_COLUMNS = [
  'Fecha',
  'Tipo',
  'Descripción',
  'Categoría',
  'Subcategoría',
  'Cuenta',
  'Cuenta destino',
  'Tarjeta',
  'Préstamo',
  'Cuotas',
  'Método de pago',
  'Valor',
  'Etiquetas',
  'Notas',
] as const;

/** Spec Fase 3 §4: "Desembolso" (más corto que la etiqueta de la app). */
export const EXPORT_TYPE_LABELS: Record<TransactionType, string> = {
  ...TRANSACTION_TYPE_LABELS,
  DEBT_DISBURSEMENT: 'Desembolso',
};

/** Movimiento tal como sale de la base para exportarlo (nombres sin marca de eliminado). */
export interface ExportTransaction {
  type: TransactionType;
  date: IsoDate;
  amount: number;
  description: string | null;
  notes: string | null;
  installments: number | null;
  paymentMethod: PaymentMethod | null;
  account: { name: string; type: AccountType } | null;
  toAccount: { name: string } | null;
  creditCard: { name: string } | null;
  debt: { name: string } | null;
  category: { name: string; parent: { name: string } | null } | null;
  tags: string[];
}

/** Una fila de la exportación; los textos vacíos son ''. */
export interface ExportRow {
  date: IsoDate;
  type: string;
  description: string;
  category: string;
  subcategory: string;
  account: string;
  toAccount: string;
  card: string;
  loan: string;
  installments: number | null;
  method: string;
  amount: number;
  tags: string;
  notes: string;
}

export function toExportRow(t: ExportTransaction): ExportRow {
  const method = deriveMethod(t.type, t.paymentMethod, t.account?.type ?? null);
  return {
    date: t.date,
    type: EXPORT_TYPE_LABELS[t.type],
    description: t.description ?? '',
    category: t.category ? (t.category.parent?.name ?? t.category.name) : '',
    subcategory: t.category?.parent ? t.category.name : '',
    account: t.account?.name ?? '',
    toAccount: t.toAccount?.name ?? '',
    card: t.creditCard?.name ?? '',
    loan: t.debt?.name ?? '',
    installments: t.installments,
    method: method ? DERIVED_METHOD_LABELS[method] : '',
    amount: t.amount,
    tags: t.tags.join(', '),
    notes: t.notes ?? '',
  };
}

/**
 * Spec Fase 3 §4: un texto que empieza con `=`, `+`, `-`, `@`, tabulador o retorno de carro se
 * escribe con `'` delante, para que una hoja de cálculo nunca lo ejecute como fórmula.
 */
export function guardFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
```

- [ ] **Step 5: Crear `apps/api/src/modules/reports/export/csv.ts`**

El BOM se escribe con `String.fromCharCode(0xfeff)` y no como carácter literal, para que el archivo fuente no tenga caracteres invisibles.

```ts
import { EXPORT_COLUMNS, guardFormula, type ExportRow } from './rows';

/** Marca de orden de bytes: Excel abre el archivo como UTF-8 (tildes y emojis). */
export const BOM = String.fromCharCode(0xfeff);
const NEEDS_QUOTES = /[;"\r\n]/;

/** Un campo: protegido contra fórmulas y, si lleva `;`, `"`, CR o LF, entre comillas (RFC 4180). */
export function csvField(value: string): string {
  const text = guardFormula(value);
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvLine = (fields: string[]) => `${fields.map(csvField).join(';')}\r\n`;

/** Spec Fase 3 §4: UTF-8 con BOM, separador `;`, fin de línea CRLF y la fecha como AAAA-MM-DD. */
export function toCsv(rows: ExportRow[]): string {
  let out = BOM + csvLine([...EXPORT_COLUMNS]);
  for (const r of rows) {
    out += csvLine([
      r.date,
      r.type,
      r.description,
      r.category,
      r.subcategory,
      r.account,
      r.toAccount,
      r.card,
      r.loan,
      r.installments === null ? '' : String(r.installments),
      r.method,
      String(r.amount),
      r.tags,
      r.notes,
    ]);
  }
  return out;
}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npm test -w @finanzas/api -- src/modules/reports/export`
Expected: PASS (12 tests: 7 de filas y 5 de CSV).

- [ ] **Step 7: Test del Excel**

Create `apps/api/src/modules/reports/export/xlsx.test.ts`:

```ts
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { CategoryRefDTO } from '@finanzas/shared';
import type { ReportBody } from '../../../domain/report';
import type { ExportRow } from './rows';
import { formatGeneratedAt, toXlsx } from './xlsx';

const category = (name: string, kind: 'INCOME' | 'EXPENSE'): CategoryRefDTO => ({
  id: name,
  name,
  kind,
  parentId: null,
  icon: 'tag',
  color: '#64748b',
  isActive: true,
});

const report: ReportBody = {
  period: { preset: null, from: '2026-10-01', to: '2026-10-20', months: ['2026-10'] },
  totals: {
    income: 4_000_000,
    expense: 1_325_000,
    savings: 0,
    investment: 0,
    remaining: 2_675_000,
    savingsRate: 0,
  },
  expenseByCategory: [
    { category: category('Entretenimiento', 'EXPENSE'), amount: 1_200_000, share: 0.9057 },
    { category: category('=Peligrosa', 'EXPENSE'), amount: 125_000, share: 0.0943 },
  ],
  incomeByCategory: [{ category: category('Salario', 'INCOME'), amount: 4_000_000, share: 1 }],
  accounts: [
    {
      account: {
        id: 'bank',
        name: 'Bancolombia',
        type: 'BANK',
        icon: 'wallet',
        color: '#0f766e',
        isActive: true,
      },
      opening: 2_000_000,
      inflow: 4_000_000,
      outflow: 45_000,
      closing: 5_955_000,
    },
  ],
  cards: [],
  paymentMethods: [],
  months: [],
};

const rows: ExportRow[] = [
  {
    date: '2026-10-07',
    type: 'Gasto',
    description: 'Almuerzo; "especial"\ncon postre 🍕',
    category: 'Alimentación',
    subcategory: '',
    account: 'Bancolombia',
    toAccount: '',
    card: '',
    loan: '',
    installments: null,
    method: 'Tarjeta débito',
    amount: 45_000,
    tags: 'comida, trabajo',
    notes: '=HYPERLINK("http://x")',
  },
];

async function read(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  // exceljs tipa la entrada como ArrayBuffer: se copia el Buffer de Node a uno propio.
  await wb.xlsx.load(new Uint8Array(buffer).buffer);
  return wb;
}

/** Valores de una fila desde la columna A (sin el hueco del índice 0 de exceljs). */
const values = (ws: ExcelJS.Worksheet, n: number) => (ws.getRow(n).values as unknown[]).slice(1);

describe('toXlsx (spec Fase 3 §4)', () => {
  it('writes the four sheets with the summary, the movements and the breakdowns', async () => {
    const wb = await read(await toXlsx(report, rows, '20/10/2026 10:00'));
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Resumen',
      'Movimientos',
      'Por categoría',
      'Por cuenta',
    ]);

    const summary = wb.getWorksheet('Resumen')!;
    expect(values(summary, 1)).toEqual(['Periodo', 'Personalizado']);
    expect(values(summary, 5)).toEqual(['Ingresos', 4_000_000]);
    expect(summary.getCell('B5').numFmt).toBe('"$"#,##0');
    expect(values(summary, 10)).toEqual(['Tasa de ahorro', 0]);
    expect(summary.getCell('B10').numFmt).toBe('0.0%');
    expect(values(summary, 12)).toEqual(['Generado el', '20/10/2026 10:00']);

    const movements = wb.getWorksheet('Movimientos')!;
    expect(values(movements, 1)).toEqual([
      'Fecha',
      'Tipo',
      'Descripción',
      'Categoría',
      'Subcategoría',
      'Cuenta',
      'Cuenta destino',
      'Tarjeta',
      'Préstamo',
      'Cuotas',
      'Método de pago',
      'Valor',
      'Etiquetas',
      'Notas',
    ]);
    expect(movements.getRow(1).font?.bold).toBe(true);
    expect(movements.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(movements.autoFilter).toBe('A1:N1');
    const data = movements.getRow(2);
    expect(data.getCell(3).value).toBe('Almuerzo; "especial"\ncon postre 🍕');
    expect(data.getCell(14).value).toBe('\'=HYPERLINK("http://x")');
    expect(data.getCell(12).value).toBe(45_000);
    expect(data.getCell(12).numFmt).toBe('"$"#,##0');

    const byCategory = wb.getWorksheet('Por categoría')!;
    expect(values(byCategory, 1)).toEqual(['Gastos']);
    expect(values(byCategory, 2)).toEqual(['Categoría', 'Valor', 'Porcentaje']);
    expect(values(byCategory, 3)).toEqual(['Entretenimiento', 1_200_000, 0.9057]);
    expect(values(byCategory, 4)).toEqual(["'=Peligrosa", 125_000, 0.0943]);
    expect(byCategory.getCell('C3').numFmt).toBe('0.0%');
    expect(values(byCategory, 6)).toEqual(['Ingresos']);
    expect(values(byCategory, 8)).toEqual(['Salario', 4_000_000, 1]);

    const byAccount = wb.getWorksheet('Por cuenta')!;
    expect(values(byAccount, 1)).toEqual([
      'Cuenta',
      'Tipo',
      'Saldo inicial',
      'Entradas',
      'Salidas',
      'Saldo final',
    ]);
    expect(values(byAccount, 2)).toEqual([
      'Bancolombia',
      'Cuenta bancaria',
      2_000_000,
      4_000_000,
      45_000,
      5_955_000,
    ]);
  });

  it('writes dates as real UTC-midnight dates so no time zone moves the day (review focus 4)', async () => {
    const original = process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati'; // UTC+14: una fecha local se correría al día anterior
    try {
      const wb = await read(await toXlsx(report, rows, '20/10/2026 10:00'));
      const cell = wb.getWorksheet('Movimientos')!.getCell('A2');
      expect(cell.numFmt).toBe('dd/mm/yyyy');
      expect(cell.value).toBeInstanceOf(Date);
      expect((cell.value as Date).toISOString()).toBe('2026-10-07T00:00:00.000Z');
      const from = wb.getWorksheet('Resumen')!.getCell('B2').value as Date;
      expect(from.toISOString().slice(0, 10)).toBe('2026-10-01');
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe('formatGeneratedAt', () => {
  it('uses the Bogotá date and a 24-hour clock', () => {
    expect(formatGeneratedAt(new Date('2026-10-20T15:00:00Z'), 'America/Bogota')).toBe(
      '20/10/2026 10:00',
    );
    expect(formatGeneratedAt(new Date('2026-11-01T04:30:00Z'), 'America/Bogota')).toBe(
      '31/10/2026 23:30',
    );
    expect(formatGeneratedAt(new Date('2026-10-21T05:05:00Z'), 'America/Bogota')).toBe(
      '21/10/2026 00:05',
    );
  });
});
```

- [ ] **Step 8: Correr el test y verificar que falla**

Run: `npm test -w @finanzas/api -- src/modules/reports/export/xlsx.test.ts`
Expected: FAIL — Vitest no puede resolver `./xlsx`.

- [ ] **Step 9: Crear `apps/api/src/modules/reports/export/xlsx.ts`**

```ts
import ExcelJS from 'exceljs';
import { ACCOUNT_TYPE_LABELS, REPORT_PRESET_LABELS, type IsoDate } from '@finanzas/shared';
import type { ReportBody } from '../../../domain/report';
import { toDbDate } from '../../../lib/db';
import { EXPORT_COLUMNS, guardFormula, type ExportRow } from './rows';

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MONEY = '"$"#,##0';
const DATE = 'dd/mm/yyyy';
/** Se ve como `0,0 %` en un Excel en español (el código de formato siempre usa punto). */
const PERCENT = '0.0%';
const COLUMN_WIDTHS = [12, 18, 32, 20, 20, 20, 20, 18, 18, 8, 18, 14, 24, 32];

/** Fecha calendario como fecha real a medianoche UTC: no se corre de día en ninguna zona. */
const dateCell = (iso: IsoDate) => toDbDate(iso);
/** Texto del usuario: vacío → celda vacía; si no, protegido contra fórmulas. */
const text = (value: string) => (value === '' ? null : guardFormula(value));

/** "Generado el" en la zona del usuario: `dd/mm/aaaa hh:mm` (24 h). */
export function formatGeneratedAt(now: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

/** Spec Fase 3 §4: Resumen, Movimientos, Por categoría y Por cuenta. */
export async function toXlsx(
  report: ReportBody,
  rows: ExportRow[],
  generatedAt: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Finanzas';

  const summary = wb.addWorksheet('Resumen');
  summary.columns = [{ width: 18 }, { width: 22 }];
  const { period, totals } = report;
  summary.addRow([
    'Periodo',
    period.preset ? REPORT_PRESET_LABELS[period.preset] : 'Personalizado',
  ]);
  summary.addRow(['Desde', dateCell(period.from)]).getCell(2).numFmt = DATE;
  summary.addRow(['Hasta', dateCell(period.to)]).getCell(2).numFmt = DATE;
  summary.addRow([]);
  const money: Array<[string, number]> = [
    ['Ingresos', totals.income],
    ['Gastos', totals.expense],
    ['Ahorro', totals.savings],
    ['Inversión', totals.investment],
    ['Restante', totals.remaining],
  ];
  for (const [label, value] of money) summary.addRow([label, value]).getCell(2).numFmt = MONEY;
  summary.addRow(['Tasa de ahorro', totals.savingsRate]).getCell(2).numFmt = PERCENT;
  summary.addRow([]);
  summary.addRow(['Generado el', generatedAt]);
  summary.getColumn(1).font = { bold: true };

  const movements = wb.addWorksheet('Movimientos');
  movements.columns = EXPORT_COLUMNS.map((header, i) => ({ header, width: COLUMN_WIDTHS[i] }));
  movements.getRow(1).font = { bold: true };
  movements.views = [{ state: 'frozen', ySplit: 1 }];
  movements.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: EXPORT_COLUMNS.length },
  };
  for (const r of rows) {
    const row = movements.addRow([
      dateCell(r.date),
      text(r.type),
      text(r.description),
      text(r.category),
      text(r.subcategory),
      text(r.account),
      text(r.toAccount),
      text(r.card),
      text(r.loan),
      r.installments,
      text(r.method),
      r.amount,
      text(r.tags),
      text(r.notes),
    ]);
    row.getCell(1).numFmt = DATE;
    row.getCell(12).numFmt = MONEY;
  }

  const byCategory = wb.addWorksheet('Por categoría');
  byCategory.columns = [{ width: 28 }, { width: 16 }, { width: 12 }];
  const block = (title: string, items: ReportBody['expenseByCategory']) => {
    byCategory.addRow([title]).font = { bold: true };
    byCategory.addRow(['Categoría', 'Valor', 'Porcentaje']).font = { bold: true };
    for (const item of items) {
      const row = byCategory.addRow([text(item.category.name), item.amount, item.share]);
      row.getCell(2).numFmt = MONEY;
      row.getCell(3).numFmt = PERCENT;
    }
  };
  block('Gastos', report.expenseByCategory);
  byCategory.addRow([]);
  block('Ingresos', report.incomeByCategory);

  const byAccount = wb.addWorksheet('Por cuenta');
  byAccount.columns = ['Cuenta', 'Tipo', 'Saldo inicial', 'Entradas', 'Salidas', 'Saldo final'].map(
    (header, i) => ({ header, width: i < 2 ? 24 : 16 }),
  );
  byAccount.getRow(1).font = { bold: true };
  for (const a of report.accounts) {
    const row = byAccount.addRow([
      text(a.account.name),
      ACCOUNT_TYPE_LABELS[a.account.type],
      a.opening,
      a.inflow,
      a.outflow,
      a.closing,
    ]);
    for (const col of [3, 4, 5, 6]) row.getCell(col).numFmt = MONEY;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
```

- [ ] **Step 10: Correr el test y verificar que pasa**

Run: `npm test -w @finanzas/api -- src/modules/reports/export/xlsx.test.ts`
Expected: PASS (3 tests). Si `dateCell` usara la medianoche local (`new Date(iso + 'T00:00:00')`), el test de la zona horaria fallaría con `2026-10-06T10:00:00.000Z`: así se comprobó que el test protege el Review Focus 4.

- [ ] **Step 11: `EXPORT_MAX_ROWS` en la configuración (test primero)**

En `apps/api/src/config/env.test.ts`, en el test `'applies defaults and derives the origin'`, reemplazar:

```ts
      smtp: null,
      cookieSecure: false,
    });
  });
```

por:

```ts
      smtp: null,
      cookieSecure: false,
      exportMaxRows: 20_000,
    });
    expect(loadConfig({ ...base, EXPORT_MAX_ROWS: '500' }).exportMaxRows).toBe(500);
    expect(() => loadConfig({ ...base, EXPORT_MAX_ROWS: '0' })).toThrow(/EXPORT_MAX_ROWS/);
  });
```

Run: `npm test -w @finanzas/api -- src/config/env.test.ts`
Expected: FAIL — falta `exportMaxRows` en la configuración.

- [ ] **Step 12: Implementar `EXPORT_MAX_ROWS` en `apps/api/src/config/env.ts`**

En `envSchema`, después de `LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),` agregar:

```ts
  EXPORT_MAX_ROWS: z.coerce.number().int().min(1).default(20_000),
```

En `interface AppConfig`, después de `loginMaxAttempts: number;` agregar:

```ts
  /** Spec Fase 3 §4: máximo de movimientos por exportación. */
  exportMaxRows: number;
```

En el objeto que devuelve `loadConfig`, después de `loginMaxAttempts: e.LOGIN_MAX_ATTEMPTS,` agregar:

```ts
    exportMaxRows: e.EXPORT_MAX_ROWS,
```

Run: `npm test -w @finanzas/api -- src/config/env.test.ts`
Expected: PASS.

- [ ] **Step 13: Test de integración de la exportación**

Create `apps/api/test/reports-export.test.ts`. Valores a mano: en octubre el gasto es 1.200.000 + 45.000 + 30.000 + 50.000 = 1.325.000 y el restante 2.675.000; el Banco abre en 2.000.000, entra 4.000.000 + 1.000.000 y sale 300.000 + 45.000 + 400.000 + 50.000 = 795.000; Efectivo abre en 100.000 − 70.000 (septiembre) = 30.000; las proporciones son 1.200.000 ÷ 1.325.000 = 0,9057, 75.000 ÷ 1.325.000 = 0,0566 y 50.000 ÷ 1.325.000 = 0,0377.

```ts
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ReportDTO } from '@finanzas/shared';
import { setupFinances } from './finance-fixtures';
import { createTestApp, registerUser, SESSION_COOKIE } from './helpers';

let app: FastifyInstance;
const NOW = () => new Date('2026-10-20T15:00:00Z');
const BOM = String.fromCharCode(0xfeff);
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: NOW }));
});

afterAll(async () => {
  await app.close();
});

const download = (target: FastifyInstance, cookie: string, query: string) =>
  target.inject({
    method: 'GET',
    url: `/api/reports/export?${query}`,
    cookies: { [SESSION_COOKIE]: cookie },
  });

/** Lector RFC 4180 con `;` (solo para leer de vuelta lo exportado). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += ch;
  }
  if (field !== '' || row.length > 0) rows.push([...row, field]);
  return rows;
}

async function withTimeZone<T>(timeZone: string, run: () => Promise<T>): Promise<T> {
  const original = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return await run();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

async function readXlsx(payload: Buffer) {
  const wb = new ExcelJS.Workbook();
  // exceljs tipa la entrada como ArrayBuffer: se copia el Buffer de Node a uno propio.
  await wb.xlsx.load(new Uint8Array(payload).buffer);
  return wb;
}

const values = (ws: ExcelJS.Worksheet, n: number) => (ws.getRow(n).values as unknown[]).slice(1);

/** Movimientos de octubre con textos difíciles (y uno de septiembre que no se exporta). */
async function userWithMovements() {
  const { api, cookie } = await registerUser(app);
  const f = await setupFinances(api);
  const restaurants = (
    await api.post('/api/categories', {
      name: 'Restaurantes',
      kind: 'EXPENSE',
      parentId: f.cat.food,
    })
  ).body.category.id as string;
  await api.post('/api/transactions', {
    type: 'EXPENSE',
    amount: 70_000,
    date: '2026-09-30',
    accountId: f.cash,
    categoryId: f.cat.food,
  });
  await api.post('/api/transactions', {
    type: 'INCOME',
    amount: 4_000_000,
    date: '2026-10-01',
    accountId: f.bank,
    categoryId: f.cat.salary,
    description: '+bono',
    notes: '@nota',
  });
  await api.post(`/api/credit-cards/${f.card}/purchase`, {
    amount: 1_200_000,
    date: '2026-10-03',
    categoryId: f.cat.fun,
    installments: 12,
    description: '-descuento',
  });
  await api.post('/api/transfers', {
    amount: 300_000,
    date: '2026-10-04',
    accountId: f.bank,
    toAccountId: f.wallet,
    description: 'Paso a Nequi',
  });
  await api.post('/api/transactions', {
    type: 'EXPENSE',
    amount: 45_000,
    date: '2026-10-07',
    accountId: f.bank,
    categoryId: f.cat.food,
    paymentMethod: 'DEBIT_CARD',
    description: 'Almuerzo; "especial"\ncon postre 🍕',
    notes: '=HYPERLINK("http://x")',
    tags: ['trabajo', 'comida'],
  });
  await api.post('/api/transactions', {
    type: 'EXPENSE',
    amount: 30_000,
    date: '2026-10-08',
    accountId: f.cash,
    categoryId: restaurants,
    description: 'Cena',
  });
  await api.post(`/api/debts/${f.debt}/payments`, {
    accountId: f.bank,
    principal: 400_000,
    interest: 50_000,
    date: '2026-10-10',
  });
  await api.post(`/api/debts/${f.debt}/disbursements`, {
    accountId: f.bank,
    amount: 1_000_000,
    date: '2026-10-12',
  });
  return { api, cookie, f };
}

const HEADER = [
  'Fecha',
  'Tipo',
  'Descripción',
  'Categoría',
  'Subcategoría',
  'Cuenta',
  'Cuenta destino',
  'Tarjeta',
  'Préstamo',
  'Cuotas',
  'Método de pago',
  'Valor',
  'Etiquetas',
  'Notas',
];

describe('GET /api/reports/export — CSV (spec Fase 3 §4)', () => {
  it('reads back exactly, with BOM, ; CRLF, quotes, emojis and neutralized formulas (review focus 3)', async () => {
    const { cookie } = await userWithMovements();
    const res = await download(app, cookie, 'preset=THIS_MONTH&format=csv');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="finanzas-movimientos-2026-10-01_2026-10-20.csv"',
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect([...res.rawPayload.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(res.body).toContain('"Almuerzo; ""especial""\ncon postre 🍕"');
    expect(res.body.endsWith('\r\n')).toBe(true);

    expect(parseCsv(res.body.slice(1))).toEqual([
      HEADER,
      [
        '2026-10-01',
        'Ingreso',
        "'+bono",
        'Salario',
        '',
        'Bancolombia',
        '',
        '',
        '',
        '',
        '',
        '4000000',
        '',
        "'@nota",
      ],
      [
        '2026-10-03',
        'Compra con tarjeta',
        "'-descuento",
        'Entretenimiento',
        '',
        '',
        '',
        'Nu Crédito',
        '',
        '12',
        'Tarjeta crédito',
        '1200000',
        '',
        '',
      ],
      [
        '2026-10-04',
        'Transferencia',
        'Paso a Nequi',
        '',
        '',
        'Bancolombia',
        'Nequi',
        '',
        '',
        '',
        '',
        '300000',
        '',
        '',
      ],
      [
        '2026-10-07',
        'Gasto',
        'Almuerzo; "especial"\ncon postre 🍕',
        'Alimentación',
        '',
        'Bancolombia',
        '',
        '',
        '',
        '',
        'Tarjeta débito',
        '45000',
        'comida, trabajo',
        '\'=HYPERLINK("http://x")',
      ],
      [
        '2026-10-08',
        'Gasto',
        'Cena',
        'Alimentación',
        'Restaurantes',
        'Efectivo',
        '',
        '',
        '',
        '',
        'Efectivo',
        '30000',
        '',
        '',
      ],
      [
        '2026-10-10',
        'Pago de préstamo',
        '',
        '',
        '',
        'Bancolombia',
        '',
        '',
        'Libre inversión',
        '',
        '',
        '400000',
        '',
        '',
      ],
      [
        '2026-10-10',
        'Gasto',
        'Intereses Libre inversión',
        'Intereses y comisiones',
        '',
        'Bancolombia',
        '',
        '',
        '',
        '',
        'Cuenta bancaria',
        '50000',
        '',
        '',
      ],
      [
        '2026-10-12',
        'Desembolso',
        '',
        '',
        '',
        'Bancolombia',
        '',
        '',
        'Libre inversión',
        '',
        '',
        '1000000',
        '',
        '',
      ],
    ]);
  });

  it('validates the format and the period', async () => {
    const { cookie } = await registerUser(app);
    const missing = await download(app, cookie, 'preset=THIS_MONTH');
    expect(missing.statusCode).toBe(400);
    expect(Object.keys(missing.json().error.fields)).toEqual(['format']);
    expect((await download(app, cookie, 'preset=THIS_MONTH&format=pdf')).statusCode).toBe(400);
    const future = await download(app, cookie, 'from=2026-10-01&to=2026-10-21&format=csv');
    expect(future.statusCode).toBe(400);
    expect(future.json().error.fields).toEqual({ to: 'La fecha final no puede ser futura' });
  });
});

describe('GET /api/reports/export — Excel (spec Fase 3 §4)', () => {
  it('has four sheets whose totals match /api/reports, with real dates and money formats', async () => {
    const { api, cookie } = await userWithMovements();
    const report = (await api.get<ReportDTO>('/api/reports?preset=THIS_MONTH')).body;
    // UTC+14: una fecha creada a medianoche local se correría de día (review focus 4).
    const res = await withTimeZone('Pacific/Kiritimati', () =>
      download(app, cookie, 'preset=THIS_MONTH&format=xlsx'),
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe(XLSX);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="finanzas-reporte-2026-10-01_2026-10-20.xlsx"',
    );
    expect(res.headers['cache-control']).toBe('no-store');

    const wb = await readXlsx(res.rawPayload);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Resumen',
      'Movimientos',
      'Por categoría',
      'Por cuenta',
    ]);

    const summary = wb.getWorksheet('Resumen')!;
    expect(values(summary, 1)).toEqual(['Periodo', 'Este mes']);
    expect((summary.getCell('B2').value as Date).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect((summary.getCell('B3').value as Date).toISOString()).toBe('2026-10-20T00:00:00.000Z');
    expect([5, 6, 7, 8, 9, 10].map((n) => values(summary, n))).toEqual([
      ['Ingresos', report.totals.income],
      ['Gastos', report.totals.expense],
      ['Ahorro', report.totals.savings],
      ['Inversión', report.totals.investment],
      ['Restante', report.totals.remaining],
      ['Tasa de ahorro', report.totals.savingsRate],
    ]);
    expect(report.totals).toMatchObject({
      income: 4_000_000,
      expense: 1_325_000,
      remaining: 2_675_000,
    });
    expect(values(summary, 12)).toEqual(['Generado el', '20/10/2026 10:00']);

    const movements = wb.getWorksheet('Movimientos')!;
    expect(values(movements, 1)).toEqual(HEADER);
    expect(movements.rowCount).toBe(9);
    expect(movements.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(movements.autoFilter).toBe('A1:N1');
    const first = movements.getRow(2);
    expect(first.getCell(1).numFmt).toBe('dd/mm/yyyy');
    expect((first.getCell(1).value as Date).toISOString().slice(0, 10)).toBe('2026-10-01');
    expect((first.getCell(1).value as Date).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(first.getCell(3).value).toBe("'+bono");
    expect(first.getCell(12).value).toBe(4_000_000);
    expect(first.getCell(12).numFmt).toBe('"$"#,##0');
    expect(movements.getRow(3).getCell(10).value).toBe(12);
    const lunch = movements.getRow(5);
    expect(lunch.getCell(3).value).toBe('Almuerzo; "especial"\ncon postre 🍕');
    expect(lunch.getCell(14).value).toBe('\'=HYPERLINK("http://x")');

    const byCategory = wb.getWorksheet('Por categoría')!;
    const expenseRows = report.expenseByCategory.map((c) => [c.category.name, c.amount, c.share]);
    expect(expenseRows).toEqual([
      ['Entretenimiento', 1_200_000, 0.9057],
      ['Alimentación', 75_000, 0.0566],
      ['Intereses y comisiones', 50_000, 0.0377],
    ]);
    expect([3, 4, 5].map((n) => values(byCategory, n))).toEqual(expenseRows);
    expect(values(byCategory, 7)).toEqual(['Ingresos']);
    expect(values(byCategory, 9)).toEqual(['Salario', 4_000_000, 1]);

    const byAccount = wb.getWorksheet('Por cuenta')!;
    expect([2, 3, 4].map((n) => values(byAccount, n))).toEqual([
      ['Bancolombia', 'Cuenta bancaria', 2_000_000, 5_000_000, 795_000, 6_205_000],
      ['Nequi', 'Billetera digital', 0, 300_000, 0, 300_000],
      ['Efectivo', 'Efectivo', 30_000, 0, 30_000, 0],
    ]);
    expect(report.accounts.map((a) => a.closing)).toEqual([6_205_000, 300_000, 0]);
  });
});

describe('GET /api/reports/export — limits and isolation (spec Fase 3 §4)', () => {
  it('answers 400 EXPORT_TOO_LARGE above EXPORT_MAX_ROWS, counting before building', async () => {
    const { app: small } = await createTestApp({ EXPORT_MAX_ROWS: '3' }, { now: NOW });
    try {
      const { api, cookie } = await registerUser(small);
      const f = await setupFinances(api);
      const ids: string[] = [];
      for (const day of ['01', '02', '03', '04']) {
        const res = await api.post('/api/transactions', {
          type: 'EXPENSE',
          amount: 10_000,
          date: `2026-10-${day}`,
          accountId: f.bank,
          categoryId: f.cat.food,
        });
        ids.push(res.body.transaction.id);
      }
      for (const format of ['csv', 'xlsx']) {
        const res = await download(small, cookie, `preset=THIS_MONTH&format=${format}`);
        expect(res.statusCode, format).toBe(400);
        expect(res.json().error).toEqual({
          code: 'EXPORT_TOO_LARGE',
          message: 'Elige un periodo más corto.',
        });
      }
      await api.del(`/api/transactions/${ids[0]}`);
      expect((await download(small, cookie, 'preset=THIS_MONTH&format=csv')).statusCode).toBe(200);
    } finally {
      await small.close();
    }
  });

  it('allows 10 exports per minute per user and answers 429 to the 11th', async () => {
    const a = await registerUser(app);
    for (let i = 1; i <= 10; i++) {
      expect(
        (await download(app, a.cookie, 'preset=THIS_MONTH&format=csv')).statusCode,
        `#${i}`,
      ).toBe(200);
    }
    const eleventh = await download(app, a.cookie, 'preset=THIS_MONTH&format=csv');
    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json().error.code).toBe('RATE_LIMITED');
    // La clave es el usuario: otra persona puede exportar en el mismo minuto.
    const b = await registerUser(app);
    expect((await download(app, b.cookie, 'preset=THIS_MONTH&format=csv')).statusCode).toBe(200);
    // El límite es solo para exportar.
    expect((await a.api.get('/api/reports?preset=THIS_MONTH')).status).toBe(200);
  });

  it("never exports another user's movements", async () => {
    await userWithMovements();
    const b = await registerUser(app);
    const csv = await download(app, b.cookie, 'preset=THIS_MONTH&format=csv');
    expect(csv.body).toBe(`${BOM}${HEADER.join(';')}\r\n`);
    const wb = await readXlsx(
      (await download(app, b.cookie, 'preset=THIS_MONTH&format=xlsx')).rawPayload,
    );
    expect(wb.getWorksheet('Movimientos')!.rowCount).toBe(1);
    expect(wb.getWorksheet('Por cuenta')!.rowCount).toBe(1);
    expect(values(wb.getWorksheet('Resumen')!, 5)).toEqual(['Ingresos', 0]);
  });

  it('requires a session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/export?preset=THIS_MONTH&format=csv',
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 14: Correr el test y verificar que falla**

Run: `npm test -w @finanzas/api -- test/reports-export.test.ts`
Expected: FAIL — la ruta no existe (404 `NOT_FOUND` "Ruta no encontrada." donde se espera 200).

- [ ] **Step 15: `exportReport` en `apps/api/src/modules/reports/service.ts`**

En el import de `@finanzas/shared`, agregar `type ExportFormat,` después de `resolveReportPeriod,`. Después de `import { budgetVsSpend } from '../budgets/service';` agregar:

```ts
import { toCsv } from './export/csv';
import { toExportRow, type ExportTransaction } from './export/rows';
import { formatGeneratedAt, toXlsx, XLSX_CONTENT_TYPE } from './export/xlsx';
```

Al final del archivo, agregar:

```ts

const exportSelect = {
  type: true,
  date: true,
  amount: true,
  description: true,
  notes: true,
  installments: true,
  paymentMethod: true,
  account: { select: { name: true, type: true } },
  toAccount: { select: { name: true } },
  creditCard: { select: { name: true } },
  debt: { select: { name: true } },
  category: { select: { name: true, parent: { select: { name: true } } } },
  tags: { select: { tag: { select: { name: true } } } },
} satisfies Prisma.TransactionSelect;

/**
 * Spec Fase 3 §4: todos los movimientos del periodo (los intereses como fila propia), por fecha y
 * `createdAt`; en un empate, el pago va antes que sus intereses.
 */
export async function loadExportTransactions(
  db: DbClient,
  userId: string,
  period: ReportPeriod,
): Promise<ExportTransaction[]> {
  const rows = await db.transaction.findMany({
    where: periodWhere(userId, period),
    orderBy: [
      { date: 'asc' },
      { createdAt: 'asc' },
      { parentId: { sort: 'asc', nulls: 'first' } },
      { id: 'asc' },
    ],
    select: exportSelect,
  });
  return rows.map((r) => ({
    ...r,
    date: fromDbDate(r.date),
    amount: num(r.amount),
    tags: r.tags.map((t) => t.tag.name).sort(),
  }));
}

export interface ExportFile {
  filename: string;
  contentType: string;
  body: string | Buffer;
}

/**
 * `GET /api/reports/export` (spec Fase 3 §4): cuenta los movimientos antes de armar nada
 * (400 `EXPORT_TOO_LARGE`) y lee todo en la misma transacción de solo lectura que el reporte.
 */
export async function exportReport(
  db: PrismaClient,
  auth: AuthContext,
  input: ReportPeriodInput,
  format: ExportFormat,
  options: { maxRows: number; now: Date },
): Promise<ExportFile> {
  const period = resolvePeriodOrThrow(input, auth.today);
  const { report, rows } = await inReportTransaction(db, async (tx) => {
    const count = await tx.transaction.count({ where: periodWhere(auth.userId, period) });
    if (count > options.maxRows) {
      throw badRequest('EXPORT_TOO_LARGE', 'Elige un periodo más corto.');
    }
    return {
      report: format === 'xlsx' ? buildReport(await loadReportData(tx, auth, period)) : null,
      rows: (await loadExportTransactions(tx, auth.userId, period)).map(toExportRow),
    };
  });
  const range = `${period.from}_${period.to}`;
  if (!report) {
    return {
      filename: `finanzas-movimientos-${range}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: toCsv(rows),
    };
  }
  return {
    filename: `finanzas-reporte-${range}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
    body: await toXlsx(report, rows, formatGeneratedAt(options.now, auth.timezone)),
  };
}
```

- [ ] **Step 16: Ruta de exportación en `apps/api/src/modules/reports/routes.ts`**

El archivo queda:

```ts
import { periodInputOf, reportExportQuerySchema, reportQuerySchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse } from '../../lib/validation';
import { exportReport, loadReport } from './service';

export async function reportRoutes(app: FastifyInstance) {
  app.get('/reports', async (req) =>
    loadReport(app.prisma, req.auth, periodInputOf(parse(reportQuerySchema, req.query))),
  );

  app.get(
    '/reports/export',
    {
      config: {
        // Spec Fase 3 §4: 10 exportaciones por minuto por usuario. Corre en preHandler, después de
        // `authenticate` (hook del grupo /api), para usar el usuario de la sesión como clave.
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (req) => req.auth.userId,
        },
      },
    },
    async (req, reply) => {
      const query = parse(reportExportQuerySchema, req.query);
      const file = await exportReport(app.prisma, req.auth, periodInputOf(query), query.format, {
        maxRows: app.config.exportMaxRows,
        now: app.now(),
      });
      return reply
        .header('Content-Type', file.contentType)
        .header('Content-Disposition', `attachment; filename="${file.filename}"`)
        .header('Cache-Control', 'no-store')
        .send(file.body);
    },
  );
}
```

- [ ] **Step 17: Correr los tests y verificar que pasan**

Run: `npm test -w @finanzas/api -- test/reports-export.test.ts test/reports.test.ts src/modules/reports`
Expected: PASS (7 tests de exportación, 7 de reportes y 15 unitarios de `export/`).

- [ ] **Step 18: Variables de entorno de despliegue**

En `.env.example` (raíz), después de `LOG_LEVEL=info`, agregar:

```bash
# Máximo de movimientos por exportación CSV o Excel (400 "Elige un periodo más corto" si se supera)
EXPORT_MAX_ROWS=20000
```

En `apps/api/.env.example`, al final, agregar `EXPORT_MAX_ROWS=20000`.

En `docker-compose.yml`, en `environment` del servicio `api`, después de `LOG_LEVEL: ${LOG_LEVEL:-info}`, agregar:

```yaml
      EXPORT_MAX_ROWS: ${EXPORT_MAX_ROWS:-20000}
```

- [ ] **Step 19: Verificar**

Run:

```bash
npm run typecheck
npx prettier --write apps/api/src/modules/reports apps/api/src/config apps/api/test/reports-export.test.ts
npm run lint
npm run format:check
npm run build -w @finanzas/api
grep -c 'from "exceljs"' apps/api/dist/server.js
```

Expected: todo en verde; el build termina y el `grep` cuenta 1 (exceljs queda como import externo, no empaquetado).

- [ ] **Step 20: Commit**

```bash
git add apps/api/src/modules/reports apps/api/src/config apps/api/test/reports-export.test.ts apps/api/package.json package-lock.json .env.example apps/api/.env.example docker-compose.yml
git commit -m "feat: agrega la exportación de movimientos en CSV y Excel con límites por usuario"
```

---

### Task 6: Metas sin saldo negativo

**Files:**
- Create: `apps/api/src/modules/goals/guard.ts`
- Modify: `apps/api/src/modules/transactions/service.ts` (`createTransaction`, `updateTransaction`, `deleteTransaction`)
- Modify: `apps/api/src/modules/goals/service.ts` (`updateGoal`, `withdrawFromGoal`)
- Modify: `apps/api/test/goals.test.ts`

Dónde pasa cada escritura (leído del código): abonar y retirar → `contributeToGoal` y `withdrawFromGoal` → `createTransaction`; editar desde Movimientos → `updateTransaction`; eliminar desde Movimientos → `deleteTransaction` (hoy un `$transaction([...])` por lotes); cambiar la cuenta → `updateGoal`. El avance es `inicial + abonos − retiros`, donde un abono es una transferencia con `goalId` que entra a la cuenta de la meta (`flowsOf` en `goals/service.ts`).

**Interfaces:**
- Consumes: `badRequest`, `conflict`, `AppError` (`lib/errors`); `num` (`lib/db`); `DbClient` (`lib/prisma`); `Prisma.TransactionClient`.
- Produces:

```ts
// modules/goals/guard.ts
export interface LockedGoal { accountId: string; progress: number }
export async function lockGoals(
  tx: Prisma.TransactionClient,
  userId: string,
  goalIds: Array<string | null | undefined>,
): Promise<Map<string, LockedGoal>>; // SELECT id FROM "Goal" WHERE id = …::uuid AND "userId" = …::uuid FOR UPDATE
export async function assertGoalsNotNegative(
  tx: Prisma.TransactionClient,
  userId: string,
  locked: Map<string, LockedGoal>,
  error: () => AppError,
): Promise<void>;
export function assertGoalAccount(
  locked: Map<string, LockedGoal>,
  goalId: string,
  accountId: string,
  toAccountId: string,
): void; // 400 INVALID_REFERENCE en fields.goalId
export const withdrawalExceedsGoal: () => AppError; // 400 WITHDRAWAL_EXCEEDS_GOAL, fields.amount
export const goalProgressNegative: () => AppError; // 409 GOAL_PROGRESS_NEGATIVE
```

Las firmas de `createTransaction`, `updateTransaction`, `deleteTransaction`, `updateGoal` y `withdrawFromGoal` no cambian.

- [ ] **Step 1: Escribir los tests que fallan**

En `apps/api/test/goals.test.ts`, cambiar el import de `./helpers` por:

```ts
import { createTestApp, registerUser, type Client } from './helpers';
```

y agregar al final del archivo (la meta de `newUser()` vive en "Bolsillo ahorro" y empieza con 1.000.000):

```ts

describe('goals never go below zero (spec Fase 3 §8.2)', () => {
  const NEGATIVE = {
    code: 'WITHDRAWAL_EXCEEDS_GOAL',
    message: 'Revisa los datos ingresados.',
    fields: { amount: 'No puedes retirar más de lo ahorrado en esta meta' },
  };
  const progressOf = async (api: Client, id: string) =>
    (await api.get(`/api/goals/${id}`)).body.goal.progress as number;

  it('two simultaneous withdrawals cannot take more than the goal holds', async () => {
    const { api, f, goal } = await newUser(); // avance 1.000.000
    const body = { toAccountId: f.bank, amount: 600_000, date: TODAY };
    const results = await Promise.all([
      api.post(`/api/goals/${goal.id}/withdrawals`, body),
      api.post(`/api/goals/${goal.id}/withdrawals`, body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(results.find((r) => r.status === 400)!.body.error).toEqual(NEGATIVE);
    expect(await progressOf(api, goal.id)).toBe(400_000);
  });

  it('a contribution waits for a concurrent account change and never lands in the old account', async () => {
    const { api, f, goal } = await newUser();
    const other = (await api.post('/api/accounts', { name: 'CDT', type: 'INVESTMENT' })).body
      .account.id as string;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    // Simula un cambio de cuenta en curso: tiene la meta bloqueada mientras llega el abono.
    const mover = app.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Goal" WHERE id = ${goal.id}::uuid FOR UPDATE`;
      await tx.goal.update({ where: { id: goal.id }, data: { accountId: other } });
      await held;
    });
    const contribution = api.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: f.bank,
      amount: 100_000,
      date: TODAY,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await mover;
    const res = await contribution;
    expect([201, 400]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.error.fields).toEqual({
        goalId: 'La transferencia debe entrar o salir de la cuenta de la meta',
      });
    }
    const linked = await app.prisma.transaction.findMany({
      where: { goalId: goal.id },
      select: { accountId: true, toAccountId: true },
    });
    for (const t of linked) expect([t.accountId, t.toAccountId]).toContain(other);
  });

  it('editing a withdrawal above what the goal holds answers 400 on "amount"', async () => {
    const { api, f, goal } = await newUser(); // avance 1.000.000
    const out = (
      await api.post(`/api/goals/${goal.id}/withdrawals`, {
        toAccountId: f.bank,
        amount: 300_000,
        date: TODAY,
      })
    ).body.transaction;
    const edit = (amount: number) =>
      api.put(`/api/transactions/${out.id}`, {
        type: 'TRANSFER',
        amount,
        date: TODAY,
        accountId: f.savings,
        toAccountId: f.bank,
        goalId: goal.id,
        description: out.description,
      });
    const over = await edit(1_000_001);
    expect(over.status).toBe(400);
    expect(over.body.error).toEqual(NEGATIVE);
    expect(await progressOf(api, goal.id)).toBe(700_000);
    const exact = await edit(1_000_000);
    expect(exact.status).toBe(200);
    expect(await progressOf(api, goal.id)).toBe(0);
  });

  it('editing a contribution down cannot leave the goal negative', async () => {
    const { api, f, goal } = await newUser(); // avance 1.000.000
    const add = (
      await api.post(`/api/goals/${goal.id}/contributions`, {
        fromAccountId: f.bank,
        amount: 500_000,
        date: TODAY,
      })
    ).body.transaction;
    await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 1_400_000,
      date: TODAY,
    }); // avance 100.000
    const edit = (amount: number) =>
      api.put(`/api/transactions/${add.id}`, {
        type: 'TRANSFER',
        amount,
        date: TODAY,
        accountId: f.bank,
        toAccountId: f.savings,
        goalId: goal.id,
        description: add.description,
      });
    const under = await edit(300_000);
    expect(under.status).toBe(400);
    expect(under.body.error).toEqual(NEGATIVE);
    expect((await edit(400_000)).status).toBe(200);
    expect(await progressOf(api, goal.id)).toBe(0);
  });

  it('deleting a contribution that leaves the goal negative answers 409', async () => {
    const { api, f, goal } = await newUser(); // avance 1.000.000
    const add = (
      await api.post(`/api/goals/${goal.id}/contributions`, {
        fromAccountId: f.bank,
        amount: 500_000,
        date: TODAY,
      })
    ).body.transaction;
    const out = (
      await api.post(`/api/goals/${goal.id}/withdrawals`, {
        toAccountId: f.bank,
        amount: 1_400_000,
        date: TODAY,
      })
    ).body.transaction; // avance 100.000

    const blocked = await api.del(`/api/transactions/${add.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toEqual({
      code: 'GOAL_PROGRESS_NEGATIVE',
      message: 'Esta meta quedaría con saldo negativo; ajusta primero sus retiros.',
    });
    expect((await api.get(`/api/transactions/${add.id}`)).status).toBe(200);
    expect(await progressOf(api, goal.id)).toBe(100_000);

    // Primero el retiro y después el abono: ambos se pueden eliminar.
    expect((await api.del(`/api/transactions/${out.id}`)).status).toBe(204);
    expect(await progressOf(api, goal.id)).toBe(1_500_000);
    expect((await api.del(`/api/transactions/${add.id}`)).status).toBe(204);
    expect(await progressOf(api, goal.id)).toBe(1_000_000);
  });

  it('lowering the initial amount below the withdrawals answers 400 on "initialAmount"', async () => {
    const { api, f, goal } = await newUser(); // inicial 1.000.000
    await api.post(`/api/goals/${goal.id}/withdrawals`, {
      toAccountId: f.bank,
      amount: 300_000,
      date: TODAY,
    }); // avance 700.000
    const low = await api.put(`/api/goals/${goal.id}`, { initialAmount: 200_000 });
    expect(low.status).toBe(400);
    expect(low.body.error).toEqual({
      code: 'WITHDRAWAL_EXCEEDS_GOAL',
      message: 'Revisa los datos ingresados.',
      fields: { initialAmount: 'La meta quedaría con saldo negativo' },
    });
    const ok = await api.put(`/api/goals/${goal.id}`, { initialAmount: 300_000 });
    expect(ok.status).toBe(200);
    expect(ok.body.goal.progress).toBe(0);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test -w @finanzas/api -- test/goals.test.ts`
Expected: FAIL — los retiros simultáneos responden `[201, 201]` (normalmente) y el avance queda en −200.000; editar el retiro y el abono responde 200; eliminar el abono responde 204; bajar el saldo inicial responde 200; y en el cambio de cuenta el abono queda en la cuenta vieja. Los tests anteriores del archivo siguen pasando.

- [ ] **Step 3: Crear `apps/api/src/modules/goals/guard.ts`**

```ts
import type { Prisma } from '../../generated/prisma/client';
import { num } from '../../lib/db';
import { badRequest, conflict, type AppError } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';

export interface LockedGoal {
  accountId: string;
  /** Avance al bloquearla (inicial + abonos − retiros). */
  progress: number;
}

/** Spec 8.10: abono = transferencia con `goalId` que entra a la cuenta de la meta; retiro = la que sale. */
async function goalNow(db: DbClient, userId: string, id: string): Promise<LockedGoal | null> {
  const goal = await db.goal.findUnique({
    where: { id_userId: { id, userId } },
    select: { accountId: true, initialAmount: true },
  });
  if (!goal) return null;
  const rows = await db.transaction.groupBy({
    by: ['toAccountId'],
    where: { userId, type: 'TRANSFER', goalId: id },
    _sum: { amount: true },
  });
  const progress = rows.reduce(
    (p, r) => p + (r.toAccountId === goal.accountId ? 1 : -1) * num(r._sum.amount),
    num(goal.initialAmount),
  );
  return { accountId: goal.accountId, progress };
}

/**
 * Spec Fase 3 §8.2: bloquea las metas (`SELECT … FOR UPDATE`, en orden de id para no
 * interbloquear) hasta el final de la transacción y devuelve su avance. Las que no existen se omiten.
 */
export async function lockGoals(
  tx: Prisma.TransactionClient,
  userId: string,
  goalIds: Array<string | null | undefined>,
): Promise<Map<string, LockedGoal>> {
  const ids = [...new Set(goalIds.filter((id): id is string => !!id))].sort();
  const locked = new Map<string, LockedGoal>();
  for (const id of ids) {
    await tx.$queryRaw`SELECT id FROM "Goal" WHERE id = ${id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
    const goal = await goalNow(tx, userId, id);
    if (goal) locked.set(id, goal);
  }
  return locked;
}

/**
 * Después de escribir: si el avance de una meta bloqueada bajó y quedó por debajo de 0, falla (y la
 * transacción se deshace). Una meta que ya estaba negativa puede subir o quedarse igual.
 */
export async function assertGoalsNotNegative(
  tx: Prisma.TransactionClient,
  userId: string,
  locked: Map<string, LockedGoal>,
  error: () => AppError,
): Promise<void> {
  for (const [id, before] of locked) {
    const after = await goalNow(tx, userId, id);
    if (after && after.progress < 0 && after.progress < before.progress) throw error();
  }
}

/** Con la meta ya bloqueada: la transferencia debe entrar o salir de su cuenta actual. */
export function assertGoalAccount(
  locked: Map<string, LockedGoal>,
  goalId: string,
  accountId: string,
  toAccountId: string,
): void {
  const goal = locked.get(goalId);
  if (!goal || (goal.accountId !== accountId && goal.accountId !== toAccountId)) {
    throw badRequest(
      'INVALID_REFERENCE',
      'Revisa las cuentas, tarjetas o categorías seleccionadas.',
      {
        goalId: goal
          ? 'La transferencia debe entrar o salir de la cuenta de la meta'
          : 'Meta no encontrada',
      },
    );
  }
}

export const withdrawalExceedsGoal = () =>
  badRequest('WITHDRAWAL_EXCEEDS_GOAL', 'Revisa los datos ingresados.', {
    amount: 'No puedes retirar más de lo ahorrado en esta meta',
  });

export const goalProgressNegative = () =>
  conflict(
    'GOAL_PROGRESS_NEGATIVE',
    'Esta meta quedaría con saldo negativo; ajusta primero sus retiros.',
  );
```

- [ ] **Step 4: Usar el bloqueo en `apps/api/src/modules/transactions/service.ts`**

a) Después de `import { loanBalance } from '../debts/service';` agregar:

```ts
import {
  assertGoalAccount,
  assertGoalsNotNegative,
  goalProgressNegative,
  lockGoals,
  withdrawalExceedsGoal,
  type LockedGoal,
} from '../goals/guard';
```

b) Justo antes de `const NO_REFS = {` agregar:

```ts
/** Meta de una transferencia (abono o retiro); los demás tipos no tienen. */
const goalIdOf = (input: TransactionInput) =>
  input.type === 'TRANSFER' ? (input.goalId ?? null) : null;

/** Con la meta bloqueada, revisa que la transferencia siga entrando o saliendo de su cuenta. */
function checkLockedGoal(goals: Map<string, LockedGoal>, input: TransactionInput) {
  if (input.type === 'TRANSFER' && input.goalId) {
    assertGoalAccount(goals, input.goalId, input.accountId, input.toAccountId);
  }
}

```

c) En `createTransaction`, reemplazar:

```ts
  const id = await db.$transaction(async (tx) => {
    const created = await insertTransaction(tx, auth.userId, p);
    await applyLink(tx, auth.userId, created, input, link, name);
    return created;
  });
```

por:

```ts
  const id = await db.$transaction(async (tx) => {
    // Spec Fase 3 §8.2: la meta queda bloqueada hasta el final; dos retiros a la vez no pasan el tope.
    const goals = await lockGoals(tx, auth.userId, [goalIdOf(input)]);
    checkLockedGoal(goals, input);
    const created = await insertTransaction(tx, auth.userId, p);
    await applyLink(tx, auth.userId, created, input, link, name);
    await assertGoalsNotNegative(tx, auth.userId, goals, withdrawalExceedsGoal);
    return created;
  });
```

d) En `deleteTransaction`, agregar `goalId: true,` al `select` (después de `parentId: true,`) y reemplazar:

```ts
  await db.$transaction([
    db.scheduledItem.updateMany({
      where: { userId, transactionId: id },
      data: { transactionId: null, status: 'PENDING' },
    }),
    db.transaction.delete({ where: { id_userId: { id, userId } } }),
  ]);
```

por:

```ts
  await db.$transaction(async (tx) => {
    // Spec Fase 3 §8.2: borrar un abono no puede dejar la meta con saldo negativo.
    const goals = await lockGoals(tx, userId, [row.goalId]);
    await tx.scheduledItem.updateMany({
      where: { userId, transactionId: id },
      data: { transactionId: null, status: 'PENDING' },
    });
    await tx.transaction.delete({ where: { id_userId: { id, userId } } });
    await assertGoalsNotNegative(tx, userId, goals, goalProgressNegative);
  });
```

e) En `updateTransaction`, dentro de `await db.$transaction(async (tx) => {`, antes de `const row = await tx.transaction.update({`, agregar:

```ts
    // Spec Fase 3 §8.2: editar un abono o un retiro revisa la meta de antes y la de ahora.
    const goals = await lockGoals(tx, auth.userId, [existing.goalId, goalIdOf(input)]);
    checkLockedGoal(goals, input);
```

y, como última sentencia de ese mismo callback (después del `if (input.type === 'DEBT_PAYMENT') { … }` que llama a `syncInterest`), agregar:

```ts
    await assertGoalsNotNegative(tx, auth.userId, goals, withdrawalExceedsGoal);
```

- [ ] **Step 5: Bloqueo en `apps/api/src/modules/goals/service.ts`**

a) Después de `import { createTransaction } from '../transactions/service';` agregar:

```ts
import { assertGoalsNotNegative, lockGoals } from './guard';
```

b) En `updateGoal`, al comienzo del callback de `db.$transaction(async (tx) => {` (antes de `const goal = await findGoal(tx, userId, id);`), agregar:

```ts
    // Spec Fase 3 §8.2: cambiar la cuenta espera a los abonos y retiros en curso (y viceversa).
    const locked = await lockGoals(tx, userId, [id]);
```

y después del `await tx.goal.update({ … });` del mismo callback, agregar:

```ts
    // Plan Fase 3A, decisión 15: bajar el saldo inicial tampoco puede dejar la meta en negativo.
    await assertGoalsNotNegative(tx, userId, locked, () =>
      badRequest('WITHDRAWAL_EXCEEDS_GOAL', 'Revisa los datos ingresados.', {
        initialAmount: 'La meta quedaría con saldo negativo',
      }),
    );
```

c) En `withdrawFromGoal`, reemplazar:

```ts
  const { progress } = await getGoal(db, auth, id);
  if (input.amount > Math.max(0, progress)) {
    throw badRequest('WITHDRAWAL_EXCEEDS_GOAL', 'Revisa los datos ingresados.', {
      amount: 'No puedes retirar más de lo ahorrado en esta meta',
    });
  }
```

por:

```ts
  // El tope (lo ahorrado en la meta) se revisa dentro de la transacción, con la meta bloqueada.
```

(La respuesta es la misma: `createTransaction` lanza `withdrawalExceedsGoal()` con el mismo código, mensaje y `fields.amount`.)

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npm test -w @finanzas/api -- test/goals.test.ts`
Expected: PASS (los 10 tests anteriores y los 6 nuevos; "caps withdrawals to what the goal holds" sigue verde con el mismo error).

- [ ] **Step 7: Correr las pruebas que tocan movimientos**

Run: `npm test -w @finanzas/api -- test/transactions.test.ts test/transactions-edit-list.test.ts test/transactions-phase2.test.ts test/lifecycle.test.ts test/financial-correctness.test.ts test/scheduled.test.ts`
Expected: PASS (eliminar un movimiento enlazado a una obligación sigue devolviéndola a pendiente).

- [ ] **Step 8: Verificar**

Run:

```bash
npm run typecheck
npx prettier --write apps/api/src/modules/goals apps/api/src/modules/transactions/service.ts apps/api/test/goals.test.ts
npm run lint
npm run format:check
```

Expected: todo en verde.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/goals apps/api/src/modules/transactions/service.ts apps/api/test/goals.test.ts
git commit -m "fix: bloquea la meta al abonar, retirar, editar o eliminar para que nunca quede con saldo negativo"
```

---

### Task 7: Renovación de sesión y verificación del backend

**Files:**
- Modify: `apps/api/src/modules/auth/sessions.ts` (la renovación vive aquí; `plugins/session.ts` ya responde 401 `SESSION_EXPIRED` cuando `validateSession` devuelve `null`)
- Modify: `apps/api/src/modules/auth/sessions.test.ts`
- Create: `apps/api/test/session-renewal.test.ts`
- Create: `apps/api/test/recurring-link.test.ts` (pendiente 4, lado API; decisión 17)

**Interfaces:**
- Consumes: `validateSession` (existe); `createPrisma` (`lib/prisma`); `AppDeps.prisma` de `createTestApp(overrides, deps)`; `client`, `registerUser` (`test/helpers.ts`); `GET /api/scheduled/suggestions?kind&categoryId&amount&date` → `{ items: ScheduledItemDTO[] }` (con `recurringRuleId`) y `POST /api/transactions` con `scheduledItemId` o `recurring` (ya existen).
- Produces: `validateSession(db: DbClient, token: string, ttlDays: number)` con la misma firma; renueva con `updateMany({ where: { id, expiresAt: { gt: ahora } } })` y devuelve `null` si no actualizó ninguna fila.

- [ ] **Step 1: Test unitario del filtro**

En `apps/api/src/modules/auth/sessions.test.ts`, cambiar el import de Vitest por `import { describe, expect, it, vi } from 'vitest';` y agregar dentro del `describe('validateSession', …)`, después del test existente:

```ts
  it('renews filtering by id and by a still valid expiry', async () => {
    const old = new Date(Date.now() - 2 * 3_600_000);
    const updateMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
    const db = {
      session: {
        findUnique: async () => ({
          id: 's1',
          userId: 'u1',
          lastUsedAt: old,
          expiresAt: new Date(Date.now() + 86_400_000),
          user: { timezone: 'America/Bogota' },
        }),
        updateMany,
        deleteMany: async () => ({ count: 0 }),
      },
    } as unknown as DbClient;
    expect((await validateSession(db, 'token', 30))?.renewed).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 's1', expiresAt: { gt: expect.any(Date) } },
      data: { lastUsedAt: expect.any(Date), expiresAt: expect.any(Date) },
    });
  });
```

- [ ] **Step 2: Test de integración de las carreras**

Create `apps/api/test/session-renewal.test.ts` (una extensión de Prisma simula la otra petición justo antes del `updateMany` de la renovación):

```ts
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
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `npm test -w @finanzas/api -- src/modules/auth/sessions.test.ts test/session-renewal.test.ts`
Expected: FAIL en dos tests: el unitario (`updateMany` se llamó solo con `{ id: 's1' }`) y "never renews a session that expired between the read and the renewal" (responde 200 porque la renovación revive la sesión vencida). "answers 401 SESSION_EXPIRED, not 404…" y "still renews a valid session…" ya pasan: la Fase 2 cambió `update` por `updateMany` con conteo.

- [ ] **Step 4: Renovar solo sesiones vigentes**

En `apps/api/src/modules/auth/sessions.ts`, reemplazar:

```ts
    // updateMany no falla si un logout simultáneo ya borró la sesión: en ese caso ya no es válida.
    const { count } = await db.session.updateMany({
      where: { id: session.id },
```

por:

```ts
    // updateMany no falla si un logout simultáneo ya borró la sesión, y el filtro de vigencia evita
    // revivir una que venció entretanto (spec Fase 3 §8.6): 0 filas → ya no es válida.
    const { count } = await db.session.updateMany({
      where: { id: session.id, expiresAt: { gt: new Date(now) } },
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test -w @finanzas/api -- src/modules/auth/sessions.test.ts test/session-renewal.test.ts test/auth.test.ts`
Expected: PASS.

- [ ] **Step 6: Test del pendiente 4 (lado API)**

El comportamiento ya existe (decisión 17); este test lo deja fijado como pide el spec §9.2. Create `apps/api/test/recurring-link.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ScheduledItemDTO } from '@finanzas/shared';
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

describe('a recurring payment that already exists (spec Fase 3 §8.4, API side)', () => {
  it('flags suggestions from a rule and never accepts a link and a new rule together', async () => {
    const { api, user } = await registerUser(app);
    const f = await setupFinances(api);
    const rule = (
      await api.post('/api/recurring', {
        name: 'Arriendo',
        kind: 'EXPENSE',
        amount: 1_000_000,
        categoryId: f.cat.food,
        accountId: f.bank,
        frequency: 'MONTHLY',
        startDate: '2026-10-25',
      })
    ).body.rule;
    await api.post('/api/scheduled', {
      kind: 'EXPENSE',
      name: 'SOAT',
      amount: 1_000_000,
      dueDate: '2026-10-22',
      categoryId: f.cat.food,
      accountId: f.bank,
    });

    const suggestions = (
      await api.get<{ items: ScheduledItemDTO[] }>(
        `/api/scheduled/suggestions?kind=EXPENSE&categoryId=${f.cat.food}&amount=1000000&date=${TODAY}`,
      )
    ).body.items;
    expect(suggestions.map((s) => [s.name, s.dueDate, s.recurringRuleId])).toEqual([
      ['SOAT', '2026-10-22', null],
      ['Arriendo', '2026-10-25', rule.id],
    ]);
    const occurrence = suggestions[1]!;

    const expense = {
      type: 'EXPENSE',
      amount: 1_000_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.food,
    };
    const count = async () => ({
      transactions: await app.prisma.transaction.count({ where: { userId: user.id } }),
      rules: await app.prisma.recurringRule.count({ where: { userId: user.id } }),
    });

    const both = await api.post('/api/transactions', {
      ...expense,
      scheduledItemId: occurrence.id,
      recurring: { frequency: 'MONTHLY' },
    });
    expect(both.status).toBe(400);
    expect(both.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Elige enlazar con una obligación o marcar como recurrente.',
      fields: { recurring: 'No se puede junto con un enlace' },
    });
    expect(await count()).toEqual({ transactions: 0, rules: 1 });

    // "Sí, es este pago": se enlaza con la ocurrencia y no se crea otra regla.
    const yes = await api.post('/api/transactions', { ...expense, scheduledItemId: occurrence.id });
    expect(yes.status).toBe(201);
    const paid = await app.prisma.scheduledItem.findUniqueOrThrow({ where: { id: occurrence.id } });
    expect(paid).toMatchObject({ status: 'DONE', transactionId: yes.body.transaction.id });
    expect(await count()).toEqual({ transactions: 1, rules: 1 });

    // "No": se crea la regla nueva.
    const no = await api.post('/api/transactions', {
      ...expense,
      description: 'Arriendo bodega',
      recurring: { frequency: 'MONTHLY' },
    });
    expect(no.status).toBe(201);
    expect(await count()).toEqual({ transactions: 2, rules: 2 });
  });
});
```

Run: `npm test -w @finanzas/api -- test/recurring-link.test.ts`
Expected: PASS sin cambiar código. Si falla, el contrato que usa la web en la Tarea 10 del plan 3B no se cumple: corregir la API (no el test) antes de seguir.

- [ ] **Step 7: Verificación completa del backend**

Run:

```bash
npx prettier --write apps/api/src/modules/auth apps/api/test/session-renewal.test.ts apps/api/test/recurring-link.test.ts
npm test -w @finanzas/shared
npm test -w @finanzas/api
npm test -w @finanzas/api
npm run typecheck
npm run lint
npm run format:check
```

Expected: todo en verde las dos veces (la suite de la API se corre dos veces para descartar fallas intermitentes en las pruebas de concurrencia: retiros simultáneos, cambio de cuenta y foto única del reporte). `@finanzas/shared` pasa con 47 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/auth apps/api/test/session-renewal.test.ts apps/api/test/recurring-link.test.ts
git commit -m "fix: renueva la sesión solo si sigue vigente y deja probado el enlace con recurrentes existentes"
```

---

## Cierre del plan 3A

Con estas siete tareas la API cubre todo el backend de la Fase 3: `GET /api/reports` calcula el `ReportDTO` del spec §3.4 en una sola transacción `REPEATABLE READ` de solo lectura, sin copiar presupuestos ni generar ocurrencias; `GET /api/reports/export` entrega el CSV y el Excel del spec §4, con protección contra fórmulas, `EXPORT_MAX_ROWS` y 10 exportaciones por minuto por usuario; las metas ya no pueden quedar con saldo negativo, ni con escrituras simultáneas ni al editar o eliminar desde Movimientos; la renovación de sesión ya no revive sesiones vencidas; y el lado API del pendiente 4 queda probado. El plan 3B (`docs/superpowers/plans/2026-10-07-fase-3b-web.md`) continúa en la misma rama `fase-3` con la pantalla de Reportes, los gráficos, la exportación desde la web, la impresión, la PWA, la accesibilidad y la prueba de punta a punta, y usa estos contratos tal cual: `ReportDTO`, `ReportPeriodInput`, `REPORT_PRESETS`, `REPORT_PRESET_LABELS`, `resolveReportPeriod`, `groupTop` y los errores `VALIDATION_ERROR`, `EXPORT_TOO_LARGE` y `RATE_LIMITED`.
