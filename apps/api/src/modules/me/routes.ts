import { deleteMeSchema, updateMeSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse } from '../../lib/validation';
import { clearSessionCookie } from '../../plugins/session';
import { deleteMe, updateMe } from './service';

export async function meRoutes(app: FastifyInstance) {
  app.patch('/me', async (req) => ({
    user: await updateMe(
      app.prisma,
      req.auth,
      parse(updateMeSchema, req.body),
      app.passwordLimiter,
    ),
  }));

  app.delete('/me', async (req, reply) => {
    await deleteMe(app.prisma, req.auth, parse(deleteMeSchema, req.body), app.passwordLimiter);
    clearSessionCookie(reply);
    return reply.status(204).send();
  });
}
