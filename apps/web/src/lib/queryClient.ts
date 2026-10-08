import { QueryClient, type DefaultOptions } from '@tanstack/react-query';
import { ApiError } from './api';

/** Opciones de TanStack Query de la app; `renderWithProviders` usa las mismas para las mutaciones. */
export const QUERY_DEFAULTS = {
  queries: {
    staleTime: 30_000,
    // Errores del cliente (4xx) no se reintentan; red o servidor, hasta 2 veces.
    retry: (count: number, error: Error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
  },
  // Spec Fase 3 §6: un guardado sin red falla en ese momento; nunca queda en cola para después.
  mutations: { networkMode: 'always' },
} satisfies DefaultOptions;

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: QUERY_DEFAULTS });
}
