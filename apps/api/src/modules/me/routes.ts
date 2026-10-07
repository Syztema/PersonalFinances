import { updateMeSchema } from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { parse } from '../../lib/validation';
import { toUserDTO } from '../auth/service';

export async function meRoutes(app: FastifyInstance) {
  app.patch('/me', async (req) => {
    const input = parse(updateMeSchema, req.body);
    const user = await app.prisma.user.update({ where: { id: req.auth.userId }, data: input });
    return { user: toUserDTO(user) };
  });
}
