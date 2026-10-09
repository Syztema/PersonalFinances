# Finanzas

Aplicación web para controlar finanzas personales en **pesos colombianos (COP)**, pensada para usarse desde el celular. Responde en segundos: cuánto dinero tienes y dónde, cuánto debes, cuánto gastaste este mes y en qué, y te deja registrar un gasto en menos de 10 segundos.

> Finanzas es un asistente basado únicamente en los datos que registras. No es asesoría financiera profesional.

## Qué hace

- Cuentas de dinero (efectivo, bancos, billeteras como Nequi o Daviplata, ahorro, inversión) con saldo calculado.
- Tarjetas de crédito con cupo, deuda, cuotas, día de corte y de pago, y "pago del mes" estimado.
- Préstamos con cuota mensual; los pagos separan capital (no es gasto) e intereses (sí es gasto).
- Siete tipos de movimiento que nunca cuentan dos veces el mismo dinero:

| Movimiento                       | Cuentas             | Deuda | Gasto del mes |
| -------------------------------- | ------------------- | ----- | ------------- |
| Ingreso                          | +                   | —     | —             |
| Gasto                            | −                   | —     | +             |
| Transferencia (incluye a ahorro) | − origen, + destino | —     | —             |
| Compra con tarjeta               | sin cambio          | +     | +             |
| Pago de tarjeta                  | −                   | −     | —             |
| Pago de préstamo (capital)       | −                   | −     | —             |
| Desembolso de préstamo           | +                   | +     | —             |

- Dashboard: cuánto puedo gastar hoy (con su desglose), dinero total, disponible estimado, deudas y patrimonio, estado general con las alertas principales, balance del mes con el uso del presupuesto, cuentas, tarjetas, préstamos y metas. Al final, "Tus últimos 6 meses" con ingresos vs. gastos, gastos por categoría, gastos por compañía (total y mes a mes) y evolución del ahorro (se cargan al llegar a esa parte).
- Historial con búsqueda, filtros (fecha, tipo, cuenta, tarjeta, categoría, con quién, etiqueta, método, valor) y paginación.
- **¿Con quién?**: al registrar un gasto o una compra con tarjeta puedes marcar con quién lo hiciste: Solo, Pareja, Familia, Amigos u opciones propias, que se editan en Categorías → Con quién. Reportes muestra cuánto gastas con cada una, en total y mes a mes.
- **¿Cuánto puedo gastar hoy?**: una cifra diaria que respeta tus próximos pagos (obligaciones, tarjetas y cuotas), el ahorro que te propones y el presupuesto, con su desglose.
- Presupuestos mensuales (general y por categoría) con proyección y alertas al 50, 75, 90 y 100 %; se copian del mes anterior.
- Metas de ahorro en cuentas de ahorro o inversión: abonar y retirar son transferencias, no gastos.
- Recurrentes y obligaciones: reglas semanales, quincenales, mensuales, anuales o cada N días; pagos únicos e ingresos esperados; "Pagar" crea el movimiento real y al registrar un gasto la app pregunta "¿Es el pago de…?".
- Alertas y estado general (vas bien · cuidado · debes controlar tus gastos), con opción de descartarlas.
- Porcentajes objetivo de obligaciones, ahorro, inversión, entretenimiento y otros.
- Todo editable o eliminable: eliminar conserva el historial (sección "Eliminados" con Restaurar); cuentas, tarjetas y préstamos se eliminan con saldo $0; ajuste de saldo; eliminar tu cuenta y todos tus datos.
- Tema oscuro por defecto (claro o según el sistema, en Perfil).
- **Reportes** (Más → Reportes): este mes, mes anterior, 3, 6 o 12 meses, o fechas propias de hasta 24 meses, con los mismos números del dashboard. Totales y gráficos de ingresos vs. gastos, gastos por categoría y por método de pago, gastos por compañía y con quién gastas mes a mes, dónde está tu dinero, deuda de tarjetas, evolución del ahorro, evolución mensual (dinero, deudas y patrimonio) y presupuesto vs. gasto. Cada gráfico tiene "Ver tabla".
- **Exportar** desde Reportes: "Exportar CSV" (los movimientos del periodo, UTF-8 separado por `;`, se abre bien en Excel en español) y "Exportar Excel" (hojas Resumen, Movimientos, Por categoría, Por compañía y Por cuenta). El CSV y la hoja Movimientos incluyen la columna «Con quién». Hasta 20.000 movimientos por archivo (configurable hasta 50.000 con `EXPORT_MAX_ROWS`), 10 exportaciones por minuto y una a la vez por usuario, y como máximo 2 exportaciones a Excel a la vez en el servidor (si hay más, la app pide intentar en un momento); un texto que empieza como fórmula se guarda como texto.
- **Imprimir o guardar PDF**: el botón de Reportes (o Ctrl+P) arma una hoja A4 con colores claros aunque uses el tema oscuro: periodo, totales, gráficos y tablas de categorías y cuentas. Para el PDF elige "Guardar como PDF" en el diálogo de impresión.
- **Instalar como app**: en Perfil, "Instalar Finanzas" (Android con Chrome o Edge, y también en el computador con los navegadores que permiten instalarla, como Chrome o Edge); en iPhone o iPad, desde Safari: Compartir → Agregar a inicio. Cuando hay una versión nueva aparece "Nueva versión disponible" con "Actualizar". Sin conexión aparece una franja de aviso y los botones de guardar se desactivan: nada queda en cola para enviarse después.
- Multiusuario con aislamiento total: cada consulta se filtra por usuario en el backend y la base de datos rechaza referencias entre usuarios.

## Arquitectura

```
Navegador / celular ──HTTPS──► Traefik (Dokploy)
                                   │
                                   ▼
                       web: nginx (SPA + proxy /api)
                                   │ red interna
                                   ▼
                       api: Fastify + Prisma ──► db: PostgreSQL
                                                    ▲
                                       backup: pg_dump diario
```

- Un solo dominio: la SPA y la API comparten origen, así las cookies de sesión funcionan sin CORS.
- nginx llega a la API por el alias de red `finanzas-api` (no hay nada que configurar).
- Toda la lógica financiera vive en funciones puras (`apps/api/src/domain`) con pruebas unitarias.
- Saldos y deudas nunca se guardan: se calculan desde los movimientos.

```
apps/api        API REST (Fastify 5, Prisma 7, PostgreSQL)
apps/web        Frontend (React 19, Vite, Tailwind 4)
packages/shared Esquemas Zod, tipos, formato COP y fechas (compartido)
e2e/            Pruebas de punta a punta (Playwright + axe) contra el Docker local
docs/           Diseño y planes de implementación
```

## Tecnologías

Node 22 · TypeScript · Fastify 5 · Prisma 7 (adapter `pg`) · PostgreSQL 17 · Zod 4 · Argon2id · exceljs · React 19 · Vite 8 · Tailwind CSS 4 · React Router 7 · TanStack Query 5 · Recharts · vite-plugin-pwa · Vitest · Playwright y axe · Docker · Dokploy.

## Requisitos

- Node.js 22.12 o superior y npm 10.
- Docker (para PostgreSQL en desarrollo y para producción).
- Para `npm run e2e`: el Chromium de Playwright, que se instala una sola vez con `npx playwright install chromium`.

## Instalación y desarrollo

```bash
npm install
npm run dev:db                      # Postgres de desarrollo (5432) y de pruebas (5433)
cp apps/api/.env.example apps/api/.env
npm run db:deploy -w @finanzas/api  # aplica las migraciones existentes
npm run db:seed -w @finanzas/api    # usuario de demostración
npm run dev:api                     # API en http://localhost:3000
npm run dev:web                     # App en http://localhost:5173 (proxy de /api a la API)
```

Para una base de datos existente usa siempre `db:deploy`. Usa `npm run db:migrate -w @finanzas/api` solo cuando vayas a crear migraciones nuevas. Nunca ejecutes `prisma migrate reset` contra una base con datos reales: la borra por completo.

**Usuario de demostración (solo desarrollo):** `demo@example.com` / `Demo12345!`. El seed borra y recrea ese usuario con tres meses de movimientos; se niega a correr si `NODE_ENV=production`.

## Variables de entorno

Desarrollo: `apps/api/.env` (ver `apps/api/.env.example`). Producción: `.env` en la raíz o la pestaña Environment de Dokploy (ver `.env.example`).

| Variable                                            | Descripción                                                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                                           | URL pública con `https://`, sin barra final. Se usa para enlaces de recuperación y para validar el origen de las peticiones. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Credenciales de la base. La contraseña solo con letras y números (`openssl rand -hex 24`).                                   |
| `DATABASE_URL`                                      | Solo en desarrollo; en Docker se arma con las variables anteriores.                                                          |
| `ALLOW_REGISTRATION`                                | `true`/`false`. Ciérralo después de crear tu cuenta.                                                                         |
| `SESSION_TTL_DAYS`                                  | Días sin uso antes de que la sesión expire (30).                                                                             |
| `TRUST_PROXY_HOPS`                                  | Proxies delante de la API: 2 en Dokploy (Traefik + nginx).                                                                   |
| `CORS_ORIGINS`                                      | Solo si el frontend se sirve desde otro dominio.                                                                             |
| `LOG_LEVEL`                                         | `info` por defecto. Los logs nunca incluyen cuerpos, montos, emails ni query strings.                                        |
| `EXPORT_MAX_ROWS`                                   | Máximo de movimientos por exportación (20000; hasta 50000). Si el periodo tiene más, la app pide uno más corto.              |
| `SMTP_*`                                            | Servidor de correo para "Olvidé mi contraseña". Sin SMTP, en desarrollo el enlace aparece en el log de la API.               |
| `BACKUP_*`                                          | Frecuencia y retención de los backups.                                                                                       |

## Base de datos, Prisma y migraciones

- Esquema: `apps/api/prisma/schema.prisma`. Las restricciones `CHECK` (forma de cada tipo de movimiento, montos, porcentajes) están en la migración `constraints`.
- Aplicar las migraciones existentes a una base: `npm run db:deploy -w @finanzas/api`.
- Crear una migración tras cambiar el esquema (solo en desarrollo): `npm run db:migrate -w @finanzas/api -- --name descripcion`.
- Aplicar migraciones en producción: el contenedor `api` ejecuta `prisma migrate deploy` al arrancar.
- Regenerar el cliente: `npm run db:generate -w @finanzas/api`.
- La migración `fase2` pone el tema oscuro por defecto para los usuarios nuevos y cambia a "Oscuro" a quienes tenían "Según el sistema" (pueden volver a elegirlo en Perfil; quienes tenían "Claro" lo conservan). Además agrega `RecurringRule.activeFrom` y `ScheduledItem.ruleDate` (las ocurrencias de una regla no se duplican aunque se mueva su fecha).
- La migración `budget_copied_from` guarda de qué mes se copió el presupuesto, para avisarlo hasta que lo edites o lo elimines.

## Pruebas, lint y build

```bash
npm test            # shared + api (unitarias e integración contra Postgres en 5433) + web
npm run lint
npm run typecheck
npm run build
npm run check:bundle -w @finanzas/web  # después del build: peso de la carga inicial
npm run e2e         # punta a punta en Chromium contra Docker (no entra en npm test)
```

Las pruebas de integración solo aplican las migraciones (`prisma migrate deploy`) sobre `finanzas_test` y aíslan los datos con usuarios únicos; para vaciar la base reinicia el contenedor: `docker compose -f docker-compose.dev.yml restart db-test`. Incluyen la correctitud financiera (transferir no es gasto, pagar tarjeta no es gasto nuevo, etc.) y el aislamiento entre usuarios.

**Tamaño del bundle.** `check:bundle` lee `apps/web/dist/.vite/manifest.json` y falla si la carga inicial (la entrada, los chunks que importa estáticamente y su CSS) pesa más que la línea base de `apps/web/bundle-baseline.json` + 5 KB en gzip, o si Recharts (chunk `charts`) o el registro del service worker (chunk `pwa`) quedan en ella. La línea base se midió al empezar el plan 3B (la web de la Fase 3). Córrelo después de `npm run build`.

**Punta a punta (`npm run e2e`, carpeta `e2e/`).** Necesita Docker y, una sola vez, `npx playwright install chromium`. El script:

- crea un `.env` temporal si no existe (`APP_URL=http://localhost:8080` y una contraseña de base aleatoria, que se guarda en `e2e/.env.e2e`, ignorado por git, para reutilizarla); si ya tienes `.env`, debe tener `APP_URL=http://localhost:8080` y no `ALLOW_REGISTRATION=false`;
- levanta el Docker local (`-p finanzas-local`) con build y espera `/api/health`;
- corre en Chromium, con pantalla de 360 × 800, cinco recorridos con usuarios nuevos: registro y primer gasto, pagar una obligación, reportes y "Exportar Excel", PWA sin conexión, y axe (cero violaciones serias o críticas) en tema claro y oscuro;
- siempre apaga el stack, sin borrar volúmenes, y borra el `.env` temporal.

Para un solo recorrido: `npm run e2e -- tests/pwa.spec.ts`. El informe queda en `e2e/playwright-report/`. Si abortas una corrida, `npm run e2e:down` apaga el stack y limpia lo temporal. La suite queda muy por debajo del límite de la API (300 solicitudes por minuto por IP): no uses `--repeat-each`. Si la base de `finanzas-local` se creó con otra contraseña (por ejemplo, con un `.env` que ya borraste), restaura ese `.env` o borra el volumen con `docker compose -p finanzas-local -f docker-compose.yml -f docker-compose.local.yml down -v` (borra los datos de esa base local).

## Docker (local)

```bash
cp .env.example .env    # APP_URL=http://localhost:8080 y una POSTGRES_PASSWORD aleatoria
docker compose -p finanzas-local -f docker-compose.yml -f docker-compose.local.yml up -d --build
# abrir http://localhost:8080
docker compose -p finanzas-local -f docker-compose.yml -f docker-compose.local.yml down
```

Se usa un proyecto de Compose aparte (`finanzas-local`) para no mezclarlo con la base de desarrollo (`finanzas-dev`, `npm run dev:db`). `npm run e2e` usa este mismo proyecto y lo apaga al terminar.

## Despliegue en Dokploy

1. En Dokploy crea un **Project** y dentro una aplicación tipo **Compose**. Conéctala a este repositorio (rama `main`, archivo `docker-compose.yml`).
2. En **Advanced**, activa **Isolated Deployment**. Así Dokploy crea una red propia para la aplicación, conecta todos los servicios a ella y conecta Traefik. `web` podrá llegar a `api` por nombre. Si no la activas, agrega tú la red `dokploy-network` (externa) a `web` y `api`.
3. En **Environment** pega el contenido de `.env.example` con tus valores reales: `APP_URL=https://finanzas.tudominio.com` y una `POSTGRES_PASSWORD` larga.
4. En **Domains** agrega el dominio:
   - Servicio: `web`.
   - Puerto del contenedor: `8080`.
   - Path: `/`.
   - HTTPS activado con certificado **Let's Encrypt**.

   No agregues dominio a `api`, `db` ni `backup`. Con **Preview Compose** puedes revisar las etiquetas de Traefik que Dokploy agregará.

5. **Despliega** (Deploy). Los cambios de dominio requieren volver a desplegar.
6. Verifica: `https://finanzas.tudominio.com/api/health` debe responder `{"status":"ok"}`.
7. Entra, crea tu cuenta y luego cambia `ALLOW_REGISTRATION=false` y vuelve a desplegar.

No uses `container_name` ni publiques puertos al host: Traefik enruta por la red interna.

### Dominio y HTTPS

- Crea un registro DNS **A** (o **AAAA**) de `finanzas.tudominio.com` apuntando a la IP pública del servidor de Dokploy.
- Traefik obtiene y renueva el certificado de Let's Encrypt automáticamente. Los puertos 80 y 443 del servidor deben estar abiertos.
- En producción la cookie de sesión es `Secure`, así que la app debe abrirse siempre por `https://`.

## Backups

El servicio `backup` hace `pg_dump` diario con rotación de 7 diarios, 4 semanales y 6 mensuales en el volumen `backups`. Los comandos para listar, forzar y restaurar copias están en [docker/backup/README.md](docker/backup/README.md).

En Git Bash de Windows, antepón `MSYS_NO_PATHCONV=1` a comandos como `docker compose exec backup /backup.sh` para que la ruta no se convierta en una ruta de Windows.

Recomendación: copia también los backups fuera del servidor, por ejemplo con `rclone` a S3 o Google Drive. Alternativa: crear la base como servicio **Database** de Dokploy y programar sus backups a S3 desde el panel.

## Producción: lista de verificación

- [ ] `APP_URL` con `https://` y dominio definitivo.
- [ ] `POSTGRES_PASSWORD` larga y aleatoria; `.env` nunca en git.
- [ ] Isolated Deployment activado y dominio solo en `web:8080` con Let's Encrypt.
- [ ] `ALLOW_REGISTRATION=false` después de crear tu cuenta.
- [ ] SMTP configurado si quieres recuperar contraseñas por correo.
- [ ] Backup verificado (`docker compose exec backup ls /backups/last`) y copia fuera del servidor.

## Seguridad y privacidad

Contraseñas con Argon2id · sesiones en base de datos (cookie HttpOnly, Secure, SameSite=Lax), revocables · validación Zod en el backend · rate limiting · Helmet y CSP estricta · verificación de `Origin` contra CSRF · recursos ajenos responden 404 · logs sin datos financieros.
