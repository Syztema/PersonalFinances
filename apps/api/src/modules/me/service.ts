import type { DeleteMeInput, UpdateMeInput, UserDTO } from '@finanzas/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { AttemptLimiter } from '../../lib/attempt-limiter';
import { badRequest, conflict, isUniqueViolation } from '../../lib/errors';
import { verifyPasswordLimited } from '../../lib/password';
import type { AuthContext } from '../../types/fastify';
import { getUser, toUserDTO } from '../auth/service';
import { revokeUserSessions } from '../auth/sessions';

export async function updateMe(
  db: PrismaClient,
  auth: AuthContext,
  input: UpdateMeInput,
  limiter: AttemptLimiter,
): Promise<UserDTO> {
  const user = await getUser(db, auth.userId);
  const data: Prisma.UserUpdateInput = { name: input.name, theme: input.theme };
  if (input.email !== undefined && input.email !== user.email) {
    if (!input.currentPassword) {
      throw badRequest('PASSWORD_REQUIRED', 'Confirma tu contraseña para cambiar el email.', {
        currentPassword: 'Requerida para cambiar el email',
      });
    }
    if (
      !(await verifyPasswordLimited(limiter, user.id, user.passwordHash, input.currentPassword))
    ) {
      throw badRequest('INVALID_PASSWORD', 'La contraseña actual no es correcta.', {
        currentPassword: 'La contraseña actual no es correcta',
      });
    }
    data.email = input.email;
  }
  try {
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.user.update({ where: { id: user.id }, data });
      if (data.email !== undefined) {
        // Review M7: como al cambiar la contraseña, se cierran las otras sesiones y se anulan los
        // enlaces de restablecimiento pendientes (pudieron llegar al correo anterior).
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
        await revokeUserSessions(tx, user.id, auth.sessionId);
      }
      return row;
    });
    return toUserDTO(updated);
  } catch (err) {
    if (isUniqueViolation(err))
      throw conflict('EMAIL_TAKEN', 'Ya existe una cuenta con ese email.');
    throw err;
  }
}

/** Addendum §3.5: irreversible; la base de datos borra todo lo del usuario en cascada. */
export async function deleteMe(
  db: PrismaClient,
  auth: AuthContext,
  input: DeleteMeInput,
  limiter: AttemptLimiter,
): Promise<void> {
  const user = await getUser(db, auth.userId);
  if (!(await verifyPasswordLimited(limiter, user.id, user.passwordHash, input.password))) {
    throw badRequest('INVALID_PASSWORD', 'La contraseña no es correcta.', {
      password: 'La contraseña no es correcta',
    });
  }
  await db.user.delete({ where: { id: user.id } });
}
