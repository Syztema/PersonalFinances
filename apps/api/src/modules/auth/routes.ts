import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@finanzas/shared';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../lib/errors';
import { AttemptLimiter } from '../../lib/attempt-limiter';
import { parse } from '../../lib/validation';
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from '../../plugins/session';
import {
  authenticateUser,
  changePassword,
  FORGOT_PASSWORD_MESSAGE,
  getUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
  toUserDTO,
} from './service';
import { createSession, revokeSessionByToken } from './sessions';

export async function authRoutes(app: FastifyInstance) {
  const loginLimiter = new AttemptLimiter(app.config.loginMaxAttempts, 15 * 60_000);

  app.post('/register', async (req, reply) => {
    const input = parse(registerSchema, req.body);
    const user = await registerUser(app.prisma, input, {
      allowRegistration: app.config.allowRegistration,
    });
    const { token } = await createSession(app.prisma, user.id, app.config.sessionTtlDays);
    setSessionCookie(reply, token, app.config);
    return reply.status(201).send({ user: toUserDTO(user) });
  });

  app.post('/login', async (req, reply) => {
    const input = parse(loginSchema, req.body);
    const key = `${req.ip}:${input.email}`;
    if (loginLimiter.isBlocked(key)) {
      throw new AppError(
        429,
        'TOO_MANY_ATTEMPTS',
        'Demasiados intentos. Espera 15 minutos e intenta de nuevo.',
      );
    }
    const user = await authenticateUser(app.prisma, input.email, input.password);
    if (!user) {
      loginLimiter.hit(key);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.');
    }
    loginLimiter.reset(key);
    const { token } = await createSession(app.prisma, user.id, app.config.sessionTtlDays);
    setSessionCookie(reply, token, app.config);
    return { user: toUserDTO(user) };
  });

  app.post('/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await revokeSessionByToken(app.prisma, token);
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get('/me', { preHandler: app.authenticate }, async (req) => ({
    user: toUserDTO(await getUser(app.prisma, req.auth.userId)),
  }));

  const forgotLimiter = new AttemptLimiter(3, 60 * 60_000);

  app.post('/forgot-password', async (req) => {
    const { email } = parse(forgotPasswordSchema, req.body);
    const key = `${req.ip}:${email}`;
    if (!forgotLimiter.isBlocked(key)) {
      forgotLimiter.hit(key);
      await requestPasswordReset(app.prisma, app.mailer, app.config.appUrl, email, req.log);
    }
    return { message: FORGOT_PASSWORD_MESSAGE };
  });

  app.post('/reset-password', async (req, reply) => {
    const input = parse(resetPasswordSchema, req.body);
    await resetPassword(app.prisma, input.token, input.password);
    return reply.status(204).send();
  });

  app.post('/change-password', { preHandler: app.authenticate }, async (req, reply) => {
    const input = parse(changePasswordSchema, req.body);
    await changePassword(app.prisma, req.auth, input);
    return reply.status(204).send();
  });
}
