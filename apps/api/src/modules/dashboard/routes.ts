import type { FastifyInstance } from 'fastify';
import { getDashboard } from './service';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', async (req) => getDashboard(app.prisma, req.auth));
}
