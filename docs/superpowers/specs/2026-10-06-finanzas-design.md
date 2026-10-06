# Finanzas — Documento de diseño

- **Fecha:** 2026-10-06
- **Estado:** diseño aprobado por secciones; pendiente de revisión final del documento
- **Repositorio:** https://github.com/Syztema/PersonalFinances.git

---

## 1. Objetivo

Aplicación web **funcional** (frontend, backend, base de datos, autenticación y CRUD completo) para controlar finanzas personales reales en **Colombia**, en **pesos colombianos (COP)**, usada principalmente desde el **celular**, multiusuario con aislamiento total y desplegable con **Dokploy**.

La aplicación es un asistente financiero personal basado exclusivamente en los datos del usuario. **No** se presenta como asesoría financiera profesional (aviso visible en el pie de la pantalla "Más" y en el desglose de "¿Cuánto puedo gastar hoy?").

Al abrirla, el usuario debe responder en segundos: ¿cuánto dinero tengo?, ¿dónde está?, ¿cuánto debo?, ¿cuánto gasté este mes y en qué?, ¿cumplo mi objetivo de ahorro?, ¿cuánto puedo gastar hoy?, ¿estoy gastando demasiado?, ¿cuánto debería ahorrar?, ¿cuánto debo pagar de mi tarjeta? Y registrar en menos de 10 segundos un ingreso, gasto, transferencia, compra con tarjeta o pago de tarjeta.

### Prioridades (en orden)

1. Correctitud financiera — nunca contar dos veces el mismo dinero.
2. Seguridad.
3. Aislamiento de usuarios.
4. Experiencia móvil.
5. Facilidad para registrar movimientos.
6. Dashboard útil.
7. Rendimiento.
8. Diseño.
9. Escalabilidad.

Ante un conflicto entre una interfaz bonita y un cálculo correcto, gana el cálculo correcto.

## 2. Alcance

### Incluido

Autenticación completa (registro, login, logout, recuperación y cambio de contraseña, sesión persistente y expiración); cuentas de dinero; tarjetas de crédito con cuotas; préstamos simples; movimientos de 7 tipos; categorías y subcategorías personalizables; etiquetas; historial con filtros y paginación; dashboard; "¿Cuánto puedo gastar hoy?"; disponible estimado; patrimonio neto; porcentajes objetivo; presupuestos mensuales general y por categoría; metas de ahorro; ingresos y gastos recurrentes; obligaciones; alertas e indicador de estado; ajuste de saldo; reportes con gráficos; exportación CSV y Excel; vista imprimible para PDF; PWA instalable; modo oscuro; seed de demostración; Docker, Docker Compose y Dokploy; backups.

### Fuera de alcance (decisión explícita)

- Finanzas compartidas entre usuarios (pareja, hogar).
- Multimoneda (solo COP).
- Conexión automática con bancos.
- Cálculo de intereses de tarjetas o préstamos (los cobros reales se registran a mano).
- Registro de movimientos sin conexión.
- Apps nativas.
- Seguimiento de precios de inversiones.
- Dinero que otros le deben al usuario.
- Importación CSV.
- Notificaciones push (las alertas son dentro de la app).
- Devoluciones de tarjeta como tipo propio (se edita o elimina la compra).
- Autenticación de dos factores.

## 3. Decisiones acordadas

| Tema | Decisión |
|---|---|
| Modelo de movimientos | Una tabla `Transaction` con tipo, verificaciones `CHECK` por tipo en Postgres y saldos siempre calculados (nunca almacenados). |
| Cuotas | Soportadas. El gasto se registra completo una sola vez en la fecha de compra; las cuotas solo estiman el pago mensual. Sin cálculo de intereses. |
| Préstamos | Versión simple: saldo, cuota, día de pago; pagos con parte de capital (no es gasto) y parte de intereses (sí es gasto); el desembolso entra como deuda, no como ingreso. |
| Ahorro del mes | Variación neta, por movimientos, del saldo de las cuentas tipo `SAVINGS` (igual para `INVESTMENT`). |
| Dos "disponibles" | **Disponible estimado** (dinero de hoy menos compromisos) y **Restante del mes** (ingresos − gastos − ahorro − inversión). |
| Categorías iniciales | No existe "Ahorro/Inversión" como gasto (ahorrar = transferir). "Deudas" se reemplaza por "Intereses y comisiones". |
| Sesiones | Token opaco en cookie HttpOnly, guardado como hash en base de datos (no JWT). |
| Despliegue | Un solo dominio: nginx (`web`) sirve la SPA y reenvía `/api` a la API (`api`); Postgres (`db`) y backups (`backup`) internos. |
| Registro | Se puede cerrar con `ALLOW_REGISTRATION=false`. |
| Recuperación de contraseña | SMTP configurable; sin SMTP, el enlace solo se escribe en logs en desarrollo. |
| Idioma y zona horaria | Interfaz en español de Colombia; código en inglés; todos los cálculos de "hoy" y "mes" en `America/Bogota`. |
| Quincenal | Frecuencia `SEMIMONTHLY`: dos días fijos al mes (por defecto 15 y último día), como se paga en Colombia; "cada 14 días" se expresa con `CUSTOM_DAYS` = 14. |

## 4. Arquitectura

```
Celular (navegador / PWA)
        │ HTTPS
        ▼
Traefik de Dokploy ── certificado Let's Encrypt
        │ finanzas.tudominio.com
        ▼
web    nginx: SPA estática + proxy de /api/*  ──┐
                                                │ red interna Docker
api    Fastify + Prisma  ◄──────────────────────┘
        │
        ▼
db     PostgreSQL 17 (volumen persistente, sin puerto público)
        ▲
backup pg_dump programado con rotación
```

- Mismo origen para SPA y API → cookies de primera parte, sin CORS en producción.
- La API es stateless salvo la base de datos (las sesiones viven en Postgres), por lo que puede escalar a varias réplicas si algún día hace falta.
- Toda la lógica financiera vive en funciones puras (`apps/api/src/domain`) sin acceso a red ni base de datos. Los módulos HTTP solo validan, autorizan, consultan y delegan en el dominio.

## 5. Stack

| Capa | Tecnología |
|---|---|
| Lenguaje | TypeScript (estricto) en todo el monorepo |
| Monorepo | npm workspaces: `apps/api`, `apps/web`, `packages/shared` |
| Frontend | React 19, Vite, Tailwind CSS v4, componentes estilo shadcn/ui (Radix), lucide-react |
| Estado de servidor | TanStack Query |
| Ruteo | React Router |
| Formularios | react-hook-form + Zod (esquemas de `packages/shared`) |
| Gráficos | Recharts, cargado de forma diferida |
| PWA | vite-plugin-pwa |
| Backend | Node.js 22, Fastify 5, validación Zod con type provider |
| ORM y base de datos | Prisma + PostgreSQL 17 |
| Contraseñas | Argon2id (`@node-rs/argon2`) |
| Correo | nodemailer (SMTP configurable) |
| Excel | exceljs |
| Tests | Vitest (dominio, API contra Postgres real, frontend con Testing Library); Playwright para la prueba de punta a punta |
| Calidad | ESLint (flat config), Prettier, `tsc --noEmit` |
| Infraestructura | Docker multi-stage, Docker Compose, Dokploy (Traefik) |

Las versiones exactas se fijan al instalar (última estable compatible con Node 22).

## 6. Estructura de carpetas

```
finanzas/
├─ apps/
│  ├─ api/
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  ├─ migrations/        incluye SQL manual para CHECK y FK compuestas
│  │  │  └─ seed.ts
│  │  ├─ src/
│  │  │  ├─ app.ts             construcción de la app Fastify (plugins + rutas)
│  │  │  ├─ server.ts          arranque
│  │  │  ├─ config/            variables de entorno validadas con Zod
│  │  │  ├─ plugins/           prisma, session, errors, rate-limit, security
│  │  │  ├─ lib/               fechas Bogotá, dinero, tokens, correo
│  │  │  ├─ domain/            reglas financieras puras
│  │  │  │  ├─ ledger.ts            efecto de cada tipo de movimiento
│  │  │  │  ├─ balances.ts          saldos, deudas, totales, patrimonio
│  │  │  │  ├─ card-billing.ts      cortes, cuotas, pago del mes, comprometido
│  │  │  │  ├─ loans.ts             cuota pendiente de préstamos
│  │  │  │  ├─ savings.ts           ahorro del mes, reservas, porcentajes
│  │  │  │  ├─ available.ts         disponible estimado
│  │  │  │  ├─ spending-power.ts    ¿cuánto puedo gastar hoy?
│  │  │  │  ├─ budgets.ts           uso y proyección
│  │  │  │  ├─ goals.ts             progreso y ahorro necesario
│  │  │  │  ├─ recurrence.ts        generación de fechas de recurrentes
│  │  │  │  └─ insights.ts          alertas, mensajes y estado general
│  │  │  └─ modules/           auth, me, accounts, credit-cards, debts,
│  │  │                        transactions, categories, tags, budgets, goals,
│  │  │                        recurring, scheduled, settings, alerts,
│  │  │                        dashboard, reports, health
│  │  │                        (cada uno: routes.ts + service.ts)
│  │  ├─ test/                 integración contra Postgres de pruebas
│  │  └─ Dockerfile
│  └─ web/
│     ├─ public/               íconos PWA
│     ├─ src/
│     │  ├─ app/               router, providers, layout con navegación
│     │  ├─ features/          auth, dashboard, transactions, quick-add,
│     │  │                     accounts, cards, debts, budgets, goals,
│     │  │                     recurring, reports, categories, settings
│     │  ├─ components/ui/     botones, sheets, inputs, tarjetas, etc.
│     │  └─ lib/               cliente API, formato COP, fechas
│     ├─ nginx.conf
│     └─ Dockerfile
├─ packages/shared/            esquemas Zod de entrada/salida, enums, formato COP,
│                              utilidades de fecha (Bogotá)
├─ docker/backup/              notas y script de restauración
├─ docs/superpowers/           specs y planes
├─ docker-compose.yml          producción (Dokploy)
├─ docker-compose.dev.yml      Postgres local (dev en 5432, test en 5433)
├─ .env.example
└─ README.md
```

## 7. Modelo de datos

### 7.1 Convenciones

- Identificadores UUID (generados por la base de datos).
- Todas las tablas de negocio llevan `userId`, `createdAt` (timestamptz) y `updatedAt`.
- Dinero: `bigint` en pesos enteros (`$1.500.000` → `1500000`). En TypeScript se convierte a `number` en la capa de acceso a datos (exacto hasta 9×10¹⁵). Rango válido por valor: 1 a 1.000.000.000.000.
- La fecha de un movimiento es `DATE` (fecha local de Bogotá). El instante exacto queda en `createdAt`.
- Días de mes 29–31 en meses más cortos se interpretan como el último día de ese mes (aplica a cortes, pagos y recurrentes).

### 7.2 Enums

| Enum | Valores |
|---|---|
| `AccountType` | `CASH`, `BANK`, `DIGITAL_WALLET`, `SAVINGS`, `INVESTMENT`, `OTHER` |
| `TransactionType` | `INCOME`, `EXPENSE`, `TRANSFER`, `CARD_PURCHASE`, `CARD_PAYMENT`, `DEBT_PAYMENT`, `DEBT_DISBURSEMENT` |
| `CategoryKind` | `INCOME`, `EXPENSE` |
| `Bucket` | `OBLIGATIONS`, `LEISURE`, `OTHER` (solo categorías de gasto) |
| `PaymentMethod` | `CASH`, `DEBIT_CARD`, `BANK_TRANSFER`, `DIGITAL_WALLET`, `OTHER` (sobrescritura opcional en gastos) |
| `Frequency` | `WEEKLY`, `SEMIMONTHLY`, `MONTHLY`, `YEARLY`, `CUSTOM_DAYS` |
| `ScheduledKind` | `INCOME`, `EXPENSE` |
| `ScheduledStatus` | `PENDING`, `DONE`, `SKIPPED` |
| `GoalStatus` | `ACTIVE`, `COMPLETED`, `ARCHIVED` |
| `Theme` | `SYSTEM`, `LIGHT`, `DARK` |

Cuentas **líquidas**: `CASH`, `BANK`, `DIGITAL_WALLET`, `OTHER`. Cuentas **reservadas**: `SAVINGS`, `INVESTMENT`.

### 7.3 Entidades

**User** — `id`, `name` (≤80), `email` (≤254, único, minúsculas), `passwordHash`, `theme` (default `SYSTEM`), `timezone` (default `America/Bogota`), `createdAt`, `updatedAt`.

**Session** — `id`, `userId` (cascade), `tokenHash` (SHA-256, único), `expiresAt`, `lastUsedAt`, `createdAt`.

**PasswordResetToken** — `id`, `userId` (cascade), `tokenHash` (único), `expiresAt`, `usedAt?`, `createdAt`.

**FinancialConfiguration** (1:1 con User, se crea en el registro) — `userId` (PK), `obligationsPct` (50), `savingsPct` (20), `investmentPct` (10), `leisurePct` (10), `otherPct` (10), `monthlyIncomeEstimate?`, `lowBalanceThreshold` (default 100.000). `CHECK`: cada % entre 0 y 100, suma = 100.

**Account** — `id`, `userId`, `name` (≤60), `type`, `institution?` (≤60), `initialBalance` (default 0, puede ser negativo), `openingDate` (default hoy), `icon`, `color` (`#RRGGBB`), `isActive`, `sortOrder`. Únicos: (`userId`, `name`), (`id`, `userId`).

**CreditCard** — `id`, `userId`, `name`, `issuer?`, `creditLimit` (>0), `initialDebt` (≥0, default 0), `initialDebtInstallments` (1–48, default 1), `openingDate`, `statementDay` (1–31), `paymentDueDay` (1–31), `icon`, `color`, `isActive`, `sortOrder`. Únicos: (`userId`, `name`), (`id`, `userId`).

**Debt** — `id`, `userId`, `name`, `lender?`, `initialBalance` (≥0), `openingDate`, `monthlyPayment?` (>0), `paymentDay?` (1–31), `icon`, `color`, `isActive`. Únicos: (`userId`, `name`), (`id`, `userId`).

**Category** — `id`, `userId`, `name` (≤40), `kind`, `parentId?` (un solo nivel; el padre debe tener `parentId` nulo y el mismo `kind`), `bucket?` (obligatorio si `kind = EXPENSE`, nulo si `INCOME`), `icon`, `color`, `isSystem` (no editable, oculta en selectores), `isActive`, `sortOrder`. Único: (`userId`, `kind`, `parentId`, `name`) con `NULLS NOT DISTINCT`; (`id`, `userId`).

**Tag** — `id`, `userId`, `name` (≤30, minúsculas), `createdAt`. Único (`userId`, `name`), (`id`, `userId`).

**TransactionTag** — `userId`, `transactionId`, `tagId`. PK (`transactionId`, `tagId`). FK compuestas a Transaction y Tag.

**Transaction** — `id`, `userId`, `type`, `amount`, `date`, `description?` (≤140), `payee?` (≤80: fuente del ingreso o comercio), `notes?` (≤500), `accountId?`, `toAccountId?`, `creditCardId?`, `debtId?`, `categoryId?`, `goalId?`, `installments?`, `paymentMethod?`, `parentId?` (cascade), `createdAt`, `updatedAt`.

**Budget** — `id`, `userId`, `month` (DATE, primer día del mes), `totalAmount?`. Único (`userId`, `month`).

**BudgetCategory** — `id`, `userId`, `budgetId` (cascade), `categoryId`, `amount` (>0). Único (`budgetId`, `categoryId`).

**Goal** — `id`, `userId`, `name`, `targetAmount` (>0), `targetDate?`, `accountId` (cuenta `SAVINGS` o `INVESTMENT` donde vive el dinero), `initialAmount` (≥0, default 0), `status`, `icon`, `color`.

**RecurringRule** — `id`, `userId`, `name` (≤60), `kind` (`INCOME`/`EXPENSE`), `amount`, `categoryId`, `accountId?`, `creditCardId?`, `frequency`, `intervalDays?` (solo `CUSTOM_DAYS`, ≥1), `day1?`/`day2?` (solo `SEMIMONTHLY`, default 15 y 31), `startDate`, `endDate?`, `isActive`. `CHECK`: `INCOME` exige `accountId` y prohíbe `creditCardId`; `EXPENSE` exige exactamente uno de `accountId`/`creditCardId`.

**ScheduledItem** — `id`, `userId`, `recurringRuleId?` (SetNull), `kind`, `name`, `amount`, `dueDate`, `categoryId`, `accountId?`, `creditCardId?`, `status`, `transactionId?` (único, SetNull). Único (`recurringRuleId`, `dueDate`). Mismo `CHECK` de cuenta/tarjeta que `RecurringRule`.

**DismissedAlert** — `id`, `userId`, `key` (≤120), `dismissedAt`. Único (`userId`, `key`).

### 7.4 Restricciones por tipo de movimiento (`CHECK` en Postgres)

| Tipo | `accountId` | `toAccountId` | `creditCardId` | `debtId` | `categoryId` | Otros permitidos |
|---|---|---|---|---|---|---|
| `INCOME` | requerido (recibe) | nulo | nulo | nulo | requerido (ingreso) | — |
| `EXPENSE` | requerido (paga) | nulo | nulo | nulo | requerido (gasto) | `paymentMethod`, `parentId` |
| `TRANSFER` | requerido (origen) | requerido, ≠ origen | nulo | nulo | nulo | `goalId` |
| `CARD_PURCHASE` | nulo | nulo | requerido | nulo | requerido (gasto) | `installments` 1–48 (requerido) |
| `CARD_PAYMENT` | requerido (paga) | nulo | requerido | nulo | nulo | — |
| `DEBT_PAYMENT` | requerido (paga) | nulo | nulo | requerido | nulo | — |
| `DEBT_DISBURSEMENT` | requerido (recibe) | nulo | nulo | requerido | nulo | — |

`goalId`, `paymentMethod`, `parentId` e `installments` son nulos en todo tipo no listado. El `kind` de la categoría (ingreso vs gasto) y que el padre de un gasto hijo sea un `DEBT_PAYMENT` se validan en el servicio dentro de la misma transacción de base de datos.

### 7.5 Aislamiento en la base de datos

Toda referencia entre tablas de negocio es una **FK compuesta** (`xId`, `userId`) → (`id`, `userId`). Postgres rechaza cualquier movimiento, presupuesto, meta o etiqueta que apunte a un registro de otro usuario, aunque el código tuviera un error. Además, cada consulta del servicio filtra por el `userId` de la sesión mediante funciones auxiliares que lo exigen como parámetro.

### 7.6 Índices

- `Transaction`: (`userId`, `date` DESC, `id` DESC); (`userId`, `accountId`); (`userId`, `toAccountId`); (`userId`, `creditCardId`, `date`); (`userId`, `debtId`); (`userId`, `categoryId`, `date`); (`userId`, `type`, `date`); (`parentId`); (`goalId`).
- `ScheduledItem`: (`userId`, `status`, `dueDate`).
- `Session`: `tokenHash` único; (`userId`).
- Las listas se paginan por cursor (`date`, `id`), 30 por página (máximo 100).

### 7.7 Categorías iniciales (se copian a cada usuario al registrarse)

**Gasto** (bolsa): Vivienda (obligaciones), Alimentación (obligaciones), Transporte (obligaciones), Servicios (obligaciones), Salud (obligaciones), Educación (obligaciones), Impuestos (obligaciones), Intereses y comisiones (obligaciones), Entretenimiento (entretenimiento), Suscripciones (entretenimiento), Compras (otros), Otros (otros), Ajuste de saldo (otros, sistema).

**Ingreso**: Salario, Freelance, Bonificación, Venta, Ingreso extra, Otros, Ajuste de saldo (sistema).

El usuario puede crear, renombrar, recolorear, reasignar bolsa, anidar y archivar categorías (excepto las de sistema).

## 8. Reglas financieras

Todas las fechas y periodos se evalúan en `America/Bogota`. "Mes" = mes calendario de la fecha del movimiento.

### 8.1 Efecto de cada tipo

| Tipo | Cuentas | Deuda | Gasto del mes | Ingreso del mes | Patrimonio |
|---|---|---|---|---|---|
| `INCOME` | + cuenta | — | — | + | + |
| `EXPENSE` | − cuenta | — | + | — | − |
| `TRANSFER` | − origen, + destino | — | — | — | = |
| `CARD_PURCHASE` | sin cambio | + tarjeta | + | — | − |
| `CARD_PAYMENT` | − cuenta | − tarjeta | — | — | = |
| `DEBT_PAYMENT` (capital) | − cuenta | − préstamo | — | — | = |
| `EXPENSE` hijo (intereses del préstamo) | − cuenta | — | + | — | − |
| `DEBT_DISBURSEMENT` | + cuenta | + préstamo | — | — (no es ingreso) | = |

**Caso de referencia (test obligatorio):** Bancolombia $2.000.000, Nu Crédito cupo $5.000.000 y deuda $0. Compra de $300.000 con Nu → Bancolombia $2.000.000, deuda Nu $300.000, gasto del mes $300.000, dinero total $2.000.000, deudas $300.000. Pago de $300.000 desde Bancolombia → Bancolombia $1.700.000, deuda Nu $0, **gasto del mes $300.000** (no $600.000).

### 8.2 Saldos y métricas

- `saldo(cuenta)` = `initialBalance` + Σ ingresos + Σ transferencias entrantes + Σ desembolsos − Σ gastos − Σ transferencias salientes − Σ pagos de tarjeta − Σ pagos de préstamo.
- `deuda(tarjeta)` = `initialDebt` + Σ compras − Σ pagos. `cupoDisponible` = `creditLimit` − deuda.
- `saldo(préstamo)` = `initialBalance` + Σ desembolsos − Σ pagos de capital.
- **Dinero total** = Σ saldo de todas las cuentas (activas e inactivas; una cuenta solo se archiva con saldo $0).
- **Dinero líquido** = Σ saldo de cuentas líquidas.
- **Deudas** = Σ deuda de tarjetas + Σ saldo de préstamos.
- **Patrimonio neto** = dinero total − deudas.
- **Ingresos del mes** = Σ `INCOME` del mes (recibidos).
- **Gastos del mes** = Σ `EXPENSE` + Σ `CARD_PURCHASE` del mes.
- **Ahorro del mes** = Σ efectos de los movimientos del mes sobre las cuentas `SAVINGS` (entradas − salidas). **Inversión del mes**: igual con `INVESTMENT`.
- **Restante del mes** = ingresos − gastos − ahorro − inversión.
- **Tasa de ahorro** = ahorro del mes ÷ ingresos del mes.

### 8.3 Tarjetas: cortes, cuotas y pagos

- **Fecha de corte** del mes m = día `statementDay` (o último día del mes si no existe).
- **Fecha de pago** de un corte: si `paymentDueDay` > `statementDay`, el mismo mes; si no, el mes siguiente (ajustada al último día si hace falta).
- **Cuotas de una compra** de valor A a n cuotas: las primeras n−1 cuotas valen ⌊A/n⌋ y la última A − (n−1)·⌊A/n⌋. La cuota 1 se factura en el primer corte con fecha ≥ fecha de compra; la cuota k en el corte k−1 posterior.
- **Deuda inicial** de la tarjeta: se reparte igual en `initialDebtInstallments` porciones; la primera se factura en el último corte con fecha ≤ `openingDate` (supuesto conservador: lo que ya se debía al registrarla está facturado).
- `facturado(C)` = Σ cuotas y porciones de deuda inicial facturadas en cortes ≤ C.
- `pagos(T)` = Σ `CARD_PAYMENT` con fecha ≤ T.
- **Pago exigible a la fecha t**: `PagoTarjeta(t)` = clamp(`facturado(último corte cuya fecha de pago ≤ t)` − `pagos(hoy)`, 0, `deuda`).
- **Pago del mes estimado** (lo que muestra la tarjeta) = clamp(`facturado(último corte ≤ hoy)` − `pagos(hoy)`, 0, deuda), con su fecha de pago. Si la fecha ya pasó y queda saldo → vencido.
- **Pago total** = deuda actual.
- **Deuda comprometida** = clamp(`facturado(primer corte ≥ hoy)` − `pagos(hoy)`, 0, deuda): lo ya facturado más lo que entrará en el próximo corte; excluye cuotas futuras de compras diferidas.
- Pagos de menos se acumulan (el siguiente pago exigible los incluye); pagos de más reducen los siguientes.
- Los intereses y la cuota de manejo se registran como `CARD_PURCHASE` a 1 cuota en "Intereses y comisiones".
- Consecuencia aceptada: una compra a cuotas consume el presupuesto del mes de compra por su valor total.

### 8.4 Préstamos

- `CuotaPréstamo(t)` (solo si tiene `monthlyPayment` y `paymentDay`, saldo > 0 y la fecha de pago del mes ≤ t) = min(saldo, max(0, `monthlyPayment` − pagado en el mes)), donde pagado = capital de `DEBT_PAYMENT` + intereses hijos del mes.
- Pago con intereses: el formulario pide "abono a capital" e "intereses (opcional)"; se crean en una sola transacción de base de datos el `DEBT_PAYMENT` y su `EXPENSE` hijo en "Intereses y comisiones" con la misma cuenta y fecha. Eliminar el pago elimina el hijo.
- Registrar un préstamo nuevo puede incluir "recibí el dinero en la cuenta X", que crea un `DEBT_DISBURSEMENT`.

### 8.5 Reserva de ahorro e inversión

- **Ingresos recibidos del mes** (`IR`) = Σ `INCOME` del mes hasta hoy.
- **Reserva pendiente** `R0` = max(0, `savingsPct`·`IR` − ahorro del mes) + max(0, `investmentPct`·`IR` − inversión del mes).
- El ahorro se exige a medida que llegan los ingresos: no se reserva dinero que aún no ha llegado.

### 8.6 Disponible estimado (hoy)

```
Disponible estimado =
    Dinero líquido
  − Σ obligaciones PENDING con fecha ≤ fin de mes (incluye vencidas)
  − Σ deuda comprometida de cada tarjeta
  − Σ CuotaPréstamo(fin de mes)
  − R0
```

Se muestra con su desglose ("¿Cómo se calcula?").

### 8.7 ¿Cuánto puedo gastar hoy?

**Base del día:** todo se calcula excluyendo los **gastos discrecionales de hoy** = `EXPENSE` y `CARD_PURCHASE` con fecha de hoy, sin `parentId` y no enlazados a un `ScheduledItem`. Así la cifra diaria queda fija durante el día; `gastadoHoy` = Σ de esos movimientos.

**A. Límite por liquidez.** Para cada día t de hoy a fin de mes:

```
F(t) = Líquido_base − R0_base
     + Σ ingresos esperados PENDING con hoy < fecha ≤ t, × (1 − savingsPct − investmentPct)
     − Σ obligaciones PENDING con fecha ≤ t (incluye vencidas)
     − Σ PagoTarjeta(t) de cada tarjeta          (para t < fin de mes)
     − Σ deuda comprometida de cada tarjeta      (en t = fin de mes)
     − Σ CuotaPréstamo(t)

diarioLiquidez = min sobre t de  F(t) ÷ (t − hoy + 1)
```

La simulación parte del dinero líquido —no del disponible estimado— para no restar dos veces las obligaciones y vencimientos, que se restan en su fecha. Con pago quincenal, no permite gastar hoy el dinero que llega el 15. Ingresos esperados con fecha ≤ hoy que no se hayan marcado como recibidos no se cuentan (y generan la alerta "¿Ya recibiste…?").

**B. Límite por presupuesto** (solo si el mes tiene presupuesto):

```
diarioPresupuesto = max(0, P − G_antesDeHoy − O_pend) ÷ díasRestantes
```

P = presupuesto general (o Σ por categoría si no hay general); G_antesDeHoy = gastos del mes con fecha < hoy; O_pend = Σ obligaciones `EXPENSE` PENDING del mes; díasRestantes = días de hoy a fin de mes, incluido hoy.

**Resultado:** `diario` = redondear hacia abajo a múltiplo de $100 de max(0, min(A, B)). `teQuedanHoy` = diario − gastadoHoy (si es negativo: "Hoy te pasaste $X"). Si `diario` = 0: "Hoy no tienes margen" con la causa principal (el término que más resta). La respuesta incluye el desglose completo para "¿Cómo se calcula?".

### 8.8 Porcentajes objetivo

- **Ingreso proyectado del mes** = ingresos recibidos del mes + ingresos esperados PENDING del mes; si ambos son 0, `monthlyIncomeEstimate` (si existe).
- Objetivo de cada bolsa = % × ingreso proyectado del mes. Real: obligaciones/entretenimiento/otros = gasto de categorías de esa bolsa; ahorro = ahorro del mes; inversión = inversión del mes.
- Se muestra: ingreso, objetivo, real, faltante o exceso, por bolsa.

### 8.9 Presupuestos

- Uno por mes por usuario. Si al consultar un mes no existe, se copia el del mes anterior más reciente (si hay).
- Gastado por categoría = Σ `EXPENSE` + `CARD_PURCHASE` del mes en la categoría y sus subcategorías. Transferencias y pagos de tarjeta o préstamo nunca cuentan.
- Muestra presupuesto, gastado, restante, % usado.
- Proyección: ritmo = gastado ÷ días transcurridos; proyectado = ritmo × días del mes; si proyectado > presupuesto, "A este ritmo superarías el presupuesto el día N".

### 8.10 Metas

- Abonar: `TRANSFER` desde una cuenta del usuario hacia `goal.accountId` con `goalId`. Retirar: `TRANSFER` desde `goal.accountId` hacia otra cuenta con `goalId`.
- Progreso = `initialAmount` + Σ abonos − Σ retiros; % = min(100, progreso ÷ objetivo).
- Si hay `targetDate`: mensual necesario = ⌈faltante ÷ max(1, meses restantes)⌉; semanal necesario = ⌈faltante ÷ max(1, ⌈días restantes ÷ 7⌉)⌉.
- Al llegar al 100 % se ofrece marcarla como completada.

### 8.11 Recurrentes y obligaciones

- **Terminología:** "obligación" = `ScheduledItem` de `kind = EXPENSE`; "ingreso esperado" = `ScheduledItem` de `kind = INCOME`. Toda mención de "obligaciones" en este documento se refiere solo a las de gasto.
- Cada `RecurringRule` genera `ScheduledItem` desde `startDate` hasta el fin del mes siguiente, de forma perezosa e idempotente (`ON CONFLICT DO NOTHING`), al consultar dashboard u obligaciones.
- `WEEKLY` (cada 7 días desde `startDate`), `SEMIMONTHLY` (`day1` y `day2` de cada mes), `MONTHLY` (día de `startDate`), `YEARLY` (día y mes de `startDate`), `CUSTOM_DAYS` (cada `intervalDays`).
- Obligaciones únicas: `ScheduledItem` sin regla.
- **Completar** una obligación crea el movimiento real (`EXPENSE` desde cuenta o `CARD_PURCHASE` si es con tarjeta; `INCOME` para ingresos esperados), con el valor real que indique el usuario, y la marca `DONE` enlazada. **Omitir** la marca `SKIPPED`.
- Si se elimina el movimiento enlazado, el `ScheduledItem` vuelve a `PENDING`.
- Marcar "Recurrente" al crear un ingreso o gasto crea la regla con `startDate` = fecha del movimiento y el primer `ScheduledItem` ya `DONE` enlazado a ese movimiento.
- **Sugerencia de enlace:** al registrar un gasto o ingreso, si existe un `ScheduledItem` PENDING de la misma categoría, valor dentro de ±20 % y fecha dentro de ±7 días, la app pregunta "¿Es el pago de *X*?"; si el usuario acepta, se enlaza y se marca `DONE`.
- Los vencimientos de tarjetas y préstamos no se guardan como `ScheduledItem`: se calculan (8.3, 8.4). La interfaz advierte que no se deben crear recurrentes para pagar tarjetas o préstamos.

### 8.12 Alertas y estado general

Se calculan en cada consulta. Cada alerta tiene una clave estable que incluye su periodo (por ejemplo, `budget:2026-10:<categoryId>:90`); descartarla guarda la clave en `DismissedAlert`.

| Alerta | Condición | Nivel |
|---|---|---|
| Presupuesto (general o por categoría) | ≥ 50 % / ≥ 75 % / ≥ 90 % / ≥ 100 % | info / advertencia / advertencia / peligro |
| Ahorro bajo el objetivo | pasó la mitad del mes y ahorro < 50 % del objetivo de ahorro | advertencia |
| Tarjeta cerca del límite | uso ≥ 80 % / ≥ 95 % del cupo | advertencia / peligro |
| Pago de tarjeta próximo | fecha de pago en ≤ 5 días y pago del mes > 0 | advertencia |
| Pago de tarjeta vencido | fecha de pago pasada y pago del mes > 0 | peligro |
| Obligación próxima | vence en ≤ 3 días | advertencia |
| Obligación vencida | fecha pasada y `PENDING` | peligro |
| Gastos superiores a ingresos | gastos del mes > ingresos del mes | advertencia |
| Gasto inusual | movimiento de los últimos 7 días > 3 × mediana de su categoría en los 90 días previos (mínimo 5 datos) | info |
| Dinero bajo | disponible estimado < `lowBalanceThreshold` | advertencia |
| Proyección negativa | F(fin de mes) − (gasto discrecional diario promedio del mes × días restantes) < 0 | peligro |
| Ingreso esperado atrasado | ingreso esperado con fecha < hoy en `PENDING` | info |
| Saldo negativo | alguna cuenta con saldo < 0 | advertencia |

**Mensajes informativos** (sin alerta): "Has utilizado el X % de tu presupuesto y quedan N días", "Tu ahorro actual es X % de tus ingresos. Tu objetivo es Y %", "Te faltan $X para tu objetivo mensual de ahorro", "Tu gasto promedio diario aumentó/bajó X % respecto al mes anterior" (si |cambio| ≥ 10 %), "Tu gasto en *categoría* está X % por encima de su presupuesto".

**Estado general** (uso = gastado ÷ presupuesto general del mes; si no hay presupuesto, gastos del mes ÷ ingreso proyectado del mes):
- 🔴 "Debes controlar tus gastos": uso ≥ 90 % o proyección negativa.
- 🟡 "Cuidado": uso ≥ 75 %, o la proyección del presupuesto lo supera, o uso > avance del mes + 10 puntos.
- 🟢 "Vas bien": en otro caso.

### 8.13 Validaciones y ediciones

- No se cambia el tipo de un movimiento (se elimina y se crea otro). Cualquier otra edición recalcula todo.
- `TRANSFER`: origen ≠ destino.
- `CARD_PAYMENT`: monto ≤ deuda actual de la tarjeta (al editar, sin contar el propio pago).
- `CARD_PURCHASE` que supera el cupo disponible: permitido con advertencia.
- Saldo de cuenta negativo: permitido con advertencia.
- Movimiento con fecha anterior al `openingDate` de su cuenta o tarjeta: permitido con advertencia ("el saldo inicial ya podría incluirlo").
- Fechas futuras: no se permiten (fecha ≤ hoy en Bogotá), porque los saldos se calculan con todos los movimientos. Lo programado se registra como obligación o ingreso esperado.
- Cuentas, tarjetas, préstamos y categorías con movimientos no se eliminan, se archivan. Cuenta: solo con saldo $0. Tarjeta y préstamo: solo con deuda $0.
- **Ajustar saldo:** el usuario indica el saldo real; se crea un `INCOME` o `EXPENSE` por la diferencia en la categoría de sistema "Ajuste de saldo". Corregir el saldo inicial es otra acción (editar la cuenta) que no crea movimientos.

### 8.14 Formato

- Moneda: `$1.500.000` (sin decimales, separador de miles `.`, sin espacio); negativo `-$25.000`. Abreviado en gráficos: `$1,2 M`, `$850 mil`.
- Fechas: `06 oct`, `06/10/2026`; nombres de mes en español.
- Entrada de valores: solo dígitos, formateo en vivo, teclado numérico (`inputmode="numeric"`).

## 9. Autenticación

- **Registro** (`name`, `email`, `password` 8–128): Argon2id; crea User, FinancialConfiguration y categorías iniciales en una transacción; abre sesión. Con `ALLOW_REGISTRATION=false` → 403.
- **Login:** compara contra un hash ficticio si el email no existe (tiempo constante); mensaje genérico "Email o contraseña incorrectos". Rate limit 5 intentos / 15 min por IP+email.
- **Sesión:** 32 bytes aleatorios (base64url) en cookie `fz_session` (`HttpOnly`, `Secure` en producción, `SameSite=Lax`, `Path=/`); en base de datos solo el SHA-256. Expira tras 30 días sin uso (`SESSION_TTL_DAYS`); `lastUsedAt` y la expiración se renuevan como máximo una vez por hora.
- **Expiración:** la API responde 401 `SESSION_EXPIRED`; el frontend limpia la caché y redirige a `/login` con "Tu sesión expiró".
- **Logout:** borra la sesión y la cookie.
- **Cambio de contraseña:** exige la actual; revoca las demás sesiones.
- **Olvidé mi contraseña:** respuesta siempre igual; token aleatorio de un solo uso, 30 minutos, guardado como hash; enlace `APP_URL/reset-password#token=…`. Restablecer revoca todas las sesiones. Rate limit 3 solicitudes / hora por IP+email.
- **Rutas frontend:** `/login`, `/register`, `/forgot-password`, `/reset-password` (públicas); el resto protegidas por un guard que consulta `GET /api/auth/me`.

## 10. Seguridad y privacidad

- Validación Zod estricta de cuerpos, parámetros y query (objetos estrictos, límites de longitud, recorte de espacios, enteros acotados, UUID válidos).
- React escapa toda salida; no se renderiza HTML de usuario.
- Autorización en backend: cada servicio recibe `userId` de la sesión; recursos ajenos o inexistentes → **404**.
- CSRF: `SameSite=Lax`, solo `application/json` en mutaciones, verificación de `Origin` = `APP_URL` en métodos no seguros.
- `@fastify/helmet` en la API; en nginx: CSP (`default-src 'self'`; imágenes `self data:`), HSTS, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy`.
- Rate limit global (300 req/min por sesión o IP) y estricto en autenticación. `trustProxy` activado para obtener la IP real detrás de Traefik y nginx.
- Logs: id de petición, método, ruta plantilla, estado, duración. Nunca cuerpos, valores, emails, tokens ni query strings. nginx registra `$uri`. Los filtros y montos no viajan en la URL del navegador.
- Errores en producción: mensaje genérico en español sin stack trace; errores Prisma mapeados (único → 409, FK → 400/404).
- Secretos solo en variables de entorno validadas al arrancar; `.env` en `.gitignore` y `.dockerignore`.
- Contenedores sin root; Postgres sin puerto publicado.

## 11. API REST

Convenciones: prefijo `/api`, JSON, montos enteros, fechas `YYYY-MM-DD`, meses `YYYY-MM`. Error: `{ "error": { "code": "...", "message": "...", "fields": { ... } } }`. Listas: `{ "items": [...], "nextCursor": "..." | null }`. Códigos: 200/201/204, 400 validación, 401 sin sesión, 403 registro cerrado, 404 no encontrado, 409 conflicto, 429 rate limit.

| Recurso | Endpoints |
|---|---|
| Salud | `GET /api/health` |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `POST /api/auth/change-password` |
| Perfil | `PATCH /api/me` (nombre, tema) |
| Dashboard | `GET /api/dashboard` — dinero total y por cuenta, disponible estimado con desglose, deudas, patrimonio, resumen del mes, ¿cuánto puedo gastar hoy? con desglose, tarjetas, metas, alertas principales, estado general |
| Cuentas | `GET /api/accounts`, `POST /api/accounts`, `GET /api/accounts/:id`, `PUT /api/accounts/:id`, `DELETE /api/accounts/:id`, `POST /api/accounts/:id/adjust` |
| Movimientos | `GET /api/transactions` (filtros: `from`, `to`, `type`, `categoryId`, `accountId`, `creditCardId`, `debtId`, `tag`, `method`, `minAmount`, `maxAmount`, `q`, `cursor`, `limit`), `POST /api/transactions` (unión discriminada por `type`), `GET /api/transactions/:id`, `PUT /api/transactions/:id`, `DELETE /api/transactions/:id` |
| Atajos | `POST /api/transfers`, `POST /api/credit-cards/:id/purchase`, `POST /api/credit-cards/:id/payment` (mismo servicio que `/api/transactions`) |
| Tarjetas | `GET /api/credit-cards`, `POST /api/credit-cards`, `GET /api/credit-cards/:id`, `PUT /api/credit-cards/:id`, `DELETE /api/credit-cards/:id`, `GET /api/credit-cards/:id/statement` (pago del mes, fecha de pago, comprometido, cuotas futuras por mes) |
| Préstamos | `GET /api/debts`, `POST /api/debts`, `GET /api/debts/:id`, `PUT /api/debts/:id`, `DELETE /api/debts/:id`, `POST /api/debts/:id/payments`, `POST /api/debts/:id/disbursements` |
| Categorías | `GET /api/categories`, `POST /api/categories`, `PUT /api/categories/:id`, `DELETE /api/categories/:id` |
| Etiquetas | `GET /api/tags`, `DELETE /api/tags/:id` (se crean al usarlas en un movimiento) |
| Presupuestos | `GET /api/budgets/:month`, `PUT /api/budgets/:month` |
| Metas | `GET /api/goals`, `POST /api/goals`, `GET /api/goals/:id`, `PUT /api/goals/:id`, `DELETE /api/goals/:id`, `POST /api/goals/:id/contributions`, `POST /api/goals/:id/withdrawals` |
| Recurrentes | `GET /api/recurring`, `POST /api/recurring`, `PUT /api/recurring/:id`, `DELETE /api/recurring/:id` |
| Programados | `GET /api/scheduled` (`from`, `to`, `status`; incluye vencimientos calculados de tarjetas y préstamos marcados como derivados), `POST /api/scheduled`, `POST /api/scheduled/:id/complete`, `POST /api/scheduled/:id/skip`, `DELETE /api/scheduled/:id`, `GET /api/scheduled/suggestions` (`kind`, `categoryId`, `amount`, `date`) |
| Configuración | `GET /api/settings/financial`, `PUT /api/settings/financial` |
| Alertas | `GET /api/alerts`, `POST /api/alerts/:key/dismiss` |
| Reportes | `GET /api/reports` (`preset` o `from`/`to`): totales, por categoría, por cuenta, por tarjeta, por método de pago, serie mensual, presupuesto vs. gasto, evolución del ahorro; `GET /api/reports/export?format=csv` o `format=xlsx` |

**Método de pago derivado** (para filtros y gráficos): `paymentMethod` si existe; si no, `CARD_PURCHASE` → tarjeta de crédito, y para el resto según el tipo de la cuenta (`CASH` → efectivo, `BANK` → cuenta bancaria, `DIGITAL_WALLET` → billetera digital, otros → otro).

## 12. Frontend y experiencia móvil

- **Diseño:** mobile first para 360/375/390/412 px; contenido de ancho máximo cómodo en tablet; en escritorio, barra lateral en lugar de la navegación inferior y dashboard en columnas. Estilo limpio y minimalista; colores semánticos con moderación: verde positivo, rojo gasto/deuda, ámbar advertencia, neutro información. Números con `tabular-nums`. Zonas de toque ≥ 44 px; inputs ≥ 16 px; contraste AA. Modo oscuro (sistema por defecto, selector en perfil).
- **Rutas:** `/dashboard`, `/transactions`, `/budgets`, `/more`, `/accounts`, `/accounts/:id`, `/cards`, `/cards/:id`, `/debts`, `/goals`, `/recurring`, `/reports`, `/categories`, `/settings`, `/profile` y las públicas de autenticación. Los formularios de registro rápido son paneles sobre la ruta actual (no cambian la URL).
- **Navegación inferior:** Inicio · Movimientos · **+** · Presupuestos · Más. El **+** abre un panel con: + Ingreso, − Gasto, ↔ Transferencia, 💳 Compra con tarjeta, 💳 Pagar tarjeta y (si hay préstamos) Pagar préstamo.
- **Registro rápido de gasto:** valor protagonista arriba; categorías como botones (las 8 más usadas primero); fuente de pago con cuentas y tarjetas (la última usada preseleccionada); fecha Hoy/Ayer/Otra; descripción opcional; Guardar fijo. Elegir una tarjeta convierte el movimiento en `CARD_PURCHASE` y muestra cuotas (default 1). Más opciones plegadas: subcategoría, etiquetas, notas, método, recurrente.
- **Pagar tarjeta:** tarjeta → deuda total, pago del mes estimado, fecha de pago → botones [Pago del mes] [Pago total] [Otro valor] → cuenta origen → Pagar.
- **Dashboard** (orden): saludo y mes; dinero total con disponible estimado y deudas (toque → detalle); ¿cuánto puedo gastar hoy?; este mes (ingresos, gastos, ahorro, % objetivo vs. real, restante); mi dinero (cuentas y total); tarjetas (carrusel con cupo, usado, disponible, pago del mes y botón Pagar); metas; alertas (3 principales y "ver todas"); gráficos diferidos (ingresos vs. gastos 6 meses, gastos por categoría en barras horizontales, evolución del ahorro).
- **Movimientos:** agrupados por día, scroll infinito por cursor, búsqueda con debounce de 300 ms, filtros en panel inferior. Ingresos en verde con `+`, gastos y compras con tarjeta en rojo con `-`, transferencias y pagos de tarjeta o préstamo en neutro con etiqueta ("Transferencia Bancolombia → Nequi", "Pago tarjeta Bancolombia → Nu"). Tocar abre el detalle con editar y eliminar.
- **Reportes:** presets (este mes, mes anterior, últimos 3 meses, últimos 6 meses, último año, personalizado); totales; gráficos de ingresos vs. gastos, gastos por categoría, distribución por cuenta, deuda de tarjetas, evolución del ahorro, presupuesto vs. gasto, evolución mensual, gastos por método de pago (máximo 6 series + "Otros", tooltips al tocar); exportar CSV y Excel; vista imprimible para "Guardar como PDF".
- **Rendimiento:** rutas con carga diferida; Recharts diferido; una sola petición para el dashboard; caché de TanStack Query con invalidación de dashboard, movimientos, cuentas y tarjetas tras cada mutación.
- **PWA:** manifest (nombre "Finanzas", `display: standalone`, colores del tema, íconos 192/512 y maskable); service worker que precachea solo la interfaz; nunca cachea respuestas de `/api`; pantalla "Sin conexión" y botones de guardar deshabilitados sin red.

## 13. Despliegue en Dokploy

### 13.1 Servicios (`docker-compose.yml`)

| Servicio | Imagen | Detalles |
|---|---|---|
| `db` | `postgres:17-alpine` | Volumen `pgdata`, healthcheck `pg_isready`, sin puertos publicados. |
| `api` | build `apps/api/Dockerfile` (multi-stage, Node 22, usuario sin root) | Al arrancar ejecuta `prisma migrate deploy` y luego el servidor en el puerto 3000; healthcheck `GET /api/health`; depende de `db` sano. |
| `web` | build `apps/web/Dockerfile` (build con Node, sirve con `nginx-unprivileged` en 8080) | SPA con fallback a `index.html`, caché larga para assets con hash, `/api/` → `http://api:3000`, cabeceras de seguridad, logs sin query string. Único servicio con dominio en Dokploy. |
| `backup` | `prodrigestivill/postgres-backup-local` | Respaldo diario con rotación (7 diarios, 4 semanales, 6 meses) en el volumen `backups`. |

### 13.2 Variables de entorno (`.env.example`)

`NODE_ENV`, `APP_URL`, `PORT`, `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `ALLOW_REGISTRATION`, `SESSION_TTL_DAYS`, `CORS_ORIGINS` (opcional), `LOG_LEVEL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `BACKUP_SCHEDULE`, `BACKUP_KEEP_DAYS`, `BACKUP_KEEP_WEEKS`, `BACKUP_KEEP_MONTHS`, `TZ=America/Bogota`.

### 13.3 Pasos (documentados en el README)

1. Crear en Dokploy un proyecto y una aplicación tipo **Compose** desde el repositorio Git (rama `main`, archivo `docker-compose.yml`).
2. Cargar las variables de entorno en la pestaña Environment (contraseñas fuertes generadas).
3. En Domains, asignar el dominio al servicio `web`, puerto 8080, con HTTPS y Let's Encrypt. Apuntar el registro DNS A del dominio a la IP del servidor.
4. Desplegar; verificar `https://dominio/api/health`.
5. Crear el primer usuario y, si se desea, poner `ALLOW_REGISTRATION=false` y redesplegar.
6. Backups: verificar el volumen `backups`; procedimiento de restauración con `pg_restore`/`psql` documentado; opción de copiar los respaldos a S3 o usar un Postgres administrado por Dokploy con backups programados desde su panel.

## 14. Testing

| Nivel | Cobertura |
|---|---|
| Dominio (Vitest, sin base de datos) | Matriz de efectos de los 7 tipos; cortes y cuotas (compra el día del corte, corte 31 en meses de 30 días y febrero, redondeo de cuotas, deuda inicial, pagos de menos y de más, comprometido); préstamos; reservas de ahorro; disponible estimado; ¿cuánto puedo gastar hoy? (sin presupuesto, quincenal, obligaciones vencidas, resultado negativo, gasto de hoy excluido de la base); presupuestos y proyección; metas; recurrencias (`SEMIMONTHLY` con último día, `MONTHLY` el 31); umbrales de alertas; formato COP; fechas de Bogotá (11 p.m. del 31 queda en ese mes). |
| API (Vitest + `fastify.inject` + Postgres de pruebas en el puerto 5433) | Registro, login, logout, sesión expirada, cambio y recuperación de contraseña; ingresos, gastos, transferencias, compra con tarjeta, pago total y parcial, préstamos; balance y dashboard; presupuesto; porcentajes; metas; recurrentes y obligaciones. Las 9 pruebas de correctitud: (1) transferir no genera gasto, (2) compra con tarjeta = gasto + deuda, (3) pagar tarjeta reduce deuda y saldo, (4) pagar tarjeta no genera gasto, (5) transferir a ahorro no genera gasto, (6) dinero total correcto, (7) las tarjetas no suman como dinero, (8) deudas separadas, (9) un usuario no ve datos de otro. Aislamiento: B recibe 404 al leer, editar o borrar movimientos, cuentas, tarjetas, presupuestos y metas de A; no puede crear movimientos con cuentas, tarjetas o categorías de A; listados y dashboard de B nunca incluyen datos de A. |
| Frontend (Vitest + Testing Library) | Campo de valor COP, formulario rápido (cambio a compra con tarjeta), guard de rutas. |
| Punta a punta (Playwright, viewport 360 px) | Registro → crear cuenta → registrar gasto → ver dashboard actualizado. |

Criterio de terminado de cada fase: tests, lint, `tsc` y build sin errores.

## 15. Fases de entrega

Cada fase termina desplegable.

**Fase 1 — Núcleo**
Monorepo, Postgres de desarrollo y pruebas, esquema completo con `CHECK` y FK compuestas, autenticación completa, cuentas, categorías, etiquetas, tarjetas (con facturación de cuotas), préstamos, los 7 tipos de movimiento con sus atajos, historial con filtros y paginación, dashboard (dinero total, disponible estimado, deudas, patrimonio, resumen del mes, cuentas, tarjetas), registro rápido y pagar tarjeta, seed de demostración, Dockerfiles, `docker-compose.yml` con backups, `.env.example`, README.

**Fase 2 — Planificación**
Porcentajes objetivo, presupuestos, metas (abonos y retiros), recurrentes y obligaciones con sugerencia de enlace, ¿cuánto puedo gastar hoy? con desglose, alertas y estado general, ajuste de saldo.

**Fase 3 — Análisis y pulido**
Reportes y gráficos, exportación CSV y Excel, vista imprimible, PWA, modo oscuro, prueba de punta a punta, revisión final de rendimiento y accesibilidad.

## 16. Seed de desarrollo

- Solo se ejecuta si `NODE_ENV` ≠ `production`.
- Usuario `demo@example.com`, contraseña `Demo12345!` (documentada en el README).
- Cuentas: Bancolombia (banco), Nequi (billetera), Efectivo, Nu (cuenta), Bolsillo ahorro (ahorro).
- Tarjeta Nu Crédito (cupo $5.000.000, corte 15, pago 30) con compras de contado y a cuotas, y un pago de tarjeta.
- Un préstamo con cuota mensual y un pago con intereses.
- Tres meses de historia: salario quincenal, freelance, gastos variados, transferencias Bancolombia → Nequi y a ahorro.
- Presupuesto del mes actual (general y por categorías), meta "Comprar computador" ($5.000.000 al 30/06/2027), recurrentes (arriendo, internet, Netflix con tarjeta, salario quincenal).

## 17. Flujo de trabajo

- Directorio local `D:\Zieete\finanzas`, remoto `origin` = https://github.com/Syztema/PersonalFinances.git, rama `main`.
- Como máximo 5 commits, cada uno con un mensaje de una frase:
  1. Diseño y plan de implementación.
  2. Fase 1.
  3. Fase 2.
  4. Fase 3.
  5. Verificación final y ajustes de despliegue (si hacen falta).
