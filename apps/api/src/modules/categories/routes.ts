import { categoryCreateSchema, categoryUpdateSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import { createCategory, deleteCategory, listCategories, updateCategory } from './service';

export async function categoryRoutes(app: FastifyInstance) {
  app.get('/categories', async (req) => ({
    items: await listCategories(app.prisma, req.auth.userId),
  }));

  app.post('/categories', async (req, reply) => {
    const category = await createCategory(
      app.prisma,
      req.auth.userId,
      parse(categoryCreateSchema, req.body),
    );
    return reply.status(201).send({ category });
  });

  app.put('/categories/:id', async (req) => ({
    category: await updateCategory(
      app.prisma,
      req.auth.userId,
      parseId(req.params),
      parse(categoryUpdateSchema, req.body),
    ),
  }));

  app.delete('/categories/:id', async (req, reply) => {
    await deleteCategory(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });
}
