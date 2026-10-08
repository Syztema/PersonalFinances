# Finanzas — Addendum de diseño: Fase 3 (análisis y pulido)

- **Fecha:** 2026-10-07
- **Estado:** aprobado en conversación por secciones, pendiente de revisión escrita.
- **Base:** el spec principal (`2026-10-06-finanzas-design.md`) y el addendum de la Fase 2 (`2026-10-07-fase-2-design.md`). Este documento manda donde los contradiga.

## 1. Objetivo

Cerrar el alcance del spec principal (sección 15, Fase 3):
- reportes con gráficos;
- exportación CSV y Excel;
- vista imprimible para "Guardar como PDF";
- PWA instalable;
- prueba de punta a punta;
- revisión final de rendimiento y accesibilidad.

También incluye los pendientes de la Fase 2 que se eligieron (sección 8).

**Cómo sabremos que está bien:**
- El usuario ve a dónde va su dinero en cualquier periodo, con los mismos números que el dashboard.
- Descarga sus datos en Excel o CSV.
- Imprime o guarda un reporte en PDF.
- Instala Finanzas en el celular.
- Una prueba automática recorre el flujo principal en un celular de 360 px.

**Prioridades:** las mismas del spec principal. Corrección financiera > seguridad > aislamiento > experiencia móvil > registro rápido > dashboard > rendimiento > diseño.

## 2. Cambios respecto al spec principal

| Spec principal | Cambio |
|---|---|
| §11 `GET /api/reports` (`preset` o `from`/`to`) | Presets cerrados: `THIS_MONTH`, `LAST_MONTH`, `LAST_3_MONTHS`, `LAST_6_MONTHS`, `LAST_12_MONTHS`; o `from`/`to` (máximo 24 meses, `to` ≤ hoy). Contenido exacto en §3. |
| §11 `GET /api/reports/export` | Contenido, formato, límites y errores en §4. |
| §12 Reportes, "distribución por cuenta" | Es el saldo de cada cuenta al final del periodo ("Dónde está tu dinero"), con saldo inicial, entradas y salidas en la tabla. |
| §12 Reportes, "deuda de tarjetas" | Es la deuda de cada tarjeta al final del periodo, con compras y pagos del periodo en la tabla. |
| §12 Reportes, "evolución mensual" | Son el dinero total, las deudas y el patrimonio neto al cierre de cada mes. |
| §12 Reportes, tipos de gráfico | Sin tortas: barras horizontales para categorías, métodos de pago, cuentas y tarjetas. |
| §12 Dashboard, "gráficos diferidos" | Sección final "Tus últimos 6 meses" con 3 gráficos: ingresos vs. gastos, gastos por categoría y evolución del ahorro. Usa una petición aparte que solo se hace al llegar a la sección (§5.2). |
| §12 PWA | Aviso de nueva versión en lugar de recarga automática, botón "Instalar Finanzas" en Perfil y guardados que no se encolan sin red (§6). |
| Addendum Fase 2 §5, tokens del tema claro | `muted` pasa de `#64748b` a `#5b6779` y `warning` de `#b45309` a `#a14a06`, para contraste AA (§7.1). |
| §14 Punta a punta | Cinco recorridos y revisión de accesibilidad con axe (§9.4). |

## 3. Reportes: cálculo en el servidor

### 3.1 Periodos

Todo en `America/Bogota`. Los presets van por meses calendario y terminan hoy.

| Preset | Desde | Hasta |
|---|---|---|
| `THIS_MONTH` | día 1 del mes actual | hoy |
| `LAST_MONTH` | día 1 del mes anterior | último día del mes anterior |
| `LAST_3_MONTHS` | día 1 de hace 2 meses | hoy |
| `LAST_6_MONTHS` | día 1 de hace 5 meses | hoy |
| `LAST_12_MONTHS` | día 1 de hace 11 meses | hoy |
| personalizado (`from`, `to`) | `from` | `to` |

Validación con Zod estricto. Se envía `preset` o `from` y `to`, nunca ambos. Errores 400 `VALIDATION_ERROR`:
- `from` > `to` → `fields.from`;
- `to` > hoy → `fields.to` "La fecha final no puede ser futura";
- más de 24 meses calendario → `fields.from` "Elige un periodo de máximo 24 meses".

`months` es la lista de meses `YYYY-MM` que toca el periodo. Un mes parcial cuenta solo sus días dentro del periodo.

### 3.2 Contenido de `GET /api/reports`

Una sola respuesta, `ReportDTO` (§3.4). Todo se calcula dentro de **una transacción de solo lectura con aislamiento `REPEATABLE READ`**, así los números cuadran entre sí aunque haya escrituras al mismo tiempo, y se usa una sola conexión. El reporte no escribe nada: no llama a `ensureScheduled` y no copia presupuestos.

1. **Totales del periodo.** Mismas definiciones del spec principal §8.2, aplicadas al periodo:
   - `income` = Σ `INCOME`;
   - `expense` = Σ `EXPENSE` + Σ `CARD_PURCHASE`. Incluye los intereses (`EXPENSE` hijo de un pago de préstamo) y los ajustes de saldo. Una compra a cuotas cuenta completa en su fecha;
   - `savings` e `investment` = efecto neto de los movimientos del periodo sobre las cuentas `SAVINGS` e `INVESTMENT`;
   - `remaining` = `income − expense − savings − investment`;
   - `savingsRate` = `savings ÷ income`, con 4 decimales, o `null` si `income` = 0.
   - Transferencias, pagos de tarjeta, pagos de capital de préstamos, desembolsos y abonos o retiros de metas no son ingreso ni gasto.
2. **Por categoría** (`expenseByCategory` e `incomeByCategory`):
   - se agrupa por categoría principal: un movimiento de una subcategoría suma en su principal;
   - cada fila trae `amount` y `share` = `amount ÷ total` (0 a 1, 4 decimales);
   - orden descendente por valor y, en empate, por nombre.
3. **Por cuenta** (`accounts`):
   - cada cuenta del usuario, activa o eliminada, con `opening` (saldo al día anterior a `from`), `inflow`, `outflow` y `closing` (saldo en `to`);
   - entradas y salidas siguen los efectos del §8.1. Las transferencias suman en ambos lados y los pagos de tarjeta y de préstamo, incluidos sus intereses, son salidas;
   - se omiten las cuentas con los cuatro valores en 0;
   - invariante: `opening + inflow − outflow = closing`.
4. **Por tarjeta** (`cards`): `purchases` (Σ `CARD_PURCHASE`), `payments` (Σ `CARD_PAYMENT`) y `closingDebt` (deuda en `to`, incluida la deuda inicial). Se omiten las tarjetas con todo en 0.
5. **Por método de pago** (`paymentMethods`): los gastos (`EXPENSE` + `CARD_PURCHASE`) agrupados con `derivedMethod` (ya está en `@finanzas/shared`). Trae `amount` y `share`, en orden descendente.
6. **Serie mensual** (`months`), por cada mes del periodo:
   - `income`, `expense`, `savings`, `investment` y `remaining` del mes, recortados al periodo;
   - `closing` al cierre del mes (o en `to` si es antes): `totalMoney`, `debts`, `netWorth` y `savingsBalance`;
   - `savingsBalance` es la suma de los saldos de las cuentas `SAVINGS` + `INVESTMENT`, y alimenta "Evolución del ahorro".
7. **Presupuesto vs. gasto** (`budget`):
   - `months`: por mes, `budget` (el `total.budget` de la Fase 2, o `null` si el mes no tiene presupuesto o está vacío) y `spent`. `spent` usa el alcance de la Fase 2 si hay presupuesto, y si no, todo el gasto del mes;
   - `lines`: el detalle por categoría (`category`, `amount`, `spent`) del último mes del periodo, o `[]`;
   - se calcula con una variante de solo lectura de `computeBudget` que **nunca copia** del mes anterior.

**Reglas comunes:**
- Las referencias eliminadas se devuelven igual (`isActive: false`). La interfaz las marca "(eliminada)" o "(eliminado)".
- Todas las consultas filtran por `userId`.
- Los valores son enteros en pesos.

### 3.3 Agrupación para gráficos

En `@finanzas/shared`, la función pura `groupTop(rows, 6, 'Otros')` devuelve las 6 filas mayores más una fila "Otros" con la suma del resto, solo si el resto es mayor que 0. Se prueba en `shared`. La interfaz la usa para los gráficos; el Excel trae la lista completa.

### 3.4 Contratos (`packages/shared/src/dto.ts`)

```ts
type ReportPreset = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'LAST_12_MONTHS';
interface ReportDTO {
  period: { preset: ReportPreset | null; from: IsoDate; to: IsoDate; months: string[] };
  totals: { income: number; expense: number; savings: number; investment: number; remaining: number; savingsRate: number | null };
  expenseByCategory: Array<{ category: CategoryRefDTO; amount: number; share: number }>;
  incomeByCategory: Array<{ category: CategoryRefDTO; amount: number; share: number }>;
  accounts: Array<{ account: AccountRefDTO; opening: number; inflow: number; outflow: number; closing: number }>;
  cards: Array<{ card: RefDTO; purchases: number; payments: number; closingDebt: number }>;
  paymentMethods: Array<{ method: DerivedMethod; amount: number; share: number }>;
  months: Array<{
    month: string; income: number; expense: number; savings: number; investment: number; remaining: number;
    closing: { totalMoney: number; debts: number; netWorth: number; savingsBalance: number };
  }>;
  budget: {
    months: Array<{ month: string; budget: number | null; spent: number }>;
    lines: Array<{ category: CategoryRefDTO; amount: number; spent: number }>;
  };
}
```

`AccountRefDTO` (cuentas, con `type`) y `RefDTO` (tarjetas) son las referencias que ya existen, con `isActive`.

## 4. Exportación

**Ruta:** `GET /api/reports/export?format=csv|xlsx` más el periodo (`preset` o `from`/`to`, con las mismas reglas del §3.1).

**Cómo descarga la web:** pide el archivo con `fetch` y lo descarga con un enlace temporal (`URL.createObjectURL`). La página no navega, así que el periodo no queda en la barra de direcciones ni en el historial.

**Respuesta:**
- `Content-Type`:
  - CSV: `text/csv; charset=utf-8`;
  - Excel: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
- `Content-Disposition: attachment; filename="finanzas-movimientos-<from>_<to>.csv"` o `"finanzas-reporte-<from>_<to>.xlsx"`;
- `Cache-Control: no-store`.

**Movimientos exportados:**
- Todos los del periodo, incluidos los hijos de intereses como fila propia.
- Orden: fecha ascendente y luego `createdAt`.
- Columnas, en este orden:
  - Fecha;
  - Tipo: Ingreso, Gasto, Compra con tarjeta, Transferencia, Pago de tarjeta, Pago de préstamo o Desembolso;
  - Descripción;
  - Categoría: la principal;
  - Subcategoría: vacía si la categoría es principal;
  - Cuenta;
  - Cuenta destino;
  - Tarjeta;
  - Préstamo;
  - Cuotas;
  - Método de pago: la etiqueta del método derivado, vacía si no aplica;
  - Valor: entero positivo;
  - Etiquetas: separadas por ", ";
  - Notas.
- Los nombres van sin marca de eliminado.

**CSV:**
- UTF-8 con BOM, separador `;` y fin de línea CRLF.
- Comillas según RFC 4180: un campo que contenga `;`, `"`, CR o LF va entre comillas, con `"` duplicada.
- La fecha va como `AAAA-MM-DD`.

**Excel (exceljs), 4 hojas:**
1. **Resumen:**
   - periodo, desde y hasta;
   - ingresos, gastos, ahorro, inversión, restante y tasa de ahorro (formato `0,0 %`);
   - "Generado el" con la fecha y hora de Bogotá.
2. **Movimientos:**
   - las columnas del CSV;
   - encabezado en negrita, fila fija y autofiltro;
   - la Fecha es una celda de fecha real con formato `dd/mm/yyyy`, creada en UTC para que no se corra de día;
   - el Valor es numérico con formato `"$"#,##0`.
3. **Por categoría:** un bloque "Gastos" y otro "Ingresos" con Categoría, Valor y Porcentaje.
4. **Por cuenta:** Cuenta, Tipo, Saldo inicial, Entradas, Salidas y Saldo final.

**Seguridad y límites:**
- **Protección contra fórmulas:** en el CSV y en el Excel, todo texto que empiece con `=`, `+`, `-`, `@`, tabulador o retorno de carro se escribe con un `'` delante.
- **Máximo de movimientos:** 20.000, configurable con `EXPORT_MAX_ROWS`. Si se supera → 400 `EXPORT_TOO_LARGE` "Elige un periodo más corto".
- **Límite de frecuencia:** 10 exportaciones por minuto por usuario, con la clave de `@fastify/rate-limit` por `userId`. Si se supera → 429 `RATE_LIMITED`.
- **Logs:** no se registra ningún valor, nombre ni nota.

## 5. Interfaz

### 5.1 Pantalla de Reportes (`/reports`)

- **Navegación:** primera opción de "Más" y, en escritorio, en la barra lateral después de Presupuestos.
- **Periodo:**
  - botones Este mes, Mes anterior, 3 meses, 6 meses, 1 año y Personalizado; este último abre un panel con dos fechas y las validaciones del §3.1;
  - el periodo vive en el estado de la pantalla, no en la URL;
  - la clave de consulta es `['reports', periodo]`, y `invalidateFinance` invalida el prefijo `['reports']`.
- **Totales:** ingresos, gastos, ahorro e inversión, restante y tasa de ahorro.
- **Gráficos** (Recharts, en un chunk propio cargado con `React.lazy`), cada uno en su tarjeta:
  1. Ingresos vs. gastos por mes (barras agrupadas, en `positive` y `negative`).
  2. Gastos por categoría (barras horizontales, `groupTop` 6 + "Otros").
  3. Gastos por método de pago (barras horizontales, 6 + "Otros").
  4. Dónde está tu dinero (barras horizontales con el saldo final por cuenta; un sobregiro se ve negativo).
  5. Deuda de tarjetas (barras con la deuda final por tarjeta).
  6. Evolución del ahorro (línea con `savingsBalance`).
  7. Evolución mensual (líneas de dinero total, deudas y patrimonio neto).
  8. Presupuesto vs. gasto por mes (barras; los meses sin presupuesto muestran solo el gasto).
- **Comportamiento de los gráficos:**
  - al tocar se muestra el valor exacto con `formatCOP`;
  - los ejes usan `formatCOPCompact` ("$1,2 M", "$850 mil");
  - "Ver tabla" muestra los mismos datos en una tabla accesible;
  - se respeta `prefers-reduced-motion`, sin animaciones.
- **Colores de series:** tokens nuevos `--chart-1` a `--chart-6` y `--chart-other`.

| Token | Claro | Oscuro |
|---|---|---|
| `chart-1` | `#0f766e` | `#2dd4bf` |
| `chart-2` | `#2563eb` | `#60a5fa` |
| `chart-3` | `#c2410c` | `#fb923c` |
| `chart-4` | `#7c3aed` | `#a78bfa` |
| `chart-5` | `#be185d` | `#f472b6` |
| `chart-6` | `#4d7c0f` | `#a3e635` |
| `chart-other` | `#94a3b8` | `#64748b` |

- **Estados:**
  - "Sin movimientos en este periodo" cuando no hay datos;
  - esqueleto mientras carga;
  - `ErrorState` con "Reintentar" si falla.
- **Acciones al final:** "Exportar CSV", "Exportar Excel" e "Imprimir o guardar PDF".
  - Los botones de exportar muestran carga, no permiten doble envío y muestran el mensaje del servidor si hay error, como `EXPORT_TOO_LARGE` o 429.

### 5.2 Dashboard

Al final se agrega la sección **"Tus últimos 6 meses"**:
- 3 gráficos: ingresos vs. gastos, gastos por categoría (6 + "Otros") y evolución del ahorro;
- todos usan `GET /api/reports?preset=LAST_6_MONTHS`;
- la consulta y el chunk de gráficos se cargan cuando la sección entra en pantalla (IntersectionObserver). Si no está disponible, se cargan al montar;
- la parte superior del dashboard sigue siendo una sola petición.

### 5.3 Impresión y PDF

- **Disparadores:**
  - "Imprimir o guardar PDF" activa el modo impresión con `flushSync` y llama a `window.print()`;
  - `beforeprint` y `afterprint` activan y desactivan el mismo modo, así Ctrl+P funciona igual.
- **Hoja `@media print`:**
  - `@page` A4 con márgenes de 12 mm;
  - **siempre colores claros**: los tokens claros se fuerzan aunque `<html>` tenga `dark`;
  - sin navegación, botones, toasts ni la franja sin conexión;
  - `break-inside: avoid` en las tarjetas.
- **Contenido impreso:**
  - encabezado solo para imprimir: "Finanzas — Reporte del dd/mm/aaaa al dd/mm/aaaa" y "Generado el …";
  - los totales;
  - los gráficos con ancho fijo (680 px) y sin animación;
  - las tablas de categorías y cuentas siempre visibles.

## 6. PWA

- **Plugin:** `vite-plugin-pwa` con `generateSW` y `registerType: 'prompt'`. El registro se hace desde código de la app (`virtual:pwa-register/react`), sin scripts en línea, así que la CSP no cambia.
- **Manifest:**
  - nombre y `short_name` "Finanzas", `lang: es-CO`, `display: standalone`, `start_url: /dashboard`;
  - `theme_color` y `background_color` `#0b1016`;
  - íconos de 192 y 512 px, un maskable de 512 px y un apple-touch-icon de 180 px.
  - Los íconos se generan una vez desde `public/favicon.svg` con `@vite-pwa/assets-generator` y se versionan en `public/`.
- **Precaché:** solo la interfaz (js, css, html, svg, png, webmanifest).
  - `navigateFallback: '/index.html'` con `navigateFallbackDenylist: [/^\/api\//]`.
  - **Sin `runtimeCaching`:** nada de `/api` se guarda.
  - `cleanupOutdatedCaches`.
- **Actualización:**
  - cuando hay una versión nueva, se muestra un aviso fijo: "Nueva versión disponible" con el botón "Actualizar", que activa la nueva versión y recarga;
  - la app busca versiones al volver a estar visible (`visibilitychange`).
- **Sin conexión:**
  - el hook `useOnline` lee `navigator.onLine` y escucha `online` y `offline`;
  - **franja** en `AppLayout`: "Sin conexión — no se puede guardar hasta que vuelva la red";
  - **botones deshabilitados**: todos los de envío de formularios (`type="submit"`), `ConfirmButton` y los botones de acción que hacen mutaciones;
  - si una pantalla no tiene datos y su consulta quedó en pausa por falta de red, se muestra "Sin conexión" con "Reintentar";
  - TanStack Query usa `networkMode: 'always'` en las **mutaciones**, así un guardado sin red falla en ese momento y nunca se encola para enviarse después. Las consultas quedan en `online`.
- **Instalar:**
  - el evento `beforeinstallprompt` se guarda, y Perfil muestra "Instalar Finanzas" cuando está disponible;
  - en iPhone o iPad con Safari, fuera de modo app, Perfil muestra "En Safari: Compartir → Agregar a inicio";
  - nada de esto se muestra si la app ya corre instalada (`display-mode: standalone`).
- **nginx:**
  - `sw.js`, `workbox-*.js`, `manifest.webmanifest` y `index.html` con `Cache-Control: no-cache`;
  - los recursos con hash con caché larga e `immutable`;
  - `application/manifest+json` para `.webmanifest`;
  - la CSP actual se mantiene (`default-src 'self'` cubre el service worker y el manifest).

## 7. Accesibilidad y rendimiento

### 7.1 Accesibilidad (objetivo AA)

- **Tokens del tema claro:**
  - `muted` = `#5b6779`: 5,06:1 sobre `surface-2`, 5,30:1 sobre `bg` y 5,74:1 sobre `surface`;
  - `warning` = `#a14a06`: 5,30 / 5,55 / 6,00;
  - el tema oscuro no cambia.
- **`Field`:** el error queda enlazado al control con `aria-describedby` y el control lleva `aria-invalid`.
- **`ConfirmButton`:** en su segundo paso cambia su nombre accesible a "Confirmar: …" y lo anuncia (`aria-live`).
- **`Chips`** (grupos de opción): se navegan con las flechas, Inicio y Fin (tabindex itinerante).
- **`prefers-reduced-motion`:** desactiva las animaciones de paneles, toasts y gráficos.
- **Revisión automática:** axe en la prueba de punta a punta (§9.4), con cero violaciones `serious` o `critical`.

### 7.2 Rendimiento

- Reportes en una sola transacción de lectura (§3.2).
- `vite build` genera el manifest y se agrega el script `npm run check:bundle -w @finanzas/web`, que falla si:
  - el chunk de entrada pesa más que la línea base de la Fase 2 + 5 KB en gzip. La línea base se mide al empezar el plan 3B y se guarda en `apps/web/bundle-baseline.json`;
  - Recharts o `virtual:pwa-register` quedan en el grafo estático de la entrada (Recharts debe ir solo en chunks diferidos).
- `check:bundle` se corre en la verificación final.

## 8. Pendientes de la Fase 2 incluidos

1. **Alertas:** cada fila de "Descartar" tiene su propia mutación, igual que en Recurrentes. Un error de una fila nunca se pierde.
2. **Metas, saldo nunca negativo:**
   - abonar, retirar y cambiar la cuenta de la meta bloquean la fila de la meta (`SELECT … FOR UPDATE`) dentro de la transacción;
   - editar o eliminar desde Movimientos una transferencia con `goalId` también revisa la meta;
   - si el avance de la meta quedaría por debajo de 0 → 400 `WITHDRAWAL_EXCEEDS_GOAL` (en `fields.amount` al editar) o 409 `GOAL_PROGRESS_NEGATIVE` "Esta meta quedaría con saldo negativo; ajusta primero sus retiros" (al eliminar un abono).
3. **Pagar una obligación con la fuente eliminada:** `CompleteSheet` solo preselecciona la cuenta o tarjeta de la ocurrencia si sigue activa. Si no, el campo queda vacío y es obligatorio.
4. **Recurrente que ya existía:**
   - en el registro rápido con "Recurrente" marcado, antes de crear la regla se consultan las sugerencias;
   - si alguna pertenece a una regla existente (`recurringRuleId` no nulo), se pregunta "Ya tienes «X» como recurrente. ¿Es este pago?";
   - **Sí** → se envía con `scheduledItemId` y sin `recurring`; **No** → se crea la regla nueva;
   - nunca se envían los dos.
5. **Configuración:**
   - la barra de "Obligaciones" usa un tono neutro, porque llegar al objetivo no es un error;
   - el umbral de dinero bajo muestra la ayuda "Con 0 no se avisa de dinero bajo".
6. **Sesiones:** la renovación usa `updateMany` filtrando por `id` y sesión vigente. Si no actualiza ninguna fila, responde 401 `SESSION_EXPIRED` en lugar de 404.

**Se deja igual a propósito:** ¿Cuánto puedo gastar hoy? sigue restando las obligaciones vencidas no pagadas de meses anteriores.

## 9. Pruebas

### 9.1 Lógica (Vitest, sin base de datos)

- Resolución de presets en Bogotá, incluido el 31 a las 11 p.m.
- Límite de 24 meses, meses parciales y lista `months`.
- `groupTop`.
- Escape de CSV y protección contra fórmulas.
- Etiquetas de tipo y de método de pago en la exportación.

### 9.2 API (Postgres real)

- **Coherencia:**
  - los totales de `THIS_MONTH` son iguales a `thisMonth` del dashboard;
  - `opening + inflow − outflow = closing` en todas las cuentas;
  - el `closing` de cada mes es igual a los saldos calculados en esa fecha.
- **Reglas de dinero:**
  - transferencias, pagos de tarjeta y metas no son gasto;
  - una compra a cuotas cuenta completa;
  - intereses y ajustes van en su categoría;
  - las subcategorías se agrupan en su principal;
  - lo eliminado aparece con `isActive: false`.
- **Solo lectura:** pedir el reporte de un mes sin presupuesto no crea filas de `Budget` ni de `ScheduledItem`.
- **Exportación:**
  - CSV leído de vuelta: BOM, `;`, comillas, tildes y fórmulas neutralizadas;
  - Excel abierto con exceljs: 4 hojas, totales iguales a `/api/reports`, fechas sin corrimiento;
  - `EXPORT_TOO_LARGE` (con un `EXPORT_MAX_ROWS` bajo en el test);
  - 429 a la exportación número 11 dentro del mismo minuto.
- **Validación:** periodo inválido → 400 con `fields`.
- **Aislamiento:** el reporte y la exportación de B no traen nada de A, y B no ve nada de A.
- **Pendientes 2, 6 y 4 (lado API):** tests de cada uno.

### 9.3 Web (Vitest + Testing Library)

- Reportes:
  - cambio de periodo;
  - panel personalizado con sus errores;
  - estado vacío;
  - "Ver tabla";
  - exportar: nombre del archivo, doble toque y error 400 o 429;
  - el botón de imprimir activa el modo impresión.
- Dashboard: los gráficos se cargan al entrar en pantalla (IntersectionObserver simulado).
- Sin conexión: franja, botones deshabilitados y pantalla "Sin conexión".
- Avisos: "Nueva versión" (el registro del service worker simulado) e "Instalar Finanzas" (evento simulado e iPhone).
- Pendientes 1, 3, 4 y 5 (lado web).
- Accesibilidad: `Field`, `ConfirmButton` y `Chips`.

### 9.4 Punta a punta (Playwright, workspace `e2e/`)

- **Entorno:** Chromium con viewport de 360 × 800, contra el Docker de despliegue (`-p finanzas-local`, http://localhost:8080).
- **`npm run e2e`:**
  - crea un `.env` temporal si no existe;
  - levanta el stack con build y espera `/api/health`;
  - corre las pruebas;
  - apaga el stack sin borrar volúmenes y elimina el `.env` temporal.
- **No entra en `npm test`.** Es parte del criterio de terminado de la fase.
- **Recorridos**, cada uno con un usuario único:
  1. Registro → crear cuenta → registrar gasto → el dashboard muestra el saldo y el gasto actualizados.
  2. Crear una obligación → "Pagar" → aparece una sola vez en Movimientos y la cuenta baja una sola vez.
  3. Reportes → cambiar de periodo → "Exportar Excel": la descarga existe y no está vacía.
  4. PWA:
     - el manifest es válido y el service worker queda activo;
     - con `context.setOffline(true)` aparecen la franja y "Guardar" deshabilitado;
     - al volver la red todo se reactiva.
  5. axe en dashboard, movimientos, presupuestos, reportes y perfil, en tema claro y oscuro: cero violaciones `serious` o `critical`.

### 9.5 Criterio de terminado

Todo esto en verde:
- `format:check`, `lint`, `typecheck`, `npm test` (shared, api, web), `build`;
- `check:bundle`;
- `npm run e2e`.

## 10. Entrega

- **Dependencias nuevas:**
  - `recharts` y `vite-plugin-pwa` (web);
  - `@vite-pwa/assets-generator` (web, desarrollo);
  - `exceljs` (api);
  - `@playwright/test` y `@axe-core/playwright` (e2e, desarrollo).
- **Planes:**
  - **3A backend:** reportes, exportación, pendientes 2 y 6, y el lado API del 4;
  - **3B web:** reportes, gráficos del dashboard, impresión, PWA, accesibilidad, pendientes 1, 3, 4 y 5, y la prueba de punta a punta.
- **Flujo de trabajo:**
  - todo en la rama `fase-3`, con commits de trabajo;
  - revisión final de toda la rama;
  - **un solo commit** en `main`: "feat: implementa la fase 3 con reportes, exportación, PWA y pruebas de punta a punta", con push a `origin/main`.
- **Lugar en la lista de commits:** es el commit 4 de 5 del spec principal (§17). El 5 queda para ajustes de despliegue, si hacen falta.
