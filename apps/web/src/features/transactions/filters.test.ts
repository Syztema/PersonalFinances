import { describe, expect, it } from 'vitest';
import { activeFilterCount, EMPTY_FILTERS, filtersToParams, groupByDate } from './filters';

describe('filters', () => {
  it('builds the API query from the filters and search text', () => {
    const params = filtersToParams(
      {
        ...EMPTY_FILTERS,
        period: 'last-month',
        types: ['EXPENSE', 'CARD_PURCHASE'],
        accountId: 'a1',
        minAmount: 1000,
      },
      'almuerzo',
      '2026-10-06',
    );
    expect(Object.fromEntries(params)).toEqual({
      limit: '30',
      from: '2026-09-01',
      to: '2026-09-30',
      type: 'EXPENSE,CARD_PURCHASE',
      accountId: 'a1',
      minAmount: '1000',
      q: 'almuerzo',
    });
    expect(activeFilterCount({ ...EMPTY_FILTERS, period: 'this-month', tag: 'viaje' })).toBe(2);
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it('groups movements by date keeping order', () => {
    const groups = groupByDate([
      { id: '1', date: '2026-10-06' },
      { id: '2', date: '2026-10-06' },
      { id: '3', date: '2026-10-05' },
    ]);
    expect(groups.map((g) => [g.date, g.items.map((i) => i.id)])).toEqual([
      ['2026-10-06', ['1', '2']],
      ['2026-10-05', ['3']],
    ]);
  });
});
