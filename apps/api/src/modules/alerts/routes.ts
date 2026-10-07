import { alertKeyParamsSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse } from '../../lib/validation';
import { loadPlanning } from '../planning/snapshot';
import { activeAlerts, dismissAlert, planningStatus, restoreAlerts } from './service';

export async function alertRoutes(app: FastifyInstance) {
  app.get('/alerts', async (req) => {
    const snap = await loadPlanning(app.prisma, req.auth);
    return { items: await activeAlerts(app.prisma, req.auth, snap), status: planningStatus(snap) };
  });

  app.post('/alerts/:key/dismiss', async (req, reply) => {
    await dismissAlert(app.prisma, req.auth.userId, parse(alertKeyParamsSchema, req.params).key);
    return reply.status(204).send();
  });

  app.delete('/alerts/dismissed', async (req, reply) => {
    await restoreAlerts(app.prisma, req.auth.userId);
    return reply.status(204).send();
  });
}
