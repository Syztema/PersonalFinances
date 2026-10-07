import { useState } from 'react';
import { useToast } from '../components/ui/Toast';
import { api } from './api';
import { useCrudMutation } from './useCrud';

/**
 * Restaurar un elemento eliminado: refresca todo y avisa. Los avisos van en los callbacks de la
 * mutación (no en `mutate`) porque TanStack solo ejecuta los de la última llamada; y los ids en
 * curso van en un Set para que cada fila siga ocupada mientras su petición vuela.
 */
export function useRestore(path: (id: string) => string, successMessage: string) {
  const toast = useToast();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const change = (id: string, busy: boolean) =>
    setPending((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  const mutation = useCrudMutation((id: string) => api.post(path(id)), successMessage, {
    onMutate: (id) => change(id, true),
    onError: (err) => toast.show({ message: err.message, tone: 'error' }),
    onSettled: (_data, _err, id) => change(id, false),
  });
  return {
    restore: (id: string) => mutation.mutate(id),
    isRestoring: (id: string) => pending.has(id),
  };
}
