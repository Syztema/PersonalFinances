import { companionCreateSchema, companionUpdateSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import {
  createCompanion,
  deleteCompanion,
  listCompanions,
  restoreCompanion,
  updateCompanion,
} from './service';

export async function companionRoutes(app: FastifyInstance) {
  app.get('/companions', async (req) => ({
    items: await listCompanions(app.prisma, req.auth.userId),
  }));

  app.post('/companions', async (req, reply) => {
    const companion = await createCompanion(
      app.prisma,
      req.auth.userId,
      parse(companionCreateSchema, req.body),
    );
    return reply.status(201).send({ companion });
  });

  app.put('/companions/:id', async (req) => ({
    companion: await updateCompanion(
      app.prisma,
      req.auth.userId,
      parseId(req.params),
      parse(companionUpdateSchema, req.body),
    ),
  }));

  app.delete('/companions/:id', async (req) =>
    deleteCompanion(app.prisma, req.auth.userId, parseId(req.params)),
  );

  app.post('/companions/:id/restore', async (req) => ({
    companion: await restoreCompanion(app.prisma, req.auth.userId, parseId(req.params)),
  }));
}
