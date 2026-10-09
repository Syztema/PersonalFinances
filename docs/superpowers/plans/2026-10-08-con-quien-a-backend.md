# Con quién A — Backend: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada gasto (y compra con tarjeta) pueda decir con quién se hizo: una tabla de opciones editables por usuario (`Companion`), su API, el campo en los movimientos, el desglose por compañía en `GET /api/reports` y la columna/hoja nueva en la exportación.

**Architecture:** Igual que en las fases anteriores: rutas delgadas → servicios (toda consulta filtra por `userId`) → dominio puro. `Companion` copia el patrón de `Category` (FK compuesta `(id, userId)`, borrado definitivo si no se usa y lógico si se usa, restaurar). `Transaction.companionId` es una FK compuesta nullable protegida por un `CHECK` (solo `EXPENSE`/`CARD_PURCHASE` sin `parentId`). El desglose del reporte sale de `buildReport` (dominio puro, probado sin base); la agrupación "top 5 + Otros + Sin indicar" para la gráfica mensual vive en `@finanzas/shared` (`groupCompanionSeries`) para que la web no haga cuentas de dinero.

**Tech Stack:** Node 22, TypeScript 5.9.3, Fastify 5.12, Zod 4.6, Prisma 7.10 (`prisma-client` + `@prisma/adapter-pg`), PostgreSQL 17, Vitest 5, exceljs 4.4.

**Spec:** `docs/superpowers/specs/2026-10-08-con-quien-design.md` (§2, §4.1, §4.2, §4.4, §5 y §6), sobre el spec principal y los addenda de las Fases 2 y 3.

**Rama:** `con-quien` (ya existe; tiene el spec). Las pruebas de integración usan la base de pruebas de Docker: `npm run dev:db` antes de la primera tarea con tests en `apps/api/test`.

## Global Constraints

- Interfaz y mensajes en español (es-CO); código, nombres y tests en inglés; fechas en `America/Bogota`; dinero en pesos enteros (`BigInt` en la base, `number` en los DTO).
- Prioridades: corrección financiera > seguridad > aislamiento > experiencia móvil > registro rápido > dashboard > rendimiento > diseño.
- Toda consulta filtra por `userId`; un recurso de otro usuario responde 404 (rutas `/:id`) o 400 `INVALID_REFERENCE` (referencias dentro de un cuerpo).
- Opciones iniciales, en este orden: Solo (`user`, `#475569`), Pareja (`heart`, `#be185d`), Familia (`home`, `#2563eb`), Amigos (`users`, `#c2410c`).
- Nombre de una opción: 1 a 30 caracteres tras recortar espacios; único por usuario sin distinguir mayúsculas, también frente a las eliminadas. Mensajes: `COMPANION_NAME_TAKEN` "Ya tienes una opción con ese nombre." / "Ya existe una opción eliminada con ese nombre; restáurala.".
- `companionId` solo existe en `EXPENSE` y `CARD_PURCHASE` sin `parentId` (CHECK `Transaction_companion_check`); en otro tipo responde 400 `VALIDATION_ERROR` con `fields.companionId`.
- `Σ expenseByCompanion.amount = totals.expense` y, por mes, `Σ items.amount = months[i].expense`.
- La migración es aditiva y no modifica datos existentes; nunca `prisma migrate reset` ni `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
- Los logs nunca contienen cuerpos, valores, nombres, notas, emails, tokens ni query strings.
- Exportación: protección contra fórmulas en el texto del usuario (CSV y Excel); los nombres van sin marca de eliminado.
- Sin dependencias nuevas.
- Cada tarea termina con un commit en `con-quien` con mensaje de una frase en español; el commit único en `main` lo hace el controlador al final (no lo hace ninguna tarea).
- Nunca subir `.env`; archivos UTF-8 sin BOM y LF; la verificación de cada tarea incluye `npm run typecheck` y `npm run format:check` (desde la raíz).

## Decisiones del plan

1. El ícono de Familia es `home`: es la clave de la casa en `apps/web/src/lib/icons.tsx` (el spec se corrigió).
2. `Companion` tiene `updatedAt` como `Category`; la migración lo llena con `CURRENT_TIMESTAMP` en las filas que agrega.
3. Migración `20261008000200_con_quien`, escrita a mano. Las opciones iniciales de las cuentas existentes se agregan con `INSERT … SELECT … ON CONFLICT ("userId", "name") DO NOTHING`, así repetirla no duplica nada.
4. `PUT /api/transactions/:id` reemplaza el movimiento completo, como hoy con las etiquetas: un gasto sin `companionId` en el cuerpo queda sin compañía. La web siempre lo envía (plan B).
5. Para cumplir "`fields.companionId`" con esquemas estrictos, `parse()` convierte cada clave no reconocida en `fields.<clave> = 'Campo no permitido'` (antes iba a `fields._`); ningún test dependía de `_`.
6. El filtro `companionId=none` de Movimientos devuelve los gastos (`EXPENSE` + `CARD_PURCHASE`, intereses incluidos) sin compañía: lo mismo que "Sin indicar" en el reporte. Nunca devuelve ingresos ni transferencias.
7. El nombre se compara sin distinguir mayúsculas antes de escribir (como las categorías); la base garantiza la unicidad exacta y una carrera responde el mismo 409.
8. Una opción se borra del todo si ningún movimiento la usa; si no, queda eliminada (`isActive = false`). Una carrera entre ese conteo y un gasto nuevo termina en error de FK (500), igual que en categorías; se acepta.
9. `CompanionRefDTO` es `RefDTO` (id, nombre, ícono, color, `isActive`).
10. En el reporte, un movimiento cuya compañía no está en el mapa cuenta como "Sin indicar", así la suma siempre cuadra. Las filas con nombre van por valor y, en empate, por nombre; "Sin indicar" siempre al final.
11. `companionMonths[i].items` sigue el mismo orden que `expenseByCompanion`, calculado con los gastos de ese mes.
12. `groupCompanionSeries(rows, months, n = 5)` vive en `packages/shared/src/reports.ts`, junto a `groupTop`. Usa las claves `'other'` y `'none'`, que nunca chocan con un UUID.
13. Exportación: la columna "Con quién" va después de "Subcategoría" y queda vacía si no aplica. La hoja "Por compañía" va después de "Por categoría" y escribe "Sin indicar" para la fila `null`.
14. Estas tareas cambian `TransactionDTO` y `ReportDTO` en `@finanzas/shared`. Cada una actualiza también los fixtures tipados de la web que se rompen (`TransactionRow.test.tsx`, `TransactionDetailSheet.test.tsx`, `src/test/reportFixture.ts`), para que `npm run typecheck` quede verde en todo el monorepo.
15. El seed de demostración asigna compañías: Cine → Pareja, Mercado → Familia, Almuerzo → Amigos o Solo. Así el usuario demo ve las gráficas con datos.

## Review Focus

1. Un movimiento congelado (cuenta eliminada) al que solo se le cambia la compañía → 200; cambiar su valor sigue respondiendo 409 `ENTITY_DELETED` (Tarea 3).
2. Editar un gasto que conserva su compañía eliminada → 200; cambiarla por otra eliminada → 400 `INVALID_REFERENCE` (Tarea 3).
3. Cambiar `EXPENSE` ⇄ `CARD_PURCHASE` al editar → la compañía se conserva en los dos sentidos (Tarea 3).
4. Intereses de un pago de préstamo y ajustes de saldo en el periodo → caen en "Sin indicar" y la suma por compañía sigue siendo exactamente `totals.expense`, también por mes (Tareas 4 y 5).
5. Eliminar la cuenta del usuario (`DELETE /api/me`) cuando sus gastos usan opciones → 204 y no queda nada suyo (la FK `NO ACTION` no bloquea la cascada) (Tarea 3).

Tests de cada línea: (1) `test/transactions-companion.test.ts` › "lets a frozen movement change only who it was with"; (2) mismo archivo › "keeps a deleted option on edit and refuses switching to another deleted one"; (3) mismo archivo › "keeps who on the EXPENSE ⇄ CARD_PURCHASE switch"; (4) `src/domain/report.test.ts` › "adds up spending by who exactly to the expense total, per month too" y `test/companions-report.test.ts` › "adds up spending by who exactly to the expense total, with interest and adjustments as Sin indicar"; (5) `test/transactions-companion.test.ts` › "deletes a whole user whose expenses use options".

---

### Task 1: Tabla `Companion`, migración y opciones iniciales

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (modelo `User`, modelo nuevo `Companion`, modelo `Transaction`)
- Create: `apps/api/prisma/migrations/20261008000200_con_quien/migration.sql`
- Create: `apps/api/src/modules/companions/defaults.ts`
- Modify: `apps/api/src/modules/auth/service.ts` (`registerUser`, ~línea 43)
- Test: `apps/api/test/companions-db.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: modelo Prisma `Companion` (`prisma.companion`, clave compuesta `id_userId`), `Transaction.companionId: string | null` y la relación `Transaction.companion`; `DEFAULT_COMPANIONS: ReadonlyArray<{ name: string; icon: string; color: string }>` exportado desde `apps/api/src/modules/companions/defaults.ts`.

- [ ] **Step 1: Escribir los tests de base de datos (fallan)**

Crear `apps/api/test/companions-db.test.ts`:

```ts
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
    await expect(
      expense(a, { parentId: parent.id, companionId: a.friends.id }),
    ).rejects.toThrow();
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
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm test -w @finanzas/api -- test/companions-db.test.ts`
Expected: FAIL (TypeScript/Prisma no conocen `companion`; el archivo de migración no existe).

- [ ] **Step 3: Esquema Prisma**

En `apps/api/prisma/schema.prisma`:

1. En `model User`, después de `tags             Tag[]`, agregar:

```prisma
  companions       Companion[]
```

2. Después de `model Tag { … }`, agregar el modelo:

```prisma
/// Con quién se gastó (spec con quién §2.1): opciones editables por usuario.
model Companion {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @db.Uuid
  name      String   @db.VarChar(30)
  icon      String   @db.VarChar(40)
  color     String   @db.VarChar(7)
  sortOrder Int      @default(0)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions Transaction[]

  @@unique([userId, name])
  @@unique([id, userId])
}
```

3. En `model Transaction`: después de `goalId        String?         @db.Uuid` agregar `companionId   String?         @db.Uuid`; después de la línea de la relación `goal` agregar:

```prisma
  companion     Companion?       @relation(fields: [companionId, userId], references: [id, userId], onDelete: NoAction)
```

y después de `@@index([userId, categoryId, date])` agregar `@@index([userId, companionId])`.

- [ ] **Step 4: Migración**

Crear `apps/api/prisma/migrations/20261008000200_con_quien/migration.sql`:

```sql
-- Con quién (spec 2026-10-08-con-quien-design.md §2 y §6): aditiva, no modifica datos existentes.

-- CreateTable
CREATE TABLE "Companion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "icon" VARCHAR(40) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Companion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Companion_userId_name_key" ON "Companion"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Companion_id_userId_key" ON "Companion"("id", "userId");

-- AddForeignKey
ALTER TABLE "Companion" ADD CONSTRAINT "Companion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "companionId" UUID;

-- CreateIndex
CREATE INDEX "Transaction_userId_companionId_idx" ON "Transaction"("userId", "companionId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_companionId_userId_fkey" FOREIGN KEY ("companionId", "userId") REFERENCES "Companion"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Solo gastos y compras con tarjeta, nunca los intereses (hijos de un pago de préstamo)
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_companion_check" CHECK (
  "companionId" IS NULL OR ("type" IN ('EXPENSE', 'CARD_PURCHASE') AND "parentId" IS NULL)
);

-- Opciones iniciales para las cuentas que ya existen (las nuevas las crea el registro)
INSERT INTO "Companion" ("userId", "name", "icon", "color", "sortOrder", "updatedAt")
SELECT u."id", d."name", d."icon", d."color", d."sortOrder", CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN (
  VALUES
    ('Solo', 'user', '#475569', 0),
    ('Pareja', 'heart', '#be185d', 1),
    ('Familia', 'home', '#2563eb', 2),
    ('Amigos', 'users', '#c2410c', 3)
) AS d("name", "icon", "color", "sortOrder")
ON CONFLICT ("userId", "name") DO NOTHING;
```

- [ ] **Step 5: Opciones iniciales al registrarse**

Crear `apps/api/src/modules/companions/defaults.ts`:

```ts
/** Spec con quién §2.2: opciones iniciales (la migración agrega las mismas a las cuentas existentes). */
export const DEFAULT_COMPANIONS = [
  { name: 'Solo', icon: 'user', color: '#475569' },
  { name: 'Pareja', icon: 'heart', color: '#be185d' },
  { name: 'Familia', icon: 'home', color: '#2563eb' },
  { name: 'Amigos', icon: 'users', color: '#c2410c' },
] as const;
```

En `apps/api/src/modules/auth/service.ts`, importar `import { DEFAULT_COMPANIONS } from '../companions/defaults';` y, dentro de la transacción de `registerUser`, justo después del `tx.category.createMany({ … })`, agregar:

```ts
    await tx.companion.createMany({
      data: DEFAULT_COMPANIONS.map((c, i) => ({ ...c, userId: user.id, sortOrder: i })),
    });
```

- [ ] **Step 6: Aplicar en desarrollo y verificar que no hay deriva**

Run (desde `apps/api`, con `npm run dev:db` corriendo):

```bash
npx prisma migrate deploy
npx prisma migrate dev --create-only --name drift_check
npx prisma generate
```

Expected: `migrate deploy` aplica `20261008000200_con_quien`; `migrate dev --create-only` responde que no hay cambios (Prisma no gestiona los `CHECK`). Si crea una carpeta `*_drift_check` vacía, borrarla. Si propone cambios reales, el `schema.prisma` no coincide con el SQL: corregir el esquema (no la base) y repetir. **Nunca** aceptar un reset.

- [ ] **Step 7: Correr los tests y verificar**

Run: `npm test -w @finanzas/api -- test/companions-db.test.ts test/db-constraints.test.ts test/auth.test.ts`
Expected: PASS.
Run (raíz): `npm run typecheck` y `npm run format:check`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261008000200_con_quien apps/api/src/modules/companions/defaults.ts apps/api/src/modules/auth/service.ts apps/api/test/companions-db.test.ts
git commit -m "feat: agrega la tabla de con quién con sus opciones iniciales y la migración"
```

---

### Task 2: API de opciones (`/api/companions`)

**Files:**
- Create: `packages/shared/src/schemas/companions.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/dto.ts` (agregar `CompanionRefDTO` y `CompanionDTO` después de `TagDTO`)
- Create: `apps/api/src/modules/companions/service.ts`
- Create: `apps/api/src/modules/companions/routes.ts`
- Modify: `apps/api/src/app.ts` (registrar las rutas)
- Modify: `apps/api/src/lib/validation.ts` (`parse`: claves no reconocidas por campo)
- Test: `apps/api/test/companions.test.ts`

**Interfaces:**
- Consumes: modelo `Companion` y `DEFAULT_COMPANIONS` (Tarea 1).
- Produces:
  - `companionCreateSchema` (`{ name, icon = 'user', color = '#64748b' }`) y `companionUpdateSchema` (`{ name?, icon?, color? }`), con los tipos `CompanionCreateInput` y `CompanionUpdateInput`.
  - `type CompanionRefDTO = RefDTO` y `interface CompanionDTO { id; name; icon; color; isActive; sortOrder; usageCount }`.
  - Rutas: `GET /api/companions` → `{ items: CompanionDTO[] }`; `POST /api/companions` → 201 `{ companion }`; `PUT /api/companions/:id` → `{ companion }`; `DELETE /api/companions/:id` → `{ deleted: 'hard' | 'soft' }`; `POST /api/companions/:id/restore` → `{ companion }`.
  - `parse()` pone `fields.<clave> = 'Campo no permitido'` por cada clave no reconocida (decisión 5), en toda la API.

- [ ] **Step 1: Escribir los tests de la API (fallan)**

Crear `apps/api/test/companions.test.ts`:

```ts
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
      { name: 'Pareja', icon: 'heart', color: '#be185d', isActive: true, sortOrder: 1, usageCount: 0 },
      { name: 'Familia', icon: 'home', color: '#2563eb', isActive: true, sortOrder: 2, usageCount: 0 },
      { name: 'Amigos', icon: 'users', color: '#c2410c', isActive: true, sortOrder: 3, usageCount: 0 },
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
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm test -w @finanzas/api -- test/companions.test.ts`
Expected: FAIL (404 en `/api/companions`).

- [ ] **Step 3: Claves no reconocidas por campo**

Reemplazar el cuerpo del `for` de `parse` en `apps/api/src/lib/validation.ts`:

```ts
  for (const issue of result.error.issues) {
    // Spec con quién §2.3: una clave que el esquema no admite se informa en su propio campo.
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        fields[[...issue.path, key].join('.')] ??= 'Campo no permitido';
      }
      continue;
    }
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
```

- [ ] **Step 4: Esquemas y DTO compartidos**

Crear `packages/shared/src/schemas/companions.ts`:

```ts
import { z } from 'zod';
import { zColor, zIcon, zName } from './common';

/** Spec con quién §2.1: nombre de 1 a 30 caracteres, ícono y color de la app. */
export const companionCreateSchema = z.strictObject({
  name: zName(30),
  icon: zIcon.default('user'),
  color: zColor.default('#64748b'),
});

export const companionUpdateSchema = z.strictObject({
  name: zName(30).optional(),
  icon: zIcon.optional(),
  color: zColor.optional(),
});

export type CompanionCreateInput = z.output<typeof companionCreateSchema>;
export type CompanionUpdateInput = z.output<typeof companionUpdateSchema>;
```

En `packages/shared/src/index.ts`, después de `export * from './schemas/tags';`, agregar `export * from './schemas/companions';`.

En `packages/shared/src/dto.ts`, después de `interface TagDTO { … }`, agregar:

```ts
/** Con quién se gastó (spec con quién §2.4); `isActive` false se muestra "(eliminada)". */
export type CompanionRefDTO = RefDTO;

export interface CompanionDTO {
  id: string;
  name: string;
  icon: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  /** Movimientos que la usan (también los de cuentas o tarjetas eliminadas). */
  usageCount: number;
}
```

- [ ] **Step 5: Servicio**

Crear `apps/api/src/modules/companions/service.ts`:

```ts
import type {
  CompanionCreateInput,
  CompanionDTO,
  CompanionUpdateInput,
  DeleteResultDTO,
} from '@finanzas/shared';
import type { Companion } from '../../generated/prisma/client';
import { conflict, entityDeleted, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';

const withUsage = { _count: { select: { transactions: true } } } as const;
type CompanionRow = Companion & { _count: { transactions: number } };

const NAME_TAKEN = () => conflict('COMPANION_NAME_TAKEN', 'Ya tienes una opción con ese nombre.');

function toCompanionDTO(c: CompanionRow): CompanionDTO {
  return {
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    usageCount: c._count.transactions,
  };
}

async function findCompanion(db: DbClient, userId: string, id: string): Promise<CompanionRow> {
  const companion = await db.companion.findUnique({
    where: { id_userId: { id, userId } },
    include: withUsage,
  });
  if (!companion) throw notFound('Opción no encontrada.');
  return companion;
}

/** Spec con quién §2.3: el nombre es único por usuario sin distinguir mayúsculas, también frente a las eliminadas. */
async function nameTaken(db: DbClient, userId: string, name: string, exceptId?: string) {
  const other = await db.companion.findFirst({
    where: {
      userId,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId && { id: { not: exceptId } }),
    },
    select: { isActive: true },
  });
  if (!other) return null;
  return other.isActive
    ? NAME_TAKEN()
    : conflict(
        'COMPANION_NAME_TAKEN',
        'Ya existe una opción eliminada con ese nombre; restáurala.',
      );
}

export async function listCompanions(db: DbClient, userId: string): Promise<CompanionDTO[]> {
  const rows = await db.companion.findMany({
    where: { userId },
    include: withUsage,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toCompanionDTO);
}

export async function createCompanion(
  db: DbClient,
  userId: string,
  input: CompanionCreateInput,
): Promise<CompanionDTO> {
  const taken = await nameTaken(db, userId, input.name);
  if (taken) throw taken;
  const { _max } = await db.companion.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  try {
    const created = await db.companion.create({
      data: {
        userId,
        name: input.name,
        icon: input.icon,
        color: input.color,
        sortOrder: (_max.sortOrder ?? -1) + 1,
      },
      include: withUsage,
    });
    return toCompanionDTO(created);
  } catch (err) {
    if (isUniqueViolation(err)) throw (await nameTaken(db, userId, input.name)) ?? NAME_TAKEN();
    throw err;
  }
}

export async function updateCompanion(
  db: DbClient,
  userId: string,
  id: string,
  input: CompanionUpdateInput,
): Promise<CompanionDTO> {
  const current = await findCompanion(db, userId, id);
  if (!current.isActive) throw entityDeleted(current.name, 'editarla');
  if (input.name !== undefined) {
    const taken = await nameTaken(db, userId, input.name, id);
    if (taken) throw taken;
  }
  try {
    const updated = await db.companion.update({
      where: { id_userId: { id, userId } },
      data: { name: input.name, icon: input.icon, color: input.color },
      include: withUsage,
    });
    return toCompanionDTO(updated);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw (await nameTaken(db, userId, input.name ?? current.name, id)) ?? NAME_TAKEN();
    }
    throw err;
  }
}

/** Spec con quién §2.3: sin movimientos se borra; con movimientos queda eliminada y conserva el historial. */
export async function deleteCompanion(
  db: DbClient,
  userId: string,
  id: string,
): Promise<DeleteResultDTO> {
  const companion = await findCompanion(db, userId, id);
  if (!companion.isActive) return { deleted: 'soft' };
  if (companion._count.transactions === 0) {
    await db.companion.delete({ where: { id_userId: { id, userId } } });
    return { deleted: 'hard' };
  }
  await db.companion.update({ where: { id_userId: { id, userId } }, data: { isActive: false } });
  return { deleted: 'soft' };
}

export async function restoreCompanion(
  db: DbClient,
  userId: string,
  id: string,
): Promise<CompanionDTO> {
  await findCompanion(db, userId, id);
  const restored = await db.companion.update({
    where: { id_userId: { id, userId } },
    data: { isActive: true },
    include: withUsage,
  });
  return toCompanionDTO(restored);
}
```

- [ ] **Step 6: Rutas y registro**

Crear `apps/api/src/modules/companions/routes.ts`:

```ts
import { companionCreateSchema, companionUpdateSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import {
  createCompanion,
  deleteCompanion,
  listCompanions,
  restoreCompanion,
  updateCompanion,
} from './service';

export async function companionRoutes(app: FastifyInstance) {
  app.get('/companions', async (req) => ({
    items: await listCompanions(app.prisma, req.auth.userId),
  }));

  app.post('/companions', async (req, reply) => {
    const companion = await createCompanion(
      app.prisma,
      req.auth.userId,
      parse(companionCreateSchema, req.body),
    );
    return reply.status(201).send({ companion });
  });

  app.put('/companions/:id', async (req) => ({
    companion: await updateCompanion(
      app.prisma,
      req.auth.userId,
      parseId(req.params),
      parse(companionUpdateSchema, req.body),
    ),
  }));

  app.delete('/companions/:id', async (req) =>
    deleteCompanion(app.prisma, req.auth.userId, parseId(req.params)),
  );

  app.post('/companions/:id/restore', async (req) => ({
    companion: await restoreCompanion(app.prisma, req.auth.userId, parseId(req.params)),
  }));
}
```

En `apps/api/src/app.ts`, importar `import { companionRoutes } from './modules/companions/routes';` (junto a los otros imports de rutas) y registrar `await api.register(companionRoutes);` justo después de `await api.register(tagRoutes);`.

- [ ] **Step 7: Correr los tests y verificar**

Run: `npm test -w @finanzas/api`
Expected: PASS (toda la API: el cambio de `parse` no rompe ningún test anterior).
Run (raíz): `npm run typecheck` y `npm run format:check`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/schemas/companions.ts packages/shared/src/index.ts packages/shared/src/dto.ts apps/api/src/modules/companions apps/api/src/app.ts apps/api/src/lib/validation.ts apps/api/test/companions.test.ts
git commit -m "feat: agrega la API para crear, editar, eliminar y restaurar las opciones de con quién"
```

---

### Task 3: Movimientos con compañía

**Files:**
- Modify: `packages/shared/src/schemas/transactions.ts` (`expenseSchema`, `cardPurchaseFields`, `transactionListQuerySchema`)
- Modify: `packages/shared/src/dto.ts` (`TransactionDTO`)
- Modify: `apps/api/src/modules/transactions/refs.ts`
- Modify: `apps/api/src/modules/transactions/service.ts` (`rowData`, `NO_REFS`)
- Modify: `apps/api/src/modules/transactions/mapper.ts`
- Modify: `apps/api/src/modules/transactions/list.ts`
- Modify: `apps/api/prisma/seed-demo.ts`
- Modify: `apps/api/test/seed.test.ts` (una aserción)
- Modify: `apps/web/src/features/transactions/TransactionRow.test.tsx` y `apps/web/src/features/transactions/TransactionDetailSheet.test.tsx` (fixtures tipados)
- Test: `apps/api/test/transactions-companion.test.ts`

**Interfaces:**
- Consumes: `/api/companions`, `CompanionRefDTO` y el `parse()` que informa claves no reconocidas por campo (Tarea 2).
- Produces:
  - `expenseSchema` y `cardPurchaseSchema`/`cardPurchaseBodySchema` aceptan `companionId?: string | null` (ausente → `null`).
  - `transactionListQuerySchema` acepta `companionId?: string | 'none'`.
  - `TransactionDTO.companion: CompanionRefDTO | null`.
  - `ResolvedRefs.companion: Companion | null` y `ExistingRefs.companionId: string | null`.

- [ ] **Step 1: Escribir los tests de integración (fallan)**

Crear `apps/api/test/transactions-companion.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { CompanionDTO, TransactionDTO } from '@finanzas/shared';
import { setupFinances } from './finance-fixtures';
import { createTestApp, registerUser, type Client } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

async function newUser() {
  const reg = await registerUser(app);
  const f = await setupFinances(reg.api);
  const options = (await reg.api.get<{ items: CompanionDTO[] }>('/api/companions')).body.items;
  const who = (name: string) => options.find((c) => c.name === name)!.id;
  return { ...reg, f, who };
}

type F = Awaited<ReturnType<typeof newUser>>['f'];

const expenseBody = (f: F, extra: Record<string, unknown> = {}) => ({
  type: 'EXPENSE',
  amount: 40_000,
  date: '2026-10-10',
  accountId: f.bank,
  categoryId: f.cat.food,
  ...extra,
});

async function create(api: Client, body: unknown) {
  const res = await api.post<{ transaction: TransactionDTO }>('/api/transactions', body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.transaction;
}

/** Crea una opción, la usa en un gasto y la elimina (queda con historial). */
async function usedAndDeleted(api: Client, f: F, name: string) {
  const id = (await api.post('/api/companions', { name })).body.companion.id as string;
  const tx = await create(api, expenseBody(f, { companionId: id }));
  expect((await api.del(`/api/companions/${id}`)).body).toEqual({ deleted: 'soft' });
  return { id, tx };
}

describe('who on a movement (spec con quién §2.3)', () => {
  it('saves who an expense and a card purchase were with, and shows it', async () => {
    const { api, f, who } = await newUser();
    const lunch = await create(api, expenseBody(f, { companionId: who('Amigos') }));
    expect(lunch.companion).toEqual({
      id: who('Amigos'),
      name: 'Amigos',
      icon: 'users',
      color: '#c2410c',
      isActive: true,
    });
    const purchase = await api.post<{ transaction: TransactionDTO }>(
      `/api/credit-cards/${f.card}/purchase`,
      { amount: 90_000, date: '2026-10-10', categoryId: f.cat.fun, companionId: who('Pareja') },
    );
    expect(purchase.status).toBe(201);
    expect(purchase.body.transaction.companion?.name).toBe('Pareja');
    expect((await create(api, expenseBody(f))).companion).toBeNull();
    expect((await create(api, expenseBody(f, { companionId: null }))).companion).toBeNull();
    const usage = (await api.get<{ items: CompanionDTO[] }>('/api/companions')).body.items;
    expect(usage.find((c) => c.name === 'Amigos')?.usageCount).toBe(1);
  });

  it('refuses who on movements that are not spending (fields.companionId)', async () => {
    const { api, f, who } = await newUser();
    const companionId = who('Solo');
    const bodies = [
      { type: 'INCOME', amount: 1000, date: '2026-10-10', accountId: f.bank, categoryId: f.cat.salary },
      { type: 'TRANSFER', amount: 1000, date: '2026-10-10', accountId: f.bank, toAccountId: f.wallet },
      { type: 'CARD_PAYMENT', amount: 1000, date: '2026-10-10', accountId: f.bank, creditCardId: f.card },
      { type: 'DEBT_PAYMENT', amount: 1000, date: '2026-10-10', accountId: f.bank, debtId: f.debt },
      { type: 'DEBT_DISBURSEMENT', amount: 1000, date: '2026-10-10', accountId: f.bank, debtId: f.debt },
    ];
    for (const body of bodies) {
      const res = await api.post('/api/transactions', { ...body, companionId });
      expect(res.status, body.type).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields).toEqual({ companionId: 'Campo no permitido' });
    }
  });

  it("refuses a deleted option or another user's on create (INVALID_REFERENCE)", async () => {
    const a = await newUser();
    const b = await newUser();
    const foreign = await a.api.post('/api/transactions', expenseBody(a.f, { companionId: b.who('Solo') }));
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe('INVALID_REFERENCE');
    expect(foreign.body.error.fields).toEqual({ companionId: 'Opción no encontrada' });

    const { id } = await usedAndDeleted(a.api, a.f, 'Vecinos');
    const deleted = await a.api.post('/api/transactions', expenseBody(a.f, { companionId: id }));
    expect(deleted.status).toBe(400);
    expect(deleted.body.error.fields).toEqual({ companionId: 'La opción fue eliminada' });

    // B tampoco ve los gastos de A al filtrar por la opción de A.
    await create(a.api, expenseBody(a.f, { companionId: a.who('Amigos') }));
    const peek = await b.api.get(`/api/transactions?companionId=${a.who('Amigos')}`);
    expect(peek.status).toBe(200);
    expect(peek.body.items).toEqual([]);
  });

  it('keeps a deleted option on edit and refuses switching to another deleted one', async () => {
    const { api, f } = await newUser();
    const { id, tx } = await usedAndDeleted(api, f, 'Vecinos');
    const keep = await api.put<{ transaction: TransactionDTO }>(
      `/api/transactions/${tx.id}`,
      expenseBody(f, { companionId: id, description: 'Asado' }),
    );
    expect(keep.status).toBe(200);
    expect(keep.body.transaction.companion).toMatchObject({ id, isActive: false });

    const other = await usedAndDeleted(api, f, 'Primos');
    const swap = await api.put(`/api/transactions/${tx.id}`, expenseBody(f, { companionId: other.id }));
    expect(swap.status).toBe(400);
    expect(swap.body.error.fields).toEqual({ companionId: 'La opción fue eliminada' });

    const clear = await api.put<{ transaction: TransactionDTO }>(
      `/api/transactions/${tx.id}`,
      expenseBody(f, { companionId: null }),
    );
    expect(clear.body.transaction.companion).toBeNull();
  });

  it('lets a frozen movement change only who it was with (descriptive field)', async () => {
    const { api, f, who } = await newUser();
    await api.post('/api/transfers', {
      amount: 50_000,
      date: '2026-10-09',
      accountId: f.bank,
      toAccountId: f.wallet,
    });
    const body = expenseBody(f, { accountId: f.wallet, amount: 50_000, companionId: who('Solo') });
    const tx = await create(api, body);
    expect((await api.del(`/api/accounts/${f.wallet}`)).body).toEqual({ deleted: 'soft' });

    const res = await api.put<{ transaction: TransactionDTO }>(`/api/transactions/${tx.id}`, {
      ...body,
      companionId: who('Amigos'),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.transaction.companion?.name).toBe('Amigos');
    expect(res.body.transaction.amount).toBe(50_000);
    // Control: el dinero sigue congelado.
    const money = await api.put(`/api/transactions/${tx.id}`, { ...body, amount: 60_000 });
    expect(money.status).toBe(409);
    expect(money.body.error.code).toBe('ENTITY_DELETED');
  });

  it('keeps who on the EXPENSE ⇄ CARD_PURCHASE switch', async () => {
    const { api, f, who } = await newUser();
    const tx = await create(api, expenseBody(f, { companionId: who('Familia') }));
    const toCard = await api.put<{ transaction: TransactionDTO }>(`/api/transactions/${tx.id}`, {
      type: 'CARD_PURCHASE',
      amount: 40_000,
      date: '2026-10-10',
      creditCardId: f.card,
      categoryId: f.cat.food,
      installments: 1,
      companionId: who('Familia'),
    });
    expect(toCard.status, JSON.stringify(toCard.body)).toBe(200);
    expect(toCard.body.transaction).toMatchObject({
      type: 'CARD_PURCHASE',
      companion: { name: 'Familia' },
    });
    const back = await api.put<{ transaction: TransactionDTO }>(
      `/api/transactions/${tx.id}`,
      expenseBody(f, { companionId: who('Familia') }),
    );
    expect(back.body.transaction).toMatchObject({ type: 'EXPENSE', companion: { name: 'Familia' } });
  });

  it('filters by who; "none" is spending without who, interest included', async () => {
    const { api, f, who } = await newUser();
    const friends = await create(api, expenseBody(f, { companionId: who('Amigos') }));
    const alone = await create(api, expenseBody(f, { description: 'Sin decir' }));
    await create(api, {
      type: 'INCOME',
      amount: 1_000_000,
      date: '2026-10-10',
      accountId: f.bank,
      categoryId: f.cat.salary,
    });
    await create(api, {
      type: 'DEBT_PAYMENT',
      amount: 400_000,
      interest: 30_000,
      date: '2026-10-10',
      accountId: f.bank,
      debtId: f.debt,
    });
    const byFriends = await api.get<{ items: TransactionDTO[] }>(
      `/api/transactions?companionId=${who('Amigos')}`,
    );
    expect(byFriends.body.items.map((t) => t.id)).toEqual([friends.id]);
    const none = await api.get<{ items: TransactionDTO[] }>('/api/transactions?companionId=none');
    expect(none.body.items.map((t) => t.type).sort()).toEqual(['EXPENSE', 'EXPENSE']);
    expect(none.body.items.map((t) => t.description).sort()).toEqual([
      'Intereses Libre inversión',
      'Sin decir',
    ]);
    expect(none.body.items.some((t) => t.id === alone.id)).toBe(true);
    expect((await api.get('/api/transactions?companionId=otra-cosa')).status).toBe(400);
  });

  it('deletes a used option keeping its history and restores it', async () => {
    const { api, f } = await newUser();
    const { id, tx } = await usedAndDeleted(api, f, 'Vecinos');
    const options = (await api.get<{ items: CompanionDTO[] }>('/api/companions')).body.items;
    expect(options.find((c) => c.id === id)).toMatchObject({ isActive: false, usageCount: 1 });
    const shown = await api.get<{ transaction: TransactionDTO }>(`/api/transactions/${tx.id}`);
    expect(shown.body.transaction.companion).toMatchObject({ name: 'Vecinos', isActive: false });
    expect((await api.post(`/api/companions/${id}/restore`)).body.companion.isActive).toBe(true);
    expect((await create(api, expenseBody(f, { companionId: id }))).companion?.name).toBe('Vecinos');
  });

  it('deletes a whole user whose expenses use options (review focus 5)', async () => {
    const { api, f, who, password, user } = await newUser();
    await create(api, expenseBody(f, { companionId: who('Amigos') }));
    const res = await api.del('/api/me', { password, confirmation: 'ELIMINAR' });
    expect(res.status).toBe(204);
    expect(await app.prisma.companion.count({ where: { userId: user.id } })).toBe(0);
    expect(await app.prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm test -w @finanzas/api -- test/transactions-companion.test.ts`
Expected: FAIL (`companionId` es una clave no reconocida en gastos; `companion` no está en el DTO).

- [ ] **Step 3: Esquemas y DTO compartidos**

En `packages/shared/src/schemas/transactions.ts`:

1. Debajo de `const zInstallments = …`, agregar:

```ts
/** Spec con quién §2.3: con quién se gastó; ausente o null = sin indicar. */
const zCompanion = zId.nullish();
```

2. En `expenseSchema`, después de `paymentMethod: z.enum(PAYMENT_METHODS).nullish(),`, agregar `companionId: zCompanion,`.
3. En `cardPurchaseFields`, después de `installments: zInstallments.default(1),`, agregar `companionId: zCompanion,`.
4. En `transactionListQuerySchema`, después de `debtId: zId.optional(),`, agregar:

```ts
    /** Una opción, o `none`: gastos sin compañía (spec con quién §3.2). */
    companionId: z.union([zId, z.literal('none')]).optional(),
```

En `packages/shared/src/dto.ts`, dentro de `interface TransactionDTO`, después de `category: CategoryRefDTO | null;`, agregar:

```ts
  /** Con quién (spec con quién §2): solo gastos y compras con tarjeta; si no, null. */
  companion: CompanionRefDTO | null;
```

- [ ] **Step 4: Referencias, filas, DTO y filtro**

En `apps/api/src/modules/transactions/refs.ts`:

1. Importar `Companion` en el `import type { … } from '../../generated/prisma/client'`.
2. `ResolvedRefs`: agregar `companion: Companion | null;` después de `goal`.
3. `ExistingRefs`: agregar `companionId: string | null;` después de `categoryId`.
4. En `ids`, agregar `companionId: refId(input, 'companionId'),`.
5. Reemplazar el `Promise.all` por:

```ts
  const [account, toAccount, card, debt, category, goal, companion] = await Promise.all([
    ids.accountId ? db.account.findUnique({ where: key(ids.accountId) }) : null,
    ids.toAccountId ? db.account.findUnique({ where: key(ids.toAccountId) }) : null,
    ids.creditCardId ? db.creditCard.findUnique({ where: key(ids.creditCardId) }) : null,
    ids.debtId ? db.debt.findUnique({ where: key(ids.debtId) }) : null,
    ids.categoryId ? db.category.findUnique({ where: key(ids.categoryId) }) : null,
    ids.goalId ? db.goal.findUnique({ where: key(ids.goalId) }) : null,
    ids.companionId ? db.companion.findUnique({ where: key(ids.companionId) }) : null,
  ]);
```

6. Después de `checkActive('debtId', …)`, agregar:

```ts
  // Spec con quién §2.3: al editar se conserva la opción que el gasto ya tenía, aunque esté eliminada.
  checkActive('companionId', companion, 'Opción no encontrada', 'La opción fue eliminada');
```

7. El `return` final pasa a `return { account, toAccount, card, debt, category, goal, companion };`.

En `apps/api/src/modules/transactions/service.ts`:

1. En `rowData`, caso `'EXPENSE'`, agregar `companionId: input.companionId ?? null,` después de `paymentMethod`; caso `'CARD_PURCHASE'`, agregar `companionId: input.companionId ?? null,` después de `installments`.
2. En `NO_REFS`, agregar `companionId: null,` después de `paymentMethod: null,` (así `fullRowData` la borra en cualquier otro tipo).

`changesMoney` **no** cambia: la compañía es un dato descriptivo (spec con quién §2.3).

En `apps/api/src/modules/transactions/mapper.ts`:

1. En `transactionInclude`, después de `category: { select: categoryRefSelect },`, agregar `companion: { select: refSelect },`.
2. En `toTransactionDTO`, después de `category: row.category,`, agregar `companion: row.companion,`.

En `apps/api/src/modules/transactions/list.ts`, después de `if (q.debtId) where.debtId = q.debtId;`, agregar:

```ts
  if (q.companionId === 'none') {
    // Igual que "Sin indicar" en el reporte: gastos (intereses incluidos) sin compañía.
    and.push({ companionId: null, type: { in: ['EXPENSE', 'CARD_PURCHASE'] } });
  } else if (q.companionId) {
    where.companionId = q.companionId;
  }
```

- [ ] **Step 5: Seed de demostración**

En `apps/api/prisma/seed-demo.ts`:

1. Importar `import { listCompanions } from '../src/modules/companions/service';`.
2. Después de `const cat = (…) => …;`, agregar:

```ts
  const companions = await listCompanions(prisma, user.id);
  const who = (name: string) => companions.find((c) => c.name === name)!.id;
```

3. En el gasto "Cine" (`description: 'Cine'`), agregar `companionId: who('Pareja'),`.
4. En `groceries` (el objeto con `description: 'Mercado'`), agregar `companionId: who('Familia'),`.
5. En el gasto de almuerzo/transporte del ciclo `for (let d = 2, i = 0; …)`, agregar después de `description: …`:

```ts
        ...(isLunch && { companionId: who(i % 4 === 0 ? 'Amigos' : 'Solo') }),
```

En `apps/api/test/seed.test.ts`, en el primer test que llama `seedDemo` y obtiene `userId`, agregar al final:

```ts
    expect(
      await app.prisma.transaction.count({ where: { userId, companionId: { not: null } } }),
    ).toBeGreaterThan(0);
```

- [ ] **Step 6: Fixtures tipados de la web**

`TransactionDTO` ahora exige `companion`. Agregar `companion: null,` después de `category: …,` en el objeto `base: TransactionDTO` de `apps/web/src/features/transactions/TransactionRow.test.tsx` y en `disbursement: TransactionDTO` de `apps/web/src/features/transactions/TransactionDetailSheet.test.tsx`. Si `npm run typecheck` señala otro objeto tipado como `TransactionDTO`, agregar lo mismo (los que usan `as unknown as TransactionDTO` no lo necesitan).

- [ ] **Step 7: Correr los tests y verificar**

Run: `npm test -w @finanzas/api`
Expected: PASS (toda la API, incluidos `transactions-companion`, `seed` y los tests anteriores de movimientos).
Run: `npm test -w @finanzas/shared` y `npm test -w @finanzas/web`
Expected: PASS.
Run (raíz): `npm run typecheck` y `npm run format:check`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src apps/api/src apps/api/prisma/seed-demo.ts apps/api/test/seed.test.ts apps/api/test/transactions-companion.test.ts apps/web/src/features/transactions/TransactionRow.test.tsx apps/web/src/features/transactions/TransactionDetailSheet.test.tsx
git commit -m "feat: guarda con quién se hizo cada gasto y permite filtrar los movimientos por eso"
```

---

### Task 4: Reporte por compañía

**Files:**
- Modify: `packages/shared/src/dto.ts` (`ReportDTO`)
- Modify: `packages/shared/src/reports.ts` (`groupCompanionSeries`)
- Test: `packages/shared/src/reports.test.ts`
- Modify: `apps/api/src/domain/report.ts`
- Test: `apps/api/src/domain/report.test.ts`
- Modify: `apps/api/src/modules/reports/service.ts` (`loadReportData`)
- Modify: `apps/api/src/modules/reports/export/xlsx.test.ts` (fixture tipado)
- Modify: `apps/web/src/test/reportFixture.ts` (fixture tipado)
- Test: `apps/api/test/companions-report.test.ts`

**Interfaces:**
- Consumes: `CompanionRefDTO` (Tarea 2), `Transaction.companionId` (Tarea 1).
- Produces:
  - `ReportDTO.expenseByCompanion: Array<{ companion: CompanionRefDTO | null; amount: number; share: number }>`.
  - `ReportDTO.companionMonths: Array<{ month: string; items: Array<{ companionId: string | null; amount: number }> }>`.
  - `ReportEntry.companionId: string | null` y `ReportInput.companions: Map<string, CompanionRefDTO>`.
  - `groupCompanionSeries(rows, months, n = 5): CompanionSeriesResult`, con `interface CompanionSeries { key: string; companion: CompanionRefDTO | null; amount: number; share: number }` y `interface CompanionSeriesResult { series: CompanionSeries[]; months: Array<{ month: string; values: Record<string, number> }> }`. Las claves son `companion.id`, `'other'` u `'none'`.
  - `apps/web/src/test/reportFixture.ts` exporta `companionRef(id, name, isActive = true)`. `makeReport()` trae Amigos $900.000 (0,4186), Pareja $500.000 (0,2326), Familia (eliminada) $250.000 (0,1163) y Sin indicar $500.000 (0,2326). `makeEmptyReport()` trae `expenseByCompanion: []` y `companionMonths: [{ month: '2026-10', items: [] }]`.

- [ ] **Step 1: Tests de `groupCompanionSeries` (fallan)**

Al final de `packages/shared/src/reports.test.ts` (agregar `groupCompanionSeries` al import de `./reports` y `import type { ReportDTO } from './dto';`):

```ts
describe('groupCompanionSeries (spec con quién §4.2)', () => {
  const ref = (id: string, name: string) => ({
    id,
    name,
    icon: 'users',
    color: '#c2410c',
    isActive: true,
  });
  type Rows = ReportDTO['expenseByCompanion'];

  it('keeps five options, adds the rest in "Otros" and "Sin indicar" last, per month too', () => {
    const rows: Rows = [
      { companion: ref('a', 'Amigos'), amount: 600, share: 0.3 },
      { companion: ref('b', 'Bea'), amount: 400, share: 0.2 },
      { companion: ref('c', 'Carlos'), amount: 300, share: 0.15 },
      { companion: ref('d', 'Dani'), amount: 200, share: 0.1 },
      { companion: ref('e', 'Eva'), amount: 100, share: 0.05 },
      { companion: ref('f', 'Fede'), amount: 60, share: 0.03 },
      { companion: ref('g', 'Gabi'), amount: 40, share: 0.02 },
      { companion: null, amount: 300, share: 0.15 },
    ];
    const months: ReportDTO['companionMonths'] = [
      {
        month: '2026-09',
        items: [
          { companionId: 'a', amount: 600 },
          { companionId: 'f', amount: 60 },
          { companionId: null, amount: 100 },
        ],
      },
      {
        month: '2026-10',
        items: [
          { companionId: 'b', amount: 400 },
          { companionId: 'c', amount: 300 },
          { companionId: 'd', amount: 200 },
          { companionId: 'e', amount: 100 },
          { companionId: 'g', amount: 40 },
          { companionId: null, amount: 200 },
        ],
      },
    ];
    const result = groupCompanionSeries(rows, months);
    expect(result.series.map((s) => [s.key, s.amount, s.share])).toEqual([
      ['a', 600, 0.3],
      ['b', 400, 0.2],
      ['c', 300, 0.15],
      ['d', 200, 0.1],
      ['e', 100, 0.05],
      ['other', 100, 0.05],
      ['none', 300, 0.15],
    ]);
    expect(result.series.find((s) => s.key === 'other')?.companion).toBeNull();
    expect(result.months).toEqual([
      { month: '2026-09', values: { a: 600, b: 0, c: 0, d: 0, e: 0, other: 60, none: 100 } },
      { month: '2026-10', values: { a: 0, b: 400, c: 300, d: 200, e: 100, other: 40, none: 200 } },
    ]);
  });

  it('sorts by amount and then by name, without "Otros" when nothing is left over', () => {
    const rows: Rows = [
      { companion: null, amount: 900, share: 0.6 },
      { companion: ref('z', 'Zoe'), amount: 300, share: 0.2 },
      { companion: ref('m', 'Mamá'), amount: 300, share: 0.2 },
    ];
    const result = groupCompanionSeries(rows, [{ month: '2026-10', items: [] }]);
    expect(result.series.map((s) => s.key)).toEqual(['m', 'z', 'none']);
    expect(result.months).toEqual([{ month: '2026-10', values: { m: 0, z: 0, none: 0 } }]);
  });

  it('returns no series for a period without spending', () => {
    expect(groupCompanionSeries([], [{ month: '2026-10', items: [] }])).toEqual({
      series: [],
      months: [{ month: '2026-10', values: {} }],
    });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm test -w @finanzas/shared -- src/reports.test.ts`
Expected: FAIL (`groupCompanionSeries` no existe).

- [ ] **Step 3: `ReportDTO` y `groupCompanionSeries`**

En `packages/shared/src/dto.ts`, dentro de `interface ReportDTO`, después de `paymentMethods: …;`, agregar:

```ts
  /** Spec con quién §4.1: gastos por compañía; `companion` null = "Sin indicar" (siempre al final). Σ amount = totals.expense. */
  expenseByCompanion: Array<{ companion: CompanionRefDTO | null; amount: number; share: number }>;
  /** Por cada mes de `period.months`, los gastos de ese mes por compañía (recortados al periodo). */
  companionMonths: Array<{
    month: string;
    items: Array<{ companionId: string | null; amount: number }>;
  }>;
```

Al final de `packages/shared/src/reports.ts` (agregar `import type { CompanionRefDTO, ReportDTO } from './dto';` arriba):

```ts
/** Una serie de la gráfica "Con quién gastas, mes a mes": una compañía, `'other'` u `'none'`. */
export interface CompanionSeries {
  key: string;
  companion: CompanionRefDTO | null;
  amount: number;
  share: number;
}

export interface CompanionSeriesResult {
  series: CompanionSeries[];
  months: Array<{ month: string; values: Record<string, number> }>;
}

/**
 * Spec con quién §4.2: las `n` compañías con más gasto del periodo, "Otros" (el resto, si suma más
 * de 0) y "Sin indicar" (si suma más de 0), y el valor de cada serie en cada mes.
 */
export function groupCompanionSeries(
  rows: ReportDTO['expenseByCompanion'],
  months: ReportDTO['companionMonths'],
  n = 5,
): CompanionSeriesResult {
  const named = rows
    .filter((r): r is typeof r & { companion: CompanionRefDTO } => r.companion !== null)
    .sort(
      (a, b) => b.amount - a.amount || a.companion.name.localeCompare(b.companion.name, 'es'),
    );
  const top = named.slice(0, n);
  const rest = named.slice(n);
  const none = rows.find((r) => r.companion === null);
  const otherAmount = rest.reduce((s, r) => s + r.amount, 0);
  const series: CompanionSeries[] = top.map((r) => ({
    key: r.companion.id,
    companion: r.companion,
    amount: r.amount,
    share: r.share,
  }));
  if (otherAmount > 0) {
    series.push({
      key: 'other',
      companion: null,
      amount: otherAmount,
      share: roundShare(rest.reduce((s, r) => s + r.share, 0)),
    });
  }
  if (none && none.amount > 0) {
    series.push({ key: 'none', companion: null, amount: none.amount, share: none.share });
  }
  const topIds = new Set(top.map((r) => r.companion.id));
  return {
    series,
    months: months.map((m) => {
      const values: Record<string, number> = Object.fromEntries(series.map((s) => [s.key, 0]));
      for (const item of m.items) {
        const key =
          item.companionId === null ? 'none' : topIds.has(item.companionId) ? item.companionId : 'other';
        values[key] = (values[key] ?? 0) + item.amount;
      }
      return { month: m.month, values };
    }),
  };
}
```

- [ ] **Step 4: Correr los tests de shared**

Run: `npm test -w @finanzas/shared -- src/reports.test.ts`
Expected: PASS.

- [ ] **Step 5: Tests del dominio (fallan)**

En `apps/api/src/domain/report.test.ts`:

1. Debajo de `const cat = …`, agregar:

```ts
const companionRef = (id: string, name: string, isActive = true): RefDTO => ({
  id,
  name,
  icon: 'users',
  color: '#c2410c',
  isActive,
});
const COMPANIONS = [
  companionRef('friends', 'Amigos'),
  companionRef('partner', 'Pareja', false),
  companionRef('family', 'Familia'),
];
const who = (id: string) => COMPANIONS.find((c) => c.id === id)!;
```

2. En `interface EntryInput`, agregar `companionId?: string;`; en `entry(…)`, agregar `companionId: refs.companionId ?? null,` después de `paymentMethod`.
3. En `sample()`, agregar `companions: new Map(COMPANIONS.map((c) => [c.id, c])),` después de `categories: …,` y agregar `companionId` a estas entradas (sin cambiar nada más):
   - `entry('2026-08-10', 'EXPENSE', 30_000, { accountId: 'cash', categoryId: 'food', companionId: 'friends' })` (antes del periodo: no cuenta)
   - la de `2026-08-25` (100.000): `companionId: 'friends'`
   - la `CARD_PURCHASE` de `2026-09-05` (600.000): `companionId: 'partner'`
   - la de `2026-09-20` (20.000): `companionId: 'friends'`
   - la de `2026-10-05` (80.000): `companionId: 'family'`
   - los intereses (`2026-09-15`, 50.000) y el ajuste (`2026-09-25`, 10.000) quedan sin compañía.
4. Agregar al final:

```ts
describe('buildReport — who (spec con quién §4.1)', () => {
  it('adds up spending by who exactly to the expense total, per month too', () => {
    const report = buildReport(sample());
    expect(report.expenseByCompanion).toEqual([
      { companion: who('partner'), amount: 600_000, share: 0.6977 },
      { companion: who('friends'), amount: 120_000, share: 0.1395 },
      { companion: who('family'), amount: 80_000, share: 0.093 },
      { companion: null, amount: 60_000, share: 0.0698 },
    ]);
    const total = report.expenseByCompanion.reduce((s, r) => s + r.amount, 0);
    expect(total).toBe(report.totals.expense);
    expect(report.companionMonths).toEqual([
      { month: '2026-08', items: [{ companionId: 'friends', amount: 100_000 }] },
      {
        month: '2026-09',
        items: [
          { companionId: 'partner', amount: 600_000 },
          { companionId: 'friends', amount: 20_000 },
          { companionId: null, amount: 60_000 },
        ],
      },
      { month: '2026-10', items: [{ companionId: 'family', amount: 80_000 }] },
    ]);
    report.companionMonths.forEach((m, i) => {
      expect(m.items.reduce((s, it) => s + it.amount, 0)).toBe(report.months[i]!.expense);
    });
  });

  it('breaks ties by name and counts an unknown option as "Sin indicar"', () => {
    const input = sample();
    input.entries = [
      entry('2026-10-01', 'EXPENSE', 5_000, { accountId: 'bank', categoryId: 'food', companionId: 'friends' }),
      entry('2026-10-02', 'EXPENSE', 5_000, { accountId: 'bank', categoryId: 'food', companionId: 'family' }),
      entry('2026-10-03', 'EXPENSE', 7_000, { accountId: 'bank', categoryId: 'food', companionId: 'ghost' }),
    ];
    const report = buildReport(input);
    expect(report.expenseByCompanion.map((r) => [r.companion?.name ?? null, r.amount])).toEqual([
      ['Amigos', 5_000],
      ['Familia', 5_000],
      [null, 7_000],
    ]);
  });

  it('returns no rows when there is no spending', () => {
    const input = sample();
    input.entries = [entry('2026-10-01', 'INCOME', 5_000, { accountId: 'bank', categoryId: 'salary' })];
    const report = buildReport(input);
    expect(report.expenseByCompanion).toEqual([]);
    expect(report.companionMonths.map((m) => m.items)).toEqual([[], [], []]);
  });
});
```

Run: `npm test -w @finanzas/api -- src/domain/report.test.ts`
Expected: FAIL (`expenseByCompanion` indefinido).

- [ ] **Step 6: Dominio**

En `apps/api/src/domain/report.ts`:

1. Agregar `type CompanionRefDTO,` al import de `@finanzas/shared`.
2. En `interface ReportEntry`, agregar `companionId: string | null;`.
3. En `interface ReportInput`, después de `categories`, agregar:

```ts
  /** Todas las opciones de "con quién" del usuario, activas o eliminadas, por id. */
  companions: Map<string, CompanionRefDTO>;
```

4. Agregar, antes de `buildReport`:

```ts
/** Mes calendario recortado al periodo. */
function monthRange(month: string, period: ReportPeriod): [IsoDate, IsoDate] {
  const start = monthStartFromKey(month);
  const end = endOfMonth(start);
  return [start > period.from ? start : period.from, end < period.to ? end : period.to];
}

/**
 * Spec con quién §4.1: gastos (`EXPENSE` + `CARD_PURCHASE`) por compañía; sin compañía (o con una
 * desconocida) van a "Sin indicar", así Σ = gastos. Por valor y nombre; "Sin indicar" al final.
 */
function byCompanion(
  entries: ReportEntry[],
  companions: Map<string, CompanionRefDTO>,
): ReportDTO['expenseByCompanion'] {
  const sums = new Map<string, number>();
  let none = 0;
  for (const e of entries) {
    if (!isSpending(e)) continue;
    if (e.companionId && companions.has(e.companionId)) addTo(sums, e.companionId, e.amount);
    else none += e.amount;
  }
  const total = sum([...sums.values()]) + none;
  const rows: ReportDTO['expenseByCompanion'] = [...sums]
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => ({
      companion: companions.get(id)!,
      amount,
      share: roundShare(amount / total),
    }))
    .sort(
      (a, b) =>
        b.amount - a.amount || a.companion!.name.localeCompare(b.companion!.name, 'es'),
    );
  if (none > 0) rows.push({ companion: null, amount: none, share: roundShare(none / total) });
  return rows;
}
```

5. En `buildReport`, después de `paymentMethods: byMethod(inPeriod, accountTypes),`, agregar `expenseByCompanion: byCompanion(inPeriod, input.companions),`. Reemplazar el `months: period.months.map(…)` por:

```ts
    months: period.months.map((month) => {
      const [from, to] = monthRange(month, period);
      return {
        month,
        ...monthFlows(between(input.entries, from, to), accountTypes),
        closing: closingAt(input, to),
      };
    }),
    companionMonths: period.months.map((month) => {
      const [from, to] = monthRange(month, period);
      return {
        month,
        items: byCompanion(between(input.entries, from, to), input.companions).map((r) => ({
          companionId: r.companion?.id ?? null,
          amount: r.amount,
        })),
      };
    }),
```

Run: `npm test -w @finanzas/api -- src/domain/report.test.ts`
Expected: PASS.

- [ ] **Step 7: Servicio**

En `apps/api/src/modules/reports/service.ts`:

1. En `interface GroupRow`, agregar `companionId?: string | null;`; en `entryOf`, agregar `companionId: r.companionId ?? null,`.
2. En `loadReportData`, después de `const categories = …`, agregar:

```ts
  const companions = await db.companion.findMany({ where: { userId }, select: refSelect });
```

3. En el `groupBy`, agregar `'companionId',` a `by` (después de `'paymentMethod'`).
4. En el `return`: agregar `companions: new Map(companions.map((c) => [c.id, c])),` después de `categories`, y en el `map` de `before` agregar `companionId: null` (queda `({ ...e, date: dayBefore, categoryId: null, paymentMethod: null, companionId: null })`).

- [ ] **Step 8: Fixtures tipados**

En `apps/api/src/modules/reports/export/xlsx.test.ts`, en el objeto `report`, agregar `expenseByCompanion: [],` y `companionMonths: [],` después de `paymentMethods: [],`.

En `apps/web/src/test/reportFixture.ts`:

1. Agregar `CompanionRefDTO` al import de tipos y, debajo de `accountRef`, exportar:

```ts
export const companionRef = (id: string, name: string, isActive = true): CompanionRefDTO => ({
  id,
  name,
  icon: 'users',
  color: '#c2410c',
  isActive,
});
```

2. En `makeReport`, después de `paymentMethods: […],`, agregar:

```ts
    expenseByCompanion: [
      { companion: companionRef('p-friends', 'Amigos'), amount: 900_000, share: 0.4186 },
      { companion: companionRef('p-partner', 'Pareja'), amount: 500_000, share: 0.2326 },
      { companion: companionRef('p-family', 'Familia', false), amount: 250_000, share: 0.1163 },
      { companion: null, amount: 500_000, share: 0.2326 },
    ],
    companionMonths: [
      {
        month: '2026-10',
        items: [
          { companionId: 'p-friends', amount: 900_000 },
          { companionId: 'p-partner', amount: 500_000 },
          { companionId: 'p-family', amount: 250_000 },
          { companionId: null, amount: 500_000 },
        ],
      },
    ],
```

3. En `makeEmptyReport`, después de `paymentMethods: [],`, agregar `expenseByCompanion: [],` y `companionMonths: [{ month: '2026-10', items: [] }],`.

- [ ] **Step 9: Test de integración (falla antes del Step 7, pasa después)**

Crear `apps/api/test/companions-report.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { CompanionDTO, ReportDTO } from '@finanzas/shared';
import { setupFinances } from './finance-fixtures';
import { createTestApp, registerUser, type Client } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

/**
 * Octubre (hasta el 20): Amigos $150.000, Pareja $1.200.000 (tarjeta), sin compañía $30.000,
 * intereses $50.000 y un ajuste de $10.000. En septiembre, Amigos $70.000 (no cuenta en "Este mes").
 */
async function userWithWho() {
  const reg = await registerUser(app);
  const { api } = reg;
  const f = await setupFinances(api);
  const options = (await api.get<{ items: CompanionDTO[] }>('/api/companions')).body.items;
  const who = (name: string) => options.find((c) => c.name === name)!.id;
  const post = async (path: string, body: unknown) => {
    const res = await api.post(path, body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  };
  const expense = { type: 'EXPENSE', accountId: f.bank, categoryId: f.cat.food };
  await post('/api/transactions', { ...expense, amount: 70_000, date: '2026-09-28', companionId: who('Amigos') });
  await post('/api/transactions', { ...expense, amount: 150_000, date: '2026-10-05', companionId: who('Amigos'), description: 'Asado' });
  await post(`/api/credit-cards/${f.card}/purchase`, {
    amount: 1_200_000,
    date: '2026-10-06',
    categoryId: f.cat.fun,
    installments: 12,
    companionId: who('Pareja'),
  });
  await post('/api/transactions', { ...expense, amount: 30_000, date: '2026-10-07' });
  await post('/api/transactions', {
    type: 'DEBT_PAYMENT',
    amount: 400_000,
    interest: 50_000,
    date: '2026-10-08',
    accountId: f.bank,
    debtId: f.debt,
  });
  const adjust = await api.post(`/api/accounts/${f.cash}/adjust`, {
    actualBalance: 90_000,
    date: '2026-10-09',
  });
  expect(adjust.status, JSON.stringify(adjust.body)).toBe(201);
  return { ...reg, f, who };
}

const report = async (api: Client, query = 'preset=THIS_MONTH') => {
  const res = await api.get<ReportDTO>(`/api/reports?${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
};

describe('GET /api/reports — who (spec con quién §4.1)', () => {
  it('adds up spending by who exactly to the expense total, with interest and adjustments as Sin indicar', async () => {
    const { api } = await userWithWho();
    const r = await report(api);
    expect(r.expenseByCompanion.map((row) => [row.companion?.name ?? null, row.amount])).toEqual([
      ['Pareja', 1_200_000],
      ['Amigos', 150_000],
      [null, 90_000],
    ]);
    expect(r.expenseByCompanion.reduce((s, row) => s + row.amount, 0)).toBe(r.totals.expense);
    expect(r.totals.expense).toBe(1_440_000);
    expect(r.companionMonths).toHaveLength(1);
    expect(r.companionMonths[0]!.items.reduce((s, i) => s + i.amount, 0)).toBe(r.months[0]!.expense);
  });

  it('spans months for a longer period', async () => {
    const { api, who } = await userWithWho();
    const r = await report(api, 'from=2026-09-01&to=2026-10-20');
    expect(r.companionMonths.map((m) => m.month)).toEqual(['2026-09', '2026-10']);
    expect(r.companionMonths[0]!.items).toEqual([{ companionId: who('Amigos'), amount: 70_000 }]);
    expect(r.expenseByCompanion.find((row) => row.companion?.name === 'Amigos')?.amount).toBe(220_000);
  });

  it('marks a deleted option and never mixes users', async () => {
    const { api, who } = await userWithWho();
    expect((await api.del(`/api/companions/${who('Pareja')}`)).body).toEqual({ deleted: 'soft' });
    const r = await report(api);
    expect(r.expenseByCompanion[0]!.companion).toMatchObject({ name: 'Pareja', isActive: false });
    const other = await registerUser(app);
    const theirs = await report(other.api);
    expect(theirs.expenseByCompanion).toEqual([]);
    expect(theirs.companionMonths).toEqual([{ month: '2026-10', items: [] }]);
  });
});
```


- [ ] **Step 10: Correr todo y verificar**

Run: `npm test -w @finanzas/api` y `npm test -w @finanzas/shared` y `npm test -w @finanzas/web`
Expected: PASS.
Run (raíz): `npm run typecheck` y `npm run format:check`
Expected: sin errores.

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src apps/api/src apps/api/test/companions-report.test.ts apps/web/src/test/reportFixture.ts
git commit -m "feat: agrega al reporte los gastos por compañía, en total y mes a mes"
```

---

### Task 5: Exportación con "Con quién"

**Files:**
- Modify: `apps/api/src/modules/reports/export/rows.ts`
- Modify: `apps/api/src/modules/reports/export/csv.ts`
- Modify: `apps/api/src/modules/reports/export/xlsx.ts`
- Modify: `apps/api/src/modules/reports/service.ts` (`exportSelect`)
- Test: `apps/api/src/modules/reports/export/rows.test.ts`, `csv.test.ts`, `xlsx.test.ts`, `apps/api/test/reports-export.test.ts` (actualizar columnas), `apps/api/test/companions-report.test.ts` (exportación)

**Interfaces:**
- Consumes: `ReportBody.expenseByCompanion` (Tarea 4), `Transaction.companion` (Tarea 1).
- Produces:
  - `EXPORT_COLUMNS` con `'Con quién'` en la posición 6 (después de `'Subcategoría'`; ahora son 15 columnas).
  - `ExportTransaction.companion: { name: string } | null` y `ExportRow.companion: string`.
  - Hoja de Excel `'Por compañía'` entre `'Por categoría'` y `'Por cuenta'`.

- [ ] **Step 1: Tests (fallan)**

1. `apps/api/src/modules/reports/export/rows.test.ts`: en `lunch`, agregar `companion: { name: 'Amigos' },` después de `category`; en el `toEqual` del primer test, agregar `companion: 'Amigos',` después de `subcategory`. Agregar el test:

```ts
  it('leaves who empty when the movement has none', () => {
    expect(toExportRow({ ...lunch, companion: null }).companion).toBe('');
  });
```

2. `csv.test.ts`:
   - En `HEADER`, insertar `Con quién;` después de `Subcategoría;`.
   - En `row`, agregar `companion: '=Amigos',` después de `subcategory`.
   - En el test "writes the BOM, the header, ; separators and CRLF line ends", la línea esperada pasa a:

```ts
        '2026-10-07;Gasto;"Almuerzo; ""especial""";Alimentación;Restaurantes;' +
        "'=Amigos;Bancolombia;;;;;Tarjeta débito;45000;comida, trabajo;'=1+1\r\n",
```

   - En "writes the installments of a card purchase as a number", el índice `[9]` pasa a `[10]`.

3. `xlsx.test.ts`:
   - En `rows[0]`, agregar `companion: 'Amigos',` después de `subcategory`.
   - En `report`, reemplazar `expenseByCompanion: []` por:

```ts
  expenseByCompanion: [
    {
      companion: { id: 'p', name: 'Pareja', icon: 'heart', color: '#be185d', isActive: false },
      amount: 1_200_000,
      share: 0.9057,
    },
    { companion: null, amount: 125_000, share: 0.0943 },
  ],
```

   - En el test de las hojas: la lista pasa a `['Resumen', 'Movimientos', 'Por categoría', 'Por compañía', 'Por cuenta']`; el encabezado de Movimientos inserta `'Con quién'` después de `'Subcategoría'`; `autoFilter` pasa a `'A1:O1'`; las celdas `getCell(12)` (Valor) pasan a `getCell(13)` y `getCell(14)` (Notas) a `getCell(15)`; agregar `expect(data.getCell(6).value).toBe('Amigos');`. Agregar:

```ts
    const byCompanion = wb.getWorksheet('Por compañía')!;
    expect(values(byCompanion, 1)).toEqual(['Con quién', 'Valor', 'Porcentaje']);
    expect(values(byCompanion, 2)).toEqual(['Pareja', 1_200_000, 0.9057]);
    expect(values(byCompanion, 3)).toEqual(['Sin indicar', 125_000, 0.0943]);
    expect(byCompanion.getCell('B2').numFmt).toBe('"$"#,##0');
    expect(byCompanion.getCell('C2').numFmt).toBe('0.0%');
```

4. `apps/api/test/reports-export.test.ts`: en `HEADER`, insertar `'Con quién'` después de `'Subcategoría'`; en cada fila esperada del CSV, insertar `''` después del valor de Subcategoría (posición 5, base 0); en el test de Excel, la lista de hojas incluye `'Por compañía'` después de `'Por categoría'`, `autoFilter` pasa a `'A1:O1'` y los índices de celda de Movimientos mayores o iguales a 6 suben uno (`getCell(10)` → `getCell(11)`, `getCell(12)` → `getCell(13)`, `getCell(14)` → `getCell(15)`).

5. Al final de `apps/api/test/companions-report.test.ts` (agregar `import ExcelJS from 'exceljs';` y `SESSION_COOKIE` al import de `./helpers`):

```ts
describe('GET /api/reports/export — who (spec con quién §4.4)', () => {
  const download = (cookie: string, query: string) =>
    app.inject({
      method: 'GET',
      url: `/api/reports/export?${query}`,
      cookies: { [SESSION_COOKIE]: cookie },
    });

  it('writes the "Con quién" column and the "Por compañía" sheet', async () => {
    const { cookie } = await userWithWho();
    const csv = await download(cookie, 'preset=THIS_MONTH&format=csv');
    expect(csv.statusCode).toBe(200);
    const lines = csv.body.slice(1).split('\r\n');
    expect(lines[0]!.split(';').slice(4, 7)).toEqual(['Subcategoría', 'Con quién', 'Cuenta']);
    const asado = lines.find((l) => l.includes(';Asado;'))!;
    expect(asado.split(';')[5]).toBe('Amigos');

    const xlsx = await download(cookie, 'preset=THIS_MONTH&format=xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(xlsx.rawPayload).buffer);
    const sheet = wb.getWorksheet('Por compañía')!;
    const rows = [2, 3, 4].map((n) => (sheet.getRow(n).values as unknown[]).slice(1));
    expect(rows).toEqual([
      ['Pareja', 1_200_000, 0.8333],
      ['Amigos', 150_000, 0.1042],
      ['Sin indicar', 90_000, 0.0625],
    ]);
  });
});
```

Run: `npm test -w @finanzas/api -- src/modules/reports test/reports-export.test.ts test/companions-report.test.ts`
Expected: FAIL (falta la columna y la hoja).

- [ ] **Step 2: Filas, CSV y Excel**

En `apps/api/src/modules/reports/export/rows.ts`:

1. En `EXPORT_COLUMNS`, insertar `'Con quién',` después de `'Subcategoría',`.
2. En `ExportTransaction`, agregar `companion: { name: string } | null;` después de `category`.
3. En `ExportRow`, agregar `companion: string;` después de `subcategory`.
4. En `toExportRow`, agregar `companion: t.companion?.name ?? '',` después de `subcategory`.

En `apps/api/src/modules/reports/export/csv.ts`, en `toCsv`, insertar `r.companion,` después de `r.subcategory,`.

En `apps/api/src/modules/reports/export/xlsx.ts`:

1. `COLUMN_WIDTHS` pasa a `[12, 18, 32, 20, 20, 18, 20, 20, 18, 18, 8, 18, 14, 24, 32]`.
2. Actualizar el comentario de `toXlsx` a `/** Spec Fase 3 §4 y con quién §4.4: Resumen, Movimientos, Por categoría, Por compañía y Por cuenta. */`.
3. En la fila de Movimientos, insertar `text(r.companion),` después de `text(r.subcategory),` y cambiar `row.getCell(12).numFmt = MONEY;` por `row.getCell(13).numFmt = MONEY;`.
4. Después del bloque de `'Por categoría'` (antes de `const byAccount = …`), agregar:

```ts
  const byCompanion = wb.addWorksheet('Por compañía');
  byCompanion.columns = ['Con quién', 'Valor', 'Porcentaje'].map((header, i) => ({
    header,
    width: [28, 16, 12][i],
  }));
  byCompanion.getRow(1).font = { bold: true };
  for (const item of report.expenseByCompanion) {
    const row = byCompanion.addRow([
      item.companion ? text(item.companion.name) : 'Sin indicar',
      item.amount,
      item.share,
    ]);
    row.getCell(2).numFmt = MONEY;
    row.getCell(3).numFmt = PERCENT;
  }
```

En `apps/api/src/modules/reports/service.ts`, en `exportSelect`, agregar `companion: { select: { name: true } },` después de `category: …,`.

- [ ] **Step 3: Correr todo y verificar**

Run: `npm test -w @finanzas/api`
Expected: PASS.
Run (raíz): `npm run typecheck` y `npm run format:check`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/reports apps/api/test/reports-export.test.ts apps/api/test/companions-report.test.ts
git commit -m "feat: agrega con quién a la exportación en CSV y en Excel"
```
