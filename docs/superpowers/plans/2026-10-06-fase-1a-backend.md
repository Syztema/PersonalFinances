# Fase 1A — Backend del núcleo: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API REST funcional (auth, cuentas, categorías, etiquetas, tarjetas con cuotas, préstamos, 7 tipos de movimiento, dashboard del núcleo) sobre PostgreSQL, con reglas financieras puras probadas y aislamiento total por usuario.

**Architecture:** Monorepo npm workspaces. `packages/shared` (esquemas Zod, enums, dinero, fechas, DTOs) consumido como TypeScript fuente. `apps/api` (Fastify 5 + Prisma 7 + adapter pg): rutas delgadas → servicios (consultas con `userId`) → dominio puro (`src/domain`). Saldos y deudas siempre calculados con `groupBy` + `applyLedger`.

**Tech Stack:** Node 22, TypeScript 5.9.3, Fastify 5.12, Zod 4.6, Prisma 7.10 (`prisma-client` generator + `@prisma/adapter-pg`), PostgreSQL 17, `@node-rs/argon2`, nodemailer, Vitest 5, tsup 8, ESLint 10 + typescript-eslint 8, Prettier 3.

**Spec:** `docs/superpowers/specs/2026-10-06-finanzas-design.md`

## Global Constraints

- Dinero: enteros en pesos; `bigint` en Postgres, `number` en TS; rango por valor 1 a 1.000.000.000.000.
- Formato COP: `$1.500.000`, negativo `-$25.000`, sin decimales ni espacio.
- Fechas de movimiento: `DATE` local; "hoy" y "mes" siempre en la zona del usuario (default `America/Bogota`); no se permiten fechas futuras.
- Toda consulta de negocio filtra por `userId` de la sesión; recurso ajeno → 404; referencia ajena en el cuerpo → 400 `INVALID_REFERENCE`.
- Toda relación entre tablas de negocio es FK compuesta (`xId`, `userId`) → (`id`, `userId`) con `onDelete: NoAction` (se verifica al final de la sentencia; salvo las cascadas indicadas en el schema).
- Errores: `{ error: { code, message, fields? } }`, mensajes en español.
- Logs: nunca cuerpos, montos, emails, tokens ni query strings.
- Textos para el usuario en español de Colombia; código e identificadores en inglés.
- Commits: **no** se hace commit por tarea. Todo el trabajo de la Fase 1 (planes 1A y 1B) va en un único commit al final del plan 1B, con mensaje de una frase, seguido de `git push origin main`.
- Node local 22.17 (cumple `^22.12` de Vitest 5 y Prisma 7).
- Desviaciones menores respecto al spec, decididas en este plan: `Category.systemKey` (claves estables `INTEREST`, `ADJUSTMENT_EXPENSE`, `ADJUSTMENT_INCOME`); índice de movimientos (`userId`, `date` DESC, `createdAt` DESC) para ordenar por fecha y hora de registro; unicidad de categorías raíz duplicadas validada en el servicio (Prisma no soporta `NULLS NOT DISTINCT`).

## Review Focus

1. Día de corte, pago o recurrencia 29–31 en meses cortos (febrero, abril) → se usa el último día del mes, nunca una fecha inválida. *(Test en Task 9.)*
2. Movimiento registrado de noche en Bogotá (ya es el día siguiente en UTC) → la fecha válida es la de Bogotá; "fecha futura" se evalúa con el día de Bogotá. *(Test en Task 12 con reloj inyectado.)*
3. Valor pegado con decimales o espacios (`$1.500.000,50`, `1 500 000`) → se interpreta como 1.500.000, nunca como 150.000.050. *(Test en Task 2.)*
4. Editar o borrar una compra con tarjeta ya pagada → la deuda puede quedar negativa (saldo a favor); el pago del mes y las deudas del dashboard nunca son negativos. *(Test en Task 13.)*
5. Editar un movimiento antiguo cuya cuenta ya está archivada sin cambiar la cuenta → permitido; asignar una cuenta archivada distinta → rechazado. *(Test en Task 13.)*

---

## Estructura de archivos (Fase 1A)

```
package.json, tsconfig.base.json, eslint.config.js, .prettierrc.json, .prettierignore,
.gitignore, .editorconfig, docker-compose.dev.yml
packages/shared/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts            re-exporta todo
  src/money.ts(+test)     formatCOP, formatCOPCompact, parseCOP, MAX_AMOUNT
  src/dates.ts(+test)     IsoDate y aritmética de fechas, todayIn
  src/enums.ts            enums como arrays const + etiquetas en español
  src/schemas/common.ts   piezas Zod reutilizables
  src/schemas/auth.ts, accounts.ts, categories.ts, credit-cards.ts, debts.ts, transactions.ts
  src/dto.ts              tipos de respuesta de la API
apps/api/
  package.json, tsconfig.json, tsup.config.ts, vitest.config.ts, prisma.config.ts, .env.example
  prisma/schema.prisma, prisma/migrations/**, prisma/seed.ts
  src/server.ts            arranque
  src/app.ts               buildApp(config, deps)
  src/types/fastify.d.ts   decoraciones
  src/config/env.ts        loadConfig
  src/lib/errors.ts, validation.ts, db.ts, prisma.ts, tokens.ts, password.ts,
          attempt-limiter.ts, mailer.ts
  src/plugins/errors.ts, security.ts, session.ts
  src/domain/ledger.ts, balances.ts, savings.ts, available.ts, card-billing.ts, loans.ts (+ tests)
  src/modules/health/routes.ts
  src/modules/auth/{routes,service,sessions}.ts
  src/modules/me/routes.ts
  src/modules/ledger/repository.ts
  src/modules/accounts/{routes,service}.ts
  src/modules/categories/{routes,service,defaults}.ts
  src/modules/tags/{routes,service}.ts
  src/modules/credit-cards/{routes,service}.ts
  src/modules/debts/{routes,service}.ts
  src/modules/transactions/{routes,service,mapper,refs,cursor}.ts
  src/modules/dashboard/{routes,service}.ts
  test/global-setup.ts, test/helpers.ts, test/*.test.ts
```

---

### Task 1: Monorepo, herramientas y bases de datos de desarrollo

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.editorconfig`, `docker-compose.dev.yml`

**Interfaces:**
- Produces: scripts raíz `lint`, `format`, `typecheck`, `test`, `build`, `dev:db`; Postgres dev en `localhost:5432` (db `finanzas`) y test en `localhost:5433` (db `finanzas_test`), usuario/clave `finanzas`/`finanzas`.

- [ ] **Step 1: Crear `package.json` raíz**

```json
{
  "name": "finanzas",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "engines": { "node": ">=22.12" },
  "scripts": {
    "dev:db": "docker compose -f docker-compose.dev.yml up -d",
    "dev:api": "npm run dev -w @finanzas/api",
    "dev:web": "npm run dev -w @finanzas/web",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspaces --if-present"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "eslint": "^10.12.0",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-react-hooks": "^7.1.1",
    "globals": "^17.13.0",
    "prettier": "^3.9.9",
    "typescript": "5.9.3",
    "typescript-eslint": "^8.71.1"
  }
}
```

- [ ] **Step 2: Crear `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  }
}
```

- [ ] **Step 3: Crear `eslint.config.js`**

```js
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dev-dist/**',
      '**/coverage/**',
      '**/generated/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', '*.js', '*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
);
```

- [ ] **Step 4: Crear `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.gitignore`**

`.prettierrc.json`:
```json
{ "singleQuote": true, "semi": true, "trailingComma": "all", "printWidth": 100 }
```

`.prettierignore`:
```
node_modules
dist
dev-dist
coverage
**/generated/**
apps/api/prisma/migrations
package-lock.json
```

`.editorconfig`:
```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

`.gitignore`:
```
node_modules/
dist/
dev-dist/
coverage/
apps/api/src/generated/
playwright-report/
test-results/
.env
.env.*
!.env.example
*.log
.DS_Store
```

- [ ] **Step 5: Crear `docker-compose.dev.yml`**

```yaml
services:
  db-dev:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: finanzas
      POSTGRES_PASSWORD: finanzas
      POSTGRES_DB: finanzas
    ports:
      - '5432:5432'
    volumes:
      - pgdata-dev:/var/lib/postgresql/data
  db-test:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: finanzas
      POSTGRES_PASSWORD: finanzas
      POSTGRES_DB: finanzas_test
    ports:
      - '5433:5432'
    tmpfs:
      - /var/lib/postgresql/data

volumes:
  pgdata-dev: {}
```

- [ ] **Step 6: Instalar y levantar bases**

Run: `npm install` y luego `npm run dev:db`
Expected: instalación sin errores; `docker compose -f docker-compose.dev.yml ps` muestra `db-dev` y `db-test` en estado `running`.

- [ ] **Step 7: Verificar lint vacío**

Run: `npm run lint`
Expected: termina sin errores (aún no hay archivos TS).

---

### Task 2: Shared — dinero y fechas

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/money.ts`, `packages/shared/src/dates.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/money.test.ts`, `packages/shared/src/dates.test.ts`

**Interfaces:**
- Produces:
  - `MAX_AMOUNT: number`, `formatCOP(value: number): string`, `formatCOPCompact(value: number): string`, `parseCOP(input: string): number | null`
  - `type IsoDate = string`, `DEFAULT_TIMEZONE`, `isValidIsoDate(s)`, `makeDate(y, m, d)` (normaliza el mes y recorta el día), `daysInMonth(y, m)`, `todayIn(tz?, now?)`, `addDays(d, n)`, `diffDays(from, to)`, `addMonths(d, n)`, `startOfMonth(d)`, `endOfMonth(d)`, `monthKey(d)` (`YYYY-MM`), `monthStartFromKey(key)`, `yearMonth(d)`, `dayOfMonth(d)`, `monthsBetween(a, b)`

- [ ] **Step 1: Crear el paquete**

`packages/shared/package.json`:
```json
{
  "name": "@finanzas/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^4.6.5" },
  "devDependencies": { "vitest": "^5.0.3" }
}
```

`packages/shared/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 2: Escribir tests que fallan**

`packages/shared/src/money.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatCOP, formatCOPCompact, parseCOP } from './money';

describe('formatCOP', () => {
  it('uses dot thousands separator and no space after $', () => {
    expect(formatCOP(1500000)).toBe('$1.500.000');
    expect(formatCOP(1500)).toBe('$1.500');
    expect(formatCOP(999)).toBe('$999');
    expect(formatCOP(0)).toBe('$0');
  });
  it('puts the minus sign before $', () => {
    expect(formatCOP(-25000)).toBe('-$25.000');
  });
});

describe('formatCOPCompact', () => {
  it('abbreviates millions and thousands', () => {
    expect(formatCOPCompact(1200000)).toBe('$1,2 M');
    expect(formatCOPCompact(5000000)).toBe('$5 M');
    expect(formatCOPCompact(999999)).toBe('$1 M');
    expect(formatCOPCompact(850000)).toBe('$850 mil');
    expect(formatCOPCompact(500)).toBe('$500');
    expect(formatCOPCompact(-1500000)).toBe('-$1,5 M');
  });
});

describe('parseCOP', () => {
  it('keeps only the integer digits', () => {
    expect(parseCOP('$1.500.000')).toBe(1500000);
    expect(parseCOP('25000')).toBe(25000);
    expect(parseCOP('1 500 000')).toBe(1500000);
  });
  it('drops a Colombian decimal part after the comma', () => {
    expect(parseCOP('$1.500.000,50')).toBe(1500000);
    expect(parseCOP('25.000,00')).toBe(25000);
  });
  it('returns null when there are no digits', () => {
    expect(parseCOP('')).toBeNull();
    expect(parseCOP('abc')).toBeNull();
    expect(parseCOP(',50')).toBeNull();
  });
});
```

`packages/shared/src/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  diffDays,
  endOfMonth,
  isValidIsoDate,
  makeDate,
  monthKey,
  monthsBetween,
  startOfMonth,
  todayIn,
} from './dates';

describe('todayIn', () => {
  it('uses the Bogotá calendar day, not UTC', () => {
    // 2026-11-01 04:30 UTC = 2026-10-31 23:30 en Bogotá
    expect(todayIn('America/Bogota', new Date('2026-11-01T04:30:00Z'))).toBe('2026-10-31');
    expect(todayIn('America/Bogota', new Date('2026-11-01T05:00:00Z'))).toBe('2026-11-01');
  });
});

describe('date arithmetic', () => {
  it('clamps day overflow to the last day of the month', () => {
    expect(makeDate(2026, 2, 31)).toBe('2026-02-28');
    expect(makeDate(2028, 2, 31)).toBe('2028-02-29');
    expect(makeDate(2026, 13, 15)).toBe('2027-01-15');
    expect(makeDate(2026, 0, 15)).toBe('2025-12-15');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('computes month boundaries', () => {
    expect(startOfMonth('2026-10-06')).toBe('2026-10-01');
    expect(endOfMonth('2026-04-10')).toBe('2026-04-30');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(monthKey('2026-10-06')).toBe('2026-10');
  });
  it('adds and diffs days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-10-06', '2026-10-31')).toBe(25);
    expect(monthsBetween('2026-10-15', '2027-02-15')).toBe(4);
  });
  it('validates ISO dates', () => {
    expect(isValidIsoDate('2026-10-06')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('06/10/2026')).toBe(false);
  });
});
```

- [ ] **Step 3: Verificar que fallan**

Run: `npm install && npm test -w @finanzas/shared`
Expected: FAIL — no existen `./money` ni `./dates`.

- [ ] **Step 4: Implementar `money.ts`**

```ts
export const MAX_AMOUNT = 1_000_000_000_000;

function groupThousands(n: number): string {
  return Math.trunc(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** `$1.500.000` · `-$25.000` */
export function formatCOP(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${groupThousands(value)}`;
}

/** `$1,2 M` · `$850 mil` · `$500` (ejes y etiquetas de gráficos) */
export function formatCOPCompact(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000 || Math.round(abs / 1000) >= 1000) {
    const millions = Math.round((abs / 1_000_000) * 10) / 10;
    const text = Number.isInteger(millions)
      ? groupThousands(millions)
      : millions.toFixed(1).replace('.', ',');
    return `${sign}$${text} M`;
  }
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)} mil`;
  return formatCOP(value);
}

/** Interpreta texto escrito o pegado; descarta la parte decimal colombiana (después de la coma). */
export function parseCOP(input: string): number | null {
  const integerPart = input.split(',')[0] ?? '';
  const digits = integerPart.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}
```

- [ ] **Step 5: Implementar `dates.ts`**

```ts
/** Fecha calendario `YYYY-MM-DD` sin hora ni zona. */
export type IsoDate = string;

export const DEFAULT_TIMEZONE = 'America/Bogota';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parts(date: IsoDate): [number, number, number] {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid ISO date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isValidIsoDate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

/** Normaliza meses fuera de rango (13 → enero siguiente) y recorta el día al último del mes. */
export function makeDate(year: number, month: number, day: number): IsoDate {
  const total = year * 12 + (month - 1);
  const y = Math.floor(total / 12);
  const mo = total - y * 12 + 1;
  const d = Math.min(Math.max(day, 1), daysInMonth(y, mo));
  return `${pad(y, 4)}-${pad(mo)}-${pad(d)}`;
}

export function todayIn(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): IsoDate {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function toEpochDay(date: IsoDate): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromEpochDay(n: number): IsoDate {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Días de `from` a `to` (positivo si `to` es posterior). */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = parts(date);
  return makeDate(y, m + months, d);
}

export function startOfMonth(date: IsoDate): IsoDate {
  const [y, m] = parts(date);
  return makeDate(y, m, 1);
}

export function endOfMonth(date: IsoDate): IsoDate {
  const [y, m] = parts(date);
  return makeDate(y, m, 31);
}

export function monthKey(date: IsoDate): string {
  return date.slice(0, 7);
}

export function monthStartFromKey(key: string): IsoDate {
  return `${key}-01`;
}

export function yearMonth(date: IsoDate): { year: number; month: number } {
  const [year, month] = parts(date);
  return { year, month };
}

export function dayOfMonth(date: IsoDate): number {
  return parts(date)[2];
}

/** Meses calendario entre el mes de `a` y el mes de `b`. */
export function monthsBetween(a: IsoDate, b: IsoDate): number {
  const A = yearMonth(a);
  const B = yearMonth(b);
  return (B.year - A.year) * 12 + (B.month - A.month);
}
```

- [ ] **Step 6: Crear `index.ts`**

```ts
export * from './money';
export * from './dates';
```

- [ ] **Step 7: Verificar que pasan**

Run: `npm test -w @finanzas/shared`
Expected: PASS (todos los tests de money y dates).

---

### Task 3: Shared — enums, esquemas Zod y DTOs

**Files:**
- Create: `packages/shared/src/enums.ts`, `packages/shared/src/schemas/common.ts`, `packages/shared/src/schemas/auth.ts`, `packages/shared/src/schemas/accounts.ts`, `packages/shared/src/schemas/categories.ts`, `packages/shared/src/schemas/credit-cards.ts`, `packages/shared/src/schemas/debts.ts`, `packages/shared/src/schemas/transactions.ts`, `packages/shared/src/dto.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/transactions.test.ts`

**Interfaces:**
- Consumes: `MAX_AMOUNT`, `isValidIsoDate`, `IsoDate` (Task 2).
- Produces:
  - Enums (arrays `as const` + tipo): `ACCOUNT_TYPES/AccountType`, `LIQUID_ACCOUNT_TYPES`, `isLiquidAccount(t)`, `TRANSACTION_TYPES/TransactionType`, `CATEGORY_KINDS/CategoryKind`, `BUCKETS/Bucket`, `PAYMENT_METHODS/PaymentMethod`, `DERIVED_METHODS/DerivedMethod`, `FREQUENCIES/Frequency`, `SCHEDULED_KINDS`, `SCHEDULED_STATUSES`, `GOAL_STATUSES`, `THEMES/Theme`, `SYSTEM_CATEGORY_KEYS`, etiquetas `*_LABELS`, `deriveMethod(type, paymentMethod, accountType)`.
  - Esquemas: `registerSchema`, `loginSchema`, `forgotPasswordSchema`, `resetPasswordSchema`, `changePasswordSchema`, `updateMeSchema`, `accountCreateSchema`, `accountUpdateSchema`, `categoryCreateSchema`, `categoryUpdateSchema`, `creditCardCreateSchema`, `creditCardUpdateSchema`, `debtCreateSchema`, `debtUpdateSchema`, `debtPaymentSchema`, `debtDisbursementSchema`, `transactionSchema` (unión discriminada), `transferBodySchema`, `cardPurchaseBodySchema`, `cardPaymentBodySchema`, `transactionListQuerySchema`, y sus tipos `XxxInput = z.output<...>`.
  - DTOs: `ApiErrorBody`, `Page<T>`, `UserDTO`, `RefDTO`, `AccountRefDTO`, `CategoryRefDTO`, `AccountDTO`, `CategoryDTO`, `TagDTO`, `CreditCardDTO`, `CardInstallmentDTO`, `CardStatementDTO`, `DebtDTO`, `TransactionDTO`, `WarningCode`, `TransactionResultDTO`, `BreakdownItem`, `DashboardDTO`.

- [ ] **Step 1: Escribir el test que falla**

`packages/shared/src/schemas/transactions.test.ts`:
```ts
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
    expect(r).toMatchObject({ description: 'Almuerzo', payee: null, notes: null, tags: ['trabajo', 'comida'] });
  });

  it('defaults card purchase installments to 1 and rejects 49', () => {
    const base = { type: 'CARD_PURCHASE', amount: 80000, date: '2026-10-06', creditCardId: CARD, categoryId: CAT };
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
    const ok = { type: 'INCOME', amount: 1000, date: '2026-10-06', accountId: ACC_A, categoryId: CAT };
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
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -w @finanzas/shared`
Expected: FAIL — no existe `./transactions`.

- [ ] **Step 3: Implementar `enums.ts`**

```ts
export const ACCOUNT_TYPES = ['CASH', 'BANK', 'DIGITAL_WALLET', 'SAVINGS', 'INVESTMENT', 'OTHER'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const LIQUID_ACCOUNT_TYPES: readonly AccountType[] = ['CASH', 'BANK', 'DIGITAL_WALLET', 'OTHER'];
export const isLiquidAccount = (type: AccountType) => LIQUID_ACCOUNT_TYPES.includes(type);

export const TRANSACTION_TYPES = [
  'INCOME',
  'EXPENSE',
  'TRANSFER',
  'CARD_PURCHASE',
  'CARD_PAYMENT',
  'DEBT_PAYMENT',
  'DEBT_DISBURSEMENT',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const CATEGORY_KINDS = ['INCOME', 'EXPENSE'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const BUCKETS = ['OBLIGATIONS', 'LEISURE', 'OTHER'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const PAYMENT_METHODS = ['CASH', 'DEBIT_CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DERIVED_METHODS = [
  'CASH',
  'BANK',
  'DIGITAL_WALLET',
  'DEBIT_CARD',
  'BANK_TRANSFER',
  'CREDIT_CARD',
  'OTHER',
] as const;
export type DerivedMethod = (typeof DERIVED_METHODS)[number];

export const FREQUENCIES = ['WEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'YEARLY', 'CUSTOM_DAYS'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const SCHEDULED_KINDS = ['INCOME', 'EXPENSE'] as const;
export type ScheduledKind = (typeof SCHEDULED_KINDS)[number];

export const SCHEDULED_STATUSES = ['PENDING', 'DONE', 'SKIPPED'] as const;
export type ScheduledStatus = (typeof SCHEDULED_STATUSES)[number];

export const GOAL_STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const THEMES = ['SYSTEM', 'LIGHT', 'DARK'] as const;
export type Theme = (typeof THEMES)[number];

export const SYSTEM_CATEGORY_KEYS = {
  INTEREST: 'INTEREST',
  ADJUSTMENT_EXPENSE: 'ADJUSTMENT_EXPENSE',
  ADJUSTMENT_INCOME: 'ADJUSTMENT_INCOME',
} as const;

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: 'Efectivo',
  BANK: 'Cuenta bancaria',
  DIGITAL_WALLET: 'Billetera digital',
  SAVINGS: 'Ahorro',
  INVESTMENT: 'Inversión',
  OTHER: 'Otra',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
  TRANSFER: 'Transferencia',
  CARD_PURCHASE: 'Compra con tarjeta',
  CARD_PAYMENT: 'Pago de tarjeta',
  DEBT_PAYMENT: 'Pago de préstamo',
  DEBT_DISBURSEMENT: 'Desembolso de préstamo',
};

export const BUCKET_LABELS: Record<Bucket, string> = {
  OBLIGATIONS: 'Obligaciones',
  LEISURE: 'Entretenimiento',
  OTHER: 'Otros',
};

export const DERIVED_METHOD_LABELS: Record<DerivedMethod, string> = {
  CASH: 'Efectivo',
  BANK: 'Cuenta bancaria',
  DIGITAL_WALLET: 'Billetera digital',
  DEBIT_CARD: 'Tarjeta débito',
  BANK_TRANSFER: 'Transferencia',
  CREDIT_CARD: 'Tarjeta crédito',
  OTHER: 'Otro',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  DEBIT_CARD: 'Tarjeta débito',
  BANK_TRANSFER: 'Transferencia',
  DIGITAL_WALLET: 'Billetera digital',
  OTHER: 'Otro',
};

/** Método de pago para filtros y gráficos: sobrescritura, tarjeta de crédito o tipo de cuenta. */
export function deriveMethod(
  type: TransactionType,
  paymentMethod: PaymentMethod | null,
  accountType: AccountType | null,
): DerivedMethod | null {
  if (type === 'CARD_PURCHASE') return 'CREDIT_CARD';
  if (type !== 'EXPENSE') return null;
  if (paymentMethod) return paymentMethod;
  switch (accountType) {
    case 'CASH':
      return 'CASH';
    case 'BANK':
      return 'BANK';
    case 'DIGITAL_WALLET':
      return 'DIGITAL_WALLET';
    default:
      return 'OTHER';
  }
}
```

- [ ] **Step 4: Implementar `schemas/common.ts`**

```ts
import { z } from 'zod';
import { isValidIsoDate } from '../dates';
import { MAX_AMOUNT } from '../money';

z.config(z.locales.es());

export const zId = z.uuid('Identificador inválido');
export const zAmount = z
  .number('Debe ser un número')
  .int('Debe ser un valor entero')
  .min(1, 'Debe ser mayor que $0')
  .max(MAX_AMOUNT, 'Valor demasiado grande');
export const zNonNegativeAmount = z.number().int().min(0).max(MAX_AMOUNT);
export const zSignedAmount = z.number().int().min(-MAX_AMOUNT).max(MAX_AMOUNT);
export const zIsoDate = z.string().refine(isValidIsoDate, 'Fecha inválida');
export const zColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido');
export const zIcon = z.string().trim().min(1).max(40);
export const zDayOfMonth = z.number().int().min(1).max(31);
export const zName = (max = 60) => z.string().trim().min(1, 'Requerido').max(max);

/** Crear: ausente, null o vacío → null. */
export const zOptionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Editar: usar con `.optional()`; vacío → null (borra el valor). */
export const zNullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));
```

- [ ] **Step 5: Implementar `schemas/auth.ts`, `accounts.ts`, `categories.ts`**

`packages/shared/src/schemas/auth.ts`:
```ts
import { z } from 'zod';
import { THEMES } from '../enums';
import { zName } from './common';

export const zEmail = z.string().trim().toLowerCase().pipe(z.email('Email inválido').max(254));
export const zPassword = z.string().min(8, 'Mínimo 8 caracteres').max(128, 'Máximo 128 caracteres');

export const registerSchema = z.strictObject({ name: zName(80), email: zEmail, password: zPassword });
export const loginSchema = z.strictObject({ email: zEmail, password: z.string().min(1).max(128) });
export const forgotPasswordSchema = z.strictObject({ email: zEmail });
export const resetPasswordSchema = z.strictObject({
  token: z.string().min(20).max(200),
  password: zPassword,
});
export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: zPassword,
});
export const updateMeSchema = z.strictObject({
  name: zName(80).optional(),
  theme: z.enum(THEMES).optional(),
});

export type RegisterInput = z.output<typeof registerSchema>;
export type LoginInput = z.output<typeof loginSchema>;
export type ResetPasswordInput = z.output<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.output<typeof changePasswordSchema>;
export type UpdateMeInput = z.output<typeof updateMeSchema>;
```

`packages/shared/src/schemas/accounts.ts`:
```ts
import { z } from 'zod';
import { ACCOUNT_TYPES } from '../enums';
import {
  zColor,
  zIcon,
  zIsoDate,
  zName,
  zNullableText,
  zOptionalText,
  zSignedAmount,
} from './common';

export const accountCreateSchema = z.strictObject({
  name: zName(60),
  type: z.enum(ACCOUNT_TYPES),
  institution: zOptionalText(60),
  initialBalance: zSignedAmount.default(0),
  openingDate: zIsoDate.optional(),
  icon: zIcon.default('wallet'),
  color: zColor.default('#64748b'),
});

export const accountUpdateSchema = z.strictObject({
  name: zName(60).optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  institution: zNullableText(60).optional(),
  initialBalance: zSignedAmount.optional(),
  openingDate: zIsoDate.optional(),
  icon: zIcon.optional(),
  color: zColor.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export type AccountCreateInput = z.output<typeof accountCreateSchema>;
export type AccountUpdateInput = z.output<typeof accountUpdateSchema>;
```

`packages/shared/src/schemas/categories.ts`:
```ts
import { z } from 'zod';
import { BUCKETS, CATEGORY_KINDS } from '../enums';
import { zColor, zIcon, zId, zName } from './common';

export const categoryCreateSchema = z.strictObject({
  name: zName(40),
  kind: z.enum(CATEGORY_KINDS),
  parentId: zId.nullish().transform((v) => v ?? null),
  bucket: z
    .enum(BUCKETS)
    .nullish()
    .transform((v) => v ?? null),
  icon: zIcon.default('tag'),
  color: zColor.default('#64748b'),
});

export const categoryUpdateSchema = z.strictObject({
  name: zName(40).optional(),
  parentId: zId.nullable().optional(),
  bucket: z.enum(BUCKETS).optional(),
  icon: zIcon.optional(),
  color: zColor.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export type CategoryCreateInput = z.output<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.output<typeof categoryUpdateSchema>;
```

- [ ] **Step 6: Implementar `schemas/credit-cards.ts` y `debts.ts`**

`packages/shared/src/schemas/credit-cards.ts`:
```ts
import { z } from 'zod';
import {
  zAmount,
  zColor,
  zDayOfMonth,
  zIcon,
  zIsoDate,
  zName,
  zNonNegativeAmount,
  zNullableText,
  zOptionalText,
} from './common';

const zInstallments = z.number().int().min(1).max(48);

export const creditCardCreateSchema = z.strictObject({
  name: zName(60),
  issuer: zOptionalText(60),
  creditLimit: zAmount,
  initialDebt: zNonNegativeAmount.default(0),
  initialDebtInstallments: zInstallments.default(1),
  openingDate: zIsoDate.optional(),
  statementDay: zDayOfMonth,
  paymentDueDay: zDayOfMonth,
  icon: zIcon.default('credit-card'),
  color: zColor.default('#7c3aed'),
});

export const creditCardUpdateSchema = z.strictObject({
  name: zName(60).optional(),
  issuer: zNullableText(60).optional(),
  creditLimit: zAmount.optional(),
  initialDebt: zNonNegativeAmount.optional(),
  initialDebtInstallments: zInstallments.optional(),
  openingDate: zIsoDate.optional(),
  statementDay: zDayOfMonth.optional(),
  paymentDueDay: zDayOfMonth.optional(),
  icon: zIcon.optional(),
  color: zColor.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export type CreditCardCreateInput = z.output<typeof creditCardCreateSchema>;
export type CreditCardUpdateInput = z.output<typeof creditCardUpdateSchema>;
```

`packages/shared/src/schemas/debts.ts`:
```ts
import { z } from 'zod';
import {
  zAmount,
  zColor,
  zDayOfMonth,
  zIcon,
  zId,
  zIsoDate,
  zName,
  zNonNegativeAmount,
  zNullableText,
  zOptionalText,
} from './common';

export const debtCreateSchema = z
  .strictObject({
    name: zName(60),
    lender: zOptionalText(60),
    initialBalance: zNonNegativeAmount,
    openingDate: zIsoDate.optional(),
    monthlyPayment: zAmount.nullish().transform((v) => v ?? null),
    paymentDay: zDayOfMonth.nullish().transform((v) => v ?? null),
    receivedInAccountId: zId.nullish().transform((v) => v ?? null),
    icon: zIcon.default('landmark'),
    color: zColor.default('#0f766e'),
  })
  .refine((v) => !v.receivedInAccountId || v.initialBalance > 0, {
    path: ['initialBalance'],
    message: 'Indica el valor recibido',
  });

export const debtUpdateSchema = z.strictObject({
  name: zName(60).optional(),
  lender: zNullableText(60).optional(),
  initialBalance: zNonNegativeAmount.optional(),
  openingDate: zIsoDate.optional(),
  monthlyPayment: zAmount.nullable().optional(),
  paymentDay: zDayOfMonth.nullable().optional(),
  icon: zIcon.optional(),
  color: zColor.optional(),
  isActive: z.boolean().optional(),
});

export const debtPaymentSchema = z.strictObject({
  accountId: zId,
  principal: zAmount,
  interest: zNonNegativeAmount.default(0),
  date: zIsoDate,
  description: zOptionalText(140),
});

export const debtDisbursementSchema = z.strictObject({
  accountId: zId,
  amount: zAmount,
  date: zIsoDate,
  description: zOptionalText(140),
});

export type DebtCreateInput = z.output<typeof debtCreateSchema>;
export type DebtUpdateInput = z.output<typeof debtUpdateSchema>;
export type DebtPaymentInput = z.output<typeof debtPaymentSchema>;
export type DebtDisbursementInput = z.output<typeof debtDisbursementSchema>;
```

- [ ] **Step 7: Implementar `schemas/transactions.ts`**

```ts
import { z } from 'zod';
import { DERIVED_METHODS, PAYMENT_METHODS, TRANSACTION_TYPES } from '../enums';
import { zAmount, zId, zIsoDate, zNonNegativeAmount, zOptionalText } from './common';

const zTags = z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).default([]);
const zInstallments = z.number().int().min(1).max(48);

const base = {
  amount: zAmount,
  date: zIsoDate,
  description: zOptionalText(140),
  payee: zOptionalText(80),
  notes: zOptionalText(500),
  tags: zTags,
};

const transferFields = { ...base, accountId: zId, toAccountId: zId, goalId: zId.nullish() };
const distinctAccounts = (v: { accountId: string; toAccountId: string }) =>
  v.accountId !== v.toAccountId;
const distinctMessage = {
  path: ['toAccountId'],
  message: 'La cuenta destino debe ser distinta de la de origen',
};

export const incomeSchema = z.strictObject({
  type: z.literal('INCOME'),
  ...base,
  accountId: zId,
  categoryId: zId,
});
export const expenseSchema = z.strictObject({
  type: z.literal('EXPENSE'),
  ...base,
  accountId: zId,
  categoryId: zId,
  paymentMethod: z.enum(PAYMENT_METHODS).nullish(),
});
export const transferSchema = z
  .strictObject({ type: z.literal('TRANSFER'), ...transferFields })
  .refine(distinctAccounts, distinctMessage);
const cardPurchaseFields = { ...base, creditCardId: zId, categoryId: zId, installments: zInstallments.default(1) };
export const cardPurchaseSchema = z.strictObject({ type: z.literal('CARD_PURCHASE'), ...cardPurchaseFields });
const cardPaymentFields = { ...base, creditCardId: zId, accountId: zId };
export const cardPaymentSchema = z.strictObject({ type: z.literal('CARD_PAYMENT'), ...cardPaymentFields });
export const debtPaymentTxSchema = z.strictObject({
  type: z.literal('DEBT_PAYMENT'),
  ...base,
  debtId: zId,
  accountId: zId,
  interest: zNonNegativeAmount.default(0),
});
export const debtDisbursementTxSchema = z.strictObject({
  type: z.literal('DEBT_DISBURSEMENT'),
  ...base,
  debtId: zId,
  accountId: zId,
});

export const transactionSchema = z.discriminatedUnion('type', [
  incomeSchema,
  expenseSchema,
  transferSchema,
  cardPurchaseSchema,
  cardPaymentSchema,
  debtPaymentTxSchema,
  debtDisbursementTxSchema,
]);

export const transferBodySchema = z.strictObject(transferFields).refine(distinctAccounts, distinctMessage);
const { creditCardId: _purchaseCard, ...purchaseBody } = cardPurchaseFields;
export const cardPurchaseBodySchema = z.strictObject(purchaseBody);
const { creditCardId: _paymentCard, ...paymentBody } = cardPaymentFields;
export const cardPaymentBodySchema = z.strictObject(paymentBody);

export const transactionListQuerySchema = z.object({
  from: zIsoDate.optional(),
  to: zIsoDate.optional(),
  type: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : undefined))
    .pipe(z.array(z.enum(TRANSACTION_TYPES)).optional()),
  categoryId: zId.optional(),
  accountId: zId.optional(),
  creditCardId: zId.optional(),
  debtId: zId.optional(),
  tag: z.string().trim().toLowerCase().max(30).optional(),
  method: z.enum(DERIVED_METHODS).optional(),
  minAmount: z.coerce.number().int().min(0).optional(),
  maxAmount: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type TransactionInput = z.output<typeof transactionSchema>;
export type TransferBody = z.output<typeof transferBodySchema>;
export type CardPurchaseBody = z.output<typeof cardPurchaseBodySchema>;
export type CardPaymentBody = z.output<typeof cardPaymentBodySchema>;
export type TransactionListQuery = z.output<typeof transactionListQuerySchema>;
```

- [ ] **Step 8: Implementar `dto.ts`**

```ts
import type { IsoDate } from './dates';
import type {
  AccountType,
  Bucket,
  CategoryKind,
  DerivedMethod,
  PaymentMethod,
  Theme,
  TransactionType,
} from './enums';

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  theme: Theme;
  timezone: string;
  createdAt: string;
}

export interface RefDTO {
  id: string;
  name: string;
  icon: string;
  color: string;
}
export interface AccountRefDTO extends RefDTO {
  type: AccountType;
}
export interface CategoryRefDTO extends RefDTO {
  kind: CategoryKind;
  parentId: string | null;
}

export interface AccountDTO {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  initialBalance: number;
  openingDate: IsoDate;
  icon: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  balance: number;
}

export interface CategoryDTO {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  bucket: Bucket | null;
  icon: string;
  color: string;
  isSystem: boolean;
  systemKey: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface TagDTO {
  id: string;
  name: string;
  usageCount: number;
}

export interface CreditCardDTO {
  id: string;
  name: string;
  issuer: string | null;
  creditLimit: number;
  initialDebt: number;
  initialDebtInstallments: number;
  openingDate: IsoDate;
  statementDay: number;
  paymentDueDay: number;
  icon: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  /** Puede ser negativa (saldo a favor). */
  debt: number;
  available: number;
  /** debt / creditLimit, mínimo 0. */
  utilization: number;
  /** Pago del mes estimado (≥ 0) y su fecha. */
  amountDue: number;
  dueDate: IsoDate;
  isOverdue: boolean;
  lastCutoff: IsoDate;
  nextCutoff: IsoDate;
  nextDueDate: IsoDate;
  /** Facturado + próximo corte − pagos (≥ 0). */
  committed: number;
}

export interface CardInstallmentDTO {
  cutoff: IsoDate;
  dueDate: IsoDate;
  amount: number;
}

export interface CardStatementDTO {
  card: CreditCardDTO;
  upcoming: CardInstallmentDTO[];
}

export interface DebtDTO {
  id: string;
  name: string;
  lender: string | null;
  initialBalance: number;
  openingDate: IsoDate;
  monthlyPayment: number | null;
  paymentDay: number | null;
  icon: string;
  color: string;
  isActive: boolean;
  balance: number;
  /** Cuota pendiente del mes en curso (≥ 0). */
  installmentDue: number;
  nextPaymentDate: IsoDate | null;
}

export interface TransactionDTO {
  id: string;
  type: TransactionType;
  amount: number;
  date: IsoDate;
  description: string | null;
  payee: string | null;
  notes: string | null;
  account: AccountRefDTO | null;
  toAccount: AccountRefDTO | null;
  creditCard: RefDTO | null;
  debt: RefDTO | null;
  category: CategoryRefDTO | null;
  goalId: string | null;
  installments: number | null;
  paymentMethod: PaymentMethod | null;
  method: DerivedMethod | null;
  parentId: string | null;
  /** Intereses (gasto hijo) de un DEBT_PAYMENT; 0 en otros tipos. */
  interest: number;
  tags: string[];
  createdAt: string;
}

export type WarningCode = 'NEGATIVE_BALANCE' | 'OVER_CREDIT_LIMIT' | 'BEFORE_OPENING_DATE';

export interface TransactionResultDTO {
  transaction: TransactionDTO;
  warnings: WarningCode[];
}

export interface BreakdownItem {
  key: string;
  label: string;
  amount: number;
}

export interface DashboardDTO {
  greetingName: string;
  today: IsoDate;
  month: string;
  money: { total: number; liquid: number; savings: number; investment: number; accounts: AccountDTO[] };
  available: { total: number; breakdown: BreakdownItem[] };
  debts: { cards: number; loans: number; total: number };
  netWorth: number;
  thisMonth: {
    income: number;
    expense: number;
    savings: number;
    investment: number;
    remaining: number;
    savingsRate: number | null;
    savingsTargetPct: number;
  };
  cards: CreditCardDTO[];
  loans: DebtDTO[];
}
```

- [ ] **Step 9: Actualizar `index.ts`**

```ts
export * from './money';
export * from './dates';
export * from './enums';
export * from './dto';
export * from './schemas/common';
export * from './schemas/auth';
export * from './schemas/accounts';
export * from './schemas/categories';
export * from './schemas/credit-cards';
export * from './schemas/debts';
export * from './schemas/transactions';
```

- [ ] **Step 10: Verificar**

Run: `npm test -w @finanzas/shared && npm run typecheck -w @finanzas/shared`
Expected: PASS y sin errores de tipos. Si `z.locales.es` no existe en la versión instalada, revisar `node_modules/zod` (`z.locales`) y usar el nombre exportado; los mensajes propios de cada esquema ya están en español.

---

### Task 4: Paquete API, esquema Prisma, migraciones y restricciones en base de datos

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/prisma.config.ts`, `apps/api/.env.example`, `apps/api/vitest.config.ts`, `apps/api/prisma/schema.prisma`, `apps/api/src/lib/prisma.ts`, `apps/api/src/lib/db.ts`, `apps/api/test/global-setup.ts`
- Create (generadas): `apps/api/prisma/migrations/<timestamp>_init/migration.sql`, `apps/api/prisma/migrations/<timestamp>_constraints/migration.sql`
- Test: `apps/api/test/db-constraints.test.ts`

**Interfaces:**
- Produces:
  - Cliente Prisma generado en `apps/api/src/generated/prisma` (`import { PrismaClient, Prisma } from '../generated/prisma/client'`).
  - `createPrisma(databaseUrl: string): PrismaClient`; `type DbClient = PrismaClient | Prisma.TransactionClient`.
  - `toDbDate(iso: IsoDate): Date`, `fromDbDate(d: Date): IsoDate`, `num(v: bigint | number | null | undefined): number`.
  - Selector compuesto `id_userId` en todos los modelos de negocio (por `@@unique([id, userId])`).
  - Todas las FK compuestas usan `onDelete: NoAction` (se verifica al final de la sentencia, así el borrado en cascada de un usuario no falla por orden), salvo las cascadas: hijos de `Transaction` (`parentId`), `TransactionTag`, `BudgetCategory` desde `Budget`, y todo desde `User`.

- [ ] **Step 1: Crear `apps/api/package.json` y `tsconfig.json`**

```json
{
  "name": "@finanzas/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "prisma generate && tsup",
    "start": "node dist/server.js",
    "typecheck": "prisma generate && tsc --noEmit",
    "test": "prisma generate && vitest run",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:generate": "prisma generate",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@fastify/cookie": "^11.1.2",
    "@fastify/cors": "^11.3.0",
    "@fastify/helmet": "^13.1.1",
    "@fastify/rate-limit": "^11.2.0",
    "@finanzas/shared": "*",
    "@node-rs/argon2": "^2.2.2",
    "@prisma/adapter-pg": "7.10.0",
    "@prisma/client": "7.10.0",
    "dotenv": "^18.0.5",
    "fastify": "^5.12.5",
    "nodemailer": "^10.0.15",
    "pg": "^8.23.1",
    "prisma": "7.10.0",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@types/node": "^22.20.5",
    "@types/nodemailer": "^8.0.2",
    "@types/pg": "^8.23.1",
    "tsup": "^8.5.1",
    "tsx": "^4.23.15",
    "vitest": "^5.0.3"
  }
}
```

`prisma` va en `dependencies` porque el contenedor de producción ejecuta `prisma migrate deploy` al arrancar.

`apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test", "prisma", "prisma.config.ts", "tsup.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 2: Crear `prisma.config.ts` y `.env.example`**

`apps/api/prisma.config.ts`:
```ts
import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

config({ quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: env('DATABASE_URL') },
});
```

`apps/api/.env.example` (copiar a `apps/api/.env` para desarrollo local):
```
NODE_ENV=development
DATABASE_URL=postgresql://finanzas:finanzas@localhost:5432/finanzas
APP_URL=http://localhost:5173
ALLOW_REGISTRATION=true
LOG_LEVEL=info
```

Run: `cp apps/api/.env.example apps/api/.env`

- [ ] **Step 3: Escribir `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum AccountType {
  CASH
  BANK
  DIGITAL_WALLET
  SAVINGS
  INVESTMENT
  OTHER
}

enum TransactionType {
  INCOME
  EXPENSE
  TRANSFER
  CARD_PURCHASE
  CARD_PAYMENT
  DEBT_PAYMENT
  DEBT_DISBURSEMENT
}

enum CategoryKind {
  INCOME
  EXPENSE
}

enum Bucket {
  OBLIGATIONS
  LEISURE
  OTHER
}

enum PaymentMethod {
  CASH
  DEBIT_CARD
  BANK_TRANSFER
  DIGITAL_WALLET
  OTHER
}

enum Frequency {
  WEEKLY
  SEMIMONTHLY
  MONTHLY
  YEARLY
  CUSTOM_DAYS
}

enum ScheduledKind {
  INCOME
  EXPENSE
}

enum ScheduledStatus {
  PENDING
  DONE
  SKIPPED
}

enum GoalStatus {
  ACTIVE
  COMPLETED
  ARCHIVED
}

enum Theme {
  SYSTEM
  LIGHT
  DARK
}

model User {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name         String   @db.VarChar(80)
  email        String   @unique @db.VarChar(254)
  passwordHash String
  theme        Theme    @default(SYSTEM)
  timezone     String   @default("America/Bogota") @db.VarChar(64)
  createdAt    DateTime @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt @db.Timestamptz(3)

  sessions         Session[]
  resetTokens      PasswordResetToken[]
  config           FinancialConfiguration?
  accounts         Account[]
  creditCards      CreditCard[]
  debts            Debt[]
  categories       Category[]
  tags             Tag[]
  transactions     Transaction[]
  transactionTags  TransactionTag[]
  budgets          Budget[]
  budgetCategories BudgetCategory[]
  goals            Goal[]
  recurringRules   RecurringRule[]
  scheduledItems   ScheduledItem[]
  dismissedAlerts  DismissedAlert[]
}

model Session {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId     String   @db.Uuid
  tokenHash  String   @unique @db.Char(64)
  expiresAt  DateTime @db.Timestamptz(3)
  lastUsedAt DateTime @default(now()) @db.Timestamptz(3)
  createdAt  DateTime @default(now()) @db.Timestamptz(3)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model PasswordResetToken {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String    @db.Uuid
  tokenHash String    @unique @db.Char(64)
  expiresAt DateTime  @db.Timestamptz(3)
  usedAt    DateTime? @db.Timestamptz(3)
  createdAt DateTime  @default(now()) @db.Timestamptz(3)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model FinancialConfiguration {
  userId                String   @id @db.Uuid
  obligationsPct        Int      @default(50) @db.SmallInt
  savingsPct            Int      @default(20) @db.SmallInt
  investmentPct         Int      @default(10) @db.SmallInt
  leisurePct            Int      @default(10) @db.SmallInt
  otherPct              Int      @default(10) @db.SmallInt
  monthlyIncomeEstimate BigInt?
  lowBalanceThreshold   BigInt   @default(100000)
  createdAt             DateTime @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime @updatedAt @db.Timestamptz(3)
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Account {
  id             String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId         String      @db.Uuid
  name           String      @db.VarChar(60)
  type           AccountType
  institution    String?     @db.VarChar(60)
  initialBalance BigInt      @default(0)
  openingDate    DateTime    @db.Date
  icon           String      @db.VarChar(40)
  color          String      @db.VarChar(7)
  isActive       Boolean     @default(true)
  sortOrder      Int         @default(0)
  createdAt      DateTime    @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime    @updatedAt @db.Timestamptz(3)

  user              User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions      Transaction[]   @relation("TransactionAccount")
  incomingTransfers Transaction[]   @relation("TransactionToAccount")
  goals             Goal[]
  recurringRules    RecurringRule[]
  scheduledItems    ScheduledItem[]

  @@unique([userId, name])
  @@unique([id, userId])
}

model CreditCard {
  id                      String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId                  String   @db.Uuid
  name                    String   @db.VarChar(60)
  issuer                  String?  @db.VarChar(60)
  creditLimit             BigInt
  initialDebt             BigInt   @default(0)
  initialDebtInstallments Int      @default(1) @db.SmallInt
  openingDate             DateTime @db.Date
  statementDay            Int      @db.SmallInt
  paymentDueDay           Int      @db.SmallInt
  icon                    String   @db.VarChar(40)
  color                   String   @db.VarChar(7)
  isActive                Boolean  @default(true)
  sortOrder               Int      @default(0)
  createdAt               DateTime @default(now()) @db.Timestamptz(3)
  updatedAt               DateTime @updatedAt @db.Timestamptz(3)

  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions   Transaction[]
  recurringRules RecurringRule[]
  scheduledItems ScheduledItem[]

  @@unique([userId, name])
  @@unique([id, userId])
}

model Debt {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId         String   @db.Uuid
  name           String   @db.VarChar(60)
  lender         String?  @db.VarChar(60)
  initialBalance BigInt   @default(0)
  openingDate    DateTime @db.Date
  monthlyPayment BigInt?
  paymentDay     Int?     @db.SmallInt
  icon           String   @db.VarChar(40)
  color          String   @db.VarChar(7)
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime @updatedAt @db.Timestamptz(3)

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions Transaction[]

  @@unique([userId, name])
  @@unique([id, userId])
}

model Category {
  id        String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String       @db.Uuid
  name      String       @db.VarChar(40)
  kind      CategoryKind
  parentId  String?      @db.Uuid
  bucket    Bucket?
  icon      String       @db.VarChar(40)
  color     String       @db.VarChar(7)
  isSystem  Boolean      @default(false)
  systemKey String?      @db.VarChar(30)
  isActive  Boolean      @default(true)
  sortOrder Int          @default(0)
  createdAt DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt DateTime     @updatedAt @db.Timestamptz(3)

  user             User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  parent           Category?        @relation("CategoryTree", fields: [parentId, userId], references: [id, userId], onDelete: NoAction)
  children         Category[]       @relation("CategoryTree")
  transactions     Transaction[]
  budgetCategories BudgetCategory[]
  recurringRules   RecurringRule[]
  scheduledItems   ScheduledItem[]

  @@unique([userId, kind, parentId, name])
  @@unique([userId, systemKey])
  @@unique([id, userId])
}

model Tag {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @db.Uuid
  name      String   @db.VarChar(30)
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  user         User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions TransactionTag[]

  @@unique([userId, name])
  @@unique([id, userId])
}

model TransactionTag {
  userId        String @db.Uuid
  transactionId String @db.Uuid
  tagId         String @db.Uuid

  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  transaction Transaction @relation(fields: [transactionId, userId], references: [id, userId], onDelete: Cascade)
  tag         Tag         @relation(fields: [tagId, userId], references: [id, userId], onDelete: Cascade)

  @@id([transactionId, tagId])
  @@index([userId, tagId])
}

model Transaction {
  id            String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId        String          @db.Uuid
  type          TransactionType
  amount        BigInt
  date          DateTime        @db.Date
  description   String?         @db.VarChar(140)
  payee         String?         @db.VarChar(80)
  notes         String?         @db.VarChar(500)
  accountId     String?         @db.Uuid
  toAccountId   String?         @db.Uuid
  creditCardId  String?         @db.Uuid
  debtId        String?         @db.Uuid
  categoryId    String?         @db.Uuid
  goalId        String?         @db.Uuid
  installments  Int?            @db.SmallInt
  paymentMethod PaymentMethod?
  parentId      String?         @db.Uuid
  createdAt     DateTime        @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime        @updatedAt @db.Timestamptz(3)

  user          User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  account       Account?         @relation("TransactionAccount", fields: [accountId, userId], references: [id, userId], onDelete: NoAction)
  toAccount     Account?         @relation("TransactionToAccount", fields: [toAccountId, userId], references: [id, userId], onDelete: NoAction)
  creditCard    CreditCard?      @relation(fields: [creditCardId, userId], references: [id, userId], onDelete: NoAction)
  debt          Debt?            @relation(fields: [debtId, userId], references: [id, userId], onDelete: NoAction)
  category      Category?        @relation(fields: [categoryId, userId], references: [id, userId], onDelete: NoAction)
  goal          Goal?            @relation(fields: [goalId, userId], references: [id, userId], onDelete: NoAction)
  parent        Transaction?     @relation("TransactionChildren", fields: [parentId, userId], references: [id, userId], onDelete: Cascade)
  children      Transaction[]    @relation("TransactionChildren")
  tags          TransactionTag[]
  scheduledItem ScheduledItem?

  @@unique([id, userId])
  @@index([userId, date(sort: Desc), createdAt(sort: Desc)])
  @@index([userId, accountId])
  @@index([userId, toAccountId])
  @@index([userId, creditCardId, date])
  @@index([userId, debtId])
  @@index([userId, categoryId, date])
  @@index([userId, type, date])
  @@index([parentId])
  @@index([goalId])
}

model Budget {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String   @db.Uuid
  month       DateTime @db.Date
  totalAmount BigInt?
  createdAt   DateTime @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @db.Timestamptz(3)

  user       User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  categories BudgetCategory[]

  @@unique([userId, month])
  @@unique([id, userId])
}

model BudgetCategory {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId     String   @db.Uuid
  budgetId   String   @db.Uuid
  categoryId String   @db.Uuid
  amount     BigInt
  createdAt  DateTime @default(now()) @db.Timestamptz(3)
  updatedAt  DateTime @updatedAt @db.Timestamptz(3)

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  budget   Budget   @relation(fields: [budgetId, userId], references: [id, userId], onDelete: Cascade)
  category Category @relation(fields: [categoryId, userId], references: [id, userId], onDelete: NoAction)

  @@unique([budgetId, categoryId])
}

model Goal {
  id            String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId        String     @db.Uuid
  name          String     @db.VarChar(60)
  targetAmount  BigInt
  targetDate    DateTime?  @db.Date
  accountId     String     @db.Uuid
  initialAmount BigInt     @default(0)
  status        GoalStatus @default(ACTIVE)
  icon          String     @db.VarChar(40)
  color         String     @db.VarChar(7)
  createdAt     DateTime   @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime   @updatedAt @db.Timestamptz(3)

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  account      Account       @relation(fields: [accountId, userId], references: [id, userId], onDelete: NoAction)
  transactions Transaction[]

  @@unique([id, userId])
}

model RecurringRule {
  id           String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String        @db.Uuid
  name         String        @db.VarChar(60)
  kind         ScheduledKind
  amount       BigInt
  categoryId   String        @db.Uuid
  accountId    String?       @db.Uuid
  creditCardId String?       @db.Uuid
  frequency    Frequency
  intervalDays Int?          @db.SmallInt
  day1         Int?          @db.SmallInt
  day2         Int?          @db.SmallInt
  startDate    DateTime      @db.Date
  endDate      DateTime?     @db.Date
  isActive     Boolean       @default(true)
  createdAt    DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime      @updatedAt @db.Timestamptz(3)

  user       User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  category   Category        @relation(fields: [categoryId, userId], references: [id, userId], onDelete: NoAction)
  account    Account?        @relation(fields: [accountId, userId], references: [id, userId], onDelete: NoAction)
  creditCard CreditCard?     @relation(fields: [creditCardId, userId], references: [id, userId], onDelete: NoAction)
  items      ScheduledItem[]

  @@unique([id, userId])
}

model ScheduledItem {
  id              String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId          String          @db.Uuid
  recurringRuleId String?         @db.Uuid
  kind            ScheduledKind
  name            String          @db.VarChar(60)
  amount          BigInt
  dueDate         DateTime        @db.Date
  categoryId      String          @db.Uuid
  accountId       String?         @db.Uuid
  creditCardId    String?         @db.Uuid
  status          ScheduledStatus @default(PENDING)
  transactionId   String?         @db.Uuid
  createdAt       DateTime        @default(now()) @db.Timestamptz(3)
  updatedAt       DateTime        @updatedAt @db.Timestamptz(3)

  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  recurringRule RecurringRule? @relation(fields: [recurringRuleId, userId], references: [id, userId], onDelete: NoAction)
  category      Category       @relation(fields: [categoryId, userId], references: [id, userId], onDelete: NoAction)
  account       Account?       @relation(fields: [accountId, userId], references: [id, userId], onDelete: NoAction)
  creditCard    CreditCard?    @relation(fields: [creditCardId, userId], references: [id, userId], onDelete: NoAction)
  transaction   Transaction?   @relation(fields: [transactionId, userId], references: [id, userId], onDelete: NoAction)

  @@unique([recurringRuleId, dueDate])
  @@unique([transactionId, userId])
  @@index([userId, status, dueDate])
}

model DismissedAlert {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String   @db.Uuid
  key         String   @db.VarChar(120)
  dismissedAt DateTime @default(now()) @db.Timestamptz(3)
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, key])
}
```

- [ ] **Step 4: Generar la migración inicial**

Run (desde `apps/api`, con `db-dev` corriendo): `npm install` (raíz) y luego `npx prisma migrate dev --name init`
Expected: crea `prisma/migrations/<ts>_init/migration.sql`, la aplica a `finanzas` y genera el cliente en `src/generated/prisma`. Si Prisma rechaza el esquema por las relaciones compuestas que comparten `userId`, el mensaje lo indica; la corrección esperada es mantener `onDelete: NoAction` explícito en cada relación compuesta (nunca `SetNull`, porque `userId` es obligatorio).

- [ ] **Step 5: Crear la migración de restricciones**

Run: `npx prisma migrate dev --create-only --name constraints`
Reemplazar el contenido del `migration.sql` creado por:

```sql
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amount_check"
  CHECK ("amount" > 0 AND "amount" <= 1000000000000);

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_shape_check" CHECK (
  CASE "type"
    WHEN 'INCOME' THEN "accountId" IS NOT NULL AND "categoryId" IS NOT NULL
      AND "toAccountId" IS NULL AND "creditCardId" IS NULL AND "debtId" IS NULL AND "goalId" IS NULL
      AND "installments" IS NULL AND "paymentMethod" IS NULL AND "parentId" IS NULL
    WHEN 'EXPENSE' THEN "accountId" IS NOT NULL AND "categoryId" IS NOT NULL
      AND "toAccountId" IS NULL AND "creditCardId" IS NULL AND "debtId" IS NULL AND "goalId" IS NULL
      AND "installments" IS NULL
    WHEN 'TRANSFER' THEN "accountId" IS NOT NULL AND "toAccountId" IS NOT NULL
      AND "accountId" <> "toAccountId"
      AND "categoryId" IS NULL AND "creditCardId" IS NULL AND "debtId" IS NULL
      AND "installments" IS NULL AND "paymentMethod" IS NULL AND "parentId" IS NULL
    WHEN 'CARD_PURCHASE' THEN "creditCardId" IS NOT NULL AND "categoryId" IS NOT NULL
      AND "installments" BETWEEN 1 AND 48
      AND "accountId" IS NULL AND "toAccountId" IS NULL AND "debtId" IS NULL AND "goalId" IS NULL
      AND "paymentMethod" IS NULL AND "parentId" IS NULL
    WHEN 'CARD_PAYMENT' THEN "creditCardId" IS NOT NULL AND "accountId" IS NOT NULL
      AND "toAccountId" IS NULL AND "debtId" IS NULL AND "categoryId" IS NULL AND "goalId" IS NULL
      AND "installments" IS NULL AND "paymentMethod" IS NULL AND "parentId" IS NULL
    WHEN 'DEBT_PAYMENT' THEN "debtId" IS NOT NULL AND "accountId" IS NOT NULL
      AND "toAccountId" IS NULL AND "creditCardId" IS NULL AND "categoryId" IS NULL AND "goalId" IS NULL
      AND "installments" IS NULL AND "paymentMethod" IS NULL AND "parentId" IS NULL
    WHEN 'DEBT_DISBURSEMENT' THEN "debtId" IS NOT NULL AND "accountId" IS NOT NULL
      AND "toAccountId" IS NULL AND "creditCardId" IS NULL AND "categoryId" IS NULL AND "goalId" IS NULL
      AND "installments" IS NULL AND "paymentMethod" IS NULL AND "parentId" IS NULL
    ELSE false
  END
);

ALTER TABLE "FinancialConfiguration" ADD CONSTRAINT "FinancialConfiguration_values_check" CHECK (
  "obligationsPct" BETWEEN 0 AND 100 AND "savingsPct" BETWEEN 0 AND 100
  AND "investmentPct" BETWEEN 0 AND 100 AND "leisurePct" BETWEEN 0 AND 100
  AND "otherPct" BETWEEN 0 AND 100
  AND "obligationsPct" + "savingsPct" + "investmentPct" + "leisurePct" + "otherPct" = 100
  AND ("monthlyIncomeEstimate" IS NULL OR "monthlyIncomeEstimate" > 0)
  AND "lowBalanceThreshold" >= 0
);

ALTER TABLE "Account" ADD CONSTRAINT "Account_values_check" CHECK (
  "initialBalance" BETWEEN -1000000000000 AND 1000000000000
  AND "color" ~ '^#[0-9a-fA-F]{6}$'
);

ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_values_check" CHECK (
  "creditLimit" > 0 AND "initialDebt" >= 0
  AND "initialDebtInstallments" BETWEEN 1 AND 48
  AND "statementDay" BETWEEN 1 AND 31 AND "paymentDueDay" BETWEEN 1 AND 31
);

ALTER TABLE "Debt" ADD CONSTRAINT "Debt_values_check" CHECK (
  "initialBalance" >= 0
  AND ("monthlyPayment" IS NULL OR "monthlyPayment" > 0)
  AND ("paymentDay" IS NULL OR "paymentDay" BETWEEN 1 AND 31)
);

ALTER TABLE "Category" ADD CONSTRAINT "Category_bucket_check" CHECK (
  ("kind" = 'EXPENSE' AND "bucket" IS NOT NULL) OR ("kind" = 'INCOME' AND "bucket" IS NULL)
);
ALTER TABLE "Category" ADD CONSTRAINT "Category_not_self_parent" CHECK (
  "parentId" IS NULL OR "parentId" <> "id"
);

ALTER TABLE "Budget" ADD CONSTRAINT "Budget_values_check" CHECK (
  ("totalAmount" IS NULL OR "totalAmount" > 0) AND EXTRACT(DAY FROM "month") = 1
);
ALTER TABLE "BudgetCategory" ADD CONSTRAINT "BudgetCategory_amount_check" CHECK ("amount" > 0);

ALTER TABLE "Goal" ADD CONSTRAINT "Goal_values_check" CHECK (
  "targetAmount" > 0 AND "initialAmount" >= 0
);

ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_values_check" CHECK (
  "amount" > 0
  AND (("kind" = 'INCOME' AND "accountId" IS NOT NULL AND "creditCardId" IS NULL)
    OR ("kind" = 'EXPENSE' AND (("accountId" IS NULL) <> ("creditCardId" IS NULL))))
  AND (("frequency" = 'CUSTOM_DAYS') = ("intervalDays" IS NOT NULL))
  AND ("intervalDays" IS NULL OR "intervalDays" >= 1)
  AND ("day1" IS NULL OR "day1" BETWEEN 1 AND 31)
  AND ("day2" IS NULL OR "day2" BETWEEN 1 AND 31)
  AND ("endDate" IS NULL OR "endDate" >= "startDate")
);

ALTER TABLE "ScheduledItem" ADD CONSTRAINT "ScheduledItem_values_check" CHECK (
  "amount" > 0
  AND (("kind" = 'INCOME' AND "accountId" IS NOT NULL AND "creditCardId" IS NULL)
    OR ("kind" = 'EXPENSE' AND (("accountId" IS NULL) <> ("creditCardId" IS NULL))))
);
```

Run: `npx prisma migrate dev`
Expected: aplica `constraints` sin errores. Luego `npx prisma migrate dev --create-only --name drift_check` debe responder que no hay cambios (Prisma no gestiona los `CHECK` y no intenta borrarlos); si crea un archivo vacío, borrarlo.

- [ ] **Step 6: Crear `src/lib/prisma.ts` y `src/lib/db.ts`**

`apps/api/src/lib/prisma.ts`:
```ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
```

`apps/api/src/lib/db.ts`:
```ts
import type { IsoDate } from '@finanzas/shared';

/** `DATE` de Postgres ↔ `YYYY-MM-DD` (Prisma lo entrega como medianoche UTC). */
export const toDbDate = (iso: IsoDate): Date => new Date(`${iso}T00:00:00.000Z`);
export const fromDbDate = (date: Date): IsoDate => date.toISOString().slice(0, 10);

/** `bigint` de Prisma → `number` (exacto hasta 9×10¹⁵). */
export const num = (value: bigint | number | null | undefined): number =>
  value == null ? 0 : Number(value);
```

- [ ] **Step 7: Configurar Vitest y el setup de la base de pruebas**

`apps/api/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://finanzas:finanzas@localhost:5433/finanzas_test';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['src/**/*.test.ts'] } },
      {
        test: {
          name: 'integration',
          include: ['test/**/*.test.ts'],
          globalSetup: ['test/global-setup.ts'],
          env: {
            NODE_ENV: 'test',
            DATABASE_URL: TEST_DATABASE_URL,
            APP_URL: 'http://localhost:5173',
            RATE_LIMIT_MAX: '100000',
          },
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
```

`apps/api/test/global-setup.ts`:
```ts
import { execSync } from 'node:child_process';

export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://finanzas:finanzas@localhost:5433/finanzas_test';
  execSync('npx prisma migrate reset --force', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
```

Si `migrate reset` de Prisma 7 ejecuta el seed automáticamente, agregar `--skip-seed`; si esa opción no existe, el comando no siembra y queda como está.

- [ ] **Step 8: Escribir los tests de restricciones**

`apps/api/test/db-constraints.test.ts`:
```ts
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
    data: { userId: user.id, name: 'Comida', kind: 'EXPENSE', bucket: 'OBLIGATIONS', icon: 'x', color: '#123456' },
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
      data: { userId: a.user.id, name: 'Nequi', type: 'DIGITAL_WALLET', openingDate: toDbDate('2026-10-01'), icon: 'x', color: '#123456' },
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
        data: { userId: a.user.id, type: 'CARD_PAYMENT', amount: 1000n, date: toDbDate('2026-10-06'), accountId: a.account.id },
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
});
```

- [ ] **Step 9: Ejecutar**

Run: `npm test -w @finanzas/api`
Expected: PASS de los 7 tests de `db-constraints` (el proyecto `unit` aún no tiene archivos; si Vitest falla por "no test files" en ese proyecto, agregar `passWithNoTests: true` en la raíz de `test`).

---

### Task 5: Esqueleto de la API — configuración, errores, seguridad, salud y logs

**Files:**
- Create: `apps/api/src/config/env.ts`, `apps/api/src/lib/errors.ts`, `apps/api/src/lib/validation.ts`, `apps/api/src/lib/mailer.ts`, `apps/api/src/plugins/errors.ts`, `apps/api/src/plugins/security.ts`, `apps/api/src/types/fastify.d.ts`, `apps/api/src/modules/health/routes.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/tsup.config.ts`, `apps/api/test/helpers.ts`
- Test: `apps/api/test/app.test.ts`, `apps/api/src/config/env.test.ts`

**Interfaces:**
- Consumes: `createPrisma` (Task 4).
- Produces:
  - `loadConfig(env?): AppConfig` con `nodeEnv`, `isProduction`, `host`, `port`, `databaseUrl`, `appUrl`, `appOrigin`, `allowRegistration`, `sessionTtlDays`, `corsOrigins: string[]`, `logLevel`, `rateLimitMax`, `loginMaxAttempts`, `cookieSecure`, `smtp: SmtpConfig | null`.
  - `class AppError(statusCode, code, message, fields?)`, `notFound(message)`, `badRequest(code, message, fields?)`, `conflict(code, message)`.
  - `parse(schema, data)` → datos validados o `AppError(400, 'VALIDATION_ERROR', …, fields)`.
  - `interface Mailer { send(m: MailMessage) }`, `createMailer(config, log)`, `class MemoryMailer` (con `messages`).
  - `buildApp(config, deps?: { prisma?, mailer?, now? }): Promise<FastifyInstance>`; decoraciones `app.config`, `app.prisma`, `app.mailer`, `app.now`, `app.authenticate` (Task 6), `request.auth: AuthContext`.
  - `interface AuthContext { userId; sessionId; timezone; today: IsoDate }` en `src/types/fastify.d.ts`.
  - Helpers de test: `createTestApp(overrides?, deps?)` → `{ app, mailer }`; `client(app, cookie?)` → `{ get, post, put, patch, del }` que devuelven `{ status, body }`.

- [ ] **Step 1: Escribir tests que fallan**

`apps/api/src/config/env.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from './env';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', APP_URL: 'https://finanzas.example.com' };

describe('loadConfig', () => {
  it('applies defaults and derives the origin', () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({
      nodeEnv: 'development',
      port: 3000,
      allowRegistration: true,
      sessionTtlDays: 30,
      appOrigin: 'https://finanzas.example.com',
      corsOrigins: [],
      smtp: null,
      cookieSecure: false,
    });
  });

  it('treats empty strings as missing and fails on required values', () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...base, APP_URL: 'no-es-url' })).toThrow(/APP_URL/);
    expect(loadConfig({ ...base, RATE_LIMIT_MAX: '' }).rateLimitMax).toBe(300);
  });

  it('parses booleans, lists and SMTP', () => {
    const c = loadConfig({
      ...base,
      NODE_ENV: 'production',
      ALLOW_REGISTRATION: 'false',
      CORS_ORIGINS: 'https://a.example.com, https://b.example.com',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
    });
    expect(c.allowRegistration).toBe(false);
    expect(c.cookieSecure).toBe(true);
    expect(c.corsOrigins).toEqual(['https://a.example.com', 'https://b.example.com']);
    expect(c.smtp).toMatchObject({ host: 'smtp.example.com', port: 587, secure: false, user: 'user' });
  });
});
```

`apps/api/test/app.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config/env';
import { AppError } from '../src/lib/errors';
import { MemoryMailer } from '../src/lib/mailer';
import { parse } from '../src/lib/validation';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(loadConfig(), { mailer: new MemoryMailer() });
  app.post('/api/test/echo', async (req) => parse(z.strictObject({ amount: z.number().int() }), req.body));
  app.get('/api/test/app-error', async () => {
    throw new AppError(409, 'SOMETHING', 'Algo en conflicto.');
  });
  app.get('/api/test/crash', async () => {
    throw new Error('secret internal detail');
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('app skeleton', () => {
  it('reports health with database access', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('formats validation errors with field messages', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/test/echo', payload: { amount: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(res.json().error.fields.amount).toBeTypeOf('string');
  });

  it('formats AppError and hides internal errors', async () => {
    const conflict = await app.inject({ method: 'GET', url: '/api/test/app-error' });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: { code: 'SOMETHING', message: 'Algo en conflicto.' } });

    const crash = await app.inject({ method: 'GET', url: '/api/test/crash' });
    expect(crash.statusCode).toBe(500);
    expect(crash.body).not.toContain('secret');
    expect(crash.json().error.code).toBe('INTERNAL');
  });

  it('rejects mutating requests from foreign origins', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/test/echo',
      payload: { amount: 1 },
      headers: { origin: 'https://evil.example.com' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ORIGIN_NOT_ALLOWED');

    const ok = await app.inject({
      method: 'POST',
      url: '/api/test/echo',
      payload: { amount: 1 },
      headers: { origin: 'http://localhost:5173' },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('rejects text/plain bodies (CSRF simple requests)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/test/echo',
      payload: '{"amount":1}',
      headers: { 'content-type': 'text/plain' },
    });
    expect(res.statusCode).toBe(415);
  });

  it('sets security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api`
Expected: FAIL — no existen `src/app`, `src/config/env`, etc.

- [ ] **Step 3: Implementar `config/env.ts`**

```ts
import { z } from 'zod';

const bool = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string('DATABASE_URL es obligatoria').min(1, 'DATABASE_URL es obligatoria'),
  APP_URL: z.url('APP_URL debe ser una URL completa, por ejemplo https://finanzas.midominio.com'),
  ALLOW_REGISTRATION: bool('true'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CORS_ORIGINS: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).default(587),
  SMTP_SECURE: bool('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Finanzas <no-reply@localhost>'),
});

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  host: string;
  port: number;
  databaseUrl: string;
  appUrl: string;
  appOrigin: string;
  allowRegistration: boolean;
  sessionTtlDays: number;
  corsOrigins: string[];
  logLevel: string;
  rateLimitMax: number;
  loginMaxAttempts: number;
  cookieSecure: boolean;
  smtp: SmtpConfig | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Docker Compose entrega variables vacías como ''; se tratan como ausentes.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${details}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  return {
    nodeEnv: e.NODE_ENV,
    isProduction,
    host: e.HOST,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    appUrl: e.APP_URL.replace(/\/$/, ''),
    appOrigin: new URL(e.APP_URL).origin,
    allowRegistration: e.ALLOW_REGISTRATION,
    sessionTtlDays: e.SESSION_TTL_DAYS,
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    logLevel: e.LOG_LEVEL,
    rateLimitMax: e.RATE_LIMIT_MAX,
    loginMaxAttempts: e.LOGIN_MAX_ATTEMPTS,
    cookieSecure: isProduction,
    smtp: e.SMTP_HOST
      ? {
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          secure: e.SMTP_SECURE,
          user: e.SMTP_USER,
          pass: e.SMTP_PASS,
          from: e.SMTP_FROM,
        }
      : null,
  };
}
```

- [ ] **Step 4: Implementar `lib/errors.ts`, `lib/validation.ts`, `lib/mailer.ts`**

`apps/api/src/lib/errors.ts`:
```ts
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (message: string) => new AppError(404, 'NOT_FOUND', message);
export const badRequest = (code: string, message: string, fields?: Record<string, string>) =>
  new AppError(400, code, message, fields);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
```

`apps/api/src/lib/validation.ts`:
```ts
import type { z } from 'zod';
import { AppError } from './errors';

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw new AppError(400, 'VALIDATION_ERROR', 'Revisa los datos ingresados.', fields);
}
```

`apps/api/src/lib/mailer.ts`:
```ts
import nodemailer from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export function createMailer(config: AppConfig, log: FastifyBaseLogger): Mailer {
  const smtp = config.smtp;
  if (smtp) {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
    return {
      async send(message) {
        await transport.sendMail({ from: smtp.from, ...message });
      },
    };
  }
  return {
    async send(message) {
      if (config.isProduction) {
        log.warn('SMTP no configurado: no se envió el correo');
        return;
      }
      log.info({ mail: message }, 'Correo de desarrollo (SMTP no configurado)');
    },
  };
}

export class MemoryMailer implements Mailer {
  readonly messages: MailMessage[] = [];
  async send(message: MailMessage) {
    this.messages.push(message);
  }
}
```

- [ ] **Step 5: Implementar `plugins/errors.ts` y `plugins/security.ts`**

`apps/api/src/plugins/errors.ts`:
```ts
import type { FastifyError, FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors';

const CLIENT_MESSAGES: Record<number, string> = {
  400: 'Solicitud inválida.',
  401: 'Inicia sesión para continuar.',
  403: 'No tienes permiso para esta acción.',
  404: 'No encontrado.',
  413: 'La solicitud es demasiado grande.',
  415: 'Formato no soportado: envía JSON.',
  429: 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
};

function prismaCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string' && /^P\d{4}$/.test(code)) return code;
  }
  return undefined;
}

export function setupErrorHandling(app: FastifyInstance) {
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
  });

  app.setErrorHandler((err: FastifyError | AppError | Error, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, ...(err.fields && { fields: err.fields }) },
      });
    }

    const pCode = prismaCode(err);
    if (pCode === 'P2002') {
      return reply.status(409).send({ error: { code: 'DUPLICATE', message: 'Ya existe un registro con esos datos.' } });
    }
    if (pCode === 'P2003' || pCode === 'P2004') {
      return reply.status(400).send({ error: { code: 'INVALID_REFERENCE', message: 'Los datos no son válidos.' } });
    }
    if (pCode === 'P2025') {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No encontrado.' } });
    }

    const status = (err as FastifyError).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.status(status).send({
        error: {
          code: (err as FastifyError).code ?? 'BAD_REQUEST',
          message: CLIENT_MESSAGES[status] ?? 'Solicitud inválida.',
        },
      });
    }

    req.log.error({ err: { name: err.name, message: err.message, stack: err.stack } }, 'Error no controlado');
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Ocurrió un error inesperado.' } });
  });
}
```

`apps/api/src/plugins/security.ts`:
```ts
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function setupSecurity(app: FastifyInstance) {
  const { config } = app;
  await app.register(helmet);
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    errorResponseBuilder: () =>
      new AppError(429, 'RATE_LIMITED', 'Demasiadas solicitudes. Intenta de nuevo en un momento.'),
  });
  if (config.corsOrigins.length > 0) {
    await app.register(cors, { origin: config.corsOrigins, credentials: true });
  }

  const allowedOrigins = new Set([config.appOrigin, ...config.corsOrigins]);
  app.addHook('onRequest', async (req) => {
    if (SAFE_METHODS.has(req.method)) return;
    const origin = req.headers.origin;
    // Sin Origin no hay navegador involucrado (curl, tests): no aplica CSRF.
    if (origin && !allowedOrigins.has(origin)) {
      throw new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origen no permitido.');
    }
  });
}
```

- [ ] **Step 6: Implementar tipos, salud, `app.ts`, `server.ts` y `tsup.config.ts`**

`apps/api/src/types/fastify.d.ts`:
```ts
import 'fastify';
import type { IsoDate } from '@finanzas/shared';
import type { AppConfig } from '../config/env';
import type { PrismaClient } from '../generated/prisma/client';
import type { Mailer } from '../lib/mailer';

export interface AuthContext {
  userId: string;
  sessionId: string;
  timezone: string;
  /** "Hoy" en la zona del usuario, calculado con `app.now()` al autenticar. */
  today: IsoDate;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    prisma: PrismaClient;
    mailer: Mailer;
    now: () => Date;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    auth: AuthContext;
  }
}
```

`apps/api/src/modules/health/routes.ts`:
```ts
import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });
}
```

`apps/api/src/app.ts`:
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env';
import type { PrismaClient } from './generated/prisma/client';
import { createMailer, type Mailer } from './lib/mailer';
import { createPrisma } from './lib/prisma';
import { healthRoutes } from './modules/health/routes';
import { setupErrorHandling } from './plugins/errors';
import { setupSecurity } from './plugins/security';

export interface AppDeps {
  prisma?: PrismaClient;
  mailer?: Mailer;
  now?: () => Date;
}

export async function buildApp(config: AppConfig, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.nodeEnv === 'test'
        ? false
        : { level: config.logLevel, redact: ['req.headers.cookie', 'req.headers.authorization'] },
    trustProxy: true,
    disableRequestLogging: true,
    bodyLimit: 100 * 1024,
  });

  // Solo JSON: text/plain permitiría peticiones "simples" entre sitios (CSRF).
  app.removeContentTypeParser('text/plain');

  const prisma = deps.prisma ?? createPrisma(config.databaseUrl);
  app.decorate('config', config);
  app.decorate('prisma', prisma);
  app.decorate('mailer', deps.mailer ?? createMailer(config, app.log));
  app.decorate('now', deps.now ?? (() => new Date()));
  app.addHook('onClose', async () => {
    if (!deps.prisma) await prisma.$disconnect();
  });

  // Log sin query string, cuerpo ni montos.
  app.addHook('onResponse', async (req, reply) => {
    req.log.info(
      {
        method: req.method,
        route: req.routeOptions.url ?? 'not-found',
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      },
      'request',
    );
  });

  setupErrorHandling(app);
  await setupSecurity(app);

  await app.register(healthRoutes, { prefix: '/api' });

  return app;
}
```

`apps/api/src/server.ts`:
```ts
import { config as loadDotenv } from 'dotenv';
import { buildApp } from './app';
import { loadConfig } from './config/env';

loadDotenv({ quiet: true });

const config = loadConfig();
const app = await buildApp(config);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Cerrando servidor');
  await app.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.host, port: config.port });
```

`apps/api/tsup.config.ts`:
```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@finanzas/shared'],
});
```

- [ ] **Step 7: Crear `test/helpers.ts`**

```ts
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp, type AppDeps } from '../src/app';
import { loadConfig } from '../src/config/env';
import { MemoryMailer } from '../src/lib/mailer';

export const SESSION_COOKIE = 'fz_session';

export async function createTestApp(overrides: Record<string, string> = {}, deps: AppDeps = {}) {
  const mailer = new MemoryMailer();
  const app = await buildApp(loadConfig({ ...process.env, ...overrides }), { mailer, ...deps });
  await app.ready();
  return { app, mailer };
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  cookies: Array<{ name: string; value: string }>;
}

export function client(app: FastifyInstance, cookie?: string) {
  const call = async <T = any>(method: InjectOptions['method'], url: string, payload?: unknown): Promise<ApiResponse<T>> => {
    const res = await app.inject({
      method,
      url,
      ...(payload !== undefined && { payload: payload as InjectOptions['payload'] }),
      ...(cookie && { cookies: { [SESSION_COOKIE]: cookie } }),
    });
    return {
      status: res.statusCode,
      body: (res.body ? res.json() : undefined) as T,
      cookies: res.cookies.map((c) => ({ name: c.name, value: c.value })),
    };
  };
  return {
    cookie,
    get: <T = any>(url: string) => call<T>('GET', url),
    post: <T = any>(url: string, body: unknown = {}) => call<T>('POST', url, body),
    put: <T = any>(url: string, body: unknown = {}) => call<T>('PUT', url, body),
    patch: <T = any>(url: string, body: unknown = {}) => call<T>('PATCH', url, body),
    del: <T = any>(url: string) => call<T>('DELETE', url),
  };
}

export type Client = ReturnType<typeof client>;
```

Agregar al bloque de reglas de `eslint.config.js` una excepción para tests: `{ files: ['apps/api/test/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } }` (antes de `prettier`).

- [ ] **Step 8: Verificar**

Run: `npm test -w @finanzas/api && npm run typecheck -w @finanzas/api && npm run lint`
Expected: PASS de `env.test.ts`, `app.test.ts` y `db-constraints.test.ts`; sin errores de tipos ni de lint.

Run: `npm run dev -w @finanzas/api` y en otra terminal `curl http://localhost:3000/api/health`
Expected: `{"status":"ok"}` y una línea de log `request` con `route: "/api/health"` sin query string. Detener con Ctrl+C.

---

### Task 6: Autenticación — registro, login, logout, sesión y expiración

**Files:**
- Create: `apps/api/src/lib/tokens.ts`, `apps/api/src/lib/password.ts`, `apps/api/src/lib/attempt-limiter.ts`, `apps/api/src/plugins/session.ts`, `apps/api/src/modules/auth/sessions.ts`, `apps/api/src/modules/auth/service.ts`, `apps/api/src/modules/auth/routes.ts`, `apps/api/src/modules/categories/defaults.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/test/helpers.ts`
- Test: `apps/api/src/lib/attempt-limiter.test.ts`, `apps/api/test/auth.test.ts`

**Interfaces:**
- Consumes: `AppError`, `parse`, `Mailer`, `client`, `createTestApp` (Task 5); `registerSchema`, `loginSchema`, `todayIn`, `UserDTO`, `SYSTEM_CATEGORY_KEYS` (Tasks 2–3).
- Produces:
  - `generateToken(): string` (32 bytes base64url), `sha256Hex(value): string`.
  - `hashPassword(plain)`, `verifyPassword(hash, plain): Promise<boolean>`.
  - `class AttemptLimiter(max, windowMs, now?)` con `isBlocked(key)`, `hit(key)`, `reset(key)`.
  - `SESSION_COOKIE = 'fz_session'`, `setSessionCookie(reply, token, config)`, `clearSessionCookie(reply)`, `setupSession(app)` (decora `app.authenticate`, llena `request.auth` con `today = todayIn(timezone, app.now())`).
  - `createSession(db, userId, ttlDays)`, `validateSession(db, token, ttlDays)`, `revokeUserSessions(db, userId, exceptSessionId?)`.
  - `registerUser(db, input, { allowRegistration })`, `authenticateUser(db, email, password)`, `toUserDTO(user)`.
  - `DEFAULT_CATEGORIES` (spec 7.7).
  - Rutas: `POST /api/auth/register` (201 `{ user }`), `POST /api/auth/login` (200 `{ user }`), `POST /api/auth/logout` (204), `GET /api/auth/me` (200 `{ user }`).
  - Helper de test `registerUser(app, overrides?)` → `{ email, password, cookie, user, api }`.

- [ ] **Step 1: Escribir tests que fallan**

`apps/api/src/lib/attempt-limiter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { AttemptLimiter } from './attempt-limiter';

describe('AttemptLimiter', () => {
  it('blocks after max hits inside the window and forgets old hits', () => {
    let now = 0;
    const limiter = new AttemptLimiter(3, 1000, () => now);
    limiter.hit('k');
    limiter.hit('k');
    expect(limiter.isBlocked('k')).toBe(false);
    limiter.hit('k');
    expect(limiter.isBlocked('k')).toBe(true);
    expect(limiter.isBlocked('other')).toBe(false);
    now = 1001;
    expect(limiter.isBlocked('k')).toBe(false);
  });

  it('reset clears the key', () => {
    const limiter = new AttemptLimiter(1, 1000, () => 0);
    limiter.hit('k');
    limiter.reset('k');
    expect(limiter.isBlocked('k')).toBe(false);
  });
});
```

`apps/api/test/auth.test.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { client, createTestApp, registerUser } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await createTestApp());
});

afterAll(async () => {
  await app.close();
});

describe('register', () => {
  it('creates the user, opens a session and seeds defaults', async () => {
    const email = `${randomUUID()}@Test.Local`;
    const res = await client(app).post('/api/auth/register', { name: 'Cristian', email, password: 'clave-segura-123' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Cristian', email: email.toLowerCase(), timezone: 'America/Bogota' });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = res.cookies.find((c) => c.name === 'fz_session');
    expect(cookie?.value).toBeTruthy();

    const userId = res.body.user.id as string;
    const categories = await app.prisma.category.findMany({ where: { userId } });
    expect(categories.map((c) => c.name)).toContain('Intereses y comisiones');
    expect(categories.some((c) => c.name === 'Ahorro/Inversión' || c.name === 'Deudas')).toBe(false);
    expect(await app.prisma.financialConfiguration.count({ where: { userId } })).toBe(1);
  });

  it('rejects duplicate emails and weak passwords', async () => {
    const { email } = await registerUser(app);
    const dup = await client(app).post('/api/auth/register', { name: 'X', email, password: 'clave-segura-123' });
    expect(dup.status).toBe(409);
    const weak = await client(app).post('/api/auth/register', { name: 'X', email: `${randomUUID()}@t.co`, password: 'corta' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.fields.password).toBeTypeOf('string');
  });

  it('is closed when ALLOW_REGISTRATION=false', async () => {
    const { app: closed } = await createTestApp({ ALLOW_REGISTRATION: 'false' });
    const res = await client(closed).post('/api/auth/register', {
      name: 'X',
      email: `${randomUUID()}@t.co`,
      password: 'clave-segura-123',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('REGISTRATION_CLOSED');
    await closed.close();
  });
});

describe('login, me and logout', () => {
  it('logs in with valid credentials and returns the user from /me', async () => {
    const { email, password } = await registerUser(app);
    const login = await client(app).post('/api/auth/login', { email: email.toUpperCase(), password });
    expect(login.status).toBe(200);
    const cookie = login.cookies.find((c) => c.name === 'fz_session')!.value;
    const me = await client(app, cookie).get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });

  it('uses the same generic error for unknown email and wrong password', async () => {
    const { email } = await registerUser(app);
    const wrong = await client(app).post('/api/auth/login', { email, password: 'incorrecta-123' });
    const unknown = await client(app).post('/api/auth/login', { email: `${randomUUID()}@t.co`, password: 'incorrecta-123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
  });

  it('logout revokes the session', async () => {
    const { api } = await registerUser(app);
    expect((await api.post('/api/auth/logout')).status).toBe(204);
    const me = await api.get('/api/auth/me');
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('requires a session for protected routes', async () => {
    const res = await client(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects expired sessions', async () => {
    const { api, user } = await registerUser(app);
    await app.prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await api.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
    expect(await app.prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('renews an idle session (sliding expiration)', async () => {
    const { api, user } = await registerUser(app);
    const old = new Date(Date.now() - 2 * 3600_000);
    await app.prisma.session.updateMany({ where: { userId: user.id }, data: { lastUsedAt: old, expiresAt: new Date(Date.now() + 3600_000) } });
    expect((await api.get('/api/auth/me')).status).toBe(200);
    const s = await app.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it('rate-limits repeated failed logins per IP and email', async () => {
    const { app: strict } = await createTestApp({ LOGIN_MAX_ATTEMPTS: '2' });
    const { email, password } = await registerUser(strict);
    const c = client(strict);
    await c.post('/api/auth/login', { email, password: 'mala-clave-1' });
    await c.post('/api/auth/login', { email, password: 'mala-clave-2' });
    const blocked = await c.post('/api/auth/login', { email, password });
    expect(blocked.status).toBe(429);
    await strict.close();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api`
Expected: FAIL — falta `./attempt-limiter` y `registerUser` en helpers.

- [ ] **Step 3: Implementar utilidades**

`apps/api/src/lib/tokens.ts`:
```ts
import { createHash, randomBytes } from 'node:crypto';

export const generateToken = () => randomBytes(32).toString('base64url');
export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');
```

`apps/api/src/lib/password.ts`:
```ts
import { hash, verify } from '@node-rs/argon2';

// Parámetros recomendados por OWASP para Argon2id.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (plain: string) => hash(plain, OPTIONS);

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}
```

`apps/api/src/lib/attempt-limiter.ts`:
```ts
const MAX_KEYS = 10_000;

/** Límite de intentos en memoria por clave (IP+email). Suficiente para una sola instancia. */
export class AttemptLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  isBlocked(key: string): boolean {
    return this.recent(key).length >= this.max;
  }

  hit(key: string): void {
    const list = this.recent(key);
    list.push(this.now());
    this.hits.set(key, list);
    if (this.hits.size > MAX_KEYS) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) this.hits.delete(oldest);
    }
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private recent(key: string): number[] {
    const since = this.now() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }
}
```

- [ ] **Step 4: Implementar categorías por defecto**

`apps/api/src/modules/categories/defaults.ts`:
```ts
import { SYSTEM_CATEGORY_KEYS, type Bucket, type CategoryKind } from '@finanzas/shared';

export interface DefaultCategory {
  name: string;
  kind: CategoryKind;
  bucket: Bucket | null;
  icon: string;
  color: string;
  isSystem: boolean;
  systemKey: string | null;
}

const expense = (name: string, bucket: Bucket, icon: string, color: string, systemKey: string | null = null, isSystem = false): DefaultCategory => ({
  name,
  kind: 'EXPENSE',
  bucket,
  icon,
  color,
  isSystem,
  systemKey,
});

const income = (name: string, icon: string, color: string, systemKey: string | null = null, isSystem = false): DefaultCategory => ({
  name,
  kind: 'INCOME',
  bucket: null,
  icon,
  color,
  isSystem,
  systemKey,
});

/** Spec 7.7: sin "Ahorro/Inversión" (ahorrar es transferir) y "Intereses y comisiones" en lugar de "Deudas". */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  expense('Vivienda', 'OBLIGATIONS', 'home', '#0ea5e9'),
  expense('Alimentación', 'OBLIGATIONS', 'utensils', '#f97316'),
  expense('Transporte', 'OBLIGATIONS', 'bus', '#6366f1'),
  expense('Servicios', 'OBLIGATIONS', 'zap', '#eab308'),
  expense('Salud', 'OBLIGATIONS', 'heart-pulse', '#ef4444'),
  expense('Educación', 'OBLIGATIONS', 'graduation-cap', '#8b5cf6'),
  expense('Impuestos', 'OBLIGATIONS', 'landmark', '#64748b'),
  expense('Intereses y comisiones', 'OBLIGATIONS', 'percent', '#be123c', SYSTEM_CATEGORY_KEYS.INTEREST),
  expense('Entretenimiento', 'LEISURE', 'film', '#ec4899'),
  expense('Suscripciones', 'LEISURE', 'repeat', '#14b8a6'),
  expense('Compras', 'OTHER', 'shopping-bag', '#a855f7'),
  expense('Otros', 'OTHER', 'circle-ellipsis', '#94a3b8'),
  expense('Ajuste de saldo', 'OTHER', 'scale', '#94a3b8', SYSTEM_CATEGORY_KEYS.ADJUSTMENT_EXPENSE, true),
  income('Salario', 'briefcase', '#16a34a'),
  income('Freelance', 'laptop', '#22c55e'),
  income('Bonificación', 'gift', '#84cc16'),
  income('Venta', 'tag', '#10b981'),
  income('Ingreso extra', 'circle-plus', '#059669'),
  income('Otros', 'circle-ellipsis', '#94a3b8'),
  income('Ajuste de saldo', 'scale', '#94a3b8', SYSTEM_CATEGORY_KEYS.ADJUSTMENT_INCOME, true),
];
```

- [ ] **Step 5: Implementar sesiones y plugin de sesión**

`apps/api/src/modules/auth/sessions.ts`:
```ts
import type { DbClient } from '../../lib/prisma';
import { generateToken, sha256Hex } from '../../lib/tokens';

const DAY_MS = 86_400_000;
const RENEW_AFTER_MS = 3_600_000;

export async function createSession(db: DbClient, userId: string, ttlDays: number) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);
  const session = await db.session.create({ data: { userId, tokenHash: sha256Hex(token), expiresAt } });
  return { token, session };
}

export async function validateSession(db: DbClient, token: string, ttlDays: number) {
  const session = await db.session.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { user: { select: { timezone: true } } },
  });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  let renewed = false;
  if (now - session.lastUsedAt.getTime() > RENEW_AFTER_MS) {
    await db.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date(now), expiresAt: new Date(now + ttlDays * DAY_MS) },
    });
    renewed = true;
  }
  return { session, timezone: session.user.timezone, renewed };
}

export async function revokeSessionByToken(db: DbClient, token: string) {
  await db.session.deleteMany({ where: { tokenHash: sha256Hex(token) } });
}

export async function revokeUserSessions(db: DbClient, userId: string, exceptSessionId?: string) {
  await db.session.deleteMany({
    where: { userId, ...(exceptSessionId && { id: { not: exceptSessionId } }) },
  });
}
```

`apps/api/src/plugins/session.ts`:
```ts
import cookie from '@fastify/cookie';
import { todayIn } from '@finanzas/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppConfig } from '../config/env';
import { AppError } from '../lib/errors';
import { validateSession } from '../modules/auth/sessions';
import type { AuthContext } from '../types/fastify';

export const SESSION_COOKIE = 'fz_session';

export function setSessionCookie(reply: FastifyReply, token: string, config: AppConfig) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionTtlDays * 86_400,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function setupSession(app: FastifyInstance) {
  await app.register(cookie);
  app.decorateRequest('auth', null as unknown as AuthContext);
  app.decorate('authenticate', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');
    const result = await validateSession(app.prisma, token, app.config.sessionTtlDays);
    if (!result) {
      clearSessionCookie(reply);
      throw new AppError(401, 'SESSION_EXPIRED', 'Tu sesión expiró. Inicia sesión de nuevo.');
    }
    if (result.renewed) setSessionCookie(reply, token, app.config);
    req.auth = {
      userId: result.session.userId,
      sessionId: result.session.id,
      timezone: result.timezone,
      today: todayIn(result.timezone, app.now()),
    };
  });
}
```

- [ ] **Step 6: Implementar servicio y rutas de auth**

`apps/api/src/modules/auth/service.ts`:
```ts
import type { RegisterInput, UserDTO } from '@finanzas/shared';
import type { PrismaClient, User } from '../../generated/prisma/client';
import { AppError, conflict } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { generateToken } from '../../lib/tokens';
import { DEFAULT_CATEGORIES } from '../categories/defaults';

export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    theme: user.theme,
    timezone: user.timezone,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function registerUser(
  db: PrismaClient,
  input: RegisterInput,
  opts: { allowRegistration: boolean },
): Promise<User> {
  if (!opts.allowRegistration) {
    throw new AppError(403, 'REGISTRATION_CLOSED', 'El registro de nuevas cuentas está cerrado.');
  }
  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw conflict('EMAIL_TAKEN', 'Ya existe una cuenta con ese email.');
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash } });
    await tx.financialConfiguration.create({ data: { userId: user.id } });
    await tx.category.createMany({
      data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, userId: user.id, sortOrder: i })),
    });
    return user;
  });
}

let dummyHash: Promise<string> | undefined;

/** Devuelve el usuario si la clave es correcta; con email inexistente igual verifica un hash (tiempo constante). */
export async function authenticateUser(db: PrismaClient, email: string, password: string) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    dummyHash ??= hashPassword(generateToken());
    await verifyPassword(await dummyHash, password);
    return null;
  }
  return (await verifyPassword(user.passwordHash, password)) ? user : null;
}

export async function getUser(db: PrismaClient, userId: string): Promise<User> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, 'SESSION_EXPIRED', 'Tu sesión expiró. Inicia sesión de nuevo.');
  return user;
}
```

`apps/api/src/modules/auth/routes.ts`:
```ts
import { loginSchema, registerSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../lib/errors';
import { AttemptLimiter } from '../../lib/attempt-limiter';
import { parse } from '../../lib/validation';
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from '../../plugins/session';
import { authenticateUser, getUser, registerUser, toUserDTO } from './service';
import { createSession, revokeSessionByToken } from './sessions';

export async function authRoutes(app: FastifyInstance) {
  const loginLimiter = new AttemptLimiter(app.config.loginMaxAttempts, 15 * 60_000);

  app.post('/register', async (req, reply) => {
    const input = parse(registerSchema, req.body);
    const user = await registerUser(app.prisma, input, { allowRegistration: app.config.allowRegistration });
    const { token } = await createSession(app.prisma, user.id, app.config.sessionTtlDays);
    setSessionCookie(reply, token, app.config);
    return reply.status(201).send({ user: toUserDTO(user) });
  });

  app.post('/login', async (req, reply) => {
    const input = parse(loginSchema, req.body);
    const key = `${req.ip}:${input.email}`;
    if (loginLimiter.isBlocked(key)) {
      throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.');
    }
    const user = await authenticateUser(app.prisma, input.email, input.password);
    if (!user) {
      loginLimiter.hit(key);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.');
    }
    loginLimiter.reset(key);
    const { token } = await createSession(app.prisma, user.id, app.config.sessionTtlDays);
    setSessionCookie(reply, token, app.config);
    return { user: toUserDTO(user) };
  });

  app.post('/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await revokeSessionByToken(app.prisma, token);
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get('/me', { preHandler: app.authenticate }, async (req) => ({
    user: toUserDTO(await getUser(app.prisma, req.auth.userId)),
  }));
}
```

- [ ] **Step 7: Registrar en `app.ts`**

En `apps/api/src/app.ts` agregar los imports:
```ts
import { authRoutes } from './modules/auth/routes';
import { setupSession } from './plugins/session';
```
Y reemplazar el bloque final (desde `setupErrorHandling(app);` hasta `return app;`) por:
```ts
  setupErrorHandling(app);
  await setupSecurity(app);
  await setupSession(app);

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(
    async (api) => {
      api.addHook('preHandler', api.authenticate);
      // Rutas protegidas: se agregan en las tareas siguientes.
    },
    { prefix: '/api' },
  );

  return app;
```

- [ ] **Step 8: Agregar `registerUser` a `test/helpers.ts`**

Agregar al final de `apps/api/test/helpers.ts`:
```ts
import { randomUUID } from 'node:crypto';

export async function registerUser(
  app: FastifyInstance,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
) {
  const email = (overrides.email ?? `${randomUUID()}@test.local`).toLowerCase();
  const password = overrides.password ?? 'clave-segura-123';
  const res = await client(app).post('/api/auth/register', {
    name: overrides.name ?? 'Usuario Test',
    email,
    password,
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)!.value;
  return { email, password, cookie, user: res.body.user as { id: string; name: string; email: string }, api: client(app, cookie) };
}
```
(mover el `import { randomUUID }` al inicio del archivo junto a los demás imports).

- [ ] **Step 9: Verificar**

Run: `npm test -w @finanzas/api && npm run typecheck -w @finanzas/api && npm run lint`
Expected: PASS de `attempt-limiter.test.ts` y los 10 tests de `auth.test.ts`, además de los anteriores.

---

### Task 7: Autenticación — cambio y recuperación de contraseña, perfil

**Files:**
- Modify: `apps/api/src/modules/auth/service.ts`, `apps/api/src/modules/auth/routes.ts`, `apps/api/src/app.ts`
- Create: `apps/api/src/modules/me/routes.ts`
- Test: `apps/api/test/password.test.ts`

**Interfaces:**
- Consumes: `getUser`, `toUserDTO`, `revokeUserSessions`, `AttemptLimiter`, `Mailer` (Tasks 5–6); `changePasswordSchema`, `forgotPasswordSchema`, `resetPasswordSchema`, `updateMeSchema` (Task 3).
- Produces:
  - `changePassword(db, auth, input)`, `requestPasswordReset(db, mailer, appUrl, email, log)`, `resetPassword(db, token, newPassword)`.
  - Rutas: `POST /api/auth/change-password` (204), `POST /api/auth/forgot-password` (200 `{ message }`), `POST /api/auth/reset-password` (204), `PATCH /api/me` (200 `{ user }`).
  - Constante `FORGOT_PASSWORD_MESSAGE`.

- [ ] **Step 1: Escribir tests que fallan**

`apps/api/test/password.test.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { MemoryMailer } from '../src/lib/mailer';
import { client, createTestApp, registerUser } from './helpers';

let app: FastifyInstance;
let mailer: MemoryMailer;

beforeAll(async () => {
  ({ app, mailer } = await createTestApp());
});

afterAll(async () => {
  await app.close();
});

const tokenFromMail = (text: string) => /#token=([A-Za-z0-9_-]+)/.exec(text)![1]!;

describe('change password', () => {
  it('requires the current password and revokes other sessions', async () => {
    const { api, email, password } = await registerUser(app);
    const other = await client(app).post('/api/auth/login', { email, password });
    const otherCookie = other.cookies.find((c) => c.name === 'fz_session')!.value;

    const wrong = await api.post('/api/auth/change-password', { currentPassword: 'no-es-la-clave', newPassword: 'nueva-clave-456' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('INVALID_PASSWORD');

    const ok = await api.post('/api/auth/change-password', { currentPassword: password, newPassword: 'nueva-clave-456' });
    expect(ok.status).toBe(204);
    expect((await api.get('/api/auth/me')).status).toBe(200);
    expect((await client(app, otherCookie).get('/api/auth/me')).status).toBe(401);
    expect((await client(app).post('/api/auth/login', { email, password })).status).toBe(401);
    expect((await client(app).post('/api/auth/login', { email, password: 'nueva-clave-456' })).status).toBe(200);
  });
});

describe('forgot and reset password', () => {
  it('answers the same for unknown emails and sends no mail', async () => {
    const before = mailer.messages.length;
    const res = await client(app).post('/api/auth/forgot-password', { email: `${randomUUID()}@t.co` });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Si el email existe/);
    expect(mailer.messages.length).toBe(before);
  });

  it('sends a one-time link that resets the password and closes all sessions', async () => {
    const { api, email } = await registerUser(app);
    const res = await client(app).post('/api/auth/forgot-password', { email });
    expect(res.status).toBe(200);
    const mail = mailer.messages.at(-1)!;
    expect(mail.to).toBe(email);
    expect(mail.text).toContain('http://localhost:5173/reset-password#token=');
    const token = tokenFromMail(mail.text);

    const reset = await client(app).post('/api/auth/reset-password', { token, password: 'otra-clave-789' });
    expect(reset.status).toBe(204);
    expect((await api.get('/api/auth/me')).status).toBe(401);
    expect((await client(app).post('/api/auth/login', { email, password: 'otra-clave-789' })).status).toBe(200);

    const reuse = await client(app).post('/api/auth/reset-password', { token, password: 'otra-clave-000' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects expired tokens', async () => {
    const { email, user } = await registerUser(app);
    await client(app).post('/api/auth/forgot-password', { email });
    const token = tokenFromMail(mailer.messages.at(-1)!.text);
    await app.prisma.passwordResetToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await client(app).post('/api/auth/reset-password', { token, password: 'otra-clave-789' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/me', () => {
  it('updates name and theme', async () => {
    const { api } = await registerUser(app);
    const res = await api.patch('/api/me', { name: 'Cristian', theme: 'DARK' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Cristian', theme: 'DARK' });
    expect((await api.patch('/api/me', { email: 'x@y.co' })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- password`
Expected: FAIL — rutas inexistentes (404).

- [ ] **Step 3: Agregar funciones al servicio de auth**

Agregar a `apps/api/src/modules/auth/service.ts` (con sus imports: `badRequest` desde `../../lib/errors`, `sha256Hex` desde `../../lib/tokens`, `revokeUserSessions` desde `./sessions`, tipos `ChangePasswordInput` de `@finanzas/shared`, `Mailer` de `../../lib/mailer`, `FastifyBaseLogger` de `fastify`, `AuthContext` de `../../types/fastify`):
```ts
const RESET_TTL_MS = 30 * 60_000;

export const FORGOT_PASSWORD_MESSAGE =
  'Si el email existe, te enviamos un enlace para restablecer tu contraseña.';

export async function changePassword(db: PrismaClient, auth: AuthContext, input: ChangePasswordInput) {
  const user = await getUser(db, auth.userId);
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw badRequest('INVALID_PASSWORD', 'La contraseña actual no es correcta.', {
      currentPassword: 'La contraseña actual no es correcta',
    });
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } });
  await revokeUserSessions(db, user.id, auth.sessionId);
}

export async function requestPasswordReset(
  db: PrismaClient,
  mailer: Mailer,
  appUrl: string,
  email: string,
  log: FastifyBaseLogger,
) {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
  if (!user) return;
  const token = generateToken();
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  const link = `${appUrl}/reset-password#token=${token}`;
  // Sin await: el tiempo de respuesta no revela si el email existe.
  mailer
    .send({
      to: user.email,
      subject: 'Restablece tu contraseña de Finanzas',
      text: `Hola ${user.name}:\n\nPara crear una nueva contraseña abre este enlace (vale 30 minutos):\n${link}\n\nSi no lo pediste, ignora este correo.`,
    })
    .catch((err: Error) => log.error({ err: { message: err.message } }, 'No se pudo enviar el correo'));
}

export async function resetPassword(db: PrismaClient, token: string, newPassword: string) {
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256Hex(token) } });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw badRequest('INVALID_TOKEN', 'El enlace no es válido o ya expiró. Solicita uno nuevo.');
  }
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } }),
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);
}
```

- [ ] **Step 4: Agregar rutas de auth y de perfil**

En `apps/api/src/modules/auth/routes.ts` agregar a los imports `changePasswordSchema`, `forgotPasswordSchema`, `resetPasswordSchema` y `changePassword`, `FORGOT_PASSWORD_MESSAGE`, `requestPasswordReset`, `resetPassword`; y dentro de `authRoutes`, después de `/me`:
```ts
  const forgotLimiter = new AttemptLimiter(3, 60 * 60_000);

  app.post('/forgot-password', async (req) => {
    const { email } = parse(forgotPasswordSchema, req.body);
    const key = `${req.ip}:${email}`;
    if (!forgotLimiter.isBlocked(key)) {
      forgotLimiter.hit(key);
      await requestPasswordReset(app.prisma, app.mailer, app.config.appUrl, email, req.log);
    }
    return { message: FORGOT_PASSWORD_MESSAGE };
  });

  app.post('/reset-password', async (req, reply) => {
    const input = parse(resetPasswordSchema, req.body);
    await resetPassword(app.prisma, input.token, input.password);
    return reply.status(204).send();
  });

  app.post('/change-password', { preHandler: app.authenticate }, async (req, reply) => {
    const input = parse(changePasswordSchema, req.body);
    await changePassword(app.prisma, req.auth, input);
    return reply.status(204).send();
  });
```

`apps/api/src/modules/me/routes.ts`:
```ts
import { updateMeSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse } from '../../lib/validation';
import { toUserDTO } from '../auth/service';

export async function meRoutes(app: FastifyInstance) {
  app.patch('/me', async (req) => {
    const input = parse(updateMeSchema, req.body);
    const user = await app.prisma.user.update({ where: { id: req.auth.userId }, data: input });
    return { user: toUserDTO(user) };
  });
}
```

En `apps/api/src/app.ts`: `import { meRoutes } from './modules/me/routes';` y dentro del scope protegido reemplazar el comentario por:
```ts
      await api.register(meRoutes);
```

- [ ] **Step 5: Verificar**

Run: `npm test -w @finanzas/api && npm run typecheck -w @finanzas/api`
Expected: PASS (incluye los 5 tests de `password.test.ts`).

---

### Task 8: Dominio — efectos por tipo, saldos, flujos del mes, reserva y disponible estimado

**Files:**
- Create: `apps/api/src/domain/ledger.ts`, `apps/api/src/domain/balances.ts`, `apps/api/src/domain/savings.ts`, `apps/api/src/domain/available.ts`
- Test: `apps/api/src/domain/ledger.test.ts`, `apps/api/src/domain/balances.test.ts`, `apps/api/src/domain/savings.test.ts`, `apps/api/src/domain/available.test.ts`

**Interfaces:**
- Consumes: `TransactionType`, `AccountType`, `isLiquidAccount`, `BreakdownItem` (Task 3).
- Produces:
  - `interface LedgerEntry { type; amount; accountId; toAccountId; creditCardId; debtId }` (ids `string | null`).
  - `effectsOf(entry): Effects` con `accounts: {accountId, delta}[]`, `card`, `loan`, `income`, `expense`.
  - `applyLedger(entries): LedgerTotals` con `accountDeltas`, `cardDeltas`, `loanDeltas: Map<string, number>`, `income`, `expense`.
  - `summarizeMoney(accounts: {type, balance}[]): { total, liquid, savings, investment }`.
  - `monthFlows(entries, accountTypes: ReadonlyMap<string, AccountType>): { income, expense, savings, investment, remaining }`.
  - `summarizeDebts(cardDebts: number[], loanBalances: number[]): { cards, loans, total }` (las deudas negativas cuentan 0).
  - `pctOf(amount, pct)`, `savingsReserve({ savingsPct, investmentPct, incomeReceived, savingsFlow, investmentFlow }): number`.
  - `estimateAvailable({ liquid, pendingObligations, cardsCommitted, loansDue, reserve }): { total, breakdown: BreakdownItem[] }`.

- [ ] **Step 1: Escribir tests que fallan**

`apps/api/src/domain/ledger.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { TransactionType } from '@finanzas/shared';
import { applyLedger, effectsOf, type LedgerEntry } from './ledger';

const entry = (type: TransactionType, amount: number, ids: Partial<LedgerEntry> = {}): LedgerEntry => ({
  type,
  amount,
  accountId: null,
  toAccountId: null,
  creditCardId: null,
  debtId: null,
  ...ids,
});

describe('effectsOf', () => {
  it.each([
    ['INCOME', { accountId: 'A' }, [['A', 100]], null, null, 100, 0],
    ['EXPENSE', { accountId: 'A' }, [['A', -100]], null, null, 0, 100],
    ['TRANSFER', { accountId: 'A', toAccountId: 'B' }, [['A', -100], ['B', 100]], null, null, 0, 0],
    ['CARD_PURCHASE', { creditCardId: 'C' }, [], 100, null, 0, 100],
    ['CARD_PAYMENT', { accountId: 'A', creditCardId: 'C' }, [['A', -100]], -100, null, 0, 0],
    ['DEBT_PAYMENT', { accountId: 'A', debtId: 'D' }, [['A', -100]], null, -100, 0, 0],
    ['DEBT_DISBURSEMENT', { accountId: 'A', debtId: 'D' }, [['A', 100]], null, 100, 0, 0],
  ] as const)('%s', (type, ids, accounts, card, loan, income, expense) => {
    const fx = effectsOf(entry(type, 100, ids));
    expect(fx.accounts.map((a) => [a.accountId, a.delta])).toEqual(accounts);
    expect(fx.card?.delta ?? null).toBe(card);
    expect(fx.loan?.delta ?? null).toBe(loan);
    expect(fx.income).toBe(income);
    expect(fx.expense).toBe(expense);
  });

  it('only income and expense change net worth', () => {
    const all: LedgerEntry[] = [
      entry('INCOME', 7, { accountId: 'A' }),
      entry('EXPENSE', 11, { accountId: 'A' }),
      entry('TRANSFER', 13, { accountId: 'A', toAccountId: 'B' }),
      entry('CARD_PURCHASE', 17, { creditCardId: 'C' }),
      entry('CARD_PAYMENT', 19, { accountId: 'A', creditCardId: 'C' }),
      entry('DEBT_PAYMENT', 23, { accountId: 'A', debtId: 'D' }),
      entry('DEBT_DISBURSEMENT', 29, { accountId: 'A', debtId: 'D' }),
    ];
    for (const e of all) {
      const fx = effectsOf(e);
      const netWorthChange =
        fx.accounts.reduce((s, a) => s + a.delta, 0) - (fx.card?.delta ?? 0) - (fx.loan?.delta ?? 0);
      expect(netWorthChange).toBe(fx.income - fx.expense);
    }
  });

  it('throws when a required reference is missing', () => {
    expect(() => effectsOf(entry('TRANSFER', 1, { accountId: 'A' }))).toThrow();
  });
});

describe('applyLedger — reference case from the spec', () => {
  it('a card purchase paid later counts as expense exactly once', () => {
    const purchase = entry('CARD_PURCHASE', 300_000, { creditCardId: 'NU' });
    const payment = entry('CARD_PAYMENT', 300_000, { accountId: 'BANCOLOMBIA', creditCardId: 'NU' });

    const afterPurchase = applyLedger([purchase]);
    expect(afterPurchase.accountDeltas.get('BANCOLOMBIA') ?? 0).toBe(0);
    expect(afterPurchase.cardDeltas.get('NU')).toBe(300_000);
    expect(afterPurchase.expense).toBe(300_000);

    const afterPayment = applyLedger([purchase, payment]);
    expect(afterPayment.accountDeltas.get('BANCOLOMBIA')).toBe(-300_000);
    expect(afterPayment.cardDeltas.get('NU')).toBe(0);
    expect(afterPayment.expense).toBe(300_000);
  });
});
```

`apps/api/src/domain/balances.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { AccountType } from '@finanzas/shared';
import { monthFlows, summarizeDebts, summarizeMoney } from './balances';
import type { LedgerEntry } from './ledger';

describe('summarizeMoney', () => {
  it('adds every account and separates liquid from savings and investment', () => {
    const s = summarizeMoney([
      { type: 'CASH', balance: 100_000 },
      { type: 'BANK', balance: 1_500_000 },
      { type: 'DIGITAL_WALLET', balance: 300_000 },
      { type: 'BANK', balance: 600_000 },
    ]);
    expect(s.total).toBe(2_500_000);
    expect(s.liquid).toBe(2_500_000);

    const withSavings = summarizeMoney([
      { type: 'BANK', balance: 2_000_000 },
      { type: 'SAVINGS', balance: 1_000_000 },
      { type: 'INVESTMENT', balance: 500_000 },
    ]);
    expect(withSavings).toEqual({ total: 3_500_000, liquid: 2_000_000, savings: 1_000_000, investment: 500_000 });
  });
});

describe('summarizeDebts', () => {
  it('never counts a card credit balance as negative debt', () => {
    expect(summarizeDebts([800_000, -50_000], [1_000_000])).toEqual({ cards: 800_000, loans: 1_000_000, total: 1_800_000 });
  });
});

describe('monthFlows', () => {
  const types = new Map<string, AccountType>([
    ['BANK', 'BANK'],
    ['SAVE', 'SAVINGS'],
    ['INV', 'INVESTMENT'],
  ]);
  const e = (type: LedgerEntry['type'], amount: number, ids: Partial<LedgerEntry>): LedgerEntry => ({
    type,
    amount,
    accountId: null,
    toAccountId: null,
    creditCardId: null,
    debtId: null,
    ...ids,
  });

  it('matches the spec month balance (4.000.000 − 2.100.000 − 800.000 = 1.100.000)', () => {
    const flows = monthFlows(
      [
        e('INCOME', 4_000_000, { accountId: 'BANK' }),
        e('EXPENSE', 1_300_000, { accountId: 'BANK' }),
        e('CARD_PURCHASE', 800_000, { creditCardId: 'NU' }),
        e('TRANSFER', 800_000, { accountId: 'BANK', toAccountId: 'SAVE' }),
        e('CARD_PAYMENT', 500_000, { accountId: 'BANK', creditCardId: 'NU' }),
      ],
      types,
    );
    expect(flows).toEqual({ income: 4_000_000, expense: 2_100_000, savings: 800_000, investment: 0, remaining: 1_100_000 });
  });

  it('a transfer to savings is not an expense; a withdrawal reduces savings', () => {
    const flows = monthFlows(
      [
        e('TRANSFER', 500_000, { accountId: 'BANK', toAccountId: 'SAVE' }),
        e('TRANSFER', 200_000, { accountId: 'SAVE', toAccountId: 'BANK' }),
        e('TRANSFER', 100_000, { accountId: 'BANK', toAccountId: 'INV' }),
      ],
      types,
    );
    expect(flows.expense).toBe(0);
    expect(flows.savings).toBe(300_000);
    expect(flows.investment).toBe(100_000);
  });
});
```

`apps/api/src/domain/savings.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { pctOf, savingsReserve } from './savings';

describe('savingsReserve', () => {
  it('reserves the pending share of the income already received', () => {
    expect(pctOf(4_000_000, 20)).toBe(800_000);
    expect(
      savingsReserve({ savingsPct: 20, investmentPct: 10, incomeReceived: 4_000_000, savingsFlow: 500_000, investmentFlow: 0 }),
    ).toBe(300_000 + 400_000);
  });

  it('never goes negative when the user saved more than the target', () => {
    expect(
      savingsReserve({ savingsPct: 20, investmentPct: 0, incomeReceived: 1_000_000, savingsFlow: 900_000, investmentFlow: 0 }),
    ).toBe(0);
  });

  it('reserves nothing before any income arrives', () => {
    expect(
      savingsReserve({ savingsPct: 20, investmentPct: 10, incomeReceived: 0, savingsFlow: 0, investmentFlow: 0 }),
    ).toBe(0);
  });
});
```

`apps/api/src/domain/available.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { estimateAvailable } from './available';

describe('estimateAvailable', () => {
  it('matches the spec example (3.000.000 − 1.000.000 − 400.000 = 1.600.000)', () => {
    const r = estimateAvailable({ liquid: 3_000_000, pendingObligations: 1_000_000, cardsCommitted: 0, loansDue: 0, reserve: 400_000 });
    expect(r.total).toBe(1_600_000);
  });

  it('lists every term with its sign', () => {
    const r = estimateAvailable({ liquid: 2_500_000, pendingObligations: 100_000, cardsCommitted: 900_000, loansDue: 450_000, reserve: 50_000 });
    expect(r.breakdown.map((b) => [b.key, b.amount])).toEqual([
      ['liquid', 2_500_000],
      ['obligations', -100_000],
      ['cards', -900_000],
      ['loans', -450_000],
      ['reserve', -50_000],
    ]);
    expect(r.total).toBe(1_000_000);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run --project unit` (desde `apps/api`)
Expected: FAIL — módulos de dominio inexistentes.

- [ ] **Step 3: Implementar `ledger.ts`**

```ts
import type { TransactionType } from '@finanzas/shared';

export interface LedgerEntry {
  type: TransactionType;
  amount: number;
  accountId: string | null;
  toAccountId: string | null;
  creditCardId: string | null;
  debtId: string | null;
}

export interface Effects {
  accounts: Array<{ accountId: string; delta: number }>;
  card: { creditCardId: string; delta: number } | null;
  loan: { debtId: string; delta: number } | null;
  income: number;
  expense: number;
}

function req(id: string | null, field: string, type: TransactionType): string {
  if (!id) throw new Error(`${type} requires ${field}`);
  return id;
}

/** Spec 8.1: única fuente de verdad sobre qué cambia cada tipo de movimiento. */
export function effectsOf(e: LedgerEntry): Effects {
  const a = e.amount;
  const none: Effects = { accounts: [], card: null, loan: null, income: 0, expense: 0 };
  switch (e.type) {
    case 'INCOME':
      return { ...none, accounts: [{ accountId: req(e.accountId, 'accountId', e.type), delta: a }], income: a };
    case 'EXPENSE':
      return { ...none, accounts: [{ accountId: req(e.accountId, 'accountId', e.type), delta: -a }], expense: a };
    case 'TRANSFER':
      return {
        ...none,
        accounts: [
          { accountId: req(e.accountId, 'accountId', e.type), delta: -a },
          { accountId: req(e.toAccountId, 'toAccountId', e.type), delta: a },
        ],
      };
    case 'CARD_PURCHASE':
      return { ...none, card: { creditCardId: req(e.creditCardId, 'creditCardId', e.type), delta: a }, expense: a };
    case 'CARD_PAYMENT':
      return {
        ...none,
        accounts: [{ accountId: req(e.accountId, 'accountId', e.type), delta: -a }],
        card: { creditCardId: req(e.creditCardId, 'creditCardId', e.type), delta: -a },
      };
    case 'DEBT_PAYMENT':
      return {
        ...none,
        accounts: [{ accountId: req(e.accountId, 'accountId', e.type), delta: -a }],
        loan: { debtId: req(e.debtId, 'debtId', e.type), delta: -a },
      };
    case 'DEBT_DISBURSEMENT':
      return {
        ...none,
        accounts: [{ accountId: req(e.accountId, 'accountId', e.type), delta: a }],
        loan: { debtId: req(e.debtId, 'debtId', e.type), delta: a },
      };
  }
}

export interface LedgerTotals {
  accountDeltas: Map<string, number>;
  cardDeltas: Map<string, number>;
  loanDeltas: Map<string, number>;
  income: number;
  expense: number;
}

const add = (map: Map<string, number>, key: string, value: number) => map.set(key, (map.get(key) ?? 0) + value);

export function applyLedger(entries: Iterable<LedgerEntry>): LedgerTotals {
  const totals: LedgerTotals = {
    accountDeltas: new Map(),
    cardDeltas: new Map(),
    loanDeltas: new Map(),
    income: 0,
    expense: 0,
  };
  for (const entry of entries) {
    const fx = effectsOf(entry);
    for (const a of fx.accounts) add(totals.accountDeltas, a.accountId, a.delta);
    if (fx.card) add(totals.cardDeltas, fx.card.creditCardId, fx.card.delta);
    if (fx.loan) add(totals.loanDeltas, fx.loan.debtId, fx.loan.delta);
    totals.income += fx.income;
    totals.expense += fx.expense;
  }
  return totals;
}
```

- [ ] **Step 4: Implementar `balances.ts`, `savings.ts`, `available.ts`**

`apps/api/src/domain/balances.ts`:
```ts
import { isLiquidAccount, type AccountType } from '@finanzas/shared';
import { applyLedger, type LedgerEntry } from './ledger';

export interface MoneySummary {
  total: number;
  liquid: number;
  savings: number;
  investment: number;
}

export function summarizeMoney(accounts: Array<{ type: AccountType; balance: number }>): MoneySummary {
  const s: MoneySummary = { total: 0, liquid: 0, savings: 0, investment: 0 };
  for (const a of accounts) {
    s.total += a.balance;
    if (isLiquidAccount(a.type)) s.liquid += a.balance;
    else if (a.type === 'SAVINGS') s.savings += a.balance;
    else if (a.type === 'INVESTMENT') s.investment += a.balance;
  }
  return s;
}

export function summarizeDebts(cardDebts: number[], loanBalances: number[]) {
  const cards = cardDebts.reduce((s, d) => s + Math.max(d, 0), 0);
  const loans = loanBalances.reduce((s, d) => s + Math.max(d, 0), 0);
  return { cards, loans, total: cards + loans };
}

export interface MonthFlows {
  income: number;
  expense: number;
  savings: number;
  investment: number;
  remaining: number;
}

/** Spec 8.2: ahorro e inversión = variación por movimientos de las cuentas SAVINGS / INVESTMENT. */
export function monthFlows(entries: LedgerEntry[], accountTypes: ReadonlyMap<string, AccountType>): MonthFlows {
  const totals = applyLedger(entries);
  let savings = 0;
  let investment = 0;
  for (const [accountId, delta] of totals.accountDeltas) {
    const type = accountTypes.get(accountId);
    if (type === 'SAVINGS') savings += delta;
    else if (type === 'INVESTMENT') investment += delta;
  }
  return {
    income: totals.income,
    expense: totals.expense,
    savings,
    investment,
    remaining: totals.income - totals.expense - savings - investment,
  };
}
```

`apps/api/src/domain/savings.ts`:
```ts
export const pctOf = (amount: number, pct: number) => Math.round((amount * pct) / 100);

export interface ReserveInput {
  savingsPct: number;
  investmentPct: number;
  incomeReceived: number;
  savingsFlow: number;
  investmentFlow: number;
}

/** Spec 8.5: lo que falta separar del % de los ingresos ya recibidos este mes. */
export function savingsReserve(i: ReserveInput): number {
  return (
    Math.max(0, pctOf(i.incomeReceived, i.savingsPct) - i.savingsFlow) +
    Math.max(0, pctOf(i.incomeReceived, i.investmentPct) - i.investmentFlow)
  );
}
```

`apps/api/src/domain/available.ts`:
```ts
import type { BreakdownItem } from '@finanzas/shared';

export interface AvailableInput {
  liquid: number;
  pendingObligations: number;
  cardsCommitted: number;
  loansDue: number;
  reserve: number;
}

/** Resta sin producir `-0` (que rompe comparaciones y se vería como "-$0"). */
const minus = (v: number) => (v === 0 ? 0 : -v);

/** Spec 8.6. */
export function estimateAvailable(i: AvailableInput): { total: number; breakdown: BreakdownItem[] } {
  const breakdown: BreakdownItem[] = [
    { key: 'liquid', label: 'Dinero líquido (sin ahorro ni inversión)', amount: i.liquid },
    { key: 'obligations', label: 'Obligaciones pendientes del mes', amount: minus(i.pendingObligations) },
    { key: 'cards', label: 'Tarjetas: deuda comprometida', amount: minus(i.cardsCommitted) },
    { key: 'loans', label: 'Cuotas de préstamos pendientes del mes', amount: minus(i.loansDue) },
    { key: 'reserve', label: 'Ahorro e inversión por separar', amount: minus(i.reserve) },
  ];
  return { total: breakdown.reduce((s, b) => s + b.amount, 0), breakdown };
}
```

- [ ] **Step 5: Verificar**

Run: `npx vitest run --project unit` (desde `apps/api`)
Expected: PASS de los 4 archivos de dominio.

---

### Task 9: Dominio — facturación de tarjetas (cortes y cuotas) y cuotas de préstamos

**Files:**
- Create: `apps/api/src/domain/card-billing.ts`, `apps/api/src/domain/loans.ts`
- Test: `apps/api/src/domain/card-billing.test.ts`, `apps/api/src/domain/loans.test.ts`

**Interfaces:**
- Consumes: `makeDate`, `yearMonth`, `monthsBetween`, `IsoDate` (Task 2).
- Produces:
  - `interface CardTerms { statementDay; paymentDueDay }`, `interface CardCharge { date: IsoDate; amount; installments }`.
  - `cutoffForMonth(year, month, terms)`, `cutoffOnOrAfter(date, terms)`, `cutoffOnOrBefore(date, terms)`, `shiftCutoff(cutoff, months, terms)`, `dueDateForCutoff(cutoff, terms)`.
  - `splitInstallments(amount, n): number[]`, `billedThrough(charges, cutoff, terms): number`.
  - `initialDebtCharge({ initialDebt, initialDebtInstallments, openingDate }, terms): CardCharge | null`.
  - `interface CardBillingInput { terms; charges; totalPayments; debt; today }`.
  - `cardStatus(input): { lastCutoff, lastDueDate, amountDue, isOverdue, nextCutoff, nextDueDate, committed }`.
  - `exigibleAt(input, t: IsoDate): number` (para la Fase 2).
  - `upcomingInstallments(charges, afterCutoff, terms, months = 12): { cutoff, dueDate, amount }[]`.
  - `interface LoanTerms { balance; monthlyPayment: number | null; paymentDay: number | null; paidThisMonth }`, `loanInstallmentDue(loan, today, until)`, `nextLoanPaymentDate(loan, today): IsoDate | null`.

- [ ] **Step 1: Escribir tests que fallan**

`apps/api/src/domain/card-billing.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  billedThrough,
  cardStatus,
  cutoffOnOrAfter,
  cutoffOnOrBefore,
  dueDateForCutoff,
  exigibleAt,
  initialDebtCharge,
  splitInstallments,
  upcomingInstallments,
  type CardCharge,
  type CardTerms,
} from './card-billing';

const T15: CardTerms = { statementDay: 15, paymentDueDay: 30 };
const T31: CardTerms = { statementDay: 31, paymentDueDay: 15 };

describe('cutoffs and due dates', () => {
  it('finds the cutoff on or after / before a date', () => {
    expect(cutoffOnOrAfter('2026-10-15', T15)).toBe('2026-10-15');
    expect(cutoffOnOrAfter('2026-10-16', T15)).toBe('2026-11-15');
    expect(cutoffOnOrBefore('2026-10-14', T15)).toBe('2026-09-15');
    expect(cutoffOnOrBefore('2026-10-15', T15)).toBe('2026-10-15');
  });

  it('uses the last day of short months for day 31 (review focus #1)', () => {
    expect(cutoffOnOrAfter('2026-02-10', T31)).toBe('2026-02-28');
    expect(cutoffOnOrAfter('2026-04-30', T31)).toBe('2026-04-30');
    expect(dueDateForCutoff('2026-02-28', T31)).toBe('2026-03-15');
    expect(dueDateForCutoff('2026-02-15', T15)).toBe('2026-02-28');
    expect(dueDateForCutoff('2026-12-31', T31)).toBe('2027-01-15');
  });

  it('due date is in the same month when the due day is after the statement day', () => {
    expect(dueDateForCutoff('2026-10-15', T15)).toBe('2026-10-30');
  });
});

describe('installments', () => {
  it('splits and puts the remainder in the last installment', () => {
    expect(splitInstallments(100_000, 3)).toEqual([33_333, 33_333, 33_334]);
    expect(splitInstallments(1_200_000, 12).every((x) => x === 100_000)).toBe(true);
  });

  it('bills one installment per cutoff starting at the first cutoff on or after the purchase', () => {
    const laptop: CardCharge = { date: '2026-10-03', amount: 1_200_000, installments: 12 };
    expect(billedThrough([laptop], '2026-09-15', T15)).toBe(0);
    expect(billedThrough([laptop], '2026-10-15', T15)).toBe(100_000);
    expect(billedThrough([laptop], '2026-11-15', T15)).toBe(200_000);
    expect(billedThrough([laptop], '2027-09-15', T15)).toBe(1_200_000);
    expect(billedThrough([laptop], '2030-01-15', T15)).toBe(1_200_000);
  });

  it('a purchase on the cutoff day is billed in that cutoff', () => {
    expect(billedThrough([{ date: '2026-10-15', amount: 50_000, installments: 1 }], '2026-10-15', T15)).toBe(50_000);
  });

  it('keeps the remainder for the last installment', () => {
    const c: CardCharge = { date: '2026-10-01', amount: 100_000, installments: 3 };
    expect(billedThrough([c], '2026-11-15', T15)).toBe(66_666);
    expect(billedThrough([c], '2026-12-15', T15)).toBe(100_000);
  });
});

describe('cardStatus', () => {
  const laptop: CardCharge = { date: '2026-10-03', amount: 1_200_000, installments: 12 };

  it('spec example: 1.200.000 at 12 installments → monthly payment 100.000 due on the 30th', () => {
    const s = cardStatus({ terms: T15, charges: [laptop], totalPayments: 0, debt: 1_200_000, today: '2026-10-20' });
    expect(s).toMatchObject({ lastCutoff: '2026-10-15', lastDueDate: '2026-10-30', amountDue: 100_000, isOverdue: false });
    expect(s.committed).toBe(200_000);
    expect(s.nextCutoff).toBe('2026-11-15');
    expect(s.nextDueDate).toBe('2026-11-30');
  });

  it('before the first cutoff nothing is due yet but the first installment is committed', () => {
    const s = cardStatus({ terms: T15, charges: [laptop], totalPayments: 0, debt: 1_200_000, today: '2026-10-06' });
    expect(s.amountDue).toBe(0);
    expect(s.committed).toBe(100_000);
  });

  it('partial payments carry over and an unpaid past due date is overdue', () => {
    const charges: CardCharge[] = [{ date: '2026-09-20', amount: 1_000_000, installments: 1 }];
    const afterPartial = cardStatus({ terms: T15, charges, totalPayments: 300_000, debt: 700_000, today: '2026-10-26' });
    expect(afterPartial.amountDue).toBe(700_000);
    expect(afterPartial.isOverdue).toBe(false);

    const late = cardStatus({ terms: T15, charges, totalPayments: 300_000, debt: 700_000, today: '2026-11-01' });
    expect(late.isOverdue).toBe(true);

    const withNew = [...charges, { date: '2026-11-01', amount: 200_000, installments: 1 }];
    const next = cardStatus({ terms: T15, charges: withNew, totalPayments: 300_000, debt: 900_000, today: '2026-11-20' });
    expect(next.amountDue).toBe(900_000);
  });

  it('overpayments reduce the next statement', () => {
    const charges: CardCharge[] = [
      { date: '2026-09-20', amount: 1_000_000, installments: 1 },
      { date: '2026-11-01', amount: 200_000, installments: 1 },
    ];
    const s = cardStatus({ terms: T15, charges, totalPayments: 1_100_000, debt: 100_000, today: '2026-11-20' });
    expect(s.amountDue).toBe(100_000);
  });

  it('never reports a negative payment, even with a credit balance (review focus #4)', () => {
    const s = cardStatus({ terms: T15, charges: [], totalPayments: 300_000, debt: -300_000, today: '2026-11-20' });
    expect(s.amountDue).toBe(0);
    expect(s.committed).toBe(0);
  });

  it('treats the initial debt as already billed at the last cutoff before opening', () => {
    const charge = initialDebtCharge({ initialDebt: 800_000, initialDebtInstallments: 1, openingDate: '2026-10-06' }, T31);
    expect(charge).toEqual({ date: '2026-09-30', amount: 800_000, installments: 1 });
    const s = cardStatus({ terms: T31, charges: [charge!], totalPayments: 0, debt: 800_000, today: '2026-10-06' });
    expect(s.amountDue).toBe(800_000);
    expect(s.lastDueDate).toBe('2026-10-15');
    expect(initialDebtCharge({ initialDebt: 0, initialDebtInstallments: 1, openingDate: '2026-10-06' }, T31)).toBeNull();
  });
});

describe('exigibleAt and upcomingInstallments', () => {
  it('only counts statements whose due date has arrived', () => {
    const input = {
      terms: T15,
      charges: [{ date: '2026-10-03', amount: 500_000, installments: 1 }],
      totalPayments: 0,
      debt: 500_000,
      today: '2026-10-06',
    };
    expect(exigibleAt(input, '2026-10-29')).toBe(0);
    expect(exigibleAt(input, '2026-10-30')).toBe(500_000);
  });

  it('lists the future installments by cutoff', () => {
    const laptop: CardCharge = { date: '2026-10-03', amount: 1_200_000, installments: 12 };
    const up = upcomingInstallments([laptop], '2026-10-15', T15, 3);
    expect(up).toEqual([
      { cutoff: '2026-11-15', dueDate: '2026-11-30', amount: 100_000 },
      { cutoff: '2026-12-15', dueDate: '2026-12-30', amount: 100_000 },
      { cutoff: '2027-01-15', dueDate: '2027-01-30', amount: 100_000 },
    ]);
  });
});
```

`apps/api/src/domain/loans.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { loanInstallmentDue, nextLoanPaymentDate, type LoanTerms } from './loans';

const loan = (overrides: Partial<LoanTerms> = {}): LoanTerms => ({
  balance: 8_000_000,
  monthlyPayment: 450_000,
  paymentDay: 5,
  paidThisMonth: 0,
  ...overrides,
});

describe('loanInstallmentDue', () => {
  it('returns the pending part of the monthly installment', () => {
    expect(loanInstallmentDue(loan(), '2026-10-06', '2026-10-31')).toBe(450_000);
    expect(loanInstallmentDue(loan({ paidThisMonth: 380_000 }), '2026-10-06', '2026-10-31')).toBe(70_000);
    expect(loanInstallmentDue(loan({ paidThisMonth: 450_000 }), '2026-10-06', '2026-10-31')).toBe(0);
  });

  it('is capped by the balance and zero without terms', () => {
    expect(loanInstallmentDue(loan({ balance: 100_000 }), '2026-10-06', '2026-10-31')).toBe(100_000);
    expect(loanInstallmentDue(loan({ monthlyPayment: null }), '2026-10-06', '2026-10-31')).toBe(0);
    expect(loanInstallmentDue(loan({ balance: 0 }), '2026-10-06', '2026-10-31')).toBe(0);
  });

  it('ignores the installment if its date is after the horizon', () => {
    expect(loanInstallmentDue(loan(), '2026-10-02', '2026-10-04')).toBe(0);
  });

  it('day 31 falls on the last day of February', () => {
    expect(loanInstallmentDue(loan({ paymentDay: 31 }), '2026-02-10', '2026-02-28')).toBe(450_000);
  });
});

describe('nextLoanPaymentDate', () => {
  it('stays in the current month while the installment is pending', () => {
    expect(nextLoanPaymentDate(loan(), '2026-10-06')).toBe('2026-10-05');
    expect(nextLoanPaymentDate(loan({ paidThisMonth: 450_000 }), '2026-10-06')).toBe('2026-11-05');
    expect(nextLoanPaymentDate(loan({ paymentDay: null }), '2026-10-06')).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run --project unit` (desde `apps/api`)
Expected: FAIL — no existen `./card-billing` ni `./loans`.

- [ ] **Step 3: Implementar `card-billing.ts`**

```ts
import { makeDate, monthsBetween, yearMonth, type IsoDate } from '@finanzas/shared';

export interface CardTerms {
  statementDay: number;
  paymentDueDay: number;
}

export interface CardCharge {
  date: IsoDate;
  amount: number;
  installments: number;
}

export function cutoffForMonth(year: number, month: number, terms: CardTerms): IsoDate {
  return makeDate(year, month, terms.statementDay);
}

export function cutoffOnOrAfter(date: IsoDate, terms: CardTerms): IsoDate {
  const { year, month } = yearMonth(date);
  const c = cutoffForMonth(year, month, terms);
  return c >= date ? c : cutoffForMonth(year, month + 1, terms);
}

export function cutoffOnOrBefore(date: IsoDate, terms: CardTerms): IsoDate {
  const { year, month } = yearMonth(date);
  const c = cutoffForMonth(year, month, terms);
  return c <= date ? c : cutoffForMonth(year, month - 1, terms);
}

export function shiftCutoff(cutoff: IsoDate, months: number, terms: CardTerms): IsoDate {
  const { year, month } = yearMonth(cutoff);
  return cutoffForMonth(year, month + months, terms);
}

/** Spec 8.3: mismo mes si el día de pago es posterior al de corte; si no, el mes siguiente. */
export function dueDateForCutoff(cutoff: IsoDate, terms: CardTerms): IsoDate {
  const { year, month } = yearMonth(cutoff);
  return terms.paymentDueDay > terms.statementDay
    ? makeDate(year, month, terms.paymentDueDay)
    : makeDate(year, month + 1, terms.paymentDueDay);
}

export function splitInstallments(amount: number, n: number): number[] {
  const base = Math.floor(amount / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? amount - base * (n - 1) : base));
}

/** Suma de cuotas facturadas en cortes ≤ `cutoff`. */
export function billedThrough(charges: CardCharge[], cutoff: IsoDate, terms: CardTerms): number {
  let total = 0;
  for (const c of charges) {
    const first = cutoffOnOrAfter(c.date, terms);
    if (first > cutoff) continue;
    const count = Math.min(c.installments, monthsBetween(first, cutoff) + 1);
    total += count >= c.installments ? c.amount : Math.floor(c.amount / c.installments) * count;
  }
  return total;
}

/** La deuda que ya tenía la tarjeta al registrarla se considera facturada en el último corte previo. */
export function initialDebtCharge(
  card: { initialDebt: number; initialDebtInstallments: number; openingDate: IsoDate },
  terms: CardTerms,
): CardCharge | null {
  if (card.initialDebt <= 0) return null;
  return {
    date: cutoffOnOrBefore(card.openingDate, terms),
    amount: card.initialDebt,
    installments: card.initialDebtInstallments,
  };
}

export interface CardBillingInput {
  terms: CardTerms;
  charges: CardCharge[];
  totalPayments: number;
  debt: number;
  today: IsoDate;
}

export interface CardStatus {
  lastCutoff: IsoDate;
  lastDueDate: IsoDate;
  amountDue: number;
  isOverdue: boolean;
  nextCutoff: IsoDate;
  nextDueDate: IsoDate;
  committed: number;
}

const clampDue = (value: number, debt: number) => Math.min(Math.max(value, 0), Math.max(debt, 0));

export function cardStatus(input: CardBillingInput): CardStatus {
  const { terms, charges, totalPayments, debt, today } = input;
  const lastCutoff = cutoffOnOrBefore(today, terms);
  const lastDueDate = dueDateForCutoff(lastCutoff, terms);
  const amountDue = clampDue(billedThrough(charges, lastCutoff, terms) - totalPayments, debt);
  const nextCutoff = shiftCutoff(lastCutoff, 1, terms);
  const committed = clampDue(billedThrough(charges, cutoffOnOrAfter(today, terms), terms) - totalPayments, debt);
  return {
    lastCutoff,
    lastDueDate,
    amountDue,
    isOverdue: amountDue > 0 && lastDueDate < today,
    nextCutoff,
    nextDueDate: dueDateForCutoff(nextCutoff, terms),
    committed,
  };
}

/** Pago exigible acumulado a la fecha `t`: estados de cuenta cuya fecha de pago ya llegó. */
export function exigibleAt(input: CardBillingInput, t: IsoDate): number {
  const { terms, charges, totalPayments, debt } = input;
  let cutoff = cutoffOnOrBefore(t, terms);
  while (dueDateForCutoff(cutoff, terms) > t) cutoff = shiftCutoff(cutoff, -1, terms);
  return clampDue(billedThrough(charges, cutoff, terms) - totalPayments, debt);
}

export function upcomingInstallments(
  charges: CardCharge[],
  afterCutoff: IsoDate,
  terms: CardTerms,
  months = 12,
): Array<{ cutoff: IsoDate; dueDate: IsoDate; amount: number }> {
  const result: Array<{ cutoff: IsoDate; dueDate: IsoDate; amount: number }> = [];
  let previous = billedThrough(charges, afterCutoff, terms);
  for (let k = 1; k <= months; k++) {
    const cutoff = shiftCutoff(afterCutoff, k, terms);
    const billed = billedThrough(charges, cutoff, terms);
    if (billed > previous) result.push({ cutoff, dueDate: dueDateForCutoff(cutoff, terms), amount: billed - previous });
    previous = billed;
  }
  return result;
}
```

- [ ] **Step 4: Implementar `loans.ts`**

```ts
import { makeDate, yearMonth, type IsoDate } from '@finanzas/shared';

export interface LoanTerms {
  balance: number;
  monthlyPayment: number | null;
  paymentDay: number | null;
  /** Capital + intereses pagados en el mes calendario de `today`. */
  paidThisMonth: number;
}

function paymentDateInMonth(paymentDay: number, today: IsoDate, offset = 0): IsoDate {
  const { year, month } = yearMonth(today);
  return makeDate(year, month + offset, paymentDay);
}

/** Spec 8.4: cuota pendiente del mes si su fecha de pago es ≤ `until`. */
export function loanInstallmentDue(loan: LoanTerms, today: IsoDate, until: IsoDate): number {
  if (!loan.monthlyPayment || !loan.paymentDay || loan.balance <= 0) return 0;
  if (paymentDateInMonth(loan.paymentDay, today) > until) return 0;
  return Math.min(loan.balance, Math.max(0, loan.monthlyPayment - loan.paidThisMonth));
}

export function nextLoanPaymentDate(loan: LoanTerms, today: IsoDate): IsoDate | null {
  if (!loan.paymentDay || loan.balance <= 0) return null;
  const thisMonth = paymentDateInMonth(loan.paymentDay, today);
  const pending = loan.monthlyPayment ? loan.paidThisMonth < loan.monthlyPayment : thisMonth >= today;
  return pending ? thisMonth : paymentDateInMonth(loan.paymentDay, today, 1);
}
```

- [ ] **Step 5: Verificar**

Run: `npx vitest run --project unit` (desde `apps/api`)
Expected: PASS de `card-billing.test.ts` y `loans.test.ts`.

---

### Task 10: Cuentas, categorías y etiquetas

**Files:**
- Create: `apps/api/src/modules/ledger/repository.ts`, `apps/api/src/modules/accounts/service.ts`, `apps/api/src/modules/accounts/routes.ts`, `apps/api/src/modules/categories/service.ts`, `apps/api/src/modules/categories/routes.ts`, `apps/api/src/modules/tags/service.ts`, `apps/api/src/modules/tags/routes.ts`
- Modify: `apps/api/src/lib/errors.ts`, `apps/api/src/lib/validation.ts`, `apps/api/src/app.ts`
- Test: `apps/api/test/accounts.test.ts`, `apps/api/test/categories.test.ts`

**Interfaces:**
- Consumes: `applyLedger`, `LedgerEntry` (Task 8); `DbClient`, `toDbDate`, `fromDbDate`, `num` (Task 4); `AuthContext` (Task 5); esquemas y DTOs (Task 3).
- Produces:
  - `ledgerEntries(db, userId, filter?: { from?, to?, accountId?, creditCardId?, debtId?, excludeIds? }): Promise<LedgerEntry[]>` (agrupa con `groupBy`).
  - `isUniqueViolation(err)`, `parseId(params): string` (UUID inválido → 404).
  - Cuentas: `toAccountDTO(account, balance)`, `listAccounts(db, userId)`, `getAccount(db, userId, id)`, `findAccount(db, userId, id)`, `accountBalance(db, userId, account, excludeIds?)`, `createAccount(db, auth, input)`, `updateAccount(db, userId, id, input)`, `deleteAccount(db, userId, id)`.
  - Categorías: `toCategoryDTO`, `listCategories`, `createCategory(db, userId, input)`, `updateCategory(db, userId, id, input)`, `deleteCategory(db, userId, id)`, `findSystemCategory(db, userId, systemKey)`.
  - Etiquetas: `listTags(db, userId)`, `deleteTag(db, userId, id)`.
  - Rutas: `GET/POST /api/accounts`, `GET/PUT/DELETE /api/accounts/:id` (respuestas `{ items }`, `{ account }`); `GET/POST /api/categories`, `PUT/DELETE /api/categories/:id` (`{ items }`, `{ category }`); `GET /api/tags`, `DELETE /api/tags/:id`.

- [ ] **Step 1: Escribir tests que fallan**

`apps/api/test/accounts.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { todayIn } from '@finanzas/shared';
import { createTestApp, registerUser } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await createTestApp());
});

afterAll(async () => {
  await app.close();
});

describe('accounts', () => {
  it('creates, lists and reads an account with its balance', async () => {
    const { api } = await registerUser(app);
    const created = await api.post('/api/accounts', { name: 'Bancolombia', type: 'BANK', initialBalance: 2_000_000 });
    expect(created.status).toBe(201);
    expect(created.body.account).toMatchObject({
      name: 'Bancolombia',
      type: 'BANK',
      balance: 2_000_000,
      isActive: true,
      openingDate: todayIn('America/Bogota'),
    });

    const list = await api.get('/api/accounts');
    expect(list.body.items).toHaveLength(1);
    const one = await api.get(`/api/accounts/${created.body.account.id}`);
    expect(one.body.account.balance).toBe(2_000_000);
  });

  it('rejects duplicate names and invalid data', async () => {
    const { api } = await registerUser(app);
    await api.post('/api/accounts', { name: 'Nequi', type: 'DIGITAL_WALLET' });
    const dup = await api.post('/api/accounts', { name: 'Nequi', type: 'DIGITAL_WALLET' });
    expect(dup.status).toBe(409);
    const bad = await api.post('/api/accounts', { name: 'X', type: 'BANK', color: 'rojo' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.color).toBeTypeOf('string');
  });

  it('only archives accounts with a zero balance', async () => {
    const { api } = await registerUser(app);
    const { body } = await api.post('/api/accounts', { name: 'Efectivo', type: 'CASH', initialBalance: 50_000 });
    const id = body.account.id;
    const archive = await api.put(`/api/accounts/${id}`, { isActive: false });
    expect(archive.status).toBe(409);
    expect(archive.body.error.code).toBe('ACCOUNT_HAS_BALANCE');
    const ok = await api.put(`/api/accounts/${id}`, { initialBalance: 0, isActive: false, color: '#00aa00' });
    expect(ok.status).toBe(200);
    expect(ok.body.account).toMatchObject({ isActive: false, color: '#00aa00', balance: 0 });
  });

  it('deletes unused accounts and answers 404 for unknown or malformed ids', async () => {
    const { api } = await registerUser(app);
    const { body } = await api.post('/api/accounts', { name: 'Daviplata', type: 'DIGITAL_WALLET' });
    expect((await api.del(`/api/accounts/${body.account.id}`)).status).toBe(204);
    expect((await api.get(`/api/accounts/${body.account.id}`)).status).toBe(404);
    expect((await api.get('/api/accounts/no-es-uuid')).status).toBe(404);
  });
});
```

`apps/api/test/categories.test.ts`:
```ts
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

type Cat = { id: string; name: string; kind: string; bucket: string | null; systemKey: string | null; isSystem: boolean };

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

    const child = await api.post('/api/categories', { name: 'Restaurantes', kind: 'EXPENSE', parentId: food.id });
    expect(child.body.category).toMatchObject({ parentId: food.id, bucket: 'OBLIGATIONS' });

    const grandChild = await api.post('/api/categories', { name: 'Sushi', kind: 'EXPENSE', parentId: child.body.category.id });
    expect(grandChild.status).toBe(400);

    const salary = items.find((c) => c.name === 'Salario')!;
    const mixed = await api.post('/api/categories', { name: 'Extra', kind: 'EXPENSE', parentId: salary.id });
    expect(mixed.status).toBe(400);

    const dup = await api.post('/api/categories', { name: 'mascotas', kind: 'EXPENSE' });
    expect(dup.status).toBe(409);
    const otherKind = await api.post('/api/categories', { name: 'Mascotas', kind: 'INCOME' });
    expect(otherKind.status).toBe(201);
    expect(otherKind.body.category.bucket).toBeNull();
  });

  it('protects system categories and categories in use', async () => {
    const { api } = await registerUser(app);
    const items = (await api.get('/api/categories')).body.items as Cat[];
    const adjustment = items.find((c) => c.systemKey === 'ADJUSTMENT_EXPENSE')!;
    const interest = items.find((c) => c.systemKey === 'INTEREST')!;
    const food = items.find((c) => c.name === 'Alimentación')!;

    expect((await api.put(`/api/categories/${adjustment.id}`, { name: 'Otro' })).status).toBe(409);
    expect((await api.del(`/api/categories/${interest.id}`)).status).toBe(409);
    const renamed = await api.put(`/api/categories/${interest.id}`, { name: 'Intereses' });
    expect(renamed.status).toBe(200);

    await api.post('/api/categories', { name: 'Domicilios', kind: 'EXPENSE', parentId: food.id });
    expect((await api.del(`/api/categories/${food.id}`)).status).toBe(409);

    const custom = await api.post('/api/categories', { name: 'Regalos', kind: 'EXPENSE' });
    expect((await api.del(`/api/categories/${custom.body.category.id}`)).status).toBe(204);
  });

  it('lists tags (empty for a new user)', async () => {
    const { api } = await registerUser(app);
    expect((await api.get('/api/tags')).body.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- accounts categories`
Expected: FAIL — rutas inexistentes (404).

- [ ] **Step 3: Utilidades compartidas**

Agregar a `apps/api/src/lib/errors.ts`:
```ts
export function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002';
}
```

Agregar a `apps/api/src/lib/validation.ts` (con `import { z } from 'zod'` como import de valor y `notFound` desde `./errors`):
```ts
const idParams = z.object({ id: z.uuid() });

/** `:id` de la ruta; un UUID mal formado responde 404 como cualquier recurso inexistente. */
export function parseId(params: unknown): string {
  const result = idParams.safeParse(params);
  if (!result.success) throw notFound('No encontrado.');
  return result.data.id;
}
```
(Cambiar `import type { z } from 'zod'` por `import { z } from 'zod'`.)

- [ ] **Step 4: Repositorio del ledger**

`apps/api/src/modules/ledger/repository.ts`:
```ts
import type { IsoDate } from '@finanzas/shared';
import type { LedgerEntry } from '../../domain/ledger';
import type { Prisma } from '../../generated/prisma/client';
import { num, toDbDate } from '../../lib/db';
import type { DbClient } from '../../lib/prisma';

export interface LedgerFilter {
  from?: IsoDate;
  to?: IsoDate;
  accountId?: string;
  creditCardId?: string;
  debtId?: string;
  excludeIds?: string[];
}

/** Totales agrupados por tipo y referencias; el dominio aplica los efectos. */
export async function ledgerEntries(db: DbClient, userId: string, filter: LedgerFilter = {}): Promise<LedgerEntry[]> {
  const where: Prisma.TransactionWhereInput = { userId };
  if (filter.from || filter.to) {
    where.date = {
      ...(filter.from && { gte: toDbDate(filter.from) }),
      ...(filter.to && { lte: toDbDate(filter.to) }),
    };
  }
  if (filter.accountId) where.OR = [{ accountId: filter.accountId }, { toAccountId: filter.accountId }];
  if (filter.creditCardId) where.creditCardId = filter.creditCardId;
  if (filter.debtId) where.debtId = filter.debtId;
  if (filter.excludeIds?.length) where.id = { notIn: filter.excludeIds };

  const rows = await db.transaction.groupBy({
    by: ['type', 'accountId', 'toAccountId', 'creditCardId', 'debtId'],
    where,
    _sum: { amount: true },
  });
  return rows.map((r) => ({
    type: r.type,
    amount: num(r._sum.amount),
    accountId: r.accountId,
    toAccountId: r.toAccountId,
    creditCardId: r.creditCardId,
    debtId: r.debtId,
  }));
}
```

- [ ] **Step 5: Servicio y rutas de cuentas**

`apps/api/src/modules/accounts/service.ts`:
```ts
import type { AccountCreateInput, AccountDTO, AccountUpdateInput } from '@finanzas/shared';
import { applyLedger } from '../../domain/ledger';
import type { Account } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { conflict, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import { ledgerEntries } from '../ledger/repository';

const NAME_TAKEN = () => conflict('ACCOUNT_NAME_TAKEN', 'Ya tienes una cuenta con ese nombre.');

export function toAccountDTO(a: Account, balance: number): AccountDTO {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    institution: a.institution,
    initialBalance: num(a.initialBalance),
    openingDate: fromDbDate(a.openingDate),
    icon: a.icon,
    color: a.color,
    isActive: a.isActive,
    sortOrder: a.sortOrder,
    balance,
  };
}

export async function findAccount(db: DbClient, userId: string, id: string): Promise<Account> {
  const account = await db.account.findUnique({ where: { id_userId: { id, userId } } });
  if (!account) throw notFound('Cuenta no encontrada.');
  return account;
}

export async function accountBalance(db: DbClient, userId: string, account: Account, excludeIds: string[] = []) {
  const totals = applyLedger(await ledgerEntries(db, userId, { accountId: account.id, excludeIds }));
  return num(account.initialBalance) + (totals.accountDeltas.get(account.id) ?? 0);
}

export async function listAccounts(db: DbClient, userId: string): Promise<AccountDTO[]> {
  const [accounts, entries] = await Promise.all([
    db.account.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    ledgerEntries(db, userId),
  ]);
  const { accountDeltas } = applyLedger(entries);
  return accounts.map((a) => toAccountDTO(a, num(a.initialBalance) + (accountDeltas.get(a.id) ?? 0)));
}

export async function getAccount(db: DbClient, userId: string, id: string): Promise<AccountDTO> {
  const account = await findAccount(db, userId, id);
  return toAccountDTO(account, await accountBalance(db, userId, account));
}

export async function createAccount(db: DbClient, auth: AuthContext, input: AccountCreateInput): Promise<AccountDTO> {
  const sortOrder = await db.account.count({ where: { userId: auth.userId } });
  try {
    const account = await db.account.create({
      data: {
        userId: auth.userId,
        name: input.name,
        type: input.type,
        institution: input.institution,
        initialBalance: BigInt(input.initialBalance),
        openingDate: toDbDate(input.openingDate ?? auth.today),
        icon: input.icon,
        color: input.color,
        sortOrder,
      },
    });
    return toAccountDTO(account, num(account.initialBalance));
  } catch (err) {
    if (isUniqueViolation(err)) throw NAME_TAKEN();
    throw err;
  }
}

export async function updateAccount(db: DbClient, userId: string, id: string, input: AccountUpdateInput): Promise<AccountDTO> {
  const account = await findAccount(db, userId, id);

  if (input.isActive === false && account.isActive) {
    const initialChange = input.initialBalance !== undefined ? input.initialBalance - num(account.initialBalance) : 0;
    if ((await accountBalance(db, userId, account)) + initialChange !== 0) {
      throw conflict('ACCOUNT_HAS_BALANCE', 'Solo puedes archivar una cuenta con saldo $0.');
    }
  }
  if (input.type && input.type !== 'SAVINGS' && input.type !== 'INVESTMENT') {
    if ((await db.goal.count({ where: { userId, accountId: id } })) > 0) {
      throw conflict('ACCOUNT_HAS_GOALS', 'Esta cuenta guarda metas: debe seguir siendo de ahorro o inversión.');
    }
  }

  try {
    const updated = await db.account.update({
      where: { id_userId: { id, userId } },
      data: {
        name: input.name,
        type: input.type,
        institution: input.institution,
        initialBalance: input.initialBalance !== undefined ? BigInt(input.initialBalance) : undefined,
        openingDate: input.openingDate ? toDbDate(input.openingDate) : undefined,
        icon: input.icon,
        color: input.color,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });
    return toAccountDTO(updated, await accountBalance(db, userId, updated));
  } catch (err) {
    if (isUniqueViolation(err)) throw NAME_TAKEN();
    throw err;
  }
}

export async function deleteAccount(db: DbClient, userId: string, id: string): Promise<void> {
  await findAccount(db, userId, id);
  const [transactions, goals, rules, items] = await Promise.all([
    db.transaction.count({ where: { userId, OR: [{ accountId: id }, { toAccountId: id }] } }),
    db.goal.count({ where: { userId, accountId: id } }),
    db.recurringRule.count({ where: { userId, accountId: id } }),
    db.scheduledItem.count({ where: { userId, accountId: id } }),
  ]);
  if (transactions + goals + rules + items > 0) {
    throw conflict('ACCOUNT_IN_USE', 'Esta cuenta tiene movimientos. Archívala en lugar de eliminarla.');
  }
  await db.account.delete({ where: { id_userId: { id, userId } } });
}
```

`apps/api/src/modules/accounts/routes.ts`:
```ts
import { accountCreateSchema, accountUpdateSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import { createAccount, deleteAccount, getAccount, listAccounts, updateAccount } from './service';

export async function accountRoutes(app: FastifyInstance) {
  app.get('/accounts', async (req) => ({ items: await listAccounts(app.prisma, req.auth.userId) }));

  app.post('/accounts', async (req, reply) => {
    const account = await createAccount(app.prisma, req.auth, parse(accountCreateSchema, req.body));
    return reply.status(201).send({ account });
  });

  app.get('/accounts/:id', async (req) => ({
    account: await getAccount(app.prisma, req.auth.userId, parseId(req.params)),
  }));

  app.put('/accounts/:id', async (req) => ({
    account: await updateAccount(app.prisma, req.auth.userId, parseId(req.params), parse(accountUpdateSchema, req.body)),
  }));

  app.delete('/accounts/:id', async (req, reply) => {
    await deleteAccount(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });
}
```

- [ ] **Step 6: Servicio y rutas de categorías**

`apps/api/src/modules/categories/service.ts`:
```ts
import type { CategoryCreateInput, CategoryDTO, CategoryKind, CategoryUpdateInput } from '@finanzas/shared';
import type { Category } from '../../generated/prisma/client';
import { badRequest, conflict, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';

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

export async function findSystemCategory(db: DbClient, userId: string, systemKey: string): Promise<Category> {
  const category = await db.category.findUnique({ where: { userId_systemKey: { userId, systemKey } } });
  if (!category) throw new Error(`Missing system category ${systemKey} for user`);
  return category;
}

async function validParent(db: DbClient, userId: string, parentId: string, kind: CategoryKind, selfId?: string) {
  const parent = await db.category.findUnique({ where: { id_userId: { id: parentId, userId } } });
  if (!parent) throw badRequest('INVALID_REFERENCE', 'Revisa la categoría padre.', { parentId: 'Categoría padre no encontrada' });
  if (parent.id === selfId) throw badRequest('INVALID_PARENT', 'Una categoría no puede ser su propia subcategoría.', { parentId: 'Inválida' });
  if (parent.parentId) throw badRequest('INVALID_PARENT', 'Solo se permite un nivel de subcategorías.', { parentId: 'Elige una categoría principal' });
  if (parent.kind !== kind) throw badRequest('INVALID_PARENT', 'La subcategoría debe ser del mismo tipo que su categoría principal.', { parentId: 'Tipo distinto' });
  if (parent.isSystem) throw badRequest('INVALID_PARENT', 'No se pueden crear subcategorías de una categoría del sistema.', { parentId: 'No permitida' });
  return parent;
}

async function assertRootNameFree(db: DbClient, userId: string, kind: CategoryKind, name: string, exceptId?: string) {
  const existing = await db.category.findFirst({
    where: { userId, kind, parentId: null, name: { equals: name, mode: 'insensitive' }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  });
  if (existing) throw NAME_TAKEN();
}

export async function listCategories(db: DbClient, userId: string): Promise<CategoryDTO[]> {
  const items = await db.category.findMany({ where: { userId }, orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
  return items.map(toCategoryDTO);
}

export async function createCategory(db: DbClient, userId: string, input: CategoryCreateInput): Promise<CategoryDTO> {
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
      data: { userId, name: input.name, kind: input.kind, parentId: input.parentId, bucket, icon: input.icon, color: input.color, sortOrder },
    });
    return toCategoryDTO(created);
  } catch (err) {
    if (isUniqueViolation(err)) throw NAME_TAKEN();
    throw err;
  }
}

export async function updateCategory(db: DbClient, userId: string, id: string, input: CategoryUpdateInput): Promise<CategoryDTO> {
  const current = await findCategory(db, userId, id);
  if (current.isSystem) throw conflict('SYSTEM_CATEGORY', 'Esta categoría es del sistema y no se puede modificar.');
  if (input.bucket && current.kind === 'INCOME') {
    throw badRequest('INVALID_BUCKET', 'Las categorías de ingreso no tienen bolsa.', { bucket: 'No aplica' });
  }
  if (input.parentId) {
    await validParent(db, userId, input.parentId, current.kind, id);
    if ((await db.category.count({ where: { userId, parentId: id } })) > 0) {
      throw badRequest('INVALID_PARENT', 'Una categoría con subcategorías no puede volverse subcategoría.', { parentId: 'No permitida' });
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
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });
    return toCategoryDTO(updated);
  } catch (err) {
    if (isUniqueViolation(err)) throw NAME_TAKEN();
    throw err;
  }
}

export async function deleteCategory(db: DbClient, userId: string, id: string): Promise<void> {
  const category = await findCategory(db, userId, id);
  if (category.isSystem || category.systemKey) {
    throw conflict('SYSTEM_CATEGORY', 'Esta categoría no se puede eliminar.');
  }
  const counts = await Promise.all([
    db.transaction.count({ where: { userId, categoryId: id } }),
    db.category.count({ where: { userId, parentId: id } }),
    db.budgetCategory.count({ where: { userId, categoryId: id } }),
    db.recurringRule.count({ where: { userId, categoryId: id } }),
    db.scheduledItem.count({ where: { userId, categoryId: id } }),
  ]);
  if (counts.some((c) => c > 0)) {
    throw conflict('CATEGORY_IN_USE', 'Esta categoría tiene movimientos o subcategorías. Archívala en lugar de eliminarla.');
  }
  await db.category.delete({ where: { id_userId: { id, userId } } });
}
```

`apps/api/src/modules/categories/routes.ts`:
```ts
import { categoryCreateSchema, categoryUpdateSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import { createCategory, deleteCategory, listCategories, updateCategory } from './service';

export async function categoryRoutes(app: FastifyInstance) {
  app.get('/categories', async (req) => ({ items: await listCategories(app.prisma, req.auth.userId) }));

  app.post('/categories', async (req, reply) => {
    const category = await createCategory(app.prisma, req.auth.userId, parse(categoryCreateSchema, req.body));
    return reply.status(201).send({ category });
  });

  app.put('/categories/:id', async (req) => ({
    category: await updateCategory(app.prisma, req.auth.userId, parseId(req.params), parse(categoryUpdateSchema, req.body)),
  }));

  app.delete('/categories/:id', async (req, reply) => {
    await deleteCategory(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });
}
```

- [ ] **Step 7: Servicio y rutas de etiquetas**

`apps/api/src/modules/tags/service.ts`:
```ts
import type { TagDTO } from '@finanzas/shared';
import { notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';

export async function listTags(db: DbClient, userId: string): Promise<TagDTO[]> {
  const tags = await db.tag.findMany({
    where: { userId },
    include: { _count: { select: { transactions: true } } },
    orderBy: { name: 'asc' },
  });
  return tags.map((t) => ({ id: t.id, name: t.name, usageCount: t._count.transactions }));
}

export async function deleteTag(db: DbClient, userId: string, id: string): Promise<void> {
  const result = await db.tag.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw notFound('Etiqueta no encontrada.');
}
```

`apps/api/src/modules/tags/routes.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { parseId } from '../../lib/validation';
import { deleteTag, listTags } from './service';

export async function tagRoutes(app: FastifyInstance) {
  app.get('/tags', async (req) => ({ items: await listTags(app.prisma, req.auth.userId) }));
  app.delete('/tags/:id', async (req, reply) => {
    await deleteTag(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });
}
```

- [ ] **Step 8: Registrar rutas**

En `apps/api/src/app.ts` importar `accountRoutes`, `categoryRoutes`, `tagRoutes` y dentro del scope protegido, después de `meRoutes`:
```ts
      await api.register(accountRoutes);
      await api.register(categoryRoutes);
      await api.register(tagRoutes);
```

- [ ] **Step 9: Verificar**

Run: `npm test -w @finanzas/api && npm run typecheck -w @finanzas/api && npm run lint`
Expected: PASS (incluye `accounts.test.ts` y `categories.test.ts`).

---

### Task 11: Tarjetas de crédito y préstamos (CRUD y estado calculado)

**Files:**
- Create: `apps/api/src/modules/credit-cards/service.ts`, `apps/api/src/modules/credit-cards/routes.ts`, `apps/api/src/modules/debts/service.ts`, `apps/api/src/modules/debts/routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/cards-debts.test.ts`

**Interfaces:**
- Consumes: `cardStatus`, `initialDebtCharge`, `upcomingInstallments`, `CardCharge` (Task 9); `loanInstallmentDue`, `nextLoanPaymentDate` (Task 9); `applyLedger` (Task 8); `ledgerEntries`, `findAccount`, `isUniqueViolation`, `parseId` (Task 10).
- Produces:
  - `loadCardLedgers(db, userId, today, cardIds?): Promise<Map<string, CardLedger>>` con `CardLedger { purchases, payments, charges: CardCharge[] }`.
  - `toCreditCardDTO(card, ledger | undefined, today): CreditCardDTO`, `listCreditCards(db, userId, today)`, `getCreditCard(db, userId, id, today)`, `findCreditCard(db, userId, id)`, `getCardStatement(db, userId, id, today): CardStatementDTO`, `createCreditCard(db, auth, input)`, `updateCreditCard(db, auth, id, input)`, `deleteCreditCard(db, userId, id)`, `cardDebt(db, userId, card, excludeIds?)`.
  - `loadDebtLedgers(db, userId, today, debtIds?)`, `toDebtDTO(debt, ledger | undefined, today): DebtDTO`, `listDebts`, `getDebt`, `findDebt`, `createDebt(db, auth, input)`, `updateDebt(db, auth, id, input)`, `deleteDebt`, `loanBalance(db, userId, debt, excludeIds?)`.
  - Rutas: `GET/POST /api/credit-cards`, `GET/PUT/DELETE /api/credit-cards/:id`, `GET /api/credit-cards/:id/statement` (`{ items }`, `{ card }`, `CardStatementDTO`); `GET/POST /api/debts`, `GET/PUT/DELETE /api/debts/:id` (`{ items }`, `{ debt }`).

- [ ] **Step 1: Escribir tests que fallan**

`apps/api/test/cards-debts.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, registerUser } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  // Hoy fijo: 2026-10-20 en Bogotá.
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

const card = { name: 'Nu Crédito', issuer: 'Nu', creditLimit: 5_000_000, statementDay: 15, paymentDueDay: 30 };

describe('credit cards', () => {
  it('computes debt, available credit and the payment due from the initial debt', async () => {
    const { api } = await registerUser(app);
    const res = await api.post('/api/credit-cards', { ...card, initialDebt: 800_000 });
    expect(res.status).toBe(201);
    expect(res.body.card).toMatchObject({
      openingDate: '2026-10-20',
      debt: 800_000,
      available: 4_200_000,
      utilization: 0.16,
      amountDue: 800_000,
      dueDate: '2026-10-30',
      isOverdue: false,
      lastCutoff: '2026-10-15',
      nextCutoff: '2026-11-15',
      committed: 800_000,
    });
    const list = await api.get('/api/credit-cards');
    expect(list.body.items).toHaveLength(1);
    const statement = await api.get(`/api/credit-cards/${res.body.card.id}/statement`);
    expect(statement.status).toBe(200);
    expect(statement.body.upcoming).toEqual([]);
  });

  it('validates input and unique names', async () => {
    const { api } = await registerUser(app);
    expect((await api.post('/api/credit-cards', { ...card, statementDay: 32 })).status).toBe(400);
    expect((await api.post('/api/credit-cards', card)).status).toBe(201);
    expect((await api.post('/api/credit-cards', card)).status).toBe(409);
  });

  it('archives only without debt and deletes only without movements', async () => {
    const { api } = await registerUser(app);
    const { body } = await api.post('/api/credit-cards', { ...card, initialDebt: 100_000 });
    const id = body.card.id;
    expect((await api.put(`/api/credit-cards/${id}`, { isActive: false })).status).toBe(409);
    const archived = await api.put(`/api/credit-cards/${id}`, { initialDebt: 0, isActive: false });
    expect(archived.status).toBe(200);
    expect(archived.body.card.isActive).toBe(false);
    expect((await api.del(`/api/credit-cards/${id}`)).status).toBe(204);
  });
});

describe('debts', () => {
  it('computes balance and the pending monthly installment', async () => {
    const { api } = await registerUser(app);
    const res = await api.post('/api/debts', {
      name: 'Libre inversión',
      lender: 'Bancolombia',
      initialBalance: 8_000_000,
      monthlyPayment: 450_000,
      paymentDay: 5,
    });
    expect(res.status).toBe(201);
    expect(res.body.debt).toMatchObject({ balance: 8_000_000, installmentDue: 450_000, nextPaymentDate: '2026-10-05' });
  });

  it('records the money received as a disbursement, not as income', async () => {
    const { api } = await registerUser(app);
    const account = (await api.post('/api/accounts', { name: 'Bancolombia', type: 'BANK', initialBalance: 100_000 })).body.account;
    const res = await api.post('/api/debts', { name: 'Crédito carro', initialBalance: 3_000_000, receivedInAccountId: account.id });
    expect(res.status).toBe(201);
    expect(res.body.debt).toMatchObject({ initialBalance: 0, balance: 3_000_000 });
    expect((await api.get(`/api/accounts/${account.id}`)).body.account.balance).toBe(3_100_000);
    const txs = await app.prisma.transaction.findMany({ where: { debtId: res.body.debt.id } });
    expect(txs.map((t) => t.type)).toEqual(['DEBT_DISBURSEMENT']);
  });

  it("rejects receiving the loan in another user's account", async () => {
    const owner = await registerUser(app);
    const intruder = await registerUser(app);
    const account = (await owner.api.post('/api/accounts', { name: 'Nequi', type: 'DIGITAL_WALLET' })).body.account;
    const res = await intruder.api.post('/api/debts', { name: 'X', initialBalance: 1000, receivedInAccountId: account.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REFERENCE');
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- cards-debts`
Expected: FAIL — rutas inexistentes.

- [ ] **Step 3: Servicio de tarjetas**

`apps/api/src/modules/credit-cards/service.ts`:
```ts
import {
  addMonths,
  type CardStatementDTO,
  type CreditCardCreateInput,
  type CreditCardDTO,
  type CreditCardUpdateInput,
  type IsoDate,
} from '@finanzas/shared';
import {
  cardStatus,
  initialDebtCharge,
  upcomingInstallments,
  type CardCharge,
  type CardTerms,
} from '../../domain/card-billing';
import { applyLedger } from '../../domain/ledger';
import type { CreditCard } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { conflict, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import { ledgerEntries } from '../ledger/repository';

export interface CardLedger {
  purchases: number;
  payments: number;
  charges: CardCharge[];
}

const NAME_TAKEN = () => conflict('CARD_NAME_TAKEN', 'Ya tienes una tarjeta con ese nombre.');
const OLD_DATE = '1970-01-01';

/** Compras diferidas recientes una por una; compras de contado agrupadas por fecha; lo muy antiguo, en un total. */
export async function loadCardLedgers(db: DbClient, userId: string, today: IsoDate, cardIds?: string[]) {
  const creditCardId = cardIds ? { in: cardIds } : { not: null };
  const windowStart = toDbDate(addMonths(today, -50));
  const [totals, deferred, singles, old] = await Promise.all([
    db.transaction.groupBy({ by: ['creditCardId', 'type'], where: { userId, creditCardId }, _sum: { amount: true } }),
    db.transaction.findMany({
      where: { userId, creditCardId, type: 'CARD_PURCHASE', installments: { gt: 1 }, date: { gte: windowStart } },
      select: { creditCardId: true, date: true, amount: true, installments: true },
    }),
    db.transaction.groupBy({
      by: ['creditCardId', 'date'],
      where: { userId, creditCardId, type: 'CARD_PURCHASE', installments: 1, date: { gte: windowStart } },
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ['creditCardId'],
      where: { userId, creditCardId, type: 'CARD_PURCHASE', date: { lt: windowStart } },
      _sum: { amount: true },
    }),
  ]);

  const ledgers = new Map<string, CardLedger>();
  const get = (id: string) => {
    let ledger = ledgers.get(id);
    if (!ledger) {
      ledger = { purchases: 0, payments: 0, charges: [] };
      ledgers.set(id, ledger);
    }
    return ledger;
  };
  for (const t of totals) {
    if (!t.creditCardId) continue;
    if (t.type === 'CARD_PURCHASE') get(t.creditCardId).purchases += num(t._sum.amount);
    if (t.type === 'CARD_PAYMENT') get(t.creditCardId).payments += num(t._sum.amount);
  }
  for (const d of deferred) {
    get(d.creditCardId!).charges.push({ date: fromDbDate(d.date), amount: num(d.amount), installments: d.installments! });
  }
  for (const s of singles) {
    get(s.creditCardId!).charges.push({ date: fromDbDate(s.date), amount: num(s._sum.amount), installments: 1 });
  }
  for (const o of old) {
    get(o.creditCardId!).charges.push({ date: OLD_DATE, amount: num(o._sum.amount), installments: 1 });
  }
  return ledgers;
}

function billingOf(card: CreditCard, ledger: CardLedger | undefined) {
  const l = ledger ?? { purchases: 0, payments: 0, charges: [] };
  const terms: CardTerms = { statementDay: card.statementDay, paymentDueDay: card.paymentDueDay };
  const initialDebt = num(card.initialDebt);
  const initial = initialDebtCharge(
    { initialDebt, initialDebtInstallments: card.initialDebtInstallments, openingDate: fromDbDate(card.openingDate) },
    terms,
  );
  return {
    terms,
    charges: initial ? [initial, ...l.charges] : l.charges,
    debt: initialDebt + l.purchases - l.payments,
    payments: l.payments,
  };
}

export function toCreditCardDTO(card: CreditCard, ledger: CardLedger | undefined, today: IsoDate): CreditCardDTO {
  const b = billingOf(card, ledger);
  const status = cardStatus({ terms: b.terms, charges: b.charges, totalPayments: b.payments, debt: b.debt, today });
  const creditLimit = num(card.creditLimit);
  return {
    id: card.id,
    name: card.name,
    issuer: card.issuer,
    creditLimit,
    initialDebt: num(card.initialDebt),
    initialDebtInstallments: card.initialDebtInstallments,
    openingDate: fromDbDate(card.openingDate),
    statementDay: card.statementDay,
    paymentDueDay: card.paymentDueDay,
    icon: card.icon,
    color: card.color,
    isActive: card.isActive,
    sortOrder: card.sortOrder,
    debt: b.debt,
    available: creditLimit - b.debt,
    utilization: Math.max(b.debt, 0) / creditLimit,
    amountDue: status.amountDue,
    dueDate: status.lastDueDate,
    isOverdue: status.isOverdue,
    lastCutoff: status.lastCutoff,
    nextCutoff: status.nextCutoff,
    nextDueDate: status.nextDueDate,
    committed: status.committed,
  };
}

export async function findCreditCard(db: DbClient, userId: string, id: string): Promise<CreditCard> {
  const card = await db.creditCard.findUnique({ where: { id_userId: { id, userId } } });
  if (!card) throw notFound('Tarjeta no encontrada.');
  return card;
}

export async function cardDebt(db: DbClient, userId: string, card: CreditCard, excludeIds: string[] = []) {
  const totals = applyLedger(await ledgerEntries(db, userId, { creditCardId: card.id, excludeIds }));
  return num(card.initialDebt) + (totals.cardDeltas.get(card.id) ?? 0);
}

export async function listCreditCards(db: DbClient, userId: string, today: IsoDate): Promise<CreditCardDTO[]> {
  const [cards, ledgers] = await Promise.all([
    db.creditCard.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    loadCardLedgers(db, userId, today),
  ]);
  return cards.map((c) => toCreditCardDTO(c, ledgers.get(c.id), today));
}

export async function getCreditCard(db: DbClient, userId: string, id: string, today: IsoDate) {
  const card = await findCreditCard(db, userId, id);
  const ledgers = await loadCardLedgers(db, userId, today, [id]);
  return toCreditCardDTO(card, ledgers.get(id), today);
}

export async function getCardStatement(db: DbClient, userId: string, id: string, today: IsoDate): Promise<CardStatementDTO> {
  const card = await findCreditCard(db, userId, id);
  const ledger = (await loadCardLedgers(db, userId, today, [id])).get(id);
  const dto = toCreditCardDTO(card, ledger, today);
  const b = billingOf(card, ledger);
  return { card: dto, upcoming: upcomingInstallments(b.charges, dto.lastCutoff, b.terms, 12) };
}

export async function createCreditCard(db: DbClient, auth: AuthContext, input: CreditCardCreateInput) {
  const sortOrder = await db.creditCard.count({ where: { userId: auth.userId } });
  try {
    const card = await db.creditCard.create({
      data: {
        userId: auth.userId,
        name: input.name,
        issuer: input.issuer,
        creditLimit: BigInt(input.creditLimit),
        initialDebt: BigInt(input.initialDebt),
        initialDebtInstallments: input.initialDebtInstallments,
        openingDate: toDbDate(input.openingDate ?? auth.today),
        statementDay: input.statementDay,
        paymentDueDay: input.paymentDueDay,
        icon: input.icon,
        color: input.color,
        sortOrder,
      },
    });
    return toCreditCardDTO(card, undefined, auth.today);
  } catch (err) {
    if (isUniqueViolation(err)) throw NAME_TAKEN();
    throw err;
  }
}

export async function updateCreditCard(db: DbClient, auth: AuthContext, id: string, input: CreditCardUpdateInput) {
  const card = await findCreditCard(db, auth.userId, id);
  if (input.isActive === false && card.isActive) {
    const initialChange = input.initialDebt !== undefined ? input.initialDebt - num(card.initialDebt) : 0;
    if ((await cardDebt(db, auth.userId, card)) + initialChange !== 0) {
      throw conflict('CARD_HAS_DEBT', 'Solo puedes archivar una tarjeta sin deuda.');
    }
  }
  try {
    await db.creditCard.update({
      where: { id_userId: { id, userId: auth.userId } },
      data: {
        name: input.name,
        issuer: input.issuer,
        creditLimit: input.creditLimit !== undefined ? BigInt(input.creditLimit) : undefined,
        initialDebt: input.initialDebt !== undefined ? BigInt(input.initialDebt) : undefined,
        initialDebtInstallments: input.initialDebtInstallments,
        openingDate: input.openingDate ? toDbDate(input.openingDate) : undefined,
        statementDay: input.statementDay,
        paymentDueDay: input.paymentDueDay,
        icon: input.icon,
        color: input.color,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw NAME_TAKEN();
    throw err;
  }
  return getCreditCard(db, auth.userId, id, auth.today);
}

export async function deleteCreditCard(db: DbClient, userId: string, id: string): Promise<void> {
  await findCreditCard(db, userId, id);
  const counts = await Promise.all([
    db.transaction.count({ where: { userId, creditCardId: id } }),
    db.recurringRule.count({ where: { userId, creditCardId: id } }),
    db.scheduledItem.count({ where: { userId, creditCardId: id } }),
  ]);
  if (counts.some((c) => c > 0)) {
    throw conflict('CARD_IN_USE', 'Esta tarjeta tiene movimientos. Archívala en lugar de eliminarla.');
  }
  await db.creditCard.delete({ where: { id_userId: { id, userId } } });
}
```

`apps/api/src/modules/credit-cards/routes.ts`:
```ts
import { creditCardCreateSchema, creditCardUpdateSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import {
  createCreditCard,
  deleteCreditCard,
  getCardStatement,
  getCreditCard,
  listCreditCards,
  updateCreditCard,
} from './service';

export async function creditCardRoutes(app: FastifyInstance) {
  app.get('/credit-cards', async (req) => ({ items: await listCreditCards(app.prisma, req.auth.userId, req.auth.today) }));

  app.post('/credit-cards', async (req, reply) => {
    const card = await createCreditCard(app.prisma, req.auth, parse(creditCardCreateSchema, req.body));
    return reply.status(201).send({ card });
  });

  app.get('/credit-cards/:id', async (req) => ({
    card: await getCreditCard(app.prisma, req.auth.userId, parseId(req.params), req.auth.today),
  }));

  app.get('/credit-cards/:id/statement', async (req) =>
    getCardStatement(app.prisma, req.auth.userId, parseId(req.params), req.auth.today),
  );

  app.put('/credit-cards/:id', async (req) => ({
    card: await updateCreditCard(app.prisma, req.auth, parseId(req.params), parse(creditCardUpdateSchema, req.body)),
  }));

  app.delete('/credit-cards/:id', async (req, reply) => {
    await deleteCreditCard(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });
}
```

- [ ] **Step 4: Servicio de préstamos**

`apps/api/src/modules/debts/service.ts`:
```ts
import {
  endOfMonth,
  startOfMonth,
  type DebtCreateInput,
  type DebtDTO,
  type DebtUpdateInput,
  type IsoDate,
} from '@finanzas/shared';
import { applyLedger } from '../../domain/ledger';
import { loanInstallmentDue, nextLoanPaymentDate } from '../../domain/loans';
import type { Debt, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { badRequest, conflict, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import { ledgerEntries } from '../ledger/repository';

export interface DebtLedger {
  disbursed: number;
  paid: number;
  paidThisMonth: number;
}

const NAME_TAKEN = () => conflict('DEBT_NAME_TAKEN', 'Ya tienes un préstamo con ese nombre.');

export async function loadDebtLedgers(db: DbClient, userId: string, today: IsoDate, debtIds?: string[]) {
  const debtId = debtIds ? { in: debtIds } : { not: null };
  const month = { gte: toDbDate(startOfMonth(today)), lte: toDbDate(endOfMonth(today)) };
  const [totals, monthPayments, interests] = await Promise.all([
    db.transaction.groupBy({ by: ['debtId', 'type'], where: { userId, debtId }, _sum: { amount: true } }),
    db.transaction.groupBy({
      by: ['debtId'],
      where: { userId, debtId, type: 'DEBT_PAYMENT', date: month },
      _sum: { amount: true },
    }),
    db.transaction.findMany({
      where: { userId, type: 'EXPENSE', date: month, parent: { is: { type: 'DEBT_PAYMENT', debtId } } },
      select: { amount: true, parent: { select: { debtId: true } } },
    }),
  ]);
  const ledgers = new Map<string, DebtLedger>();
  const get = (id: string) => {
    let ledger = ledgers.get(id);
    if (!ledger) {
      ledger = { disbursed: 0, paid: 0, paidThisMonth: 0 };
      ledgers.set(id, ledger);
    }
    return ledger;
  };
  for (const t of totals) {
    if (!t.debtId) continue;
    if (t.type === 'DEBT_DISBURSEMENT') get(t.debtId).disbursed += num(t._sum.amount);
    if (t.type === 'DEBT_PAYMENT') get(t.debtId).paid += num(t._sum.amount);
  }
  for (const p of monthPayments) if (p.debtId) get(p.debtId).paidThisMonth += num(p._sum.amount);
  for (const i of interests) if (i.parent?.debtId) get(i.parent.debtId).paidThisMonth += num(i.amount);
  return ledgers;
}

export function toDebtDTO(debt: Debt, ledger: DebtLedger | undefined, today: IsoDate): DebtDTO {
  const l = ledger ?? { disbursed: 0, paid: 0, paidThisMonth: 0 };
  const balance = num(debt.initialBalance) + l.disbursed - l.paid;
  const terms = {
    balance,
    monthlyPayment: debt.monthlyPayment != null ? num(debt.monthlyPayment) : null,
    paymentDay: debt.paymentDay,
    paidThisMonth: l.paidThisMonth,
  };
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
    balance,
    installmentDue: loanInstallmentDue(terms, today, endOfMonth(today)),
    nextPaymentDate: nextLoanPaymentDate(terms, today),
  };
}

export async function findDebt(db: DbClient, userId: string, id: string): Promise<Debt> {
  const debt = await db.debt.findUnique({ where: { id_userId: { id, userId } } });
  if (!debt) throw notFound('Préstamo no encontrado.');
  return debt;
}

export async function loanBalance(db: DbClient, userId: string, debt: Debt, excludeIds: string[] = []) {
  const totals = applyLedger(await ledgerEntries(db, userId, { debtId: debt.id, excludeIds }));
  return num(debt.initialBalance) + (totals.loanDeltas.get(debt.id) ?? 0);
}

export async function listDebts(db: DbClient, userId: string, today: IsoDate): Promise<DebtDTO[]> {
  const [debts, ledgers] = await Promise.all([
    db.debt.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    loadDebtLedgers(db, userId, today),
  ]);
  return debts.map((d) => toDebtDTO(d, ledgers.get(d.id), today));
}

export async function getDebt(db: DbClient, userId: string, id: string, today: IsoDate) {
  const debt = await findDebt(db, userId, id);
  return toDebtDTO(debt, (await loadDebtLedgers(db, userId, today, [id])).get(id), today);
}

export async function createDebt(db: PrismaClient, auth: AuthContext, input: DebtCreateInput): Promise<DebtDTO> {
  const openingDate = input.openingDate ?? auth.today;
  if (input.receivedInAccountId) {
    if (openingDate > auth.today) {
      throw badRequest('FUTURE_DATE', 'La fecha no puede ser futura.', { openingDate: 'La fecha no puede ser futura' });
    }
    const account = await db.account.findUnique({ where: { id_userId: { id: input.receivedInAccountId, userId: auth.userId } } });
    if (!account || !account.isActive) {
      throw badRequest('INVALID_REFERENCE', 'Revisa la cuenta seleccionada.', { receivedInAccountId: 'Cuenta no encontrada' });
    }
  }
  try {
    const debt = await db.$transaction(async (tx) => {
      const created = await tx.debt.create({
        data: {
          userId: auth.userId,
          name: input.name,
          lender: input.lender,
          initialBalance: BigInt(input.receivedInAccountId ? 0 : input.initialBalance),
          openingDate: toDbDate(openingDate),
          monthlyPayment: input.monthlyPayment != null ? BigInt(input.monthlyPayment) : null,
          paymentDay: input.paymentDay,
          icon: input.icon,
          color: input.color,
        },
      });
      if (input.receivedInAccountId) {
        await tx.transaction.create({
          data: {
            userId: auth.userId,
            type: 'DEBT_DISBURSEMENT',
            amount: BigInt(input.initialBalance),
            date: toDbDate(openingDate),
            accountId: input.receivedInAccountId,
            debtId: created.id,
            description: `Desembolso ${input.name}`,
          },
        });
      }
      return created;
    });
    return getDebt(db, auth.userId, debt.id, auth.today);
  } catch (err) {
    if (isUniqueViolation(err)) throw NAME_TAKEN();
    throw err;
  }
}

export async function updateDebt(db: DbClient, auth: AuthContext, id: string, input: DebtUpdateInput) {
  const debt = await findDebt(db, auth.userId, id);
  if (input.isActive === false && debt.isActive) {
    const initialChange = input.initialBalance !== undefined ? input.initialBalance - num(debt.initialBalance) : 0;
    if ((await loanBalance(db, auth.userId, debt)) + initialChange !== 0) {
      throw conflict('DEBT_HAS_BALANCE', 'Solo puedes archivar un préstamo pagado por completo.');
    }
  }
  try {
    await db.debt.update({
      where: { id_userId: { id, userId: auth.userId } },
      data: {
        name: input.name,
        lender: input.lender,
        initialBalance: input.initialBalance !== undefined ? BigInt(input.initialBalance) : undefined,
        openingDate: input.openingDate ? toDbDate(input.openingDate) : undefined,
        monthlyPayment:
          input.monthlyPayment === undefined ? undefined : input.monthlyPayment === null ? null : BigInt(input.monthlyPayment),
        paymentDay: input.paymentDay,
        icon: input.icon,
        color: input.color,
        isActive: input.isActive,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw NAME_TAKEN();
    throw err;
  }
  return getDebt(db, auth.userId, id, auth.today);
}

export async function deleteDebt(db: DbClient, userId: string, id: string): Promise<void> {
  await findDebt(db, userId, id);
  if ((await db.transaction.count({ where: { userId, debtId: id } })) > 0) {
    throw conflict('DEBT_IN_USE', 'Este préstamo tiene movimientos. Archívalo en lugar de eliminarlo.');
  }
  await db.debt.delete({ where: { id_userId: { id, userId } } });
}
```

`apps/api/src/modules/debts/routes.ts`:
```ts
import { debtCreateSchema, debtUpdateSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import { createDebt, deleteDebt, getDebt, listDebts, updateDebt } from './service';

export async function debtRoutes(app: FastifyInstance) {
  app.get('/debts', async (req) => ({ items: await listDebts(app.prisma, req.auth.userId, req.auth.today) }));

  app.post('/debts', async (req, reply) => {
    const debt = await createDebt(app.prisma, req.auth, parse(debtCreateSchema, req.body));
    return reply.status(201).send({ debt });
  });

  app.get('/debts/:id', async (req) => ({
    debt: await getDebt(app.prisma, req.auth.userId, parseId(req.params), req.auth.today),
  }));

  app.put('/debts/:id', async (req) => ({
    debt: await updateDebt(app.prisma, req.auth, parseId(req.params), parse(debtUpdateSchema, req.body)),
  }));

  app.delete('/debts/:id', async (req, reply) => {
    await deleteDebt(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });
}
```

- [ ] **Step 5: Registrar rutas**

En `apps/api/src/app.ts` importar `creditCardRoutes` y `debtRoutes` y agregarlos al scope protegido después de `tagRoutes`:
```ts
      await api.register(creditCardRoutes);
      await api.register(debtRoutes);
```

- [ ] **Step 6: Verificar**

Run: `npm test -w @finanzas/api && npm run typecheck -w @finanzas/api && npm run lint`
Expected: PASS (incluye los 6 tests de `cards-debts.test.ts`).

---

### Task 12: Movimientos — crear, consultar y eliminar (7 tipos, atajos y pagos de préstamo)

**Files:**
- Create: `apps/api/src/modules/transactions/mapper.ts`, `apps/api/src/modules/transactions/refs.ts`, `apps/api/src/modules/transactions/service.ts`, `apps/api/src/modules/transactions/routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/transactions.test.ts`, `apps/api/test/finance-fixtures.ts`

**Interfaces:**
- Consumes: `accountBalance`, `findAccount` (Task 10); `cardDebt`, `findCreditCard`, `loanBalance`, `findDebt` (Task 11); `findSystemCategory` (Task 10); esquemas `transactionSchema`, `transferBodySchema`, `cardPurchaseBodySchema`, `cardPaymentBodySchema`, `debtPaymentSchema`, `debtDisbursementSchema` (Task 3).
- Produces:
  - `transactionInclude`, `type TransactionRow`, `toTransactionDTO(row): TransactionDTO`.
  - `resolveRefs(db, userId, input, existing?): Promise<ResolvedRefs>` con `ResolvedRefs { account, toAccount, card, debt, category, goal }` (cada uno o `null`); `ExistingRefs` para permitir referencias archivadas sin cambios.
  - `getTransaction(db, userId, id)`, `createTransaction(db, auth, input): Promise<TransactionResultDTO>`, `deleteTransaction(db, userId, id)`; helpers internos `rowData`, `checkRules`, `syncTags`, `syncInterest`, `computeWarnings`, `assertNotFuture` (exportados para Task 13).
  - Rutas: `POST /api/transactions` (201 `{ transaction, warnings }`), `GET /api/transactions/:id`, `DELETE /api/transactions/:id` (204), `POST /api/transfers`, `POST /api/credit-cards/:id/purchase`, `POST /api/credit-cards/:id/payment`, `POST /api/debts/:id/payments`, `POST /api/debts/:id/disbursements`.
  - Fixture de test `setupFinances(api)` → `{ bank, wallet, savings, cash, card, debt, cat: { food, salary, fun } }` (ids).

- [ ] **Step 1: Crear la fixture de pruebas**

`apps/api/test/finance-fixtures.ts`:
```ts
import type { Client } from './helpers';

type Cat = { id: string; name: string; kind: string; systemKey: string | null };

/** Bancolombia $2.000.000, Nequi $0, Ahorro $0, Efectivo $100.000, Nu Crédito (cupo $5.000.000, corte 15, pago 30), préstamo $8.000.000. */
export async function setupFinances(api: Client) {
  const account = async (name: string, type: string, initialBalance = 0) =>
    (await api.post('/api/accounts', { name, type, initialBalance })).body.account.id as string;

  const bank = await account('Bancolombia', 'BANK', 2_000_000);
  const wallet = await account('Nequi', 'DIGITAL_WALLET');
  const savings = await account('Bolsillo ahorro', 'SAVINGS');
  const cash = await account('Efectivo', 'CASH', 100_000);
  const card = (
    await api.post('/api/credit-cards', { name: 'Nu Crédito', creditLimit: 5_000_000, statementDay: 15, paymentDueDay: 30 })
  ).body.card.id as string;
  const debt = (
    await api.post('/api/debts', { name: 'Libre inversión', initialBalance: 8_000_000, monthlyPayment: 450_000, paymentDay: 5 })
  ).body.debt.id as string;
  const categories = (await api.get('/api/categories')).body.items as Cat[];
  const byName = (name: string, kind: string) => categories.find((c) => c.name === name && c.kind === kind)!.id;
  return {
    bank,
    wallet,
    savings,
    cash,
    card,
    debt,
    cat: {
      food: byName('Alimentación', 'EXPENSE'),
      fun: byName('Entretenimiento', 'EXPENSE'),
      salary: byName('Salario', 'INCOME'),
      interest: categories.find((c) => c.systemKey === 'INTEREST')!.id,
    },
  };
}

export async function balanceOf(api: Client, accountId: string): Promise<number> {
  return (await api.get(`/api/accounts/${accountId}`)).body.account.balance;
}

export async function cardOf(api: Client, cardId: string) {
  return (await api.get(`/api/credit-cards/${cardId}`)).body.card as { debt: number; available: number; amountDue: number };
}
```

- [ ] **Step 2: Escribir tests que fallan**

`apps/api/test/transactions.test.ts`:
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

describe('income and expense', () => {
  it('income adds to the account and expense subtracts', async () => {
    const { api, f } = await newUser();
    const income = await api.post('/api/transactions', {
      type: 'INCOME',
      amount: 4_000_000,
      date: TODAY,
      accountId: f.bank,
      categoryId: f.cat.salary,
      payee: 'Empresa S.A.S.',
    });
    expect(income.status).toBe(201);
    expect(income.body.transaction).toMatchObject({ type: 'INCOME', amount: 4_000_000, payee: 'Empresa S.A.S.', method: null });
    expect(income.body.warnings).toEqual([]);

    const expense = await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 25_000,
      date: TODAY,
      accountId: f.wallet,
      categoryId: f.cat.food,
      description: 'Almuerzo',
      tags: ['Trabajo'],
    });
    expect(expense.body.transaction).toMatchObject({ method: 'DIGITAL_WALLET', tags: ['trabajo'] });
    expect(expense.body.warnings).toEqual(['NEGATIVE_BALANCE']);
    expect(await balanceOf(api, f.bank)).toBe(6_000_000);
    expect(await balanceOf(api, f.wallet)).toBe(-25_000);
    expect((await api.get('/api/tags')).body.items).toMatchObject([{ name: 'trabajo', usageCount: 1 }]);
  });

  it('rejects a category of the wrong kind and archived accounts', async () => {
    const { api, f } = await newUser();
    const wrongKind = await api.post('/api/transactions', { type: 'EXPENSE', amount: 1000, date: TODAY, accountId: f.bank, categoryId: f.cat.salary });
    expect(wrongKind.status).toBe(400);
    expect(wrongKind.body.error.fields.categoryId).toBeTypeOf('string');

    await api.put(`/api/accounts/${f.wallet}`, { isActive: false });
    const archived = await api.post('/api/transactions', { type: 'EXPENSE', amount: 1000, date: TODAY, accountId: f.wallet, categoryId: f.cat.food });
    expect(archived.status).toBe(400);
    expect(archived.body.error.fields.accountId).toMatch(/archivada/);
  });

  it('rejects future dates and warns about dates before the opening date', async () => {
    const { api, f } = await newUser();
    const future = await api.post('/api/transactions', { type: 'EXPENSE', amount: 1000, date: '2026-10-21', accountId: f.bank, categoryId: f.cat.food });
    expect(future.status).toBe(400);
    expect(future.body.error.code).toBe('FUTURE_DATE');
    const old = await api.post('/api/transactions', { type: 'EXPENSE', amount: 1000, date: '2026-10-01', accountId: f.bank, categoryId: f.cat.food });
    expect(old.status).toBe(201);
    expect(old.body.warnings).toContain('BEFORE_OPENING_DATE');
  });

  it('uses the Bogotá day for the future-date check (review focus #2)', async () => {
    // 2026-11-01 04:30 UTC = 2026-10-31 23:30 en Bogotá
    const { app: night } = await createTestApp({}, { now: () => new Date('2026-11-01T04:30:00Z') });
    const { api } = await registerUser(night);
    const f = await setupFinances(api);
    const ok = await api.post('/api/transactions', { type: 'EXPENSE', amount: 1000, date: '2026-10-31', accountId: f.bank, categoryId: f.cat.food });
    expect(ok.status).toBe(201);
    const tomorrow = await api.post('/api/transactions', { type: 'EXPENSE', amount: 1000, date: '2026-11-01', accountId: f.bank, categoryId: f.cat.food });
    expect(tomorrow.status).toBe(400);
    await night.close();
  });
});

describe('transfers', () => {
  it('moves money between own accounts without changing the total', async () => {
    const { api, f } = await newUser();
    const res = await api.post('/api/transfers', { amount: 200_000, date: TODAY, accountId: f.bank, toAccountId: f.wallet });
    expect(res.status).toBe(201);
    expect(res.body.transaction.type).toBe('TRANSFER');
    expect(await balanceOf(api, f.bank)).toBe(1_800_000);
    expect(await balanceOf(api, f.wallet)).toBe(200_000);
    const total = ((await api.get('/api/accounts')).body.items as Array<{ balance: number }>).reduce((s, a) => s + a.balance, 0);
    expect(total).toBe(2_100_000);
  });
});

describe('credit cards', () => {
  it('a purchase raises the card debt and leaves bank accounts untouched', async () => {
    const { api, f } = await newUser();
    const res = await api.post(`/api/credit-cards/${f.card}/purchase`, {
      amount: 300_000,
      date: TODAY,
      categoryId: f.cat.food,
      installments: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body.transaction).toMatchObject({ type: 'CARD_PURCHASE', installments: 3, method: 'CREDIT_CARD' });
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
    expect(await cardOf(api, f.card)).toMatchObject({ debt: 300_000, available: 4_700_000 });
  });

  it('partial payments reduce debt and bank balance; overpaying is rejected', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/credit-cards/${f.card}/purchase`, { amount: 1_000_000, date: TODAY, categoryId: f.cat.food });
    const partial = await api.post(`/api/credit-cards/${f.card}/payment`, { amount: 300_000, date: TODAY, accountId: f.bank });
    expect(partial.status).toBe(201);
    expect(await balanceOf(api, f.bank)).toBe(1_700_000);
    expect(await cardOf(api, f.card)).toMatchObject({ debt: 700_000, available: 4_300_000 });

    const over = await api.post(`/api/credit-cards/${f.card}/payment`, { amount: 800_000, date: TODAY, accountId: f.bank });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('PAYMENT_EXCEEDS_DEBT');
  });

  it('warns when a purchase goes over the credit limit', async () => {
    const { api, f } = await newUser();
    const res = await api.post(`/api/credit-cards/${f.card}/purchase`, { amount: 5_500_000, date: TODAY, categoryId: f.cat.food });
    expect(res.status).toBe(201);
    expect(res.body.warnings).toContain('OVER_CREDIT_LIMIT');
  });

  it("answers 404 for another user's card in the path", async () => {
    const a = await newUser();
    const b = await newUser();
    const res = await b.api.post(`/api/credit-cards/${a.f.card}/purchase`, { amount: 1000, date: TODAY, categoryId: b.f.cat.food });
    expect(res.status).toBe(404);
  });
});

describe('loans', () => {
  it('a payment splits principal (not an expense) and interest (expense child)', async () => {
    const { api, f } = await newUser();
    const res = await api.post(`/api/debts/${f.debt}/payments`, { accountId: f.bank, principal: 380_000, interest: 70_000, date: TODAY });
    expect(res.status).toBe(201);
    expect(res.body.transaction).toMatchObject({ type: 'DEBT_PAYMENT', amount: 380_000, interest: 70_000 });
    expect(await balanceOf(api, f.bank)).toBe(1_550_000);
    const debt = (await api.get(`/api/debts/${f.debt}`)).body.debt;
    expect(debt).toMatchObject({ balance: 7_620_000, installmentDue: 0 });

    const child = await app.prisma.transaction.findFirstOrThrow({ where: { parentId: res.body.transaction.id } });
    expect(child).toMatchObject({ type: 'EXPENSE', categoryId: f.cat.interest });

    const delChild = await api.del(`/api/transactions/${child.id}`);
    expect(delChild.status).toBe(400);
    expect(delChild.body.error.code).toBe('EDIT_PARENT');

    expect((await api.del(`/api/transactions/${res.body.transaction.id}`)).status).toBe(204);
    expect(await app.prisma.transaction.count({ where: { id: child.id } })).toBe(0);
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
  });

  it('rejects paying more principal than the balance and records disbursements', async () => {
    const { api, f } = await newUser();
    const over = await api.post(`/api/debts/${f.debt}/payments`, { accountId: f.bank, principal: 9_000_000, date: TODAY });
    expect(over.status).toBe(400);
    const disb = await api.post(`/api/debts/${f.debt}/disbursements`, { accountId: f.bank, amount: 1_000_000, date: TODAY });
    expect(disb.status).toBe(201);
    expect(await balanceOf(api, f.bank)).toBe(3_000_000);
    expect((await api.get(`/api/debts/${f.debt}`)).body.debt.balance).toBe(9_000_000);
  });
});

describe('get and delete', () => {
  it('reads and deletes a movement, restoring balances', async () => {
    const { api, f } = await newUser();
    const { body } = await api.post('/api/transactions', { type: 'EXPENSE', amount: 50_000, date: TODAY, accountId: f.bank, categoryId: f.cat.food });
    const id = body.transaction.id;
    expect((await api.get(`/api/transactions/${id}`)).body.transaction.amount).toBe(50_000);
    expect((await api.del(`/api/transactions/${id}`)).status).toBe(204);
    expect((await api.get(`/api/transactions/${id}`)).status).toBe(404);
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
  });
});
```

- [ ] **Step 3: Verificar que fallan**

Run: `npm test -w @finanzas/api -- transactions`
Expected: FAIL — rutas inexistentes.

- [ ] **Step 4: Implementar `mapper.ts`**

```ts
import { deriveMethod, type TransactionDTO } from '@finanzas/shared';
import type { Prisma } from '../../generated/prisma/client';
import { fromDbDate, num } from '../../lib/db';

const refSelect = { id: true, name: true, icon: true, color: true } as const;

export const transactionInclude = {
  account: { select: { ...refSelect, type: true } },
  toAccount: { select: { ...refSelect, type: true } },
  creditCard: { select: refSelect },
  debt: { select: refSelect },
  category: { select: { ...refSelect, kind: true, parentId: true } },
  tags: { select: { tag: { select: { name: true } } } },
  children: { select: { amount: true } },
} satisfies Prisma.TransactionInclude;

export type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>;

export function toTransactionDTO(row: TransactionRow): TransactionDTO {
  return {
    id: row.id,
    type: row.type,
    amount: num(row.amount),
    date: fromDbDate(row.date),
    description: row.description,
    payee: row.payee,
    notes: row.notes,
    account: row.account,
    toAccount: row.toAccount,
    creditCard: row.creditCard,
    debt: row.debt,
    category: row.category,
    goalId: row.goalId,
    installments: row.installments,
    paymentMethod: row.paymentMethod,
    method: deriveMethod(row.type, row.paymentMethod, row.account?.type ?? null),
    parentId: row.parentId,
    interest: row.type === 'DEBT_PAYMENT' ? row.children.reduce((s, c) => s + num(c.amount), 0) : 0,
    tags: row.tags.map((t) => t.tag.name).sort(),
    createdAt: row.createdAt.toISOString(),
  };
}
```

- [ ] **Step 5: Implementar `refs.ts`**

```ts
import type { TransactionInput } from '@finanzas/shared';
import type { Account, Category, CreditCard, Debt, Goal } from '../../generated/prisma/client';
import { badRequest } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';

export interface ResolvedRefs {
  account: Account | null;
  toAccount: Account | null;
  card: CreditCard | null;
  debt: Debt | null;
  category: Category | null;
  goal: Goal | null;
}

/** Referencias del movimiento original: si no cambian, se permiten aunque estén archivadas. */
export interface ExistingRefs {
  accountId: string | null;
  toAccountId: string | null;
  creditCardId: string | null;
  debtId: string | null;
  categoryId: string | null;
}

type RefKey = keyof ExistingRefs | 'goalId';

function refId(input: TransactionInput, key: RefKey): string | null {
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

export async function resolveRefs(
  db: DbClient,
  userId: string,
  input: TransactionInput,
  existing?: ExistingRefs,
): Promise<ResolvedRefs> {
  const ids = {
    accountId: refId(input, 'accountId'),
    toAccountId: refId(input, 'toAccountId'),
    creditCardId: refId(input, 'creditCardId'),
    debtId: refId(input, 'debtId'),
    categoryId: refId(input, 'categoryId'),
    goalId: refId(input, 'goalId'),
  };
  const key = (id: string) => ({ id_userId: { id, userId } });
  const [account, toAccount, card, debt, category, goal] = await Promise.all([
    ids.accountId ? db.account.findUnique({ where: key(ids.accountId) }) : null,
    ids.toAccountId ? db.account.findUnique({ where: key(ids.toAccountId) }) : null,
    ids.creditCardId ? db.creditCard.findUnique({ where: key(ids.creditCardId) }) : null,
    ids.debtId ? db.debt.findUnique({ where: key(ids.debtId) }) : null,
    ids.categoryId ? db.category.findUnique({ where: key(ids.categoryId) }) : null,
    ids.goalId ? db.goal.findUnique({ where: key(ids.goalId) }) : null,
  ]);

  const unchanged = (k: keyof ExistingRefs) => existing !== undefined && existing[k] === ids[k];
  const fields: Record<string, string> = {};

  const checkActive = (k: keyof ExistingRefs, entity: { isActive: boolean } | null, missing: string, archived: string) => {
    if (!ids[k]) return;
    if (!entity) fields[k] = missing;
    else if (!entity.isActive && !unchanged(k)) fields[k] = archived;
  };
  checkActive('accountId', account, 'Cuenta no encontrada', 'La cuenta está archivada');
  checkActive('toAccountId', toAccount, 'Cuenta no encontrada', 'La cuenta está archivada');
  checkActive('creditCardId', card, 'Tarjeta no encontrada', 'La tarjeta está archivada');
  checkActive('debtId', debt, 'Préstamo no encontrado', 'El préstamo está archivado');

  if (ids.categoryId) {
    const expected = input.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
    if (!category) fields.categoryId = 'Categoría no encontrada';
    else if (category.kind !== expected) fields.categoryId = 'La categoría no corresponde al tipo de movimiento';
    else if ((category.isSystem || !category.isActive) && !unchanged('categoryId')) fields.categoryId = 'Categoría no disponible';
  }

  if (ids.goalId) {
    if (!goal) fields.goalId = 'Meta no encontrada';
    else if (goal.accountId !== ids.accountId && goal.accountId !== ids.toAccountId) {
      fields.goalId = 'La transferencia debe entrar o salir de la cuenta de la meta';
    }
  }

  if (Object.keys(fields).length > 0) {
    throw badRequest('INVALID_REFERENCE', 'Revisa las cuentas, tarjetas o categorías seleccionadas.', fields);
  }
  return { account, toAccount, card, debt, category, goal };
}
```

- [ ] **Step 6: Implementar `service.ts` (crear, consultar, eliminar)**

```ts
import {
  formatCOP,
  SYSTEM_CATEGORY_KEYS,
  type IsoDate,
  type TransactionDTO,
  type TransactionInput,
  type TransactionResultDTO,
  type WarningCode,
} from '@finanzas/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { badRequest, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import { accountBalance } from '../accounts/service';
import { findSystemCategory } from '../categories/service';
import { cardDebt } from '../credit-cards/service';
import { loanBalance } from '../debts/service';
import { toTransactionDTO, transactionInclude } from './mapper';
import { resolveRefs, type ResolvedRefs } from './refs';

export function assertNotFuture(date: IsoDate, today: IsoDate) {
  if (date > today) {
    throw badRequest('FUTURE_DATE', 'La fecha no puede ser futura.', { date: 'La fecha no puede ser futura' });
  }
}

export function rowData(input: TransactionInput) {
  const common = {
    amount: BigInt(input.amount),
    date: toDbDate(input.date),
    description: input.description,
    payee: input.payee,
    notes: input.notes,
  };
  switch (input.type) {
    case 'INCOME':
      return { ...common, accountId: input.accountId, categoryId: input.categoryId };
    case 'EXPENSE':
      return { ...common, accountId: input.accountId, categoryId: input.categoryId, paymentMethod: input.paymentMethod ?? null };
    case 'TRANSFER':
      return { ...common, accountId: input.accountId, toAccountId: input.toAccountId, goalId: input.goalId ?? null };
    case 'CARD_PURCHASE':
      return { ...common, creditCardId: input.creditCardId, categoryId: input.categoryId, installments: input.installments };
    case 'CARD_PAYMENT':
      return { ...common, creditCardId: input.creditCardId, accountId: input.accountId };
    case 'DEBT_PAYMENT':
    case 'DEBT_DISBURSEMENT':
      return { ...common, debtId: input.debtId, accountId: input.accountId };
  }
}

export async function checkRules(db: DbClient, userId: string, input: TransactionInput, refs: ResolvedRefs, excludeIds: string[]) {
  if (input.type === 'CARD_PAYMENT' && refs.card) {
    const debt = await cardDebt(db, userId, refs.card, excludeIds);
    if (input.amount > debt) {
      throw badRequest('PAYMENT_EXCEEDS_DEBT', `El pago supera la deuda actual de la tarjeta (${formatCOP(Math.max(debt, 0))}).`, {
        amount: 'Supera la deuda de la tarjeta',
      });
    }
  }
  if (input.type === 'DEBT_PAYMENT' && refs.debt) {
    const balance = await loanBalance(db, userId, refs.debt, excludeIds);
    if (input.amount > balance) {
      throw badRequest('PAYMENT_EXCEEDS_DEBT', `El abono supera el saldo del préstamo (${formatCOP(Math.max(balance, 0))}).`, {
        amount: 'Supera el saldo del préstamo',
      });
    }
  }
}

export async function syncTags(tx: Prisma.TransactionClient, userId: string, transactionId: string, names: string[]) {
  await tx.transactionTag.deleteMany({ where: { userId, transactionId } });
  for (const name of new Set(names)) {
    const tag = await tx.tag.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name },
      update: {},
      select: { id: true },
    });
    await tx.transactionTag.create({ data: { userId, transactionId, tagId: tag.id } });
  }
}

/** Crea, actualiza o elimina el gasto hijo de intereses de un pago de préstamo. */
export async function syncInterest(
  tx: Prisma.TransactionClient,
  userId: string,
  parent: { id: string; date: Date; accountId: string; debtName: string },
  interest: number,
  interestCategoryId: string | null,
) {
  const existing = await tx.transaction.findFirst({ where: { userId, parentId: parent.id }, select: { id: true } });
  if (interest > 0 && interestCategoryId) {
    const data = {
      amount: BigInt(interest),
      date: parent.date,
      accountId: parent.accountId,
      categoryId: interestCategoryId,
      description: `Intereses ${parent.debtName}`,
    };
    if (existing) await tx.transaction.update({ where: { id_userId: { id: existing.id, userId } }, data });
    else await tx.transaction.create({ data: { ...data, userId, type: 'EXPENSE', parentId: parent.id } });
  } else if (existing) {
    await tx.transaction.delete({ where: { id_userId: { id: existing.id, userId } } });
  }
}

export async function interestCategoryFor(db: DbClient, userId: string, input: TransactionInput) {
  if (input.type !== 'DEBT_PAYMENT' || input.interest <= 0) return null;
  return (await findSystemCategory(db, userId, SYSTEM_CATEGORY_KEYS.INTEREST)).id;
}

const OUTGOING = new Set(['EXPENSE', 'TRANSFER', 'CARD_PAYMENT', 'DEBT_PAYMENT']);

export async function computeWarnings(db: DbClient, userId: string, input: TransactionInput, refs: ResolvedRefs) {
  const warnings: WarningCode[] = [];
  if (OUTGOING.has(input.type) && refs.account && (await accountBalance(db, userId, refs.account)) < 0) {
    warnings.push('NEGATIVE_BALANCE');
  }
  if (input.type === 'CARD_PURCHASE' && refs.card && (await cardDebt(db, userId, refs.card)) > num(refs.card.creditLimit)) {
    warnings.push('OVER_CREDIT_LIMIT');
  }
  const openings = [refs.account, refs.toAccount, refs.card].flatMap((r) => (r ? [fromDbDate(r.openingDate)] : []));
  if (openings.some((d) => input.date < d)) warnings.push('BEFORE_OPENING_DATE');
  return warnings;
}

export async function getTransaction(db: DbClient, userId: string, id: string): Promise<TransactionDTO> {
  const row = await db.transaction.findUnique({ where: { id_userId: { id, userId } }, include: transactionInclude });
  if (!row) throw notFound('Movimiento no encontrado.');
  return toTransactionDTO(row);
}

export async function createTransaction(db: PrismaClient, auth: AuthContext, input: TransactionInput): Promise<TransactionResultDTO> {
  assertNotFuture(input.date, auth.today);
  const refs = await resolveRefs(db, auth.userId, input);
  await checkRules(db, auth.userId, input, refs, []);
  const interestCategoryId = await interestCategoryFor(db, auth.userId, input);

  const id = await db.$transaction(async (tx) => {
    const row = await tx.transaction.create({
      data: { userId: auth.userId, type: input.type, ...rowData(input) },
      select: { id: true, date: true },
    });
    await syncTags(tx, auth.userId, row.id, input.tags);
    if (input.type === 'DEBT_PAYMENT') {
      await syncInterest(
        tx,
        auth.userId,
        { id: row.id, date: row.date, accountId: input.accountId, debtName: refs.debt!.name },
        input.interest,
        interestCategoryId,
      );
    }
    return row.id;
  });

  return {
    transaction: await getTransaction(db, auth.userId, id),
    warnings: await computeWarnings(db, auth.userId, input, refs),
  };
}

export async function deleteTransaction(db: PrismaClient, userId: string, id: string): Promise<void> {
  const row = await db.transaction.findUnique({ where: { id_userId: { id, userId } }, select: { parentId: true } });
  if (!row) throw notFound('Movimiento no encontrado.');
  if (row.parentId) {
    throw badRequest('EDIT_PARENT', 'Este movimiento es parte de un pago de préstamo. Edita o elimina el pago principal.');
  }
  await db.$transaction([
    db.scheduledItem.updateMany({ where: { userId, transactionId: id }, data: { transactionId: null, status: 'PENDING' } }),
    db.transaction.delete({ where: { id_userId: { id, userId } } }),
  ]);
}
```

- [ ] **Step 7: Implementar `routes.ts`**

```ts
import {
  cardPaymentBodySchema,
  cardPurchaseBodySchema,
  debtDisbursementSchema,
  debtPaymentSchema,
  transactionSchema,
  transferBodySchema,
  type TransactionInput,
} from '@finanzas/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import { findCreditCard } from '../credit-cards/service';
import { findDebt } from '../debts/service';
import { createTransaction, deleteTransaction, getTransaction } from './service';

export async function transactionRoutes(app: FastifyInstance) {
  const create = async (req: FastifyRequest, reply: FastifyReply, input: TransactionInput) =>
    reply.status(201).send(await createTransaction(app.prisma, req.auth, input));

  app.post('/transactions', async (req, reply) => create(req, reply, parse(transactionSchema, req.body)));

  app.get('/transactions/:id', async (req) => ({
    transaction: await getTransaction(app.prisma, req.auth.userId, parseId(req.params)),
  }));

  app.delete('/transactions/:id', async (req, reply) => {
    await deleteTransaction(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });

  app.post('/transfers', async (req, reply) => create(req, reply, { type: 'TRANSFER', ...parse(transferBodySchema, req.body) }));

  app.post('/credit-cards/:id/purchase', async (req, reply) => {
    const card = await findCreditCard(app.prisma, req.auth.userId, parseId(req.params));
    return create(req, reply, { type: 'CARD_PURCHASE', creditCardId: card.id, ...parse(cardPurchaseBodySchema, req.body) });
  });

  app.post('/credit-cards/:id/payment', async (req, reply) => {
    const card = await findCreditCard(app.prisma, req.auth.userId, parseId(req.params));
    return create(req, reply, { type: 'CARD_PAYMENT', creditCardId: card.id, ...parse(cardPaymentBodySchema, req.body) });
  });

  app.post('/debts/:id/payments', async (req, reply) => {
    const debt = await findDebt(app.prisma, req.auth.userId, parseId(req.params));
    const body = parse(debtPaymentSchema, req.body);
    return create(req, reply, {
      type: 'DEBT_PAYMENT',
      debtId: debt.id,
      accountId: body.accountId,
      amount: body.principal,
      interest: body.interest,
      date: body.date,
      description: body.description,
      payee: null,
      notes: null,
      tags: [],
    });
  });

  app.post('/debts/:id/disbursements', async (req, reply) => {
    const debt = await findDebt(app.prisma, req.auth.userId, parseId(req.params));
    const body = parse(debtDisbursementSchema, req.body);
    return create(req, reply, {
      type: 'DEBT_DISBURSEMENT',
      debtId: debt.id,
      accountId: body.accountId,
      amount: body.amount,
      date: body.date,
      description: body.description,
      payee: null,
      notes: null,
      tags: [],
    });
  });
}
```

- [ ] **Step 8: Registrar rutas**

En `apps/api/src/app.ts` importar `transactionRoutes` y agregarlo al scope protegido después de `debtRoutes`:
```ts
      await api.register(transactionRoutes);
```

- [ ] **Step 9: Verificar**

Run: `npm test -w @finanzas/api && npm run typecheck -w @finanzas/api && npm run lint`
Expected: PASS (incluye los 13 tests de `transactions.test.ts`).

---

### Task 13: Movimientos — editar, listar con filtros y paginación por cursor

**Files:**
- Create: `apps/api/src/modules/transactions/cursor.ts`, `apps/api/src/modules/transactions/list.ts`
- Modify: `apps/api/src/modules/transactions/service.ts`, `apps/api/src/modules/transactions/routes.ts`
- Test: `apps/api/src/modules/transactions/cursor.test.ts`, `apps/api/test/transactions-edit-list.test.ts`

**Interfaces:**
- Consumes: todo lo de Task 12; `transactionListQuerySchema`, `TransactionListQuery`, `DerivedMethod`, `Page` (Task 3).
- Produces:
  - `encodeCursor({ date, createdAt, id }): string`, `decodeCursor(value): { date, createdAt, id }` (inválido → 400 `INVALID_CURSOR`).
  - `methodWhere(method: DerivedMethod): Prisma.TransactionWhereInput`, `listTransactions(db, userId, query): Promise<Page<TransactionDTO>>`.
  - `updateTransaction(db, auth, id, input): Promise<TransactionResultDTO>` (tipo inmutable → 400 `TYPE_CHANGE_NOT_ALLOWED`; hijo de intereses → 400 `EDIT_PARENT`).
  - Rutas: `GET /api/transactions` (`{ items, nextCursor }`), `PUT /api/transactions/:id` (200 `{ transaction, warnings }`).

- [ ] **Step 1: Escribir tests que fallan**

`apps/api/src/modules/transactions/cursor.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  it('round-trips and rejects garbage', () => {
    const c = { date: '2026-10-06', createdAt: '2026-10-06T15:00:00.000Z', id: '11111111-1111-4111-8111-111111111111' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(() => decodeCursor('basura')).toThrow();
    expect(() => decodeCursor(Buffer.from('{"date":"x"}').toString('base64url'))).toThrow();
  });
});
```

`apps/api/test/transactions-edit-list.test.ts`:
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

describe('update', () => {
  it('edits amount, account and tags and recalculates balances', async () => {
    const { api, f } = await newUser();
    const { body } = await api.post('/api/transactions', { type: 'EXPENSE', amount: 50_000, date: TODAY, accountId: f.bank, categoryId: f.cat.food, tags: ['a'] });
    const id = body.transaction.id;
    const res = await api.put(`/api/transactions/${id}`, {
      type: 'EXPENSE',
      amount: 80_000,
      date: '2026-10-19',
      accountId: f.cash,
      categoryId: f.cat.fun,
      tags: ['b', 'c'],
    });
    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({ amount: 80_000, date: '2026-10-19', tags: ['b', 'c'] });
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);
    expect(await balanceOf(api, f.cash)).toBe(20_000);
  });

  it('never changes the type of a movement', async () => {
    const { api, f } = await newUser();
    const { body } = await api.post('/api/transactions', { type: 'EXPENSE', amount: 1000, date: TODAY, accountId: f.bank, categoryId: f.cat.food });
    const res = await api.put(`/api/transactions/${body.transaction.id}`, { type: 'INCOME', amount: 1000, date: TODAY, accountId: f.bank, categoryId: f.cat.salary });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TYPE_CHANGE_NOT_ALLOWED');
  });

  it('a card payment can be edited up to the debt excluding itself', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/credit-cards/${f.card}/purchase`, { amount: 500_000, date: TODAY, categoryId: f.cat.food });
    const pay = await api.post(`/api/credit-cards/${f.card}/payment`, { amount: 200_000, date: TODAY, accountId: f.bank });
    const id = pay.body.transaction.id;
    const ok = await api.put(`/api/transactions/${id}`, { type: 'CARD_PAYMENT', amount: 500_000, date: TODAY, accountId: f.bank, creditCardId: f.card });
    expect(ok.status).toBe(200);
    const over = await api.put(`/api/transactions/${id}`, { type: 'CARD_PAYMENT', amount: 500_001, date: TODAY, accountId: f.bank, creditCardId: f.card });
    expect(over.status).toBe(400);
  });

  it('editing a paid purchase can leave a credit balance but never a negative payment due (review focus #4)', async () => {
    const { api, f } = await newUser();
    const purchase = await api.post(`/api/credit-cards/${f.card}/purchase`, { amount: 300_000, date: '2026-10-10', categoryId: f.cat.food });
    await api.post(`/api/credit-cards/${f.card}/payment`, { amount: 300_000, date: TODAY, accountId: f.bank });
    await api.put(`/api/transactions/${purchase.body.transaction.id}`, {
      type: 'CARD_PURCHASE',
      amount: 100_000,
      date: '2026-10-10',
      creditCardId: f.card,
      categoryId: f.cat.food,
      installments: 1,
    });
    const card = await cardOf(api, f.card);
    expect(card.debt).toBe(-200_000);
    expect(card.amountDue).toBe(0);
  });

  it('keeps an archived account when it is unchanged but rejects switching to one (review focus #5)', async () => {
    const { api, f } = await newUser();
    const old = await api.post('/api/transactions', { type: 'EXPENSE', amount: 100_000, date: TODAY, accountId: f.cash, categoryId: f.cat.food });
    await api.put(`/api/accounts/${f.cash}`, { isActive: false });
    const sameAccount = await api.put(`/api/transactions/${old.body.transaction.id}`, {
      type: 'EXPENSE',
      amount: 100_000,
      date: TODAY,
      accountId: f.cash,
      categoryId: f.cat.food,
      description: 'Mercado',
    });
    expect(sameAccount.status).toBe(200);

    const other = await api.post('/api/transactions', { type: 'EXPENSE', amount: 1000, date: TODAY, accountId: f.bank, categoryId: f.cat.food });
    const switched = await api.put(`/api/transactions/${other.body.transaction.id}`, {
      type: 'EXPENSE',
      amount: 1000,
      date: TODAY,
      accountId: f.cash,
      categoryId: f.cat.food,
    });
    expect(switched.status).toBe(400);
  });

  it('updates the interest child of a loan payment and blocks editing the child directly', async () => {
    const { api, f } = await newUser();
    const pay = await api.post(`/api/debts/${f.debt}/payments`, { accountId: f.bank, principal: 380_000, interest: 70_000, date: TODAY });
    const id = pay.body.transaction.id;
    const res = await api.put(`/api/transactions/${id}`, { type: 'DEBT_PAYMENT', amount: 400_000, interest: 50_000, date: TODAY, accountId: f.bank, debtId: f.debt });
    expect(res.body.transaction).toMatchObject({ amount: 400_000, interest: 50_000 });
    expect(await balanceOf(api, f.bank)).toBe(1_550_000);

    const child = await app.prisma.transaction.findFirstOrThrow({ where: { parentId: id } });
    const direct = await api.put(`/api/transactions/${child.id}`, { type: 'EXPENSE', amount: 1, date: TODAY, accountId: f.bank, categoryId: f.cat.food });
    expect(direct.status).toBe(400);

    await api.put(`/api/transactions/${id}`, { type: 'DEBT_PAYMENT', amount: 400_000, interest: 0, date: TODAY, accountId: f.bank, debtId: f.debt });
    expect(await app.prisma.transaction.count({ where: { parentId: id } })).toBe(0);
  });
});

describe('list', () => {
  async function seeded() {
    const ctx = await newUser();
    const { api, f } = ctx;
    await api.post('/api/transactions', { type: 'INCOME', amount: 4_000_000, date: '2026-10-05', accountId: f.bank, categoryId: f.cat.salary, description: 'Salario' });
    await api.post('/api/transactions', { type: 'EXPENSE', amount: 25_000, date: '2026-10-06', accountId: f.wallet, categoryId: f.cat.food, description: 'Almuerzo', tags: ['trabajo'] });
    await api.post('/api/transfers', { amount: 200_000, date: '2026-10-04', accountId: f.bank, toAccountId: f.wallet });
    await api.post(`/api/credit-cards/${f.card}/purchase`, { amount: 150_000, date: '2026-10-03', categoryId: f.cat.fun, description: 'Amazon' });
    await api.post(`/api/credit-cards/${f.card}/payment`, { amount: 100_000, date: '2026-10-07', accountId: f.bank });
    await api.post('/api/transactions', { type: 'EXPENSE', amount: 60_000, date: '2026-10-06', accountId: f.cash, categoryId: f.cat.food, description: 'Mercado', paymentMethod: 'DEBIT_CARD' });
    return ctx;
  }

  it('orders by date (newest first) and paginates with a cursor', async () => {
    const { api } = await seeded();
    const first = await api.get('/api/transactions?limit=4');
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(4);
    expect(first.body.items[0].date).toBe('2026-10-07');
    expect(first.body.nextCursor).toBeTypeOf('string');
    const second = await api.get(`/api/transactions?limit=4&cursor=${first.body.nextCursor}`);
    expect(second.body.items).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();
    const ids = [...first.body.items, ...second.body.items].map((t: { id: string }) => t.id);
    expect(new Set(ids).size).toBe(6);
    expect((await api.get('/api/transactions?cursor=basura')).status).toBe(400);
  });

  it('filters by type, account (both sides), card, category, tag, amount, text, dates and method', async () => {
    const { api, f } = await seeded();
    const count = async (qs: string) => (await api.get(`/api/transactions?${qs}`)).body.items.length;
    expect(await count('type=EXPENSE,CARD_PURCHASE')).toBe(3);
    expect(await count(`accountId=${f.wallet}`)).toBe(2);
    expect(await count(`creditCardId=${f.card}`)).toBe(2);
    expect(await count(`categoryId=${f.cat.food}`)).toBe(2);
    expect(await count('tag=trabajo')).toBe(1);
    expect(await count('minAmount=100000&maxAmount=200000')).toBe(3);
    expect(await count('q=almu')).toBe(1);
    expect(await count('from=2026-10-05&to=2026-10-06')).toBe(3);
    expect(await count('method=CREDIT_CARD')).toBe(1);
    expect(await count('method=DIGITAL_WALLET')).toBe(1);
    expect(await count('method=DEBIT_CARD')).toBe(1);
  });

  it('includes subcategories when filtering by a parent category', async () => {
    const { api, f } = await newUser();
    const child = (await api.post('/api/categories', { name: 'Restaurantes', kind: 'EXPENSE', parentId: f.cat.food })).body.category.id;
    await api.post('/api/transactions', { type: 'EXPENSE', amount: 1000, date: TODAY, accountId: f.bank, categoryId: child });
    await api.post('/api/transactions', { type: 'EXPENSE', amount: 2000, date: TODAY, accountId: f.bank, categoryId: f.cat.food });
    expect((await api.get(`/api/transactions?categoryId=${f.cat.food}`)).body.items).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- cursor transactions-edit-list`
Expected: FAIL — `./cursor` no existe; `GET /api/transactions` y `PUT` responden 404.

- [ ] **Step 3: Implementar `cursor.ts`**

```ts
import { isValidIsoDate, type IsoDate } from '@finanzas/shared';
import { badRequest } from '../../lib/errors';

export interface Cursor {
  date: IsoDate;
  createdAt: string;
  id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.date, cursor.createdAt, cursor.id])).toString('base64url');
}

export function decodeCursor(value: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 3) {
      const [date, createdAt, id] = parsed as [unknown, unknown, unknown];
      if (
        typeof date === 'string' &&
        isValidIsoDate(date) &&
        typeof createdAt === 'string' &&
        !Number.isNaN(Date.parse(createdAt)) &&
        typeof id === 'string' &&
        UUID_RE.test(id)
      ) {
        return { date, createdAt, id };
      }
    }
  } catch {
    // cae al error de abajo
  }
  throw badRequest('INVALID_CURSOR', 'La paginación no es válida. Vuelve a cargar la lista.');
}
```

- [ ] **Step 4: Implementar `list.ts`**

```ts
import type { DerivedMethod, Page, TransactionDTO, TransactionListQuery } from '@finanzas/shared';
import type { Prisma } from '../../generated/prisma/client';
import { fromDbDate, toDbDate } from '../../lib/db';
import type { DbClient } from '../../lib/prisma';
import { decodeCursor, encodeCursor } from './cursor';
import { toTransactionDTO, transactionInclude } from './mapper';

/** Mismo criterio que `deriveMethod`: sobrescritura explícita o tipo de la cuenta. */
export function methodWhere(method: DerivedMethod): Prisma.TransactionWhereInput {
  const byAccount = (types: Array<'CASH' | 'BANK' | 'DIGITAL_WALLET' | 'SAVINGS' | 'INVESTMENT' | 'OTHER'>) => ({
    paymentMethod: null,
    account: { is: { type: { in: types } } },
  });
  switch (method) {
    case 'CREDIT_CARD':
      return { type: 'CARD_PURCHASE' };
    case 'BANK':
      return { type: 'EXPENSE', ...byAccount(['BANK']) };
    case 'DEBIT_CARD':
    case 'BANK_TRANSFER':
      return { type: 'EXPENSE', paymentMethod: method };
    case 'CASH':
      return { type: 'EXPENSE', OR: [{ paymentMethod: 'CASH' }, byAccount(['CASH'])] };
    case 'DIGITAL_WALLET':
      return { type: 'EXPENSE', OR: [{ paymentMethod: 'DIGITAL_WALLET' }, byAccount(['DIGITAL_WALLET'])] };
    case 'OTHER':
      return { type: 'EXPENSE', OR: [{ paymentMethod: 'OTHER' }, byAccount(['SAVINGS', 'INVESTMENT', 'OTHER'])] };
  }
}

export async function listTransactions(db: DbClient, userId: string, q: TransactionListQuery): Promise<Page<TransactionDTO>> {
  const where: Prisma.TransactionWhereInput = { userId };
  const and: Prisma.TransactionWhereInput[] = [];

  if (q.from || q.to) {
    where.date = { ...(q.from && { gte: toDbDate(q.from) }), ...(q.to && { lte: toDbDate(q.to) }) };
  }
  if (q.type?.length) where.type = { in: q.type };
  if (q.categoryId) {
    const children = await db.category.findMany({ where: { userId, parentId: q.categoryId }, select: { id: true } });
    where.categoryId = { in: [q.categoryId, ...children.map((c) => c.id)] };
  }
  if (q.accountId) and.push({ OR: [{ accountId: q.accountId }, { toAccountId: q.accountId }] });
  if (q.creditCardId) where.creditCardId = q.creditCardId;
  if (q.debtId) where.debtId = q.debtId;
  if (q.tag) where.tags = { some: { tag: { name: q.tag } } };
  if (q.method) and.push(methodWhere(q.method));
  if (q.minAmount !== undefined || q.maxAmount !== undefined) {
    where.amount = {
      ...(q.minAmount !== undefined && { gte: BigInt(q.minAmount) }),
      ...(q.maxAmount !== undefined && { lte: BigInt(q.maxAmount) }),
    };
  }
  if (q.q) {
    and.push({
      OR: [
        { description: { contains: q.q, mode: 'insensitive' } },
        { payee: { contains: q.q, mode: 'insensitive' } },
        { notes: { contains: q.q, mode: 'insensitive' } },
      ],
    });
  }
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    const date = toDbDate(c.date);
    const createdAt = new Date(c.createdAt);
    and.push({
      OR: [
        { date: { lt: date } },
        { date, createdAt: { lt: createdAt } },
        { date, createdAt, id: { lt: c.id } },
      ],
    });
  }
  if (and.length) where.AND = and;

  const rows = await db.transaction.findMany({
    where,
    include: transactionInclude,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
  });
  const items = rows.slice(0, q.limit);
  const last = items.at(-1);
  return {
    items: items.map(toTransactionDTO),
    nextCursor:
      rows.length > q.limit && last
        ? encodeCursor({ date: fromDbDate(last.date), createdAt: last.createdAt.toISOString(), id: last.id })
        : null,
  };
}
```

- [ ] **Step 5: Agregar `updateTransaction` a `service.ts`**

Agregar al final de `apps/api/src/modules/transactions/service.ts`:
```ts
export async function updateTransaction(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
  input: TransactionInput,
): Promise<TransactionResultDTO> {
  const existing = await db.transaction.findUnique({ where: { id_userId: { id, userId: auth.userId } } });
  if (!existing) throw notFound('Movimiento no encontrado.');
  if (existing.parentId) {
    throw badRequest('EDIT_PARENT', 'Este movimiento es parte de un pago de préstamo. Edita el pago principal.');
  }
  if (existing.type !== input.type) {
    throw badRequest('TYPE_CHANGE_NOT_ALLOWED', 'No se puede cambiar el tipo de un movimiento. Elimínalo y crea uno nuevo.');
  }
  assertNotFuture(input.date, auth.today);
  const refs = await resolveRefs(db, auth.userId, input, existing);
  const children = await db.transaction.findMany({ where: { userId: auth.userId, parentId: id }, select: { id: true } });
  await checkRules(db, auth.userId, input, refs, [id, ...children.map((c) => c.id)]);
  const interestCategoryId = await interestCategoryFor(db, auth.userId, input);

  await db.$transaction(async (tx) => {
    const row = await tx.transaction.update({
      where: { id_userId: { id, userId: auth.userId } },
      data: rowData(input),
      select: { id: true, date: true },
    });
    await syncTags(tx, auth.userId, id, input.tags);
    if (input.type === 'DEBT_PAYMENT') {
      await syncInterest(
        tx,
        auth.userId,
        { id: row.id, date: row.date, accountId: input.accountId, debtName: refs.debt!.name },
        input.interest,
        interestCategoryId,
      );
    }
  });

  return {
    transaction: await getTransaction(db, auth.userId, id),
    warnings: await computeWarnings(db, auth.userId, input, refs),
  };
}
```

- [ ] **Step 6: Agregar rutas**

En `apps/api/src/modules/transactions/routes.ts` importar `transactionListQuerySchema`, `listTransactions` (desde `./list`) y `updateTransaction`, y agregar dentro de `transactionRoutes`:
```ts
  app.get('/transactions', async (req) =>
    listTransactions(app.prisma, req.auth.userId, parse(transactionListQuerySchema, req.query)),
  );

  app.put('/transactions/:id', async (req) =>
    updateTransaction(app.prisma, req.auth, parseId(req.params), parse(transactionSchema, req.body)),
  );
```

- [ ] **Step 7: Verificar**

Run: `npm test -w @finanzas/api && npm run typecheck -w @finanzas/api && npm run lint`
Expected: PASS (incluye `cursor.test.ts` y los 9 tests de `transactions-edit-list.test.ts`).

---

### Task 14: Dashboard del núcleo, pruebas de correctitud financiera y de aislamiento

**Files:**
- Create: `apps/api/src/modules/dashboard/service.ts`, `apps/api/src/modules/dashboard/routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/financial-correctness.test.ts`, `apps/api/test/isolation.test.ts`

**Interfaces:**
- Consumes: `listAccounts` (Task 10), `listCreditCards` (Task 11), `listDebts` (Task 11), `ledgerEntries` (Task 10), `summarizeMoney`, `monthFlows`, `summarizeDebts`, `savingsReserve`, `estimateAvailable` (Task 8).
- Produces: `getDashboard(db, auth): Promise<DashboardDTO>`; ruta `GET /api/dashboard`.

- [ ] **Step 1: Escribir tests que fallan**

`apps/api/test/financial-correctness.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DashboardDTO } from '@finanzas/shared';
import { balanceOf, setupFinances } from './finance-fixtures';
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

const dashboard = async (api: Client) => (await api.get('/api/dashboard')).body as DashboardDTO;

describe('spec section 38 — financial correctness', () => {
  it('1. a transfer is not an expense and does not change the total', async () => {
    const { api, f } = await newUser();
    const before = await dashboard(api);
    await api.post('/api/transfers', { amount: 200_000, date: TODAY, accountId: f.bank, toAccountId: f.wallet });
    const after = await dashboard(api);
    expect(after.thisMonth.expense).toBe(0);
    expect(after.thisMonth.income).toBe(0);
    expect(after.money.total).toBe(before.money.total);
  });

  it('2. a card purchase is an expense plus debt, and 3–4. paying it lowers debt and bank but adds no expense', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/credit-cards/${f.card}/purchase`, { amount: 300_000, date: TODAY, categoryId: f.cat.food });
    let d = await dashboard(api);
    expect(d.thisMonth.expense).toBe(300_000);
    expect(d.debts.cards).toBe(300_000);
    expect(d.money.total).toBe(2_100_000);
    expect(await balanceOf(api, f.bank)).toBe(2_000_000);

    await api.post(`/api/credit-cards/${f.card}/payment`, { amount: 300_000, date: TODAY, accountId: f.bank });
    d = await dashboard(api);
    expect(await balanceOf(api, f.bank)).toBe(1_700_000);
    expect(d.debts.cards).toBe(0);
    expect(d.thisMonth.expense).toBe(300_000);
  });

  it('5. a transfer to a savings account is not an expense; it is savings', async () => {
    const { api, f } = await newUser();
    await api.post('/api/transfers', { amount: 500_000, date: TODAY, accountId: f.bank, toAccountId: f.savings });
    const d = await dashboard(api);
    expect(d.thisMonth.expense).toBe(0);
    expect(d.thisMonth.savings).toBe(500_000);
    expect(d.money.total).toBe(2_100_000);
    expect(d.money.liquid).toBe(1_600_000);
    expect(d.money.savings).toBe(500_000);
  });

  it('6. the total money adds every account (spec section 10 example)', async () => {
    const { api } = await registerUser(app);
    for (const [name, type, initialBalance] of [
      ['Efectivo', 'CASH', 100_000],
      ['Bancolombia', 'BANK', 1_500_000],
      ['Nequi', 'DIGITAL_WALLET', 300_000],
      ['Nu', 'BANK', 600_000],
    ] as const) {
      await api.post('/api/accounts', { name, type, initialBalance });
    }
    const d = await dashboard(api);
    expect(d.money.total).toBe(2_500_000);
    expect(d.money.accounts.map((a) => a.balance)).toEqual([100_000, 1_500_000, 300_000, 600_000]);
  });

  it('7. credit cards never count as money and 8. debts are shown apart', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/credit-cards/${f.card}/purchase`, { amount: 800_000, date: TODAY, categoryId: f.cat.food });
    const d = await dashboard(api);
    expect(d.money.total).toBe(2_100_000);
    expect(d.cards[0]!.available).toBe(4_200_000);
    expect(d.debts).toEqual({ cards: 800_000, loans: 8_000_000, total: 8_800_000 });
    expect(d.netWorth).toBe(2_100_000 - 8_800_000);
    const cardsLine = d.available.breakdown.find((b) => b.key === 'cards')!;
    expect(cardsLine.amount).toBe(-800_000);
  });

  it('the month balance matches the spec (4.000.000 − 2.100.000 − 800.000 = 1.100.000)', async () => {
    const { api, f } = await newUser();
    await api.post('/api/transactions', { type: 'INCOME', amount: 4_000_000, date: TODAY, accountId: f.bank, categoryId: f.cat.salary });
    await api.post('/api/transactions', { type: 'EXPENSE', amount: 1_300_000, date: TODAY, accountId: f.bank, categoryId: f.cat.food });
    await api.post(`/api/credit-cards/${f.card}/purchase`, { amount: 800_000, date: TODAY, categoryId: f.cat.fun });
    await api.post('/api/transfers', { amount: 800_000, date: TODAY, accountId: f.bank, toAccountId: f.savings });
    const d = await dashboard(api);
    expect(d.thisMonth).toMatchObject({ income: 4_000_000, expense: 2_100_000, savings: 800_000, remaining: 1_100_000, savingsRate: 0.2 });
  });

  it('a loan disbursement is debt, not income; principal payments are not expenses', async () => {
    const { api, f } = await newUser();
    await api.post(`/api/debts/${f.debt}/disbursements`, { accountId: f.bank, amount: 1_000_000, date: TODAY });
    await api.post(`/api/debts/${f.debt}/payments`, { accountId: f.bank, principal: 380_000, interest: 70_000, date: TODAY });
    const d = await dashboard(api);
    expect(d.thisMonth.income).toBe(0);
    expect(d.thisMonth.expense).toBe(70_000);
    expect(d.debts.loans).toBe(8_620_000);
  });

  it('the estimated available money subtracts committed card debt, loan installment and the savings reserve', async () => {
    const { api, f } = await newUser();
    await api.post('/api/transactions', { type: 'INCOME', amount: 1_000_000, date: TODAY, accountId: f.bank, categoryId: f.cat.salary });
    await api.post(`/api/credit-cards/${f.card}/purchase`, { amount: 120_000, date: TODAY, categoryId: f.cat.food, installments: 12 });
    const d = await dashboard(api);
    // líquido: 3.000.000 + 100.000 (efectivo) = 3.100.000; tarjeta comprometida: 1 cuota de 10.000;
    // préstamo: cuota 450.000; reserva: 20 % + 10 % de 1.000.000 = 300.000
    expect(d.available.breakdown.map((b) => [b.key, b.amount])).toEqual([
      ['liquid', 3_100_000],
      ['obligations', 0],
      ['cards', -10_000],
      ['loans', -450_000],
      ['reserve', -300_000],
    ]);
    expect(d.available.total).toBe(2_340_000);
  });
});
```

`apps/api/test/isolation.test.ts`:
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

describe("spec section 38.9 — a user can never reach another user's data", () => {
  it('blocks reads, writes, references and listings across users', async () => {
    const a = await registerUser(app);
    const fa = await setupFinances(a.api);
    const tx = (
      await a.api.post('/api/transactions', { type: 'EXPENSE', amount: 50_000, date: TODAY, accountId: fa.bank, categoryId: fa.cat.food, tags: ['privado'] })
    ).body.transaction.id as string;
    const tagId = (await a.api.get('/api/tags')).body.items[0].id as string;

    const b = await registerUser(app);
    const fb = await setupFinances(b.api);

    // Lectura, edición y borrado directos → 404
    for (const url of [
      `/api/accounts/${fa.bank}`,
      `/api/credit-cards/${fa.card}`,
      `/api/credit-cards/${fa.card}/statement`,
      `/api/debts/${fa.debt}`,
      `/api/transactions/${tx}`,
    ]) {
      expect((await b.api.get(url)).status, url).toBe(404);
    }
    expect((await b.api.put(`/api/accounts/${fa.bank}`, { name: 'Hack' })).status).toBe(404);
    expect((await b.api.put(`/api/credit-cards/${fa.card}`, { name: 'Hack' })).status).toBe(404);
    expect((await b.api.put(`/api/debts/${fa.debt}`, { name: 'Hack' })).status).toBe(404);
    expect((await b.api.put(`/api/categories/${fa.cat.food}`, { name: 'Hack' })).status).toBe(404);
    expect(
      (await b.api.put(`/api/transactions/${tx}`, { type: 'EXPENSE', amount: 1, date: TODAY, accountId: fb.bank, categoryId: fb.cat.food })).status,
    ).toBe(404);
    for (const url of [`/api/accounts/${fa.bank}`, `/api/credit-cards/${fa.card}`, `/api/debts/${fa.debt}`, `/api/transactions/${tx}`, `/api/categories/${fa.cat.food}`, `/api/tags/${tagId}`]) {
      expect((await b.api.del(url)).status, url).toBe(404);
    }

    // Referencias ajenas en el cuerpo → 400; en la ruta → 404
    const withAccount = await b.api.post('/api/transactions', { type: 'EXPENSE', amount: 1000, date: TODAY, accountId: fa.bank, categoryId: fb.cat.food });
    expect(withAccount.status).toBe(400);
    expect(withAccount.body.error.code).toBe('INVALID_REFERENCE');
    expect((await b.api.post('/api/transactions', { type: 'EXPENSE', amount: 1000, date: TODAY, accountId: fb.bank, categoryId: fa.cat.food })).status).toBe(400);
    expect((await b.api.post('/api/transfers', { amount: 1000, date: TODAY, accountId: fb.bank, toAccountId: fa.bank })).status).toBe(400);
    expect((await b.api.post('/api/transactions', { type: 'CARD_PAYMENT', amount: 1000, date: TODAY, accountId: fb.bank, creditCardId: fa.card })).status).toBe(400);
    expect((await b.api.post(`/api/credit-cards/${fa.card}/payment`, { amount: 1000, date: TODAY, accountId: fb.bank })).status).toBe(404);
    expect((await b.api.post(`/api/debts/${fa.debt}/payments`, { accountId: fb.bank, principal: 1000, date: TODAY })).status).toBe(404);

    // Listados y filtros nunca incluyen datos de A
    const idsOf = async (url: string) => ((await b.api.get(url)).body.items as Array<{ id: string }>).map((i) => i.id);
    expect(await idsOf('/api/accounts')).not.toContain(fa.bank);
    expect(await idsOf('/api/credit-cards')).not.toContain(fa.card);
    expect(await idsOf('/api/debts')).not.toContain(fa.debt);
    expect(await idsOf('/api/categories')).not.toContain(fa.cat.food);
    expect(await idsOf('/api/tags')).not.toContain(tagId);
    expect(await idsOf('/api/transactions')).not.toContain(tx);
    expect(await idsOf(`/api/transactions?accountId=${fa.bank}`)).toEqual([]);

    // El dashboard de B solo tiene lo suyo
    const d = (await b.api.get('/api/dashboard')).body;
    expect(d.money.total).toBe(2_100_000);
    expect(d.thisMonth.expense).toBe(0);

    // Los datos de A siguen intactos
    expect((await a.api.get(`/api/accounts/${fa.bank}`)).body.account.balance).toBe(1_950_000);
    expect((await a.api.get(`/api/transactions/${tx}`)).status).toBe(200);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/api -- financial-correctness isolation`
Expected: FAIL — `GET /api/dashboard` responde 404.

- [ ] **Step 3: Implementar el servicio y la ruta del dashboard**

`apps/api/src/modules/dashboard/service.ts`:
```ts
import { endOfMonth, monthKey, startOfMonth, type DashboardDTO } from '@finanzas/shared';
import { estimateAvailable } from '../../domain/available';
import { monthFlows, summarizeDebts, summarizeMoney } from '../../domain/balances';
import { savingsReserve } from '../../domain/savings';
import type { PrismaClient } from '../../generated/prisma/client';
import { num, toDbDate } from '../../lib/db';
import type { AuthContext } from '../../types/fastify';
import { listAccounts } from '../accounts/service';
import { listCreditCards } from '../credit-cards/service';
import { listDebts } from '../debts/service';
import { ledgerEntries } from '../ledger/repository';

export async function getDashboard(db: PrismaClient, auth: AuthContext): Promise<DashboardDTO> {
  const { userId, today } = auth;
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const [user, config, accounts, monthEntries, cards, loans, obligations] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
    db.financialConfiguration.findUniqueOrThrow({ where: { userId } }),
    listAccounts(db, userId),
    ledgerEntries(db, userId, { from: monthStart, to: monthEnd }),
    listCreditCards(db, userId, today),
    listDebts(db, userId, today),
    db.scheduledItem.aggregate({
      where: { userId, kind: 'EXPENSE', status: 'PENDING', dueDate: { lte: toDbDate(monthEnd) } },
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
  const available = estimateAvailable({
    liquid: money.liquid,
    pendingObligations: num(obligations._sum.amount),
    cardsCommitted: cards.reduce((s, c) => s + c.committed, 0),
    loansDue: loans.reduce((s, l) => s + l.installmentDue, 0),
    reserve,
  });
  const cardDebt = cards.reduce((s, c) => s + c.debt, 0);
  const loanDebt = loans.reduce((s, l) => s + l.balance, 0);

  return {
    greetingName: user.name.trim().split(/\s+/)[0] ?? user.name,
    today,
    month: monthKey(today),
    money: { ...money, accounts: accounts.filter((a) => a.isActive) },
    available,
    debts: summarizeDebts(cards.map((c) => c.debt), loans.map((l) => l.balance)),
    netWorth: money.total - cardDebt - loanDebt,
    thisMonth: {
      ...flows,
      savingsRate: flows.income > 0 ? flows.savings / flows.income : null,
      savingsTargetPct: config.savingsPct,
    },
    cards: cards.filter((c) => c.isActive),
    loans: loans.filter((l) => l.isActive),
  };
}
```

`apps/api/src/modules/dashboard/routes.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { getDashboard } from './service';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', async (req) => getDashboard(app.prisma, req.auth));
}
```

En `apps/api/src/app.ts` importar `dashboardRoutes` y agregarlo al final del scope protegido:
```ts
      await api.register(dashboardRoutes);
```

- [ ] **Step 4: Verificar**

Run: `npm test -w @finanzas/api && npm run typecheck -w @finanzas/api && npm run lint`
Expected: PASS de `financial-correctness.test.ts` (8 tests) e `isolation.test.ts`, y de todos los anteriores.

---

### Task 15: Seed de demostración y verificación final del backend

**Files:**
- Create: `apps/api/prisma/seed-demo.ts`, `apps/api/prisma/seed.ts`
- Test: `apps/api/test/seed.test.ts`

**Interfaces:**
- Consumes: `registerUser` (Task 6), `createAccount` (Task 10), `listCategories` (Task 10), `createCreditCard`, `getCreditCard` (Task 11), `createDebt` (Task 11), `createTransaction` (Task 12).
- Produces: `DEMO_EMAIL = 'demo@example.com'`, `DEMO_PASSWORD = 'Demo12345!'`, `seedDemo(prisma, now?: Date): Promise<{ userId: string }>`; script `npm run db:seed -w @finanzas/api` (se niega a correr con `NODE_ENV=production`).

- [ ] **Step 1: Escribir el test que falla**

`apps/api/test/seed.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from '../prisma/seed-demo';
import { client, createTestApp } from './helpers';

let app: FastifyInstance;
const NOW = new Date('2026-10-20T15:00:00Z');

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => NOW }));
});

afterAll(async () => {
  await app.close();
});

describe('demo seed', () => {
  it('creates a realistic, consistent demo user and can run twice', async () => {
    await seedDemo(app.prisma, NOW);
    const { userId } = await seedDemo(app.prisma, NOW);
    expect(await app.prisma.user.count({ where: { email: DEMO_EMAIL } })).toBe(1);

    const login = await client(app).post('/api/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    expect(login.status).toBe(200);
    const api = client(app, login.cookies.find((c) => c.name === 'fz_session')!.value);

    const d = (await api.get('/api/dashboard')).body;
    expect(d.money.accounts.map((a: { name: string }) => a.name)).toEqual(['Bancolombia', 'Nequi', 'Efectivo', 'Nu', 'Bolsillo ahorro']);
    expect(d.money.accounts.every((a: { balance: number }) => a.balance >= 0)).toBe(true);
    expect(d.cards[0].debt).toBeGreaterThan(0);
    expect(d.loans[0].balance).toBeLessThan(8_000_000);
    expect(d.thisMonth.income).toBeGreaterThan(0);

    const types = await app.prisma.transaction.groupBy({ by: ['type'], where: { userId }, _count: true });
    expect(types.map((t) => t.type).sort()).toEqual(
      ['CARD_PAYMENT', 'CARD_PURCHASE', 'DEBT_PAYMENT', 'EXPENSE', 'INCOME', 'TRANSFER'].sort(),
    );
    expect(await app.prisma.transaction.count({ where: { userId, type: 'CARD_PURCHASE', installments: { gt: 1 } } })).toBe(1);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -w @finanzas/api -- seed`
Expected: FAIL — no existe `../prisma/seed-demo`.

- [ ] **Step 3: Implementar `seed-demo.ts`**

```ts
import {
  addMonths,
  endOfMonth,
  makeDate,
  startOfMonth,
  todayIn,
  yearMonth,
  type IsoDate,
  type TransactionInput,
} from '@finanzas/shared';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createAccount } from '../src/modules/accounts/service';
import { registerUser } from '../src/modules/auth/service';
import { listCategories } from '../src/modules/categories/service';
import { createCreditCard, getCreditCard } from '../src/modules/credit-cards/service';
import { createDebt } from '../src/modules/debts/service';
import { createTransaction } from '../src/modules/transactions/service';

export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'Demo12345!';

type Event = { date: IsoDate; order: number; run: () => Promise<unknown> };

/** Tres meses de historia hasta "hoy" (Bogotá), con montos pseudoaleatorios deterministas. */
export async function seedDemo(prisma: PrismaClient, now: Date = new Date()) {
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
  const user = await registerUser(
    prisma,
    { name: 'Cristian Demo', email: DEMO_EMAIL, password: DEMO_PASSWORD },
    { allowRegistration: true },
  );
  const today = todayIn(user.timezone, now);
  const start = startOfMonth(addMonths(today, -2));
  const auth = { userId: user.id, sessionId: 'seed', timezone: user.timezone, today };

  const account = (name: string, type: 'BANK' | 'DIGITAL_WALLET' | 'CASH' | 'SAVINGS', initialBalance: number, icon: string, color: string) =>
    createAccount(prisma, auth, { name, type, institution: null, initialBalance, openingDate: start, icon, color });
  const bank = await account('Bancolombia', 'BANK', 1_200_000, 'landmark', '#ca8a04');
  const nequi = await account('Nequi', 'DIGITAL_WALLET', 150_000, 'smartphone', '#7c3aed');
  const cash = await account('Efectivo', 'CASH', 80_000, 'banknote', '#16a34a');
  const nu = await account('Nu', 'BANK', 400_000, 'wallet', '#8b5cf6');
  const savings = await account('Bolsillo ahorro', 'SAVINGS', 1_500_000, 'piggy-bank', '#0ea5e9');

  const card = await createCreditCard(prisma, auth, {
    name: 'Nu Crédito',
    issuer: 'Nu',
    creditLimit: 5_000_000,
    initialDebt: 0,
    initialDebtInstallments: 1,
    openingDate: start,
    statementDay: 15,
    paymentDueDay: 30,
    icon: 'credit-card',
    color: '#820ad1',
  });
  const debt = await createDebt(prisma, auth, {
    name: 'Crédito libre inversión',
    lender: 'Bancolombia',
    initialBalance: 8_000_000,
    openingDate: start,
    monthlyPayment: 450_000,
    paymentDay: 5,
    receivedInAccountId: null,
    icon: 'landmark',
    color: '#0f766e',
  });

  const categories = await listCategories(prisma, user.id);
  const cat = (name: string, kind: 'INCOME' | 'EXPENSE' = 'EXPENSE') =>
    categories.find((c) => c.name === name && c.kind === kind)!.id;

  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) / 100) * 100;

  const base = { description: null, payee: null, notes: null, tags: [] as string[] };
  const events: Event[] = [];
  const add = (date: IsoDate, order: number, input: Record<string, unknown>) => {
    if (date < start || date > today) return;
    events.push({ date, order, run: () => createTransaction(prisma, auth, { ...base, ...input, date } as TransactionInput) });
  };

  for (let offset = 0; offset < 3; offset++) {
    const { year, month } = yearMonth(addMonths(start, offset));
    const day = (d: number) => makeDate(year, month, d);
    const last = endOfMonth(day(1));

    add(day(1), 1, { type: 'EXPENSE', amount: 1_000_000, accountId: bank.id, categoryId: cat('Vivienda'), description: 'Arriendo' });
    add(day(2), 1, { type: 'TRANSFER', amount: 300_000, accountId: bank.id, toAccountId: nequi.id, description: 'Recarga Nequi' });
    add(day(5), 1, { type: 'DEBT_PAYMENT', amount: 380_000, interest: 70_000, accountId: bank.id, debtId: debt.id, description: 'Cuota crédito' });
    add(day(9), 1, { type: 'TRANSFER', amount: 150_000, accountId: bank.id, toAccountId: cash.id, description: 'Retiro cajero' });
    add(day(10), 1, { type: 'EXPENSE', amount: 90_000, accountId: bank.id, categoryId: cat('Servicios'), description: 'Internet' });
    add(day(12), 1, { type: 'CARD_PURCHASE', amount: 38_900, creditCardId: card.id, categoryId: cat('Suscripciones'), installments: 1, description: 'Netflix' });
    add(day(15), 0, { type: 'INCOME', amount: 2_000_000, accountId: bank.id, categoryId: cat('Salario', 'INCOME'), payee: 'Empresa S.A.S.', description: 'Salario quincena' });
    add(day(16), 1, { type: 'TRANSFER', amount: 300_000, accountId: bank.id, toAccountId: nequi.id, description: 'Recarga Nequi' });
    add(day(16), 2, { type: 'TRANSFER', amount: 400_000, accountId: bank.id, toAccountId: savings.id, description: 'Ahorro quincena' });
    add(day(20), 1, { type: 'EXPENSE', amount: 45_000, accountId: nequi.id, categoryId: cat('Entretenimiento'), description: 'Cine' });
    add(last, 0, { type: 'INCOME', amount: 2_000_000, accountId: bank.id, categoryId: cat('Salario', 'INCOME'), payee: 'Empresa S.A.S.', description: 'Salario quincena' });

    if (offset === 1) {
      add(day(8), 1, { type: 'CARD_PURCHASE', amount: 1_200_000, creditCardId: card.id, categoryId: cat('Compras'), installments: 12, description: 'Monitor' });
      add(day(22), 1, { type: 'INCOME', amount: 600_000, accountId: nu.id, categoryId: cat('Freelance', 'INCOME'), payee: 'Cliente', description: 'Proyecto freelance' });
    }

    for (let d = 3, i = 0; d <= 28; d += 7, i++) {
      const groceries = { amount: between(120_000, 220_000), categoryId: cat('Alimentación'), description: 'Mercado' };
      if (i % 2 === 0) add(day(d), 3, { type: 'CARD_PURCHASE', creditCardId: card.id, installments: 1, ...groceries });
      else add(day(d), 3, { type: 'EXPENSE', accountId: nequi.id, ...groceries });
    }
    for (let d = 2, i = 0; d <= 28; d += 3, i++) {
      const isLunch = i % 2 === 0;
      add(day(d), 4, {
        type: 'EXPENSE',
        amount: isLunch ? between(15_000, 32_000) : between(8_000, 20_000),
        accountId: i % 3 === 0 ? cash.id : nequi.id,
        categoryId: cat(isLunch ? 'Alimentación' : 'Transporte'),
        description: isLunch ? 'Almuerzo' : 'Transporte',
      });
    }
    const paymentDate = day(28);
    if (paymentDate <= today) {
      events.push({
        date: paymentDate,
        order: 9,
        run: async () => {
          const status = await getCreditCard(prisma, user.id, card.id, paymentDate);
          const amount = Math.min(status.amountDue, status.debt);
          if (amount > 0) {
            await createTransaction(prisma, auth, {
              ...base,
              type: 'CARD_PAYMENT',
              amount,
              date: paymentDate,
              accountId: bank.id,
              creditCardId: card.id,
              description: 'Pago tarjeta Nu',
            });
          }
        },
      });
    }
  }

  events.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));
  for (const event of events) await event.run();
  return { userId: user.id };
}
```

`apps/api/prisma/seed.ts`:
```ts
import { config as loadDotenv } from 'dotenv';
import { createPrisma } from '../src/lib/prisma';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from './seed-demo';

loadDotenv({ quiet: true });

if (process.env.NODE_ENV === 'production') {
  console.error('El seed de demostración no se ejecuta en producción.');
  process.exit(1);
}

const prisma = createPrisma(process.env.DATABASE_URL!);
try {
  await seedDemo(prisma);
  console.log(`Usuario demo listo: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
} finally {
  await prisma.$disconnect();
}
```

- [ ] **Step 4: Verificar el test**

Run: `npm test -w @finanzas/api -- seed`
Expected: PASS. Si alguna cuenta queda en negativo, ajustar los montos de recarga a Nequi en el seed (el test protege que la demo sea realista).

- [ ] **Step 5: Verificación completa del backend**

Run: `npm run lint && npm run typecheck && npm test`
Expected: todo en verde (shared + api: unit e integration).

Run: `npm run db:seed -w @finanzas/api`
Expected: `Usuario demo listo: demo@example.com / Demo12345!`.

Run: `npm run build -w @finanzas/api` y luego, desde `apps/api`, `node dist/server.js`
Expected: el servidor arranca desde el bundle (esto confirma que el cliente Prisma generado funciona empaquetado). En otra terminal:
```bash
curl -s http://localhost:3000/api/health
curl -s -c /tmp/fz.txt -H 'content-type: application/json' -d '{"email":"demo@example.com","password":"Demo12345!"}' http://localhost:3000/api/auth/login
curl -s -b /tmp/fz.txt http://localhost:3000/api/dashboard
```
Expected: `{"status":"ok"}`, el usuario demo y un JSON del dashboard con 5 cuentas, una tarjeta y un préstamo. Si el bundle falla al cargar el cliente Prisma (por ejemplo, por el motor wasm), cambiar `tsup.config.ts` para marcar `external: ['@prisma/client', '@prisma/adapter-pg']` y volver a probar; como último recurso, compilar con `tsc` (sin bundle) y copiar `packages/shared` compilado.

---

## Cierre del plan 1A

Al terminar, el backend de la Fase 1 queda completo y probado. **No** se hace commit todavía: el commit único de la Fase 1 se hace al final del plan 1B (`docs/superpowers/plans/2026-10-06-fase-1b-frontend-despliegue.md`).
