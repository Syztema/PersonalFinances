import { accountCreateSchema, accountUpdateSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import { createAccount, deleteAccount, getAccount, listAccounts, updateAccount } from './service';

export async function accountRoutes(app: FastifyInstance) {
  app.get('/accounts', async (req) => ({ items: await listAccounts(app.prisma, req.auth.userId) }));

  app.post('/accounts', async (req, reply) => {
    const account = await createAccount(app.prisma, req.auth, parse(accountCreateSchema, req.body));
    return reply.status(201).send({ account });
  });

  app.get('/accounts/:id', async (req) => ({
    account: await getAccount(app.prisma, req.auth.userId, parseId(req.params)),
  }));

  app.put('/accounts/:id', async (req) => ({
    account: await updateAccount(
      app.prisma,
      req.auth.userId,
      parseId(req.params),
      parse(accountUpdateSchema, req.body),
    ),
  }));

  app.delete('/accounts/:id', async (req, reply) => {
    await deleteAccount(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });
}
