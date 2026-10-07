import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env';
import type { PrismaClient } from './generated/prisma/client';
import { createMailer, type Mailer } from './lib/mailer';
import { createPrisma } from './lib/prisma';
import { accountRoutes } from './modules/accounts/routes';
import { authRoutes } from './modules/auth/routes';
import { categoryRoutes } from './modules/categories/routes';
import { healthRoutes } from './modules/health/routes';
import { meRoutes } from './modules/me/routes';
import { tagRoutes } from './modules/tags/routes';
import { creditCardRoutes } from './modules/credit-cards/routes';
import { debtRoutes } from './modules/debts/routes';
import { transactionRoutes } from './modules/transactions/routes';
import { dashboardRoutes } from './modules/dashboard/routes';
import { setupErrorHandling } from './plugins/errors';
import { setupSecurity } from './plugins/security';
import { setupSession } from './plugins/session';

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
    // Producción: Traefik → nginx → api (2 saltos). Desarrollo: proxy de Vite (1 salto).
    // (los tipos de Fastify no aceptan número; la función equivale a proxy-addr con ese número de saltos)
    trustProxy: (_address: string, hop: number) => hop < config.trustProxyHops,
    logController: new LogController({ disableRequestLogging: true }),
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
  await setupSession(app);

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(
    async (api) => {
      api.addHook('preHandler', api.authenticate);
      await api.register(meRoutes);
      await api.register(accountRoutes);
      await api.register(categoryRoutes);
      await api.register(tagRoutes);
      await api.register(creditCardRoutes);
      await api.register(debtRoutes);
      await api.register(transactionRoutes);
      await api.register(dashboardRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
