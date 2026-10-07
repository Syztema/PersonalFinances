import { describe, expect, it } from 'vitest';
import { dayHeading, formatDate, formatPercent, formatShortDate, monthLabel } from './format';

describe('format', () => {
  it('formats dates in Spanish', () => {
    expect(formatShortDate('2026-10-06')).toBe('06 oct');
    expect(formatDate('2026-10-06')).toBe('06/10/2026');
    expect(monthLabel('2026-10')).toBe('octubre');
    expect(formatPercent(0.2)).toBe('20%');
  });

  it('names day groups relative to today', () => {
    expect(dayHeading('2026-10-06', '2026-10-06')).toBe('Hoy');
    expect(dayHeading('2026-10-05', '2026-10-06')).toBe('Ayer');
    expect(dayHeading('2026-10-02', '2026-10-06')).toBe('viernes 2 de octubre');
    expect(dayHeading('2025-12-31', '2026-10-06')).toBe('miércoles 31 de diciembre de 2025');
  });
});
