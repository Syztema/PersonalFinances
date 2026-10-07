import { describe, expect, it, vi } from 'vitest';
import { AttemptLimiter } from './attempt-limiter';
import { verifyPasswordLimited } from './password';

const argon2 = vi.hoisted(() => ({
  verify: vi.fn(async (_hash: string, plain: string) => plain === 'buena'),
}));
vi.mock('@node-rs/argon2', () => ({ hash: vi.fn(), verify: argon2.verify }));

describe('verifyPasswordLimited (review I3)', () => {
  it('counts wrong passwords per user, resets on success and answers 429 without running argon2', async () => {
    const limiter = new AttemptLimiter(2, 1000, () => 0);
    expect(await verifyPasswordLimited(limiter, 'u1', 'hash', 'mala')).toBe(false);
    expect(await verifyPasswordLimited(limiter, 'u1', 'hash', 'buena')).toBe(true);
    expect(await verifyPasswordLimited(limiter, 'u1', 'hash', 'mala')).toBe(false);
    expect(await verifyPasswordLimited(limiter, 'u1', 'hash', 'mala')).toBe(false);

    argon2.verify.mockClear();
    await expect(verifyPasswordLimited(limiter, 'u1', 'hash', 'buena')).rejects.toMatchObject({
      statusCode: 429,
      code: 'TOO_MANY_ATTEMPTS',
    });
    expect(argon2.verify).not.toHaveBeenCalled();
    expect(await verifyPasswordLimited(limiter, 'u2', 'hash', 'buena')).toBe(true);
  });
});
