# Finanzas — Addendum de diseño: "Con quién" en los gastos

- **Fecha:** 2026-10-08
- **Estado:** aprobado en conversación por secciones, pendiente de revisión escrita.
- **Base:** el spec principal (`2026-10-06-finanzas-design.md`) y los addenda de las Fases 2 y 3. Este documento manda donde los contradiga.

## 1. Objetivo

Además de la categoría, cada gasto puede decir **con quién** se hizo: solo, con la pareja, con la familia o con amigos. La lista de opciones la maneja el usuario: las crea, las renombra y las elimina.

En Reportes, dos gráficas muestran con quién se gasta más:
- una con el total del periodo;
- otra mes a mes.

**Cómo sabremos que está bien:**
- registrar un gasto sigue siendo igual de rápido, y elegir con quién toma un toque;
- en Reportes se ve cuánto se gasta con cada compañía, mes a mes y en total;
- la suma por compañía es exactamente el gasto total del periodo.

**Decisiones del usuario:**
- **una sola** compañía por gasto;
- opciones iniciales Solo, Pareja, Familia y Amigos, todas editables;
- "total" es el total del periodo elegido en Reportes, hasta 24 meses;
- entrega como commit adicional (el 6). El commit 5 queda reservado para los ajustes de despliegue.

## 2. Datos y reglas

### 2.1 Modelo

Tabla nueva `Companion`:
- `id` (uuid) y `userId`;
- `name`: VarChar(30), con recorte de espacios, único por usuario contando también las eliminadas;
- `icon`: `zIcon`;
- `color`: `zColor`;
- `sortOrder` (int);
- `isActive` (boolean, por defecto true);
- `createdAt`;
- `@@unique([userId, name])` y `@@unique([id, userId])`;
- relación con `User` con `onDelete: Cascade`, igual que `Tag`.

Columna nueva `Transaction.companionId`:
- uuid y nullable;
- FK compuesta `(companionId, userId) → Companion(id, userId)` con `onDelete: NoAction`, como el resto de las relaciones de negocio;
- índice `(userId, companionId)`.

Restricción `CHECK` en Postgres: `companionId IS NULL OR (type IN ('EXPENSE','CARD_PURCHASE') AND "parentId" IS NULL)`. Así nunca la llevan los ingresos, las transferencias, los pagos, los desembolsos ni los intereses hijos.

### 2.2 Opciones iniciales

| Orden | Nombre | Ícono | Color |
|---|---|---|---|
| 0 | Solo | `user` | `#475569` |
| 1 | Pareja | `heart` | `#be185d` |
| 2 | Familia | `home` | `#2563eb` |
| 3 | Amigos | `users` | `#c2410c` |

Los cuatro colores dan contraste ≥ 4,5:1 con ícono blanco, que es el que se usa sobre colores del usuario.
- Se crean al registrarse, en la misma transacción que las categorías iniciales.
- La migración las agrega a **todas las cuentas existentes** con `INSERT … SELECT` desde `User`.
- Los íconos `user`, `heart` y `users` se suman al registro de íconos de la web (`lib/icons.tsx`, lucide-react). `home` ya existe (es la casa de lucide).

### 2.3 Reglas

- **Una sola** compañía por gasto, y es opcional (`null` = "Sin indicar").
- Al cambiar `EXPENSE` ⇄ `CARD_PURCHASE` se conserva la compañía.
- **Es un dato descriptivo:** se puede editar incluso en movimientos congelados de una cuenta o tarjeta eliminada. No cuenta como campo de dinero para la regla `ENTITY_DELETED`.
- **Crear un gasto:** `companionId` debe ser una compañía **activa** del usuario; si no, 400 `INVALID_REFERENCE` con `fields.companionId`.
- **Editar un gasto:** también vale la compañía que el movimiento ya tenía, aunque esté eliminada. Elegir otra compañía eliminada o ajena da 400.
- Enviar `companionId` en un tipo que no lo admite da 400 `VALIDATION_ERROR` con `fields.companionId`. Lo valida Zod antes de llegar a la base.
- **Eliminar una compañía:**
  - sin movimientos se borra del todo: 200 `{ deleted: 'hard' }`;
  - con movimientos queda `isActive = false` y conserva el historial: 200 `{ deleted: 'soft' }`;
  - repetir el DELETE sobre una ya eliminada responde lo mismo, sin cambios.
- **Restaurar:** `POST /api/companions/:id/restore` responde `{ companion }`.
- **Nombre repetido:** 409 `COMPANION_NAME_TAKEN`. Si la que existe está eliminada, el mensaje es "Ya existe una opción eliminada con ese nombre; restáurala."
- **Lo que queda fuera:** las reglas recurrentes y las ocurrencias programadas no guardan compañía. Un movimiento creado al pagar una obligación queda sin compañía.

### 2.4 API (todo filtrado por `userId`; recurso ajeno → 404)

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/companions` | — | `{ items: CompanionDTO[] }` (activas y eliminadas, por `sortOrder` y nombre; cada una con `usageCount`) |
| `POST /api/companions` | `{ name, icon?, color? }` | 201 `{ companion }` (`sortOrder` = máximo + 1) |
| `PUT /api/companions/:id` | `{ name?, icon?, color? }` | `{ companion }`; editar una eliminada → 409 `ENTITY_DELETED` |
| `DELETE /api/companions/:id` | — | 200 `{ deleted: 'hard' \| 'soft' }` |
| `POST /api/companions/:id/restore` | — | `{ companion }` |

`TransactionDTO` agrega `companion: CompanionRefDTO | null`, con `id`, `name`, `icon`, `color` e `isActive`.

Los esquemas de crear y editar `EXPENSE` y `CARD_PURCHASE` aceptan `companionId: zId | null`, opcional. El listado de movimientos (`GET /api/transactions`) acepta el filtro `companionId`, que puede ser un uuid o el valor especial `none` para "Sin indicar".

## 3. Interfaz

### 3.1 Registro rápido (gasto y compra con tarjeta)

- Debajo de las categorías va la fila **"¿Con quién?"**: botones con ícono y nombre de las compañías activas, en orden.
- Un toque la elige y otro toque la quita. **Sin preselección.**
- No se esconde en "Más opciones".
- Al final de la fila, un enlace **"Editar opciones"** va a `/categories`, en la pestaña "Con quién".
- **En edición:**
  - se muestra la compañía actual; si está eliminada, aparece marcada "(eliminada)", sigue elegida y se puede quitar o cambiar por una activa;
  - en un movimiento congelado se puede cambiar.
- El cuerpo enviado lleva `companionId` (uuid o `null`) solo para gasto y compra con tarjeta.
- Sin red, "Guardar" sigue deshabilitado como ya funciona.

### 3.2 Movimientos

- **Fila:** un ícono pequeño de la compañía junto a la categoría, con nombre accesible "Con Amigos".
- **Detalle:** "Con quién: Amigos" o "Amigos (eliminada)".
- **Filtros:** una sección **"Con quién"**, con las compañías (incluidas las eliminadas, marcadas) y "Sin indicar".

### 3.3 Administrar las opciones

- La pantalla **Categorías** suma una pestaña **"Con quién"**, junto a Gastos, Ingresos y Etiquetas.
- Muestra la lista activa con ícono, color, nombre y número de usos.
- Botón **"Nueva"**. Tocar una opción abre un panel con nombre, ícono (lista de íconos de la app) y color (paleta de la app), más "Eliminar" con confirmación.
- La sección **"Eliminados"** con **"Restaurar"** reutiliza `DeletedSection` y `useRestore`.
- Las acciones de cada fila tienen su propia mutación, y sin red se deshabilitan.

## 4. Reportes y exportación

### 4.1 Datos (`GET /api/reports`, misma transacción de solo lectura)

`ReportDTO` agrega dos campos:
- `expenseByCompanion: Array<{ companion: CompanionRefDTO | null; amount: number; share: number }>`:
  - los gastos (`EXPENSE` + `CARD_PURCHASE`) del periodo agrupados por compañía, con `null` para "Sin indicar";
  - orden descendente por valor y, en empate, por nombre, con "Sin indicar" al final;
  - **`Σ amount = totals.expense`**: los intereses siempre caen en "Sin indicar", y los ajustes de saldo también, porque se crean sin compañía;
  - se omiten las filas en 0.
- `companionMonths: Array<{ month: string; items: Array<{ companionId: string | null; amount: number }> }>`:
  - por cada mes de `period.months`, los gastos de ese mes por compañía, recortados al periodo;
  - la suma de cada mes es igual a `months[i].expense`.

Las compañías eliminadas aparecen con `isActive: false`.

### 4.2 Agrupación para la gráfica mensual

Función pura en `@finanzas/shared`: `groupCompanionSeries(report, n = 5)`. Devuelve:
- las series: hasta 5 compañías con el mayor total del periodo, más "Otros" (la suma del resto) solo si es mayor que 0, más "Sin indicar" si es mayor que 0;
- por mes, el valor de cada serie.

Se prueba en `shared`, y es la única agrupación que hace la web junto con `groupTop`.

### 4.3 Gráficas (chunk diferido `charts`, `ChartCard` con "Ver tabla")

1. **"Gastos por compañía"** (el total del periodo):
   - barras horizontales con la paleta de gráficos del tema (`chart-1` a `chart-6`, en el orden de mayor a menor), igual que "Gastos por categoría": un color elegido por el usuario puede no verse en el tema oscuro;
   - "Otros" usa `chart-other` y "Sin indicar" usa `muted`, para distinguirlos en las barras apiladas;
   - la tabla muestra el valor y el porcentaje.
2. **"Con quién gastas, mes a mes"**:
   - barras apiladas por mes, con las series de §4.2 y una leyenda;
   - la tabla es mes × compañía.

Valores con `formatCOP` y ejes con `formatCOPCompact`. Estado vacío: "Aún no has indicado con quién gastas" cuando no hay ningún gasto con compañía en el periodo. En impresión, ancho fijo y la tabla "Gastos por compañía" siempre visible.

### 4.4 Exportación

- El CSV y la hoja "Movimientos" agregan la columna **"Con quién"** después de "Subcategoría", con la protección contra fórmulas.
- El Excel agrega la hoja **"Por compañía"**, con las columnas Con quién, Valor y Porcentaje.

## 5. Pruebas

- **Lógica:**
  - `groupCompanionSeries`: top 5, "Otros", "Sin indicar" y meses vacíos;
  - la agrupación por compañía en `buildReport`, con `Σ = totals.expense` y cada mes igual a `months[i].expense`.
- **API (Postgres real):**
  - CRUD de compañías: crear, renombrar, eliminar definitivo o conservando historial, restaurar, nombre repetido y nombre de una eliminada;
  - la regla CHECK y Zod: un ingreso, una transferencia, un pago o intereses con compañía → 400;
  - crear con compañía eliminada o ajena → 400;
  - editar conservando la eliminada → 200;
  - editar un movimiento congelado cambiando solo la compañía → 200;
  - el cambio gasto ⇄ tarjeta conserva la compañía;
  - el filtro `companionId` y `none`;
  - opciones iniciales al registrarse;
  - la migración agrega las 4 a usuarios existentes;
  - reporte y exportación por compañía cuadran con el total;
  - **aislamiento:** B no lista, no edita, no restaura ni usa compañías de A, y el reporte de B no trae nada de A.
- **Web:**
  - la fila "¿Con quién?": elegir, quitar y cuerpo exacto con `toEqual`;
  - la edición, también con una compañía eliminada;
  - la fila y el detalle en Movimientos, y el filtro;
  - la pestaña "Con quién": crear, editar, eliminar y restaurar, cada fila con su propia mutación;
  - las dos gráficas con su tabla y su estado vacío;
  - `check:bundle` dentro del límite.
- **Punta a punta:**
  - el recorrido de registro elige "Amigos" en el gasto;
  - el de Reportes verifica que "Gastos por compañía" muestra Amigos;
  - axe sin violaciones graves en la pestaña nueva.

## 6. Migración y entrega

- **Migración aditiva y segura con datos existentes:**
  - crea `Companion`;
  - agrega `Transaction.companionId` (nullable), la FK compuesta, el índice y la regla CHECK;
  - inserta las 4 opciones iniciales para cada `User` existente.

  No modifica ningún dato existente. Se escribe a mano y se aplica con `migrate deploy`; nunca `migrate reset`.
- **Entrega:**
  - rama `con-quien`, un plan backend y otro web, revisión por tarea y revisión final;
  - **un solo commit** en `main`: "feat: agrega con quién en los gastos con opciones editables y gráficas por compañía", con push;
  - es el commit adicional (6); el 5 sigue reservado para los ajustes de despliegue.
