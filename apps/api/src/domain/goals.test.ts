import { describe, expect, it } from 'vitest';
import { goalProgress } from './goals';

describe('goalProgress (spec 8.10)', () => {
  it('computes progress and the monthly and weekly saving needed', () => {
    expect(
      goalProgress({
        targetAmount: 5_000_000,
        initialAmount: 1_000_000,
        contributed: 500_000,
        withdrawn: 100_000,
        targetDate: '2027-06-30',
        today: '2026-10-07',
      }),
    ).toEqual({
      progress: 1_400_000,
      pct: 0.28,
      remaining: 3_600_000,
      monthlyNeeded: 450_000, // 8 meses
      weeklyNeeded: 94_737, // 266 días = 38 semanas
    });
  });

  it('caps at 100 % and asks for nothing when reached', () => {
    const g = goalProgress({
      targetAmount: 1_000_000,
      initialAmount: 0,
      contributed: 1_200_000,
      withdrawn: 0,
      targetDate: '2027-01-31',
      today: '2026-10-07',
    });
    expect(g).toMatchObject({ pct: 1, remaining: 0, monthlyNeeded: 0, weeklyNeeded: 0 });
  });

  it('without a date gives no monthly target; past the date asks for everything now', () => {
    const base = {
      targetAmount: 1_000_000,
      initialAmount: 0,
      contributed: 0,
      withdrawn: 0,
      today: '2026-10-07',
    };
    expect(goalProgress({ ...base, targetDate: null })).toMatchObject({
      monthlyNeeded: null,
      weeklyNeeded: null,
    });
    expect(goalProgress({ ...base, targetDate: '2026-09-30' })).toMatchObject({
      monthlyNeeded: 1_000_000,
      weeklyNeeded: 1_000_000,
    });
  });
});
