import {
  scheduledCompleteSchema,
  scheduledCreateSchema,
  scheduledListQuerySchema,
  scheduledSuggestionsQuerySchema,
  scheduledUpdateSchema,
} from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import {
  completeScheduled,
  createScheduled,
  deleteScheduled,
  listScheduled,
  skipScheduled,
  suggestScheduled,
  updateScheduled,
} from './service';

export async function scheduledRoutes(app: FastifyInstance) {
  app.get('/scheduled', async (req) => ({
    items: await listScheduled(app.prisma, req.auth, parse(scheduledListQuerySchema, req.query)),
  }));

  app.get('/scheduled/suggestions', async (req) => ({
    items: await suggestScheduled(
      app.prisma,
      req.auth,
      parse(scheduledSuggestionsQuerySchema, req.query),
    ),
  }));

  app.post('/scheduled', async (req, reply) => {
    const item = await createScheduled(
      app.prisma,
      req.auth,
      parse(scheduledCreateSchema, req.body),
    );
    return reply.status(201).send({ item });
  });

  app.put('/scheduled/:id', async (req) => ({
    item: await updateScheduled(
      app.prisma,
      req.auth,
      parseId(req.params),
      parse(scheduledUpdateSchema, req.body),
    ),
  }));

  app.post('/scheduled/:id/complete', async (req, reply) =>
    reply
      .status(201)
      .send(
        await completeScheduled(
          app.prisma,
          req.auth,
          parseId(req.params),
          parse(scheduledCompleteSchema, req.body),
        ),
      ),
  );

  app.post('/scheduled/:id/skip', async (req) => ({
    item: await skipScheduled(app.prisma, req.auth.userId, parseId(req.params)),
  }));

  app.delete('/scheduled/:id', async (req, reply) => {
    await deleteScheduled(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });
}
