import { periodInputOf, reportExportQuerySchema, reportQuerySchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../lib/errors';
import { parse } from '../../lib/validation';
import { exportReport, loadReport } from './service';

/** Usuarios con una exportación en curso. */
const exporting = new Set<string>();
const RATE_LIMITED_MESSAGE = 'Demasiadas solicitudes. Intenta de nuevo en un momento.';

/**
 * Review 3A M1: máximo de Excel armándose a la vez en todo el proceso. Cada uno puede ocupar unos
 * 280 MB con 20.000 movimientos; el CSV es liviano y no cuenta.
 */
const MAX_CONCURRENT_XLSX_EXPORTS = 2;
let xlsxExports = 0;

export async function reportRoutes(app: FastifyInstance) {
  app.get('/reports', async (req) =>
    loadReport(app.prisma, req.auth, periodInputOf(parse(reportQuerySchema, req.query))),
  );

  // Spec Fase 3 §4: 10 exportaciones por minuto por usuario. Es un limitador aparte (no la
  // configuración de la ruta) para que el límite global por IP siga cubriendo también las
  // peticiones sin sesión, que `authenticate` rechaza antes de llegar aquí.
  const exportLimit = app.createRateLimit({
    max: 10,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.auth.userId,
  });

  app.get(
    '/reports/export',
    {
      // Sin ruta HEAD automática: tendría su propio contador y correría la exportación completa.
      exposeHeadRoute: false,
      // Corre después de `authenticate` (hook del grupo /api), así que `req.auth` ya existe.
      preHandler: async (req) => {
        const result = await exportLimit(req);
        if (!result.isAllowed && result.isExceeded)
          throw new AppError(429, 'RATE_LIMITED', RATE_LIMITED_MESSAGE);
      },
    },
    async (req, reply) => {
      // Una exportación a la vez por usuario: armar el archivo en memoria es costoso.
      if (exporting.has(req.auth.userId)) {
        throw new AppError(429, 'RATE_LIMITED', 'Espera a que termine la exportación anterior.');
      }
      exporting.add(req.auth.userId);
      let xlsxSlot = false;
      try {
        const query = parse(reportExportQuerySchema, req.query);
        if (query.format === 'xlsx') {
          if (xlsxExports >= MAX_CONCURRENT_XLSX_EXPORTS) {
            throw new AppError(
              429,
              'RATE_LIMITED',
              'Hay muchas exportaciones en curso; intenta en un momento.',
            );
          }
          xlsxExports += 1;
          xlsxSlot = true;
        }
        const file = await exportReport(app.prisma, req.auth, periodInputOf(query), query.format, {
          maxRows: app.config.exportMaxRows,
          now: app.now(),
        });
        return reply
          .header('Content-Type', file.contentType)
          .header('Content-Disposition', `attachment; filename="${file.filename}"`)
          .header('Cache-Control', 'no-store')
          .send(file.body);
      } finally {
        if (xlsxSlot) xlsxExports -= 1;
        exporting.delete(req.auth.userId);
      }
    },
  );
}
