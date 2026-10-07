import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useToast } from '../../components/ui/Toast';
import type { ApiError } from '../../lib/api';
import { invalidateFinance } from '../../lib/queries';

/** Códigos 409 tras los cuales la ocurrencia ya no admite la acción: el panel abierto no sirve. */
const CLOSES_SHEET = new Set(['NOT_PENDING', 'SCHEDULED_DONE', 'SCHEDULED_SKIPPED']);

/**
 * Un 409 significa que la fila quedó desactualizada (otra pestaña la pagó, omitió o editó): se
 * refresca la lista, se avisa y, si la acción ya no es posible, se cierra el panel.
 * Devuelve true si el error era un 409 y quedó atendido.
 */
export function useConflict() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useCallback(
    (err: ApiError, close?: () => void): boolean => {
      if (err.status !== 409) return false;
      void invalidateFinance(queryClient);
      toast.show({ message: err.message, tone: 'error' });
      if (close && CLOSES_SHEET.has(err.code)) close();
      return true;
    },
    [queryClient, toast],
  );
}
