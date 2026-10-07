import 'fastify';
import type { IsoDate } from '@finanzas/shared';
import type { AppConfig } from '../config/env';
import type { PrismaClient } from '../generated/prisma/client';
import type { Mailer } from '../lib/mailer';

export interface AuthContext {
  userId: string;
  sessionId: string;
  timezone: string;
  /** "Hoy" en la zona del usuario, calculado con `app.now()` al autenticar. */
  today: IsoDate;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    prisma: PrismaClient;
    mailer: Mailer;
    now: () => Date;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    auth: AuthContext;
  }
}
