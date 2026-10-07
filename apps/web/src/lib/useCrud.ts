import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/ui/Toast';
import type { ApiError } from './api';
import { invalidateFinance, qk } from './queries';

/** Mutación de gestión: refresca dashboard, listas y categorías, y avisa. */
export function useCrudMutation<TInput, TResult = unknown>(
  fn: (input: TInput) => Promise<TResult>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<TResult, ApiError, TInput>({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([
        invalidateFinance(queryClient),
        queryClient.invalidateQueries({ queryKey: qk.categories }),
      ]);
      toast.show({ message: successMessage });
    },
  });
}
