import {
  goalContributionSchema,
  goalCreateSchema,
  goalUpdateSchema,
  goalWithdrawalSchema,
} from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import {
  contributeToGoal,
  createGoal,
  deleteGoal,
  getGoal,
  listGoals,
  updateGoal,
  withdrawFromGoal,
} from './service';

export async function goalRoutes(app: FastifyInstance) {
  app.get('/goals', async (req) => ({ items: await listGoals(app.prisma, req.auth) }));

  app.post('/goals', async (req, reply) => {
    const goal = await createGoal(app.prisma, req.auth, parse(goalCreateSchema, req.body));
    return reply.status(201).send({ goal });
  });

  app.get('/goals/:id', async (req) => ({
    goal: await getGoal(app.prisma, req.auth, parseId(req.params)),
  }));

  app.put('/goals/:id', async (req) => ({
    goal: await updateGoal(
      app.prisma,
      req.auth,
      parseId(req.params),
      parse(goalUpdateSchema, req.body),
    ),
  }));

  app.delete('/goals/:id', async (req, reply) => {
    await deleteGoal(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });

  app.post('/goals/:id/contributions', async (req, reply) =>
    reply
      .status(201)
      .send(
        await contributeToGoal(
          app.prisma,
          req.auth,
          parseId(req.params),
          parse(goalContributionSchema, req.body),
        ),
      ),
  );

  app.post('/goals/:id/withdrawals', async (req, reply) =>
    reply
      .status(201)
      .send(
        await withdrawFromGoal(
          app.prisma,
          req.auth,
          parseId(req.params),
          parse(goalWithdrawalSchema, req.body),
        ),
      ),
  );
}
