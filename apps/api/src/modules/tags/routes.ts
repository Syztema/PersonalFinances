import { tagUpdateSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import { deleteTag, listTags, renameTag } from './service';

export async function tagRoutes(app: FastifyInstance) {
  app.get('/tags', async (req) => ({ items: await listTags(app.prisma, req.auth.userId) }));
  app.put('/tags/:id', async (req) => ({
    tag: await renameTag(
      app.prisma,
      req.auth.userId,
      parseId(req.params),
      parse(tagUpdateSchema, req.body).name,
    ),
  }));
  app.delete('/tags/:id', async (req, reply) => {
    await deleteTag(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });
}
