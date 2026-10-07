import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });
}
