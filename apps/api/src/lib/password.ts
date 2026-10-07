import { hash, verify } from '@node-rs/argon2';
import type { AttemptLimiter } from './attempt-limiter';
import { tooManyAttempts } from './errors';

// Parámetros recomendados por OWASP para Argon2id.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (plain: string) => hash(plain, OPTIONS);

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}

/**
 * Review I3: las rutas que piden la contraseña con la sesión abierta (cambiar el email, eliminar la
 * cuenta, cambiar la contraseña) comparten un límite de fallos por usuario, como el del login.
 * Bloqueado responde 429 antes de correr argon2; solo una contraseña incorrecta cuenta como fallo y
 * acertar reinicia la cuenta.
 */
export async function verifyPasswordLimited(
  limiter: AttemptLimiter,
  userId: string,
  passwordHash: string,
  plain: string,
): Promise<boolean> {
  if (limiter.isBlocked(userId)) throw tooManyAttempts();
  const ok = await verifyPassword(passwordHash, plain);
  if (ok) limiter.reset(userId);
  else limiter.hit(userId);
  return ok;
}
