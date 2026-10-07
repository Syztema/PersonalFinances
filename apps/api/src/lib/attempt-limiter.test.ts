import { describe, expect, it } from 'vitest';
import { AttemptLimiter } from './attempt-limiter';

describe('AttemptLimiter', () => {
  it('blocks after max hits inside the window and forgets old hits', () => {
    let now = 0;
    const limiter = new AttemptLimiter(3, 1000, () => now);
    limiter.hit('k');
    limiter.hit('k');
    expect(limiter.isBlocked('k')).toBe(false);
    limiter.hit('k');
    expect(limiter.isBlocked('k')).toBe(true);
    expect(limiter.isBlocked('other')).toBe(false);
    now = 1001;
    expect(limiter.isBlocked('k')).toBe(false);
  });

  it('reset clears the key', () => {
    const limiter = new AttemptLimiter(1, 1000, () => 0);
    limiter.hit('k');
    limiter.reset('k');
    expect(limiter.isBlocked('k')).toBe(false);
  });
});
