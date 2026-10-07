import { describe, expect, it } from 'vitest';
import { recurrencePayload, semimonthlyDays } from './recurrence';

describe('semimonthlyDays (review focus #3)', () => {
  it('always includes the date of the movement', () => {
    expect(semimonthlyDays('2026-10-15')).toEqual({ day1: 15, day2: 31 });
    expect(semimonthlyDays('2026-10-05')).toEqual({ day1: 5, day2: 20 });
    expect(semimonthlyDays('2026-10-30')).toEqual({ day1: 15, day2: 30 });
    expect(semimonthlyDays('2026-10-31')).toEqual({ day1: 16, day2: 31 });
    expect(semimonthlyDays('2026-02-28')).toEqual({ day1: 13, day2: 31 });
    expect(semimonthlyDays('2026-11-30')).toEqual({ day1: 15, day2: 31 });
  });
});

describe('recurrencePayload', () => {
  it('sends only what each frequency needs', () => {
    expect(recurrencePayload('MONTHLY', '2026-10-10', '30')).toEqual({ frequency: 'MONTHLY' });
    expect(recurrencePayload('CUSTOM_DAYS', '2026-10-10', '45')).toEqual({
      frequency: 'CUSTOM_DAYS',
      intervalDays: 45,
    });
    expect(recurrencePayload('SEMIMONTHLY', '2026-10-30', '30')).toEqual({
      frequency: 'SEMIMONTHLY',
      day1: 15,
      day2: 30,
    });
  });
});
