import { recurringRuleCreateSchema, recurringRuleUpdateSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import { createRule, deleteRule, getRule, listRules, updateRule } from './service';

export async function recurringRoutes(app: FastifyInstance) {
  app.get('/recurring', async (req) => ({ items: await listRules(app.prisma, req.auth) }));

  app.post('/recurring', async (req, reply) => {
    const rule = await createRule(app.prisma, req.auth, parse(recurringRuleCreateSchema, req.body));
    return reply.status(201).send({ rule });
  });

  app.get('/recurring/:id', async (req) => ({
    rule: await getRule(app.prisma, req.auth, parseId(req.params)),
  }));

  app.put('/recurring/:id', async (req) => ({
    rule: await updateRule(
      app.prisma,
      req.auth,
      parseId(req.params),
      parse(recurringRuleUpdateSchema, req.body),
    ),
  }));

  app.delete('/recurring/:id', async (req, reply) => {
    await deleteRule(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });
}
