import type { AccountDTO, CategoryDTO, CreditCardDTO, DebtDTO } from '@finanzas/shared';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from './api';

export const qk = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  accounts: ['accounts'] as const,
  cards: ['cards'] as const,
  card: (id: string) => ['cards', id] as const,
  debts: ['debts'] as const,
  categories: ['categories'] as const,
  tags: ['tags'] as const,
  transactions: ['transactions'] as const,
};

/** Después de cualquier movimiento: saldos, deudas, dashboard e historial cambian. */
export function invalidateFinance(queryClient: QueryClient) {
  return Promise.all(
    [qk.dashboard, qk.accounts, qk.cards, qk.debts, qk.transactions, qk.tags].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

const items = <T>(path: string) => api.get<{ items: T[] }>(path).then((r) => r.items);

export const useAccounts = () =>
  useQuery({ queryKey: qk.accounts, queryFn: () => items<AccountDTO>('/accounts') });
export const useCards = () =>
  useQuery({ queryKey: qk.cards, queryFn: () => items<CreditCardDTO>('/credit-cards') });
export const useDebts = () =>
  useQuery({ queryKey: qk.debts, queryFn: () => items<DebtDTO>('/debts') });
export const useCategories = () =>
  useQuery({
    queryKey: qk.categories,
    queryFn: () => items<CategoryDTO>('/categories'),
    staleTime: 5 * 60_000,
  });
