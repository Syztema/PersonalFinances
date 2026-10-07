import { budgetPutSchema, monthParamsSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse } from '../../lib/validation';
import { clearBudget, getBudget, putBudget } from './service';

export async function budgetRoutes(app: FastifyInstance) {
  app.get('/budgets/:month', async (req) => ({
    budget: await getBudget(app.prisma, req.auth, parse(monthParamsSchema, req.params).month),
  }));

  app.put('/budgets/:month', async (req) => ({
    budget: await putBudget(
      app.prisma,
      req.auth,
      parse(monthParamsSchema, req.params).month,
      parse(budgetPutSchema, req.body),
    ),
  }));

  app.delete('/budgets/:month', async (req, reply) => {
    await clearBudget(app.prisma, req.auth.userId, parse(monthParamsSchema, req.params).month);
    return reply.status(204).send();
  });
}
