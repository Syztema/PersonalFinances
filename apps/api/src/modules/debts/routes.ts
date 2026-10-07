import { debtCreateSchema, debtUpdateSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import { createDebt, deleteDebt, getDebt, listDebts, restoreDebt, updateDebt } from './service';

export async function debtRoutes(app: FastifyInstance) {
  app.get('/debts', async (req) => ({
    items: await listDebts(app.prisma, req.auth.userId, req.auth.today),
  }));

  app.post('/debts', async (req, reply) => {
    const debt = await createDebt(app.prisma, req.auth, parse(debtCreateSchema, req.body));
    return reply.status(201).send({ debt });
  });

  app.get('/debts/:id', async (req) => ({
    debt: await getDebt(app.prisma, req.auth.userId, parseId(req.params), req.auth.today),
  }));

  app.put('/debts/:id', async (req) => ({
    debt: await updateDebt(
      app.prisma,
      req.auth,
      parseId(req.params),
      parse(debtUpdateSchema, req.body),
    ),
  }));

  app.delete('/debts/:id', async (req) => deleteDebt(app.prisma, req.auth, parseId(req.params)));

  app.post('/debts/:id/restore', async (req) => ({
    debt: await restoreDebt(app.prisma, req.auth, parseId(req.params)),
  }));
}
