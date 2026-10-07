import { creditCardCreateSchema, creditCardUpdateSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import {
  createCreditCard,
  deleteCreditCard,
  getCardStatement,
  getCreditCard,
  listCreditCards,
  updateCreditCard,
} from './service';

export async function creditCardRoutes(app: FastifyInstance) {
  app.get('/credit-cards', async (req) => ({
    items: await listCreditCards(app.prisma, req.auth.userId, req.auth.today),
  }));

  app.post('/credit-cards', async (req, reply) => {
    const card = await createCreditCard(
      app.prisma,
      req.auth,
      parse(creditCardCreateSchema, req.body),
    );
    return reply.status(201).send({ card });
  });

  app.get('/credit-cards/:id', async (req) => ({
    card: await getCreditCard(app.prisma, req.auth.userId, parseId(req.params), req.auth.today),
  }));

  app.get('/credit-cards/:id/statement', async (req) =>
    getCardStatement(app.prisma, req.auth.userId, parseId(req.params), req.auth.today),
  );

  app.put('/credit-cards/:id', async (req) => ({
    card: await updateCreditCard(
      app.prisma,
      req.auth,
      parseId(req.params),
      parse(creditCardUpdateSchema, req.body),
    ),
  }));

  app.delete('/credit-cards/:id', async (req, reply) => {
    await deleteCreditCard(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });
}
