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
