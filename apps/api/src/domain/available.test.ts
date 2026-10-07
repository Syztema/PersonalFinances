import { describe, expect, it } from 'vitest';
import { estimateAvailable } from './available';

describe('estimateAvailable', () => {
  it('matches the spec example (3.000.000 − 1.000.000 − 400.000 = 1.600.000)', () => {
    const r = estimateAvailable({
      liquid: 3_000_000,
      pendingObligations: 1_000_000,
      cardsCommitted: 0,
      loansDue: 0,
      reserve: 400_000,
    });
    expect(r.total).toBe(1_600_000);
  });

  it('lists every term with its sign', () => {
    const r = estimateAvailable({
      liquid: 2_500_000,
      pendingObligations: 100_000,
      cardsCommitted: 900_000,
      loansDue: 450_000,
      reserve: 50_000,
    });
    expect(r.breakdown.map((b) => [b.key, b.amount])).toEqual([
      ['liquid', 2_500_000],
      ['obligations', -100_000],
      ['cards', -900_000],
      ['loans', -450_000],
      ['reserve', -50_000],
    ]);
    expect(r.total).toBe(1_000_000);
  });
});
