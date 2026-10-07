import type { FastifyInstance } from 'fastify';
import { parseId } from '../../lib/validation';
import { deleteTag, listTags } from './service';

export async function tagRoutes(app: FastifyInstance) {
  app.get('/tags', async (req) => ({ items: await listTags(app.prisma, req.auth.userId) }));
  app.delete('/tags/:id', async (req, reply) => {
    await deleteTag(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });
}
