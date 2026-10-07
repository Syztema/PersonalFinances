import 'fastify';
import type { IsoDate } from '@finanzas/shared';
import type { AppConfig } from '../config/env';
import type { PrismaClient } from '../generated/prisma/client';
import type { AttemptLimiter } from '../lib/attempt-limiter';
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
    /** Fallos de contraseña por usuario en las rutas con sesión que la piden (review I3). */
    passwordLimiter: AttemptLimiter;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    auth: AuthContext;
  }
}
