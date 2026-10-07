import type { DbClient } from '../../lib/prisma';
import { generateToken, sha256Hex } from '../../lib/tokens';

const DAY_MS = 86_400_000;
const RENEW_AFTER_MS = 3_600_000;

export async function createSession(db: DbClient, userId: string, ttlDays: number) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);
  const session = await db.session.create({
    data: { userId, tokenHash: sha256Hex(token), expiresAt },
  });
  return { token, session };
}

export async function validateSession(db: DbClient, token: string, ttlDays: number) {
  const session = await db.session.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { user: { select: { timezone: true } } },
  });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  let renewed = false;
  if (now - session.lastUsedAt.getTime() > RENEW_AFTER_MS) {
    await db.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date(now), expiresAt: new Date(now + ttlDays * DAY_MS) },
    });
    renewed = true;
  }
  return { session, timezone: session.user.timezone, renewed };
}

export async function revokeSessionByToken(db: DbClient, token: string) {
  await db.session.deleteMany({ where: { tokenHash: sha256Hex(token) } });
}

export async function revokeUserSessions(db: DbClient, userId: string, exceptSessionId?: string) {
  await db.session.deleteMany({
    where: { userId, ...(exceptSessionId && { id: { not: exceptSessionId } }) },
  });
}
