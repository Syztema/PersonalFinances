import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { invalidateFinance, qk } from './queries';

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
    ]) {
      expect(keys).toContainEqual(key);
    }
  });
});
