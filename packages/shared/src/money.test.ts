import { describe, expect, it } from 'vitest';
import { formatCOP, formatCOPCompact, parseCOP } from './money';

describe('formatCOP', () => {
  it('uses dot thousands separator and no space after $', () => {
    expect(formatCOP(1500000)).toBe('$1.500.000');
    expect(formatCOP(1500)).toBe('$1.500');
    expect(formatCOP(999)).toBe('$999');
    expect(formatCOP(0)).toBe('$0');
  });
  it('puts the minus sign before $', () => {
    expect(formatCOP(-25000)).toBe('-$25.000');
  });
});

describe('formatCOPCompact', () => {
  it('abbreviates millions and thousands', () => {
    expect(formatCOPCompact(1200000)).toBe('$1,2 M');
    expect(formatCOPCompact(5000000)).toBe('$5 M');
    expect(formatCOPCompact(999999)).toBe('$1 M');
    expect(formatCOPCompact(850000)).toBe('$850 mil');
    expect(formatCOPCompact(500)).toBe('$500');
    expect(formatCOPCompact(-1500000)).toBe('-$1,5 M');
  });
});

describe('parseCOP', () => {
  it('keeps only the integer digits', () => {
    expect(parseCOP('$1.500.000')).toBe(1500000);
    expect(parseCOP('25000')).toBe(25000);
    expect(parseCOP('1 500 000')).toBe(1500000);
  });
  it('drops a Colombian decimal part after the comma', () => {
    expect(parseCOP('$1.500.000,50')).toBe(1500000);
    expect(parseCOP('25.000,00')).toBe(25000);
  });
  it('returns null when there are no digits', () => {
    expect(parseCOP('')).toBeNull();
    expect(parseCOP('abc')).toBeNull();
    expect(parseCOP(',50')).toBeNull();
  });
});
