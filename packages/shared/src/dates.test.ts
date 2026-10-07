import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  diffDays,
  endOfMonth,
  isValidIsoDate,
  makeDate,
  monthKey,
  monthsBetween,
  startOfMonth,
  todayIn,
} from './dates';

describe('todayIn', () => {
  it('uses the Bogotá calendar day, not UTC', () => {
    // 2026-11-01 04:30 UTC = 2026-10-31 23:30 en Bogotá
    expect(todayIn('America/Bogota', new Date('2026-11-01T04:30:00Z'))).toBe('2026-10-31');
    expect(todayIn('America/Bogota', new Date('2026-11-01T05:00:00Z'))).toBe('2026-11-01');
  });
});

describe('date arithmetic', () => {
  it('clamps day overflow to the last day of the month', () => {
    expect(makeDate(2026, 2, 31)).toBe('2026-02-28');
    expect(makeDate(2028, 2, 31)).toBe('2028-02-29');
    expect(makeDate(2026, 13, 15)).toBe('2027-01-15');
    expect(makeDate(2026, 0, 15)).toBe('2025-12-15');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('computes month boundaries', () => {
    expect(startOfMonth('2026-10-06')).toBe('2026-10-01');
    expect(endOfMonth('2026-04-10')).toBe('2026-04-30');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(monthKey('2026-10-06')).toBe('2026-10');
  });
  it('adds and diffs days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-10-06', '2026-10-31')).toBe(25);
    expect(monthsBetween('2026-10-15', '2027-02-15')).toBe(4);
  });
  it('validates ISO dates', () => {
    expect(isValidIsoDate('2026-10-06')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('06/10/2026')).toBe(false);
  });
});
