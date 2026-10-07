# Finanzas — Addendum de diseño: Fase 2

- **Fecha:** 2026-10-07
- **Estado:** aprobado por secciones en el chat; pendiente de revisión final del documento
- **Base:** `docs/superpowers/specs/2026-10-06-finanzas-design.md` (spec principal). Este addendum lo complementa; donde dice **"Reemplaza"**, manda sobre el spec principal.
- **Estado del código:** la Fase 1 está en `main` (commit `6bb13a5`).

---

## 1. Objetivo de la Fase 2

1. Completar la planificación financiera del spec principal (sección 15, Fase 2): porcentajes objetivo, presupuestos, metas, recurrentes y obligaciones, "¿Cuánto puedo gastar hoy?", alertas y estado general, y ajuste de saldo.
2. **Todo editable o eliminable por el usuario**, porque cada persona maneja un mundo financiero distinto, sin perder el historial.
3. **Interfaz oscura por defecto** (se adelanta desde la Fase 3).

La correctitud financiera sigue siendo la prioridad #1: los saldos y las deudas se siguen calculando a partir de los movimientos, así que cualquier edición, eliminación o restauración recalcula todo de forma consistente.

## 2. Cambios al spec principal

| Sección del spec principal | Cambio |
|---|---|
| 8.13 "Cuentas, tarjetas, préstamos y categorías con movimientos no se eliminan, se archivan" | **Reemplaza:** existe un solo concepto, **Eliminar**, con historial conservado (sección 3 de este addendum). "Archivar" desaparece de la interfaz. |
| 8.13 "No se cambia el tipo de un movimiento" | **Reemplaza:** se permite cambiar entre `EXPENSE` y `CARD_PURCHASE` al editar; los demás cambios de tipo siguen prohibidos (sección 4). |
| 7.3 `User.theme` default `SYSTEM` | **Reemplaza:** default `DARK`. |
| 7.3 categorías de sistema "no editables" | **Reemplaza:** se pueden editar y eliminar (sección 3.4). |
| 7.3 `ScheduledItem` único (`recurringRuleId`, `dueDate`) | **Reemplaza:** nueva columna `ruleDate` (fecha que generó la regla, inmutable) y único (`recurringRuleId`, `ruleDate`); `dueDate` pasa a ser editable (sección 6.4). |
| 8.3 "la primera [porción de la deuda inicial] se factura en el último corte con fecha ≤ `openingDate`" | **Reemplaza:** se factura en ese corte solo si su fecha de pago es ≥ `openingDate`; si la fecha de pago ya pasó cuando se registró la tarjeta, se factura en el corte siguiente. Al registrar una tarjeta se asume que está al día, así no aparece "vencida" desde el primer día. |
| 8.9 "Si al consultar un mes no existe, se copia el del mes anterior más reciente" | **Precisa:** solo para el mes actual y los futuros, sin categorías eliminadas; eliminar el presupuesto de un mes lo deja vacío y no se vuelve a copiar (sección 6.2). |
| 12 "Modo oscuro (sistema por defecto, selector en perfil)" y 15 (modo oscuro en Fase 3) | **Reemplaza:** oscuro por defecto, en la Fase 2 (sección 5). |
| 15 Fase 2 | Se amplía con este addendum. |

## 3. Modelo de eliminación: "Eliminar" conserva el historial

### 3.1 Regla general

- Un solo botón **Eliminar** para cuentas, tarjetas, préstamos y categorías.
- **Sin referencias** (sin movimientos, metas, reglas recurrentes, ocurrencias programadas ni líneas de presupuesto): se borra del todo.
- **Con referencias:** **eliminación lógica** (`isActive = false`). El elemento:
  - desaparece de las listas principales y de todos los selectores y formularios;
  - no se puede usar en movimientos nuevos: la API responde 400 `INVALID_REFERENCE` con el campo y el mensaje "… fue eliminada";
  - sus movimientos pasados **permanecen** en el historial, mostrando el nombre con la marca "(eliminada)", y siguen contando en los totales de los meses en que ocurrieron;
  - al editar un movimiento antiguo que lo usa, la referencia se conserva mientras no se cambie (regla ya existente).
- **Movimientos de una cuenta, tarjeta o préstamo eliminado:** solo se editan sus campos descriptivos (descripción, comercio o fuente, notas, etiquetas y categoría). Para cambiar el valor, la fecha, la cuenta o eliminarlos, la API responde 409 `ENTITY_DELETED` con el mensaje "Restaura *nombre* para modificar este movimiento". Así un elemento eliminado nunca vuelve a tener saldo escondido. Una categoría eliminada no bloquea nada, porque no afecta saldos.
- **Restaurar:** cada pantalla de gestión tiene una sección plegable **"Eliminados"** con el botón **Restaurar** (`isActive = true`). El campo `isActive` deja de aceptarse en los `PUT`; solo cambia con `DELETE` y `/restore`.
- **Nombres:** un elemento eliminado conserva su nombre. Crear otro con el mismo nombre responde 409 con el mensaje "Ya tienes una … eliminada con ese nombre. Restáurala desde Eliminados."

### 3.2 Requisito de saldo en $0

- **Cuenta:** solo se elimina con saldo $0.
- **Tarjeta:** solo con deuda $0.
- **Préstamo:** solo con saldo $0.

Si no se cumple, la API responde 409 (`ACCOUNT_HAS_BALANCE` / `CARD_HAS_DEBT` / `DEBT_HAS_BALANCE`) con el valor pendiente y cómo dejarlo en cero: transferencia, pago, ajuste de saldo o, si fue un error al crearlo, corregir el saldo inicial o eliminar sus movimientos. Así nunca queda dinero ni deuda escondidos. Una cuenta que guarda metas sin eliminar responde 409 `ACCOUNT_HAS_GOALS` hasta que esas metas se eliminen o se muevan a otra cuenta.

### 3.3 Efectos en cadena de una eliminación lógica

- **Reglas recurrentes** que usan la cuenta, tarjeta o categoría eliminada: se pausan (`isActive = false`) y se borran sus ocurrencias `PENDING`.
- **Obligaciones únicas** `PENDING` que la usan: se borran.
- **Presupuestos:** las líneas de una categoría eliminada se quitan del mes actual y de los futuros; los meses pasados no cambian; no se vuelven a copiar.
- **Categoría principal:** eliminarla elimina también sus subcategorías (mismo tratamiento).
- **Restaurar** no reactiva automáticamente las reglas pausadas: el usuario las reanuda.

### 3.4 Categorías del sistema

"Ajuste de saldo" (ingreso y gasto) e "Intereses y comisiones" se pueden editar (nombre, ícono, color, bolsa) y eliminar como cualquier categoría. Si la app necesita una que está eliminada (registrar intereses de un préstamo, ajustar un saldo), la **restaura automáticamente** (`isActive = true`) y la usa. Siguen ocultas en los selectores de gasto o ingreso manual solo las dos de "Ajuste de saldo".

### 3.5 Otros elementos

| Elemento | Eliminar |
|---|---|
| Movimiento | Borrado definitivo (como hoy). Si estaba enlazado a una ocurrencia programada, la ocurrencia vuelve a `PENDING`. Los hijos de intereses se eliminan con su pago. |
| Etiqueta | Borrado definitivo; se quita de los movimientos. Se puede **renombrar** (409 si el nombre ya existe). |
| Meta | Borrado definitivo; sus abonos y retiros quedan como transferencias normales (se desenlaza `goalId`). |
| Presupuesto de un mes | Borrado definitivo de ese mes con sus líneas. |
| Regla recurrente | Se borran sus ocurrencias `PENDING`; las `DONE`/`SKIPPED` quedan sin regla (historial). |
| Ocurrencia programada | Obligación única o ingreso esperado sin regla: borrado definitivo; si estaba `DONE`, su movimiento se conserva. Ocurrencia de una regla: no se borra (la regla la volvería a generar), se **omite**. |
| Alerta | Se descarta; se puede volver a mostrar todo lo descartado. |
| **Mi cuenta** | Borra el usuario y **todos** sus datos en cascada. Irreversible. Requiere la contraseña y escribir `ELIMINAR`. Cierra la sesión. |

## 4. Edición total

- **Movimientos:**
  - Se edita todo: valor, fecha, descripción, fuente o comercio, notas, etiquetas, categoría, cuenta, tarjeta y cuotas.
  - **Gasto ⇄ Compra con tarjeta:** al editar un gasto se puede elegir una tarjeta, y al editar una compra con tarjeta, una cuenta. El tipo cambia y los campos que no aplican se anulan (`paymentMethod` o `installments`). Se aplican las mismas validaciones que al crear.
  - Otros cambios de tipo: 400 `TYPE_CHANGE_NOT_ALLOWED` con el mensaje "Elimina el movimiento y regístralo de nuevo con el tipo correcto."
  - **Desembolsos de préstamo:** tienen su formulario de edición (valor, cuenta, fecha, descripción).
- **Saldo inicial negativo:** el formulario de cuenta tiene el interruptor "Saldo negativo (sobregiro)".
- **Perfil:**
  - nombre;
  - tema;
  - email, que requiere la contraseña actual, es único y se guarda en minúsculas.
- **Todo lo nuevo de la Fase 2** se crea, edita y elimina desde la interfaz.

## 5. Tema oscuro por defecto

- **Base de datos:** migración que cambia el default de `User.theme` a `DARK` y actualiza a `DARK` las filas que tengan `SYSTEM`.
- **Opciones en Perfil:** **Oscuro / Claro / Según el sistema**, vía `PATCH /api/me { theme }`, con actualización optimista.
- **Aplicación del tema:**
  - La clase `dark` va en `<html>` cuando el tema es `DARK`, o `SYSTEM` con `prefers-color-scheme: dark`. Si el tema es `SYSTEM`, la app escucha los cambios del sistema.
  - **Sin destello:** `public/theme-init.js` (archivo propio, porque la CSP no permite scripts en línea) se carga en `<head>`. Lee `localStorage['fz:theme']` (default `DARK`), aplica la clase y ajusta `meta[name=theme-color]` antes del primer pintado. Tras cargar `/auth/me`, la app sincroniza con `user.theme` y actualiza `localStorage`.
- **Paleta oscura:** los mismos tokens semánticos con contraste AA y `color-scheme: dark`.

| Token | Claro | Oscuro |
|---|---|---|
| `bg` | `#f5f6f8` | `#0b1016` |
| `surface` | `#ffffff` | `#121a22` |
| `surface-2` | `#eef1f4` | `#1a2430` |
| `border` | `#e2e6eb` | `#263241` |
| `fg` | `#0f172a` | `#e6edf3` |
| `muted` | `#64748b` | `#93a1b0` |
| `primary` | `#0f766e` | `#2dd4bf` |
| `primary-fg` | `#ffffff` | `#04201c` |
| `positive` | `#15803d` | `#4ade80` |
| `negative` | `#be123c` | `#fb7185` |
| `warning` | `#b45309` | `#fbbf24` |

- **Colores fijos fuera de los tokens:** se revisan los que aún existan (por ejemplo, los toasts con `bg-slate-900`). Los colores elegidos por el usuario para cuentas y categorías se mantienen.

## 6. Módulos de la Fase 2

Las reglas de cálculo son las del spec principal (secciones 8.5 a 8.12). Aquí se fijan las interfaces.

### 6.1 Configuración financiera

- `GET /api/settings/financial`: `{ obligationsPct, savingsPct, investmentPct, leisurePct, otherPct, monthlyIncomeEstimate, lowBalanceThreshold }`.
- `PUT /api/settings/financial`: mismo cuerpo, validado:
  - enteros de 0 a 100 que suman 100;
  - ingreso estimado > 0 o null;
  - umbral ≥ 0.
- **Pantalla** (Más → Configuración): muestra la suma en vivo y el objetivo en pesos de cada bolsa según el ingreso proyectado del mes.

### 6.2 Presupuestos

- `GET /api/budgets/:month` (`YYYY-MM`). Responde `{ month, totalAmount, lines, total, projection, copiedFrom }`:
  - `lines`: `{ id, category, amount, spent, remaining, usage }`;
  - `total`: `{ budget, spent, remaining, usage }`;
  - `projection`: `{ projectedSpend, exceedsOnDay }`;
  - `copiedFrom`: el mes de origen de la copia, o null.
- **Copia automática:** si el mes pedido es el actual o uno futuro y no tiene fila de presupuesto, se copia el del mes anterior más reciente que tenga uno, sin las líneas de categorías eliminadas. Los meses pasados sin presupuesto responden sin presupuesto (no se crea nada retroactivo).
- **Mes sin presupuesto:** un `Budget` con `totalAmount` null y sin líneas significa "sin presupuesto" en todos los cálculos (dashboard, ¿cuánto puedo gastar hoy?, alertas y estado).
- **Gastado:**
  - por línea: `EXPENSE + CARD_PURCHASE` del mes en la categoría y sus subcategorías;
  - total: todos los gastos del mes;
  - presupuesto general: `totalAmount`, o la suma de las líneas si es null.
- `PUT /api/budgets/:month`: `{ totalAmount | null, lines: [{ categoryId, amount }] }` reemplaza las líneas. Las categorías deben ser de gasto, activas y del usuario, sin repetirse.
- `DELETE /api/budgets/:month`: deja el mes vacío (borra el total y las líneas, conserva la fila) para que no se vuelva a copiar. Para tener presupuesto otra vez, el usuario lo crea desde la pantalla.
- **Pantalla:** selector de mes, total con barra y proyección, líneas con barra (ámbar ≥ 75 %, rojo ≥ 90 %), y agregar, editar o quitar líneas.

### 6.3 Metas

- `GET /api/goals`: cada meta trae `progress`, `pct`, `remaining`, `monthlyNeeded`, `weeklyNeeded` y `account`.
- `POST /api/goals`, `PUT /api/goals/:id` y `DELETE /api/goals/:id`. `PUT` acepta `status` `ACTIVE` o `COMPLETED` (completar y reabrir); el valor `ARCHIVED` del enum no se usa. `monthlyNeeded` y `weeklyNeeded` son null si la meta no tiene fecha.
- La cuenta de la meta debe ser `SAVINGS` o `INVESTMENT`, activa y del usuario.
- `POST /api/goals/:id/contributions` `{ fromAccountId, amount, date, description? }`: crea un `TRANSFER` de `fromAccountId` a la cuenta de la meta con `goalId`.
- `POST /api/goals/:id/withdrawals` `{ toAccountId, amount, date, description? }`: crea un `TRANSFER` de la cuenta de la meta a `toAccountId` con `goalId`.
- Abonar y retirar no son gastos ni ingresos; abonar cuenta como ahorro o inversión según el tipo de la cuenta de la meta.

### 6.4 Recurrentes y obligaciones

- **Reglas:** `GET/POST /api/recurring`, `PUT/DELETE /api/recurring/:id`.
  - Campos según la sección 7.3 del spec principal; `isActive` sirve para pausar.
  - Al editar o reanudar una regla se borran sus ocurrencias `PENDING` con `ruleDate` ≥ hoy y se regeneran.
- **Generación perezosa:** `ensureScheduled(userId, today)` se ejecuta al consultar el dashboard, las ocurrencias o las alertas.
  - Genera las ocurrencias de cada regla activa desde `max(startDate, hoy − 31 días)` hasta el fin del mes siguiente, con `ruleDate` = `dueDate` = la fecha de la regla.
  - Es idempotente (`ON CONFLICT (recurringRuleId, ruleDate) DO NOTHING`) y respeta `endDate`. Como `ruleDate` no cambia, mover la fecha de una ocurrencia o completarla en otro día no genera duplicados.
- **Ocurrencias:**
  - `GET /api/scheduled?from&to&status`: devuelve las ocurrencias reales más los **derivados** de solo lectura (`derived: 'CARD' | 'LOAN'`):
    - de cada tarjeta, el pago estimado con su fecha de pago, si es > 0;
    - de cada préstamo, la cuota pendiente del mes.
  - `POST /api/scheduled`: obligación única o ingreso esperado.
  - `PUT /api/scheduled/:id`: edita valor, fecha (`dueDate`), nombre, categoría y cuenta o tarjeta de una ocurrencia `PENDING`; con `{ status: 'PENDING' }` reabre una `SKIPPED`. Las `DONE` no se editan aquí: se edita su movimiento.
  - `POST /api/scheduled/:id/complete` `{ amount?, date?, accountId? | creditCardId?, description? }`:
    - crea el movimiento real en una transacción de base de datos: `EXPENSE` desde cuenta, `CARD_PURCHASE` a 1 cuota o `INCOME`;
    - lo enlaza y marca la ocurrencia `DONE`;
    - por defecto usa el valor, la cuenta o tarjeta y la fecha de la ocurrencia, y si esa fecha es futura usa hoy.
  - `POST /api/scheduled/:id/skip`.
  - `DELETE /api/scheduled/:id`: solo ocurrencias sin regla; las de una regla responden 409 `USE_SKIP`.
  - `GET /api/scheduled/suggestions?kind&categoryId&amount&date`: ocurrencias `PENDING` de la misma categoría, con valor ±20 % y fecha ±7 días.
- **Al crear un movimiento** (`INCOME`, `EXPENSE` o `CARD_PURCHASE`) se aceptan dos campos opcionales:
  - `scheduledItemId`: enlaza y completa esa ocurrencia en la misma transacción. Debe ser `PENDING`, del usuario y del mismo tipo (ingreso o gasto).
  - `recurring: { frequency, intervalDays?, day1?, day2?, endDate? }`: crea la regla con `startDate` = fecha del movimiento y la primera ocurrencia ya `DONE` y enlazada.
- **Restricción:** no se permiten reglas para pagar tarjetas o préstamos; sus vencimientos son derivados.

### 6.5 ¿Cuánto puedo gastar hoy?

- Se calcula como dice la sección 8.7 del spec principal, en el dominio puro (`spending-power.ts`):
  - base del día sin los gastos discrecionales de hoy;
  - simulación diaria hasta fin de mes con ingresos esperados (descontada la reserva), obligaciones, `PagoTarjeta(t)`, deuda comprometida al cierre y cuotas de préstamo;
  - límite por presupuesto;
  - redondeo hacia abajo a $100.
- **Dashboard:** `spendingPower` = `{ daily, spentToday, remainingToday, limitedBy, reason, breakdown }`:
  - `limitedBy`: `'LIQUIDITY' | 'BUDGET' | null`;
  - `reason`: texto en español cuando `daily` = 0;
  - `breakdown`: los términos con sus valores, para "¿Cómo se calcula?".
- Las cuotas de préstamo respetan la fecha de apertura (corrección de la Fase 1).

### 6.6 Alertas y estado

- Las 13 alertas de la sección 8.12 del spec principal, calculadas en vivo, con clave estable que incluye el periodo.
- `GET /api/alerts`: alertas activas (`{ key, level, title, message, href? }`), ordenadas por nivel.
- `POST /api/alerts/:key/dismiss`.
- `DELETE /api/alerts/dismissed`: vuelve a mostrar todas las descartadas.
- **Dashboard:** `status` (`{ level: 'OK' | 'WARNING' | 'DANGER', title, message }`) y las 3 alertas principales.

### 6.7 Ajuste de saldo

- `POST /api/accounts/:id/adjust` `{ actualBalance, date? }`: crea un `INCOME` o `EXPENSE` por la diferencia en la categoría de sistema correspondiente (restaurándola si estaba eliminada).
- Si la diferencia es 0, responde 400 `NO_CHANGE`.
- El movimiento resultante se edita o elimina como cualquier otro.

### 6.8 Perfil, cuenta y etiquetas

- `PATCH /api/me` `{ name?, theme?, email?, currentPassword? }`: `currentPassword` es obligatorio si cambia el email.
- `DELETE /api/me` `{ password, confirmation: 'ELIMINAR' }`: borrado en cascada, cierra la sesión y responde 204.
- `PUT /api/tags/:id` `{ name }`.
- **Restaurar:** `POST /api/{accounts|credit-cards|debts|categories}/:id/restore`.
- **Eliminar:** `DELETE` aplica la regla de la sección 3; la respuesta indica `{ deleted: 'hard' | 'soft' }`.

### 6.9 Dashboard completo

`DashboardDTO` agrega:
- `spendingPower`;
- `status`;
- `alerts` (máximo 3);
- `goals` (activas, máximo 3);
- `budget` (`{ budget, spent, usage, projectionExceedsOnDay }` o null).

En pantalla aparecen en este orden: saludo → **¿Cuánto puedo gastar hoy?** → dinero total → estado y alertas → este mes (con uso del presupuesto) → cuentas → tarjetas → préstamos → metas.

## 7. Interfaz web

- **Navegación "Más":** Mis cuentas, Tarjetas, Préstamos, Metas, Recurrentes y obligaciones, Categorías, Alertas, Configuración, Perfil y seguridad. La barra lateral de escritorio incluye las mismas entradas.
- **Presupuestos:** reemplaza el estado vacío de la Fase 1 por la pantalla completa.
- **Recurrentes y obligaciones:**
  - reglas: crear, editar, pausar o reanudar, y eliminar;
  - "Próximos 30 días" con las acciones Pagar o Recibir, Omitir, Editar y Eliminar (esta última solo para las obligaciones únicas);
  - los vencimientos de tarjetas y préstamos aparecen sin acciones de edición, con un enlace a su pantalla.
- **Gestión:**
  - "Archivar" se reemplaza por **Eliminar** (doble toque) con un mensaje que explica qué pasa con el historial;
  - sección **Eliminados** con Restaurar;
  - **Ajustar saldo** en cada cuenta.
- **Formularios de movimiento:**
  - casilla "Recurrente" con frecuencia;
  - aviso "¿Es el pago de *X*?" con Enlazar u Omitir;
  - cambio gasto ⇄ compra con tarjeta al editar;
  - formulario de edición de desembolso.
- **Perfil:** selector de tema, cambio de email, "Eliminar mi cuenta".
- **Historial:** sin parpadeo al filtrar (se conservan los datos anteriores mientras carga); valida que "desde" ≤ "hasta".
- **Tarjetas con saldo a favor:** muestran "Saldo a favor $X" también en sus pantallas.

## 8. Pendientes de la Fase 1 incluidos

- La renovación de sesión usa `updateMany` (sin la carrera P2025 con un logout simultáneo).
- **Seed de demostración:** agrega el presupuesto del mes, la meta "Comprar computador" ($5.000.000 al 30/06/2027, en "Bolsillo ahorro") y recurrentes (arriendo, internet, Netflix con tarjeta, salario quincenal), además de lo existente. Se ajustan los montos para que ninguna cuenta quede en negativo en ningún momento de la historia.
- Se quita `zod` de las dependencias de `apps/web` si sigue sin usarse.

## 9. Pruebas

| Nivel | Cobertura |
|---|---|
| Dominio | `spending-power` (quincenal, obligaciones vencidas, sin presupuesto, negativo, gasto de hoy fuera de la base, préstamo abierto después del día de pago); `recurrence` (`SEMIMONTHLY` con último día, `MONTHLY` el 31, `YEARLY` el 29-feb, `CUSTOM_DAYS`, `endDate`); proyección de presupuestos; cálculos de metas; umbrales de cada alerta y estado general; deuda inicial de una tarjeta registrada después de su fecha de pago (no queda vencida). |
| API (Postgres real) | Configuración (suma 100); presupuestos (copia, gastado con subcategorías, sin copia retroactiva, eliminar); metas (abonos y retiros no son gasto, cuentan como ahorro); recurrentes (generación idempotente, editar regenera, pausar); ocurrencias (completar crea exactamente un movimiento, eliminar el movimiento la reabre, mover la fecha no duplica, no se borra una ocurrencia de regla, sugerencias, `scheduledItemId` y `recurring` al crear); presupuesto eliminado no se vuelve a copiar; movimientos de un elemento eliminado solo editables en campos descriptivos; ¿cuánto puedo gastar hoy? de punta a punta; alertas (descartar y volver a mostrar); ajuste de saldo; eliminación lógica y restaurar con historial intacto; eliminación con saldo ≠ 0 → 409; efectos en cadena; categorías del sistema restauradas automáticamente; cambio gasto ⇄ compra con tarjeta recalcula; email y `DELETE /api/me`; **aislamiento entre usuarios en todos los endpoints nuevos**. |
| Web | Tema (`theme-init`, selector, sincronización), presupuestos, metas, recurrentes (completar y omitir), configuración (suma 100), eliminar y restaurar, cambio de tipo al editar, eliminar mi cuenta, ¿cuánto puedo gastar hoy? con desglose. |

Criterio de terminado: tests, lint, `tsc`, formato y build en verde.

## 10. Entrega

- Dos planes: **2A** (backend: `docs/superpowers/plans/2026-10-07-fase-2a-backend.md`) y **2B** (frontend: `docs/superpowers/plans/2026-10-07-fase-2b-frontend.md`), ejecutados con subagentes.
- Rama `fase-2` desde `main`. Al final se hace un único commit en `main` con mensaje de una frase (que incluye este addendum y los planes) y push a `origin/main`.
