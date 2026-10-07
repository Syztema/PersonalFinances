import { describe, expect, it } from 'vitest';
import { budgetProjection, usageOf } from './budget';

describe('budgetProjection (spec 8.9)', () => {
  it('projects the month and tells the day the budget would be exceeded', () => {
    // 600.000 en 10 días = 60.000/día; 31 días → 1.860.000; el día 17 se llega a 1.020.000.
    expect(budgetProjection({ budget: 1_000_000, spent: 600_000, today: '2026-10-10' })).toEqual({
      projectedSpend: 1_860_000,
      exceedsOnDay: 17,
    });
  });

  it('gives no day when the projection fits or the budget is already exceeded', () => {
    expect(
      budgetProjection({ budget: 2_000_000, spent: 600_000, today: '2026-10-10' }).exceedsOnDay,
    ).toBeNull();
    expect(
      budgetProjection({ budget: 500_000, spent: 600_000, today: '2026-10-10' }).exceedsOnDay,
    ).toBeNull();
    expect(budgetProjection({ budget: 500_000, spent: 0, today: '2026-10-10' })).toEqual({
      projectedSpend: 0,
      exceedsOnDay: null,
    });
  });

  it('computes usage as a fraction', () => {
    expect(usageOf(750_000, 1_000_000)).toBe(0.75);
    expect(usageOf(10, 0)).toBe(0);
  });
});
