import type { TransactionResultDTO } from '@finanzas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { invalidateFinance } from '../../lib/queries';
import { WARNING_MESSAGES } from './warnings';

export interface SaveRequest {
  path: string;
  method: 'POST' | 'PUT';
  body: unknown;
}

export interface SaveCallbacks {
  onSuccess?: () => void;
  onError?: (error: ApiError) => void;
}

/**
 * `submit` ignora llamadas mientras hay un guardado en curso: un doble toque nunca crea dos movimientos,
 * aunque React todavía no haya re-renderizado el botón como deshabilitado.
 */
export function useSaveTransaction(successMessage = 'Guardado') {
  const queryClient = useQueryClient();
  const toast = useToast();
  const inFlight = useRef(false);
  const { mutate, isPending } = useMutation<TransactionResultDTO, ApiError, SaveRequest>({
    mutationFn: ({ path, method, body }) =>
      method === 'POST'
        ? api.post<TransactionResultDTO>(path, body)
        : api.put<TransactionResultDTO>(path, body),
    onSuccess: async (result) => {
      await invalidateFinance(queryClient);
      toast.show({ message: successMessage });
      for (const code of result.warnings ?? [])
        toast.show({ message: WARNING_MESSAGES[code], tone: 'warning' });
    },
  });

  const submit = useCallback(
    (request: SaveRequest, callbacks: SaveCallbacks = {}) => {
      if (inFlight.current) return;
      inFlight.current = true;
      mutate(request, {
        onSuccess: () => callbacks.onSuccess?.(),
        onError: (error) => callbacks.onError?.(error),
        onSettled: () => {
          inFlight.current = false;
        },
      });
    },
    [mutate],
  );

  return { submit, isPending };
}
