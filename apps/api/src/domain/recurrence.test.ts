import { describe, expect, it } from 'vitest';
import { isOccurrence, nextOccurrence, occurrences, type RecurrenceTerms } from './recurrence';

const rule = (r: Partial<RecurrenceTerms>): RecurrenceTerms => ({
  frequency: 'MONTHLY',
  intervalDays: null,
  day1: null,
  day2: null,
  startDate: '2026-01-01',
  endDate: null,
  ...r,
});

describe('occurrences', () => {
  it('MONTHLY on the 31st uses the last day of shorter months without drifting', () => {
    expect(occurrences(rule({ startDate: '2026-01-31' }), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('SEMIMONTHLY on the 15th and the last day', () => {
    const r = rule({ frequency: 'SEMIMONTHLY', day1: 15, day2: 31, startDate: '2026-02-01' });
    expect(occurrences(r, '2026-02-01', '2026-03-31')).toEqual([
      '2026-02-15',
      '2026-02-28',
      '2026-03-15',
      '2026-03-31',
    ]);
  });

  it('SEMIMONTHLY never returns dates before the start date', () => {
    const r = rule({ frequency: 'SEMIMONTHLY', day1: 15, day2: 31, startDate: '2026-10-20' });
    expect(occurrences(r, '2026-10-01', '2026-11-30')).toEqual([
      '2026-10-31',
      '2026-11-15',
      '2026-11-30',
    ]);
  });

  it('SEMIMONTHLY with both days collapsing in February returns the day once', () => {
    const r = rule({ frequency: 'SEMIMONTHLY', day1: 30, day2: 31 });
    expect(occurrences(r, '2026-02-01', '2026-02-28')).toEqual(['2026-02-28']);
  });

  it('WEEKLY keeps the weekday of the start date', () => {
    expect(
      occurrences(
        rule({ frequency: 'WEEKLY', startDate: '2026-10-01' }),
        '2026-10-10',
        '2026-10-31',
      ),
    ).toEqual(['2026-10-15', '2026-10-22', '2026-10-29']);
  });

  it('CUSTOM_DAYS repeats every N days', () => {
    const r = rule({ frequency: 'CUSTOM_DAYS', intervalDays: 10, startDate: '2026-10-01' });
    expect(occurrences(r, '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-01',
      '2026-10-11',
      '2026-10-21',
      '2026-10-31',
    ]);
  });

  it('YEARLY on February 29 falls on the 28th in common years', () => {
    expect(
      occurrences(
        rule({ frequency: 'YEARLY', startDate: '2024-02-29' }),
        '2025-01-01',
        '2028-12-31',
      ),
    ).toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('stops at the end date and starts at the start date', () => {
    const r = rule({ startDate: '2026-01-10', endDate: '2026-03-10' });
    expect(occurrences(r, '2025-06-01', '2026-12-31')).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
    ]);
    expect(occurrences(r, '2026-04-01', '2026-12-31')).toEqual([]);
  });
});

describe('nextOccurrence and isOccurrence', () => {
  it('finds the next date on or after a day', () => {
    expect(nextOccurrence(rule({ startDate: '2026-01-10' }), '2026-10-11')).toBe('2026-11-10');
    expect(
      nextOccurrence(rule({ frequency: 'YEARLY', startDate: '2026-03-01' }), '2026-03-02'),
    ).toBe('2027-03-01');
    expect(
      nextOccurrence(rule({ startDate: '2026-01-10', endDate: '2026-02-10' }), '2026-03-01'),
    ).toBeNull();
  });

  it('tells whether a date belongs to the rule', () => {
    const r = rule({ frequency: 'SEMIMONTHLY', day1: 15, day2: 31 });
    expect(isOccurrence(r, '2026-11-30')).toBe(true);
    expect(isOccurrence(r, '2026-11-15')).toBe(true);
    expect(isOccurrence(r, '2026-11-14')).toBe(false);
  });
});
