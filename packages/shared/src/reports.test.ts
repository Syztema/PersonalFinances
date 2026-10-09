import { describe, expect, it } from 'vitest';
import type { ReportDTO } from './dto';
import { todayIn } from './dates';
import {
  groupCompanionSeries,
  groupTop,
  MAX_REPORT_MONTHS,
  REPORT_PRESET_LABELS,
  resolveReportPeriod,
  roundShare,
  type ReportPeriod,
  type ReportPeriodResult,
} from './reports';
import { periodInputOf, reportExportQuerySchema, reportQuerySchema } from './schemas/reports';

function periodOf(result: ReportPeriodResult): ReportPeriod {
  if (!result.ok) throw new Error(`unexpected error: ${JSON.stringify(result.fields)}`);
  return result.period;
}

describe('resolveReportPeriod (spec Fase 3 §3.1)', () => {
  it('resolves THIS_MONTH at 11 p.m. of the 31st in Bogotá, when UTC is already in November', () => {
    const today = todayIn('America/Bogota', new Date('2026-11-01T04:00:00.000Z'));
    expect(today).toBe('2026-10-31');
    expect(periodOf(resolveReportPeriod({ preset: 'THIS_MONTH' }, today))).toEqual({
      preset: 'THIS_MONTH',
      from: '2026-10-01',
      to: '2026-10-31',
      months: ['2026-10'],
    });
  });

  it('resolves THIS_MONTH on the first day of the month to that single day', () => {
    expect(periodOf(resolveReportPeriod({ preset: 'THIS_MONTH' }, '2026-11-01'))).toEqual({
      preset: 'THIS_MONTH',
      from: '2026-11-01',
      to: '2026-11-01',
      months: ['2026-11'],
    });
  });

  it('resolves LAST_MONTH in January to December of the previous year', () => {
    expect(periodOf(resolveReportPeriod({ preset: 'LAST_MONTH' }, '2027-01-15'))).toEqual({
      preset: 'LAST_MONTH',
      from: '2026-12-01',
      to: '2026-12-31',
      months: ['2026-12'],
    });
    expect(periodOf(resolveReportPeriod({ preset: 'LAST_MONTH' }, '2026-03-31')).to).toBe(
      '2026-02-28',
    );
  });

  it('starts the multi-month presets on day 1 and ends them today', () => {
    expect(periodOf(resolveReportPeriod({ preset: 'LAST_3_MONTHS' }, '2026-10-20'))).toEqual({
      preset: 'LAST_3_MONTHS',
      from: '2026-08-01',
      to: '2026-10-20',
      months: ['2026-08', '2026-09', '2026-10'],
    });
    expect(periodOf(resolveReportPeriod({ preset: 'LAST_6_MONTHS' }, '2026-10-20')).from).toBe(
      '2026-05-01',
    );
    const year = periodOf(resolveReportPeriod({ preset: 'LAST_12_MONTHS' }, '2026-02-10'));
    expect(year.from).toBe('2025-03-01');
    expect(year.to).toBe('2026-02-10');
    expect(year.months).toHaveLength(12);
    expect([year.months[0], year.months[11]]).toEqual(['2025-03', '2026-02']);
  });

  it('lists the partial months of a custom period', () => {
    expect(
      periodOf(resolveReportPeriod({ from: '2026-08-15', to: '2026-10-10' }, '2026-10-20')),
    ).toEqual({
      preset: null,
      from: '2026-08-15',
      to: '2026-10-10',
      months: ['2026-08', '2026-09', '2026-10'],
    });
  });

  it('accepts exactly 24 calendar months', () => {
    const period = periodOf(
      resolveReportPeriod({ from: '2024-11-01', to: '2026-10-20' }, '2026-10-20'),
    );
    expect(period.months).toHaveLength(MAX_REPORT_MONTHS);
  });

  it('rejects from after to, a future end and more than 24 months', () => {
    expect(resolveReportPeriod({ from: '2026-10-10', to: '2026-10-01' }, '2026-10-20')).toEqual({
      ok: false,
      fields: { from: 'La fecha inicial no puede ser posterior a la final' },
    });
    expect(resolveReportPeriod({ from: '2026-10-01', to: '2026-10-21' }, '2026-10-20')).toEqual({
      ok: false,
      fields: { to: 'La fecha final no puede ser futura' },
    });
    expect(resolveReportPeriod({ from: '2024-10-31', to: '2026-10-01' }, '2026-10-20')).toEqual({
      ok: false,
      fields: { from: 'Elige un periodo de máximo 24 meses' },
    });
  });

  it('labels the period buttons in Spanish', () => {
    expect(REPORT_PRESET_LABELS).toEqual({
      THIS_MONTH: 'Este mes',
      LAST_MONTH: 'Mes anterior',
      LAST_3_MONTHS: '3 meses',
      LAST_6_MONTHS: '6 meses',
      LAST_12_MONTHS: '1 año',
    });
  });
});

describe('groupTop (spec Fase 3 §3.3)', () => {
  const row = (name: string, amount: number, share: number) => ({ name, amount, share });

  it('keeps six rows or fewer as they are, sorted, without "Otros"', () => {
    const rows = [row('b', 200, 0.4), row('a', 300, 0.6)];
    expect(groupTop(rows)).toEqual({ top: [row('a', 300, 0.6), row('b', 200, 0.4)], other: null });
  });

  it('adds up everything after the sixth row', () => {
    const shares = [0.2, 0.17, 0.15, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03];
    const rows = shares.map((share, i) => row(`c${i}`, 900 - i * 100, share));
    const { top, other } = groupTop(rows);
    expect(top.map((r) => r.name)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5']);
    expect(other).toEqual({ amount: 600, share: 0.15 });
  });

  it('returns no "Otros" when the rest adds up to 0', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((n) => row(`c${n}`, n * 100, 0.1)).concat(row('z', 0, 0));
    expect(groupTop(rows).other).toBeNull();
    expect(groupTop(rows).top).toHaveLength(6);
  });

  it('rounds shares to 4 decimals', () => {
    expect(roundShare(2 / 3)).toBe(0.6667);
    expect(roundShare(300_000 / 2_150_000)).toBe(0.1395);
  });
});

describe('report query schemas', () => {
  it('accepts a preset alone, or from and to together', () => {
    expect(reportQuerySchema.parse({ preset: 'LAST_MONTH' })).toEqual({ preset: 'LAST_MONTH' });
    expect(reportQuerySchema.parse({ from: '2026-08-15', to: '2026-10-10' })).toEqual({
      from: '2026-08-15',
      to: '2026-10-10',
    });
  });

  it('asks for exactly one way to choose the period under "preset"', () => {
    for (const q of [
      {},
      { from: '2026-08-15' },
      { preset: 'THIS_MONTH', from: '2026-08-15', to: '2026-10-10' },
    ]) {
      const result = reportQuerySchema.safeParse(q);
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('preset');
    }
  });

  it('rejects unknown presets, impossible dates and unknown keys', () => {
    expect(reportQuerySchema.safeParse({ preset: 'LAST_YEAR' }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ from: '2026-02-30', to: '2026-03-01' }).success).toBe(
      false,
    );
    expect(reportQuerySchema.safeParse({ preset: 'THIS_MONTH', page: '1' }).success).toBe(false);
  });

  it('requires csv or xlsx to export', () => {
    expect(reportExportQuerySchema.parse({ preset: 'THIS_MONTH', format: 'xlsx' })).toEqual({
      preset: 'THIS_MONTH',
      format: 'xlsx',
    });
    expect(reportExportQuerySchema.safeParse({ preset: 'THIS_MONTH' }).success).toBe(false);
    expect(reportExportQuerySchema.safeParse({ preset: 'THIS_MONTH', format: 'pdf' }).success).toBe(
      false,
    );
  });

  it('turns a validated query into the period input', () => {
    expect(periodInputOf({ preset: 'LAST_6_MONTHS' })).toEqual({ preset: 'LAST_6_MONTHS' });
    expect(periodInputOf({ from: '2026-08-15', to: '2026-10-10' })).toEqual({
      from: '2026-08-15',
      to: '2026-10-10',
    });
  });
});

describe('groupCompanionSeries (spec con quién §4.2)', () => {
  const ref = (id: string, name: string) => ({
    id,
    name,
    icon: 'users',
    color: '#c2410c',
    isActive: true,
  });
  type Rows = ReportDTO['expenseByCompanion'];

  it('keeps five options, adds the rest in "Otros" and "Sin indicar" last, per month too', () => {
    const rows: Rows = [
      { companion: ref('a', 'Amigos'), amount: 600, share: 0.3 },
      { companion: ref('b', 'Bea'), amount: 400, share: 0.2 },
      { companion: ref('c', 'Carlos'), amount: 300, share: 0.15 },
      { companion: ref('d', 'Dani'), amount: 200, share: 0.1 },
      { companion: ref('e', 'Eva'), amount: 100, share: 0.05 },
      { companion: ref('f', 'Fede'), amount: 60, share: 0.03 },
      { companion: ref('g', 'Gabi'), amount: 40, share: 0.02 },
      { companion: null, amount: 300, share: 0.15 },
    ];
    const months: ReportDTO['companionMonths'] = [
      {
        month: '2026-09',
        items: [
          { companionId: 'a', amount: 600 },
          { companionId: 'f', amount: 60 },
          { companionId: null, amount: 100 },
        ],
      },
      {
        month: '2026-10',
        items: [
          { companionId: 'b', amount: 400 },
          { companionId: 'c', amount: 300 },
          { companionId: 'd', amount: 200 },
          { companionId: 'e', amount: 100 },
          { companionId: 'g', amount: 40 },
          { companionId: null, amount: 200 },
        ],
      },
    ];
    const result = groupCompanionSeries(rows, months);
    expect(result.series.map((s) => [s.key, s.amount, s.share])).toEqual([
      ['a', 600, 0.3],
      ['b', 400, 0.2],
      ['c', 300, 0.15],
      ['d', 200, 0.1],
      ['e', 100, 0.05],
      ['other', 100, 0.05],
      ['none', 300, 0.15],
    ]);
    expect(result.series.find((s) => s.key === 'other')?.companion).toBeNull();
    expect(result.months).toEqual([
      { month: '2026-09', values: { a: 600, b: 0, c: 0, d: 0, e: 0, other: 60, none: 100 } },
      { month: '2026-10', values: { a: 0, b: 400, c: 300, d: 200, e: 100, other: 40, none: 200 } },
    ]);
  });

  it('sorts by amount and then by name, without "Otros" when nothing is left over', () => {
    const rows: Rows = [
      { companion: null, amount: 900, share: 0.6 },
      { companion: ref('z', 'Zoe'), amount: 300, share: 0.2 },
      { companion: ref('m', 'Mamá'), amount: 300, share: 0.2 },
    ];
    const result = groupCompanionSeries(rows, [{ month: '2026-10', items: [] }]);
    expect(result.series.map((s) => s.key)).toEqual(['m', 'z', 'none']);
    expect(result.months).toEqual([{ month: '2026-10', values: { m: 0, z: 0, none: 0 } }]);
  });

  it('returns no series for a period without spending', () => {
    expect(groupCompanionSeries([], [{ month: '2026-10', items: [] }])).toEqual({
      series: [],
      months: [{ month: '2026-10', values: {} }],
    });
  });
});
