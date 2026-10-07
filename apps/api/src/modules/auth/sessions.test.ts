import { describe, expect, it } from 'vitest';
import type { DbClient } from '../../lib/prisma';
import { validateSession } from './sessions';

describe('validateSession', () => {
  it('returns null when the session disappears while it is being renewed (logout race)', async () => {
    const old = new Date(Date.now() - 2 * 3_600_000);
    const db = {
      session: {
        findUnique: async () => ({
          id: 's1',
          userId: 'u1',
          lastUsedAt: old,
          expiresAt: new Date(Date.now() + 86_400_000),
          user: { timezone: 'America/Bogota' },
        }),
        updateMany: async () => ({ count: 0 }),
        deleteMany: async () => ({ count: 0 }),
      },
    } as unknown as DbClient;
    expect(await validateSession(db, 'token', 30)).toBeNull();
  });
});
