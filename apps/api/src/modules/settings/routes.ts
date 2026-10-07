import { financialSettingsSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse } from '../../lib/validation';
import { getFinancialSettings, updateFinancialSettings } from './service';

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/settings/financial', async (req) => getFinancialSettings(app.prisma, req.auth));

  app.put('/settings/financial', async (req) =>
    updateFinancialSettings(app.prisma, req.auth, parse(financialSettingsSchema, req.body)),
  );
}
