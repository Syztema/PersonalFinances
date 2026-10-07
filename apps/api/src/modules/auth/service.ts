import type { ChangePasswordInput, RegisterInput, UserDTO } from '@finanzas/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { PrismaClient, User } from '../../generated/prisma/client';
import type { AttemptLimiter } from '../../lib/attempt-limiter';
import { AppError, badRequest, conflict } from '../../lib/errors';
import type { Mailer } from '../../lib/mailer';
import { hashPassword, verifyPassword, verifyPasswordLimited } from '../../lib/password';
import { generateToken, sha256Hex } from '../../lib/tokens';
import type { AuthContext } from '../../types/fastify';
import { DEFAULT_CATEGORIES } from '../categories/defaults';
import { revokeUserSessions } from './sessions';

export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    theme: user.theme,
    timezone: user.timezone,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function registerUser(
  db: PrismaClient,
  input: RegisterInput,
  opts: { allowRegistration: boolean },
): Promise<User> {
  if (!opts.allowRegistration) {
    throw new AppError(403, 'REGISTRATION_CLOSED', 'El registro de nuevas cuentas está cerrado.');
  }
  const existing = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) throw conflict('EMAIL_TAKEN', 'Ya existe una cuenta con ese email.');
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: input.name, email: input.email, passwordHash },
    });
    await tx.financialConfiguration.create({ data: { userId: user.id } });
    await tx.category.createMany({
      data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, userId: user.id, sortOrder: i })),
    });
    return user;
  });
}

let dummyHash: Promise<string> | undefined;

/** Devuelve el usuario si la clave es correcta; con email inexistente igual verifica un hash (tiempo constante). */
export async function authenticateUser(db: PrismaClient, email: string, password: string) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    dummyHash ??= hashPassword(generateToken());
    await verifyPassword(await dummyHash, password);
    return null;
  }
  return (await verifyPassword(user.passwordHash, password)) ? user : null;
}

export async function getUser(db: PrismaClient, userId: string): Promise<User> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user)
    throw new AppError(401, 'SESSION_EXPIRED', 'Tu sesión expiró. Inicia sesión de nuevo.');
  return user;
}

const RESET_TTL_MS = 30 * 60_000;

export const FORGOT_PASSWORD_MESSAGE =
  'Si el email existe, te enviamos un enlace para restablecer tu contraseña.';

export async function changePassword(
  db: PrismaClient,
  auth: AuthContext,
  input: ChangePasswordInput,
  limiter: AttemptLimiter,
) {
  const user = await getUser(db, auth.userId);
  if (!(await verifyPasswordLimited(limiter, user.id, user.passwordHash, input.currentPassword))) {
    throw badRequest('INVALID_PASSWORD', 'La contraseña actual no es correcta.', {
      currentPassword: 'La contraseña actual no es correcta',
    });
  }
  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await revokeUserSessions(tx, user.id, auth.sessionId);
  });
}

export async function requestPasswordReset(
  db: PrismaClient,
  mailer: Mailer,
  appUrl: string,
  email: string,
  log: FastifyBaseLogger,
) {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });
  if (!user) return;
  const token = generateToken();
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  const link = `${appUrl}/reset-password#token=${token}`;
  // Sin await: el tiempo de respuesta no revela si el email existe.
  Promise.resolve()
    .then(() =>
      mailer.send({
        to: user.email,
        subject: 'Restablece tu contraseña de Finanzas',
        text: `Hola ${user.name}:

Para crear una nueva contraseña abre este enlace (vale 30 minutos):
${link}

Si no lo pediste, ignora este correo.`,
      }),
    )
    .catch((err: { code?: unknown; responseCode?: unknown }) =>
      // Nunca el mensaje: en nodemailer puede incluir el correo del destinatario.
      log.error(
        { err: { code: err.code, responseCode: err.responseCode } },
        'No se pudo enviar el correo',
      ),
    );
}

export async function resetPassword(db: PrismaClient, token: string, newPassword: string) {
  const tokenHash = sha256Hex(token);
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    // Consumir el token es el primer paso y atómico: de dos peticiones simultáneas solo una lo logra.
    const now = new Date();
    const { count } = await tx.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count !== 1) {
      throw badRequest('INVALID_TOKEN', 'El enlace no es válido o ya expiró. Solicita uno nuevo.');
    }
    const record = await tx.passwordResetToken.findUniqueOrThrow({ where: { tokenHash } });
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } });
    await tx.session.deleteMany({ where: { userId: record.userId } });
  });
}
