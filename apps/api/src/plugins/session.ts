import cookie from '@fastify/cookie';
import { todayIn } from '@finanzas/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppConfig } from '../config/env';
import { AppError } from '../lib/errors';
import { validateSession } from '../modules/auth/sessions';
import type { AuthContext } from '../types/fastify';

export const SESSION_COOKIE = 'fz_session';

export function setSessionCookie(reply: FastifyReply, token: string, config: AppConfig) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionTtlDays * 86_400,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function setupSession(app: FastifyInstance) {
  await app.register(cookie);
  app.decorateRequest('auth', null as unknown as AuthContext);
  app.decorate('authenticate', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');
    const result = await validateSession(app.prisma, token, app.config.sessionTtlDays);
    if (!result) {
      clearSessionCookie(reply);
      throw new AppError(401, 'SESSION_EXPIRED', 'Tu sesión expiró. Inicia sesión de nuevo.');
    }
    if (result.renewed) setSessionCookie(reply, token, app.config);
    req.auth = {
      userId: result.session.userId,
      sessionId: result.session.id,
      timezone: result.timezone,
      today: todayIn(result.timezone, app.now()),
    };
  });
}
