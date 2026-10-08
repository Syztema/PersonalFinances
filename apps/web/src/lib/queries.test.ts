import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { invalidateFinance, qk, reportParams } from './queries';

describe('invalidateFinance', () => {
  it('invalidates every finance-derived key, including categories', async () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    await invalidateFinance(queryClient);
    const keys = spy.mock.calls.map(([filters]) => filters?.queryKey);
    for (const key of [
      qk.dashboard,
      qk.goals,
      qk.recurring,
      qk.scheduled,
      qk.budgets,
      qk.settings,
      qk.alerts,
      qk.categories,
      qk.reports,
    ]) {
      expect(keys).toContainEqual(key);
    }
  });
});

describe('reportParams', () => {
  it('sends either the preset or both dates', () => {
    expect(reportParams({ preset: 'LAST_3_MONTHS' })).toBe('preset=LAST_3_MONTHS');
    expect(reportParams({ from: '2026-08-15', to: '2026-09-10' })).toBe(
      'from=2026-08-15&to=2026-09-10',
    );
  });

  it('keys every report under the reports prefix', () => {
    expect(qk.report({ preset: 'THIS_MONTH' })).toEqual(['reports', { preset: 'THIS_MONTH' }]);
  });
});
