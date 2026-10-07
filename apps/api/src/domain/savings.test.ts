import { describe, expect, it } from 'vitest';
import { pctOf, savingsReserve } from './savings';

describe('savingsReserve', () => {
  it('reserves the pending share of the income already received', () => {
    expect(pctOf(4_000_000, 20)).toBe(800_000);
    expect(
      savingsReserve({
        savingsPct: 20,
        investmentPct: 10,
        incomeReceived: 4_000_000,
        savingsFlow: 500_000,
        investmentFlow: 0,
      }),
    ).toBe(300_000 + 400_000);
  });

  it('never goes negative when the user saved more than the target', () => {
    expect(
      savingsReserve({
        savingsPct: 20,
        investmentPct: 0,
        incomeReceived: 1_000_000,
        savingsFlow: 900_000,
        investmentFlow: 0,
      }),
    ).toBe(0);
  });

  it('reserves nothing before any income arrives', () => {
    expect(
      savingsReserve({
        savingsPct: 20,
        investmentPct: 10,
        incomeReceived: 0,
        savingsFlow: 0,
        investmentFlow: 0,
      }),
    ).toBe(0);
  });
});
