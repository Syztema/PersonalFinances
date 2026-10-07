import type {
  AccountDTO,
  AlertDTO,
  BudgetDTO,
  CategoryDTO,
  CreditCardDTO,
  DebtDTO,
  FinancialSettingsResponse,
  GoalDTO,
  RecurringRuleDTO,
  ScheduledItemDTO,
  StatusDTO,
} from '@finanzas/shared';
import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
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
  goals: ['goals'] as const,
  recurring: ['recurring'] as const,
  scheduled: ['scheduled'] as const,
  budgets: ['budgets'] as const,
  budget: (month: string) => ['budgets', month] as const,
  settings: ['settings'] as const,
  alerts: ['alerts'] as const,
};

/** Después de cualquier cambio de dinero o de planificación, todo lo calculado puede cambiar. */
export function invalidateFinance(queryClient: QueryClient) {
  return Promise.all(
    [
      qk.dashboard,
      qk.accounts,
      qk.cards,
      qk.debts,
      qk.transactions,
      qk.tags,
      // Un pago de préstamo con intereses puede restaurar la categoría "Intereses y comisiones".
      qk.categories,
      qk.goals,
      qk.recurring,
      qk.scheduled,
      qk.budgets,
      qk.settings,
      qk.alerts,
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
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
export const useGoals = () =>
  useQuery({ queryKey: qk.goals, queryFn: () => items<GoalDTO>('/goals') });
export const useRules = () =>
  useQuery({ queryKey: qk.recurring, queryFn: () => items<RecurringRuleDTO>('/recurring') });
export const useScheduled = (params: string) =>
  useQuery({
    queryKey: [...qk.scheduled, params],
    queryFn: () => items<ScheduledItemDTO>(`/scheduled?${params}`),
  });
export const useBudget = (month: string) =>
  useQuery({
    queryKey: qk.budget(month),
    queryFn: () => api.get<{ budget: BudgetDTO }>(`/budgets/${month}`).then((r) => r.budget),
    placeholderData: keepPreviousData,
  });
export const useFinancialSettings = () =>
  useQuery({
    queryKey: qk.settings,
    queryFn: () => api.get<FinancialSettingsResponse>('/settings/financial'),
  });
export const useAlerts = () =>
  useQuery({
    queryKey: qk.alerts,
    queryFn: () => api.get<{ items: AlertDTO[]; status: StatusDTO }>('/alerts'),
  });
